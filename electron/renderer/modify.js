import { dom, state } from "./state.js";
import { renderSelect, renderChecklist, showToast } from "./ui.js";
import { buildTimezones, ensureTimezoneOption, createTagInput, enforceTagsInput, sanitizeText, formatDuration, normalizeDurationInput, parseDurationInput, sanitizeDurationInputValue, formatDurationPreview, enforceGroupAccess, getTodayDateString, getMaxEventDateString, getRateLimitRemainingMs, registerRateLimit, clearRateLimit, isRateLimitError, getTimeZoneAbbr } from "./utils.js";
import { ACCESS_TYPES, CATEGORIES, EVENT_DESCRIPTION_LIMIT, EVENT_NAME_LIMIT, LANGUAGES, PLATFORMS, TAG_LIMIT } from "./config.js";
import { t, getLanguageDisplayName } from "./i18n/index.js";
import { fetchGroupRoles, renderRoleList } from "./roles.js";
import { isGroupDiscordConfigured, isGroupWebhookConfigured, isGroupKitActive, renderCalendarReminders, readCalendarRemindersFromDom } from "./profiles.js";

const HOLD_DURATION_MS = 2000;
const MODIFY_RATE_LIMIT_KEYS = {
  update: "events:update",
  delete: "events:delete",
  refresh: "events:refresh"
};
const REFRESH_BACKOFF_SEQUENCE = [2000, 5000, 10000, 20000, 40000, 60000]; // 2s, 5s, 10s, 20s, 40s, 60s.
const REFRESH_DEDUP_MS = 3000;
let modifyApi = null;

const modifyImageDataUrlCache = new Map();

async function loadCachedImageForElement(imgElement, imageId, fallbackUrl) {
  if (!imageId || !modifyApi?.getCachedImage) return;

  if (modifyImageDataUrlCache.has(imageId)) {
    imgElement.src = modifyImageDataUrlCache.get(imageId);
    return;
  }

  try {
    const dataUrl = await modifyApi.getCachedImage(imageId);
    if (dataUrl) {
      modifyImageDataUrlCache.set(imageId, dataUrl);
      imgElement.src = dataUrl;
    }
  } catch {
    // Silent fail; image continues using remote URL.
  }
}

function extractImageIdFromUrl(url) {
  if (!url) return null;
  // VRChat file URLs contain file IDs like "file_abc123".
  const match = url.match(/file_[a-zA-Z0-9-]+/);
  return match ? match[0] : null;
}

function getImageIdForEvent(event) {
  return event?.imageId || extractImageIdFromUrl(event?.imageUrl);
}

function getEventSlotKey(event) {
  const start = event?.startsAtUtc || event?.eventStartsAt;
  if (!event?.groupId || !start) {
    return null;
  }
  return `${event.groupId}::${start}`;
}

function buildOptimisticEvent(pendingEvent, details, eventId) {
  const resolved = details || pendingEvent?.resolvedDetails || {};
  const startsAtUtc = pendingEvent?.eventStartsAt || resolved.eventStartsAt || null;
  const durationMinutes = Number(
    resolved.durationMinutes ?? resolved.duration ?? pendingEvent?.manualOverrides?.durationMinutes ?? 120
  );
  const endsAtUtc = startsAtUtc
    ? new Date(Date.parse(startsAtUtc) + (durationMinutes * 60 * 1000)).toISOString()
    : null;
  const baseId = pendingEvent?.id ? `optimistic_${pendingEvent.id}` : `optimistic_${Date.now()}`;
  return {
    id: eventId || baseId,
    eventId: eventId || null,
    groupId: pendingEvent?.groupId || "",
    title: resolved.title || "",
    description: resolved.description || "",
    category: resolved.category || "hangout",
    accessType: resolved.accessType || "public",
    tags: Array.isArray(resolved.tags) ? resolved.tags : [],
    imageId: resolved.imageId || null,
    imageUrl: resolved.imageUrl || null,
    roleIds: Array.isArray(resolved.roleIds) ? resolved.roleIds : [],
    languages: Array.isArray(resolved.languages) ? resolved.languages : [],
    platforms: Array.isArray(resolved.platforms) ? resolved.platforms : [],
    startsAtUtc,
    endsAtUtc,
    timezone: resolved.timezone || "UTC",
    isOptimistic: true,
    sourcePendingId: pendingEvent?.id || null,
    optimisticCreatedAt: Date.now()
  };
}

function upsertOptimisticEvent(pendingEvent, details, eventId) {
  if (!pendingEvent?.id) {
    return;
  }
  const existing = state.modify.optimisticEvents.get(pendingEvent.id);
  const nextEvent = buildOptimisticEvent(pendingEvent, details, eventId || existing?.event?.eventId);
  const createdAt = existing?.createdAt || Date.now();
  state.modify.optimisticEvents.set(pendingEvent.id, {
    event: { ...nextEvent, optimisticCreatedAt: createdAt },
    createdAt
  });
}

function collectOptimisticEntriesForEvent(event) {
  const matches = [];
  if (!event || !state.modify.optimisticEvents.size) {
    return matches;
  }
  const seen = new Set();
  const eventSlotKey = getEventSlotKey(event);

  if (event?.sourcePendingId && state.modify.optimisticEvents.has(event.sourcePendingId)) {
    const entry = state.modify.optimisticEvents.get(event.sourcePendingId);
    if (entry) {
      seen.add(event.sourcePendingId);
      matches.push({ pendingId: event.sourcePendingId, entry });
    }
  }

  for (const [pendingId, entry] of state.modify.optimisticEvents.entries()) {
    if (seen.has(pendingId)) {
      continue;
    }
    const optimistic = entry?.event;
    if (!optimistic) {
      continue;
    }
    if (optimistic.eventId && event.id && optimistic.eventId === event.id) {
      seen.add(pendingId);
      matches.push({ pendingId, entry });
      continue;
    }
    if (optimistic.id && event.id && optimistic.id === event.id) {
      seen.add(pendingId);
      matches.push({ pendingId, entry });
      continue;
    }
    if (eventSlotKey && eventSlotKey === getEventSlotKey(optimistic)) {
      seen.add(pendingId);
      matches.push({ pendingId, entry });
    }
  }
  return matches;
}

function removeOptimisticEntriesForEvent(event) {
  const removed = [];
  const matches = collectOptimisticEntriesForEvent(event);
  matches.forEach(({ pendingId, entry }) => {
    state.modify.optimisticEvents.delete(pendingId);
    removed.push({ pendingId, entry });
  });
  return removed;
}

function reconcileOptimisticEvents(realEvents, pendingEvents, groupId) {
  if (!state.modify.optimisticEvents.size) {
    return;
  }
  const realIds = new Set(realEvents.map(event => event.id).filter(Boolean));
  const realSlots = new Set(realEvents.map(getEventSlotKey).filter(Boolean));
  const pendingById = new Map((pendingEvents || []).map(event => [event.id, event]));
  for (const [pendingId, entry] of state.modify.optimisticEvents.entries()) {
    const event = entry.event;
    if (event.groupId && event.groupId !== groupId) {
      state.modify.optimisticEvents.delete(pendingId);
      continue;
    }
    if (event.eventId && realIds.has(event.eventId)) {
      state.modify.optimisticEvents.delete(pendingId);
      continue;
    }
    if (event.id && realIds.has(event.id)) {
      state.modify.optimisticEvents.delete(pendingId);
      continue;
    }
    const slotKey = getEventSlotKey(event);
    if (slotKey && realSlots.has(slotKey)) {
      state.modify.optimisticEvents.delete(pendingId);
      continue;
    }
    const pending = pendingById.get(pendingId);
    if (pending && (pending.status === "queued" || pending.status === "missed")) {
      state.modify.optimisticEvents.delete(pendingId);
      continue;
    }
  }
}
let roleFetchToken = 0;
let refreshButtonTimer = null;

function getGroupName(groupId) {
  if (!groupId) {
    return "";
  }
  const group = state.groups.find(entry => entry.groupId === groupId || entry.id === groupId);
  return group?.name || "";
}

function getDurationUnits() {
  return {
    day: t("common.durationUnits.day"),
    hour: t("common.durationUnits.hour"),
    minute: t("common.durationUnits.minute")
  };
}

function applyRefreshBackoff() {
  const backoffMs = REFRESH_BACKOFF_SEQUENCE[state.modify.refreshBackoffIndex];
  state.modify.refreshBackoffUntil = Date.now() + backoffMs;
  state.modify.refreshBackoffIndex = Math.min(
    state.modify.refreshBackoffIndex + 1,
    REFRESH_BACKOFF_SEQUENCE.length - 1
  );
  updateRefreshButtonState();
}

function clearRefreshBackoff() {
  state.modify.refreshBackoffUntil = 0;
  state.modify.refreshBackoffIndex = 0;
  updateRefreshButtonState();
}

function updateRefreshButtonState() {
  if (!dom.modifyRefresh) {
    return;
  }

  const now = Date.now();
  const backoffRemainingMs = Math.max(0, state.modify.refreshBackoffUntil - now);
  const dedupRemainingMs = Math.max(0, (state.modify.lastRefreshTime + REFRESH_DEDUP_MS) - now);
  const remainingMs = Math.max(backoffRemainingMs, dedupRemainingMs);

  if (remainingMs > 0) {
    const seconds = Math.ceil(remainingMs / 1000);
    dom.modifyRefresh.textContent = `${t("common.refresh")} (${seconds}s)`;
    dom.modifyRefresh.disabled = true;

    if (refreshButtonTimer) {
      clearTimeout(refreshButtonTimer);
    }

    refreshButtonTimer = setTimeout(updateRefreshButtonState, 1000);
  } else {
    dom.modifyRefresh.textContent = t("common.refresh");
    dom.modifyRefresh.disabled = state.modify.loading;

    if (refreshButtonTimer) {
      clearTimeout(refreshButtonTimer);
      refreshButtonTimer = null;
    }
  }
}

async function handleRefreshClick() {
  const now = Date.now();

  if (state.modify.refreshBackoffUntil > now) {
    updateRefreshButtonState();
    return;
  }

  const timeSinceLastRefresh = now - state.modify.lastRefreshTime;
  if (timeSinceLastRefresh < REFRESH_DEDUP_MS) {
    updateRefreshButtonState();
    return;
  }

  state.modify.lastRefreshTime = now;

  try {
    await refreshModifyEvents(modifyApi, { bypassCache: true });
    clearRefreshBackoff();
  } catch (err) {
    if (isRateLimitError(err)) {
      applyRefreshBackoff();
      showToast(t("common.rateLimitError"), true, { duration: 8000 });
    }
  }
}

export function updateModifyDurationPreview() {
  if (!dom.modifyEventDurationPreview || !dom.modifyEventDuration) {
    return;
  }
  dom.modifyEventDurationPreview.textContent = formatDurationPreview(dom.modifyEventDuration.value, getDurationUnits());
}

function getRoleLabels() {
  return {
    allAccess: t("events.roleRestrictions.allAccess"),
    managementRoles: t("events.roleRestrictions.managementRoles"),
    roles: t("events.roleRestrictions.roles"),
    noRoles: t("events.roleRestrictions.noRoles")
  };
}

async function renderModifyRoleRestrictions() {
  if (!dom.modifyRoleRestrictions || !dom.modifyRoleList) {
    return;
  }
  const groupId = state.modify.selectedEvent?.groupId || dom.modifyGroup?.value;
  const isGroupAccess = dom.modifyEventAccess?.value === "group";
  const shouldShow = Boolean(groupId) && isGroupAccess;
  dom.modifyRoleRestrictions.classList.toggle("is-hidden", !shouldShow);
  if (!shouldShow) {
    dom.modifyRoleList.innerHTML = "";
    return;
  }
  const labels = getRoleLabels();
  const requestId = ++roleFetchToken;
  dom.modifyRoleList.innerHTML = `<div class="hint">${t("common.loading")}</div>`;
  try {
    const roles = await fetchGroupRoles(modifyApi, groupId);
    if (requestId !== roleFetchToken) {
      return;
    }
    const validIds = new Set(roles.map(role => role.id));
    state.modify.roleIds = (state.modify.roleIds || []).filter(id => validIds.has(id));
    renderRoleList({
      container: dom.modifyRoleList,
      roles,
      selectedIds: state.modify.roleIds,
      labels,
      onChange: next => {
        state.modify.roleIds = next;
      }
    });
  } catch (err) {
    dom.modifyRoleList.innerHTML = "";
    const empty = document.createElement("div");
    empty.className = "hint";
    empty.textContent = labels.noRoles;
    dom.modifyRoleList.appendChild(empty);
  }
}

function handleModifyAccessChange() {
  enforceGroupAccess(dom.modifyEventAccess, state.modify.selectedEvent?.groupId || dom.modifyGroup?.value);
  void renderModifyRoleRestrictions();
}

function getGroupBanner(groupId) {
  const group = state.groups.find(entry => entry.groupId === groupId || entry.id === groupId);
  if (!group) {
    return null;
  }
  return group.bannerUrl
    || group.bannerImageUrl
    || group.iconUrl
    || group.iconImageUrl
    || null;
}

function setModifyLoading(loading) {
  state.modify.loading = loading;
  if (dom.modifyRefresh) {
    dom.modifyRefresh.disabled = loading || !state.user;
  }
}

function formatDateParts(value, timeZone) {
  if (!value) {
    return { date: "", time: "" };
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { date: "", time: "" };
  }
  const dateParts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const timeParts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);
  const lookup = (parts, type) => parts.find(part => part.type === type)?.value || "";
  const year = lookup(dateParts, "year");
  const month = lookup(dateParts, "month");
  const day = lookup(dateParts, "day");
  const hour = lookup(timeParts, "hour");
  const minute = lookup(timeParts, "minute");
  return {
    date: year && month && day ? `${year}-${month}-${day}` : "",
    time: hour && minute ? `${hour}:${minute}` : ""
  };
}

function formatEventDisplayDate(value) {
  if (!value) {
    return t("modify.dateUnknown");
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return t("modify.dateUnknown");
  }
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

/**
 * @param {string} value - ISO date string
 * @param {string} timeZone - IANA timezone string
 * @returns {string} Formatted date with timezone code.
 */
function formatDateInTimezone(value, timeZone) {
  if (!value) {
    return t("modify.dateUnknown");
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return t("modify.dateUnknown");
  }
  const formatted = date.toLocaleString(undefined, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone
  });
  const tzAbbr = getTimeZoneAbbr(timeZone);
  return `${formatted} ${tzAbbr}`;
}

/** @returns {string} IANA timezone string. */
function getSystemTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

/**
 * Setup hover-to-convert behavior on a date element. Shows local time with
 * timezone code on hover, original on mouse leave.
 * @param {HTMLElement} element
 * @param {string} isoDate
 * @param {string} originalTimezone
 */
function setupDateHoverConvert(element, isoDate, originalTimezone) {
  const systemTz = getSystemTimezone();
  const originalText = formatDateInTimezone(isoDate, originalTimezone);
  const localText = formatDateInTimezone(isoDate, systemTz);

  element.textContent = originalText;

  element.addEventListener("mouseenter", () => {
    element.textContent = localText;
  });

  element.addEventListener("mouseleave", () => {
    element.textContent = originalText;
  });
}

function renderModifyCount() {
  if (!dom.modifyCount) {
    return;
  }
  const groupId = dom.modifyGroup?.value;
  if (!groupId) {
    dom.modifyCount.textContent = t("modify.countEmpty");
    return;
  }
  const groupName = getGroupName(groupId) || t("modify.countGroupFallback");
  const optimisticCount = state.modify.optimisticEvents?.size || 0;
  const totalCount = state.modify.events.length + optimisticCount;

  // Base text: "Upcoming events for <group>."
  let countText = t("modify.countStatus", {
    group: groupName,
    count: totalCount
  });

  const missedCount = state.modify.missedCount || 0;
  if (missedCount > 0) {
    const missedKey = missedCount === 1
      ? "modify.missedAutomationNoticeSingular"
      : "modify.missedAutomationNoticePlural";
    const missedText = t(missedKey, { count: missedCount });
    countText += ` <strong>${missedText}</strong>`;
  }

  const queuedCount = state.modify.queuedCount || 0;
  if (queuedCount > 0) {
    const queuedKey = queuedCount === 1
      ? "modify.queuedAutomationNoticeSingular"
      : "modify.queuedAutomationNoticePlural";
    const queuedText = t(queuedKey, { count: queuedCount });
    countText += ` <strong>${queuedText}</strong>`;
  }

  dom.modifyCount.innerHTML = countText; // innerHTML supports the <strong> tags above.
}

function getMergedEvents() {
  // Merge real and pending events, sorted by event start time.
  const realEvents = state.modify.events.map(e => ({
    ...e,
    isPending: false,
    sortTime: new Date(e.startsAtUtc || e.endsAtUtc).getTime()
  }));

  const optimisticEvents = Array.from(state.modify.optimisticEvents.values()).map(entry => ({
    ...entry.event,
    isPending: false,
    isOptimistic: true,
    sortTime: new Date(entry.event.startsAtUtc || entry.event.endsAtUtc).getTime()
  }));

  const realSlots = new Set(realEvents.map(getEventSlotKey).filter(Boolean));
  const realIds = new Set(realEvents.map(event => event.id).filter(Boolean));
  const filteredOptimistic = optimisticEvents.filter(event => {
    if (event.eventId && realIds.has(event.eventId)) {
      return false;
    }
    if (event.id && realIds.has(event.id)) {
      return false;
    }
    const slotKey = getEventSlotKey(event);
    return !slotKey || !realSlots.has(slotKey);
  });

  // Defensive filter for projected events whose profile has been deleted
  // since the last refresh. Without this, stale entries cling to the cached
  // pendingEvents until the next full refresh. Profile-delete broadcasts
  // profiles:updated which triggers a refresh, but this is a belt-and-
  // suspenders safety net for any other state-sync gap.
  const groupId = dom.modifyGroup?.value;
  const profilesForGroup = groupId ? (state.profiles?.[groupId]?.profiles || {}) : {};
  const pendingEvents = state.modify.filters?.pending
    ? state.modify.pendingEvents
      .filter(p => !state.modify.optimisticEvents.has(p.id))
      .filter(p => {
        if (p.isProjected && p.profileKey && !profilesForGroup[p.profileKey]) {
          return false; // Orphan projected event; profile was deleted.
        }
        return true;
      })
      .map(p => ({
        ...p,
        isPending: true,
        sortTime: new Date(p.eventStartsAt).getTime()
      }))
    : [];

  return [...realEvents, ...filteredOptimistic, ...pendingEvents].sort((a, b) => a.sortTime - b.sortTime);
}

/**
 * Reset session-scoped Modify Events filters to default (everything visible).
 * Called on group change and tab navigation. Time range is NOT reset
 * (it's persisted).
 */
export function resetModifyFilters() {
  state.modify.filters = {
    pending: true,
    standalone: true,
    modified: true,
    series: {},
    templates: {}
  };
  if (dom.modifyFilterPending) dom.modifyFilterPending.checked = true;
  if (dom.modifyFilterStandalone) dom.modifyFilterStandalone.checked = true;
  if (dom.modifyFilterModified) dom.modifyFilterModified.checked = true;
  // Collapsed state on reset.
  if (dom.modifyFiltersPanel) dom.modifyFiltersPanel.classList.add("is-hidden");
  if (dom.modifyFilterSeriesGroup) dom.modifyFilterSeriesGroup.classList.add("is-hidden");
  if (dom.modifyFilterSeriesList) dom.modifyFilterSeriesList.innerHTML = "";
  if (dom.modifyFilterTemplatesGroup) dom.modifyFilterTemplatesGroup.classList.add("is-hidden");
  if (dom.modifyFilterTemplatesList) dom.modifyFilterTemplatesList.innerHTML = "";
  // Keep state.modify.showPending in sync for legacy code paths.
  state.modify.showPending = true;
}

// Build the per-template filter chip list. Templates are surfaced from any
// pending/projected event with a profileKey, so every committed and
// projected automation event contributes to the visible chip set.
// Standalone (manually-created) events have no profileKey, so they are
// not represented here.
//
// Phase D: no per-card template badge, only this filter. Purely additive:
// unchecking a chip hides every event from that template. State persists
// in state.modify.filters.templates.
function populateTemplatesFilterOptions(groupId, pendingEvents) {
  if (!dom.modifyFilterTemplatesGroup || !dom.modifyFilterTemplatesList) return;

  const profileKeys = new Set();
  (pendingEvents || []).forEach(p => {
    if (p?.profileKey) profileKeys.add(p.profileKey);
  });

  if (profileKeys.size === 0) {
    dom.modifyFilterTemplatesGroup.classList.add("is-hidden");
    return;
  }
  dom.modifyFilterTemplatesGroup.classList.remove("is-hidden");

  const profilesForGroup = state.profiles?.[groupId]?.profiles || {};

  if (!state.modify.filters.templates) state.modify.filters.templates = {};
  // New chips default to checked. Entries for templates with no visible
  // events get pruned so toggling old templates doesn't linger.
  profileKeys.forEach(pk => {
    if (state.modify.filters.templates[pk] === undefined) {
      state.modify.filters.templates[pk] = true;
    }
  });
  Object.keys(state.modify.filters.templates).forEach(pk => {
    if (!profileKeys.has(pk)) delete state.modify.filters.templates[pk];
  });

  dom.modifyFilterTemplatesList.innerHTML = "";
  Array.from(profileKeys).sort().forEach(profileKey => {
    const profile = profilesForGroup[profileKey];
    // displayName is what the user names a profile in the wizard. Fall back to
    // profile.name (event-name field), then to the slug if neither resolves.
    const label = (profile?.displayName?.trim())
      || (profile?.name?.trim())
      || profileKey;
    const wrapper = document.createElement("label");
    wrapper.className = "toggle";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.dataset.profileKey = profileKey;
    input.checked = state.modify.filters.templates[profileKey] !== false;
    input.addEventListener("change", () => {
      state.modify.filters.templates[profileKey] = input.checked;
      renderModifyEventGrid();
    });
    const span = document.createElement("span");
    span.textContent = label;
    wrapper.appendChild(input);
    wrapper.appendChild(span);
    dom.modifyFilterTemplatesList.appendChild(wrapper);
  });
}

function populateSeriesFilterOptions(groupId, events) {
  if (!dom.modifyFilterSeriesGroup || !dom.modifyFilterSeriesList) return;
  const seriesIds = new Set();
  (events || []).forEach(event => {
    if (event.seriesId) seriesIds.add(event.seriesId);
  });
  if (seriesIds.size === 0) {
    dom.modifyFilterSeriesGroup.classList.add("is-hidden");
    return;
  }
  dom.modifyFilterSeriesGroup.classList.remove("is-hidden");

  const seriesMap = state.series?.[groupId] || {};
  // New seriesIds default to visible.
  if (!state.modify.filters.series) state.modify.filters.series = {};
  seriesIds.forEach(sid => {
    if (state.modify.filters.series[sid] === undefined) {
      state.modify.filters.series[sid] = true;
    }
  });
  // Drop entries for series no longer present.
  Object.keys(state.modify.filters.series).forEach(sid => {
    if (!seriesIds.has(sid)) delete state.modify.filters.series[sid];
  });

  dom.modifyFilterSeriesList.innerHTML = "";
  Array.from(seriesIds).sort().forEach(seriesId => {
    const label = seriesMap[seriesId]?.label
      || `${t("common.labels.series") || "Series"} (${seriesId.slice(0, 8)})`;
    const wrapper = document.createElement("label");
    wrapper.className = "toggle";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.dataset.seriesId = seriesId;
    input.checked = state.modify.filters.series[seriesId] !== false;
    input.addEventListener("change", () => {
      state.modify.filters.series[seriesId] = input.checked;
      renderModifyEventGrid();
    });
    const span = document.createElement("span");
    span.textContent = label;
    wrapper.appendChild(input);
    wrapper.appendChild(span);
    dom.modifyFilterSeriesList.appendChild(wrapper);
  });
}

function renderModifyEventGrid() {
  if (!dom.modifyEventGrid) {
    return;
  }
  dom.modifyEventGrid.innerHTML = "";
  if (state.modify.loading) {
    const loading = document.createElement("div");
    loading.className = "hint";
    loading.textContent = t("common.loading");
    dom.modifyEventGrid.appendChild(loading);
    return;
  }

  const allMergedEvents = getMergedEvents();
  const filters = state.modify.filters || {};
  const seriesFilter = filters.series || {};
  const templatesFilter = filters.templates || {};
  // Time range cutoff: only events starting within timeRangeDays from now.
  const rangeDays = Number.isFinite(state.modify.timeRangeDays) ? state.modify.timeRangeDays : 30;
  const nowMs = Date.now();
  const cutoffMs = nowMs + rangeDays * 24 * 60 * 60 * 1000;

  // An event's end instant, for the lower bound. Prefer its stored end; fall
  // back to start + duration (default 120 min) when only a start is known.
  const endMsOf = (event) => {
    if (event.endsAtUtc) {
      const e = Date.parse(event.endsAtUtc);
      if (Number.isFinite(e)) return e;
    }
    const startMs = event.sortTime || (event.startsAtUtc ? Date.parse(event.startsAtUtc) : null);
    if (!Number.isFinite(startMs)) return null;
    const durMin = Number(event.durationMinutes ?? event.duration ?? 120);
    return startMs + (Number.isFinite(durMin) ? durMin : 120) * 60 * 1000;
  };

  let hiddenByRange = 0;
  const mergedEvents = allMergedEvents.filter(event => {
    const startMs = event.sortTime || (event.startsAtUtc ? Date.parse(event.startsAtUtc) : null);
    if (startMs && startMs > cutoffMs) {
      hiddenByRange++;
      return false;
    }
    // Drop an event the moment it ends — no card for what's already over. An
    // in-progress event (started, not yet ended) still shows.
    const endMs = endMsOf(event);
    if (Number.isFinite(endMs) && endMs < nowMs) {
      return false;
    }
    // Pending toggle (also captured by getMergedEvents; kept here for clarity).
    if (event.isPending && filters.pending === false) return false;
    // Phase D per-template chips: a pending/projected event tied to an
    // unchecked template is hidden. profileKey links these events to a
    // template; standalone events have no profileKey and aren't gated.
    if (event.isPending && event.profileKey && templatesFilter[event.profileKey] === false) {
      return false;
    }
    if (event.seriesId) {
      if (seriesFilter[event.seriesId] === false) return false;
      // Modified-occurrence filter only applies when unchecked.
      if (event.occurrenceModified && filters.modified === false) return false;
      return true;
    }
    // Standalone (non-pending, non-series).
    if (!event.isPending && filters.standalone === false) return false;
    return true;
  });
  // Stash range-hidden count so the count line can surface it.
  state.modify._hiddenByRange = hiddenByRange;

  if (!mergedEvents.length) {
    const empty = document.createElement("div");
    empty.className = "hint";
    empty.textContent = t("modify.empty");
    dom.modifyEventGrid.appendChild(empty);
    return;
  }

  mergedEvents.forEach(event => {
    if (event.isPending) {
      renderPendingCard(event);
    } else {
      renderPublishedCard(event);
    }
  });
}

function renderPublishedCard(event) {
  const card = document.createElement("div");
  card.className = "event-card";
  if (event.isOptimistic) {
    card.classList.add("is-optimistic");
  }
  card.dataset.eventId = event.id;
  card.setAttribute("role", "button");
  card.tabIndex = 0;

  const thumb = document.createElement("div");
  thumb.className = "event-thumb";
  const imageUrl = event.imageUrl || getGroupBanner(event.groupId);
  if (imageUrl) {
    const img = document.createElement("img");
    img.src = imageUrl;
    img.alt = event.title || t("modify.eventImage");
    img.loading = "lazy";
    img.addEventListener("error", () => {
      img.remove();
      const fallback = document.createElement("div");
      fallback.className = "event-thumb-placeholder";
      fallback.textContent = t("modify.noImage");
      thumb.appendChild(fallback);
    });
    thumb.appendChild(img);
    const imageId = getImageIdForEvent(event);
    if (imageId) {
      loadCachedImageForElement(img, imageId, imageUrl);
    }
  } else {
    const fallback = document.createElement("div");
    fallback.className = "event-thumb-placeholder";
    fallback.textContent = t("modify.noImage");
    thumb.appendChild(fallback);
  }

  const title = document.createElement("h4");
  title.className = "event-title";
  title.textContent = event.title || t("modify.untitled");

  const badgeRow = document.createElement("div");
  badgeRow.className = "event-badge-row";
  if (event.seriesId) {
    const seriesData = state.series?.[event.groupId]?.[event.seriesId];
    const label = seriesData?.label || t("common.labels.series") || "Series";
    const seriesBadge = document.createElement("span");
    seriesBadge.className = "event-series-badge";
    seriesBadge.textContent = `↻ ${label}`;
    seriesBadge.title = label;
    badgeRow.appendChild(seriesBadge);
  }
  if (event.occurrenceModified) {
    const modBadge = document.createElement("span");
    modBadge.className = "event-modified-badge";
    modBadge.textContent = t("modify.badge.modified") || "Modified";
    badgeRow.appendChild(modBadge);
  }

  const date = document.createElement("div");
  date.className = "event-date";
  // Published events: show local time; hover shows with timezone code.
  const eventDateValue = event.startsAtUtc || event.endsAtUtc;
  const systemTz = getSystemTimezone();
  const normalDateText = formatEventDisplayDate(eventDateValue);
  const hoverDateText = formatDateInTimezone(eventDateValue, systemTz);
  date.textContent = normalDateText;
  date.addEventListener("mouseenter", () => {
    date.textContent = hoverDateText;
  });
  date.addEventListener("mouseleave", () => {
    date.textContent = normalDateText;
  });

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "event-delete";
  deleteBtn.setAttribute("aria-label", t("common.delete"));
  const deleteIcon = document.createElement("span");
  deleteIcon.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v9h-2V9zm4 0h2v9h-2V9zm-6 0h2v9H8V9z"></path>
    </svg>
  `;
  deleteBtn.appendChild(deleteIcon);
  attachHoldToDelete(deleteBtn, () => handleDeleteEvent(event));

  card.appendChild(deleteBtn);
  card.appendChild(thumb);
  card.appendChild(title);
  if (badgeRow.children.length > 0) {
    card.appendChild(badgeRow);
  }
  card.appendChild(date);
  card.addEventListener("click", () => openModifyModal(event));
  card.addEventListener("keydown", evt => {
    if (evt.key === "Enter" || evt.key === " ") {
      evt.preventDefault();
      openModifyModal(event);
    }
  });
  dom.modifyEventGrid.appendChild(card);
}

function renderPendingCard(pendingEvent) {
  const card = document.createElement("div");
  card.className = "event-card is-pending";
  if (pendingEvent.status === "missed") {
    card.classList.add("is-missed");
  } else if (pendingEvent.status === "queued") {
    card.classList.add("is-queued");
  }
  card.dataset.pendingId = pendingEvent.id;
  card.setAttribute("role", "button");
  card.tabIndex = 0;

  const thumb = document.createElement("div");
  thumb.className = "event-thumb";

  const details = pendingEvent.resolvedDetails || {};
  const imageUrl = details.imageUrl || getGroupBanner(pendingEvent.groupId);
  if (imageUrl) {
    const img = document.createElement("img");
    img.src = imageUrl;
    img.alt = details.title || t("modify.eventImage");
    img.loading = "lazy";
    img.addEventListener("error", () => {
      img.remove();
      const fallback = document.createElement("div");
      fallback.className = "event-thumb-placeholder";
      fallback.textContent = t("modify.noImage");
      thumb.appendChild(fallback);
    });
    thumb.appendChild(img);
    const imageId = getImageIdForEvent(details);
    if (imageId) {
      loadCachedImageForElement(img, imageId, imageUrl);
    }
  } else {
    const fallback = document.createElement("div");
    fallback.className = "event-thumb-placeholder";
    fallback.textContent = t("modify.noImage");
    thumb.appendChild(fallback);
  }

  // Hover actions overlay (Post Now, Edit).
  const hoverActions = document.createElement("div");
  hoverActions.className = "pending-hover-actions";

  const postNowBtn = document.createElement("button");
  postNowBtn.type = "button";
  postNowBtn.className = "pending-action-btn pending-post-now";
  postNowBtn.textContent = t("modify.pending.postNow");
  if (pendingEvent.status === "queued") {
    postNowBtn.disabled = true;
    postNowBtn.title = t("modify.pending.queuedDisabled");
  }
  if (state.modify.pendingPostNow?.has(pendingEvent.id)) {
    postNowBtn.disabled = true;
  }
  postNowBtn.addEventListener("click", evt => {
    evt.stopPropagation();
    handlePendingPostNow(pendingEvent, postNowBtn);
  });

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "pending-action-btn pending-edit";
  editBtn.textContent = t("modify.pending.edit");
  editBtn.addEventListener("click", evt => {
    evt.stopPropagation();
    handlePendingEdit(pendingEvent);
  });

  hoverActions.appendChild(postNowBtn);
  hoverActions.appendChild(editBtn);
  thumb.appendChild(hoverActions);

  if (pendingEvent.status === "missed") {
    const missedBadge = document.createElement("div");
    missedBadge.className = "pending-missed-badge";
    missedBadge.textContent = "!";
    missedBadge.title = t("modify.pending.missedHint");
    thumb.appendChild(missedBadge);
  } else if (pendingEvent.status === "queued") {
    const queuedBadge = document.createElement("div");
    queuedBadge.className = "pending-queued-badge";
    queuedBadge.textContent = "⏱";
    queuedBadge.title = t("modify.pending.queuedHint");
    thumb.appendChild(queuedBadge);
  }

  const title = document.createElement("h4");
  title.className = "event-title";
  title.textContent = details.title || t("modify.untitled");

  // Profile timezone from resolved details (for hover conversion).
  const profileTz = details.timezone || getSystemTimezone();

  const dateRow = document.createElement("div");
  dateRow.className = "event-date";
  setupDateHoverConvert(dateRow, pendingEvent.eventStartsAt, profileTz);
  // Suppress hover overlay when hovering on date row.
  dateRow.addEventListener("mouseenter", () => card.classList.add("suppress-hover-overlay"));
  dateRow.addEventListener("mouseleave", () => card.classList.remove("suppress-hover-overlay"));

  const publishTime = document.createElement("div");
  publishTime.className = "pending-publish-time";
  const publishTimeSpan = document.createElement("span");
  publishTimeSpan.className = "pending-publish-time-value";
  setupDateHoverConvert(publishTimeSpan, pendingEvent.scheduledPublishTime, profileTz);
  const publishLabel = t("modify.pending.publishAt", { time: "" }).replace(/:\s*$/, ": ");
  publishTime.textContent = publishLabel;
  publishTime.appendChild(publishTimeSpan);
  publishTime.addEventListener("mouseenter", () => card.classList.add("suppress-hover-overlay"));
  publishTime.addEventListener("mouseleave", () => card.classList.remove("suppress-hover-overlay"));

  // Delete (cancel) button: same as published cards.
  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "event-delete";
  deleteBtn.setAttribute("aria-label", t("modify.pending.cancel"));
  const deleteIcon = document.createElement("span");
  deleteIcon.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v9h-2V9zm4 0h2v9h-2V9zm-6 0h2v9H8V9z"></path>
    </svg>
  `;
  deleteBtn.appendChild(deleteIcon);
  attachHoldToDelete(deleteBtn, () => handlePendingCancel(pendingEvent));

  card.appendChild(deleteBtn);
  card.appendChild(thumb);
  card.appendChild(title);
  card.appendChild(dateRow);
  card.appendChild(publishTime);

  // Pending cards have no click action; actions are in the hover overlay.
  card.addEventListener("click", () => {});

  dom.modifyEventGrid.appendChild(card);
}

async function handlePendingPostNow(pendingEvent, button) {
  if (!modifyApi?.pendingAction) {
    showToast(t("modify.pending.postFailed"), true);
    return;
  }
  if (!pendingEvent?.id) {
    showToast(t("modify.pending.postFailed"), true);
    return;
  }
  if (state.modify.pendingPostNow.has(pendingEvent.id)) {
    return;
  }
  state.modify.pendingPostNow.add(pendingEvent.id);
  if (button) {
    button.disabled = true;
  }
  try {
    // Projected events live only in the renderer view; they aren't in the
    // engine's pendingEvents array, so postNow's id lookup would fail.
    // Materialize the slot first (mirrors the Phase B edit-flow promotion),
    // then post the resulting real pending id.
    let postId = pendingEvent.id;
    if (pendingEvent.isProjected && modifyApi?.commitProjected) {
      const commit = await modifyApi.commitProjected({
        groupId: pendingEvent.groupId,
        profileKey: pendingEvent.profileKey,
        eventStartsAt: pendingEvent.eventStartsAt,
        overrides: null,
      });
      if (!commit?.ok || !commit.pendingEventId) {
        showToast(commit?.error?.message || t("modify.pending.postFailed"), true);
        return;
      }
      postId = commit.pendingEventId;
    }
    const result = await modifyApi.pendingAction({
      pendingEventId: postId,
      action: "postNow"
    });
    if (!result?.ok) {
      showToast(result?.error?.message || t("modify.pending.postFailed"), true);
      return;
    }
    upsertOptimisticEvent(pendingEvent);
    showToast(t("modify.pending.posted"));
    await refreshModifyEvents(modifyApi, { preserveScroll: true });
  } catch (err) {
    showToast(t("modify.pending.postFailed"), true);
  } finally {
    state.modify.pendingPostNow.delete(pendingEvent.id);
    if (button && button.isConnected) {
      button.disabled = pendingEvent.status === "queued";
    }
  }
}

async function handlePendingEdit(pendingEvent) {
  if (!modifyApi?.pendingAction) {
    showToast(t("modify.pending.editFailed"), true);
    return;
  }
  // Store selected pending event and open modify modal with resolved details.
  state.modify.selectedPendingEvent = pendingEvent;
  const details = pendingEvent.resolvedDetails || {};

  // Store current imageUrl for card preview after save.
  state.modify.selectedImageUrl = details.imageUrl || "";

  // Build a fake event object for the modify form.
  const fakeEvent = {
    id: pendingEvent.id,
    groupId: pendingEvent.groupId,
    title: details.title || "",
    description: details.description || "",
    category: details.category || "hangout",
    tags: details.tags || [],
    accessType: details.accessType || "public",
    imageId: details.imageId || "",
    imageUrl: details.imageUrl || "",
    roleIds: details.roleIds || [],
    languages: details.languages || [],
    platforms: details.platforms || [],
    durationMinutes: details.durationMinutes || 120,
    timezone: details.timezone || "UTC",
    startsAtUtc: pendingEvent.eventStartsAt,
    isPendingEdit: true
  };

  // Posting options: manual overrides take priority, then profile template defaults
  const profile = state.profiles?.[pendingEvent.groupId]?.profiles?.[pendingEvent.profileKey];
  const overrides = pendingEvent.manualOverrides || {};
  fakeEvent.discordSync = overrides.discordSync ?? profile?.discordSync ?? true;
  fakeEvent.webhookPost = overrides.webhookPost ?? profile?.webhookPost ?? false;
  fakeEvent.calendarCreate = overrides.calendarCreate ?? profile?.calendarSync ?? false;
  fakeEvent.calendarRemindersEnabled = overrides.calendarRemindersEnabled ?? profile?.calendarRemindersEnabled ?? false;
  fakeEvent.calendarReminders = overrides.calendarReminders ?? profile?.calendarReminders ?? [];
  fakeEvent.webhookMessageEnabled = overrides.webhookMessageEnabled ?? profile?.webhookMessageEnabled ?? false;
  fakeEvent.webhookMessage = overrides.webhookMessage ?? profile?.webhookMessage ?? "";
  fakeEvent.webhookImagePath = overrides.webhookImagePath ?? profile?.webhookImagePath ?? "";

  applyModifyFormFromEvent(fakeEvent);
  dom.modifyOverlay.classList.remove("is-hidden");
}

async function handlePendingCancel(pendingEvent) {
  if (!modifyApi?.pendingAction) {
    showToast(t("modify.pending.cancelFailed"), true);
    return;
  }
  try {
    // Phase C automation projection: projected (renderer-only) slots can't
    // go through pending:action because they're not in pending-events.json.
    // Route through tombstoneProjected so the engine knows never to
    // regenerate this slot.
    let result;
    if (pendingEvent.isProjected && modifyApi?.tombstoneProjected) {
      result = await modifyApi.tombstoneProjected({
        groupId: pendingEvent.groupId,
        profileKey: pendingEvent.profileKey,
        eventStartsAt: pendingEvent.eventStartsAt,
      });
    } else {
      result = await modifyApi.pendingAction({
        pendingEventId: pendingEvent.id,
        action: "cancel"
      });
    }
    if (!result?.ok) {
      showToast(result?.error?.message || t("modify.pending.cancelFailed"), true);
      return;
    }
    showToast(t("modify.pending.cancelled"));

    // Optimistically remove from local state.
    state.modify.pendingEvents = state.modify.pendingEvents.filter(p => p.id !== pendingEvent.id);
    state.modify.optimisticEvents.delete(pendingEvent.id);
    renderModifyEventGrid();
    renderModifyCount();
  } catch (err) {
    showToast(t("modify.pending.cancelFailed"), true);
  }
}

async function handlePendingSave() {
  const pendingEvent = state.modify.selectedPendingEvent;
  if (!pendingEvent) {
    showToast(t("modify.pending.editFailed"), true);
    return;
  }
  if (!modifyApi?.pendingAction) {
    showToast(t("modify.pending.editFailed"), true);
    return;
  }
  if (state.modify.saving) {
    return;
  }
  if (state.modify.tagInput) {
    state.modify.tagInput.commit();
  }

  const tags = state.modify.tagInput
    ? state.modify.tagInput.getTags()
    : enforceTagsInput(dom.modifyEventTags, TAG_LIMIT, true);

  // Sync group fair tag with the checkbox.
  if (dom.modifyGroupFair?.checked) {
    if (!tags.includes("vrc_event_group_fair")) {
      tags.push("vrc_event_group_fair");
    }
  } else {
    const index = tags.indexOf("vrc_event_group_fair");
    if (index > -1) {
      tags.splice(index, 1);
    }
  }

  const title = sanitizeText(dom.modifyEventName.value, {
    maxLength: EVENT_NAME_LIMIT,
    allowNewlines: false,
    trim: true
  });
  const description = sanitizeText(dom.modifyEventDescription.value, {
    maxLength: EVENT_DESCRIPTION_LIMIT,
    allowNewlines: true,
    trim: true
  });

  if (!title) {
    showToast(t("common.errors.requiredSingle", { field: t("common.fields.eventName") }), true);
    return;
  }
  if (!description) {
    showToast(t("common.errors.requiredSingle", { field: t("common.fields.description") }), true);
    return;
  }

  let durationMinutes = parseDurationInput(dom.modifyEventDuration.value)?.minutes ?? null;
  if (!durationMinutes) {
    durationMinutes = normalizeDurationInput(dom.modifyEventDuration, 120);
  }
  if (!durationMinutes || durationMinutes < 1) {
    showToast(t("common.errors.durationError"), true);
    return;
  }

  state.modify.saving = true;
  dom.modifySave.disabled = true;

  try {
    const manualDate = dom.modifyEventDate.value;
    const manualTime = dom.modifyEventTime.value;
    const manualTimezone = dom.modifyEventTimezone.value;

    const manualOverrides = {
      title,
      description,
      category: dom.modifyEventCategory.value,
      accessType: dom.modifyEventAccess.value,
      languages: state.modify.languages.slice(),
      platforms: state.modify.platforms.slice(),
      tags,
      imageId: dom.modifyEventImageId.value.trim() || null,
      imageUrl: state.modify.selectedImageUrl || null,
      roleIds: dom.modifyEventAccess.value === "group" ? state.modify.roleIds.slice() : [],
      durationMinutes,
      timezone: manualTimezone,
      manualDate,
      manualTime,
      discordSync: dom.modifyDiscordSync?.checked ?? true,
      webhookPost: dom.modifyWebhookPost?.checked ?? false,
      calendarCreate: dom.modifyCalendarSync?.checked ?? false,
      calendarRemindersEnabled: dom.modifyCalendarRemindersEnabled?.checked ?? false,
      calendarReminders: readCalendarRemindersFromDom(dom.modifyCalendarRemindersList),
      webhookMessageEnabled: dom.modifyWebhookMessageEnabled?.checked ?? false,
      webhookMessage: dom.modifyWebhookMessage?.value || "",
      webhookImagePath: dom.modifyWebhookImagePath?.value || ""
    };

    // Phase B automation projection: if editing a projected (renderer-only)
    // slot, commit it first via commitProjected. That promotes it to a real
    // pending event with the user's overrides applied at construction time.
    // Existing committed events go through pending:action edit as before.
    let result;
    if (pendingEvent.isProjected && modifyApi?.commitProjected) {
      result = await modifyApi.commitProjected({
        groupId: pendingEvent.groupId,
        profileKey: pendingEvent.profileKey,
        eventStartsAt: pendingEvent.eventStartsAt,
        overrides: manualOverrides,
      });
    } else {
      result = await modifyApi.pendingAction({
        pendingEventId: pendingEvent.id,
        action: "edit",
        overrides: manualOverrides
      });
    }

    if (!result?.ok) {
      showToast(result?.error?.message || t("modify.pending.editFailed"), true);
      return;
    }

    showToast(t("modify.pending.editSaved"));
    closeModifyModal();
    state.modify.selectedPendingEvent = null;
    await refreshModifyEvents(modifyApi, { preserveScroll: true });
  } catch (err) {
    showToast(t("modify.pending.editFailed"), true);
  } finally {
    state.modify.saving = false;
    dom.modifySave.disabled = false;
  }
}

function renderModifyProfileOptions(groupId) {
  if (!dom.modifyProfile) {
    return;
  }
  dom.modifyProfile.value = "";
  if (!groupId) {
    dom.modifyProfile.innerHTML = "";
    return;
  }
  const profiles = state.profiles[groupId]?.profiles || {};
  const profileKeys = Object.keys(profiles);
  const options = [
    { label: t("common.selectTemplate"), value: "" },
    ...profileKeys.map(key => ({
      label: getProfileLabel(key, profiles[key]),
      value: `${groupId}::${key}`
    }))
  ];
  renderSelect(dom.modifyProfile, options);
}

function renderModifyLanguageList() {
  renderChecklist(dom.modifyLanguageList, LANGUAGES, state.modify.languages, {
    max: 3,
    filterText: dom.modifyLanguageFilter.value,
    getLabel: item => getLanguageDisplayName(item.value, item.label),
    onChange: next => {
      state.modify.languages = next;
      renderModifyLanguageList();
      dom.modifyLanguageHint.textContent = t("common.fields.languagesHint", { count: next.length });
    }
  });
  dom.modifyLanguageHint.textContent = t("common.fields.languagesHint", { count: state.modify.languages.length });
}

function renderModifyPlatformList() {
  renderChecklist(dom.modifyPlatformList, PLATFORMS, state.modify.platforms, {
    onChange: next => {
      state.modify.platforms = next;
      renderModifyPlatformList();
    }
  });
}

function applyModifyFormFromEvent(event) {
  if (!event) {
    return;
  }
  state.modify.selectedEvent = event;
  dom.modifyEventName.value = event.title || "";
  dom.modifyEventDescription.value = event.description || "";
  dom.modifyEventCategory.value = event.category || "hangout";
  if (state.modify.tagInput) {
    state.modify.tagInput.setTags(event.tags || []);
  } else {
    dom.modifyEventTags.value = (event.tags || []).join(", ");
  }
  dom.modifyEventAccess.value = event.accessType || "public";
  enforceGroupAccess(dom.modifyEventAccess, event.groupId);
  dom.modifyEventImageId.value = event.imageId || "";
  if (dom.modifyFeatured) {
    dom.modifyFeatured.checked = Boolean(event.featured);
  }
  if (dom.modifyGroupFair) {
    dom.modifyGroupFair.checked = event.tags?.includes("vrc_event_group_fair") || false;
  }
  state.modify.roleIds = Array.isArray(event.roleIds) ? event.roleIds.slice() : [];
  const { systemTz } = buildTimezones();
  const timezone = event.timezone || systemTz;
  ensureTimezoneOption(dom.modifyEventTimezone, timezone);
  dom.modifyEventTimezone.value = timezone;
  const parts = formatDateParts(event.startsAtUtc || event.endsAtUtc, timezone);
  dom.modifyEventDate.value = parts.date;
  dom.modifyEventTime.value = parts.time;
  dom.modifyEventDuration.value = formatDuration(event.durationMinutes || 120);
  updateModifyDurationPreview();

  state.modify.languages = Array.isArray(event.languages) ? event.languages.slice() : [];
  state.modify.platforms = Array.isArray(event.platforms) ? event.platforms.slice() : [];
  renderModifyLanguageList();
  renderModifyPlatformList();
  renderModifyProfileOptions(event.groupId);
  void renderModifyRoleRestrictions();
  void updateModifyTogglesVisibility(event.groupId);

  // Posting options apply only to pending events.
  const isPending = !!state.modify.selectedPendingEvent;
  if (dom.modifyPostingOptions) {
    dom.modifyPostingOptions.classList.toggle("is-hidden", !isPending);
  }
  if (isPending) {
    const groupId = event.groupId;
    const hasDiscord = isGroupDiscordConfigured(groupId);
    const calendarEnabled = state.settings?.calendarEnabled === true;
    const hasKit = isGroupKitActive(groupId);

    const hasWebhook = isGroupWebhookConfigured(groupId);

    if (dom.modifyDiscordSyncField) dom.modifyDiscordSyncField.classList.toggle("is-hidden", !hasDiscord);
    if (dom.modifyDiscordSync) dom.modifyDiscordSync.checked = event.discordSync !== false;

    if (dom.modifyWebhookPostField) dom.modifyWebhookPostField.classList.toggle("is-hidden", !hasWebhook);
    if (dom.modifyWebhookPost) dom.modifyWebhookPost.checked = Boolean(event.webhookPost);

    if (dom.modifyCalendarSyncField) dom.modifyCalendarSyncField.classList.toggle("is-hidden", !calendarEnabled);
    if (dom.modifyCalendarSync) dom.modifyCalendarSync.checked = Boolean(event.calendarCreate);

    if (dom.modifyCalendarRemindersEnabled) dom.modifyCalendarRemindersEnabled.checked = Boolean(event.calendarRemindersEnabled);
    renderCalendarReminders(dom.modifyCalendarRemindersList, event.calendarReminders || []);
    updateModifyCalendarRemindersVisibility();

    // Webhook message depends on webhook post + kit.
    const showWebhook = hasKit && dom.modifyWebhookPost?.checked;
    if (dom.modifyWebhookMessageSection) dom.modifyWebhookMessageSection.classList.toggle("is-hidden", !showWebhook);
    if (dom.modifyWebhookMessageEnabled) dom.modifyWebhookMessageEnabled.checked = Boolean(event.webhookMessageEnabled);
    if (dom.modifyWebhookMessage) dom.modifyWebhookMessage.value = event.webhookMessage || "";
    if (dom.modifyWebhookImagePath) dom.modifyWebhookImagePath.value = event.webhookImagePath || "";
    if (dom.modifyWebhookMessageInput) dom.modifyWebhookMessageInput.classList.toggle("is-hidden", !event.webhookMessageEnabled);
  }
}

export function updateModifyCalendarRemindersVisibility() {
  const calendarOn = dom.modifyCalendarSync?.checked === true;
  if (dom.modifyCalendarRemindersEnabledField) dom.modifyCalendarRemindersEnabledField.classList.toggle("is-hidden", !calendarOn);
  const remindersOn = calendarOn && dom.modifyCalendarRemindersEnabled?.checked === true;
  if (dom.modifyCalendarRemindersList) dom.modifyCalendarRemindersList.classList.toggle("is-hidden", !remindersOn);
  if (dom.modifyCalendarReminderAdd) dom.modifyCalendarReminderAdd.classList.toggle("is-hidden", !remindersOn);
  if (dom.modifyCalendarRemindersHint) dom.modifyCalendarRemindersHint.classList.toggle("is-hidden", !remindersOn);
}

export function updateModifyWebhookVisibility() {
  const groupId = state.modify.selectedPendingEvent?.groupId;
  if (!groupId) return;
  const hasKit = isGroupKitActive(groupId);
  const show = hasKit && dom.modifyWebhookPost?.checked;
  if (dom.modifyWebhookMessageSection) dom.modifyWebhookMessageSection.classList.toggle("is-hidden", !show);
}

async function updateModifyTogglesVisibility(groupId) {
  if (!dom.modifyFeaturedField || !dom.modifyGroupFairField) return;

  if (!groupId) {
    dom.modifyFeaturedField.classList.add("is-hidden");
    dom.modifyGroupFairField.classList.add("is-hidden");
    return;
  }

  try {
    // Backend feature-flag check (tags are NOT exposed to the renderer).
    const flags = await modifyApi.checkFeatureFlags(groupId);

    dom.modifyFeaturedField.classList.toggle("is-hidden", !flags.hasFeaturedEvents);
    dom.modifyGroupFairField.classList.toggle("is-hidden", !flags.hasGroupFair);

  } catch (err) {
    console.error("Failed to check feature flags:", err);
    dom.modifyFeaturedField.classList.add("is-hidden");
    dom.modifyGroupFairField.classList.add("is-hidden");
  }
}

function openModifyModal(event) {
  if (!dom.modifyOverlay || !event) {
    return;
  }
  if (state.app?.updateAvailable) {
    showToast(t("modify.updateRequired"), true, { duration: 8000 });
    return;
  }
  applyModifyFormFromEvent(event);
  dom.modifyOverlay.classList.remove("is-hidden");
}

function closeModifyModal() {
  if (!dom.modifyOverlay) {
    return;
  }
  dom.modifyOverlay.classList.add("is-hidden");
  state.modify.selectedEvent = null;
  state.modify.selectedPendingEvent = null;
}

function applyProfileToModifyForm(profile) {
  if (!profile) {
    return;
  }
  const groupId = state.modify.selectedEvent?.groupId || dom.modifyGroup?.value || state.modify.selectedGroupId;
  dom.modifyEventName.value = profile.name || dom.modifyEventName.value;
  dom.modifyEventDescription.value = profile.description || dom.modifyEventDescription.value;
  dom.modifyEventCategory.value = profile.category || dom.modifyEventCategory.value || "hangout";
  if (state.modify.tagInput) {
    state.modify.tagInput.setTags(profile.tags || []);
  } else if (profile.tags) {
    dom.modifyEventTags.value = (profile.tags || []).join(", ");
  }
  dom.modifyEventAccess.value = profile.accessType || dom.modifyEventAccess.value || "public";
  enforceGroupAccess(dom.modifyEventAccess, groupId);
  dom.modifyEventImageId.value = profile.imageId || dom.modifyEventImageId.value;
  state.modify.roleIds = Array.isArray(profile.roleIds) ? profile.roleIds.slice() : state.modify.roleIds;
  if (profile.duration) {
    dom.modifyEventDuration.value = formatDuration(profile.duration);
    updateModifyDurationPreview();
  }
  if (profile.timezone) {
    ensureTimezoneOption(dom.modifyEventTimezone, profile.timezone);
    dom.modifyEventTimezone.value = profile.timezone;
  }
  state.modify.languages = Array.isArray(profile.languages) ? profile.languages.slice() : state.modify.languages;
  state.modify.platforms = Array.isArray(profile.platforms) ? profile.platforms.slice() : state.modify.platforms;
  renderModifyLanguageList();
  renderModifyPlatformList();
  void renderModifyRoleRestrictions();
}

function getProfileLabel(profileKey, profile) {
  const label = (profile?.displayName || "").trim();
  return label || profileKey;
}

function attachHoldToDelete(button, onConfirm) {
  let rafId = null;
  let holding = false;
  let startTime = 0;

  const reset = () => {
    holding = false;
    button.classList.remove("is-holding");
    button.style.setProperty("--hold-angle", "0deg");
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  };

  const tick = now => {
    if (!holding) {
      return;
    }
    const elapsed = now - startTime;
    const progress = Math.min(1, elapsed / HOLD_DURATION_MS);
    button.style.setProperty("--hold-angle", `${progress * 360}deg`);
    if (progress >= 1) {
      reset();
      onConfirm();
      return;
    }
    rafId = requestAnimationFrame(tick);
  };

  const start = event => {
    if (button.disabled) {
      return;
    }
    if (state.app?.updateAvailable) {
      showToast(t("modify.updateRequired"), true, { duration: 8000 });
      return;
    }
    if (getRateLimitRemainingMs(MODIFY_RATE_LIMIT_KEYS.delete) > 0) {
      showToast(t("common.rateLimitError"), true, { duration: 8000 });
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    holding = true;
    startTime = performance.now();
    button.classList.add("is-holding");
    if (typeof button.setPointerCapture === "function") {
      button.setPointerCapture(event.pointerId);
    }
    rafId = requestAnimationFrame(tick);
  };

  button.addEventListener("pointerdown", start);
  button.addEventListener("pointerup", reset);
  button.addEventListener("pointerleave", reset);
  button.addEventListener("pointercancel", reset);
  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
  });
}

async function handleDeleteEvent(event) {
  if (!modifyApi?.deleteEvent) {
    showToast(t("modify.deleteFailed"), true);
    return;
  }
  if (!event?.groupId || !event?.id) {
    showToast(t("modify.deleteFailed"), true);
    return;
  }
  if (getRateLimitRemainingMs(MODIFY_RATE_LIMIT_KEYS.delete) > 0) {
    showToast(t("common.rateLimitError"), true, { duration: 8000 });
    return;
  }

  if (state.modify.pendingDeletions.has(event.id)) {
    return;
  }

  // Optimistic UI update: remove from list immediately.
  state.modify.pendingDeletions.add(event.id);
  const eventIndex = state.modify.events.findIndex(e => e.id === event.id);
  const deletedEvent = eventIndex >= 0 ? state.modify.events[eventIndex] : null;
  const removedOptimisticEntries = removeOptimisticEntriesForEvent(event);

  const scrollPos = dom.modifyEventGrid ? dom.modifyEventGrid.scrollTop : 0;

  if (eventIndex >= 0) {
    state.modify.events.splice(eventIndex, 1);
  }

  renderModifyEventGrid();
  renderModifyCount();

  if (dom.modifyEventGrid && scrollPos > 0) {
    dom.modifyEventGrid.scrollTop = scrollPos;
  }

  // Backend delete in background.
  const result = await modifyApi.deleteEvent({ groupId: event.groupId, eventId: event.id });

  state.modify.pendingDeletions.delete(event.id);

  if (!result?.ok) {
    // Rollback: restore the event to the list.
    if (removedOptimisticEntries.length) {
      removedOptimisticEntries.forEach(({ pendingId, entry }) => {
        state.modify.optimisticEvents.set(pendingId, entry);
      });
    }
    if (deletedEvent) {
      const rollbackScrollPos = dom.modifyEventGrid ? dom.modifyEventGrid.scrollTop : 0;

      if (eventIndex >= 0 && eventIndex < state.modify.events.length) {
        state.modify.events.splice(eventIndex, 0, deletedEvent);
      } else {
        state.modify.events.push(deletedEvent);
      }
      renderModifyEventGrid();
      renderModifyCount();

      if (dom.modifyEventGrid && rollbackScrollPos > 0) {
        dom.modifyEventGrid.scrollTop = rollbackScrollPos;
      }
    }

    if (isRateLimitError(result?.error)) {
      registerRateLimit(MODIFY_RATE_LIMIT_KEYS.delete);
      showToast(t("common.rateLimitError"), true, { duration: 8000 });
      return;
    }
    showToast(result?.error?.message || t("modify.deleteFailed"), true);
    return;
  }

  // Tombstone so a stale list still filters this id out if it reappears.
  state.modify.deletedTombstones.set(event.id, Date.now());

  // Drop tombstones older than 60s.
  const now = Date.now();
  for (const [id, timestamp] of state.modify.deletedTombstones) {
    if (now - timestamp > 60000) {
      state.modify.deletedTombstones.delete(id);
    }
  }

  clearRateLimit(MODIFY_RATE_LIMIT_KEYS.delete);
  showToast(t("modify.deleted"));

  // Optional background sync; ignore errors since optimistic delete succeeded.
  refreshModifyEvents(modifyApi, { preserveSelection: true }).catch(() => {});
}

async function handleModifySave() {
  // Editing a pending event has its own save path.
  if (state.modify.selectedPendingEvent) {
    await handlePendingSave();
    return;
  }

  if (!modifyApi?.updateEvent) {
    showToast(t("modify.saveFailed"), true);
    return;
  }
  if (state.app?.updateAvailable) {
    showToast(t("modify.updateRequired"), true, { duration: 8000 });
    return;
  }
  if (getRateLimitRemainingMs(MODIFY_RATE_LIMIT_KEYS.update) > 0) {
    showToast(t("common.rateLimitError"), true, { duration: 8000 });
    return;
  }
  const event = state.modify.selectedEvent;
  if (!event?.groupId || !event?.id) {
    showToast(t("modify.selectEventError"), true);
    return;
  }
  enforceGroupAccess(dom.modifyEventAccess, event.groupId);
  if (state.modify.saving) {
    return;
  }
  if (state.modify.tagInput) {
    state.modify.tagInput.commit();
  }
  const tags = state.modify.tagInput
    ? state.modify.tagInput.getTags()
    : enforceTagsInput(dom.modifyEventTags, TAG_LIMIT, true);

  // Sync group fair tag with the checkbox.
  if (dom.modifyGroupFair?.checked) {
    if (!tags.includes("vrc_event_group_fair")) {
      tags.push("vrc_event_group_fair");
    }
  } else {
    const index = tags.indexOf("vrc_event_group_fair");
    if (index > -1) {
      tags.splice(index, 1);
    }
  }

  const title = sanitizeText(dom.modifyEventName.value, {
    maxLength: EVENT_NAME_LIMIT,
    allowNewlines: false,
    trim: true
  });
  dom.modifyEventName.value = title;
  const description = sanitizeText(dom.modifyEventDescription.value, {
    maxLength: EVENT_DESCRIPTION_LIMIT,
    allowNewlines: true,
    trim: true
  });
  dom.modifyEventDescription.value = description;
  if (!title) {
    showToast(t("common.errors.requiredSingle", { field: t("common.fields.eventName") }), true);
    return;
  }
  if (!description) {
    showToast(t("common.errors.requiredSingle", { field: t("common.fields.description") }), true);
    return;
  }
  const manualDate = dom.modifyEventDate.value;
  const manualTime = dom.modifyEventTime.value;
  if (!manualDate || !manualTime) {
    showToast(t("modify.selectDateError"), true);
    return;
  }
  const today = getTodayDateString();
  if (manualDate < today) {
    showToast(t("events.pastDateError"), true);
    return;
  }
  const maxDate = getMaxEventDateString();
  if (manualDate > maxDate) {
    showToast(t("events.futureDateError"), true);
    return;
  }
  let durationMinutes = parseDurationInput(dom.modifyEventDuration.value)?.minutes ?? null;
  if (!durationMinutes) {
    durationMinutes = normalizeDurationInput(dom.modifyEventDuration, 120);
  }
  if (!durationMinutes || durationMinutes < 1) {
    showToast(t("common.errors.durationError"), true);
    return;
  }
  if (state.modify.languages.length > 3) {
    showToast(t("common.errors.maxLanguages"), true);
    return;
  }
  state.modify.saving = true;
  dom.modifySave.disabled = true;
  let hitRateLimit = false;

    const eventData = {
      title,
      description,
      category: dom.modifyEventCategory.value,
      accessType: dom.modifyEventAccess.value,
      languages: state.modify.languages.slice(),
      platforms: state.modify.platforms.slice(),
      tags,
      imageId: dom.modifyEventImageId.value.trim() || null,
      roleIds: dom.modifyEventAccess.value === "group" ? state.modify.roleIds.slice() : [],
      featured: Boolean(dom.modifyFeatured?.checked)
    };
  try {
    const result = await modifyApi.updateEvent({
      groupId: event.groupId,
      eventId: event.id,
      eventData,
      timezone: dom.modifyEventTimezone.value,
      durationMinutes,
      manualDate,
      manualTime
    });
    if (!result?.ok) {
      if (isRateLimitError(result?.error)) {
        hitRateLimit = true;
        registerRateLimit(MODIFY_RATE_LIMIT_KEYS.update);
        showToast(t("common.rateLimitError"), true, { duration: 8000 });
        return;
      }
      showToast(result?.error?.message || t("modify.saveFailed"), true);
      return;
    }
    clearRateLimit(MODIFY_RATE_LIMIT_KEYS.update);
    showToast(t("modify.saved"));
    closeModifyModal();
    await refreshModifyEvents(modifyApi, { preserveSelection: true });
  } finally {
    state.modify.saving = false;
    if (!hitRateLimit) {
      dom.modifySave.disabled = false;
    } else {
      const remainingMs = getRateLimitRemainingMs(MODIFY_RATE_LIMIT_KEYS.update);
      if (remainingMs > 0) {
        window.setTimeout(() => {
          if (!state.modify.saving) {
            dom.modifySave.disabled = false;
          }
        }, remainingMs + 50);
      } else {
        dom.modifySave.disabled = false;
      }
    }
  }

  let removedOptimistic = false;
  if (event?.sourcePendingId && state.modify.optimisticEvents.has(event.sourcePendingId)) {
    state.modify.optimisticEvents.delete(event.sourcePendingId);
    removedOptimistic = true;
  }
  const eventSlotKey = getEventSlotKey(event);
  for (const [pendingId, entry] of state.modify.optimisticEvents.entries()) {
    const optimistic = entry?.event;
    if (!optimistic) {
      continue;
    }
    if (optimistic.eventId && event.id && optimistic.eventId === event.id) {
      state.modify.optimisticEvents.delete(pendingId);
      removedOptimistic = true;
      continue;
    }
    if (optimistic.id && event.id && optimistic.id === event.id) {
      state.modify.optimisticEvents.delete(pendingId);
      removedOptimistic = true;
      continue;
    }
    if (eventSlotKey && eventSlotKey === getEventSlotKey(optimistic)) {
      state.modify.optimisticEvents.delete(pendingId);
      removedOptimistic = true;
    }
  }
  if (removedOptimistic) {
    const refreshScrollPos = dom.modifyEventGrid ? dom.modifyEventGrid.scrollTop : 0;
    renderModifyEventGrid();
    renderModifyCount();
    if (dom.modifyEventGrid && refreshScrollPos > 0) {
      dom.modifyEventGrid.scrollTop = refreshScrollPos;
    }
  }
}

function handleProfileLoad() {
  const value = dom.modifyProfile.value;
  if (!value) {
    showToast(t("modify.profileSelectError"), true);
    return;
  }
  const [groupId, profileKey] = value.split("::");
  const profile = state.profiles?.[groupId]?.profiles?.[profileKey];
  if (!profile) {
    showToast(t("modify.profileLoadFailed"), true);
    return;
  }
  applyProfileToModifyForm(profile);
  showToast(t("modify.profileLoaded"));
}

// Track current refresh promise to fix race conditions.
let currentRefreshPromise = null;

export async function refreshModifyEvents(api, options = {}) {
  if (currentRefreshPromise) {
    await currentRefreshPromise;
    return;
  }

  currentRefreshPromise = performRefresh(api, options);
  try {
    await currentRefreshPromise;
  } finally {
    currentRefreshPromise = null;
  }
}

async function performRefresh(api, options = {}) {
  const { preserveScroll = true } = options;

  if (api) {
    modifyApi = api;
  }
  if (!modifyApi?.listGroupEvents || !dom.modifyGroup) {
    state.modify.events = [];
    state.modify.pendingEvents = [];
    renderModifyEventGrid();
    renderModifyCount();
    updateMissedBadge();
    return;
  }
  const groupId = dom.modifyGroup.value;
  if (!groupId) {
    state.modify.events = [];
    state.modify.pendingEvents = [];
    renderModifyEventGrid();
    renderModifyCount();
    updateMissedBadge();
    return;
  }

  const scrollPos = preserveScroll && dom.modifyEventGrid ? dom.modifyEventGrid.scrollTop : 0;

  state.modify.selectedGroupId = groupId;
  setModifyLoading(true);
  renderModifyEventGrid();

  try {
    // Fetch series, real events, pending events, and projected future events
    // in parallel.
    //
    // Series load is required so populateSeriesFilterOptions can resolve
    // human labels; without it, the filter shows "Series (cal_xxxxxxxx)"
    // fallback IDs. This also covers single-group users (no group switch
    // ever fires) and refresh-button presses where the group hasn't changed.
    //
    // Phase A projection: the engine generates pending events out to ~3
    // months. When the user picks a longer view filter (e.g. 6 months, 1
    // year), projection synthesizes additional pending-shaped events from
    // template patterns past the engine's horizon. They render identically
    // to scheduled pending events; only an isProjected flag differentiates
    // for edit/delete routing later.
    const rangeDays = Number.isFinite(state.modify.timeRangeDays) ? state.modify.timeRangeDays : 30;
    const projFromMs = Date.now();
    const projToMs = projFromMs + rangeDays * 24 * 60 * 60 * 1000;
    const [seriesResult, events, pendingResult, projectedResult] = await Promise.all([
      modifyApi.seriesList ? modifyApi.seriesList({ groupId }).catch(() => null) : Promise.resolve(null),
      modifyApi.listGroupEvents({ groupId, upcomingOnly: true }),
      modifyApi.getPendingEvents ? modifyApi.getPendingEvents({ groupId }) : Promise.resolve({ events: [], missedCount: 0 }),
      modifyApi.projectFutureEvents
        ? modifyApi.projectFutureEvents({ groupId, fromMs: projFromMs, toMs: projToMs }).catch(() => ({ events: [] }))
        : Promise.resolve({ events: [] })
    ]);
    if (seriesResult) {
      state.series[groupId] = seriesResult;
    }

    let filteredEvents = Array.isArray(events) ? events : [];

    // Filter out tombstoned (recently deleted) events.
    const now = Date.now();
    filteredEvents = filteredEvents.filter(event => {
      const tombstoneTime = state.modify.deletedTombstones.get(event.id);
      if (tombstoneTime && now - tombstoneTime < 60000) {
        return false;
      }
      return true;
    });

    state.modify.events = filteredEvents;

    populateSeriesFilterOptions(groupId, filteredEvents);

    // Merge projected events into pending; the renderer treats them
    // identically. Order: real pending first, then projected. Both are
    // sorted by scheduledPublishTime downstream in renderModifyEventGrid,
    // so the merge order doesn't matter for display.
    const pendingEvents = pendingResult?.events || [];
    const projectedEvents = projectedResult?.events || [];
    const combinedPending = pendingEvents.concat(projectedEvents);

    state.modify.pendingEvents = combinedPending;
    state.modify.missedCount = pendingResult?.missedCount || 0;
    state.modify.queuedCount = pendingResult?.queuedCount || 0;
    // Refresh per-template filter chips off the merged pending set so chips
    // appear for both committed and projected automation events.
    populateTemplatesFilterOptions(groupId, combinedPending);
    reconcileOptimisticEvents(filteredEvents, combinedPending, groupId);

    if (options.bypassCache) {
      clearRefreshBackoff();
    }
  } catch (err) {
    if (isRateLimitError(err)) {
      applyRefreshBackoff();
      throw err; // Re-throw for caller.
    }

    showToast(t("modify.loadFailed"), true);
    state.modify.events = [];
    state.modify.pendingEvents = [];
  } finally {
    setModifyLoading(false);
    renderModifyEventGrid();
    renderModifyCount();
    updateMissedBadge();

    if (preserveScroll && dom.modifyEventGrid && scrollPos > 0) {
      dom.modifyEventGrid.scrollTop = scrollPos;
    }
  }
}

function updateMissedBadge() {
  // Badge on the Modify Events nav button.
  const modifyNavBtn = Array.from(dom.navButtons || []).find(btn =>
    btn.dataset.view === "modify"
  );
  if (!modifyNavBtn) {
    return;
  }

  const existingBadge = modifyNavBtn.querySelector(".nav-badge");
  if (existingBadge) {
    existingBadge.remove();
  }

  if (state.modify.missedCount > 0) {
    const badge = document.createElement("span");
    badge.className = "nav-badge";
    badge.textContent = state.modify.missedCount > 9 ? "9+" : state.modify.missedCount;
    modifyNavBtn.appendChild(badge);
  }
}

export function initModifyEvents(api) {
  if (api) {
    modifyApi = api;
  }
  if (!dom.modifyEventGrid) {
    return;
  }

  // Refresh the view when an automated event is created.
  if (api?.onAutomationCreated) {
    api.onAutomationCreated((payload) => {
      if (payload?.pendingEvent) {
        upsertOptimisticEvent(payload.pendingEvent, payload.eventDetails, payload.eventId);
      }
      void refreshModifyEvents(modifyApi, { bypassCache: true });
    });
  }

  dom.modifyRefresh.addEventListener("click", () => { void handleRefreshClick(); });
  dom.modifyGroup.addEventListener("change", async () => {
    // Clear backoff and tombstones when switching groups.
    clearRefreshBackoff();
    state.modify.deletedTombstones.clear();
    state.modify.lastRefreshTime = 0;
    state.modify.optimisticEvents.clear();
    // Filters are scoped per session per group.
    resetModifyFilters();
    // Series load happens inside refreshModifyEvents so it covers
    // refresh-button presses and single-group users; no duplicate fetch here.
    void refreshModifyEvents(modifyApi);
  });
  // Time range dropdown persists across restarts via settings.
  if (dom.modifyTimeRange) {
    dom.modifyTimeRange.addEventListener("change", () => {
      const prevRangeDays = Number.isFinite(state.modify.timeRangeDays) ? state.modify.timeRangeDays : 30;
      const days = parseInt(dom.modifyTimeRange.value, 10);
      const newRangeDays = Number.isFinite(days) ? days : 90;
      state.modify.timeRangeDays = newRangeDays;
      if (modifyApi?.updateSettings) {
        modifyApi.updateSettings({ modifyTimeRangeDays: newRangeDays }).catch(() => {});
      }
      // Expanding range needs new projection data (engine's hard-generated
      // horizon plus the prior projection covers only up to the previous
      // toMs); trigger a full refresh. Narrowing is purely a re-render
      // since already-fetched projections cover the smaller window.
      if (newRangeDays > prevRangeDays) {
        void refreshModifyEvents(modifyApi, { preserveScroll: true });
      } else {
        renderModifyEventGrid();
      }
    });
  }
  if (dom.modifyFiltersBtn && dom.modifyFiltersPanel) {
    dom.modifyFiltersBtn.addEventListener("click", () => {
      dom.modifyFiltersPanel.classList.toggle("is-hidden");
    });
  }
  if (dom.modifyFilterPending) {
    dom.modifyFilterPending.addEventListener("change", () => {
      state.modify.filters.pending = dom.modifyFilterPending.checked;
      state.modify.showPending = dom.modifyFilterPending.checked; // legacy mirror
      renderModifyEventGrid();
    });
  }
  if (dom.modifyFilterStandalone) {
    dom.modifyFilterStandalone.addEventListener("change", () => {
      state.modify.filters.standalone = dom.modifyFilterStandalone.checked;
      renderModifyEventGrid();
    });
  }
  if (dom.modifyFilterModified) {
    dom.modifyFilterModified.addEventListener("change", () => {
      state.modify.filters.modified = dom.modifyFilterModified.checked;
      renderModifyEventGrid();
    });
  }
  if (dom.modifyClose) {
    dom.modifyClose.addEventListener("click", closeModifyModal);
  }
  if (dom.modifyCancel) {
    dom.modifyCancel.addEventListener("click", closeModifyModal);
  }
  if (dom.modifyOverlay) {
    dom.modifyOverlay.addEventListener("click", event => {
      if (event.target === dom.modifyOverlay) {
        closeModifyModal();
      }
    });
  }
  if (dom.modifySave) {
    dom.modifySave.addEventListener("click", handleModifySave);
  }
  if (dom.modifyProfileLoad) {
    dom.modifyProfileLoad.addEventListener("click", handleProfileLoad);
  }
  if (dom.modifyLanguageFilter) {
    dom.modifyLanguageFilter.addEventListener("input", renderModifyLanguageList);
  }
  if (dom.modifyEventDate) {
    const today = getTodayDateString();
    const maxDate = getMaxEventDateString();
    dom.modifyEventDate.min = today;
    dom.modifyEventDate.max = maxDate;
    dom.modifyEventDate.addEventListener("blur", () => {
      const selectedDate = dom.modifyEventDate.value;
      if (!selectedDate) {
        return;
      }
      const currentToday = getTodayDateString();
      const currentMax = getMaxEventDateString();
      if (selectedDate < currentToday) {
        showToast(t("events.pastDateError"), true);
        dom.modifyEventDate.value = currentToday;
      } else if (selectedDate > currentMax) {
        showToast(t("events.futureDateError"), true);
        dom.modifyEventDate.value = currentMax;
      }
    });
  }
  if (dom.modifyEventAccess) {
    dom.modifyEventAccess.addEventListener("change", handleModifyAccessChange);
  }
  if (dom.modifyEventDuration) {
    dom.modifyEventDuration.addEventListener("input", () => {
      dom.modifyEventDuration.value = sanitizeDurationInputValue(dom.modifyEventDuration.value);
      updateModifyDurationPreview();
    });
    dom.modifyEventDuration.addEventListener("blur", () => {
      normalizeDurationInput(dom.modifyEventDuration, 120);
      updateModifyDurationPreview();
    });
  }
  state.modify.tagInput = createTagInput({
    inputEl: dom.modifyEventTags,
    chipContainer: dom.modifyTagsChips,
    wrapperEl: dom.modifyTagsInput,
    maxTags: TAG_LIMIT
  });
  // Capture image URL from gallery selection for pending-event preview.
  if (dom.modifyEventImageId) {
    dom.modifyEventImageId.addEventListener("gallerySelect", evt => {
      state.modify.selectedImageUrl = evt.detail?.url || "";
    });
  }
  renderModifyLanguageList();
  renderModifyPlatformList();
}

export function syncModifyLocalization() {
  renderModifyLanguageList();
  renderModifyPlatformList();
  renderModifyCount();
  renderModifyEventGrid();
  void renderModifyRoleRestrictions();
}

export function initModifySelects() {
  if (!dom.modifyEventCategory || !dom.modifyEventAccess || !dom.modifyEventTimezone) {
    return;
  }
  renderSelect(dom.modifyEventCategory, CATEGORIES);
  renderSelect(dom.modifyEventAccess, ACCESS_TYPES);
  const { list, systemTz } = buildTimezones();
  renderSelect(dom.modifyEventTimezone, list);
  dom.modifyEventTimezone.value = systemTz;
}
