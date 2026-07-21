const fs = require("fs");
const { generateDateOptionsFromPatterns, weekdayInZone, monthlyPublishMs, minPatternGapMs, getPreviousOccurrenceBeforeMs } = require("./date-utils");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-store");

// In-memory job storage
const scheduledJobs = new Map(); // pendingEventId -> timeoutId
let pendingEvents = [];
let deletedEvents = []; // Soft-deleted events that can be restored
let pendingSettings = { displayLimit: 10 };
let automationState = { profiles: {} };
let initialized = false;

// File paths (set by init)
let PENDING_EVENTS_PATH = null;
let AUTOMATION_STATE_PATH = null;

// Callbacks (set by init)
let createEventFn = null;
let onMissedEvent = null;
let onEventCreated = null;
let debugLogFn = () => {};
let profilesRef = null;
let knownGroupIds = null;

// Rate limiting constants
const EVENT_HOURLY_LIMIT = 10;
const EVENT_HOURLY_WINDOW_MS = 60 * 60 * 1000;
const BACKOFF_SEQUENCE = [2, 4, 8, 16, 32, 60]; // minutes, caps at 60
const VALID_PENDING_STATUSES = new Set(["scheduled", "missed", "queued", "published", "cancelled", "deleted"]);
const ACTIVE_PENDING_STATUSES = new Set(["scheduled", "missed", "queued"]);

// Minimum lead an "after"-mode announcement must keep before the show it
// announces, so it can never land after (or right on top of) the show start.
const MIN_LEAD_MS = 15 * 60 * 1000;

/** Offset (ms) from a profile's automation timing fields. */
function offsetMsOf(automation) {
  return (automation.daysOffset || 0) * 24 * 60 * 60 * 1000 +
    (automation.hoursOffset || 0) * 60 * 60 * 1000 +
    (automation.minutesOffset || 0) * 60 * 1000;
}

/**
 * The single source of truth for when an event is announced.
 * @param {number} eventStartMs
 * @param {object} automation - profile.automation
 * @param {number} durationMs - event length
 * @param {number|null} prevOccurrenceStartMs - start of the previous occurrence
 *   in the series (for "after" mode); null if unknown/none.
 * @param {string} timezone
 * @param {number|null} nominalGapMs - the regular spacing between occurrences,
 *   used to mirror an "after" offset onto the "before" side when it overshoots.
 * @returns {number|null} publish instant (ms), or null when "after" mode has no
 *   previous occurrence to anchor to.
 */
function computePublishTimeMs(eventStartMs, automation, durationMs, prevOccurrenceStartMs, timezone, nominalGapMs) {
  const offset = offsetMsOf(automation);

  if (automation.timingMode === "monthly") {
    return monthlyPublishMs(
      new Date(eventStartMs).toISOString(),
      automation.monthlyDay,
      automation.monthlyHour,
      automation.monthlyMinute,
      timezone
    );
  }

  if (automation.timingMode === "after") {
    if (prevOccurrenceStartMs === null || prevOccurrenceStartMs === undefined) {
      return null;
    }
    // "X after the previous event ends" = previous start + its length + offset.
    const afterInstant = prevOccurrenceStartMs + durationMs + offset;
    const latest = eventStartMs - MIN_LEAD_MS;
    if (afterInstant <= latest) {
      return afterInstant; // fits comfortably before the next event
    }

    // It overshoots this event's gap. Describe the same intent from the other
    // side: "X after on the regular cadence" is "Y before the next event",
    // where Y = regularGap - duration - X. Apply that mirror to this event's own
    // start. (For daily events, "23h after" mirrors to "1h before".) If the
    // mirror is unavailable or too tight, fall back to the safe minimum lead —
    // never later than that.
    if (Number.isFinite(nominalGapMs)) {
      const mirrorBefore = nominalGapMs - durationMs - offset;
      if (mirrorBefore > 0) {
        return Math.min(eventStartMs - mirrorBefore, latest);
      }
    }
    return latest;
  }

  // "before" (and any unknown mode) — X before this event's own start.
  return eventStartMs - offset;
}

/**
 * The previous occurrence to anchor an "after"-mode head event on: the most
 * recent event this profile actually posted (a real pattern occurrence, not a
 * wall-clock stamp), falling back to the activation event. Returns ms or null.
 */
function getHeadPreviousOccurrenceMs(groupId, profileKey, profileState) {
  let bestMs = null;
  for (const e of pendingEvents) {
    if (e.groupId !== groupId || e.profileKey !== profileKey || e.status !== "published") continue;
    const ms = parseEventStartMs(e.eventStartsAt);
    if (ms !== null && (bestMs === null || ms > bestMs)) bestMs = ms;
  }
  if (bestMs !== null) return bestMs;
  return getActivationStartMs(profileState);
}

/**
 * The previous occurrence to anchor a SINGLE "after"-mode event on (edit /
 * restore / commit / backfill): the event's own predecessor in the series, not
 * the series head. Falls back to the head anchor when the event has no earlier
 * occurrence (it is the first).
 */
function previousOccurrenceForEvent(profile, groupId, profileKey, eventStartMs) {
  const timezone = profile.timezone || "UTC";
  let anchors = {};
  let profileState = null;
  if (groupId && profileKey) {
    profileState = getOrCreateProfileState(getProfileStateKey(groupId, profileKey));
    anchors = getEveryOtherAnchors(profileState);
  }
  const prev = getPreviousOccurrenceBeforeMs(profile.patterns || [], eventStartMs, timezone, {
    enforceEveryOther: true,
    everyOtherAnchors: anchors
  });
  if (prev !== null) return prev;
  return profileState ? getHeadPreviousOccurrenceMs(groupId, profileKey, profileState) : null;
}

/** The regular spacing (ms) between a profile's occurrences, for the "after" mirror. */
function nominalGapForProfile(profile, groupId, profileKey) {
  let anchors = {};
  if (groupId && profileKey) {
    anchors = getEveryOtherAnchors(getOrCreateProfileState(getProfileStateKey(groupId, profileKey)));
  }
  return minPatternGapMs(profile.patterns || [], 13, profile.timezone || "UTC", {
    enforceEveryOther: true,
    everyOtherAnchors: anchors
  });
}

// Rate limit tracking per group
const rateLimitState = {
  // groupId -> { history: [timestamps], backoffIndex: 0, lockUntil: null }
  groups: {},
  // Queue of pending posts: { pendingEventId, groupId, priority }
  queue: [],
  // Currently processing flag
  processing: false,
  // Processing timeout
  processTimeout: null
};

function getProfileStateKey(groupId, profileKey) {
  return `${groupId}::${profileKey}`;
}

function isKnownGroupId(groupId) {
  if (!knownGroupIds) {
    return true;
  }
  return knownGroupIds.has(groupId);
}

function getOrCreateProfileState(profileStateKey) {
  if (!automationState.profiles || typeof automationState.profiles !== "object") {
    automationState.profiles = {};
  }
  const existing = automationState.profiles[profileStateKey];
  if (existing && typeof existing === "object") {
    if (typeof existing.eventsCreated !== "number") {
      existing.eventsCreated = 0;
    }
    return existing;
  }
  const next = { eventsCreated: 0 };
  automationState.profiles[profileStateKey] = next;
  return next;
}

/**
 * The stored every-other anchors for a profile, keyed by lowercase weekday.
 * Each value is the ISO instant of the manual event that anchored that
 * pattern's fortnightly cadence.
 * @returns {Record<string,string>}
 */
function getEveryOtherAnchors(profileState) {
  const anchors = profileState?.everyOtherAnchors;
  return anchors && typeof anchors === "object" ? anchors : {};
}

/**
 * Resolve the every-other anchors for a profile, backfilling any that are
 * missing. Backfill order (rollout continuity, so an existing series doesn't
 * silently stop when this fix lands): the most recent event actually posted on
 * that weekday, then the activation event if it falls on that weekday. A
 * pattern with no derivable anchor stays unanchored and generates nothing.
 * @param {boolean} persist - Write derived anchors back to state (real
 *   generation) vs compute in-memory only (preview/projection).
 * @returns {Record<string,string>}
 */
function resolveEveryOtherAnchors(groupId, profileKey, profile, profileState, timezone, persist) {
  const anchors = { ...getEveryOtherAnchors(profileState) };
  let changed = false;

  for (const pattern of profile.patterns || []) {
    if (pattern?.type !== "every-other") continue;
    const weekday = pattern.weekday?.toLowerCase();
    if (!weekday || anchors[weekday]) continue;

    // Most recent event this profile actually posted on this weekday.
    let bestMs = null;
    for (const e of pendingEvents) {
      if (e.groupId !== groupId || e.profileKey !== profileKey || e.status !== "published") continue;
      if (weekdayInZone(e.eventStartsAt, timezone) !== weekday) continue;
      const ms = parseEventStartMs(e.eventStartsAt);
      if (ms !== null && (bestMs === null || ms > bestMs)) bestMs = ms;
    }
    // Fall back to the activation event if it's on this weekday.
    if (bestMs === null) {
      const actMs = getActivationStartMs(profileState);
      if (actMs !== null && weekdayInZone(new Date(actMs).toISOString(), timezone) === weekday) {
        bestMs = actMs;
      }
    }

    if (bestMs !== null) {
      anchors[weekday] = new Date(bestMs).toISOString();
      changed = true;
    }
  }

  if (changed && persist) {
    profileState.everyOtherAnchors = anchors;
    saveAutomationState();
  }
  return anchors;
}

// Update the active-group filter without destroying pending data. When a
// group falls outside the known set (account switch, transient permission
// loss, etc.), suspend its scheduled jobs but keep the events in memory
// and on disk; re-entering the known set re-schedules them. Account-swap
// scenarios used to silently nuke an automation queue here.
function setKnownGroupIds(groupIds) {
  if (!Array.isArray(groupIds)) {
    knownGroupIds = null;
    // Filter cleared; any scheduled event without a live job gets one back.
    let resumed = 0;
    for (const event of pendingEvents) {
      if (event.status === "scheduled" && !scheduledJobs.has(event.id)) {
        scheduleJob(event);
        resumed += 1;
      }
    }
    if (resumed) {
      debugLogFn("Automation", `Cleared known-group filter, resumed ${resumed} scheduled job(s)`);
    }
    return { ok: true, removedPending: 0, removedDeleted: 0, suspended: 0, resumed };
  }

  knownGroupIds = new Set(groupIds.filter(Boolean));

  let suspended = 0;
  let resumed = 0;
  for (const event of pendingEvents) {
    const known = isKnownGroupId(event.groupId);
    const hasJob = scheduledJobs.has(event.id);
    if (!known && hasJob) {
      cancelJob(event.id);
      suspended += 1;
    } else if (known && event.status === "scheduled" && !hasJob) {
      scheduleJob(event);
      resumed += 1;
    }
  }

  if (suspended || resumed) {
    debugLogFn("Automation", `Group filter applied: suspended ${suspended}, resumed ${resumed}`);
  }

  // Pending data and deleted-event tombstones are preserved across filter
  // changes. Returning removed* as 0 keeps the existing log line in main.js
  // a no-op for this path.
  return { ok: true, removedPending: 0, removedDeleted: 0, suspended, resumed };
}

function parseEventStartMs(value) {
  if (!value) {
    return null;
  }
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

function buildPendingEventId(groupId, profileKey, eventStartsAt) {
  const eventStartMs = parseEventStartMs(eventStartsAt);
  if (!groupId || !profileKey || eventStartMs === null) {
    return null;
  }
  return `pending_${groupId}_${profileKey}_${eventStartMs}`;
}

function parsePendingEventIdStartMs(value) {
  if (!value) {
    return null;
  }
  const parts = String(value).split("_");
  const last = parts[parts.length - 1];
  const ms = Number(last);
  return Number.isFinite(ms) ? ms : null;
}

function isDeterministicPendingId(value) {
  return parsePendingEventIdStartMs(value) !== null;
}

function getPendingSlotStartMs(event) {
  if (!event || typeof event !== "object") {
    return null;
  }
  return parsePendingEventIdStartMs(event.slotKey)
    ?? parsePendingEventIdStartMs(event.id);
}

function getRestoreStartMs(event) {
  if (!event || typeof event !== "object") {
    return null;
  }
  const slotStartMs = getPendingSlotStartMs(event);
  const currentStartMs = parseEventStartMs(event.eventStartsAt);
  if (
    slotStartMs !== null &&
    currentStartMs !== null &&
    slotStartMs !== currentStartMs &&
    event.manualOverrides?.eventStartsAt
  ) {
    return slotStartMs;
  }
  return currentStartMs ?? slotStartMs;
}

function derivePendingSlotKey(event) {
  if (!event || typeof event !== "object") {
    return null;
  }
  if (isDeterministicPendingId(event.id)) {
    return event.id;
  }
  return buildPendingEventId(event.groupId, event.profileKey, event.eventStartsAt);
}

function getPendingSlotKey(event) {
  if (!event || typeof event !== "object") {
    return null;
  }
  return event.slotKey || derivePendingSlotKey(event) || event.id || null;
}

function getPendingSlotKeys(event) {
  const keys = new Set();
  const primary = getPendingSlotKey(event);
  if (primary) {
    keys.add(primary);
  }
  const current = buildPendingEventId(event?.groupId, event?.profileKey, event?.eventStartsAt);
  if (current) {
    keys.add(current);
  }
  return Array.from(keys);
}

function hasActivePendingEvents(groupId, profileKey) {
  if (!groupId || !profileKey) {
    return false;
  }
  return pendingEvents.some(event =>
    event.groupId === groupId &&
    event.profileKey === profileKey &&
    ACTIVE_PENDING_STATUSES.has(event.status)
  );
}

function clearDeletedEventsForProfile(groupId, profileKey) {
  const before = deletedEvents.length;
  deletedEvents = deletedEvents.filter(e => !(e.groupId === groupId && e.profileKey === profileKey));
  return before - deletedEvents.length;
}

function clearProfileState(groupId, profileKey) {
  const profileStateKey = getProfileStateKey(groupId, profileKey);
  if (automationState?.profiles?.[profileStateKey]) {
    delete automationState.profiles[profileStateKey];
    saveAutomationState();
    return true;
  }
  return false;
}

function getActivationStartMs(profileState) {
  return parseEventStartMs(profileState?.activationStartsAt);
}

function getEarliestEventStartMs(events) {
  let earliest = null;
  events.forEach(event => {
    const fromStart = parseEventStartMs(event.eventStartsAt);
    const fromId = parsePendingEventIdStartMs(event.id);
    const ms = fromStart ?? fromId;
    if (!ms) {
      return;
    }
    if (earliest === null || ms < earliest) {
      earliest = ms;
    }
  });
  return earliest;
}

function isKnownProfile(groupId, profileKey) {
  if (!isKnownGroupId(groupId)) {
    return false;
  }
  if (!profilesRef || typeof profilesRef !== "object") {
    return true;
  }
  return Boolean(profilesRef[groupId]?.profiles?.[profileKey]);
}

function getPendingEventPriority(event) {
  if (!event || typeof event !== "object") {
    return 0;
  }
  if (event.status === "published") {
    return 100;
  }
  let score = 0;
  if (event.manualOverrides) {
    score += 50;
  }
  if (event.status === "queued") {
    score += 4;
  } else if (event.status === "scheduled") {
    score += 3;
  } else if (event.status === "missed") {
    score += 2;
  } else {
    score += 1;
  }
  return score;
}

function normalizePendingStore() {
  let changed = false;
  const nowMs = Date.now();
  const normalizedPending = [];
  const normalizedDeleted = [];

  const normalizeIdAndSlotKey = (event) => {
    const derivedSlotKey = derivePendingSlotKey(event);
    if (derivedSlotKey && event.slotKey !== derivedSlotKey) {
      event.slotKey = derivedSlotKey;
      changed = true;
    }
    if (!event.id || !isDeterministicPendingId(event.id)) {
      if (derivedSlotKey && event.id !== derivedSlotKey) {
        event.id = derivedSlotKey;
        changed = true;
      }
    }
    if (!event.id && derivedSlotKey) {
      event.id = derivedSlotKey;
      changed = true;
    }
  };

  const normalizeDeletedEvent = (raw) => {
    if (!raw || typeof raw !== "object") {
      changed = true;
      return null;
    }
    const event = { ...raw };
    if (!event.groupId || !event.profileKey) {
      changed = true;
      return null;
    }
    if (!isKnownProfile(event.groupId, event.profileKey)) {
      changed = true;
      return null;
    }
    if (!event.eventStartsAt && event.manualOverrides?.eventStartsAt) {
      event.eventStartsAt = event.manualOverrides.eventStartsAt;
      changed = true;
    }
    const eventStartMs = parseEventStartMs(event.eventStartsAt);
    if (eventStartMs === null || eventStartMs <= nowMs) {
      changed = true;
      return null;
    }
    if (event.status !== "deleted") {
      event.status = "deleted";
      changed = true;
    }
    normalizeIdAndSlotKey(event);
    return event;
  };

  const normalizePendingEvent = (raw) => {
    if (!raw || typeof raw !== "object") {
      changed = true;
      return null;
    }
    const event = { ...raw };
    if (!event.groupId || !event.profileKey) {
      changed = true;
      return null;
    }
    if (!isKnownProfile(event.groupId, event.profileKey)) {
      changed = true;
      return null;
    }
    if (!event.eventStartsAt && event.manualOverrides?.eventStartsAt) {
      event.eventStartsAt = event.manualOverrides.eventStartsAt;
      changed = true;
    }
    const eventStartMs = parseEventStartMs(event.eventStartsAt);
    if (eventStartMs === null) {
      changed = true;
      return null;
    }
    if (!event.status || typeof event.status !== "string" || !VALID_PENDING_STATUSES.has(event.status)) {
      event.status = "scheduled";
      changed = true;
    }
    if (event.status === "deleted") {
      const deletedEvent = normalizeDeletedEvent(event);
      if (deletedEvent) {
        normalizedDeleted.push(deletedEvent);
      }
      changed = true;
      return null;
    }
    if (event.status === "cancelled") {
      changed = true;
      return null;
    }
    if (event.manualOverrides && typeof event.manualOverrides !== "object") {
      event.manualOverrides = null;
      changed = true;
    }
    if (!event.scheduledPublishTime && event.status !== "published") {
      const profile = profilesRef?.[event.groupId]?.profiles?.[event.profileKey];
      const newPublishTime = calculatePublishTime(event.eventStartsAt, profile, event.groupId, event.profileKey);
      if (newPublishTime) {
        event.scheduledPublishTime = newPublishTime.toISOString();
        changed = true;
      }
    }
    const publishMs = parseEventStartMs(event.scheduledPublishTime);
    if (event.status !== "published" && publishMs === null) {
      changed = true;
      return null;
    }
    normalizeIdAndSlotKey(event);
    return event;
  };

  pendingEvents.forEach(raw => {
    const event = normalizePendingEvent(raw);
    if (event) {
      normalizedPending.push(event);
    }
  });

  deletedEvents.forEach(raw => {
    const event = normalizeDeletedEvent(raw);
    if (event) {
      normalizedDeleted.push(event);
    }
  });

  const occupiedSlots = new Map();
  const keptEvents = new Set();

  const removeOccupiedByEvent = (target) => {
    for (const [key, value] of occupiedSlots.entries()) {
      if (value === target) {
        occupiedSlots.delete(key);
      }
    }
  };

  normalizedPending.forEach(event => {
    const slotKeys = getPendingSlotKeys(event);
    if (!slotKeys.length) {
      changed = true;
      return;
    }
    let existing = null;
    for (const key of slotKeys) {
      const occupied = occupiedSlots.get(key);
      if (occupied) {
        existing = occupied;
        break;
      }
    }
    if (!existing) {
      keptEvents.add(event);
      slotKeys.forEach(key => occupiedSlots.set(key, event));
      return;
    }
    if (getPendingEventPriority(event) > getPendingEventPriority(existing)) {
      removeOccupiedByEvent(existing);
      keptEvents.delete(existing);
      keptEvents.add(event);
      slotKeys.forEach(key => occupiedSlots.set(key, event));
      changed = true;
    } else {
      changed = true;
    }
  });

  const dedupedPending = Array.from(keptEvents);
  const pendingSlotKeys = new Set();
  dedupedPending.forEach(event => {
    getPendingSlotKeys(event).forEach(key => pendingSlotKeys.add(key));
  });

  const deletedOccupied = new Set();
  const keptDeleted = new Set();

  normalizedDeleted.forEach(event => {
    const slotKeys = getPendingSlotKeys(event);
    if (!slotKeys.length) {
      changed = true;
      return;
    }
    if (slotKeys.some(key => pendingSlotKeys.has(key))) {
      changed = true;
      return;
    }
    if (slotKeys.some(key => deletedOccupied.has(key))) {
      changed = true;
      return;
    }
    keptDeleted.add(event);
    slotKeys.forEach(key => deletedOccupied.add(key));
  });

  pendingEvents = dedupedPending;
  deletedEvents = Array.from(keptDeleted);
  return changed;
}

/** @returns {boolean} */
function isInitialized() {
  return initialized;
}

/**
 * Initialize the automation engine.
 * @param {object} config
 * @param {string} config.pendingEventsPath
 * @param {string} config.automationStatePath
 * @param {object} config.profiles - All profiles from main process.
 * @param {function} config.createEventFn - Creates an event via API.
 * @param {function} config.onMissedEvent
 * @param {function} config.onEventCreated
 * @param {function} config.debugLog
 */
function initializeAutomation(config) {
  const {
    pendingEventsPath,
    automationStatePath,
    profiles,
    createEventFn: createFn,
    onMissedEvent: onMissed,
    onEventCreated: onCreate,
    debugLog
  } = config;

  PENDING_EVENTS_PATH = pendingEventsPath;
  AUTOMATION_STATE_PATH = automationStatePath;
  createEventFn = createFn;
  onMissedEvent = onMissed || (() => {});
  onEventCreated = onCreate || (() => {});
  debugLogFn = debugLog || (() => {});
  profilesRef = profiles;

  // Load existing state
  loadPendingEvents();
  loadAutomationState();

  // Check for missed events
  const now = Date.now();
  let missedCount = 0;
  for (const event of pendingEvents) {
    // "queued" events were mid-flight through the rate limiter, which doesn't
    // survive a restart — treat them like scheduled events here so they don't
    // strand with no job attached.
    if (event.status === "scheduled" || event.status === "queued") {
      const publishTime = new Date(event.scheduledPublishTime).getTime();
      if (publishTime <= now) {
        // Its posting time passed while the app was closed — a missed card the
        // user decides on, never a silent late post.
        event.status = "missed";
        event.missedAt = new Date().toISOString();
        missedCount++;
        onMissedEvent(event);
      } else if (event.status === "queued") {
        // Still in the future — re-arm it (the fresh rate-limit window will
        // gate it again if needed).
        event.status = "scheduled";
      }
    }
  }
  if (missedCount > 0) {
    savePendingEvents();
  }

  // Schedule future jobs
  for (const event of pendingEvents) {
    if (event.status === "scheduled") {
      scheduleJob(event);
    }
  }

  initialized = true;
  debugLogFn("Automation", `Initialized with ${pendingEvents.length} pending events, ${missedCount} missed`);
  return { pendingEvents, automationState };
}

function loadPendingEvents() {
  try {
    const { data, recovered } = readJsonSafe(PENDING_EVENTS_PATH, null);
    if (data && typeof data === "object") {
      if (recovered) {
        debugLogFn("Automation", "Recovered pending events from backup (primary file was unreadable)");
      }
      pendingEvents = Array.isArray(data.events) ? data.events : [];
      deletedEvents = Array.isArray(data.deletedEvents) ? data.deletedEvents : [];
      if (data.settings && typeof data.settings === "object") {
        pendingSettings = { displayLimit: 10, ...data.settings };
      }

      // Clean up deleted events where eventStartsAt has passed (can never be restored)
      const now = new Date();
      deletedEvents = deletedEvents.filter(e => new Date(e.eventStartsAt) > now);

      const didNormalize = normalizePendingStore();
      if (didNormalize || recovered) {
        savePendingEvents();
        debugLogFn("Automation", `Normalized pending events: ${pendingEvents.length} pending, ${deletedEvents.length} deleted`);
      }
    } else {
      pendingEvents = [];
      deletedEvents = [];
    }
  } catch (err) {
    debugLogFn("Automation", "Failed to load pending events:", err);
    pendingEvents = [];
    deletedEvents = [];
  }
}

function savePendingEvents() {
  try {
    const data = {
      events: pendingEvents,
      deletedEvents: deletedEvents,
      settings: pendingSettings
    };
    writeJsonAtomic(PENDING_EVENTS_PATH, data);
  } catch (err) {
    debugLogFn("Automation", "Failed to save pending events:", err);
  }
}

/** @returns {object} */
function getPendingSettings() {
  return { ...pendingSettings };
}

/** @param {object} newSettings - Merged into existing settings. */
function updatePendingSettings(newSettings) {
  pendingSettings = { ...pendingSettings, ...newSettings };
  savePendingEvents();
}

function loadAutomationState() {
  try {
    const { data, recovered } = readJsonSafe(AUTOMATION_STATE_PATH, null);
    if (data && typeof data === "object" && data.profiles && typeof data.profiles === "object") {
      automationState = data;
      if (recovered) {
        debugLogFn("Automation", "Recovered automation state from backup (primary file was unreadable)");
      }
    } else {
      automationState = { profiles: {} };
    }
  } catch (err) {
    debugLogFn("Automation", "Failed to load automation state:", err);
    automationState = { profiles: {} };
  }
}

function saveAutomationState() {
  try {
    writeJsonAtomic(AUTOMATION_STATE_PATH, automationState);
  } catch (err) {
    debugLogFn("Automation", "Failed to save automation state:", err);
  }
}

/**
 * Calculate pending events for a profile.
 * @param {string} groupId
 * @param {string} profileKey
 * @param {object} profile
 * @param {number} maxEvents - Default 10.
 * @param {object} options
 * @param {number|null} options.minEventStartMs - Skip events on/before this UTC millis.
 * @returns {Array}
 */
function calculatePendingEvents(groupId, profileKey, profile, maxEvents = 10, options = {}) {
  if (!profile || !profile.automation?.enabled || !profile.patterns?.length) {
    return [];
  }

  const automation = profile.automation;
  const timezone = profile.timezone || "UTC";
  const minEventStartMs = Number.isFinite(options.minEventStartMs)
    ? options.minEventStartMs
    : null;

  // Get existing pending events for this profile to check counts / anchors
  const profileStateKey = getProfileStateKey(groupId, profileKey);
  const profileState = getOrCreateProfileState(profileStateKey);

  // Generate date options from patterns (3 months ahead max). In automation mode
  // every-other patterns stride 14 days from their stored anchor and produce
  // nothing until anchored by a matching manual event.
  const dateOptions = generateDateOptionsFromPatterns(profile.patterns, 3, timezone, {
    enforceEveryOther: true,
    everyOtherAnchors: resolveEveryOtherAnchors(groupId, profileKey, profile, profileState, timezone, true)
  });

  // Regular spacing between occurrences — used to mirror an overshooting "after"
  // offset onto the "before" side. dateOptions is sorted, so consecutive
  // differences are the gaps; the smallest is the tightest regular spacing.
  let nominalGapMs = null;
  for (let i = 1; i < dateOptions.length; i += 1) {
    const g = new Date(dateOptions[i].iso).getTime() - new Date(dateOptions[i - 1].iso).getTime();
    if (g > 0 && (nominalGapMs === null || g < nominalGapMs)) nominalGapMs = g;
  }

  if (!dateOptions.length) {
    return [];
  }

  const newPendingEvents = [];
  const now = new Date();

  // Check repeat limit
  if (automation.repeatMode === "count" && profileState.eventsCreated >= automation.repeatCount) {
    return []; // Limit reached
  }

  for (const dateOption of dateOptions) {
    if (newPendingEvents.length >= maxEvents) break;

    // Check repeat limit for count mode
    if (automation.repeatMode === "count") {
      const totalWillCreate = profileState.eventsCreated + newPendingEvents.length + 1;
      if (totalWillCreate > automation.repeatCount) break;
    }

    const eventStartTime = new Date(dateOption.iso);
    if (minEventStartMs !== null && eventStartTime.getTime() <= minEventStartMs) {
      continue;
    }
    // "after" mode anchors on the previous occurrence in the series: the last
    // event already placed in this batch, or — for the first one — the most
    // recent posted occurrence / the activation event (never a wall-clock
    // stamp). "before"/"monthly" ignore the anchor.
    const prevOccurrenceStartMs = newPendingEvents.length > 0
      ? parseEventStartMs(newPendingEvents[newPendingEvents.length - 1].eventStartsAt)
      : getHeadPreviousOccurrenceMs(groupId, profileKey, profileState);
    const durationMs = (profile.duration || 120) * 60 * 1000;

    const publishMs = computePublishTimeMs(
      eventStartTime.getTime(), automation, durationMs, prevOccurrenceStartMs, timezone, nominalGapMs
    );
    if (publishMs === null) {
      // "after" mode with no previous occurrence to measure from — can't time
      // this slot yet, so skip it rather than invent a time.
      continue;
    }
    let publishTime = new Date(publishMs);

    // If the computed publish time has already slipped into the past, the
    // announcement was missed. When the event itself is still comfortably in
    // the future, surface it as a missed card the user decides on (Post Now /
    // edit / delete) — never a silent auto-post. When the event start is
    // imminent or past, there's nothing useful left to announce, so skip it.
    const MIN_BUFFER_MS = 30 * 60 * 1000;
    let bornMissed = false;
    if (publishTime <= now) {
      if (eventStartTime.getTime() > now.getTime() + MIN_BUFFER_MS) {
        bornMissed = true;
      } else {
        continue;
      }
    }

    // Dynamic pending event: store references only, not full details.
    // Deterministic ID (groupId + profileKey + eventStartTime) ensures the
    // same pattern-slot always generates the same ID.
    const slotKey = buildPendingEventId(groupId, profileKey, eventStartTime.toISOString());
    const pendingEvent = {
      id: slotKey || `pending_${groupId}_${profileKey}_${eventStartTime.getTime()}`,
      slotKey: slotKey || null,
      groupId,
      profileKey,
      scheduledPublishTime: publishTime.toISOString(),
      eventStartsAt: eventStartTime.toISOString(),
      manualOverrides: null,
      status: bornMissed ? "missed" : "scheduled",
      missedAt: bornMissed ? new Date().toISOString() : null
    };

    newPendingEvents.push(pendingEvent);
  }

  return newPendingEvents;
}

/**
 * Project additional pending events from template patterns past the
 * engine's generated horizon. Returns synthetic pending-event objects
 * (status: "scheduled", isProjected: true) that the renderer can show
 * alongside real pending events. Slot keys are deterministic (groupId +
 * profileKey + eventStartTime) and match what the engine would generate
 * when its horizon catches up, so projected and committed entries align
 * exactly.
 *
 * Excludes:
 *  - Slots already in pendingEvents (engine already generated them).
 *  - Slots in deletedEvents (user explicitly tombstoned them).
 *  - (Published slots are tracked via pendingEvents because they're kept
 *    with status="published" until cleanup; the existingSlotKeys set
 *    covers them.)
 *
 * Respects the profile's count limit: stops projecting once the total
 * projected-plus-existing count would exceed automation.repeatCount.
 *
 * @param {string} groupId
 * @param {number} fromMs - Exclusive lower bound; events at or before are skipped.
 * @param {number} toMs - Inclusive upper bound; matches the modify view's filter range.
 * @returns {Array} Projected pending-event objects, each with isProjected: true.
 */
function projectFutureEvents(groupId, fromMs, toMs) {
  if (!groupId || !profilesRef || !Number.isFinite(fromMs) || !Number.isFinite(toMs)) {
    return [];
  }
  if (toMs <= fromMs) return [];

  const groupProfiles = profilesRef[groupId]?.profiles || {};
  const projected = [];

  // Pre-compute the slot-key blocklist for this group so projection won't
  // generate entries that collide with already-generated/tombstoned ones.
  const existingSlotKeys = new Set();
  for (const e of pendingEvents) {
    if (e.groupId === groupId && e.slotKey) existingSlotKeys.add(e.slotKey);
  }
  for (const d of deletedEvents) {
    if (d.groupId === groupId && d.slotKey) existingSlotKeys.add(d.slotKey);
  }

  for (const [profileKey, profile] of Object.entries(groupProfiles)) {
    if (!profile?.automation?.enabled) continue;
    if (!Array.isArray(profile.patterns) || profile.patterns.length === 0) continue;

    const automation = profile.automation;
    const timezone = profile.timezone || "UTC";

    // Translate the toMs upper bound into months-ahead for the date generator.
    // Add 1 to round up so we don't miss events near the boundary.
    const nowMs = Date.now();
    const monthsAhead = Math.max(
      1,
      Math.ceil((toMs - nowMs) / (30 * 24 * 60 * 60 * 1000)) + 1
    );

    const projProfileState = getOrCreateProfileState(getProfileStateKey(groupId, profileKey));
    const dateOptions = generateDateOptionsFromPatterns(
      profile.patterns,
      monthsAhead,
      timezone,
      {
        enforceEveryOther: true,
        everyOtherAnchors: resolveEveryOtherAnchors(groupId, profileKey, profile, projProfileState, timezone, false)
      }
    );
    if (!dateOptions.length) continue;

    // Count limit prep: profileState.eventsCreated tracks past *published*
    // events. Existing pending events for this profile (status=scheduled or
    // missed) also count toward the cap once they publish. Mirror the
    // engine's count math in calculatePendingEvents.
    const profileStateKey = getProfileStateKey(groupId, profileKey);
    const profileState = automationState?.profiles?.[profileStateKey] || { eventsCreated: 0 };
    const existingPendingForProfile = pendingEvents.filter(
      e => e.groupId === groupId && e.profileKey === profileKey && (e.status === "scheduled" || e.status === "missed" || e.status === "queued")
    ).length;

    let projectedSoFar = 0;
    // Chain "after" mode across the occurrence sequence so preview matches the
    // real generator: each occurrence's predecessor is the one before it, and
    // the first anchors on the last posted occurrence / activation event.
    let prevOccurrenceStartMs = getHeadPreviousOccurrenceMs(groupId, profileKey, profileState);
    for (const dateOption of dateOptions) {
      const eventStartTime = new Date(dateOption.iso);
      const eventStartMs = eventStartTime.getTime();
      const thisPrevMs = prevOccurrenceStartMs;
      // Every occurrence advances the chain, even ones outside the display range.
      prevOccurrenceStartMs = eventStartMs;

      if (eventStartMs <= fromMs) continue;
      if (eventStartMs > toMs) continue;

      const slotKey = buildPendingEventId(groupId, profileKey, eventStartTime.toISOString());
      if (!slotKey || existingSlotKeys.has(slotKey)) continue;

      // Honor the count cap if set.
      if (automation.repeatMode === "count") {
        const totalAfter = profileState.eventsCreated + existingPendingForProfile + projectedSoFar + 1;
        if (totalAfter > automation.repeatCount) break;
      }

      const publishTime = calculatePublishTime(eventStartTime.toISOString(), profile, groupId, profileKey, thisPrevMs);
      if (!publishTime) continue;

      projected.push({
        id: slotKey,
        slotKey,
        groupId,
        profileKey,
        scheduledPublishTime: publishTime.toISOString(),
        eventStartsAt: eventStartTime.toISOString(),
        manualOverrides: null,
        status: "scheduled",
        missedAt: null,
        isProjected: true,
      });
      projectedSoFar += 1;
    }
  }

  return projected;
}

/**
 * Promote a projected event slot into a real pending event (Phase B of
 * automation projection). Called when the renderer's edit-save flow
 * detects isProjected: true on the event being edited.
 *
 * Idempotent: if the slot is already committed, applies the new overrides
 * to the existing entry instead of duplicating.
 *
 * Side effects:
 *   - Pushes a new pending-event entry to the in-memory array.
 *   - Persists to pending-events.json.
 *   - Schedules the job so it publishes at scheduledPublishTime.
 *
 * @param {object} payload - { groupId, profileKey, eventStartsAt, overrides? }
 * @returns {object} { ok: true, pendingEventId, eventDetails } on success;
 *   { ok: false, error: { message } } on failure.
 */
function commitProjectedSlot(payload) {
  const { groupId, profileKey, eventStartsAt, overrides } = payload || {};
  if (!groupId || !profileKey || !eventStartsAt) {
    return { ok: false, error: { message: "Missing required fields (groupId, profileKey, eventStartsAt)." } };
  }

  const profile = profilesRef?.[groupId]?.profiles?.[profileKey];
  if (!profile) {
    return { ok: false, error: { message: "Profile not found." } };
  }
  if (!profile.automation?.enabled) {
    return { ok: false, error: { message: "Profile automation is not enabled." } };
  }

  const eventStartTime = new Date(eventStartsAt);
  if (Number.isNaN(eventStartTime.getTime())) {
    return { ok: false, error: { message: "Invalid eventStartsAt." } };
  }

  const slotKey = buildPendingEventId(groupId, profileKey, eventStartTime.toISOString());
  if (!slotKey) {
    return { ok: false, error: { message: "Could not build slot key." } };
  }

  const sanitizedOverrides = overrides && typeof overrides === "object" ? overrides : null;

  // Idempotency: if already committed, just apply the new overrides via the
  // existing update path. Covers the case where two clients (or two tabs)
  // race to commit the same projected slot.
  const existing = pendingEvents.find(e => e.slotKey === slotKey || e.id === slotKey);
  if (existing) {
    if (sanitizedOverrides) {
      const updateResult = updatePendingEventOverrides(existing.id, sanitizedOverrides);
      if (!updateResult?.ok) {
        return updateResult;
      }
    }
    return {
      ok: true,
      pendingEventId: existing.id,
      eventDetails: resolveEventDetails(existing.id),
      alreadyCommitted: true,
    };
  }

  const publishTime = calculatePublishTime(eventStartTime.toISOString(), profile, groupId, profileKey);
  if (!publishTime) {
    return { ok: false, error: { message: "Could not compute publish time." } };
  }

  const pendingEvent = {
    id: slotKey,
    slotKey,
    groupId,
    profileKey,
    scheduledPublishTime: publishTime.toISOString(),
    eventStartsAt: eventStartTime.toISOString(),
    manualOverrides: sanitizedOverrides,
    status: "scheduled",
    missedAt: null,
  };

  pendingEvents.push(pendingEvent);
  savePendingEvents();
  scheduleJob(pendingEvent);

  return {
    ok: true,
    pendingEventId: slotKey,
    eventDetails: resolveEventDetails(slotKey),
    alreadyCommitted: false,
  };
}

/**
 * Tombstone a projected event slot so the engine never regenerates it
 * (Phase C of automation projection). Called when the renderer's delete
 * flow detects isProjected: true on the event being deleted.
 *
 * Idempotent: if the slot is already tombstoned, returns ok without
 * adding a duplicate entry.
 *
 * If the slot is currently committed in pendingEvents, delegates to the
 * existing cancel path (handleMissedEvent action: "cancel"), which moves
 * the entry to deletedEvents.
 *
 * @param {object} payload - { groupId, profileKey, eventStartsAt }
 * @returns {object} { ok: true, slotKey, alreadyTombstoned } on success;
 *   { ok: false, error: { message } } on failure.
 */
function tombstoneProjectedSlot(payload) {
  const { groupId, profileKey, eventStartsAt } = payload || {};
  if (!groupId || !profileKey || !eventStartsAt) {
    return { ok: false, error: { message: "Missing required fields (groupId, profileKey, eventStartsAt)." } };
  }

  const eventStartTime = new Date(eventStartsAt);
  if (Number.isNaN(eventStartTime.getTime())) {
    return { ok: false, error: { message: "Invalid eventStartsAt." } };
  }

  const slotKey = buildPendingEventId(groupId, profileKey, eventStartTime.toISOString());
  if (!slotKey) {
    return { ok: false, error: { message: "Could not build slot key." } };
  }

  // Already tombstoned? No-op success.
  const existingTombstone = deletedEvents.find(d => d.slotKey === slotKey || d.id === slotKey);
  if (existingTombstone) {
    return { ok: true, slotKey, alreadyTombstoned: true };
  }

  // If the slot has already been committed (e.g., engine caught up between
  // projection and delete), delegate to the regular cancel path so we go
  // through the same in-memory + on-disk transition as a normal pending
  // event delete.
  const existingCommitted = pendingEvents.find(e => e.slotKey === slotKey || e.id === slotKey);
  if (existingCommitted) {
    cancelJob(existingCommitted.id);
    const idx = pendingEvents.indexOf(existingCommitted);
    if (idx >= 0) {
      const removed = pendingEvents.splice(idx, 1)[0];
      removed.status = "deleted";
      removed.deletedAt = new Date().toISOString();
      deletedEvents.push(removed);
    }
    savePendingEvents();
    return { ok: true, slotKey, alreadyTombstoned: false, viaCancel: true };
  }

  // Pure projected slot: add a synthetic tombstone entry. The engine's
  // regenerate cycle skips slotKeys that appear in deletedEvents, so this
  // is enough to prevent the slot from ever being recreated.
  const tombstone = {
    id: slotKey,
    slotKey,
    groupId,
    profileKey,
    eventStartsAt: eventStartTime.toISOString(),
    status: "deleted",
    deletedAt: new Date().toISOString(),
  };
  deletedEvents.push(tombstone);
  savePendingEvents();

  return { ok: true, slotKey, alreadyTombstoned: false };
}

function getRecheckIntervalMs(delayMs) {
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;
  const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
  if (delayMs > 7 * ONE_DAY_MS) {
    return ONE_DAY_MS;
  }
  if (delayMs > 2 * ONE_DAY_MS) {
    return EIGHT_HOURS_MS;
  }
  if (delayMs > ONE_DAY_MS) {
    return TWO_HOURS_MS;
  }
  return null;
}

/** @param {object} pendingEvent */
function scheduleJob(pendingEvent) {
  const publishTime = new Date(pendingEvent.scheduledPublishTime).getTime();
  const now = Date.now();
  const delay = publishTime - now;

  // If already past, mark as missed
  if (delay <= 0) {
    pendingEvent.status = "missed";
    pendingEvent.missedAt = new Date().toISOString();
    savePendingEvents();
    onMissedEvent(pendingEvent);
    return;
  }

  // If more than 1 day away, recheck periodically to avoid missing publish times
  // Once within 1 day, schedule the exact time
  const recheckIntervalMs = getRecheckIntervalMs(delay);
  if (recheckIntervalMs) {
    const timeoutId = setTimeout(() => {
      // Reschedule with fresh timing
      scheduleJob(pendingEvent);
    }, recheckIntervalMs);
    scheduledJobs.set(pendingEvent.id, timeoutId);
    const profileLabel = pendingEvent.groupId && pendingEvent.profileKey
      ? `${pendingEvent.groupId}::${pendingEvent.profileKey}`
      : "unknown-profile";
    debugLogFn("Automation", `Scheduled recheck for ${pendingEvent.id} (${profileLabel}) in ${Math.round(recheckIntervalMs / 1000 / 60)} minutes (publish in ${Math.round(delay / 1000 / 60 / 60)} hours)`);
    return;
  }

  // Schedule the job
  const timeoutId = setTimeout(async () => {
    await executeAutomatedPost(pendingEvent);
  }, delay);

  scheduledJobs.set(pendingEvent.id, timeoutId);
  const profileLabel = pendingEvent.groupId && pendingEvent.profileKey
    ? `${pendingEvent.groupId}::${pendingEvent.profileKey}`
    : "unknown-profile";
  debugLogFn("Automation", `Scheduled job for ${pendingEvent.id} (${profileLabel}) in ${Math.round(delay / 1000 / 60)} minutes`);
}

/** @param {string} pendingEventId */
function cancelJob(pendingEventId) {
  const timeoutId = scheduledJobs.get(pendingEventId);
  if (timeoutId) {
    clearTimeout(timeoutId);
    scheduledJobs.delete(pendingEventId);
  }

  // Also remove from rate limit queue
  dequeueEventPost(pendingEventId);
}

function cancelAllJobs() {
  for (const timeoutId of scheduledJobs.values()) {
    clearTimeout(timeoutId);
  }
  scheduledJobs.clear();

  // Clear rate limit queue
  rateLimitState.queue = [];
  if (rateLimitState.processTimeout) {
    clearTimeout(rateLimitState.processTimeout);
    rateLimitState.processTimeout = null;
  }
  rateLimitState.processing = false;
}

/** @param {string} groupId @param {string} profileKey */
function cancelJobsForProfile(groupId, profileKey) {
  const toCancel = pendingEvents
    .filter(e => e.groupId === groupId && e.profileKey === profileKey)
    .map(e => e.id);

  for (const id of toCancel) {
    cancelJob(id);
  }
}

function purgeProfilePendingEvents(groupId, profileKey) {
  if (!groupId || !profileKey) {
    return { ok: false, error: { message: "Missing groupId or profileKey" } };
  }

  cancelJobsForProfile(groupId, profileKey);

  const pendingBefore = pendingEvents.length;
  const deletedBefore = deletedEvents.length;

  pendingEvents = pendingEvents.filter(e => !(e.groupId === groupId && e.profileKey === profileKey));
  deletedEvents = deletedEvents.filter(e => !(e.groupId === groupId && e.profileKey === profileKey));

  const removedPending = pendingBefore - pendingEvents.length;
  const removedDeleted = deletedBefore - deletedEvents.length;

  if (removedPending || removedDeleted) {
    savePendingEvents();
  }

  const profileStateKey = getProfileStateKey(groupId, profileKey);
  if (automationState?.profiles?.[profileStateKey]) {
    delete automationState.profiles[profileStateKey];
    saveAutomationState();
  }

  debugLogFn("Automation", `Purged ${removedPending} pending + ${removedDeleted} deleted for ${groupId}::${profileKey}`);
  return { ok: true, removedPending, removedDeleted };
}

/**
 * Resolve event details from profile at runtime: pulls latest profile data
 * and applies manual overrides.
 * @param {string|object} pendingEventOrId - Pending event ID or object.
 * @param {object} [profiles] - Current profiles data; defaults to stored ref.
 * @returns {object|null}
 */
function resolveEventDetails(pendingEventOrId, profiles = null) {
  const profilesData = profiles || profilesRef;
  // Accept either a pendingEventId (string) for committed events, or a
  // pending-event-shaped object directly. Projected events (Phase A of
  // automation projection) aren't stored in pendingEvents, so callers pass
  // the synthetic projected object straight in.
  let pendingEvent;
  if (typeof pendingEventOrId === "string") {
    pendingEvent = pendingEvents.find(e => e.id === pendingEventOrId);
  } else if (pendingEventOrId && typeof pendingEventOrId === "object") {
    pendingEvent = pendingEventOrId;
  }

  if (!pendingEvent) {
    return null;
  }

  const profile = profilesData?.[pendingEvent.groupId]?.profiles?.[pendingEvent.profileKey];
  if (!profile) {
    return null;
  }

  // Construct image URL from imageId when available.
  const imageId = profile.imageId || null;
  let imageUrl = profile.imageUrl || null;
  if (imageId && !imageUrl) {
    // VRChat gallery image URL format.
    imageUrl = `https://api.vrchat.cloud/api/1/file/${imageId}/1`;
  }

  // Group fair is a profile-level boolean that maps to the vrc_event_group_fair
  // tag at create time, mirroring the one-off create flow in events.js.
  const tags = Array.isArray(profile.tags) ? [...profile.tags] : [];
  if (profile.groupFair && !tags.includes("vrc_event_group_fair")) {
    tags.push("vrc_event_group_fair");
  }

  const eventDetails = {
    title: profile.name || "Untitled Event",
    description: profile.description || "",
    category: profile.category || "hangout",
    accessType: profile.accessType || "public",
    languages: Array.isArray(profile.languages) ? [...profile.languages] : [],
    platforms: Array.isArray(profile.platforms) ? [...profile.platforms] : [],
    tags,
    imageId,
    imageUrl,
    featured: Boolean(profile.featured),
    roleIds: Array.isArray(profile.roleIds) ? [...profile.roleIds] : [],
    sendCreationNotification: profile.sendNotification ?? false,
    // Posting flags (profile defaults, overridable via manualOverrides)
    discordSync: profile.discordSync ?? false,
    webhookPost: profile.webhookPost ?? false,
    calendarCreate: profile.calendarSync ?? false,
    calendarRemindersEnabled: profile.calendarRemindersEnabled ?? false,
    calendarReminders: Array.isArray(profile.calendarReminders) ? [...profile.calendarReminders] : [],
    webhookMessageEnabled: profile.webhookMessageEnabled ?? false,
    webhookMessage: profile.webhookMessage || "",
    webhookImagePath: profile.webhookImagePath || ""
  };

  // Apply manual overrides if any
  if (pendingEvent.manualOverrides && typeof pendingEvent.manualOverrides === "object") {
    Object.entries(pendingEvent.manualOverrides).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        eventDetails[key] = value;
      }
    });
  }

  // Use overridden eventStartsAt if provided, otherwise use pending event's original
  const eventStartsAt = pendingEvent.manualOverrides?.eventStartsAt || pendingEvent.eventStartsAt;

  // Use overridden duration/timezone if provided
  const duration = pendingEvent.manualOverrides?.durationMinutes || profile.duration || 120;
  const timezone = pendingEvent.manualOverrides?.timezone || profile.timezone || "UTC";

  return {
    ...eventDetails,
    duration,
    timezone,
    eventStartsAt,
    scheduledPublishTime: pendingEvent.scheduledPublishTime
  };
}

/** @param {string} groupId @returns {object} */
function getRateLimitState(groupId) {
  if (!rateLimitState.groups[groupId]) {
    rateLimitState.groups[groupId] = {
      history: [],
      backoffIndex: 0,
      lockUntil: null
    };
  }
  return rateLimitState.groups[groupId];
}

/** @param {string} groupId */
function pruneRateLimitHistory(groupId) {
  const state = getRateLimitState(groupId);
  const cutoff = Date.now() - EVENT_HOURLY_WINDOW_MS;
  state.history = state.history.filter(ts => ts >= cutoff);
}

/** @param {string} groupId @returns {boolean} */
function isGroupRateLimited(groupId) {
  const state = getRateLimitState(groupId);

  // Check explicit lock
  if (state.lockUntil && Date.now() < state.lockUntil) {
    return true;
  }

  // Clear expired lock
  if (state.lockUntil && Date.now() >= state.lockUntil) {
    state.lockUntil = null;
    state.backoffIndex = 0; // Reset backoff on lock expiry
  }

  // Check hourly limit
  pruneRateLimitHistory(groupId);
  return state.history.length >= EVENT_HOURLY_LIMIT;
}

/** @param {string} groupId @returns {number} Milliseconds until expiry, or 0. */
function getRateLimitWaitMs(groupId) {
  const state = getRateLimitState(groupId);

  // Check explicit lock
  if (state.lockUntil) {
    const waitMs = state.lockUntil - Date.now();
    return Math.max(0, waitMs);
  }

  // Check hourly limit
  pruneRateLimitHistory(groupId);
  if (state.history.length >= EVENT_HOURLY_LIMIT) {
    // Wait until oldest entry expires
    const oldest = Math.min(...state.history);
    const expiresAt = oldest + EVENT_HOURLY_WINDOW_MS;
    const waitMs = expiresAt - Date.now();
    return Math.max(0, waitMs);
  }

  return 0;
}

/** @param {string} groupId */
function recordEventCreation(groupId) {
  const state = getRateLimitState(groupId);
  state.history.push(Date.now());
  pruneRateLimitHistory(groupId);

  // Reset backoff on success
  state.backoffIndex = 0;

  debugLogFn("Automation", `Recorded event for ${groupId}, count: ${state.history.length}/${EVENT_HOURLY_LIMIT}`);
}

/** Handle a 429 from the API. @param {string} groupId */
function handleRateLimitError(groupId) {
  const state = getRateLimitState(groupId);

  // Check whether the known 10/hour limit has been hit.
  pruneRateLimitHistory(groupId);
  if (state.history.length >= EVENT_HOURLY_LIMIT) {
    // Lock until oldest entry expires.
    const oldest = Math.min(...state.history);
    state.lockUntil = oldest + EVENT_HOURLY_WINDOW_MS;
    debugLogFn("Automation", `Hit 10/hour limit for ${groupId}, locked until ${new Date(state.lockUntil).toISOString()}`);
  } else {
    // Cross-platform or unknown limit; use exponential backoff.
    const backoffMinutes = BACKOFF_SEQUENCE[state.backoffIndex];
    state.backoffIndex = Math.min(state.backoffIndex + 1, BACKOFF_SEQUENCE.length - 1);
    state.lockUntil = Date.now() + (backoffMinutes * 60 * 1000);
    debugLogFn("Automation", `Rate limit error for ${groupId}, backoff ${backoffMinutes}min until ${new Date(state.lockUntil).toISOString()}`);
  }
}

/**
 * @param {string} pendingEventId
 * @param {string} groupId
 * @param {number} priority - Event start timestamp; lower means sooner.
 */
function queueEventPost(pendingEventId, groupId, priority) {
  // Check if already in queue
  if (rateLimitState.queue.some(item => item.pendingEventId === pendingEventId)) {
    return;
  }

  rateLimitState.queue.push({ pendingEventId, groupId, priority });

  // Sort by priority (soonest event start times first)
  rateLimitState.queue.sort((a, b) => a.priority - b.priority);

  debugLogFn("Automation", `Queued ${pendingEventId} for ${groupId}, queue length: ${rateLimitState.queue.length}`);

  // Start processing if not already running
  processQueue();
}

/** @param {string} pendingEventId */
function dequeueEventPost(pendingEventId) {
  const index = rateLimitState.queue.findIndex(item => item.pendingEventId === pendingEventId);
  if (index !== -1) {
    rateLimitState.queue.splice(index, 1);
    debugLogFn("Automation", `Removed ${pendingEventId} from queue, remaining: ${rateLimitState.queue.length}`);
  }
}

async function processQueue() {
  // Already processing
  if (rateLimitState.processing) {
    return;
  }

  // Queue is empty
  if (rateLimitState.queue.length === 0) {
    return;
  }

  rateLimitState.processing = true;

  try {
    while (rateLimitState.queue.length > 0) {
      const item = rateLimitState.queue[0]; // Peek at next item

      // Check if group is rate limited
      if (isGroupRateLimited(item.groupId)) {
        const waitMs = getRateLimitWaitMs(item.groupId);
        debugLogFn("Automation", `Group ${item.groupId} rate limited, waiting ${Math.round(waitMs / 1000)}s`);

        // Schedule retry
        if (rateLimitState.processTimeout) {
          clearTimeout(rateLimitState.processTimeout);
        }
        rateLimitState.processTimeout = setTimeout(() => {
          rateLimitState.processTimeout = null;
          processQueue();
        }, waitMs + 100);

        break; // Stop processing, will resume after wait
      }

      // Remove from queue (we're processing it now)
      rateLimitState.queue.shift();

      // Find the pending event
      const pendingEvent = pendingEvents.find(e => e.id === item.pendingEventId);
      if (!pendingEvent) {
        debugLogFn("Automation", `Pending event ${item.pendingEventId} not found, skipping`);
        continue;
      }

      // Check if it's still scheduled (not cancelled/published)
      if (pendingEvent.status !== "scheduled" && pendingEvent.status !== "missed" && pendingEvent.status !== "queued") {
        debugLogFn("Automation", `Pending event ${item.pendingEventId} status is ${pendingEvent.status}, skipping`);
        continue;
      }

      // Mark as scheduled before execution (in case it was queued)
      if (pendingEvent.status === "queued") {
        pendingEvent.status = "scheduled";
      }

      // Execute the post
      await executeAutomatedPostInternal(pendingEvent);

      // Small delay between posts (100ms)
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  } finally {
    rateLimitState.processing = false;
  }

  // If queue still has items, schedule another processing run
  if (rateLimitState.queue.length > 0) {
    if (rateLimitState.processTimeout) {
      clearTimeout(rateLimitState.processTimeout);
    }
    rateLimitState.processTimeout = setTimeout(() => {
      rateLimitState.processTimeout = null;
      processQueue();
    }, 1000);
  }
}

/** Called by the queue processor. @param {object} pendingEvent */
async function executeAutomatedPostInternal(pendingEvent) {
  debugLogFn("Automation", `Executing automated post for ${pendingEvent.id}`);

  try {
    // Resolve event details dynamically from profile
    const eventDetails = resolveEventDetails(pendingEvent.id);
    if (!eventDetails) {
      debugLogFn("Automation", `Could not resolve event details for ${pendingEvent.id} - profile may have been deleted`);
      pendingEvent.status = "cancelled";
      savePendingEvents();
      return;
    }

    // Calculate end time
    const startTime = new Date(pendingEvent.eventStartsAt);

    // Never create an event whose start time has already passed. VRChat would
    // otherwise receive a past-dated event, and a show that already happened
    // should not be posted. This is the single chokepoint for every posting
    // path — the scheduled timer, queue retries, and manual Post Now all funnel
    // through here — so guarding it once covers them all.
    if (startTime.getTime() <= Date.now()) {
      debugLogFn("Automation", `Refusing to post ${pendingEvent.id}: event start ${pendingEvent.eventStartsAt} is already in the past`);
      pendingEvent.status = "cancelled";
      savePendingEvents();
      return;
    }

    const durationMs = (eventDetails.duration || 120) * 60 * 1000;
    const endTime = new Date(startTime.getTime() + durationMs);

    // Call the event creation function
    const result = await createEventFn(
      pendingEvent.groupId,
      eventDetails,
      startTime.toISOString(),
      endTime.toISOString()
    );

      if (result.ok) {
        // Record successful creation for rate limiting
        recordEventCreation(pendingEvent.groupId);

        // Update pending event status
        pendingEvent.eventId = result.eventId || pendingEvent.eventId || null;
        pendingEvent.status = "published";

      // Update automation state
      const profileStateKey = getProfileStateKey(pendingEvent.groupId, pendingEvent.profileKey);
      const profileState = getOrCreateProfileState(profileStateKey);
      profileState.eventsCreated += 1;
      if (getActivationStartMs(profileState) === null && pendingEvent.eventStartsAt) {
        profileState.activationStartsAt = pendingEvent.eventStartsAt;
      }
      // lastSuccess (a wall-clock post-receipt timestamp) is no longer used for
      // timing — "after" mode now anchors on real occurrences, not this stamp.
      profileState.lastEventId = result.eventId;

      saveAutomationState();
      savePendingEvents();

      debugLogFn("Automation", `Successfully created event for ${pendingEvent.id}`);
      onEventCreated(pendingEvent, result.eventId);
    } else {
      // Check if it's a rate limit error
      const isRateLimit = result.error?.code === "UPCOMING_LIMIT" ||
                          result.error?.status === 429 ||
                          (result.error?.message && result.error.message.toLowerCase().includes("rate limit"));

      if (isRateLimit) {
        debugLogFn("Automation", `Rate limit hit for ${pendingEvent.id}`);
        handleRateLimitError(pendingEvent.groupId);

        // Mark as queued (distinct from "missed")
        pendingEvent.status = "queued";
        pendingEvent.queuedAt = new Date().toISOString();
        savePendingEvents();

        // Re-queue this event
        const priority = new Date(pendingEvent.eventStartsAt).getTime();
        queueEventPost(pendingEvent.id, pendingEvent.groupId, priority);
      } else {
        // Non-rate-limit failure - schedule retry with 15min delay
        debugLogFn("Automation", `Failed to create event: ${result.error?.message || "Unknown error"}`);
        scheduleRetry(pendingEvent);
      }
    }
  } catch (err) {
    debugLogFn("Automation", `Error executing automated post: ${err.message}`);
    scheduleRetry(pendingEvent);
  }
}

/** Public wrapper that queues the event for rate-limited posting. */
async function executeAutomatedPost(pendingEvent) {
  const priority = new Date(pendingEvent.eventStartsAt).getTime();
  queueEventPost(pendingEvent.id, pendingEvent.groupId, priority);
}

/** Schedule a 15-minute retry for a failed job. */
function scheduleRetry(pendingEvent) {
  const RETRY_DELAY = 15 * 60 * 1000;

  const timeoutId = setTimeout(async () => {
    await executeAutomatedPost(pendingEvent);
  }, RETRY_DELAY);

  scheduledJobs.set(pendingEvent.id, timeoutId);
  debugLogFn("Automation", `Scheduled retry for ${pendingEvent.id} in 15 minutes`);
}

/**
 * @param {string} pendingEventId
 * @param {"postNow"|"cancel"} action
 */
async function handleMissedEvent(pendingEventId, action) {
  const eventIndex = pendingEvents.findIndex(e => e.id === pendingEventId);
  if (eventIndex === -1) {
    return { ok: false, error: { message: "Pending event not found" } };
  }

  const pendingEvent = pendingEvents[eventIndex];

  if (action === "postNow") {
    // Prevent posting if event is queued (waiting for rate limits)
    if (pendingEvent.status === "queued") {
      return { ok: false, error: { message: "Event is queued waiting for rate limits to clear. Please wait." } };
    }

    // Can't post an event whose start time has already passed — the show has
    // already begun or ended. (The engine also backstops this, but refusing
    // here gives the button honest, immediate feedback.)
    if (new Date(pendingEvent.eventStartsAt).getTime() <= Date.now()) {
      return { ok: false, error: { message: "This event's start time has already passed and can no longer be posted." } };
    }

    // Execute immediately
    pendingEvent.status = "scheduled"; // Reset status for execution
    await executeAutomatedPost(pendingEvent);
    return { ok: true };
  } else if (action === "cancel") {
      // Soft-delete: move to deletedEvents array instead of permanently removing
      const { groupId, profileKey } = pendingEvent;
      cancelJob(pendingEventId);
      const deletedEvent = pendingEvents.splice(eventIndex, 1)[0];
      deletedEvent.status = "deleted";
      deletedEvent.deletedAt = new Date().toISOString();
      deletedEvents.push(deletedEvent);

      let automationCleared = false;
      if (!hasActivePendingEvents(groupId, profileKey)) {
        const removed = clearDeletedEventsForProfile(groupId, profileKey);
        const stateCleared = clearProfileState(groupId, profileKey);
        automationCleared = removed > 0 || stateCleared;
        if (removed || stateCleared) {
          debugLogFn(
            "Automation",
            `Cleared ${removed} deleted events after last pending deletion for ${groupId}::${profileKey}`
          );
        }
      }

      savePendingEvents();
      return { ok: true, automationCleared, groupId, profileKey };
    }

  return { ok: false, error: { message: "Unknown action" } };
}

/** @param {string} [groupId] @returns {Array} */
function getPendingEvents(groupId = null) {
  if (groupId) {
    return pendingEvents.filter(e => e.groupId === groupId && e.status !== "cancelled" && e.status !== "published");
  }
  return pendingEvents.filter(e => e.status !== "cancelled" && e.status !== "published");
}

/** Truly missed, not queued. @param {string} [groupId] @returns {number} */
function getMissedCount(groupId = null) {
  if (groupId) {
    return pendingEvents.filter(e => e.groupId === groupId && e.status === "missed").length;
  }
  return pendingEvents.filter(e => e.status === "missed").length;
}

/** Waiting for rate limits. @param {string} [groupId] @returns {number} */
function getQueuedCount(groupId = null) {
  if (groupId) {
    return pendingEvents.filter(e => e.groupId === groupId && e.status === "queued").length;
  }
  return pendingEvents.filter(e => e.status === "queued").length;
}

/**
 * @param {string} groupId
 * @param {string} profileKey
 * @param {object} profile
 */
function updatePendingEventsForProfile(groupId, profileKey, profile) {
  if (!isKnownGroupId(groupId)) {
    debugLogFn("Automation", `Skipping pending updates for unknown group ${groupId}::${profileKey}`);
    purgeProfilePendingEvents(groupId, profileKey);
    return;
  }
  // Update profiles reference
  if (profilesRef && profilesRef[groupId]) {
    if (!profilesRef[groupId].profiles) {
      profilesRef[groupId].profiles = {};
    }
    profilesRef[groupId].profiles[profileKey] = profile;
  }

  const profileStateKey = getProfileStateKey(groupId, profileKey);
  const profileState = getOrCreateProfileState(profileStateKey);

  // Get existing events for this profile
  const existingEvents = pendingEvents.filter(e =>
    e.groupId === groupId && e.profileKey === profileKey
  );

  // Get slot keys of manually modified events (these should NEVER be recreated)
  const modifiedEventSlots = new Set();
  existingEvents
    .filter(e => e.manualOverrides)
    .forEach(event => {
      getPendingSlotKeys(event).forEach(key => modifiedEventSlots.add(key));
    });

  // Get slot keys of published events (these should never be recreated)
  const publishedEventSlots = new Set();
  existingEvents
    .filter(e => e.status === "published")
    .forEach(event => {
      getPendingSlotKeys(event).forEach(key => publishedEventSlots.add(key));
    });

  // Get slot keys of missed/queued events. These are preserved so the user can
  // still act on them (Post Now / edit / delete); the regenerator must not drop
  // a fresh "scheduled" copy over the top of them.
  const preservedStatusSlots = new Set();
  existingEvents
    .filter(e => e.status === "missed" || e.status === "queued")
    .forEach(event => {
      getPendingSlotKeys(event).forEach(key => preservedStatusSlots.add(key));
    });

  // Get slot keys of deleted events (these should not be recreated)
  const deletedEventSlots = new Set();
  deletedEvents
    .filter(e => e.groupId === groupId && e.profileKey === profileKey)
    .forEach(event => {
      getPendingSlotKeys(event).forEach(key => deletedEventSlots.add(key));
    });

  // Cancel existing jobs for this profile (only non-modified ones will be replaced)
  for (const event of existingEvents) {
    if (!event.manualOverrides) {
      cancelJob(event.id);
    }
  }

  // Remove only auto-generated, still-scheduled events. Manually-modified,
  // published, missed, and queued events are all preserved — missed/queued so a
  // template save or a later successful post can't silently wipe a card the user
  // still needs to act on.
  pendingEvents = pendingEvents.filter(e =>
    !(e.groupId === groupId && e.profileKey === profileKey
      && !e.manualOverrides
      && e.status !== "published"
      && e.status !== "missed"
      && e.status !== "queued")
  );

  // If automation is disabled, just save and return
  if (!profile?.automation?.enabled) {
    savePendingEvents();
    debugLogFn("Automation", `Automation disabled for ${groupId}::${profileKey}, cleared pending events`);
    return;
  }

  const hasExistingPending = existingEvents.length > 0;
  let anchorMs = getActivationStartMs(profileState);
  if (anchorMs === null && hasExistingPending) {
    anchorMs = getEarliestEventStartMs(existingEvents);
    if (anchorMs !== null) {
      profileState.activationStartsAt = new Date(anchorMs).toISOString();
      saveAutomationState();
    }
  }

  if (!hasExistingPending && anchorMs === null) {
    // Don't generate pending events until the profile is activated by a manual event
    savePendingEvents();
    debugLogFn("Automation", `No pending events generated for ${groupId}::${profileKey} - waiting for first manual event`);
    return;
  }

  // Calculate new pending events (with deterministic IDs)
  const newEvents = calculatePendingEvents(groupId, profileKey, profile, 10, { minEventStartMs: anchorMs });

  // Filter out events whose ID matches:
  // 1. A modified event (already exists, user customized it)
  // 2. A deleted event (user explicitly removed it)
  // 3. A published event (already posted)
  // 4. A preserved missed/queued event (kept for the user to act on)
  const filteredNewEvents = newEvents.filter(e =>
    !modifiedEventSlots.has(getPendingSlotKey(e)) &&
    !deletedEventSlots.has(getPendingSlotKey(e)) &&
    !publishedEventSlots.has(getPendingSlotKey(e)) &&
    !preservedStatusSlots.has(getPendingSlotKey(e))
  );

  // Add new events (modified events remain untouched in pendingEvents)
  pendingEvents.push(...filteredNewEvents);

  // Recompute preserved missed/queued cards against the current rule, so a
  // template-rule change updates their posting time too — and re-arms one whose
  // new time is now in the future. Hand-edited cards keep their pinned content.
  const nowMs = Date.now();
  for (const ev of pendingEvents) {
    if (ev.groupId !== groupId || ev.profileKey !== profileKey) continue;
    if (ev.manualOverrides || (ev.status !== "missed" && ev.status !== "queued")) continue;
    const newPub = calculatePublishTime(ev.eventStartsAt, profile, groupId, profileKey);
    if (!newPub) continue;
    ev.scheduledPublishTime = newPub.toISOString();
    if (newPub.getTime() > nowMs) {
      ev.status = "scheduled";
      ev.missedAt = null;
      scheduleJob(ev);
    } else if (ev.status !== "missed") {
      ev.status = "missed";
      ev.missedAt = new Date().toISOString();
    }
  }

  savePendingEvents();

  // Schedule jobs for new events
  for (const event of filteredNewEvents) {
    scheduleJob(event);
  }

  const modifiedCount = existingEvents.filter(e => e.manualOverrides).length;
  debugLogFn("Automation", `Updated pending events for ${groupId}::${profileKey}, ${filteredNewEvents.length} new + ${modifiedCount} modified preserved`);
}

function recordManualEvent(groupId, profileKey, eventStartsAt) {
  if (!isKnownGroupId(groupId)) {
    debugLogFn("Automation", `Skipping manual event seed for unknown group ${groupId}::${profileKey}`);
    return false;
  }
  const eventStartMs = parseEventStartMs(eventStartsAt);
  if (eventStartMs === null) {
    debugLogFn("Automation", `Skipping manual event seed for ${groupId}::${profileKey} - invalid start time`);
    return false;
  }

  const profileStateKey = getProfileStateKey(groupId, profileKey);
  const profileState = getOrCreateProfileState(profileStateKey);

  // Anchor any every-other pattern whose weekday matches this event. The anchor
  // is a stored date, so it survives the event being edited or deleted, and the
  // first matching event wins (a later event on the same weekday won't move it).
  let anchorChanged = false;
  const profile = profilesRef?.[groupId]?.profiles?.[profileKey];
  if (profile && Array.isArray(profile.patterns)) {
    const eventWeekday = weekdayInZone(eventStartsAt, profile.timezone || "UTC");
    const hasEveryOther = eventWeekday && profile.patterns.some(
      p => p?.type === "every-other" && p.weekday?.toLowerCase() === eventWeekday
    );
    if (hasEveryOther) {
      if (!profileState.everyOtherAnchors || typeof profileState.everyOtherAnchors !== "object") {
        profileState.everyOtherAnchors = {};
      }
      if (!profileState.everyOtherAnchors[eventWeekday]) {
        profileState.everyOtherAnchors[eventWeekday] = new Date(eventStartMs).toISOString();
        anchorChanged = true;
        debugLogFn("Automation", `Anchored every-other ${eventWeekday} for ${groupId}::${profileKey} at ${profileState.everyOtherAnchors[eventWeekday]}`);
      }
    }
  }

  const existingStartMs = getActivationStartMs(profileState);
  const activationChanged = existingStartMs === null || existingStartMs > eventStartMs;
  if (activationChanged) {
    profileState.activationStartsAt = new Date(eventStartMs).toISOString();
    debugLogFn("Automation", `Seeded automation for ${groupId}::${profileKey} at ${profileState.activationStartsAt}`);
  }

  if (activationChanged || anchorChanged) {
    saveAutomationState();
  }
  return activationChanged || anchorChanged;
}

/** @param {string} pendingEventId @param {object} overrides */
function updatePendingEventOverrides(pendingEventId, overrides) {
  const event = pendingEvents.find(e => e.id === pendingEventId);
  if (!event) {
    return { ok: false, error: { message: "Pending event not found" } };
  }

  const previousEventStartsAt = event.eventStartsAt;
  if (!event.slotKey) {
    const derivedSlotKey = derivePendingSlotKey(event);
    if (derivedSlotKey) {
      event.slotKey = derivedSlotKey;
    }
  }
  event.manualOverrides = overrides;

  // If eventStartsAt is overridden, also update the main field for display
  if (overrides?.eventStartsAt) {
    event.eventStartsAt = overrides.eventStartsAt;
  }

  // Recalculate publish time if event start time changed
  if (overrides?.eventStartsAt && overrides.eventStartsAt !== previousEventStartsAt) {
    const profile = profilesRef?.[event.groupId]?.profiles?.[event.profileKey];
    const automation = profile?.automation;

    if (automation?.enabled) {
      const eventStartTime = new Date(overrides.eventStartsAt);

      // Recompute against the event's current context, not the old gap: its own
      // new date for "before"/"monthly", and the previous occurrence for
      // "after". So moving a monthly event to a new month re-lands it on that
      // month's target day instead of dragging the old offset along.
      const durationMs = (profile.duration || 120) * 60 * 1000;
      let prevOccurrenceStartMs = null;
      let nominalGapMs = null;
      if (automation.timingMode === "after") {
        // The edited event's OWN predecessor, not the series head — otherwise a
        // mid-series event would be timed from a far-earlier occurrence and
        // wrongly marked missed.
        prevOccurrenceStartMs = previousOccurrenceForEvent(profile, event.groupId, event.profileKey, eventStartTime.getTime());
        nominalGapMs = nominalGapForProfile(profile, event.groupId, event.profileKey);
      }
      const publishMs = computePublishTimeMs(
        eventStartTime.getTime(), automation, durationMs, prevOccurrenceStartMs, profile.timezone || "UTC", nominalGapMs
      );
      const newPublishTime = publishMs === null
        ? new Date(eventStartTime.getTime() - offsetMsOf(automation))
        : new Date(publishMs);

      event.scheduledPublishTime = newPublishTime.toISOString();

      // Check if new publish time is in the past - mark as missed if so
      const now = new Date();
      if (newPublishTime <= now) {
        event.status = "missed";
        event.missedAt = now.toISOString();
        // Cancel any existing scheduled job
        cancelJob(pendingEventId);
      } else if (event.status === "missed") {
        // If was missed but new time is in the future, reschedule
        event.status = "scheduled";
        event.missedAt = null;
        scheduleJob(event);
      } else {
        // Reschedule the job with new publish time
        cancelJob(pendingEventId);
        scheduleJob(event);
      }
    }
  }

  savePendingEvents();
  return { ok: true };
}

function reconcilePublishedEvents(groupId, upcomingEvents = []) {
  if (!groupId) {
    return { ok: false, error: { message: "Missing groupId" } };
  }
  if (!Array.isArray(upcomingEvents)) {
    return { ok: false, error: { message: "Missing upcoming events" } };
  }

  const eventIds = new Set(upcomingEvents.map(event => event?.id).filter(Boolean));
  const eventsByStart = new Map();
  upcomingEvents.forEach(event => {
    const start = event?.startsAtUtc || event?.eventStartsAt || null;
    if (!start) {
      return;
    }
    const list = eventsByStart.get(start) || [];
    list.push(event);
    eventsByStart.set(start, list);
  });

  let removed = 0;
  let updated = 0;

  pendingEvents = pendingEvents.filter(event => {
    if (event.groupId !== groupId || event.status !== "published") {
      return true;
    }
    if (event.eventId) {
      if (eventIds.has(event.eventId)) {
        return true;
      }
      removed += 1;
      return false;
    }

    const startKey = event.eventStartsAt;
    if (!startKey) {
      return true;
    }
    const candidates = eventsByStart.get(startKey) || [];
    if (!candidates.length) {
      removed += 1;
      return false;
    }
    if (candidates.length === 1) {
      event.eventId = candidates[0].id || null;
      if (event.eventId) {
        updated += 1;
      }
      return true;
    }
    const resolved = resolveEventDetails(event.id);
    const expectedTitle = resolved?.title;
    if (expectedTitle) {
      const matching = candidates.filter(candidate => candidate?.title === expectedTitle);
      if (matching.length === 1) {
        event.eventId = matching[0].id || null;
        if (event.eventId) {
          updated += 1;
        }
        return true;
      }
    }

    removed += 1;
    return false;
  });

  // Second pass: check scheduled pending events against existing VRChat events.
  // If an event with the same start time AND title already exists, mark the pending
  // event as published to prevent duplicate posting.
  let reconciled = 0;
  for (const event of pendingEvents) {
    if (event.groupId !== groupId || event.status !== "scheduled") {
      continue;
    }
    const startKey = event.eventStartsAt;
    if (!startKey) {
      continue;
    }
    const candidates = eventsByStart.get(startKey) || [];
    if (!candidates.length) {
      continue;
    }
    const resolved = resolveEventDetails(event.id);
    if (!resolved?.title) {
      continue;
    }
    const matching = candidates.filter(candidate =>
      candidate?.title === resolved.title &&
      candidate?.description === resolved.description &&
      candidate?.category === resolved.category &&
      candidate?.accessType === resolved.accessType
    );
    if (matching.length > 0) {
      cancelJob(event.id);
      event.status = "published";
      event.eventId = matching[0].id || null;
      reconciled += 1;
      debugLogFn("Automation", `Reconciled scheduled event ${event.id} with existing VRChat event ${event.eventId}`);
    }
  }

  if (removed || updated || reconciled) {
    savePendingEvents();
  }

  return { ok: true, removed, updated, reconciled };
}

/** @param {string} groupId @param {string} profileKey @returns {object} */
function getAutomationStatus(groupId, profileKey) {
  const profileStateKey = `${groupId}::${profileKey}`;
  const state = automationState.profiles[profileStateKey] || { eventsCreated: 0 };
  const profilePendingEvents = pendingEvents.filter(
    e => e.groupId === groupId && e.profileKey === profileKey
  );

  return {
    ...state,
    pendingCount: profilePendingEvents.filter(e => e.status === "scheduled").length,
    missedCount: profilePendingEvents.filter(e => e.status === "missed").length,
    queuedCount: profilePendingEvents.filter(e => e.status === "queued").length
  };
}

/** Called when profile settings change. @param {string} groupId @param {string} profileKey */
function resetAutomationState(groupId, profileKey) {
  const profileStateKey = `${groupId}::${profileKey}`;
  automationState.profiles[profileStateKey] = { eventsCreated: 0 };
  saveAutomationState();
}

/**
 * Publish time for a single event (used by restore, projection, and load-time
 * backfill), routed through the same computation as the batch generator so all
 * paths agree. For "after" mode, pass prevOccurrenceStartMs to chain from a
 * known predecessor (projection); otherwise groupId/profileKey let it derive
 * the head anchor (last posted occurrence / activation event).
 * @returns {Date|null}
 */
function calculatePublishTime(eventStartsAt, profile, groupId, profileKey, prevOccurrenceStartMs) {
  const automation = profile?.automation;
  if (!automation?.enabled) {
    return null;
  }

  const eventStartMs = new Date(eventStartsAt).getTime();
  const durationMs = (profile.duration || 120) * 60 * 1000;
  const timezone = profile.timezone || "UTC";

  let prevMs = Number.isFinite(prevOccurrenceStartMs) ? prevOccurrenceStartMs : null;
  if (automation.timingMode === "after" && prevMs === null) {
    prevMs = previousOccurrenceForEvent(profile, groupId, profileKey, eventStartMs);
  }

  const nominalGapMs = automation.timingMode === "after"
    ? nominalGapForProfile(profile, groupId, profileKey)
    : null;
  const publishMs = computePublishTimeMs(eventStartMs, automation, durationMs, prevMs, timezone, nominalGapMs);
  return publishMs === null ? null : new Date(publishMs);
}

/** @param {string} groupId @param {string} profileKey @returns {{ ok: boolean, restoredCount?: number, error?: object }} */
function restoreDeletedEvents(groupId, profileKey) {
  const deletedForProfile = deletedEvents.filter(e =>
    e.groupId === groupId && e.profileKey === profileKey
  );

  if (deletedForProfile.length === 0) {
    return { ok: true, restoredCount: 0 };
  }

  const profile = profilesRef?.[groupId]?.profiles?.[profileKey];
  if (!profile) {
    return { ok: false, error: { message: "Profile not found" } };
  }

  const profileStateKey = getProfileStateKey(groupId, profileKey);
  const profileState = getOrCreateProfileState(profileStateKey);
  const existingEvents = pendingEvents.filter(e => e.groupId === groupId && e.profileKey === profileKey);
  const modifiedEventSlots = new Set();
  existingEvents
    .filter(e => e.manualOverrides)
    .forEach(event => {
      getPendingSlotKeys(event).forEach(key => modifiedEventSlots.add(key));
    });
  const publishedEventSlots = new Set();
  existingEvents
    .filter(e => e.status === "published")
    .forEach(event => {
      getPendingSlotKeys(event).forEach(key => publishedEventSlots.add(key));
    });
  let anchorMs = getActivationStartMs(profileState);
  if (anchorMs === null) {
    anchorMs = getEarliestEventStartMs(existingEvents) ?? getEarliestEventStartMs(deletedForProfile);
    if (anchorMs !== null) {
      profileState.activationStartsAt = new Date(anchorMs).toISOString();
      saveAutomationState();
    }
  }

  const nowMs = Date.now();
  let restoredCount = 0;
  const toRemoveFromDeleted = [];

  for (const event of deletedForProfile) {
    const eventSlotKeys = getPendingSlotKeys(event);
    if (eventSlotKeys.some(key => modifiedEventSlots.has(key))) {
      continue;
    }
    if (eventSlotKeys.some(key => publishedEventSlots.has(key))) {
      continue;
    }
    const restoreStartMs = getRestoreStartMs(event);
    if (restoreStartMs === null || restoreStartMs <= nowMs) {
      continue;
    }
    if (anchorMs !== null && restoreStartMs <= anchorMs) {
      continue;
    }
    // Only restore events whose event date hasn't passed yet
    // Recalculate publish time based on current profile settings
    const restoreStartsAt = new Date(restoreStartMs).toISOString();
    const newPublishTime = calculatePublishTime(restoreStartsAt, profile, groupId, profileKey);

    // Only restore if publish time calculation succeeded and is in the future
      if (newPublishTime && newPublishTime.getTime() > nowMs) {
        const hasOverrides = event.manualOverrides && Object.keys(event.manualOverrides).length > 0;
        const currentStartMs = parseEventStartMs(event.eventStartsAt);
        const useOverrides = hasOverrides && currentStartMs === restoreStartMs;
        const slotKey = buildPendingEventId(groupId, profileKey, restoreStartsAt);
        const fallbackId = slotKey || event.id || `pending_${groupId}_${profileKey}_${restoreStartMs}`;
        let restoredEvent = event;

        if (!useOverrides) {
          restoredEvent = {
            id: fallbackId,
            slotKey: slotKey || event.slotKey || null,
            groupId,
            profileKey,
            scheduledPublishTime: newPublishTime.toISOString(),
            eventStartsAt: restoreStartsAt,
            manualOverrides: null,
            status: "scheduled",
            missedAt: null
          };
        } else {
          restoredEvent.scheduledPublishTime = newPublishTime.toISOString();
          restoredEvent.status = "scheduled";
          restoredEvent.missedAt = null;
          if (!restoredEvent.eventStartsAt) {
            restoredEvent.eventStartsAt = restoreStartsAt;
          }
          delete restoredEvent.deletedAt;
          delete restoredEvent.queuedAt;
        }

        pendingEvents.push(restoredEvent);
        scheduleJob(restoredEvent);
        restoredCount++;
        toRemoveFromDeleted.push(event);
      }
  }

  // Remove restored events from deletedEvents
  for (const event of toRemoveFromDeleted) {
    const idx = deletedEvents.indexOf(event);
    if (idx !== -1) {
      deletedEvents.splice(idx, 1);
    }
  }

  savePendingEvents();
  debugLogFn("Automation", `Restored ${restoredCount} deleted events for ${groupId}::${profileKey}`);

  return { ok: true, restoredCount };
}

/** @param {string} groupId @param {string} profileKey @returns {number} */
function getRestorableCount(groupId, profileKey) {
  const profileStateKey = getProfileStateKey(groupId, profileKey);
  const profileState = getOrCreateProfileState(profileStateKey);
  const existingEvents = pendingEvents.filter(e => e.groupId === groupId && e.profileKey === profileKey);
  const modifiedEventSlots = new Set();
  existingEvents
    .filter(e => e.manualOverrides)
    .forEach(event => {
      getPendingSlotKeys(event).forEach(key => modifiedEventSlots.add(key));
    });
  const publishedEventSlots = new Set();
  existingEvents
    .filter(e => e.status === "published")
    .forEach(event => {
      getPendingSlotKeys(event).forEach(key => publishedEventSlots.add(key));
    });
  let anchorMs = getActivationStartMs(profileState);
  if (anchorMs === null) {
    const deletedForProfile = deletedEvents.filter(e => e.groupId === groupId && e.profileKey === profileKey);
    anchorMs = getEarliestEventStartMs(existingEvents) ?? getEarliestEventStartMs(deletedForProfile);
  }
  const nowMs = Date.now();
  return deletedEvents.filter(e => {
    if (e.groupId !== groupId || e.profileKey !== profileKey) {
      return false;
    }
    const eventSlotKeys = getPendingSlotKeys(e);
    if (eventSlotKeys.some(key => modifiedEventSlots.has(key))) {
      return false;
    }
    if (eventSlotKeys.some(key => publishedEventSlots.has(key))) {
      return false;
    }
    const restoreStartMs = getRestoreStartMs(e);
    if (restoreStartMs === null || restoreStartMs <= nowMs) {
      return false;
    }
    if (anchorMs !== null && restoreStartMs <= anchorMs) {
      return false;
    }
    return true;
  }).length;
}

module.exports = {
  isInitialized,
  initializeAutomation,
  setKnownGroupIds,
  loadPendingEvents,
  savePendingEvents,
  loadAutomationState,
  saveAutomationState,
  calculatePendingEvents,
  computePublishTimeMs,
  projectFutureEvents,
  commitProjectedSlot,
  tombstoneProjectedSlot,
  scheduleJob,
  cancelJob,
  cancelAllJobs,
  cancelJobsForProfile,
  purgeProfilePendingEvents,
  executeAutomatedPost,
  handleMissedEvent,
  getPendingEvents,
  getMissedCount,
  getQueuedCount,
  getPendingSettings,
  updatePendingSettings,
  updatePendingEventsForProfile,
  recordManualEvent,
  updatePendingEventOverrides,
  reconcilePublishedEvents,
  getAutomationStatus,
  resetAutomationState,
  resolveEventDetails,
  restoreDeletedEvents,
  getRestorableCount
};
