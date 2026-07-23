import { dom, state, getEventWizard } from "./state.js";
import { showToast, renderSelect, renderChecklist } from "./ui.js";
import { buildTimezones, ensureTimezoneOption, enforceTagsInput, sanitizeText, formatDuration, normalizeDurationInput, parseDurationInput, formatDurationPreview, enforceGroupAccess, getMaxEventDateString, getRateLimitRemainingMs, clearRateLimit, isRateLimitError } from "./utils.js";
import { EVENT_DESCRIPTION_LIMIT, EVENT_NAME_LIMIT, LANGUAGES, PLATFORMS, TAG_LIMIT } from "./config.js";
import { t, getCurrentLanguage, getLanguageDisplayName } from "./i18n/index.js";
import { fetchGroupRoles, renderRoleList } from "./roles.js";
import { updateDiscordVisibility, updateCalendarVisibility, readCalendarRemindersFromDom, renderCalendarReminders } from "./profiles.js";

const EVENT_HOURLY_LIMIT = 10;
const EVENT_HOURLY_WINDOW_MS = 60 * 60 * 1000;
const CREATE_RATE_LIMIT_BASE_KEY = "events:create";

export function updateAdvancedSettingsVisibility({ expand } = {}) {
  const enabled = dom.settingsEnableAdvanced?.checked ?? false;
  if (dom.settingsAdvancedCaret) {
    dom.settingsAdvancedCaret.classList.toggle("is-hidden", !enabled);
  }
  if (dom.settingsAdvancedOptions) {
    if (!enabled) {
      dom.settingsAdvancedOptions.classList.add("is-hidden");
      if (dom.settingsAdvancedCaret) dom.settingsAdvancedCaret.classList.remove("is-expanded");
    } else if (expand === true) {
      dom.settingsAdvancedOptions.classList.remove("is-hidden");
      if (dom.settingsAdvancedCaret) dom.settingsAdvancedCaret.classList.add("is-expanded");
    } else if (expand === false) {
      dom.settingsAdvancedOptions.classList.add("is-hidden");
      if (dom.settingsAdvancedCaret) dom.settingsAdvancedCaret.classList.remove("is-expanded");
    }
    // expand undefined (e.g. on load): panel stays hidden, caret collapsed.
  }
}

export function updateImportExportVisibility() {
  const enabled = dom.settingsEnableImportExport?.checked ?? false;
  if (dom.eventAdvancedSection) {
    dom.eventAdvancedSection.classList.toggle("is-hidden", !enabled);
  }
  if (dom.eventExportSection) {
    dom.eventExportSection.classList.toggle("is-hidden", !enabled);
  }
  if (dom.profileImportExportButtons) {
    dom.profileImportExportButtons.classList.toggle("is-hidden", !enabled);
  }
}

const HOURLY_HISTORY_STORAGE_KEY = "vrc-event-hourly-history-v1";
const CREATED_EVENTS_STORAGE_KEY = "vrc-event-created-ids-v1";
const BACKOFF_SEQUENCE = [2, 4, 8, 16, 32, 60]; // minutes
let roleFetchToken = 0;
let hourlyCountTimer = null;
let createBlockTimer = null;
let hourlyHistoryLoaded = false;
let createdEventIdsLoaded = false;
let conflictResolve = null;
// Per-account, per-group cache of the engine's unified hourly count (manual + automated),
// keyed like the local history so it can't bleed across an account switch. The
// displayed count reflects automation's posts too, not just manual creates.
let engineHourlyCount = {};

/**
 * Resolves with { continue: true } to proceed, or { continue: false, changeTime: true/false }.
 */
function showConflictModal(eventTitle, { unavailable = false } = {}) {
  return new Promise(resolve => {
    conflictResolve = resolve;
    dom.conflictMessage.textContent = unavailable
      ? t("conflict.unavailable")
      : t("conflict.message", { title: eventTitle });
    dom.conflictOverlay.classList.remove("is-hidden");
  });
}

function hideConflictModal() {
  dom.conflictOverlay.classList.add("is-hidden");
}

function handleConflictContinue() {
  const resolve = conflictResolve;
  conflictResolve = null;
  hideConflictModal();
  if (resolve) {
    resolve({ continue: true });
  }
}

function handleConflictChangeTime() {
  const resolve = conflictResolve;
  conflictResolve = null;
  hideConflictModal();
  if (resolve) {
    resolve({ continue: false, changeTime: true });
  }
}

function pruneHistoryEntries(entries) {
  const cutoff = Date.now() - EVENT_HOURLY_WINDOW_MS;
  return entries.filter(entry => entry >= cutoff);
}

function loadHourlyHistory() {
  if (hourlyHistoryLoaded) {
    return;
  }
  hourlyHistoryLoaded = true;
  try {
    const raw = localStorage.getItem(HOURLY_HISTORY_STORAGE_KEY);
    if (!raw) {
      return;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return;
    }
    const normalized = {};
    Object.entries(parsed).forEach(([groupId, entries]) => {
      if (!Array.isArray(entries)) {
        return;
      }
      const cleaned = entries
        .map(entry => Number(entry))
        .filter(entry => Number.isFinite(entry));
      const pruned = pruneHistoryEntries(cleaned);
      if (pruned.length) {
        normalized[groupId] = pruned;
      }
    });
    state.event.hourlyCreateHistory = normalized;
    saveHourlyHistory();
  } catch (err) {
    // Storage errors ignored.
  }
}

function saveHourlyHistory() {
  if (!hourlyHistoryLoaded) {
    return;
  }
  try {
    localStorage.setItem(HOURLY_HISTORY_STORAGE_KEY, JSON.stringify(state.event.hourlyCreateHistory));
  } catch (err) {
    // Storage errors ignored.
  }
}

function ensureHourlyHistoryLoaded() {
  if (!hourlyHistoryLoaded) {
    loadHourlyHistory();
  }
}

function loadCreatedEventIds() {
  if (createdEventIdsLoaded) {
    return;
  }
  createdEventIdsLoaded = true;
  try {
    const raw = localStorage.getItem(CREATED_EVENTS_STORAGE_KEY);
    if (!raw) {
      state.event.createdEventIds = {};
      return;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      state.event.createdEventIds = {};
      return;
    }
    const normalized = {};
    Object.entries(parsed).forEach(([key, entries]) => {
      if (!Array.isArray(entries)) {
        return;
      }
      const pruned = entries.filter(entry => {
        if (!entry || typeof entry !== "object") {
          return false;
        }
        if (!entry.id || !Number.isFinite(entry.timestamp)) {
          return false;
        }
        return entry.timestamp >= (Date.now() - EVENT_HOURLY_WINDOW_MS);
      });
      if (pruned.length) {
        normalized[key] = pruned;
      }
    });
    state.event.createdEventIds = normalized;
    saveCreatedEventIds();
  } catch (err) {
    state.event.createdEventIds = {};
  }
}

function saveCreatedEventIds() {
  if (!createdEventIdsLoaded) {
    return;
  }
  try {
    localStorage.setItem(CREATED_EVENTS_STORAGE_KEY, JSON.stringify(state.event.createdEventIds));
  } catch (err) {
    // Storage errors ignored.
  }
}

function ensureCreatedEventIdsLoaded() {
  if (!createdEventIdsLoaded) {
    loadCreatedEventIds();
  }
}

function recordCreatedEventId(groupId, eventId, timestamp) {
  ensureCreatedEventIdsLoaded();
  const userId = getCurrentUserId();
  if (!userId) {
    return;
  }
  const key = `${userId}::${groupId}`;
  if (!state.event.createdEventIds[key]) {
    state.event.createdEventIds[key] = [];
  }
  const entry = { id: eventId, timestamp };
  state.event.createdEventIds[key].push(entry);
  const cutoff = Date.now() - EVENT_HOURLY_WINDOW_MS;
  state.event.createdEventIds[key] = state.event.createdEventIds[key]
    .filter(e => e.timestamp >= cutoff);
  saveCreatedEventIds();
}

function getCurrentUserId() {
  return state.user?.id || state.user?.userId || null;
}

function getHistoryKey(groupId) {
  ensureHourlyHistoryLoaded();
  if (!groupId) {
    return null;
  }
  const userId = getCurrentUserId();
  if (!userId) {
    return null;
  }
  const key = `${userId}::${groupId}`;
  if (!state.event.hourlyCreateHistory[key] && state.event.hourlyCreateHistory[groupId]) {
    state.event.hourlyCreateHistory[key] = state.event.hourlyCreateHistory[groupId];
    delete state.event.hourlyCreateHistory[groupId];
    saveHourlyHistory();
  }
  return key;
}

function getCreateRateLimitKey(groupId) {
  const userId = getCurrentUserId() || "user";
  const groupKey = groupId || "group";
  return `${CREATE_RATE_LIMIT_BASE_KEY}:${userId}:${groupKey}`;
}

function getRoleLabels() {
  return {
    allAccess: t("events.roleRestrictions.allAccess"),
    managementRoles: t("events.roleRestrictions.managementRoles"),
    roles: t("events.roleRestrictions.roles"),
    noRoles: t("events.roleRestrictions.noRoles")
  };
}

function getHourlyHistory(groupId) {
  ensureHourlyHistoryLoaded();
  const key = getHistoryKey(groupId);
  if (!key) {
    return [];
  }
  if (!state.event.hourlyCreateHistory[key]) {
    state.event.hourlyCreateHistory[key] = [];
  }
  return state.event.hourlyCreateHistory[key];
}

function pruneHourlyHistory(groupId) {
  const key = getHistoryKey(groupId);
  if (!key) {
    return [];
  }
  const history = getHourlyHistory(groupId);
  const next = pruneHistoryEntries(history);
  if (next.length !== history.length) {
    state.event.hourlyCreateHistory[key] = next;
    saveHourlyHistory();
  } else if (state.event.hourlyCreateHistory[key] !== history) {
    state.event.hourlyCreateHistory[key] = history;
  }
  return next;
}

function getHourlyCount(groupId) {
  if (!groupId) {
    return 0;
  }
  const local = pruneHourlyHistory(groupId).length;
  const engine = engineHourlyCount[getHistoryKey(groupId)];
  // Engine tally is the unified truth (manual + automated); prefer it once
  // fetched, else the local manual-only count. max() guards a just-made create
  // that's in local history but not yet re-fetched from the engine.
  return typeof engine === "number" ? Math.max(engine, local) : local;
}

function recordHourlyEvent(groupId, timestamp = Date.now(), eventId = null) {
  if (!groupId || !getCurrentUserId()) {
    return;
  }
  const history = getHourlyHistory(groupId);
  history.push(timestamp);
  pruneHourlyHistory(groupId);
  saveHourlyHistory();
  if (eventId) {
    recordCreatedEventId(groupId, eventId, timestamp);
  }
}

function getEventCreatedAtMs(event) {
  if (!event) {
    return null;
  }
  const value = event.createdAtUtc || event.createdAt || event.created_at || null;
  if (!value) {
    return null;
  }
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

function updateServerHourlyCount(events) {
  // Count all events created in the last hour (any user) for cross-platform detection.
  if (!Array.isArray(events)) {
    state.event.serverHourlyCount = 0;
    return;
  }
  const cutoff = Date.now() - EVENT_HOURLY_WINDOW_MS;
  const count = events.filter(event => {
    const createdAtMs = getEventCreatedAtMs(event);
    return Number.isFinite(createdAtMs) && createdAtMs >= cutoff;
  }).length;
  state.event.serverHourlyCount = count;
}

function getTotalLocalCount(groupId) {
  // Sum events across all users for this group (cross-platform detection).
  ensureHourlyHistoryLoaded();
  if (!groupId) {
    return 0;
  }
  const suffix = `::${groupId}`;
  const cutoff = Date.now() - EVENT_HOURLY_WINDOW_MS;
  let total = 0;
  Object.entries(state.event.hourlyCreateHistory).forEach(([key, entries]) => {
    if (!key.endsWith(suffix)) {
      return;
    }
    if (!Array.isArray(entries)) {
      return;
    }
    total += entries.filter(ts => ts >= cutoff).length;
  });
  return total;
}

function getNextBackoffMinutes() {
  const minutes = BACKOFF_SEQUENCE[state.event.backoffIndex];
  state.event.backoffIndex = (state.event.backoffIndex + 1) % BACKOFF_SEQUENCE.length;
  return minutes;
}

function resetBackoff() {
  state.event.backoffIndex = 0;
}

function getRateLimitMessage(rateLimitInfo) {
  if (!rateLimitInfo) {
    return t("events.unknownRateLimit");
  }
  const { case: rateLimitCase, minutes } = rateLimitInfo;
  if (rateLimitCase === "A") {
    // User hit their 10/hour limit.
    return t("events.upcomingLimitError");
  }
  if (rateLimitCase === "B") {
    // Cross-platform events.
    return t("events.crossPlatformRateLimit", { minutes: minutes || 2 });
  }
  // Case C: unknown hard limit.
  return t("events.unknownRateLimit");
}

function getNextHourlyExpiry(groupId) {
  const history = pruneHourlyHistory(groupId);
  if (!history.length) {
    return null;
  }
  const earliest = Math.min(...history);
  return earliest + EVENT_HOURLY_WINDOW_MS;
}

function getHourlyLimitRemainingMs(groupId) {
  const key = getHistoryKey(groupId);
  if (!key) {
    return 0;
  }
  const until = state.event.hourlyLimitUntil[key] || 0;
  if (!until) {
    return 0;
  }
  const remaining = until - Date.now();
  if (remaining <= 0) {
    delete state.event.hourlyLimitUntil[key];
    return 0;
  }
  return remaining;
}

function setHourlyLimitUntil(groupId, until) {
  const key = getHistoryKey(groupId);
  if (!key || !until) {
    return;
  }
  state.event.hourlyLimitUntil[key] = until;
}

function clearHourlyLimit(groupId) {
  const key = getHistoryKey(groupId);
  if (!key) {
    return;
  }
  delete state.event.hourlyLimitUntil[key];
}

function getCreateBlockRemainingMs(groupId) {
  const hourlyRemaining = getHourlyLimitRemainingMs(groupId);
  const backoffRemaining = getRateLimitRemainingMs(getCreateRateLimitKey(groupId));
  return Math.max(hourlyRemaining, backoffRemaining);
}

function scheduleHourlyCountUpdate(groupId) {
  if (hourlyCountTimer) {
    window.clearTimeout(hourlyCountTimer);
    hourlyCountTimer = null;
  }
  if (!groupId) {
    return;
  }
  const nextExpiry = getNextHourlyExpiry(groupId);
  if (!nextExpiry) {
    return;
  }
  const delayMs = Math.max(0, nextExpiry - Date.now());
  hourlyCountTimer = window.setTimeout(() => {
    renderUpcomingEventCount();
    updateEventCreateDisabled();
  }, delayMs + 50);
}

function scheduleCreateBlockTimer(groupId) {
  if (createBlockTimer) {
    window.clearTimeout(createBlockTimer);
    createBlockTimer = null;
  }
  const remaining = getCreateBlockRemainingMs(groupId);
  if (remaining <= 0) {
    return;
  }
  createBlockTimer = window.setTimeout(() => {
    updateEventCreateDisabled();
  }, remaining + 50);
}

function handleCreateRateLimit(groupId) {
  const userLocalCount = getHourlyCount(groupId);
  const totalLocalCount = getTotalLocalCount(groupId);
  const serverCount = state.event.serverHourlyCount;

  // Case A: user hit their 10/hour limit.
  if (userLocalCount >= EVENT_HOURLY_LIMIT) {
    // Local history can be incomplete when the limit was reached via automation
    // posts we don't track locally, so its expiry is only trustworthy with a full
    // window of local timestamps; otherwise block a full window from now so the
    // button is always throttled after a genuine hard-limit hit.
    const localCount = pruneHourlyHistory(groupId).length;
    const nextExpiry = getNextHourlyExpiry(groupId);
    const until = localCount >= EVENT_HOURLY_LIMIT && nextExpiry
      ? nextExpiry
      : Date.now() + EVENT_HOURLY_WINDOW_MS;
    setHourlyLimitUntil(groupId, until);
    scheduleCreateBlockTimer(groupId);
    return { case: "A", minutes: null };
  }

  // Case B: cross-platform events (totalLocal < server).
  // Case C: unknown hard limit (totalLocal == server but still got 429).
  const isCrossPlatform = totalLocalCount < serverCount;
  const backoffMinutes = getNextBackoffMinutes();
  const blockUntil = Date.now() + (backoffMinutes * 60 * 1000);
  setHourlyLimitUntil(groupId, blockUntil);
  scheduleCreateBlockTimer(groupId);

  return {
    case: isCrossPlatform ? "B" : "C",
    minutes: backoffMinutes
  };
}

function updateEventCreateDisabled() {
  const groupId = dom.eventGroup?.value;
  const isRateLimited = getCreateBlockRemainingMs(groupId) > 0;
  state.event.createBlocked = isRateLimited;
  dom.eventCreate.disabled = !state.user
    || isRateLimited
    || state.event.createInProgress
    || state.app?.updateAvailable;
}

function getGroupName(groupId) {
  if (!groupId) {
    return "";
  }
  const group = state.groups.find(entry => entry.groupId === groupId);
  return group?.name || "";
}

function getDurationUnits() {
  return {
    day: t("common.durationUnits.day"),
    hour: t("common.durationUnits.hour"),
    minute: t("common.durationUnits.minute")
  };
}

function formatPatternDateLabel(option, locale, timezone) {
  if (!option) {
    return "";
  }
  if (!option.iso) {
    return "";
  }
  const resolvedLocale = locale || getCurrentLanguage();
  const resolvedTimezone = timezone || dom.eventTimezone?.value || buildTimezones().systemTz;
  const date = new Date(option.iso);
  let dateLabel = "";
  let timeLabel = "";
  try {
    if (typeof Intl !== "undefined" && typeof Intl.DateTimeFormat === "function") {
      const dateFormatter = new Intl.DateTimeFormat(resolvedLocale, { timeZone: resolvedTimezone, month: "short", day: "2-digit" });
      const timeFormatter = new Intl.DateTimeFormat(resolvedLocale, { timeZone: resolvedTimezone, hour: "numeric", minute: "2-digit" });
      dateLabel = dateFormatter.format(date);
      timeLabel = timeFormatter.format(date);
    } else {
      dateLabel = date.toLocaleDateString(resolvedLocale, { timeZone: resolvedTimezone, month: "short", day: "2-digit" });
      timeLabel = date.toLocaleTimeString(resolvedLocale, { timeZone: resolvedTimezone, hour: "numeric", minute: "2-digit" });
    }
  } catch (err) {
    dateLabel = date.toLocaleDateString();
    timeLabel = date.toLocaleTimeString();
  }

  const weekday = option.weekday || "";
  const weekdayKey = weekday ? `common.weekdays.${weekday}` : "";
  const translatedWeekday = weekdayKey ? t(weekdayKey) : "";
  const weekdayLabel = !weekdayKey || translatedWeekday === weekdayKey ? weekday : translatedWeekday;
  let baseLabel = "";
  if (option.isLast) {
    baseLabel = t("profiles.patterns.format.last", { weekday: weekdayLabel, time: timeLabel });
  } else {
    const ordinalKey = `profiles.patterns.ordinal${option.occurrence}`;
    const ordinal = t(ordinalKey);
    const ordinalLabel = ordinal === ordinalKey ? `${option.occurrence}` : ordinal;
    baseLabel = t("profiles.patterns.format.nth", { ordinal: ordinalLabel, weekday: weekdayLabel, time: timeLabel });
  }

  return t("events.patternDateLabel", { label: baseLabel, date: dateLabel });
}

export function updateEventDurationPreview() {
  if (!dom.eventDurationPreview || !dom.eventDuration) {
    return;
  }
  dom.eventDurationPreview.textContent = formatDurationPreview(dom.eventDuration.value, getDurationUnits());
}

function renderUpcomingEventCount() {
  if (!dom.eventUpcomingCount) {
    return;
  }
  ensureHourlyHistoryLoaded();
  if (dom.eventCountRefresh) {
    dom.eventCountRefresh.disabled = !state.user || !dom.eventGroup.value;
  }
  const groupId = dom.eventGroup.value;
  if (!groupId) {
    dom.eventUpcomingCount.textContent = t("events.upcomingCountUnknown");
    return;
  }
  const groupName = getGroupName(groupId);
  const count = getHourlyCount(groupId);
  state.event.upcomingCount = count;
  dom.eventUpcomingCount.textContent = t("events.upcomingCountStatus", {
    group: groupName || t("events.upcomingCountGroupFallback"),
    count,
    limit: EVENT_HOURLY_LIMIT
  });
  scheduleHourlyCountUpdate(groupId);
}

export async function refreshUpcomingEventCount(api, options = {}) {
  const groupId = dom.eventGroup.value;
  if (!groupId) {
    state.event.upcomingCount = null;
    renderUpcomingEventCount();
    updateEventCreateDisabled();
    return null;
  }
  const useServer = options.useServer !== false;
  if (useServer && api?.listGroupEvents) {
    try {
      const events = await api.listGroupEvents({
        groupId,
        upcomingOnly: true,
        includeNonEditable: true
      });
      // Server count stored for cross-platform detection, not for display.
      updateServerHourlyCount(events);
    } catch (err) {
      // List failure: keep local history.
    }
  }
  // Pull the engine's unified count so the display reflects automation's posts too.
  if (api?.getRateLimitCount) {
    try {
      const engineCount = await api.getRateLimitCount({ groupId });
      if (typeof engineCount === "number") {
        engineHourlyCount[getHistoryKey(groupId)] = engineCount;
      }
    } catch (err) {
      // Keep the last known engine count.
    }
  }
  const count = getHourlyCount(groupId);
  state.event.upcomingCount = count;
  renderUpcomingEventCount();
  updateEventCreateDisabled();
  return count;
}

export function renderUpcomingEventCountLabel() {
  renderUpcomingEventCount();
}

export function updateDateMode(profile) {
  const mode = profile?.dateMode || "manual";
  const hasPatterns = Boolean(profile?.patterns && profile.patterns.length);
  let defaultSource = "manual";
  if (hasPatterns && (mode === "pattern" || mode === "both")) {
    defaultSource = "pattern";
  }
  state.event.dateSource = defaultSource;
  const radios = dom.eventDateSource.querySelectorAll("input[name='date-source']");
  radios.forEach(radio => {
    if (!profile || mode === "manual" || !hasPatterns) {
      radio.checked = radio.value === "manual";
      radio.disabled = radio.value !== "manual";
    } else if (mode === "pattern") {
      radio.checked = radio.value === "pattern";
      radio.disabled = radio.value !== "pattern";
    } else {
      radio.checked = radio.value === defaultSource;
      radio.disabled = false;
    }
  });
  syncDateInputs();
}

export function syncDateInputs() {
  const usePattern = state.event.dateSource === "pattern";
  dom.eventDateOption.disabled = !usePattern;
  dom.eventManualDate.disabled = usePattern;
  dom.eventManualTime.disabled = usePattern;
  if (dom.eventPatternDates) {
    dom.eventPatternDates.hidden = !usePattern;
  }
  if (dom.eventManualFields) {
    dom.eventManualFields.hidden = usePattern;
  }
  dom.eventTimezone.disabled = false;
  dom.eventDuration.disabled = false;
}

export async function updateDateOptions(api, profile) {
  if (!profile) {
    dom.eventDateOption.innerHTML = "";
    dom.eventDateOption.size = 1;
    dom.eventDateHint.textContent = t("events.dateHints.noProfile");
    return { success: true };
  }
  const hasPatterns = Boolean(profile.patterns && profile.patterns.length);
  if (!hasPatterns || profile.dateMode === "manual") {
    dom.eventDateOption.innerHTML = "";
    dom.eventDateOption.size = 1;
    dom.eventDateHint.textContent = t("events.dateHints.manualReady");
    return { success: true };
  }
  try {
    const selectedTimezone = dom.eventTimezone?.value || profile.timezone || buildTimezones().systemTz;
    const options = await api.getDateOptions({
      patterns: profile.patterns,
      monthsAhead: 6,
      timezone: selectedTimezone
    });
    state.event.dateOptions = options || [];
    const locale = getCurrentLanguage();
    renderSelect(dom.eventDateOption, state.event.dateOptions.map(opt => ({
      label: formatPatternDateLabel(opt, locale, selectedTimezone),
      value: opt.iso
    })), t("events.dateOption"));
    dom.eventDateOption.size = 1;
    dom.eventDateHint.textContent = options.length
      ? t("events.dateHints.chooseGenerated")
      : t("events.dateHints.noUpcoming");
    return { success: true };
  } catch (err) {
    dom.eventDateHint.textContent = t("events.dateHints.loadFailed");
    return { success: false, message: t("events.failedToBuildDates") };
  }
}

export function applyManualEventDefaults(options = {}) {
  state.event.profile = null;
  dom.eventProfileClear.disabled = true;
  if (!options.preserve) {
    dom.eventName.value = "";
    dom.eventDescription.value = "";
    dom.eventCategory.value = "hangout";
    if (state.event.tagInput) {
      state.event.tagInput.clear();
    } else {
      dom.eventTags.value = "";
    }
    dom.eventAccess.value = "public";
    enforceGroupAccess(dom.eventAccess, dom.eventGroup.value);
    dom.eventImageId.value = "";
    dom.eventSendNotification.checked = true;
    if (dom.eventFeatured) dom.eventFeatured.checked = false;
    if (dom.eventGroupFair) dom.eventGroupFair.checked = false;
    dom.eventDuration.value = formatDuration(120);
    updateEventDurationPreview();
    const { systemTz } = buildTimezones();
    ensureTimezoneOption(dom.eventTimezone, systemTz);
    dom.eventTimezone.value = systemTz;
    state.event.languages = ["eng"];
    state.event.platforms = ["standalonewindows", "android"];
    state.event.roleIds = [];
    renderEventLanguageList();
    renderEventPlatformList();
    if (dom.eventDiscordSyncCheck) dom.eventDiscordSyncCheck.checked = true;
    if (dom.eventWebhookPostCheck) dom.eventWebhookPostCheck.checked = false;
    if (dom.eventCalendarCreateCheck) dom.eventCalendarCreateCheck.checked = false;
    if (dom.eventCalendarRemindersEnabled) dom.eventCalendarRemindersEnabled.checked = false;
    if (dom.eventCalendarRemindersList) dom.eventCalendarRemindersList.innerHTML = "";
    if (dom.eventWebhookMessageEnabled) dom.eventWebhookMessageEnabled.checked = false;
    if (dom.eventWebhookMessage) dom.eventWebhookMessage.value = "";
    if (dom.eventWebhookImagePath) dom.eventWebhookImagePath.value = "";
    if (dom.eventWebhookMessageInput) dom.eventWebhookMessageInput.classList.add("is-hidden");
  }
  updateDateMode(null);
  updateDateOptions(null, null);
  updateDiscordVisibility();
  updateCalendarVisibility();
}

export async function renderEventRoleRestrictions(api) {
  if (!dom.eventRoleRestrictions || !dom.eventRoleList) {
    return;
  }
  const groupId = dom.eventGroup.value;
  const isGroupAccess = dom.eventAccess.value === "group";
  const shouldShow = Boolean(groupId) && isGroupAccess;
  dom.eventRoleRestrictions.classList.toggle("is-hidden", !shouldShow);
  if (!shouldShow) {
    dom.eventRoleList.innerHTML = "";
    return;
  }
  const labels = getRoleLabels();
  const requestId = ++roleFetchToken;
  dom.eventRoleList.innerHTML = `<div class="hint">${t("common.loading")}</div>`;
  try {
    const roles = await fetchGroupRoles(api, groupId);
    if (requestId !== roleFetchToken) {
      return;
    }
    const validIds = new Set(roles.map(role => role.id));
    state.event.roleIds = (state.event.roleIds || []).filter(id => validIds.has(id));
    renderRoleList({
      container: dom.eventRoleList,
      roles,
      selectedIds: state.event.roleIds,
      labels,
      onChange: next => {
        state.event.roleIds = next;
      }
    });
  } catch (err) {
    dom.eventRoleList.innerHTML = "";
    const empty = document.createElement("div");
    empty.className = "hint";
    empty.textContent = labels.noRoles;
    dom.eventRoleList.appendChild(empty);
  }
}

export function handleEventAccessChange(api) {
  enforceGroupAccess(dom.eventAccess, dom.eventGroup.value);
  void renderEventRoleRestrictions(api);
}

export async function handleEventGroupChange(api) {
  state.event.selectedGroupId = dom.eventGroup.value;
  renderEventProfileOptions(api);
  enforceGroupAccess(dom.eventAccess, dom.eventGroup.value);
  void renderEventRoleRestrictions(api);
  if (dom.eventImportJson) {
    dom.eventImportJson.disabled = !dom.eventGroup.value;
  }
  await refreshUpcomingEventCount(api);
  // Update featured checkbox visibility based on verified groups.
  void updateEventTogglesVisibility(api);
  updateDiscordVisibility();
  updateCalendarVisibility();
}

async function updateEventTogglesVisibility(api) {
  if (!dom.eventFeaturedField || !dom.eventGroupFairField) return;

  const groupId = dom.eventGroup.value;
  if (!groupId) {
    dom.eventFeaturedField.classList.add("is-hidden");
    dom.eventGroupFairField.classList.add("is-hidden");
    return;
  }

  try {
    // Backend checks feature flags; tags are not exposed to renderer.
    const flags = await api.checkFeatureFlags(groupId);

    dom.eventFeaturedField.classList.toggle("is-hidden", !flags.hasFeaturedEvents);
    dom.eventGroupFairField.classList.toggle("is-hidden", !flags.hasGroupFair);

  } catch (err) {
    console.error("Failed to check feature flags:", err);
    dom.eventFeaturedField.classList.add("is-hidden");
    dom.eventGroupFairField.classList.add("is-hidden");
  }
}

export function handleEventProfileChange(api) {
  const groupId = dom.eventGroup.value;
  const profileKey = dom.eventProfile.value;
  if (!groupId) {
    return;
  }
  if (!profileKey || profileKey === "__manual__") {
    state.event.selectedProfileKey = null;
    dom.eventProfileClear.disabled = true;
    applyManualEventDefaults({ preserve: true });
    enforceGroupAccess(dom.eventAccess, groupId);
    void renderEventRoleRestrictions(api);
    return;
  }
  state.event.selectedProfileKey = profileKey;
  dom.eventProfileClear.disabled = false;
  applyProfileToEventForm(groupId, profileKey, api);
}

export function handleDateSourceChange(event) {
  if (!event.target.value) {
    return;
  }
  state.event.dateSource = event.target.value;
  syncDateInputs();
}

export async function handleEventCreate(api) {
  // Rate limiting: prevent rapid event creation.
  if (state.event.createInProgress) {
    showToast(t("events.create.alreadyCreating"), true);
    return { success: false, message: t("events.create.alreadyCreating"), toastShown: true };
  }

  if (state.app?.updateAvailable) {
    const message = t("events.updateRequired");
    showToast(message, true, { duration: 8000 });
    return { success: false, message, toastShown: true };
  }
  const groupId = dom.eventGroup.value;
  const profileKey = dom.eventProfile.value;
  const profile = profileKey && profileKey !== "__manual__"
    ? state.profiles?.[groupId]?.profiles?.[profileKey]
    : null;
  if (!groupId) {
    return { success: false, message: t("common.errors.noGroup") };
  }
  enforceGroupAccess(dom.eventAccess, groupId);
  if (getCreateBlockRemainingMs(groupId) > 0) {
    const message = t("events.upcomingLimitReached");
    showToast(message, true, { duration: 8000 });
    return { success: false, message, toastShown: true };
  }
  if (state.event.tagInput) {
    state.event.tagInput.commit();
  }
  const tags = state.event.tagInput
    ? state.event.tagInput.getTags()
    : enforceTagsInput(dom.eventTags, TAG_LIMIT, true);

  if (dom.eventGroupFair?.checked) {
    if (!tags.includes("vrc_event_group_fair")) {
      tags.push("vrc_event_group_fair");
    }
  }

  const dateSource = state.event.dateSource;
  let selectedDateIso = null;
  let manualDate = null;
  let manualTime = null;
  if (dateSource === "pattern") {
    if (!profile) {
      return { success: false, message: t("events.selectProfileOrManual") };
    }
    selectedDateIso = dom.eventDateOption.value;
    if (!selectedDateIso) {
      return { success: false, message: t("events.selectDateError") };
    }
    const patternDateTime = new Date(selectedDateIso);
    if (patternDateTime < new Date()) {
      return { success: false, message: t("events.cannotCreatePast") };
    }
  } else {
    manualDate = dom.eventManualDate.value;
    manualTime = dom.eventManualTime.value;
    if (!manualDate || !manualTime) {
      return { success: false, message: t("events.selectDateError") };
    }
    const maxDate = getMaxEventDateString();
    if (manualDate > maxDate) {
      return { success: false, message: t("events.futureDateError") };
    }
    const manualDateTime = new Date(`${manualDate}T${manualTime}`);
    const now = new Date();
    if (manualDateTime < now) {
      return { success: false, message: t("events.cannotCreatePast") };
    }
  }
  let durationMinutes = parseDurationInput(dom.eventDuration.value)?.minutes ?? null;
  if (!durationMinutes) {
    const fallback = typeof profile?.duration === "number" ? profile.duration : 120;
    durationMinutes = normalizeDurationInput(dom.eventDuration, fallback);
    updateEventDurationPreview();
  }
  if (!durationMinutes || durationMinutes < 1) {
    return { success: false, message: t("common.errors.durationError") };
  }
  const timezone = dom.eventTimezone.value || profile?.timezone || buildTimezones().systemTz;
  const title = sanitizeText(dom.eventName.value, {
    maxLength: EVENT_NAME_LIMIT,
    allowNewlines: false,
    trim: true
  });
  dom.eventName.value = title;
  const description = sanitizeText(dom.eventDescription.value, {
    maxLength: EVENT_DESCRIPTION_LIMIT,
    allowNewlines: true,
    trim: true
  });
  dom.eventDescription.value = description;
  const eventData = {
    title,
    description,
    category: dom.eventCategory.value,
    accessType: dom.eventAccess.value,
    languages: state.event.languages.slice(),
    platforms: state.event.platforms.slice(),
    tags,
    imageId: dom.eventImageId.value.trim() || null,
    sendCreationNotification: Boolean(dom.eventSendNotification.checked),
    featured: Boolean(dom.eventFeatured?.checked),
    discordSync: dom.eventDiscordSyncCheck ? dom.eventDiscordSyncCheck.checked : true,
    webhookPost: dom.eventWebhookPostCheck ? dom.eventWebhookPostCheck.checked : false,
    calendarCreate: dom.eventCalendarCreateCheck ? dom.eventCalendarCreateCheck.checked : false,
    calendarRemindersEnabled: dom.eventCalendarRemindersEnabled ? dom.eventCalendarRemindersEnabled.checked : false,
    calendarReminders: readCalendarRemindersFromDom(dom.eventCalendarRemindersList),
    webhookMessageEnabled: dom.eventWebhookMessageEnabled ? dom.eventWebhookMessageEnabled.checked : false,
    webhookMessage: dom.eventWebhookMessage ? dom.eventWebhookMessage.value : "",
    webhookImagePath: dom.eventWebhookImagePath ? dom.eventWebhookImagePath.value : ""
  };
  if (eventData.accessType === "group") {
    eventData.roleIds = (state.event.roleIds || []).filter(id => typeof id === "string" && id.trim());
  }
  if (eventData.languages.length > 3) {
    return { success: false, message: t("common.errors.maxLanguages") };
  }
  if (!eventData.title) {
    return { success: false, message: t("common.errors.requiredSingle", { field: t("common.fields.eventName") }) };
  }
  if (!eventData.description) {
    return { success: false, message: t("common.errors.requiredSingle", { field: t("common.fields.description") }) };
  }

  // If conflict warnings are on, lock button immediately to prevent race conditions.
  const warnConflicts = dom.eventWarnConflicts?.checked ?? false;
  if (warnConflicts) {
    state.event.createInProgress = true;
    updateEventCreateDisabled();
  }

  try {
    const prep = await api.prepareEvent({
      groupId,
      timezone,
      durationMinutes,
      selectedDateIso,
      manualDate,
      manualTime
    });

    if (prep.conflictEvent && warnConflicts) {
      const unavailable = prep.conflictEvent.unavailable === true;
      let conflictResult;
      try {
        conflictResult = await showConflictModal(prep.conflictEvent.title, { unavailable });
      } catch (modalErr) {
        state.event.createInProgress = false;
        updateEventCreateDisabled();
        console.error("Conflict modal error:", modalErr);
        return { success: false, message: t("events.failed") };
      }

      if (!conflictResult || !conflictResult.continue) {
        state.event.createInProgress = false;
        updateEventCreateDisabled();
        if (conflictResult?.changeTime) {
          // Navigate back to date selection step (step index 1).
          const wizard = getEventWizard();
          if (wizard) {
            wizard.goTo(1);
          }
        }
        return { success: false, message: t("events.failed") };
      }
    }

    // Warnings off: lock button now, after conflict check completed.
    if (!warnConflicts) {
      state.event.createInProgress = true;
      updateEventCreateDisabled();
    }
    const result = await api.createEvent({
      groupId,
      startsAtUtc: prep.startsAtUtc,
      endsAtUtc: prep.endsAtUtc,
      eventData,
      profileKey: profileKey && profileKey !== "__manual__" ? profileKey : null
    });
    if (!result?.ok) {
      const rawMessage = result?.error?.message || "";

      if (isRateLimitError(result?.error)) {
        state.event.createInProgress = false;
        const rateLimitInfo = handleCreateRateLimit(groupId);
        updateEventCreateDisabled();
        const message = getRateLimitMessage(rateLimitInfo);
        showToast(message, true, { duration: 8000 });
        return { success: false, message, toastShown: true };
      }

      state.event.createInProgress = false;
      updateEventCreateDisabled();

      if (rawMessage === "FEATURED_PERMISSION_REVOKED") {
        const message = t("events.featuredPermissionRevoked");
        showToast(message, true);
        return { success: false, message, toastShown: true };
      }

      if (rawMessage === "GROUP_FAIR_PERMISSION_REVOKED") {
        const message = t("events.groupFairPermissionRevoked");
        showToast(message, true);
        return { success: false, message, toastShown: true };
      }

      return { success: false, message: rawMessage || "Could not create event." };
    }
    clearRateLimit(getCreateRateLimitKey(groupId));
    clearHourlyLimit(groupId);
    resetBackoff();
    recordHourlyEvent(groupId, Date.now(), result.eventId);
    state.event.createInProgress = false;
    updateEventCreateDisabled();
    const count = await refreshUpcomingEventCount(api, { useServer: false });
    const groupName = getGroupName(groupId) || t("events.upcomingCountGroupFallback");
    const message = typeof count === "number"
      ? t("events.upcomingCountToast", { group: groupName, count, limit: EVENT_HOURLY_LIMIT })
      : t("events.created");
    return { success: true, message };
  } catch (err) {
    const rawMessage = err?.message || "";
    const status = err?.status || err?.response?.status || null;
    const isFeaturedPermissionError = Boolean(eventData.featured)
      && (status === 403 || /featured event/i.test(rawMessage));
    if (isRateLimitError(err)) {
      state.event.createInProgress = false;
      const rateLimitInfo = handleCreateRateLimit(groupId);
      updateEventCreateDisabled();
      const message = getRateLimitMessage(rateLimitInfo);
      showToast(message, true, { duration: 8000 });
      return { success: false, message, toastShown: true };
    }
    state.event.createInProgress = false;
    updateEventCreateDisabled();
    if (isFeaturedPermissionError) {
      const message = t("settings.featuredVerification.permissionDenied");
      showToast(message, true);
      return { success: false, message, toastShown: true };
    }
    return { success: false, message: rawMessage || "Could not create event." };
  }
}

export function renderEventProfileOptions(api) {
  const groupId = dom.eventGroup.value || state.event.selectedGroupId;
  if (!groupId) {
    dom.eventProfile.innerHTML = "";
    state.event.selectedProfileKey = null;
    applyManualEventDefaults({ preserve: true });
    return;
  }
  const profiles = state.profiles[groupId]?.profiles || {};
  const profileKeys = Object.keys(profiles);
  const options = [
    { label: t("events.manualProfileOption"), value: "__manual__" },
    ...profileKeys.map(key => ({
      label: getProfileLabel(key, profiles[key]),
      value: key
    }))
  ];
  renderSelect(dom.eventProfile, options);
  const current = state.event.selectedProfileKey;
  const nextValue = current && profileKeys.includes(current) ? current : "__manual__";
  dom.eventProfile.value = nextValue;
  dom.eventProfileClear.disabled = nextValue === "__manual__";
  if (nextValue === "__manual__") {
    state.event.selectedProfileKey = null;
    applyManualEventDefaults({ preserve: true });
  } else {
    state.event.selectedProfileKey = nextValue;
    applyProfileToEventForm(groupId, nextValue, api);
  }
}

export function renderEventLanguageList() {
  renderChecklist(dom.eventLanguageList, LANGUAGES, state.event.languages, {
    max: 3,
    filterText: dom.eventLanguageFilter.value,
    getLabel: item => getLanguageDisplayName(item.value, item.label),
    onChange: next => {
      state.event.languages = next;
      renderEventLanguageList();
      dom.eventLanguageHint.textContent = t("common.fields.languagesHint", { count: next.length });
    }
  });
  dom.eventLanguageHint.textContent = t("common.fields.languagesHint", { count: state.event.languages.length });
}

export function renderEventPlatformList() {
  renderChecklist(dom.eventPlatformList, PLATFORMS, state.event.platforms, {
    onChange: next => {
      state.event.platforms = next;
      renderEventPlatformList();
    }
  });
}

export function applyProfileToEventForm(groupId, profileKey, api) {
  const profile = state.profiles?.[groupId]?.profiles?.[profileKey];
  if (!profile) {
    return;
  }
  state.event.profile = profile;
  dom.eventName.value = profile.name || "";
  dom.eventDescription.value = profile.description || "";
  dom.eventCategory.value = profile.category || "hangout";
  if (state.event.tagInput) {
    state.event.tagInput.setTags(profile.tags || []);
  } else {
    dom.eventTags.value = (profile.tags || []).join(", ");
  }
  dom.eventAccess.value = profile.accessType || "public";
  enforceGroupAccess(dom.eventAccess, groupId);
  state.event.roleIds = Array.isArray(profile.roleIds) ? profile.roleIds.slice() : [];
  dom.eventImageId.value = profile.imageId || "";
  dom.eventSendNotification.checked = Boolean(profile.sendNotification);
  if (dom.eventFeatured) dom.eventFeatured.checked = Boolean(profile.featured);
  dom.eventDuration.value = formatDuration(profile.duration || 120);
  updateEventDurationPreview();
  const timezone = profile.timezone || buildTimezones().systemTz;
  ensureTimezoneOption(dom.eventTimezone, timezone);
  dom.eventTimezone.value = timezone;
  state.event.languages = profile.languages ? profile.languages.slice() : [];
  state.event.platforms = profile.platforms ? profile.platforms.slice() : [];
  renderEventLanguageList();
  renderEventPlatformList();
  updateDateMode(profile);
  updateDateOptions(api, profile);
  void renderEventRoleRestrictions(api);
  if (dom.eventDiscordSyncCheck) {
    dom.eventDiscordSyncCheck.checked = profile.discordSync === true;
  }
  if (dom.eventWebhookPostCheck) {
    dom.eventWebhookPostCheck.checked = profile.webhookPost === true;
  }
  if (dom.eventCalendarCreateCheck) {
    dom.eventCalendarCreateCheck.checked = profile.calendarSync === true;
  }
  if (dom.eventCalendarRemindersEnabled) {
    dom.eventCalendarRemindersEnabled.checked = profile.calendarRemindersEnabled === true;
  }
  renderCalendarReminders(dom.eventCalendarRemindersList, profile.calendarReminders || []);
  if (dom.eventWebhookMessageEnabled) {
    dom.eventWebhookMessageEnabled.checked = profile.webhookMessageEnabled === true;
  }
  if (dom.eventWebhookMessage) {
    dom.eventWebhookMessage.value = profile.webhookMessage || "";
  }
  if (dom.eventWebhookImagePath) {
    dom.eventWebhookImagePath.value = profile.webhookImagePath || "";
  }
  if (dom.eventWebhookMessageInput) {
    dom.eventWebhookMessageInput.classList.toggle("is-hidden", !profile.webhookMessageEnabled);
  }
  updateDiscordVisibility();
  updateCalendarVisibility();
}

function getProfileLabel(profileKey, profile) {
  const label = (profile?.displayName || "").trim();
  return label || profileKey;
}

const VALID_CATEGORIES = ["hangout", "exploration", "roleplaying", "film_media", "gaming", "music", "dance", "performance", "arts", "avatars", "education", "wellness", "other"];
const VALID_ACCESS_TYPES = ["public", "group"];

export async function applyImportedJsonToEventForm(data, api) {
  if (!data || typeof data !== "object") {
    return { success: false, message: t("common.errors.invalidJson") };
  }

  // Reject profile JSON imported into the event flow.
  if (data.displayName !== undefined || data.patterns !== undefined || data.automation !== undefined) {
    return { success: false, message: t("events.importWrongType") };
  }

  // If imageId resolves in the user's gallery, keep it; otherwise upload base64.
  const autoUpload = dom.settingsAutoUploadImages?.checked ?? false;
  if (data.imageId && typeof data.imageId === "string") {
    try {
      const imageExists = await api.checkGalleryImageExists(data.imageId);
      if (!imageExists && autoUpload && data.imageBase64 && typeof data.imageBase64 === "string") {
        const uploadResult = await api.uploadGalleryImageBase64(data.imageBase64);
        if (uploadResult?.ok && uploadResult?.data?.id) {
          data.imageId = uploadResult.data.id;
        }
      }
    } catch (imgErr) {
      console.warn("Could not check/upload imported image:", imgErr);
    }
  } else if (autoUpload && data.imageBase64 && typeof data.imageBase64 === "string") {
    // No imageId, upload base64 directly.
    try {
      const uploadResult = await api.uploadGalleryImageBase64(data.imageBase64);
      if (uploadResult?.ok && uploadResult?.data?.id) {
        data.imageId = uploadResult.data.id;
      }
    } catch (imgErr) {
      console.warn("Could not upload imported image:", imgErr);
    }
  }

  dom.eventName.value = (data.title && typeof data.title === "string")
    ? sanitizeText(data.title, {
        maxLength: EVENT_NAME_LIMIT,
        allowNewlines: false,
        trim: true
      })
    : "";

  dom.eventDescription.value = (data.description && typeof data.description === "string")
    ? sanitizeText(data.description, {
        maxLength: EVENT_DESCRIPTION_LIMIT,
        allowNewlines: true,
        trim: true
      })
    : "";

  if (data.category && typeof data.category === "string" && VALID_CATEGORIES.includes(data.category)) {
    dom.eventCategory.value = data.category;
  } else {
    dom.eventCategory.value = VALID_CATEGORIES[0] || "";
  }

  const tags = Array.isArray(data.tags)
    ? data.tags.filter(t => typeof t === "string").slice(0, TAG_LIMIT)
    : [];
  if (state.event.tagInput) {
    state.event.tagInput.setTags(tags);
  } else {
    dom.eventTags.value = tags.join(", ");
  }

  if (data.accessType && typeof data.accessType === "string" && VALID_ACCESS_TYPES.includes(data.accessType)) {
    dom.eventAccess.value = data.accessType;
  } else {
    dom.eventAccess.value = VALID_ACCESS_TYPES[0] || "public";
  }
  const groupId = dom.eventGroup.value;
  if (groupId) {
    enforceGroupAccess(dom.eventAccess, groupId);
  }

  state.event.roleIds = Array.isArray(data.roleIds)
    ? data.roleIds.filter(id => typeof id === "string" && id.trim())
    : [];

  dom.eventImageId.value = (data.imageId && typeof data.imageId === "string")
    ? data.imageId.trim()
    : "";

  dom.eventSendNotification.checked = typeof data.sendNotification === "boolean"
    ? data.sendNotification
    : false;

  if (dom.eventFeatured) {
    dom.eventFeatured.checked = typeof data.featured === "boolean"
      ? data.featured
      : false;
  }

  if (typeof data.duration === "number" && data.duration > 0) {
    dom.eventDuration.value = formatDuration(data.duration);
  } else {
    dom.eventDuration.value = formatDuration(120); // default 2 hours
  }
  updateEventDurationPreview();

  // Timezone: keep current if invalid/missing.
  if (data.timezone && typeof data.timezone === "string") {
    ensureTimezoneOption(dom.eventTimezone, data.timezone);
    dom.eventTimezone.value = data.timezone;
  }

  // Languages/platforms: only update when valid non-empty values are provided.
  if (Array.isArray(data.languages)) {
    const validLanguages = data.languages.filter(l => typeof l === "string" && l.trim()).slice(0, 3);
    if (validLanguages.length > 0) {
      state.event.languages = validLanguages;
      renderEventLanguageList();
    }
  }

  if (Array.isArray(data.platforms)) {
    const validPlatforms = data.platforms.filter(p => typeof p === "string" && p.trim());
    if (validPlatforms.length > 0) {
      state.event.platforms = validPlatforms;
      renderEventPlatformList();
    }
  }

  if (data.date && typeof data.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
    dom.eventManualDate.value = data.date;
  } else {
    dom.eventManualDate.value = "";
  }

  if (data.time && typeof data.time === "string" && /^\d{2}:\d{2}$/.test(data.time)) {
    dom.eventManualTime.value = data.time;
  } else {
    dom.eventManualTime.value = "";
  }

  void renderEventRoleRestrictions(api);

  return { success: true };
}

export async function handleEventImportJson(api) {
  try {
    const result = await api.importEventJson();
    if (!result) {
      return { success: false, message: t("common.errors.importFailed") };
    }
    if (result.cancelled) {
      return { success: false, cancelled: true };
    }
    if (!result.ok) {
      const errorMessage = result.error?.message || t("common.errors.couldNotImportJson");
      return { success: false, message: errorMessage };
    }
    return await applyImportedJsonToEventForm(result.data, api);
  } catch (err) {
    return { success: false, message: err.message || t("common.errors.importFailed") };
  }
}

export async function handleEventExportJson(api) {
  try {
    const tags = state.event.tagInput?.getTags?.() ||
      dom.eventTags.value.split(",").map(t => t.trim()).filter(Boolean);

    const durationMinutes = parseDurationInput(dom.eventDuration.value);

    const exportData = {
      title: dom.eventName.value.trim(),
      description: dom.eventDescription.value.trim(),
      category: dom.eventCategory.value,
      tags: tags.slice(0, TAG_LIMIT),
      accessType: dom.eventAccess.value,
      roleIds: state.event.roleIds || [],
      imageId: dom.eventImageId.value.trim(),
      sendNotification: dom.eventSendNotification.checked,
      duration: durationMinutes || 120,
      timezone: dom.eventTimezone.value,
      languages: state.event.languages || [],
      platforms: state.event.platforms || [],
      date: dom.eventManualDate.value || "",
      time: dom.eventManualTime.value || ""
    };

    // Include base64 image when imageId is set (fetches from gallery if not cached).
    // imageId is kept in the export so the importer can check for an existing copy.
    if (exportData.imageId) {
      try {
        const imageData = await api.getImageAsBase64(exportData.imageId);
        if (imageData) {
          exportData.imageBase64 = imageData;
        }
      } catch (imgErr) {
        console.warn("Could not include image in export:", imgErr);
      }
    }

    const result = await api.exportEventJson(exportData);
    if (!result) {
      return { success: false, message: t("common.errors.exportFailed") };
    }
    if (result.cancelled) {
      return { success: false, cancelled: true };
    }
    if (!result.ok) {
      return { success: false, message: result.error?.message || "Could not export JSON file." };
    }
    return { success: true };
  } catch (err) {
    return { success: false, message: err.message || t("common.errors.exportFailed") };
  }
}

if (dom.conflictContinue) {
  dom.conflictContinue.addEventListener("click", handleConflictContinue);
}
if (dom.conflictChangeTime) {
  dom.conflictChangeTime.addEventListener("click", handleConflictChangeTime);
}
