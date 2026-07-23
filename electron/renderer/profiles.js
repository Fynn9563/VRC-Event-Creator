import { EVENT_DESCRIPTION_LIMIT, EVENT_NAME_LIMIT, TAG_LIMIT, LANGUAGES, PLATFORMS, MONTHS, CATEGORIES, DATE_MODES } from "./config.js";
import { dom, state, setProfileEditConfirmed, getProfileEditConfirmed, getProfileWizard } from "./state.js";
import { t, getLanguageDisplayName } from "./i18n/index.js";
import { enforceTagsInput, sanitizeText, formatDuration, normalizeDurationInput, parseDurationInput, formatDurationPreview, enforceGroupAccess } from "./utils.js";
import { fetchGroupRoles, renderRoleList } from "./roles.js";
import { applySeriesToWizard, showScheduleMode } from "./series.js";
import { showToast, renderChecklist } from "./ui.js";

let roleFetchToken = 0;
let _discordApi = null;

function getDurationUnits() {
  return {
    day: t("common.durationUnits.day"),
    hour: t("common.durationUnits.hour"),
    minute: t("common.durationUnits.minute")
  };
}

function getRoleLabels() {
  return {
    allAccess: t("events.roleRestrictions.allAccess"),
    managementRoles: t("events.roleRestrictions.managementRoles"),
    roles: t("events.roleRestrictions.roles"),
    noRoles: t("events.roleRestrictions.noRoles")
  };
}

export async function renderProfileRoleRestrictions(api) {
  if (!dom.profileRoleRestrictions || !dom.profileRoleList) {
    return;
  }
  const groupId = dom.profileGroup.value;
  const isGroupAccess = dom.profileAccess.value === "group";
  const shouldShow = Boolean(groupId) && isGroupAccess;
  dom.profileRoleRestrictions.classList.toggle("is-hidden", !shouldShow);
  if (!shouldShow) {
    dom.profileRoleList.innerHTML = "";
    return;
  }
  const requestId = ++roleFetchToken;
  dom.profileRoleList.innerHTML = `<div class="hint">${t("common.loading")}</div>`;
  try {
    const roles = await fetchGroupRoles(api, groupId);
    if (requestId !== roleFetchToken) {
      return;
    }
    const validIds = new Set(roles.map(role => role.id));
    state.profile.roleIds = (state.profile.roleIds || []).filter(id => validIds.has(id));
    renderRoleList({
      container: dom.profileRoleList,
      roles,
      selectedIds: state.profile.roleIds,
      labels: getRoleLabels(),
      onChange: next => {
        state.profile.roleIds = next;
      }
    });
  } catch (err) {
    dom.profileRoleList.innerHTML = "";
    const empty = document.createElement("div");
    empty.className = "hint";
    empty.textContent = getRoleLabels().noRoles;
    dom.profileRoleList.appendChild(empty);
  }
}

export function renderProfileLanguageList() {
  if (!dom.profileLanguageList) return;
  renderChecklist(dom.profileLanguageList, LANGUAGES, state.profile.languages, {
    max: 3,
    filterText: dom.profileLanguageFilter?.value || "",
    getLabel: item => getLanguageDisplayName(item.value, item.label),
    onChange: next => {
      state.profile.languages = next;
      renderProfileLanguageList();
      if (dom.profileLanguageHint) {
        dom.profileLanguageHint.textContent = t("common.fields.languagesHint", { count: next.length });
      }
    }
  });
  if (dom.profileLanguageHint) {
    dom.profileLanguageHint.textContent = t("common.fields.languagesHint", { count: state.profile.languages.length });
  }
}

export function renderProfilePlatformList() {
  if (!dom.profilePlatformList) return;
  renderChecklist(dom.profilePlatformList, PLATFORMS, state.profile.platforms, {
    onChange: next => {
      state.profile.platforms = next;
      renderProfilePlatformList();
    }
  });
}

function formatPatternLabel(pattern) {
  const time = `${String(pattern.hour).padStart(2, "0")}:${String(pattern.minute).padStart(2, "0")}`;
  if (pattern.type === "annual") {
    const monthConfig = MONTHS.find(m => m.value === pattern.month);
    const monthKey = monthConfig?.labelKey || `common.months.${pattern.month}`;
    const translatedMonth = t(monthKey);
    const monthLabel = translatedMonth === monthKey ? (monthConfig?.label || `Month ${pattern.month}`) : translatedMonth;
    return t("profiles.patterns.format.annual", { month: monthLabel, day: pattern.day, time });
  }
  const weekdayKey = `common.weekdays.${pattern.weekday}`;
  const translatedWeekday = t(weekdayKey);
  const weekdayLabel = translatedWeekday === weekdayKey ? pattern.weekday : translatedWeekday;
  if (pattern.type === "every") return t("profiles.patterns.format.every", { weekday: weekdayLabel, time });
  if (pattern.type === "every-other") return t("profiles.patterns.format.everyOther", { weekday: weekdayLabel, time });
  if (pattern.type === "last") return t("profiles.patterns.format.last", { weekday: weekdayLabel, time });
  if (pattern.type === "nth") {
    const ordinalKey = `profiles.patterns.ordinal${pattern.occurrence}`;
    const ordinal = t(ordinalKey);
    return t("profiles.patterns.format.nth", {
      ordinal: ordinal === ordinalKey ? `${pattern.occurrence}` : ordinal,
      weekday: weekdayLabel,
      time
    });
  }
  return t("profiles.patterns.format.every", { weekday: weekdayLabel, time });
}

export function renderPatternList() {
  if (!dom.patternList) return;
  dom.patternList.innerHTML = "";
  if (!state.profile.patterns.length) {
    const empty = document.createElement("div");
    empty.className = "hint";
    empty.textContent = t("profiles.patterns.noPatterns");
    dom.patternList.appendChild(empty);
    return;
  }
  state.profile.patterns.forEach((pattern, index) => {
    const row = document.createElement("div");
    row.className = "pattern-item";
    const label = document.createElement("span");
    label.textContent = formatPatternLabel(pattern);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "ghost";
    remove.textContent = t("profiles.patterns.removeButton");
    remove.addEventListener("click", () => {
      state.profile.patterns.splice(index, 1);
      renderPatternList();
    });
    row.appendChild(label);
    row.appendChild(remove);
    dom.patternList.appendChild(row);
  });
}

export function updateProfileDurationPreview() {
  if (!dom.profileDurationPreview || !dom.profileDuration) {
    return;
  }
  dom.profileDurationPreview.textContent = formatDurationPreview(dom.profileDuration.value, getDurationUnits());
}

export function getProfileLabel(profileKey, profile) {
  const label = (profile?.displayName || "").trim();
  return label || profileKey;
}

export function slugifyProfileKey(value) {
  const base = (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base.slice(0, 40);
}

export function getUniqueProfileKey(groupId, baseKey) {
  const profiles = state.profiles?.[groupId]?.profiles || {};
  if (!profiles[baseKey]) {
    return baseKey;
  }
  let counter = 2;
  let nextKey = `${baseKey}-${counter}`;
  while (profiles[nextKey]) {
    counter += 1;
    nextKey = `${baseKey}-${counter}`;
  }
  return nextKey;
}

export function buildProfileKey(groupId, displayName, fallbackName) {
  const base = slugifyProfileKey(displayName || fallbackName);
  if (!base) {
    return `profile-${Date.now()}`;
  }
  return getUniqueProfileKey(groupId, base);
}

export function getUniqueDisplayName(groupId, baseName) {
  const profiles = state.profiles?.[groupId]?.profiles || {};
  const existingNames = Object.values(profiles).map(p => (p.displayName || "").trim().toLowerCase());
  const baseNameLower = baseName.trim().toLowerCase();

  if (!existingNames.includes(baseNameLower)) {
    return baseName.trim();
  }

  let counter = 1;
  let nextName = `${baseName.trim()} - ${counter}`;
  while (existingNames.includes(nextName.toLowerCase())) {
    counter += 1;
    nextName = `${baseName.trim()} - ${counter}`;
  }
  return nextName;
}

export function getGroupName(groupId) {
  const group = (state.groups || []).find(item => item.groupId === groupId);
  return group ? group.name : "Unknown Group";
}

function getGroupIconId(groupId) {
  const group = (state.groups || []).find(item => item.groupId === groupId);
  return group?.iconId || "";
}

export function setProfileMode(mode) {
  state.profile.mode = mode;
  dom.profileGroup.disabled = false;
}

function parseAutomationTimingInput(value) {
  const parsed = parseDurationInput(value);
  if (!parsed) {
    return { days: 0, hours: 0, minutes: 0, totalMinutes: 0 };
  }
  const totalMinutes = parsed.minutes;
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  return { days, hours, minutes, totalMinutes };
}

function formatAutomationTimingValue(days, hours, minutes) {
  let totalMinutes = (days * 1440) + (hours * 60) + minutes;
  const normDays = Math.floor(totalMinutes / 1440);
  const normHours = Math.floor((totalMinutes % 1440) / 60);
  const normMinutes = totalMinutes % 60;
  return `${String(normDays).padStart(2, "0")}:${String(normHours).padStart(2, "0")}:${String(normMinutes).padStart(2, "0")}`;
}

function resetAutomationForm() {
  if (dom.automationEnabled) dom.automationEnabled.checked = false;
  if (dom.automationSettings) dom.automationSettings.classList.add("is-hidden");
  if (dom.automationTimingMode) dom.automationTimingMode.value = "before";
  if (dom.automationTimingInput) dom.automationTimingInput.value = "07:00:00";
  if (dom.automationMonthlyDay) dom.automationMonthlyDay.value = "1";
  if (dom.automationMonthlyTime) dom.automationMonthlyTime.value = "18:00";
  if (dom.automationRepeatMode) dom.automationRepeatMode.value = "indefinite";
  if (dom.automationRepeatCount) dom.automationRepeatCount.value = "10";
  if (dom.automationOffsetSettings) dom.automationOffsetSettings.classList.remove("is-hidden");
  if (dom.automationMonthlySettings) dom.automationMonthlySettings.classList.add("is-hidden");
  if (dom.automationOffsetProse) dom.automationOffsetProse.classList.remove("is-hidden");
  if (dom.automationMonthlyProse) dom.automationMonthlyProse.classList.add("is-hidden");
  if (dom.automationRepeatCountField) dom.automationRepeatCountField.classList.add("is-hidden");
}

function applyAutomationToForm(automation) {
  if (!automation) {
    resetAutomationForm();
    return;
  }

  if (dom.automationEnabled) dom.automationEnabled.checked = automation.enabled || false;
  if (dom.automationSettings) dom.automationSettings.classList.toggle("is-hidden", !automation.enabled);
  if (dom.automationTimingMode) dom.automationTimingMode.value = automation.timingMode || "before";

  // Convert days/hours/minutes to DD:HH:MM format
  const days = automation.daysOffset ?? 7;
  const hours = automation.hoursOffset ?? 0;
  const minutes = automation.minutesOffset ?? 0;
  if (dom.automationTimingInput) {
    dom.automationTimingInput.value = formatAutomationTimingValue(days, hours, minutes);
  }

  if (dom.automationMonthlyDay) dom.automationMonthlyDay.value = String(automation.monthlyDay ?? 1);
  if (dom.automationMonthlyTime) {
    const hour = String(automation.monthlyHour ?? 18).padStart(2, "0");
    const minute = String(automation.monthlyMinute ?? 0).padStart(2, "0");
    dom.automationMonthlyTime.value = `${hour}:${minute}`;
  }
  if (dom.automationRepeatMode) dom.automationRepeatMode.value = automation.repeatMode || "indefinite";
  if (dom.automationRepeatCount) dom.automationRepeatCount.value = String(automation.repeatCount ?? 10);

  const isMonthly = automation.timingMode === "monthly";
  if (dom.automationOffsetSettings) dom.automationOffsetSettings.classList.toggle("is-hidden", isMonthly);
  if (dom.automationMonthlySettings) dom.automationMonthlySettings.classList.toggle("is-hidden", !isMonthly);
  if (dom.automationOffsetProse) dom.automationOffsetProse.classList.toggle("is-hidden", isMonthly);
  if (dom.automationMonthlyProse) dom.automationMonthlyProse.classList.toggle("is-hidden", !isMonthly);

  const isCount = automation.repeatMode === "count";
  if (dom.automationRepeatCountField) dom.automationRepeatCountField.classList.toggle("is-hidden", !isCount);

  if (window.updateAutomationProse) {
    window.updateAutomationProse();
  }

  if (window.updateRestorableCount) {
    window.updateRestorableCount();
  }
}

function getAutomationFromForm() {
  const timing = parseAutomationTimingInput(dom.automationTimingInput?.value);

  let monthlyHour = 18;
  let monthlyMinute = 0;
  if (dom.automationMonthlyTime?.value) {
    const [h, m] = dom.automationMonthlyTime.value.split(":").map(Number);
    if (!isNaN(h) && !isNaN(m)) {
      monthlyHour = h;
      monthlyMinute = m;
    }
  }

  return {
    enabled: dom.automationEnabled?.checked || false,
    timingMode: dom.automationTimingMode?.value || "before",
    daysOffset: timing.days,
    hoursOffset: timing.hours,
    minutesOffset: timing.minutes,
    monthlyDay: Number(dom.automationMonthlyDay?.value) || 1,
    monthlyHour,
    monthlyMinute,
    repeatMode: dom.automationRepeatMode?.value || "indefinite",
    repeatCount: Number(dom.automationRepeatCount?.value) || 10
  };
}

/** Format a millisecond offset as human text ("1 day and 3 hours"), reusing the prose keys. */
function offsetTextFromMs(ms) {
  const totalMin = Math.max(0, Math.round(ms / 60000));
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const minutes = totalMin % 60;
  const parts = [];
  if (days === 1) parts.push(t("profiles.automation.prose.day"));
  else if (days > 1) parts.push(t("profiles.automation.prose.days", { count: days }));
  if (hours === 1) parts.push(t("profiles.automation.prose.hour"));
  else if (hours > 1) parts.push(t("profiles.automation.prose.hours", { count: hours }));
  if (minutes === 1) parts.push(t("profiles.automation.prose.minute"));
  else if (minutes > 1) parts.push(t("profiles.automation.prose.minutes", { count: minutes }));
  if (!parts.length) return t("profiles.automation.prose.noTime");
  if (parts.length === 1) return parts[0];
  const and = t("profiles.automation.prose.and");
  if (parts.length === 2) return `${parts[0]} ${and} ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, ${and} ${parts[parts.length - 1]}`;
}

/**
 * Warn (never rewrite) when an automation offset doesn't fit the events' real
 * spacing. For "after" mode it measures the actual gap between occurrences (via
 * the main process) instead of guessing by pattern type. Async — callers fire
 * it without awaiting; the warning updates when the measurement returns.
 */
// Bumped on every call so a slower, superseded run (its async gap lookup still
// in flight) knows not to paint a warning after the form has moved on.
let offsetValidationSeq = 0;

export async function validateAndCorrectAutomationOffset() {
  const seq = ++offsetValidationSeq;
  const warningEl = document.getElementById("automation-offset-warning");
  const enabled = dom.automationEnabled?.checked;
  const timingMode = dom.automationTimingMode?.value;

  if (warningEl) warningEl.classList.add("is-hidden");
  if (!enabled || timingMode === "monthly") return;

  const timing = parseAutomationTimingInput(dom.automationTimingInput?.value);
  const offsetMs = (timing.days * 86400000) + (timing.hours * 3600000) + (timing.minutes * 60000);

  if (timingMode === "after") {
    const patterns = state.profile?.patterns || [];
    if (!patterns.length) return;
    const timezone = dom.profileTimezone?.value || state.profile?.timezone || "UTC";

    let minGapMs = null;
    try {
      minGapMs = await window.vrcEvent?.getMinPatternGap?.({ patterns, timezone });
    } catch (err) {
      return; // couldn't measure — leave the offset as typed, engine still handles it
    }
    // A newer validation started while we awaited (mode switched, more typing) —
    // it has already reset the warning, so don't paint a now-stale one over it.
    if (seq !== offsetValidationSeq) return;
    if (!minGapMs || minGapMs <= 0) return;

    const durationMin = parseDurationInput(dom.profileDuration?.value)?.minutes ?? 120;
    const durationMs = durationMin * 60000;
    const MIN_LEAD_MS = 15 * 60000;
    const usable = minGapMs - durationMs; // room an "after" offset has to fit
    if (usable <= 0) return;

    if (offsetMs >= usable) {
      // Would land at or after the next event — impossible as an "after" time.
      if (warningEl) {
        warningEl.textContent = t("profiles.automation.offsetImpossible");
        warningEl.classList.remove("is-hidden");
      }
    } else if (offsetMs > usable / 2) {
      // Past halfway toward the next event — will be shown/applied as "before".
      const beforeMs = Math.max(MIN_LEAD_MS, usable - offsetMs);
      if (warningEl) {
        warningEl.textContent = t("profiles.automation.offsetWillAdjust", {
          afterText: offsetTextFromMs(offsetMs),
          beforeText: offsetTextFromMs(beforeMs)
        });
        warningEl.classList.remove("is-hidden");
      }
    }
    return;
  }

  // "before" mode: announcements can stack freely (they don't wait for the
  // previous event to happen), so any offset is legal — nothing to adjust or
  // warn about. The warning was already hidden on entry.
}

export function resetProfileForm() {
  setProfileMode("create");
  setProfileEditConfirmed(false);
  state.profile.currentKey = null;
  state.profile.roleIds = [];
  if (dom.profileRoleRestrictions) {
    dom.profileRoleRestrictions.classList.add("is-hidden");
  }
  if (dom.profileRoleList) {
    dom.profileRoleList.innerHTML = "";
  }
  dom.profileDisplayName.value = "";
  dom.profileName.value = "";
  dom.profileDescription.value = "";
  dom.profileCategory.value = "hangout";
  if (state.profile.tagInput) {
    state.profile.tagInput.clear();
  } else {
    dom.profileTags.value = "";
  }
  dom.profileAccess.value = "public";
  enforceGroupAccess(dom.profileAccess, dom.profileGroup.value);
  dom.profileImageId.value = "";
  dom.profileDuration.value = formatDuration(120);
  updateProfileDurationPreview();

  const systemTz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  dom.profileTimezone.value = systemTz;

  dom.profileDateMode.value = "both";
  dom.profileSendNotification.checked = true;
  if (dom.profileFeatured) dom.profileFeatured.checked = false;
  if (dom.profileGroupFair) dom.profileGroupFair.checked = false;
  state.profile.languages = ["eng"];
  state.profile.platforms = ["standalonewindows", "android"];
  state.profile.patterns = [];

  // Default pattern type is not annual: show weekday, hide date.
  if (dom.patternType) dom.patternType.selectedIndex = 0;
  if (dom.patternWeekdayField) dom.patternWeekdayField.classList.remove("is-hidden");
  if (dom.patternDateField) dom.patternDateField.classList.add("is-hidden");

  resetAutomationForm();
  if (dom.automationRestore) {
    dom.automationRestore.disabled = true;
  }
  if (dom.automationRestoreCount) {
    dom.automationRestoreCount.textContent = "";
  }

  if (dom.discordSyncCheck) dom.discordSyncCheck.checked = true;
  if (dom.webhookPostCheck) dom.webhookPostCheck.checked = false;
  if (dom.calendarSyncCheck) dom.calendarSyncCheck.checked = false;
  if (dom.profileCalendarRemindersEnabled) dom.profileCalendarRemindersEnabled.checked = false;
  if (dom.profileCalendarRemindersList) dom.profileCalendarRemindersList.innerHTML = "";
  if (dom.profileCalendarRemindersList) dom.profileCalendarRemindersList.classList.add("is-hidden");
  if (dom.profileCalendarReminderAdd) dom.profileCalendarReminderAdd.classList.add("is-hidden");
  if (dom.profileCalendarRemindersHint) dom.profileCalendarRemindersHint.classList.add("is-hidden");
  if (dom.profileWebhookMessageEnabled) dom.profileWebhookMessageEnabled.checked = false;
  if (dom.profileWebhookMessage) dom.profileWebhookMessage.value = "";
  if (dom.profileWebhookImagePath) dom.profileWebhookImagePath.value = "";
  if (dom.profileWebhookMessageCard) dom.profileWebhookMessageCard.classList.add("is-hidden");
}

export function applyProfileToForm(groupId, profileKey) {
  const profile = state.profiles?.[groupId]?.profiles?.[profileKey];
  if (!profile) {
    return;
  }
  setProfileMode("edit");
  state.profile.currentKey = profileKey;

  if (!Array.from(dom.profileGroup.options).some(option => option.value === groupId)) {
    const option = document.createElement("option");
    option.value = groupId;
    option.textContent = `${getGroupName(groupId)} (no access)`;
    dom.profileGroup.appendChild(option);
  }

  dom.profileGroup.value = groupId;
  dom.profileDisplayName.value = getProfileLabel(profileKey, profile);
  dom.profileName.value = profile.name || "";
  dom.profileDescription.value = profile.description || "";
  dom.profileCategory.value = profile.category || "hangout";
  if (state.profile.tagInput) {
    state.profile.tagInput.setTags(profile.tags || []);
  } else {
    dom.profileTags.value = (profile.tags || []).join(", ");
  }
  dom.profileAccess.value = profile.accessType || "public";
  enforceGroupAccess(dom.profileAccess, groupId);
  state.profile.roleIds = Array.isArray(profile.roleIds) ? profile.roleIds.slice() : [];
  dom.profileImageId.value = profile.imageId || "";
  dom.profileDuration.value = formatDuration(profile.duration || 120);
  updateProfileDurationPreview();

  const systemTz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  dom.profileTimezone.value = profile.timezone || systemTz;

  dom.profileDateMode.value = profile.dateMode || "both";
  dom.profileSendNotification.checked = Boolean(profile.sendNotification);
  if (dom.profileFeatured) dom.profileFeatured.checked = Boolean(profile.featured);
  if (dom.profileGroupFair) dom.profileGroupFair.checked = Boolean(profile.groupFair);
  state.profile.languages = profile.languages ? profile.languages.slice() : [];
  state.profile.platforms = profile.platforms ? profile.platforms.slice() : [];
  state.profile.patterns = profile.patterns ? profile.patterns.slice() : [];

  applyAutomationToForm(profile.automation);

  // Existing templates must explicitly opt in to discord sync.
  if (dom.discordSyncCheck) {
    dom.discordSyncCheck.checked = profile.discordSync === true;
  }
  if (dom.webhookPostCheck) {
    dom.webhookPostCheck.checked = profile.webhookPost === true;
  }
  if (dom.calendarSyncCheck) {
    dom.calendarSyncCheck.checked = profile.calendarSync === true;
  }
  if (dom.profileCalendarRemindersEnabled) {
    dom.profileCalendarRemindersEnabled.checked = profile.calendarRemindersEnabled === true;
  }
  renderCalendarReminders(dom.profileCalendarRemindersList, profile.calendarReminders || []);
  const showReminders = profile.calendarRemindersEnabled === true;
  if (dom.profileCalendarRemindersList) dom.profileCalendarRemindersList.classList.toggle("is-hidden", !showReminders);
  if (dom.profileCalendarReminderAdd) dom.profileCalendarReminderAdd.classList.toggle("is-hidden", !showReminders);
  if (dom.profileCalendarRemindersHint) dom.profileCalendarRemindersHint.classList.toggle("is-hidden", !showReminders);
  if (dom.profileWebhookMessageEnabled) {
    dom.profileWebhookMessageEnabled.checked = profile.webhookMessageEnabled === true;
  }
  if (dom.profileWebhookMessage) {
    dom.profileWebhookMessage.value = profile.webhookMessage || "";
  }
  if (dom.profileWebhookMessageCard) {
    dom.profileWebhookMessageCard.classList.toggle("is-hidden", !profile.webhookMessageEnabled);
  }
  if (dom.profileWebhookImagePath) {
    dom.profileWebhookImagePath.value = profile.webhookImagePath || "";
  }
  updateDiscordVisibility();
  updateCalendarVisibility();
}

export function updateProfileActionButtons() {
  const hasSelection = Boolean(dom.profileExisting.value);
  const hasGroup = Boolean(dom.profileGroup.value);
  dom.profileEdit.classList.toggle("is-hidden", !hasSelection);
  dom.profileDelete.classList.toggle("is-hidden", !hasSelection);
  dom.profileEdit.disabled = !hasSelection;
  dom.profileDelete.disabled = !hasSelection;
  // Import enabled when group selected; export enabled when profile selected.
  if (dom.profileImportJson) {
    dom.profileImportJson.disabled = !hasGroup;
  }
  if (dom.profileExportJson) {
    dom.profileExportJson.disabled = !hasSelection;
  }
}

/** Render schedule list (templates + series) for a selected group. */
export function renderProfileList(api) {
  const groupId = dom.profileGroup.value;
  const currentValue = dom.profileExisting.value;
  const filterType = state.schedules?.filterType || "all";

  // Hide the "Choose a group" hint once a group is selected.
  if (dom.scheduleGroupHint) {
    dom.scheduleGroupHint.classList.toggle("is-hidden", Boolean(groupId));
  }

  if (!groupId) {
    dom.profileExisting.innerHTML = "";
    const option = document.createElement("option");
    option.value = "";
    option.textContent = t("common.errors.noGroup");
    dom.profileExisting.appendChild(option);
    dom.profileExisting.disabled = true;
    updateProfileActionButtons();
    return;
  }

  const groupData = state.profiles?.[groupId];
  const profiles = groupData?.profiles || {};
  const seriesMap = state.series?.[groupId] || {};

  const templateEntries = [];
  const seriesEntries = [];
  if (filterType === "all" || filterType === "templates") {
    Object.keys(profiles).forEach(profileKey => {
      templateEntries.push({
        label: getProfileLabel(profileKey, profiles[profileKey]),
        value: `${groupId}::${profileKey}`
      });
    });
  }
  if (filterType === "all" || filterType === "series") {
    Object.keys(seriesMap).forEach(seriesId => {
      const s = seriesMap[seriesId];
      seriesEntries.push({
        label: s.label || "Untitled Series",
        value: `series::${seriesId}`
      });
    });
  }
  const totalEntries = templateEntries.length + seriesEntries.length;

  dom.profileExisting.innerHTML = "";
  const placeholderOption = document.createElement("option");
  placeholderOption.value = "";
  // Filter-aware empty placeholder.
  if (totalEntries === 0) {
    if (filterType === "templates") {
      placeholderOption.textContent = t("schedules.empty.templates") || "No templates for this group.";
    } else if (filterType === "series") {
      placeholderOption.textContent = t("schedules.empty.series") || "No series for this group.";
    } else {
      placeholderOption.textContent = t("schedules.empty.all") || "No schedules for this group.";
    }
  } else {
    placeholderOption.textContent = t("profiles.existingProfilePlaceholder") || "Select…";
  }
  dom.profileExisting.appendChild(placeholderOption);

  const appendEntries = (entries) => {
    entries.forEach(entry => {
      const option = document.createElement("option");
      option.value = entry.value;
      option.textContent = entry.label;
      dom.profileExisting.appendChild(option);
    });
  };

  if (filterType === "all") {
    // Use optgroups when showing both.
    if (templateEntries.length) {
      const tplGroup = document.createElement("optgroup");
      tplGroup.label = t("common.labels.templates") || "Templates";
      templateEntries.forEach(entry => {
        const option = document.createElement("option");
        option.value = entry.value;
        option.textContent = entry.label;
        tplGroup.appendChild(option);
      });
      dom.profileExisting.appendChild(tplGroup);
    }
    if (seriesEntries.length) {
      const srGroup = document.createElement("optgroup");
      srGroup.label = t("common.labels.series") || "Series";
      seriesEntries.forEach(entry => {
        const option = document.createElement("option");
        option.value = entry.value;
        option.textContent = entry.label;
        srGroup.appendChild(option);
      });
      dom.profileExisting.appendChild(srGroup);
    }
  } else {
    // Single-type view: flat list, no optgroup needed.
    appendEntries(templateEntries);
    appendEntries(seriesEntries);
  }

  const allValues = [...templateEntries, ...seriesEntries].map(e => e.value);
  if (currentValue && allValues.includes(currentValue)) {
    dom.profileExisting.value = currentValue;
  }

  dom.profileExisting.disabled = totalEntries === 0;
  updateProfileActionButtons();
}

export function validateProfileBasics() {
  const displayName = dom.profileDisplayName.value.trim();
  const eventName = dom.profileName.value.trim();
  const description = dom.profileDescription.value.trim();
  const missing = [];

  if (!displayName) {
    missing.push(t("profiles.displayName") || "Schedule name");
  }
  if (!eventName) {
    missing.push(t("common.fields.eventName") || "Event name");
  }
  if (!description) {
    missing.push(t("common.fields.description") || "Description");
  }

  if (missing.length) {
    const verb = missing.length === 1 ? "is" : "are";
    return { valid: false, message: `${missing.join(", ")} ${verb} required.` };
  }

  return { valid: true };
}

// Mirror a renderer log line to console AND the persistent debug log file.
function _wlog(message) {
  console.log("[wizard]", message);
  if (window.vrcEvent?.debugLog) {
    window.vrcEvent.debugLog({ context: "wizard", message: typeof message === "string" ? message : JSON.stringify(message) }).catch(() => {});
  }
}

export function handleProfileWizardStepChange({ current, next }) {
  _wlog(`step change current=${current} next=${next} selected=${dom.profileExisting?.value || ""} editConfirmed=${getProfileEditConfirmed()}`);
  if (next < current) {
    // Returning from a later step rebuilds list DOMs from state. Without this,
    // a fresh schedule (state.profile.* wiped) would show stale rows from the
    // previously-edited template. v1.0 invariant.
    if (next === 0) {
      renderProfileLanguageList();
      renderProfilePlatformList();
      renderPatternList();
    }
    syncStep3Mode(next);
    return true;
  }
  if (next === current) {
    return true;
  }

  if (current === 0 && next > 0) {
    if (!dom.profileGroup.value) {
      _wlog("blocked: no group");
      showToast(t("common.errors.noGroup") || "Select a group.", true);
      return false;
    }
    const selected = dom.profileExisting?.value || "";
    if (selected) {
      const groupId = dom.profileGroup.value;
      _wlog(`forward with selection: ${selected} editingType=${state.schedules?.editingType}`);
      if (selected.startsWith("series::")) {
        const seriesId = selected.slice("series::".length);
        const seriesData = state.series?.[groupId]?.[seriesId];
        state.schedules.editingType = "series";
        state.schedules.editingSeriesId = seriesId;
        if (seriesData) {
          _wlog("applying series data to wizard");
          applySeriesToWizard(seriesData);
          showScheduleMode("series", { lock: true });
        } else {
          _wlog(`series data missing for ${groupId} / ${seriesId}; have keys: ${Object.keys(state.series?.[groupId] || {}).join(",")}`);
        }
      } else {
        const parts = selected.split("::");
        const profileKey = parts.slice(1).join("::");
        if (groupId && profileKey) {
          state.schedules.editingType = "template";
          state.schedules.editingSeriesId = null;
          applyProfileToForm(groupId, profileKey);
          showScheduleMode("template", { lock: true });
        }
      }
      // Repaint list DOMs from the just-loaded state.profile.* so step 3
      // reflects the selected template/series instead of the previous one.
      renderProfileLanguageList();
      renderProfilePlatformList();
      renderPatternList();
      setProfileEditConfirmed(true);
    } else if (!getProfileEditConfirmed()) {
      _wlog("no selection; resetting form (New flow)");
      resetProfileForm();
      // resetProfileForm clears state but list DOMs are rendered separately,
      // so wipe them here too to drop stale rows from the prior edit.
      renderProfileLanguageList();
      renderProfilePlatformList();
      renderPatternList();
      updateProfileActionButtons();
    }
  }

  if (next > 1) {
    const validation = validateProfileBasics();
    _wlog(`validation valid=${validation.valid} msg="${validation.message || ""}" displayName="${dom.profileDisplayName?.value || ""}" name="${dom.profileName?.value || ""}" descLen=${dom.profileDescription?.value?.length || 0}`);
    if (!validation.valid) {
      showToast(validation.message, true);
      return false;
    }
  }

  // Entering step 3 (index 2): make the chooser/mode visible per editingType.
  if (next === 2) {
    syncStep3Mode(next);
  }

  return true;
}

// Sync step 3 mode container visibility based on state.schedules.editingType.
// Defaults to "template" if no type was chosen yet (toggle always shows one).
function syncStep3Mode(stepIndex) {
  if (stepIndex !== 2) return;
  const editingType = state.schedules?.editingType || "template";
  // Auto-default to template on first landing without a type.
  if (!state.schedules?.editingType) {
    state.schedules.editingType = "template";
  }
  if (dom.scheduleModeTemplate) {
    dom.scheduleModeTemplate.classList.toggle("is-hidden", editingType !== "template");
  }
  if (dom.scheduleModeSeries) {
    dom.scheduleModeSeries.classList.toggle("is-hidden", editingType !== "series");
  }
  if (dom.scheduleTypeTemplateBtn) {
    dom.scheduleTypeTemplateBtn.classList.toggle("is-active", editingType === "template");
  }
  if (dom.scheduleTypeSeriesBtn) {
    dom.scheduleTypeSeriesBtn.classList.toggle("is-active", editingType === "series");
  }
  if (dom.scheduleModeBlurbTemplate) {
    dom.scheduleModeBlurbTemplate.classList.toggle("is-hidden", editingType !== "template");
  }
  if (dom.scheduleModeBlurbSeries) {
    dom.scheduleModeBlurbSeries.classList.toggle("is-hidden", editingType !== "series");
  }
}

export function handleProfileGroupChange(api) {
  setProfileEditConfirmed(false);
  state.profile.currentKey = null;
  resetProfileForm();
  enforceGroupAccess(dom.profileAccess, dom.profileGroup.value);
  dom.profileExisting.value = "";
  updateProfileActionButtons();
  void renderProfileRoleRestrictions(api);
  void updateProfileTogglesVisibility(api);
  updateDiscordVisibility();
  updateCalendarVisibility();

  const wizard = getProfileWizard();
  if (wizard) {
    wizard.goTo(0);
  }
}

async function updateProfileTogglesVisibility(api) {
  if (!dom.profileFeaturedField || !dom.profileGroupFairField) return;
  const groupId = dom.profileGroup.value;
  if (!groupId) {
    dom.profileFeaturedField.classList.add("is-hidden");
    dom.profileGroupFairField.classList.add("is-hidden");
    return;
  }
  try {
    const flags = await api.checkFeatureFlags(groupId);
    dom.profileFeaturedField.classList.toggle("is-hidden", !flags.hasFeaturedEvents);
    dom.profileGroupFairField.classList.toggle("is-hidden", !flags.hasGroupFair);
  } catch (err) {
    console.error("Failed to check feature flags:", err);
    dom.profileFeaturedField.classList.add("is-hidden");
    dom.profileGroupFairField.classList.add("is-hidden");
  }
}

export function handleProfileNew() {
  if (!dom.profileGroup.value) {
    return { success: false, message: t("profiles.selectGroupFirst") };
  }

  setProfileEditConfirmed(false);
  resetProfileForm();
  dom.profileExisting.value = "";
  updateProfileActionButtons();

  const wizard = getProfileWizard();
  if (wizard) {
    wizard.goTo(1);
  }

  return { success: true };
}

export function handleProfileEdit() {
  if (!dom.profileExisting.value) {
    return { success: false, message: t("profiles.selectProfileToEdit") };
  }

  setProfileEditConfirmed(true);

  const wizard = getProfileWizard();
  if (wizard) {
    wizard.goTo(1);
  }

  return { success: true };
}

export function handleProfileSelection(api) {
  setProfileEditConfirmed(false);
  const selected = dom.profileExisting.value;

  if (!selected) {
    resetProfileForm();
    updateProfileActionButtons();
    void renderProfileRoleRestrictions(api);
    return;
  }

  const [groupId, profileKey] = selected.split("::");
  applyProfileToForm(groupId, profileKey);
  updateProfileActionButtons();
  void renderProfileRoleRestrictions(api);
}

export function handleProfileAccessChange(api) {
  enforceGroupAccess(dom.profileAccess, dom.profileGroup.value);
  void renderProfileRoleRestrictions(api);
}

export async function handleProfileSave(api) {
  const groupId = dom.profileGroup.value;
  if (!groupId) {
    return { success: false, message: t("common.errors.noGroup") };
  }
  enforceGroupAccess(dom.profileAccess, groupId);

  const displayNameInput = dom.profileDisplayName.value.trim();
  const eventName = sanitizeText(dom.profileName.value, {
    maxLength: EVENT_NAME_LIMIT,
    allowNewlines: false,
    trim: true
  });
  dom.profileName.value = eventName;
  const description = sanitizeText(dom.profileDescription.value, {
    maxLength: EVENT_DESCRIPTION_LIMIT,
    allowNewlines: true,
    trim: true
  });
  dom.profileDescription.value = description;
  let profileKey = state.profile.currentKey;

  if (state.profile.mode !== "edit") {
    profileKey = buildProfileKey(groupId, displayNameInput, eventName);
  } else if (!profileKey) {
    const selected = dom.profileExisting.value;
    profileKey = selected ? selected.split("::")[1] : null;
  }

  if (!profileKey) {
    return { success: false, message: t("profiles.profileKeyGen") };
  }

  state.profile.currentKey = profileKey;
  const displayName = displayNameInput || eventName || profileKey;

  if (state.profile.tagInput) {
    state.profile.tagInput.commit();
  }
  const tags = state.profile.tagInput
    ? state.profile.tagInput.getTags()
    : enforceTagsInput(dom.profileTags, TAG_LIMIT);

  if (state.profile.languages.length > 3) {
    return { success: false, message: t("common.errors.maxLanguages") };
  }

  let duration = parseDurationInput(dom.profileDuration.value)?.minutes ?? null;
  if (!duration) {
    duration = normalizeDurationInput(dom.profileDuration, 120);
  }
  if (!duration || duration < 1) {
    return { success: false, message: t("common.errors.durationError") };
  }

  const roleIds = dom.profileAccess.value === "group"
    ? (state.profile.roleIds || []).filter(id => typeof id === "string" && id.trim())
    : [];

  const profilePayload = {
    groupId,
    groupName: getGroupName(groupId),
    groupIconId: getGroupIconId(groupId),
    profileKey,
    data: {
      displayName,
      name: eventName,
      description,
      category: dom.profileCategory.value,
      languages: state.profile.languages.slice(),
      platforms: state.profile.platforms.slice(),
      tags,
      accessType: dom.profileAccess.value,
      roleIds,
      imageId: dom.profileImageId.value.trim() || null,
      duration,
      sendNotification: Boolean(dom.profileSendNotification.checked),
      featured: Boolean(dom.profileFeatured?.checked),
      groupFair: Boolean(dom.profileGroupFair?.checked),
      timezone: dom.profileTimezone.value,
      dateMode: dom.profileDateMode.value,
      patterns: state.profile.patterns.slice(),
      automation: getAutomationFromForm(),
      discordSync: dom.discordSyncCheck ? dom.discordSyncCheck.checked : true,
      webhookPost: dom.webhookPostCheck ? dom.webhookPostCheck.checked : false,
      calendarSync: dom.calendarSyncCheck ? dom.calendarSyncCheck.checked : true,
      calendarRemindersEnabled: dom.profileCalendarRemindersEnabled ? dom.profileCalendarRemindersEnabled.checked : false,
      calendarReminders: readCalendarRemindersFromDom(dom.profileCalendarRemindersList),
      webhookMessageEnabled: dom.profileWebhookMessageEnabled ? dom.profileWebhookMessageEnabled.checked : false,
      webhookMessage: dom.profileWebhookMessage ? dom.profileWebhookMessage.value : "",
      webhookImagePath: dom.profileWebhookImagePath ? dom.profileWebhookImagePath.value : ""
    }
  };

  try {
    if (state.profile.mode === "edit") {
      await api.updateProfile(profilePayload);
      return {
        success: true,
        message: t("profiles.updated"),
        groupId,
        profileKey,
        wasEdit: true
      };
    } else {
      await api.createProfile(profilePayload);
      return {
        success: true,
        message: t("profiles.created"),
        groupId,
        profileKey,
        wasEdit: false
      };
    }
  } catch (err) {
    return {
      success: false,
      message: err?.message || "Could not save profile."
    };
  }
}

export async function handleProfileDelete(api) {
  const selected = dom.profileExisting.value;
  if (!selected) {
    return { success: false, message: t("profiles.noProfileSelected") };
  }

  const [groupId, profileKey] = selected.split("::");
  const profile = state.profiles?.[groupId]?.profiles?.[profileKey];
  const label = getProfileLabel(profileKey, profile);

  const confirmDelete = window.confirm(t("profiles.confirmDelete", { name: label }));
  if (!confirmDelete) {
    return { success: false, cancelled: true };
  }

  try {
    await api.deleteProfile({ groupId, profileKey });
    return {
      success: true,
      message: t("profiles.deleted")
    };
  } catch (err) {
    return {
      success: false,
      message: t("profiles.deleteFailed")
    };
  }
}

export async function refreshProfiles(api) {
  try {
    state.profiles = await api.getProfiles();
    return { success: true };
  } catch (err) {
    return {
      success: false,
      message: t("profiles.loadFailed")
    };
  }
}

export async function handleProfileExportJson(api) {
  try {
    const selected = dom.profileExisting.value;
    if (!selected) {
      return { success: false, message: t("profiles.noProfileForExport") };
    }

    const [groupId, profileKey] = selected.split("::");
    const profile = state.profiles?.[groupId]?.profiles?.[profileKey];
    if (!profile) {
      return { success: false, message: t("profiles.profileNotFound") };
    }

    const exportData = {
      displayName: profile.displayName || "",
      name: profile.name || "",
      description: profile.description || "",
      category: profile.category || "hangout",
      tags: profile.tags || [],
      accessType: profile.accessType || "public",
      roleIds: profile.roleIds || [],
      imageId: profile.imageId || "",
      sendNotification: profile.sendNotification ?? false,
      featured: profile.featured ?? false,
      groupFair: profile.groupFair ?? false,
      duration: profile.duration || 120,
      timezone: profile.timezone || "",
      languages: profile.languages || [],
      platforms: profile.platforms || [],
      dateMode: profile.dateMode || "manual",
      patterns: profile.patterns || [],
      automation: profile.automation || null
    };

    if (exportData.imageId) {
      try {
        const imageData = await api.getImageAsBase64(exportData.imageId);
        if (imageData) {
          exportData.imageBase64 = imageData;
        }
      } catch (imgErr) {
        console.warn("Could not include image in profile export:", imgErr);
      }
    }

    const result = await api.exportProfileJson(exportData);
    if (!result) {
      return { success: false, message: t("common.errors.exportFailed") };
    }
    if (result.cancelled) {
      return { success: false, cancelled: true };
    }
    if (!result.ok) {
      return { success: false, message: result.error?.message || "Could not export profile JSON." };
    }
    return { success: true };
  } catch (err) {
    return { success: false, message: err.message || t("common.errors.exportFailed") };
  }
}

export async function handleProfileImportJson(api) {
  try {
    const result = await api.importProfileJson();
    if (!result) {
      return { success: false, message: t("common.errors.importFailed") };
    }
    if (result.cancelled) {
      return { success: false, cancelled: true };
    }
    if (!result.ok) {
      const errorMessage = result.error?.message || "Could not import profile JSON.";
      return { success: false, message: errorMessage };
    }
    return await applyImportedJsonToProfileForm(result.data, api);
  } catch (err) {
    return { success: false, message: err.message || t("common.errors.importFailed") };
  }
}

async function applyImportedJsonToProfileForm(data, api) {
  if (!data || typeof data !== "object") {
    return { success: false, message: t("common.errors.invalidJson") };
  }

  // Detect event JSON vs profile JSON: events have startDate/endDate/worldId
  // (none of which exist on profiles); profiles require displayName.
  const hasEventFields = data.startDate !== undefined || data.endDate !== undefined || data.worldId !== undefined;
  const hasProfileFields = data.displayName !== undefined;
  if (hasEventFields || !hasProfileFields) {
    return { success: false, message: t("profiles.importWrongType") || "This appears to be an event JSON. Please use Import Event instead." };
  }

  // Image: prefer existing gallery imageId; otherwise upload base64.
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
      console.warn("Could not check/upload imported profile image:", imgErr);
    }
  } else if (autoUpload && data.imageBase64 && typeof data.imageBase64 === "string") {
    try {
      const uploadResult = await api.uploadGalleryImageBase64(data.imageBase64);
      if (uploadResult?.ok && uploadResult?.data?.id) {
        data.imageId = uploadResult.data.id;
      }
    } catch (imgErr) {
      console.warn("Could not upload imported profile image:", imgErr);
    }
  }

  // Display name must be unique within the selected group.
  const selectedGroupId = dom.profileGroup.value;
  let displayName = (data.displayName && typeof data.displayName === "string")
    ? data.displayName.trim()
    : "";
  if (displayName && selectedGroupId) {
    displayName = getUniqueDisplayName(selectedGroupId, displayName);
  }
  dom.profileDisplayName.value = displayName;

  dom.profileName.value = (data.name && typeof data.name === "string")
    ? sanitizeText(data.name, {
        maxLength: EVENT_NAME_LIMIT,
        allowNewlines: false,
        trim: true
      })
    : "";

  dom.profileDescription.value = (data.description && typeof data.description === "string")
    ? sanitizeText(data.description, {
        maxLength: EVENT_DESCRIPTION_LIMIT,
        allowNewlines: true,
        trim: true
      })
    : "";

  const validCategories = CATEGORIES.map(c => c.value);
  if (data.category && validCategories.includes(data.category)) {
    dom.profileCategory.value = data.category;
  } else {
    dom.profileCategory.value = "hangout";
  }

  const tags = Array.isArray(data.tags)
    ? data.tags.filter(t => typeof t === "string").slice(0, TAG_LIMIT)
    : [];
  if (state.profile.tagInput) {
    state.profile.tagInput.setTags(tags);
  } else {
    dom.profileTags.value = tags.join(", ");
  }

  const validAccessTypes = ["public", "members", "group"];
  if (data.accessType && validAccessTypes.includes(data.accessType)) {
    dom.profileAccess.value = data.accessType;
  } else {
    dom.profileAccess.value = "public";
  }

  state.profile.roleIds = Array.isArray(data.roleIds)
    ? data.roleIds.filter(id => typeof id === "string" && id.trim())
    : [];

  dom.profileImageId.value = (data.imageId && typeof data.imageId === "string")
    ? data.imageId.trim()
    : "";

  dom.profileSendNotification.checked = typeof data.sendNotification === "boolean"
    ? data.sendNotification
    : false;

  if (dom.profileFeatured) {
    dom.profileFeatured.checked = typeof data.featured === "boolean"
      ? data.featured
      : false;
  }

  if (dom.profileGroupFair) {
    dom.profileGroupFair.checked = typeof data.groupFair === "boolean"
      ? data.groupFair
      : false;
  }

  if (typeof data.duration === "number" && data.duration > 0) {
    dom.profileDuration.value = formatDuration(data.duration);
  } else {
    dom.profileDuration.value = formatDuration(120);
  }
  updateProfileDurationPreview();

  if (data.timezone && typeof data.timezone === "string") {
    dom.profileTimezone.value = data.timezone;
  }

  // Languages/platforms: only overwrite if provided with valid non-empty values.
  if (Array.isArray(data.languages)) {
    const validLanguages = data.languages.filter(l => typeof l === "string" && l.trim()).slice(0, 3);
    if (validLanguages.length > 0) {
      state.profile.languages = validLanguages;
    }
  }

  if (Array.isArray(data.platforms)) {
    const validPlatforms = data.platforms.filter(p => typeof p === "string" && p.trim());
    if (validPlatforms.length > 0) {
      state.profile.platforms = validPlatforms;
    }
  }

  const validDateModes = DATE_MODES.map(m => m.value);
  if (data.dateMode && validDateModes.includes(data.dateMode)) {
    dom.profileDateMode.value = data.dateMode;
  } else {
    dom.profileDateMode.value = "pattern";
  }

  if (Array.isArray(data.patterns)) {
    state.profile.patterns = data.patterns.filter(p => p && typeof p === "object");
  }

  if (data.automation && typeof data.automation === "object") {
    applyAutomationToForm(data.automation);
  }

  setProfileMode("new");
  state.profile.currentKey = null;
  dom.profileExisting.value = "";
  // Mark as confirmed so wizard navigation doesn't reset the form.
  setProfileEditConfirmed(true);
  updateProfileActionButtons();

  void renderProfileRoleRestrictions(api);

  return { success: true, needsUiUpdate: true };
}

/** Check if a group has Discord configured. */
export function isGroupDiscordConfigured(groupId) {
  if (!groupId || state.settings?.discordEnabled !== true) return false;
  const groupData = (state.profiles || {})[groupId];
  return !!(groupData?.discordBotToken && groupData?.discordGuildId);
}

export function isGroupWebhookConfigured(groupId) {
  if (!groupId || state.settings?.discordEnabled !== true) return false;
  const groupData = (state.profiles || {})[groupId];
  return !!(groupData?.webhookUrl);
}

export function isGroupKitActive(groupId) {
  if (!groupId) return false;
  return (state.kitGroupIds || []).includes(groupId);
}

/**
 * Show/hide Discord panel in settings and sync toggle in profile editor.
 * @param {{ expandPanel?: boolean }} [options]
 *   expandPanel: force expand/collapse the Discord settings panel.
 */
export function updateDiscordVisibility({ expandPanel } = {}) {
  const enabled = state.settings?.discordEnabled === true;
  if (dom.discordSettingsCaret) {
    dom.discordSettingsCaret.classList.toggle("is-hidden", !enabled);
  }
  if (dom.discordSettingsPanel) {
    if (!enabled) {
      dom.discordSettingsPanel.classList.add("is-hidden");
      if (dom.discordSettingsCaret) dom.discordSettingsCaret.classList.remove("is-expanded");
    } else if (expandPanel === true) {
      dom.discordSettingsPanel.classList.remove("is-hidden");
      if (dom.discordSettingsCaret) dom.discordSettingsCaret.classList.add("is-expanded");
    } else if (expandPanel === false) {
      dom.discordSettingsPanel.classList.add("is-hidden");
      if (dom.discordSettingsCaret) dom.discordSettingsCaret.classList.remove("is-expanded");
    }
    // expandPanel undefined (e.g. on load): panel stays hidden, caret collapsed.
  }
  if (dom.discordSyncField) {
    dom.discordSyncField.classList.toggle("is-hidden", !isGroupDiscordConfigured(dom.profileGroup?.value));
  }
  if (dom.eventDiscordSyncField) {
    dom.eventDiscordSyncField.classList.toggle("is-hidden", !isGroupDiscordConfigured(dom.eventGroup?.value));
  }
  if (dom.webhookPostField) {
    dom.webhookPostField.classList.toggle("is-hidden", !isGroupWebhookConfigured(dom.profileGroup?.value));
  }
  if (dom.eventWebhookPostField) {
    dom.eventWebhookPostField.classList.toggle("is-hidden", !isGroupWebhookConfigured(dom.eventGroup?.value));
  }
  const calendarEnabled = state.settings?.calendarEnabled === true;
  if (dom.calendarSyncField) {
    dom.calendarSyncField.classList.toggle("is-hidden", !calendarEnabled);
  }
  if (dom.eventCalendarCreateField) {
    dom.eventCalendarCreateField.classList.toggle("is-hidden", !calendarEnabled);
  }
  if (dom.discordWebhookField) {
    dom.discordWebhookField.classList.toggle("is-hidden", !enabled);
  }
  const webhookToggled = enabled && dom.discordWebhookEnabledCheck?.checked === true;
  if (dom.discordWebhookTestBtn) {
    dom.discordWebhookTestBtn.classList.toggle("is-hidden", !webhookToggled);
  }
  // Import Kit visible only when webhook is on AND no kit active for this group.
  const selectedGroupId = dom.discordGroupSelect?.value;
  const kitActiveForGroup = selectedGroupId && isGroupKitActive(selectedGroupId);
  if (dom.eckitImportBtn) {
    dom.eckitImportBtn.classList.toggle("is-hidden", !webhookToggled || kitActiveForGroup);
  }
  // Kit-unlocked webhook message toggle: depends on webhookPost, not calendar+discord.
  const profileGroupId = dom.profileGroup?.value;
  const profileKitActive = isGroupKitActive(profileGroupId) && dom.webhookPostCheck?.checked;
  if (dom.profileWebhookMessageField) {
    dom.profileWebhookMessageField.classList.toggle("is-hidden", !profileKitActive);
  }
  if (!profileKitActive && dom.profileWebhookMessageCard) {
    dom.profileWebhookMessageCard.classList.add("is-hidden");
  }
  const eventGroupId = dom.eventGroup?.value;
  const eventKitActive = isGroupKitActive(eventGroupId) && dom.eventWebhookPostCheck?.checked;
  if (dom.eventWebhookMessageField) {
    dom.eventWebhookMessageField.classList.toggle("is-hidden", !eventKitActive);
  }
  if (!eventKitActive && dom.eventWebhookMessageInput) {
    dom.eventWebhookMessageInput.classList.add("is-hidden");
  }
  // Hide the announcements card entirely when no toggles inside are visible.
  if (dom.profileAnnouncementsCard) {
    const anyVisible = (dom.discordSyncField && !dom.discordSyncField.classList.contains("is-hidden"))
      || (dom.webhookPostField && !dom.webhookPostField.classList.contains("is-hidden"))
      || (dom.profileWebhookMessageField && !dom.profileWebhookMessageField.classList.contains("is-hidden"));
    dom.profileAnnouncementsCard.classList.toggle("is-hidden", !anyVisible);
  }
}

/**
 * Update visibility of calendar-related fields across the app. Called when
 * calendarEnabled setting changes or when profile calendar sync toggles.
 */
export function updateCalendarVisibility() {
  const calendarEnabled = state.settings?.calendarEnabled === true;
  if (dom.profileCalendarInviteCard) {
    dom.profileCalendarInviteCard.classList.toggle("is-hidden", !calendarEnabled);
  }
  // Reminders subsection: visible when the Create .ics toggle is checked.
  if (dom.profileCalendarRemindersCard) {
    const calendarSyncOn = calendarEnabled && dom.calendarSyncCheck?.checked === true;
    dom.profileCalendarRemindersCard.classList.toggle("is-hidden", !calendarSyncOn);
  }
  if (dom.eventCalendarCreateField) {
    dom.eventCalendarCreateField.classList.toggle("is-hidden", !calendarEnabled);
  }
  const eventCalendarOn = calendarEnabled && dom.eventCalendarCreateCheck?.checked === true;
  if (dom.eventCalendarRemindersEnabledField) {
    dom.eventCalendarRemindersEnabledField.classList.toggle("is-hidden", !eventCalendarOn);
  }
  const eventRemindersOn = eventCalendarOn && dom.eventCalendarRemindersEnabled?.checked === true;
  if (dom.eventCalendarRemindersList) {
    dom.eventCalendarRemindersList.classList.toggle("is-hidden", !eventRemindersOn);
  }
  if (dom.eventCalendarReminderAdd) {
    dom.eventCalendarReminderAdd.classList.toggle("is-hidden", !eventRemindersOn);
  }
  if (dom.eventCalendarRemindersHint) {
    dom.eventCalendarRemindersHint.classList.toggle("is-hidden", !eventRemindersOn);
  }
  if (dom.calendarSaveDirMeta) {
    dom.calendarSaveDirMeta.classList.toggle("is-hidden", !calendarEnabled);
  }
}

// Standard reminder presets that work across all calendar clients (Outlook included).
const REMINDER_PRESETS = [
  { value: 5, unit: "minutes" },
  { value: 10, unit: "minutes" },
  { value: 15, unit: "minutes" },
  { value: 30, unit: "minutes" },
  { value: 1, unit: "hours" },
  { value: 2, unit: "hours" },
  { value: 4, unit: "hours" },
  { value: 8, unit: "hours" },
  { value: 12, unit: "hours" },
  { value: 1, unit: "days" },
  { value: 2, unit: "days" },
  { value: 7, unit: "days" }
];

function reminderToKey(r) {
  return `${r.value}:${r.unit}`;
}

function reminderLabel(r) {
  const unitLabel = t(`settings.calendar.unit.${r.unit}`) || r.unit;
  return `${r.value} ${unitLabel}`;
}

/** Render calendar reminder rows into a target container element. */
export function renderCalendarReminders(container, reminders) {
  if (!container) return;
  container.innerHTML = "";
  (reminders || []).forEach(reminder => {
    addCalendarReminderRow(container, reminder);
  });
}

/** Add a single calendar reminder row with a preset dropdown. */
export function addCalendarReminderRow(container, reminder) {
  if (!container) return;
  const row = document.createElement("div");
  row.className = "calendar-reminder-row";

  const select = document.createElement("select");
  select.className = "calendar-reminder-preset";
  const currentKey = reminderToKey(reminder);

  REMINDER_PRESETS.forEach(preset => {
    const opt = document.createElement("option");
    opt.value = reminderToKey(preset);
    opt.textContent = reminderLabel(preset);
    if (reminderToKey(preset) === currentKey) opt.selected = true;
    select.appendChild(opt);
  });

  const removeBtn = document.createElement("button");
  removeBtn.className = "ghost compact-button calendar-reminder-remove";
  removeBtn.textContent = "\u00d7";
  removeBtn.addEventListener("click", () => row.remove());

  row.appendChild(select);
  row.appendChild(removeBtn);
  container.appendChild(row);
}

/** Read current reminder values from a container's DOM rows. */
export function readCalendarRemindersFromDom(container) {
  if (!container) return [];
  const rows = container.querySelectorAll(".calendar-reminder-row");
  return Array.from(rows).map(row => {
    const key = row.querySelector(".calendar-reminder-preset")?.value || "30:minutes";
    const [value, unit] = key.split(":");
    return { value: parseInt(value, 10), unit };
  });
}

/** Populate the Discord group selector (only groups with calendar access). */
export function renderDiscordGroupSelect() {
  if (!dom.discordGroupSelect) return;
  const groups = (state.groups || []).filter(g => g.canManageCalendar);
  dom.discordGroupSelect.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = t("settings.discord.selectGroup") || "Select a group...";
  dom.discordGroupSelect.appendChild(placeholder);

  groups.forEach(g => {
    const opt = document.createElement("option");
    opt.value = g.groupId;
    opt.textContent = g.name || g.groupId;
    dom.discordGroupSelect.appendChild(opt);
  });

  if (dom.discordGroupConfig) dom.discordGroupConfig.classList.add("is-hidden");
  renderDiscordConfiguredList();
}

/** Render the list of groups that already have Discord configured. */
function renderDiscordConfiguredList() {
  if (!dom.discordConfiguredList) return;
  const groups = (state.groups || []).filter(g => g.canManageCalendar);
  const profiles = state.profiles || {};

  const configured = groups.filter(g => {
    const groupData = profiles[g.groupId];
    return groupData?.discordGuildId;
  });

  dom.discordConfiguredList.innerHTML = "";
  if (!configured.length) return;

  configured.forEach(g => {
    const tag = document.createElement("span");
    tag.className = "discord-configured-tag";
    tag.title = `${g.name} — click to edit`;

    const label = document.createElement("span");
    label.className = "discord-configured-tag-label";
    label.textContent = g.name;
    tag.appendChild(label);

    const remove = document.createElement("button");
    remove.className = "discord-configured-tag-remove";
    remove.textContent = "\u00d7";
    remove.title = "Remove Discord config";
    tag.appendChild(remove);

    // Click tag to jump to editing that group.
    tag.addEventListener("click", () => {
      if (dom.discordGroupSelect) {
        dom.discordGroupSelect.value = g.groupId;
        dom.discordGroupSelect.dispatchEvent(new Event("change"));
      }
    });

    // Click X to clear Discord config for this group.
    remove.addEventListener("click", async e => {
      e.stopPropagation();
      if (!_discordApi) return;
      await _discordApi.discordUpdateGroupDiscord({
        groupId: g.groupId,
        discordBotToken: "",
        discordGuildId: ""
      });
      try { state.profiles = await _discordApi.getProfiles(); } catch { /* ignore */ }
      renderDiscordConfiguredList();
      // If just deleted the currently selected group, clear the config panel.
      if (dom.discordGroupSelect?.value === g.groupId) {
        if (dom.discordBotToken) dom.discordBotToken.value = "";
        if (dom.discordGuildId) dom.discordGuildId.value = "";
        if (dom.discordTestResult) dom.discordTestResult.textContent = "";
      }
    });

    dom.discordConfiguredList.appendChild(tag);
  });
}

/** Load group-level Discord config when a group is selected. */
async function loadDiscordGroupConfig(api) {
  const groupId = dom.discordGroupSelect?.value;
  if (!groupId) {
    if (dom.discordGroupConfig) dom.discordGroupConfig.classList.add("is-hidden");
    return;
  }
  if (dom.discordGroupConfig) dom.discordGroupConfig.classList.remove("is-hidden");

  const config = await api.discordGetGroupDiscord(groupId);
  if (dom.discordBotToken) dom.discordBotToken.value = config.botToken || "";
  if (dom.discordGuildId) dom.discordGuildId.value = config.guildId || "";
  if (dom.discordTestResult) dom.discordTestResult.textContent = "";
  // Load webhook URL and toggle state.
  const webhookConfig = await api.webhookGetGroupWebhook(groupId);
  const hasWebhook = !!(webhookConfig.webhookUrl);
  if (dom.discordWebhookUrl) dom.discordWebhookUrl.value = webhookConfig.webhookUrl || "";
  if (dom.discordWebhookEnabledCheck) dom.discordWebhookEnabledCheck.checked = hasWebhook;
  if (dom.discordWebhookUrlField) dom.discordWebhookUrlField.classList.toggle("is-hidden", !hasWebhook);
  if (dom.discordWebhookTestBtn) dom.discordWebhookTestBtn.classList.toggle("is-hidden", !hasWebhook);
  // Kit presence reveals customization fields below; nothing else about
  // the kit is surfaced in the UI.
  const hasKit = await api.eckitHasKit(groupId);
  if (dom.eckitConfig) dom.eckitConfig.classList.toggle("is-hidden", !hasKit);
  // Load kit customization values from group data.
  const groupData = (state.profiles || {})[groupId] || {};
  if (dom.eckitWebhookName) dom.eckitWebhookName.value = groupData.webhookDisplayName || "";
  const colorVal = groupData.webhookEmbedColor || "#1FC3AD";
  if (dom.eckitEmbedColor) dom.eckitEmbedColor.value = colorVal;
  if (dom.eckitEmbedColorHex) dom.eckitEmbedColorHex.value = colorVal;
  if (dom.eckitAvatarUrl) dom.eckitAvatarUrl.value = groupData.webhookAvatarUrl || "";
  // Refresh visibility after loading config (webhook toggle, import button, etc.).
  updateDiscordVisibility();
}

/** Save group-level Discord config (bot token + guild ID). */
async function saveDiscordGroupConfig(api) {
  const groupId = dom.discordGroupSelect?.value;
  if (!groupId) return;

  await api.discordUpdateGroupDiscord({
    groupId,
    discordBotToken: dom.discordBotToken?.value || "",
    discordGuildId: dom.discordGuildId?.value?.trim() || "",
    webhookDisplayName: dom.eckitWebhookName?.value?.trim() || "",
    webhookAvatarUrl: dom.eckitAvatarUrl?.value?.trim() || "",
    webhookEmbedColor: dom.eckitEmbedColorHex?.value?.trim() || dom.eckitEmbedColor?.value || ""
  });
  await api.webhookUpdateGroupWebhook({
    groupId,
    webhookUrl: dom.discordWebhookUrl?.value?.trim() || ""
  });

  // Refresh profiles so the configured list updates.
  try {
    state.profiles = await api.getProfiles();
  } catch { /* ignore */ }
  renderDiscordConfiguredList();
  updateDiscordVisibility();
}

/** Wire up Discord UI events. Call once during init. */
export function initDiscordUI(api) {
  _discordApi = api;

  if (dom.discordTokenToggle && dom.discordBotToken) {
    dom.discordTokenToggle.addEventListener("click", () => {
      const isPassword = dom.discordBotToken.type === "password";
      dom.discordBotToken.type = isPassword ? "text" : "password";
      dom.discordTokenToggle.textContent = isPassword ? "Hide" : "Show";
    });
  }

  if (dom.discordGroupSelect) {
    dom.discordGroupSelect.addEventListener("change", () => loadDiscordGroupConfig(api));
  }

  if (dom.discordTestBtn) {
    dom.discordTestBtn.addEventListener("click", async () => {
      const token = dom.discordBotToken?.value;
      if (!token) {
        if (dom.discordTestResult) dom.discordTestResult.textContent = t("settings.discord.tokenMissing");
        return;
      }
      if (dom.discordTestResult) dom.discordTestResult.textContent = "...";
      dom.discordTestBtn.disabled = true;
      try {
        const result = await api.discordTestConnection(token);
        if (dom.discordTestResult) {
          dom.discordTestResult.textContent = result.ok
            ? t("settings.discord.testSuccess").replace("{botName}", result.botName)
            : (result.error || t("settings.discord.testFailed"));
        }
      } catch {
        if (dom.discordTestResult) dom.discordTestResult.textContent = t("settings.discord.testFailed");
      }
      dom.discordTestBtn.disabled = false;
    });
  }

  if (dom.discordWebhookEnabledCheck) {
    dom.discordWebhookEnabledCheck.addEventListener("change", () => {
      const checked = dom.discordWebhookEnabledCheck.checked;
      if (dom.discordWebhookUrlField) dom.discordWebhookUrlField.classList.toggle("is-hidden", !checked);
      if (dom.discordWebhookTestBtn) dom.discordWebhookTestBtn.classList.toggle("is-hidden", !checked);
      if (!checked && dom.discordWebhookUrl) dom.discordWebhookUrl.value = "";
    });
  }

  if (dom.discordWebhookToggle && dom.discordWebhookUrl) {
    dom.discordWebhookToggle.addEventListener("click", () => {
      const isPassword = dom.discordWebhookUrl.type === "password";
      dom.discordWebhookUrl.type = isPassword ? "text" : "password";
      dom.discordWebhookToggle.textContent = isPassword ? "Hide" : "Show";
    });
  }

  if (dom.discordWebhookTestBtn) {
    dom.discordWebhookTestBtn.addEventListener("click", async () => {
      const url = dom.discordWebhookUrl?.value?.trim();
      if (!url) {
        if (dom.discordTestResult) dom.discordTestResult.textContent = t("settings.calendar.webhookMissing") || "Enter a webhook URL first.";
        return;
      }
      if (dom.discordTestResult) dom.discordTestResult.textContent = "...";
      dom.discordWebhookTestBtn.disabled = true;
      try {
        const result = await api.webhookTest(url);
        if (dom.discordTestResult) {
          dom.discordTestResult.textContent = result.ok
            ? (t("settings.calendar.webhookTestSuccess") || "Webhook verified").replace("{webhookName}", result.webhookName)
            : (result.error || t("settings.calendar.webhookTestFailed") || "Webhook test failed.");
        }
      } catch {
        if (dom.discordTestResult) dom.discordTestResult.textContent = t("settings.calendar.webhookTestFailed") || "Webhook test failed.";
      }
      dom.discordWebhookTestBtn.disabled = false;
    });
  }

  if (dom.discordSaveBtn) {
    dom.discordSaveBtn.addEventListener("click", async () => {
      await saveDiscordGroupConfig(api);
      const { showToast } = await import("./ui.js");
      showToast(t("settings.discord.saved") || "Discord settings saved.");
    });
  }
}
