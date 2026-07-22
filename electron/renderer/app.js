import { CATEGORIES, ACCESS_TYPES, DATE_MODES, PATTERN_TYPES, WEEKDAYS, MONTHS, TAG_LIMIT } from "./config.js";
import { dom, state, setEventWizard, setProfileWizard, getProfileWizard, getProfileEditConfirmed, setProfileEditConfirmed } from "./state.js";
import { setStatus, setFootMeta, showToast, setAuthState, setUpdateAvailable, setUpdateProgress, refreshStatusPill, showView, renderSelect, setupWizard, bindWindowControls, initThemeControls, loadTheme, handleThemeChange, handleThemeReset, handleThemePresetSave, handleThemePresetDelete, handleThemePresetImport, handleThemePresetExport, syncThemeLocalization } from "./ui.js";
import { initI18n, setLanguage, getCurrentLanguage, getLanguageOptions, applyTranslations, t } from "./i18n/index.js";
import { createTagInput, handleOpenDataDir, handleChangeDataDir, buildTimezones, normalizeDurationInput, sanitizeDurationInputValue, enforceGroupAccess, getTodayDateString, getMaxEventDateString, parseDurationInput, getTimeZoneAbbr } from "./utils.js";
import { checkSession, handleLogin, handleLoginClose, handleLogout, handleSettingsSave } from "./auth.js";
import { resetProfileForm, applyProfileToForm, renderProfileList, updateProfileActionButtons, handleProfileNew, handleProfileEdit, handleProfileDelete, handleProfileSelection, handleProfileGroupChange, handleProfileSave, updateProfileDurationPreview, handleProfileAccessChange, renderProfileRoleRestrictions, renderProfileLanguageList, renderProfilePlatformList, renderPatternList, validateAndCorrectAutomationOffset, handleProfileImportJson, handleProfileExportJson, updateDiscordVisibility, renderDiscordGroupSelect, initDiscordUI, updateCalendarVisibility, renderCalendarReminders, readCalendarRemindersFromDom, addCalendarReminderRow, handleProfileWizardStepChange as profilesHandleProfileWizardStepChange } from "./profiles.js";
import { syncDateInputs, applyManualEventDefaults, handleEventGroupChange, handleEventProfileChange, handleEventCreate, handleEventAccessChange, renderEventRoleRestrictions, renderEventLanguageList, renderEventProfileOptions, renderEventPlatformList, updateDateOptions, refreshUpcomingEventCount, renderUpcomingEventCountLabel, updateEventDurationPreview, handleEventImportJson, handleEventExportJson, updateAdvancedSettingsVisibility, updateImportExportVisibility } from "./events.js";
import { initGalleryPicker, openGalleryPicker } from "./gallery.js";
import { initModifyEvents, initModifySelects, refreshModifyEvents, syncModifyLocalization, updateModifyDurationPreview, updateModifyCalendarRemindersVisibility, updateModifyWebhookVisibility, resetModifyFilters } from "./modify.js";
import { initDemoControls } from "./demo.js";
import {
  initSeriesModule,
  loadSeriesForGroup,
  resetSeriesRecurrenceForm,
  applySeriesToWizard,
  showScheduleMode,
  handleSeriesCreate,
  handleSeriesUpdate,
  handleSeriesDelete,
  updateSeriesFrequencyVisibility,
  updateSeriesEndVisibility,
  updateSeriesDurationPreview,
  setRecurrenceFieldsLocked,
  inspectSeriesOccurrences,
  initRasterizeStatusIndicator
} from "./series.js";

(() => {
  const api = window.vrcEvent;
  const windowControls = window.windowControls;
  if (!api) return;

  let languageOptions = [];
  let pendingAuthStart = false;
  const UPDATE_REPO_URL = "https://github.com/Cynacedia/VRC-Event-Creator";
  const UPDATE_CHECK_INTERVAL = 60 * 60 * 1000;
  let updateInfo = { available: false, downloaded: false, url: UPDATE_REPO_URL };
  let resyncInProgress = false;
  let initialSyncComplete = false;

  function renderGroupSelects(config = {}) {
    const { preserveSelection = false } = config;
    const currentEventGroup = dom.eventGroup.value;
    const currentProfileGroup = dom.profileGroup.value;
    const currentModifyGroup = dom.modifyGroup?.value;
    const groups = state.groups || [];
    const groupsWithAccess = groups.filter(g => g.canManageCalendar);
    const groupOptions = groupsWithAccess.map(g => ({ label: g.name, value: g.groupId }));
    const placeholder = groupOptions.length ? t("common.selectGroupPlaceholder") : t("common.noGroupsAccess");
    renderSelect(dom.eventGroup, groupOptions, placeholder);
    renderSelect(dom.profileGroup, groupOptions, placeholder);
    if (dom.modifyGroup) {
      renderSelect(dom.modifyGroup, groupOptions, placeholder);
    }
    if (groupsWithAccess.length) {
      if (preserveSelection && currentEventGroup && groupsWithAccess.some(g => g.groupId === currentEventGroup)) {
        dom.eventGroup.value = currentEventGroup;
        state.event.selectedGroupId = currentEventGroup;
      } else {
        dom.eventGroup.value = groupsWithAccess[0].groupId;
        state.event.selectedGroupId = groupsWithAccess[0].groupId;
      }
      if (preserveSelection && currentProfileGroup && groupsWithAccess.some(g => g.groupId === currentProfileGroup)) {
        dom.profileGroup.value = currentProfileGroup;
      }
      if (dom.modifyGroup) {
        if (preserveSelection && currentModifyGroup && groupsWithAccess.some(g => g.groupId === currentModifyGroup)) {
          dom.modifyGroup.value = currentModifyGroup;
          state.modify.selectedGroupId = currentModifyGroup;
        } else {
          dom.modifyGroup.value = groupsWithAccess[0].groupId;
          state.modify.selectedGroupId = groupsWithAccess[0].groupId;
        }
      }
    } else {
      state.event.selectedGroupId = null;
      if (dom.modifyGroup) {
        state.modify.selectedGroupId = null;
      }
    }
  }

  function renderLanguageSelect() {
    if (!dom.settingsLanguage || !dom.languageMenu || !dom.languageLabel || !dom.languageFlag) {
      return;
    }
    languageOptions = getLanguageOptions();
    renderSelect(dom.settingsLanguage, languageOptions);
    dom.languageMenu.innerHTML = "";
    languageOptions.forEach(option => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "language-option";
      button.dataset.value = option.value;
      button.setAttribute("role", "option");
      const flag = document.createElement("span");
      flag.className = `flag-circle flag-${option.flag}`;
      flag.setAttribute("aria-hidden", "true");
      const label = document.createElement("span");
      label.textContent = option.label;
      button.appendChild(flag);
      button.appendChild(label);
      dom.languageMenu.appendChild(button);
    });
    setLanguageSelection(getCurrentLanguage());
    renderLanguageSetupList();
  }

  function renderLanguageSetupList() {
    if (!dom.languageSetupList) {
      return;
    }
    const options = languageOptions.length ? languageOptions : getLanguageOptions();
    dom.languageSetupList.innerHTML = "";
    options.forEach(option => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "language-setup-option";
      button.dataset.value = option.value;
      const flag = document.createElement("span");
      flag.className = `flag-circle flag-${option.flag}`;
      flag.setAttribute("aria-hidden", "true");
      const label = document.createElement("span");
      label.textContent = option.label;
      if (option.value === getCurrentLanguage()) {
        button.classList.add("is-selected");
        button.setAttribute("aria-pressed", "true");
      } else {
        button.setAttribute("aria-pressed", "false");
      }
      button.appendChild(flag);
      button.appendChild(label);
      dom.languageSetupList.appendChild(button);
    });
  }

  function setLanguageSelection(langCode) {
    if (!languageOptions.length || !dom.settingsLanguage || !dom.languageLabel || !dom.languageFlag) {
      return;
    }
    const selected = languageOptions.find(option => option.value === langCode) || languageOptions[0];
    dom.settingsLanguage.value = selected.value;
    dom.languageLabel.textContent = selected.label;
    dom.languageFlag.className = `flag-circle flag-${selected.flag}`;
    if (dom.languageMenu) {
      dom.languageMenu.querySelectorAll(".language-option").forEach(optionEl => {
        const isSelected = optionEl.dataset.value === selected.value;
        optionEl.classList.toggle("is-selected", isSelected);
        optionEl.setAttribute("aria-selected", isSelected ? "true" : "false");
      });
    }
    renderLanguageSetupList();
  }

  function openLanguageMenu() {
    if (!dom.languageMenu || !dom.languageTrigger) {
      return;
    }
    dom.languageMenu.classList.remove("is-hidden");
    dom.languageTrigger.setAttribute("aria-expanded", "true");
  }

  function closeLanguageMenu() {
    if (!dom.languageMenu || !dom.languageTrigger) {
      return;
    }
    dom.languageMenu.classList.add("is-hidden");
    dom.languageTrigger.setAttribute("aria-expanded", "false");
  }

  function toggleLanguageMenu() {
    if (!dom.languageMenu) {
      return;
    }
    if (dom.languageMenu.classList.contains("is-hidden")) {
      openLanguageMenu();
    } else {
      closeLanguageMenu();
    }
  }

  function shouldShowLanguageSetup() {
    return Boolean(dom.languageOverlay) && !localStorage.getItem("languageConfirmed");
  }

  function showLanguageSetup() {
    if (!dom.languageOverlay) {
      return;
    }
    dom.languageOverlay.classList.remove("is-hidden");
    if (dom.loginOverlay) {
      dom.loginOverlay.classList.add("is-hidden");
    }
    if (dom.twoFactorOverlay) {
      dom.twoFactorOverlay.classList.add("is-hidden");
    }
    renderLanguageSetupList();
  }

  function hideLanguageSetup() {
    if (!dom.languageOverlay) {
      return;
    }
    dom.languageOverlay.classList.add("is-hidden");
  }

  async function startAuthFlow() {
    // Check session in background without blocking UI.
    checkSession(api, refreshData).catch(() => {
      // Session check failed; user needs to log in.
    });
  }

  function completeLanguageSetup() {
    localStorage.setItem("languageConfirmed", "true");
    hideLanguageSetup();
    setAuthState(Boolean(state.user));
    if (pendingAuthStart) {
      pendingAuthStart = false;
      void startAuthFlow();
    }
  }

  async function refreshData(options = {}) {
    const { preserveSelection = false, force = false } = options;
    try {
      setFootMeta(t("common.syncing"));
      // force=true bypasses main's per-group permission cache, so VRChat-side
      // role changes surface without an app restart.
      state.groups = await api.getGroups(force ? { force: true } : undefined);
      state.profiles = await api.getProfiles();
      state.kitGroupIds = await api.eckitGetKitGroupIds().catch(() => []);
      // Load series for currently-selected groups.
      const profileGroupId = dom.profileGroup?.value;
      if (profileGroupId) {
        await loadSeriesForGroup(profileGroupId);
      }
      renderGroupSelects({ preserveSelection });
      enforceGroupAccess(dom.eventAccess, dom.eventGroup.value);
      enforceGroupAccess(dom.profileAccess, dom.profileGroup.value);
      if (dom.modifyEventAccess) {
        enforceGroupAccess(dom.modifyEventAccess, dom.modifyGroup?.value);
      }
      renderProfileList(api);
      renderEventProfileOptions(api);
      renderDiscordGroupSelect();
      updateDiscordVisibility();
      updateCalendarVisibility();
      void renderEventRoleRestrictions(api);
      void renderProfileRoleRestrictions(api);
      await refreshUpcomingEventCount(api);
      setFootMeta(t("common.ready"));
      initialSyncComplete = true;
      return true;
    } catch (err) {
      showToast(t("common.errors.refreshFailed"), true);
      setFootMeta(t("common.error"));
    }
    return false;
  }

  async function resyncUserData() {
    if (!state.user || resyncInProgress) {
      return;
    }
    resyncInProgress = true;
    if (dom.statusPill) {
      dom.statusPill.dataset.hover = "resync";
      dom.statusPill.textContent = t("common.syncing");
      dom.statusPill.disabled = true;
      dom.statusPill.setAttribute("aria-disabled", "true");
    }
    const ok = await refreshData({ preserveSelection: true, force: true });
    void checkForUpdates();
    if (ok) {
      showToast(t("common.syncSuccess"));
    }
    resyncInProgress = false;
    if (dom.statusPill) {
      delete dom.statusPill.dataset.hover;
    }
    refreshStatusPill();
  }

  function refreshLocalizedUi() {
    const selections = {
      eventCategory: dom.eventCategory.value,
      profileCategory: dom.profileCategory.value,
      eventAccess: dom.eventAccess.value,
      profileAccess: dom.profileAccess.value,
      modifyCategory: dom.modifyEventCategory?.value,
      modifyAccess: dom.modifyEventAccess?.value,
      profileDateMode: dom.profileDateMode.value,
      patternType: dom.patternType.value,
      patternWeekday: dom.patternWeekday.value
    };

    renderGroupSelects({ preserveSelection: true });
    renderSelect(dom.eventCategory, CATEGORIES);
    if (selections.eventCategory) {
      dom.eventCategory.value = selections.eventCategory;
    }
    renderSelect(dom.profileCategory, CATEGORIES);
    if (selections.profileCategory) {
      dom.profileCategory.value = selections.profileCategory;
    }
    renderSelect(dom.eventAccess, ACCESS_TYPES);
    if (selections.eventAccess) {
      dom.eventAccess.value = selections.eventAccess;
    }
    enforceGroupAccess(dom.eventAccess, dom.eventGroup.value);
    renderSelect(dom.profileAccess, ACCESS_TYPES);
    if (selections.profileAccess) {
      dom.profileAccess.value = selections.profileAccess;
    }
    enforceGroupAccess(dom.profileAccess, dom.profileGroup.value);
    if (dom.modifyEventCategory) {
      renderSelect(dom.modifyEventCategory, CATEGORIES);
      if (selections.modifyCategory) {
        dom.modifyEventCategory.value = selections.modifyCategory;
      }
    }
    if (dom.modifyEventAccess) {
      renderSelect(dom.modifyEventAccess, ACCESS_TYPES);
      if (selections.modifyAccess) {
        dom.modifyEventAccess.value = selections.modifyAccess;
      }
      enforceGroupAccess(dom.modifyEventAccess, dom.modifyGroup?.value);
    }
    renderSelect(dom.profileDateMode, DATE_MODES);
    if (selections.profileDateMode) {
      dom.profileDateMode.value = selections.profileDateMode;
    }
    renderSelect(dom.patternType, PATTERN_TYPES, t("profiles.patterns.selectPattern"));
    if (selections.patternType) {
      dom.patternType.value = selections.patternType;
    }
    renderSelect(dom.patternWeekday, WEEKDAYS, t("profiles.patterns.selectWeekday"));
    if (selections.patternWeekday) {
      dom.patternWeekday.value = selections.patternWeekday;
    }

    renderProfileList(api);
    renderEventProfileOptions(api);
    void renderEventRoleRestrictions(api);
      renderEventLanguageList();
      renderEventPlatformList();
      renderProfileLanguageList();
      renderProfilePlatformList();
      void renderProfileRoleRestrictions(api);
      renderPatternList();
      renderUpcomingEventCountLabel();
      syncModifyLocalization();
      syncThemeLocalization();
      // Re-render reminder dropdowns with updated translations.
      if (dom.profileCalendarRemindersList) {
        const current = readCalendarRemindersFromDom(dom.profileCalendarRemindersList);
        if (current.length) renderCalendarReminders(dom.profileCalendarRemindersList, current);
      }
      if (dom.eventCalendarRemindersList) {
        const current = readCalendarRemindersFromDom(dom.eventCalendarRemindersList);
        if (current.length) renderCalendarReminders(dom.eventCalendarRemindersList, current);
      }

    const profileKey = dom.eventProfile.value;
    const groupId = dom.eventGroup.value;
    const profile = profileKey && profileKey !== "__manual__"
      ? state.profiles?.[groupId]?.profiles?.[profileKey]
      : null;
    updateDateOptions(api, profile);

    if (state.user) {
      setStatus(t("auth.loggedInAs", { name: state.user.displayName || "user" }));
    }
    updateEventDurationPreview();
    updateProfileDurationPreview();
    updateModifyDurationPreview();
  }

  function updatePatternDayOptions() {
    if (!dom.patternMonth || !dom.patternDay) return;
    const monthValue = Number(dom.patternMonth.value) || 1;
    const monthConfig = MONTHS.find(m => m.value === monthValue) || MONTHS[0];
    const maxDays = monthConfig.days;
    const currentDay = Number(dom.patternDay.value) || 1;

    dom.patternDay.innerHTML = "";
    for (let d = 1; d <= maxDays; d++) {
      const option = document.createElement("option");
      option.value = d;
      option.textContent = d;
      dom.patternDay.appendChild(option);
    }
    dom.patternDay.value = Math.min(currentDay, maxDays);
    updatePatternDatePreview();
  }

  function updatePatternDatePreview() {
    if (!dom.patternDatePreview || !dom.patternMonth || !dom.patternDay) return;
    const monthValue = Number(dom.patternMonth.value);
    const dayValue = Number(dom.patternDay.value);
    if (!monthValue || !dayValue) {
      dom.patternDatePreview.textContent = "";
      return;
    }
    // 2024 is a leap year, so Feb 29 formats correctly.
    const date = new Date(2024, monthValue - 1, dayValue);
    const locale = getCurrentLanguage() || "en";
    const formatted = date.toLocaleDateString(locale, { month: "long", day: "numeric" });
    dom.patternDatePreview.textContent = formatted;
  }

  function handlePatternTypeChange() {
    const type = dom.patternType.value;
    const isAnnual = type === "annual";

    if (dom.patternWeekdayField) {
      dom.patternWeekdayField.classList.toggle("is-hidden", isAnnual);
    }
    if (dom.patternDateField) {
      dom.patternDateField.classList.toggle("is-hidden", !isAnnual);
    }

    if (isAnnual) {
      updatePatternDatePreview();
    }
  }

  function handleAutomationEnabledChange() {
    const enabled = dom.automationEnabled.checked;

    if (enabled) {
      if (state.profile.patterns.length === 0) {
        showToast(t("profiles.automation.patternsRequired") || "At least one pattern is required for automation", true);
        dom.automationEnabled.checked = false;
        return;
      }

      // Show themed confirmation overlay; settings stay hidden until confirm.
      dom.automationConfirmOverlay.classList.remove("is-hidden");
      return;
    }

    if (dom.automationSettings) {
      dom.automationSettings.classList.toggle("is-hidden", !enabled);
    }
  }

  function handleAutomationConfirmOk() {
    dom.automationConfirmOverlay.classList.add("is-hidden");
    if (dom.automationSettings) {
      dom.automationSettings.classList.remove("is-hidden");
    }
  }

  function handleAutomationConfirmCancel() {
    dom.automationConfirmOverlay.classList.add("is-hidden");
    dom.automationEnabled.checked = false;
  }

  function getAutomationProfileContext() {
    const groupId = dom.profileGroup?.value || null;
    let profileKey = state.profile.currentKey || null;
    if (!profileKey && dom.profileExisting?.value) {
      const parts = dom.profileExisting.value.split("::");
      if (parts.length > 1) {
        profileKey = parts[1];
      }
    }
    return { groupId, profileKey };
  }

  async function handleAutomationRestore() {
    const { groupId, profileKey } = getAutomationProfileContext();
    if (!groupId || !profileKey || !dom.automationRestore) {
      showToast(t("profiles.automation.restoreNoProfile") || "No profile selected", true);
      if (dom.automationRestore) {
        dom.automationRestore.disabled = true;
      }
      if (dom.automationRestoreCount) {
        dom.automationRestoreCount.textContent = "";
      }
      return;
    }

    try {
      dom.automationRestore.disabled = true;
      const result = await window.vrcEvent.restoreDeletedEvents({ groupId, profileKey });
      if (result.ok) {
        const count = result.restoredCount || 0;
        if (count > 0) {
          showToast(t("profiles.automation.restoreSuccess", { count }) || `Restored ${count} event(s)`);
        } else {
          showToast(t("profiles.automation.restoreNone") || "No events to restore");
        }
        await updateRestorableCount();
      } else {
        showToast(result.error?.message || t("profiles.automation.restoreFailed") || "Failed to restore events", true);
      }
    } catch (err) {
      showToast(err.message || t("profiles.automation.restoreFailed") || "Failed to restore events", true);
    } finally {
      dom.automationRestore.disabled = false;
    }
  }

  async function updateRestorableCount() {
    if (!dom.automationRestore || !dom.automationRestoreCount) {
      return;
    }
    const { groupId, profileKey } = getAutomationProfileContext();
    if (!groupId || !profileKey) {
      dom.automationRestoreCount.textContent = "";
      dom.automationRestore.disabled = true;
      return;
    }

    try {
      const count = await window.vrcEvent.getRestorableCount({ groupId, profileKey });
      if (count > 0) {
        dom.automationRestoreCount.textContent = t("profiles.automation.restorableCount", { count }) || `${count} deleted event(s) can be restored`;
        dom.automationRestore.disabled = false;
      } else {
        dom.automationRestoreCount.textContent = "";
        dom.automationRestore.disabled = true;
      }
    } catch (err) {
      dom.automationRestoreCount.textContent = "";
      dom.automationRestore.disabled = true;
    }
  }

  function handleAutomationTimingModeChange() {
    const mode = dom.automationTimingMode.value;
    const isMonthly = mode === "monthly";

    if (dom.automationOffsetSettings) {
      dom.automationOffsetSettings.classList.toggle("is-hidden", isMonthly);
    }
    if (dom.automationMonthlySettings) {
      dom.automationMonthlySettings.classList.toggle("is-hidden", !isMonthly);
    }
    if (dom.automationOffsetProse) {
      dom.automationOffsetProse.classList.toggle("is-hidden", isMonthly);
    }
    if (dom.automationMonthlyProse) {
      dom.automationMonthlyProse.classList.toggle("is-hidden", !isMonthly);
    }

    updateAutomationProse();
  }

  function handleAutomationRepeatModeChange() {
    const mode = dom.automationRepeatMode.value;
    const isCount = mode === "count";

    if (dom.automationRepeatCountField) {
      dom.automationRepeatCountField.classList.toggle("is-hidden", !isCount);
    }
  }

  function parseAutomationTimingInput(value) {
    // DD:HH:MM format (same as duration format).
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
    // Normalize: hours >= 24 overflow to days; minutes >= 60 overflow to hours.
    let totalMinutes = (days * 1440) + (hours * 60) + minutes;
    const normDays = Math.floor(totalMinutes / 1440);
    const normHours = Math.floor((totalMinutes % 1440) / 60);
    const normMinutes = totalMinutes % 60;
    return `${String(normDays).padStart(2, "0")}:${String(normHours).padStart(2, "0")}:${String(normMinutes).padStart(2, "0")}`;
  }

  function updateAutomationProse() {
    const mode = dom.automationTimingMode?.value;

    if (mode === "monthly") {
      updateMonthlyProse();
    } else {
      updateOffsetProse();
    }
  }

  function updateOffsetProse() {
    const proseEl = dom.automationOffsetProse;
    if (!proseEl) return;

    const mode = dom.automationTimingMode?.value;
    const timing = parseAutomationTimingInput(dom.automationTimingInput?.value);
    const { days, hours, minutes } = timing;

    const parts = [];
    if (days === 1) {
      parts.push(t("profiles.automation.prose.day"));
    } else if (days > 1) {
      parts.push(t("profiles.automation.prose.days", { count: days }));
    }
    if (hours === 1) {
      parts.push(t("profiles.automation.prose.hour"));
    } else if (hours > 1) {
      parts.push(t("profiles.automation.prose.hours", { count: hours }));
    }
    if (minutes === 1) {
      parts.push(t("profiles.automation.prose.minute"));
    } else if (minutes > 1) {
      parts.push(t("profiles.automation.prose.minutes", { count: minutes }));
    }

    // Join parts with commas and "and".
    let timeStr;
    if (parts.length === 0) {
      timeStr = t("profiles.automation.prose.noTime");
    } else if (parts.length === 1) {
      timeStr = parts[0];
    } else if (parts.length === 2) {
      timeStr = `${parts[0]} ${t("profiles.automation.prose.and")} ${parts[1]}`;
    } else {
      const lastPart = parts[parts.length - 1];
      const middleParts = parts.slice(0, -1).join(", ");
      timeStr = `${middleParts}, ${t("profiles.automation.prose.and")} ${lastPart}`;
    }

    const proseSpan = proseEl.querySelector("span");
    if (proseSpan) {
      if (mode === "before") {
        proseSpan.textContent = t("profiles.automation.prose.before", { time: timeStr });
      } else if (mode === "after") {
        proseSpan.textContent = t("profiles.automation.prose.after", { time: timeStr });
      }
    }
  }

  function updateMonthlyProse() {
    const proseEl = document.getElementById("automation-monthly-prose");
    if (!proseEl) return;

    const day = parseInt(dom.automationMonthlyDay?.value) || 1;
    const time = dom.automationMonthlyTime?.value || "18:00";

    const [hours24, mins] = time.split(":");
    const hours = parseInt(hours24);
    const isPM = hours >= 12;
    const hours12 = hours === 0 ? 12 : (hours > 12 ? hours - 12 : hours);
    const ampm = isPM ? "PM" : "AM";

    const selectedTz = dom.profileTimezone?.value || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const tzAbbrev = getTimeZoneAbbr(selectedTz);
    const timeFormatted = `${hours12}:${mins} ${ampm} ${tzAbbrev}`;

    const ordinal = getOrdinalSuffix(day);

    const proseSpan = proseEl.querySelector("span");
    if (proseSpan) {
      proseSpan.textContent = t("profiles.automation.prose.monthly", {
        day: day,
        ordinal: ordinal,
        time: timeFormatted
      });
    }
  }

  function getOrdinalSuffix(num) {
    const lang = getCurrentLanguage?.() || "en";

    if (lang === "en") {
      if (num % 100 >= 11 && num % 100 <= 13) return "th";
      switch (num % 10) {
        case 1: return "st";
        case 2: return "nd";
        case 3: return "rd";
        default: return "th";
      }
    }

    // Other languages handle ordinals via translation strings.
    return "";
  }

  function handlePatternAdd() {
    const type = dom.patternType.value;
    const time = dom.patternTime.value;

    if (!type || !time) {
      showToast(t("profiles.patterns.selectAll"), true);
      return;
    }

    const [hourStr, minuteStr] = time.split(":");
    const hour = Number(hourStr);
    const minute = Number(minuteStr);

    if (type === "annual") {
      const month = Number(dom.patternMonth.value);
      const day = Number(dom.patternDay.value);
      if (!month || !day) {
        showToast(t("profiles.patterns.selectAll"), true);
        return;
      }
      const pattern = { type: "annual", month, day, hour, minute };
      state.profile.patterns.push(pattern);
      renderPatternList();
      validateAndCorrectAutomationOffset();
      return;
    }

    const weekday = dom.patternWeekday.value;
    if (!weekday) {
      showToast(t("profiles.patterns.selectAll"), true);
      return;
    }

    const pattern = { type: ["every", "every-other"].includes(type) ? type : "nth", weekday, hour, minute };
    if (type === "last") pattern.type = "last";
    else if (["1st", "2nd", "3rd", "4th"].includes(type)) pattern.occurrence = Number(type[0]);
    state.profile.patterns.push(pattern);
    renderPatternList();
    validateAndCorrectAutomationOffset();
  }

  function handlePatternClear() {
    if (!state.profile.patterns.length) return;
    if (!window.confirm(t("profiles.patterns.confirmClear"))) return;
    state.profile.patterns = [];
    renderPatternList();
    validateAndCorrectAutomationOffset();
  }

  function handleEventWizardStepChange({ current, next }) {
    if (next < current) {
      return true;
    }
    if (next > 1 && current <= 1) {
      const usePattern = state.event.dateSource === "pattern";
      if (usePattern) {
        if (!dom.eventDateOption.value) {
          showToast(t("events.selectDateError"), true);
          return false;
        }
      } else if (!dom.eventManualDate.value || !dom.eventManualTime.value) {
        showToast(t("events.selectDateError"), true);
        return false;
      }
    }
    if (next > 2 && current <= 2) {
      const missing = [];
      if (!dom.eventName.value.trim()) {
        missing.push(t("common.fields.eventName"));
      }
      if (!dom.eventDescription.value.trim()) {
        missing.push(t("common.fields.description"));
      }
      if (missing.length) {
        const key = missing.length === 1 ? "common.errors.requiredSingle" : "common.errors.requiredMultiple";
        showToast(t(key, { field: missing[0], fields: missing.join(", ") }), true);
        return false;
      }
    }
    return true;
  }

  function handleProfileWizardStepChange(payload) {
    const { current, next } = payload;
    // Returning to step 0: refresh template list so newly saved schedules show up.
    if (next < current && next === 0) {
      const currentGroup = dom.profileGroup.value;
      if (currentGroup) {
        renderProfileList(api);
      }
    }
    const result = profilesHandleProfileWizardStepChange(payload);
    // Advancing to step 3 with a series: re-run occurrence inspection so
    // date/time backfill happens every navigation (not just on dropdown
    // change). Covers step1 -> step3, back to step1, forward to step3 again.
    if (result && next > current && next >= 2 && state.schedules?.editingType === "series") {
      const groupId = dom.profileGroup.value;
      const seriesId = state.schedules?.editingSeriesId;
      if (groupId && seriesId) {
        inspectSeriesOccurrences(api, groupId, seriesId).then(info => {
          // Don't re-lock if user explicitly clicked Unlock; respect override.
          if (info.started === true && !state.schedules?.recurrenceUnlocked) {
            setRecurrenceFieldsLocked(true);
          }
          if (info.earliestStart) {
            // Persist to in-memory state so the next applySeriesToWizard has it.
            if (state.series?.[groupId]?.[seriesId]) {
              state.series[groupId][seriesId].firstOccurrenceUtc = info.earliestStart;
              if (info.earliestEnd) {
                state.series[groupId][seriesId].firstOccurrenceEndUtc = info.earliestEnd;
              }
            }
            // Backfill form fields if empty.
            if (dom.seriesStartDate?.value === "" || dom.seriesStartTime?.value === "") {
              const localDate = new Date(info.earliestStart);
              if (!Number.isNaN(localDate.getTime())) {
                const yyyy = localDate.getFullYear();
                const mm = String(localDate.getMonth() + 1).padStart(2, "0");
                const dd = String(localDate.getDate()).padStart(2, "0");
                const hh = String(localDate.getHours()).padStart(2, "0");
                const mi = String(localDate.getMinutes()).padStart(2, "0");
                if (dom.seriesStartDate && !dom.seriesStartDate.value) dom.seriesStartDate.value = `${yyyy}-${mm}-${dd}`;
                if (dom.seriesStartTime && !dom.seriesStartTime.value) dom.seriesStartTime.value = `${hh}:${mi}`;
              }
            }
          }
        }).catch(() => {});
      }
    }
    return result;
  }

  function handleDateSourceChange(event) {
    if (!event.target.value) return;
    state.event.dateSource = event.target.value;
    syncDateInputs();
  }

  async function checkForUpdates() {
    if (!api.checkForUpdate) {
      return;
    }
    try {
      const result = await api.checkForUpdate();
      if (!result || typeof result.updateAvailable !== "boolean") {
        return;
      }
      updateInfo = {
        available: Boolean(result.updateAvailable),
        downloaded: Boolean(result.updateDownloaded),
        downloading: Boolean(result.updateDownloading),
        progress: result.updateProgress || 0,
        url: result.repoUrl || UPDATE_REPO_URL
      };
      state.app.updateAvailable = updateInfo.available;
      setUpdateAvailable(updateInfo.available, updateInfo.downloaded);
      if (updateInfo.downloading) {
        setUpdateProgress(updateInfo.progress, true);
      }
      setAuthState(Boolean(state.user));
    } catch (err) {
      // Ignore update check failures.
    }
  }


  function bindEvents() {
    dom.navButtons.forEach(btn => btn.addEventListener("click", () => {
      const view = btn.dataset.view;
      const previousView = Array.from(dom.navButtons).find(b => b.classList.contains("is-active"))?.dataset.view;
      showView(view);
      // Reset Modify Events filters when leaving the tab (session-scoped).
      if (previousView === "modify" && view !== "modify") {
        resetModifyFilters();
      }
      if (view === "profiles") {
        renderProfileList(api);
        updateAutomationProse();
        updateRestorableCount();
      }
      if (view === "modify") {
        if (state.app?.updateAvailable) {
          showToast(t("modify.updateRequired"), true, { duration: 8000 });
        }
        void refreshModifyEvents(api);
      }
    }));
    dom.loginForm.addEventListener("submit", e => handleLogin(e, api, refreshData));
    dom.loginClose.addEventListener("click", () => handleLoginClose(api));
    dom.logoutBtn.addEventListener("click", () => handleLogout(api));
    dom.settingsSave.addEventListener("click", handleSettingsSave);
    dom.settingsTheme.addEventListener("change", handleThemeChange);
    dom.themeReset.addEventListener("click", handleThemeReset);
    dom.themePresetSave.addEventListener("click", handleThemePresetSave);
    dom.themePresetDelete.addEventListener("click", handleThemePresetDelete);
    if (dom.themePresetImport) {
      dom.themePresetImport.addEventListener("click", handleThemePresetImport);
    }
    if (dom.themePresetExport) {
      dom.themePresetExport.addEventListener("click", handleThemePresetExport);
    }
    if (dom.githubLink && api.openExternal) {
      dom.githubLink.addEventListener("click", event => {
        event.preventDefault();
        api.openExternal(dom.githubLink.href);
      });
    }
    if (dom.statusPill) {
      dom.statusPill.addEventListener("mouseenter", () => {
        if (!updateInfo.available && !updateInfo.downloading && state.user && !resyncInProgress && initialSyncComplete) {
          dom.statusPill.dataset.hover = "resync";
          dom.statusPill.textContent = t("common.resync");
        }
      });
      dom.statusPill.addEventListener("mouseleave", () => {
        if (!updateInfo.available && !updateInfo.downloading && state.user && !resyncInProgress && initialSyncComplete) {
          delete dom.statusPill.dataset.hover;
          refreshStatusPill();
        }
      });
      dom.statusPill.addEventListener("click", async () => {
        if (!updateInfo.available && !updateInfo.downloading && initialSyncComplete) {
          await resyncUserData();
          return;
        }
        if (updateInfo.downloaded && api.installUpdate) {
          api.installUpdate();
        } else if (updateInfo.downloading) {
          showToast(t("common.updateDownloading") || "Downloading update...");
        } else if (api.downloadUpdate) {
          await api.downloadUpdate();
        }
      });
    }
    if (dom.languageTrigger && dom.languageMenu) {
      dom.languageTrigger.addEventListener("click", event => {
        event.stopPropagation();
        toggleLanguageMenu();
      });
      dom.languageMenu.addEventListener("click", async event => {
        const option = event.target.closest(".language-option");
        if (!option) {
          return;
        }
        const nextLang = option.dataset.value;
        if (!nextLang) {
          return;
        }
        await setLanguage(nextLang);
        setLanguageSelection(nextLang);
        applyTranslations();
        setAuthState(Boolean(state.user));
        refreshLocalizedUi();
        document.documentElement.lang = getCurrentLanguage();
        closeLanguageMenu();
      });
      document.addEventListener("click", event => {
        if (dom.languageSelect && dom.languageSelect.contains(event.target)) {
          return;
        }
        closeLanguageMenu();
      });
      document.addEventListener("keydown", event => {
        if (event.key === "Escape") {
          closeLanguageMenu();
        }
      });
    }
    if (dom.languageSetupList) {
      dom.languageSetupList.addEventListener("click", async event => {
        const option = event.target.closest(".language-setup-option");
        if (!option) {
          return;
        }
        const nextLang = option.dataset.value;
        if (!nextLang) {
          return;
        }
        await setLanguage(nextLang);
        setLanguageSelection(nextLang);
        applyTranslations();
        setAuthState(Boolean(state.user));
        refreshLocalizedUi();
        document.documentElement.lang = getCurrentLanguage();
      });
    }
    if (dom.languageSetupContinue) {
      dom.languageSetupContinue.addEventListener("click", () => completeLanguageSetup());
    }
    if (dom.themeOpen && dom.themeOverlay) {
      const closeThemeOverlay = () => dom.themeOverlay.classList.add("is-hidden");
      dom.themeOpen.addEventListener("click", () => dom.themeOverlay.classList.remove("is-hidden"));
      if (dom.themeOverlayClose) {
        dom.themeOverlayClose.addEventListener("click", closeThemeOverlay);
      }
      dom.themeOverlay.addEventListener("click", event => {
        if (event.target === dom.themeOverlay) {
          closeThemeOverlay();
        }
      });
    }
    dom.settingsOpenDir.addEventListener("click", () => handleOpenDataDir(api));
    dom.settingsChangeDir.addEventListener("click", () => handleChangeDataDir(api));
    dom.eventGroup.addEventListener("change", () => { void handleEventGroupChange(api); });
    dom.eventProfile.addEventListener("change", () => handleEventProfileChange(api));
    dom.eventProfileClear.addEventListener("click", () => {
      dom.eventProfile.value = "__manual__";
      state.event.selectedProfileKey = null;
      applyManualEventDefaults();
      enforceGroupAccess(dom.eventAccess, dom.eventGroup.value);
      void renderEventRoleRestrictions(api);
    });
    dom.eventAccess.addEventListener("change", () => handleEventAccessChange(api));
    dom.eventDateSource.addEventListener("change", handleDateSourceChange);
    dom.eventTimezone.addEventListener("change", () => {
      if (!state.event.profile) {
        return;
      }
      void updateDateOptions(api, state.event.profile);
    });
    dom.eventManualDate.addEventListener("blur", () => {
      const selectedDate = dom.eventManualDate.value;
      if (selectedDate) {
        const today = getTodayDateString();
        const maxDate = getMaxEventDateString();
        if (selectedDate < today) {
          showToast(t("events.pastDateError"), true);
          dom.eventManualDate.value = today;
        } else if (selectedDate > maxDate) {
          showToast(t("events.futureDateError"), true);
          dom.eventManualDate.value = maxDate;
        }
      }
    });
    dom.eventManualTime.addEventListener("input", () => {
      const value = dom.eventManualTime.value;
      if (!value) {
        return;
      }
      const [hours, minutes] = value.split(":");
      if (hours === "00" && minutes) {
        dom.eventManualTime.value = `00:${minutes}`;
      }
    });
    if (dom.eventDuration) {
      dom.eventDuration.addEventListener("input", () => {
        dom.eventDuration.value = sanitizeDurationInputValue(dom.eventDuration.value);
        updateEventDurationPreview();
      });
      dom.eventDuration.addEventListener("blur", () => {
        normalizeDurationInput(dom.eventDuration, 120);
        updateEventDurationPreview();
      });
      updateEventDurationPreview();
    }
    dom.eventLanguageFilter.addEventListener("input", renderEventLanguageList);
    dom.eventCreate.addEventListener("click", () => handleEventCreate(api).then(result => {
      if (!result) {
        return;
      }
      if (result.success) {
        showToast(result.message);
        return;
      }
      if (!result.toastShown && result.message) {
        showToast(result.message, true);
      }
    }));
    if (dom.eventCountRefresh) {
      dom.eventCountRefresh.addEventListener("click", () => { void refreshUpcomingEventCount(api); });
    }
    if (dom.eventWarnConflicts) {
      dom.eventWarnConflicts.addEventListener("change", async () => {
        try {
          await api.updateSettings({ warnConflicts: dom.eventWarnConflicts.checked });
        } catch (err) {
          console.error("Failed to save conflict warning setting:", err);
        }
      });
    }
    if (dom.settingsMinimizeTray) {
      dom.settingsMinimizeTray.addEventListener("change", async () => {
        try {
          await api.updateSettings({ minimizeToTray: dom.settingsMinimizeTray.checked });
        } catch (err) {
          console.error("Failed to save minimize to tray setting:", err);
        }
      });
    }
    if (dom.settingsStartOnStartup) {
      dom.settingsStartOnStartup.addEventListener("change", async () => {
        try {
          await api.updateSettings({ startOnStartup: dom.settingsStartOnStartup.checked });
        } catch (err) {
          console.error("Failed to save start on startup setting:", err);
        }
      });
    }
    if (dom.settingsKeepSignedIn && api.setKeepSignedIn) {
      // Dedicated handler (not updateSettings): turning this off must also delete
      // the saved login and stop the client auto-relogging-in, right away.
      dom.settingsKeepSignedIn.addEventListener("change", async () => {
        try {
          await api.setKeepSignedIn(dom.settingsKeepSignedIn.checked);
        } catch (err) {
          console.error("Failed to update keep-signed-in setting:", err);
        }
      });
    }
    if (dom.settingsEnableAdvanced) {
      dom.settingsEnableAdvanced.addEventListener("change", async () => {
        try {
          const enabled = dom.settingsEnableAdvanced.checked;
          // Disabling advanced cascades to sub-settings.
          if (!enabled) {
            if (dom.settingsEnableImportExport) dom.settingsEnableImportExport.checked = false;
            if (dom.settingsAutoUploadImages) dom.settingsAutoUploadImages.checked = false;
            await api.updateSettings({
              enableAdvanced: false,
              enableImportExport: false,
              autoUploadImages: false
            });
            updateImportExportVisibility();
          } else {
            await api.updateSettings({ enableAdvanced: true });
          }
          updateAdvancedSettingsVisibility({ expand: enabled });
        } catch (err) {
          console.error("Failed to save advanced settings:", err);
        }
      });
    }
    if (dom.settingsAdvancedCaret) {
      dom.settingsAdvancedCaret.addEventListener("click", () => {
        const isExpanded = dom.settingsAdvancedCaret.classList.contains("is-expanded");
        updateAdvancedSettingsVisibility({ expand: !isExpanded });
        // Refresh Discord caret visibility when advanced panel is expanded.
        updateDiscordVisibility();
      });
    }
    if (dom.settingsEnableImportExport) {
      dom.settingsEnableImportExport.addEventListener("change", async () => {
        try {
          await api.updateSettings({ enableImportExport: dom.settingsEnableImportExport.checked });
          updateImportExportVisibility();
        } catch (err) {
          console.error("Failed to save import/export setting:", err);
        }
      });
    }
    if (dom.settingsAutoUploadImages) {
      dom.settingsAutoUploadImages.addEventListener("change", async () => {
        try {
          await api.updateSettings({ autoUploadImages: dom.settingsAutoUploadImages.checked });
        } catch (err) {
          console.error("Failed to save auto upload images setting:", err);
        }
      });
    }
    if (dom.settingsDiscordEnabled) {
      dom.settingsDiscordEnabled.addEventListener("change", async () => {
        try {
          const enabled = dom.settingsDiscordEnabled.checked;
          await api.updateSettings({ discordEnabled: enabled });
          state.settings.discordEnabled = enabled;
          updateDiscordVisibility({ expandPanel: enabled });
          if (enabled) renderDiscordGroupSelect();
        } catch (err) {
          console.error("Failed to save Discord setting:", err);
        }
      });
    }
    if (dom.discordSettingsCaret) {
      dom.discordSettingsCaret.addEventListener("click", () => {
        const isExpanded = dom.discordSettingsCaret.classList.contains("is-expanded");
        updateDiscordVisibility({ expandPanel: !isExpanded });
      });
    }
    if (api.onDiscordSyncSuccess) {
      api.onDiscordSyncSuccess(({ eventTitle }) => {
        showToast(t("settings.discord.syncSuccess").replace("{title}", eventTitle));
      });
    }
    if (api.onDiscordSyncFailed) {
      api.onDiscordSyncFailed(({ eventTitle, error }) => {
        showToast(t("settings.discord.syncFailed").replace("{title}", eventTitle).replace("{error}", error), true);
      });
    }
    if (dom.settingsCalendarEnabled) {
      dom.settingsCalendarEnabled.addEventListener("change", async () => {
        try {
          const enabled = dom.settingsCalendarEnabled.checked;
          await api.updateSettings({ calendarEnabled: enabled });
          state.settings.calendarEnabled = enabled;
          updateDiscordVisibility();
          updateCalendarVisibility();
        } catch (err) {
          console.error("Failed to save calendar setting:", err);
        }
      });
    }
    if (dom.calendarSaveDirBtn) {
      dom.calendarSaveDirBtn.addEventListener("click", async () => {
        const result = await api.calendarSelectSaveDir();
        if (result.ok && result.dir) {
          if (dom.calendarSaveDirDisplay) dom.calendarSaveDirDisplay.textContent = result.dir;
          state.settings.calendarSaveDir = result.dir;
        }
      });
    }
    if (dom.calendarSaveDirOpen) {
      dom.calendarSaveDirOpen.addEventListener("click", () => {
        if (state.settings.calendarSaveDir) {
          api.openExternal(state.settings.calendarSaveDir);
        }
      });
    }
    if (api.onCalendarAutoSaved) {
      api.onCalendarAutoSaved(({ eventTitle, filePath }) => {
        showToast((t("settings.calendar.autoSaved") || "Calendar file saved: {filePath}").replace("{filePath}", filePath).replace("{title}", eventTitle));
      });
    }
    if (dom.calendarSyncCheck) {
      dom.calendarSyncCheck.addEventListener("change", () => updateCalendarVisibility());
    }
    if (dom.profileCalendarRemindersEnabled) {
      dom.profileCalendarRemindersEnabled.addEventListener("change", () => {
        const show = dom.profileCalendarRemindersEnabled.checked;
        if (dom.profileCalendarRemindersList) dom.profileCalendarRemindersList.classList.toggle("is-hidden", !show);
        if (dom.profileCalendarReminderAdd) dom.profileCalendarReminderAdd.classList.toggle("is-hidden", !show);
        if (dom.profileCalendarRemindersHint) dom.profileCalendarRemindersHint.classList.toggle("is-hidden", !show);
      });
    }
    if (dom.profileCalendarReminderAdd) {
      dom.profileCalendarReminderAdd.addEventListener("click", () => {
        const current = readCalendarRemindersFromDom(dom.profileCalendarRemindersList);
        renderCalendarReminders(dom.profileCalendarRemindersList, [...current, { value: 30, unit: "minutes" }]);
      });
    }
    if (dom.eventCalendarCreateCheck) {
      dom.eventCalendarCreateCheck.addEventListener("change", () => { updateCalendarVisibility(); updateDiscordVisibility(); });
    }
    if (dom.eventCalendarRemindersEnabled) {
      dom.eventCalendarRemindersEnabled.addEventListener("change", () => updateCalendarVisibility());
    }
    if (dom.eventCalendarReminderAdd) {
      dom.eventCalendarReminderAdd.addEventListener("click", () => {
        const current = readCalendarRemindersFromDom(dom.eventCalendarRemindersList);
        renderCalendarReminders(dom.eventCalendarRemindersList, [...current, { value: 30, unit: "minutes" }]);
      });
    }
    if (api.onWebhookSyncSuccess) {
      api.onWebhookSyncSuccess(({ eventTitle }) => {
        showToast(t("settings.webhook.syncSuccess").replace("{title}", eventTitle));
      });
    }
    if (api.onWebhookSyncFailed) {
      api.onWebhookSyncFailed(({ eventTitle, error }) => {
        showToast(t("settings.webhook.syncFailed").replace("{title}", eventTitle).replace("{error}", error), true);
      });
    }
    initDiscordUI(api);
    if (dom.eckitImportBtn) {
      dom.eckitImportBtn.addEventListener("click", async () => {
        const result = await api.eckitImport();
        if (result.cancelled) return;
        if (result.ok) {
          // Visible feedback is the customization fields appearing below the
          // import button. The toast is a brief confirmation only; no kit
          // metadata is surfaced.
          showToast(t("settings.eckit.imported"));
          state.kitGroupIds = await api.eckitGetKitGroupIds().catch(() => []);
          // Reload current group config to show kit fields.
          const groupId = dom.discordGroupSelect?.value;
          if (groupId) {
            dom.discordGroupSelect.dispatchEvent(new Event("change"));
          }
          updateDiscordVisibility();
        } else {
          showToast(result.error || "Invalid kit file.", true);
        }
      });
    }
    // EC Kit color picker / hex text sync.
    if (dom.eckitEmbedColor && dom.eckitEmbedColorHex) {
      dom.eckitEmbedColor.addEventListener("input", () => {
        dom.eckitEmbedColorHex.value = dom.eckitEmbedColor.value;
      });
      dom.eckitEmbedColorHex.addEventListener("input", () => {
        const hex = dom.eckitEmbedColorHex.value.trim();
        if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
          dom.eckitEmbedColor.value = hex;
        }
      });
    }
    if (dom.profileWebhookImageBtn) {
      dom.profileWebhookImageBtn.addEventListener("click", async () => {
        const result = await api.eckitSelectImage();
        if (result.ok && result.filePath) {
          if (dom.profileWebhookImagePath) dom.profileWebhookImagePath.value = result.filePath;
        } else if (result.error) {
          showToast(result.error, true);
        }
      });
    }
    if (dom.profileWebhookMessageEnabled) {
      dom.profileWebhookMessageEnabled.addEventListener("change", () => {
        const show = dom.profileWebhookMessageEnabled.checked;
        if (dom.profileWebhookMessageCard) dom.profileWebhookMessageCard.classList.toggle("is-hidden", !show);
      });
    }
    if (dom.eventDiscordSyncCheck) {
      dom.eventDiscordSyncCheck.addEventListener("change", () => {
        updateDiscordVisibility();
      });
    }
    if (dom.webhookPostCheck) {
      dom.webhookPostCheck.addEventListener("change", () => {
        updateDiscordVisibility();
      });
    }
    if (dom.eventWebhookPostCheck) {
      dom.eventWebhookPostCheck.addEventListener("change", () => {
        updateDiscordVisibility();
      });
    }
    if (dom.eventWebhookMessageEnabled) {
      dom.eventWebhookMessageEnabled.addEventListener("change", () => {
        const show = dom.eventWebhookMessageEnabled.checked;
        if (dom.eventWebhookMessageInput) dom.eventWebhookMessageInput.classList.toggle("is-hidden", !show);
      });
    }
    if (dom.eventWebhookImageBtn) {
      dom.eventWebhookImageBtn.addEventListener("click", async () => {
        const result = await api.eckitSelectImage();
        if (result.ok && result.filePath) {
          if (dom.eventWebhookImagePath) dom.eventWebhookImagePath.value = result.filePath;
        } else if (result.error) {
          showToast(result.error, true);
        }
      });
    }
    // Modify modal posting options (pending events).
    if (dom.modifyWebhookPost) {
      dom.modifyWebhookPost.addEventListener("change", () => updateModifyWebhookVisibility());
    }
    if (dom.modifyCalendarSync) {
      dom.modifyCalendarSync.addEventListener("change", () => {
        updateModifyCalendarRemindersVisibility();
      });
    }
    if (dom.modifyCalendarRemindersEnabled) {
      dom.modifyCalendarRemindersEnabled.addEventListener("change", () => updateModifyCalendarRemindersVisibility());
    }
    if (dom.modifyWebhookMessageEnabled) {
      dom.modifyWebhookMessageEnabled.addEventListener("change", () => {
        const show = dom.modifyWebhookMessageEnabled.checked;
        if (dom.modifyWebhookMessageInput) dom.modifyWebhookMessageInput.classList.toggle("is-hidden", !show);
      });
    }
    if (dom.modifyWebhookImageBtn) {
      dom.modifyWebhookImageBtn.addEventListener("click", async () => {
        const result = await api.eckitSelectImage();
        if (result.ok && result.filePath) {
          if (dom.modifyWebhookImagePath) dom.modifyWebhookImagePath.value = result.filePath;
        } else if (result.error) {
          showToast(result.error, true);
        }
      });
    }
    if (dom.modifyCalendarReminderAdd) {
      dom.modifyCalendarReminderAdd.addEventListener("click", () => {
        addCalendarReminderRow(dom.modifyCalendarRemindersList, { value: 30, unit: "minutes" });
      });
    }
    if (dom.eventImagePicker) {
      dom.eventImagePicker.addEventListener("click", () => openGalleryPicker(dom.eventImageId));
    }
    if (dom.eventImportJson) {
      dom.eventImportJson.addEventListener("click", async () => {
        const result = await handleEventImportJson(api);
        if (result.cancelled) return;
        if (result.success) {
          showToast(t("events.importSuccess") || "Event data imported.");
        } else if (result.message) {
          showToast(result.message, true);
        }
      });
    }
    if (dom.eventExportJson) {
      dom.eventExportJson.addEventListener("click", async () => {
        const result = await handleEventExportJson(api);
        if (result.cancelled) return;
        if (result.success) {
          showToast(t("events.exportSuccess") || "Event data exported.");
        } else if (result.message) {
          showToast(result.message, true);
        }
      });
    }
    if (dom.modifyEventImagePicker) {
      dom.modifyEventImagePicker.addEventListener("click", () => openGalleryPicker(dom.modifyEventImageId));
    }
      initSeriesModule(api);
      initRasterizeStatusIndicator();

      // Schedule type filter chips.
      if (dom.scheduleFilterChips) {
        dom.scheduleFilterChips.addEventListener("click", (event) => {
          const btn = event.target.closest("button[data-filter]");
          if (!btn) return;
          state.schedules.filterType = btn.dataset.filter || "all";
          dom.scheduleFilterChips.querySelectorAll("button").forEach(b => {
            b.classList.toggle("is-active", b === btn);
          });
          renderProfileList(api);
        });
      }

      // Step 3 type toggle (Template / Series segmented control).
      if (dom.scheduleTypeTemplateBtn) {
        dom.scheduleTypeTemplateBtn.addEventListener("click", () => {
          if (state.schedules.editingType === "template") return;
          state.schedules.editingType = "template";
          // Don't clear the series form; DOM retains values for in-session toggle return.
          showScheduleMode("template");
        });
      }
      if (dom.scheduleTypeSeriesBtn) {
        dom.scheduleTypeSeriesBtn.addEventListener("click", () => {
          if (state.schedules.editingType === "series") return;
          // First toggle this session: seed sensible defaults, but only if
          // start date is empty (preserves user input on toggle-back).
          if (!dom.seriesStartDate?.value) {
            resetSeriesRecurrenceForm();
          }
          state.schedules.editingType = "series";
          showScheduleMode("series");
        });
      }
      if (dom.scheduleModeMoreInfo) {
        dom.scheduleModeMoreInfo.addEventListener("click", () => {
          if (dom.scheduleModeInfo) {
            dom.scheduleModeInfo.classList.toggle("is-hidden");
          }
        });
      }
      if (dom.seriesEndType) {
        dom.seriesEndType.addEventListener("change", () => updateSeriesEndVisibility());
      }
      // Series interval-unit dropdown re-evaluates weekday checkbox visibility.
      if (dom.seriesIntervalUnit) {
        dom.seriesIntervalUnit.addEventListener("change", () => updateSeriesFrequencyVisibility());
      }

      dom.profileGroup.addEventListener("change", async () => {
        handleProfileGroupChange(api);
        const groupId = dom.profileGroup.value;
        if (groupId) {
          await loadSeriesForGroup(groupId);
        }
        renderProfileList(api);
        // Reset wizard editing state and unlock toggle when switching groups.
        state.schedules.editingType = null;
        state.schedules.editingSeriesId = null;
        showScheduleMode(null, { lock: false });
      });
      dom.profileExisting.addEventListener("change", async () => {
        const selected = dom.profileExisting.value;
        if (selected.startsWith("series::")) {
          // Series selected: populate the wizard for editing so step buttons work directly.
          const seriesId = selected.slice("series::".length);
          const groupId = dom.profileGroup?.value;
          state.schedules.selectedType = "series";
          state.schedules.editingType = "series";
          state.schedules.editingSeriesId = seriesId;
          // Lazy-load series data if missing (covers stale-state scenarios).
          let seriesData = state.series?.[groupId]?.[seriesId];
          if (!seriesData) {
            try {
              const list = await api.seriesList({ groupId });
              if (list) {
                state.series[groupId] = list;
                seriesData = list[seriesId];
              }
            } catch (err) { /* ignore */ }
          }
          // Always set edit-confirmed for series so wizard transitions work.
          setProfileEditConfirmed(true);
          showScheduleMode("series", { lock: true });
          if (seriesData) {
            applySeriesToWizard(seriesData);
          }
          // Async-inspect: lock recurrence fields if started + backfill missing dates.
          setRecurrenceFieldsLocked(false);
          inspectSeriesOccurrences(api, groupId, seriesId).then(info => {
            if (info.started === true) setRecurrenceFieldsLocked(true);
            if ((!seriesData?.firstOccurrenceUtc) && info.earliestStart && dom.seriesStartDate?.value === "") {
              const localDate = new Date(info.earliestStart);
              if (!Number.isNaN(localDate.getTime())) {
                const yyyy = localDate.getFullYear();
                const mm = String(localDate.getMonth() + 1).padStart(2, "0");
                const dd = String(localDate.getDate()).padStart(2, "0");
                const hh = String(localDate.getHours()).padStart(2, "0");
                const mi = String(localDate.getMinutes()).padStart(2, "0");
                if (dom.seriesStartDate) dom.seriesStartDate.value = `${yyyy}-${mm}-${dd}`;
                if (dom.seriesStartTime) dom.seriesStartTime.value = `${hh}:${mi}`;
              }
            }
          }).catch(() => {});
          updateProfileActionButtons();
          return;
        } else if (selected) {
          // Template selected: handleProfileSelection loads the data; mark as edit.
          state.schedules.selectedType = "template";
          state.schedules.editingType = "template";
          state.schedules.editingSeriesId = null;
          showScheduleMode("template", { lock: true });
          setRecurrenceFieldsLocked(false);
          handleProfileSelection(api);
          // Same reason as the Edit button handler above: render helpers
          // live in this closure; applyProfileToForm doesn't trigger them.
          renderProfileLanguageList();
          renderProfilePlatformList();
          renderPatternList();
          setProfileEditConfirmed(true);
        } else {
          state.schedules.selectedType = null;
          state.schedules.editingType = null;
          state.schedules.editingSeriesId = null;
          showScheduleMode(null, { lock: false });
          setRecurrenceFieldsLocked(false);
          setProfileEditConfirmed(false);
        }
        updateProfileActionButtons();
      });
      dom.profileNew.addEventListener("click", () => {
        if (!dom.profileGroup?.value) {
          showToast(t("common.errors.noGroup") || "Select a group.", true);
          return;
        }
        // Reset editing state; type is picked in step 3 (toggle stays unlocked).
        state.schedules.editingType = null;
        state.schedules.editingSeriesId = null;
        showScheduleMode(null, { lock: false });
        // Ensure recurrence fields are unlocked for new series.
        setRecurrenceFieldsLocked(false);
        const r = handleProfileNew();
        if (!r.success && r.message) showToast(r.message, true);
      });
      dom.profileEdit.addEventListener("click", () => {
        const selected = dom.profileExisting?.value || "";
        if (selected.startsWith("series::")) {
          const seriesId = selected.slice("series::".length);
          const groupId = dom.profileGroup?.value;
          const seriesData = state.series?.[groupId]?.[seriesId];
          if (!seriesData) {
            showToast(t("series.errors.notFound") || "Series not found.", true);
            return;
          }
          // Set up wizard for editing this series; lock the type toggle.
          applySeriesToWizard(seriesData);
          showScheduleMode("series", { lock: true });
          setProfileEditConfirmed(true);
          // Default to unlocked recurrence fields; async inspect below may re-lock.
          setRecurrenceFieldsLocked(false);
          // Async: inspect occurrences to lock if started + backfill date/time if missing.
          inspectSeriesOccurrences(api, groupId, seriesId).then(info => {
            if (info.started === true) setRecurrenceFieldsLocked(true);
            if (!seriesData.firstOccurrenceUtc && info.earliestStart && dom.seriesStartDate?.value === "") {
              const localDate = new Date(info.earliestStart);
              if (!Number.isNaN(localDate.getTime())) {
                const yyyy = localDate.getFullYear();
                const mm = String(localDate.getMonth() + 1).padStart(2, "0");
                const dd = String(localDate.getDate()).padStart(2, "0");
                const hh = String(localDate.getHours()).padStart(2, "0");
                const mi = String(localDate.getMinutes()).padStart(2, "0");
                if (dom.seriesStartDate) dom.seriesStartDate.value = `${yyyy}-${mm}-${dd}`;
                if (dom.seriesStartTime) dom.seriesStartTime.value = `${hh}:${mi}`;
              }
            }
          }).catch(() => {});
          // Land on step 2 (Basics): most edits target event details, not recurrence.
          const w0 = getProfileWizard();
          if (w0?.goTo) w0.goTo(1);
          return;
        }
        // Template edit: existing flow, locked to template.
        state.schedules.editingType = "template";
        state.schedules.editingSeriesId = null;
        showScheduleMode("template", { lock: true });
        const r = handleProfileEdit();
        if (!r.success && r.message) showToast(r.message, true);
        // applyProfileToForm in profiles.js repopulates state.profile.{patterns,
        // languages,platforms}, but the DOM render helpers live in this
        // closure and aren't reachable from profiles.js. Re-render here so
        // step 3 reflects the loaded state.
        if (r.success) {
          renderProfileLanguageList();
          renderProfilePlatformList();
          renderPatternList();
          void renderProfileRoleRestrictions(api);
        }
      });
    dom.profileDelete.addEventListener("click", async () => {
      const selected = dom.profileExisting?.value || "";
      if (selected.startsWith("series::")) {
        const seriesId = selected.slice("series::".length);
        await handleSeriesDelete(api, seriesId);
        return;
      }
      const r = await handleProfileDelete(api);
      if (r.success) { showToast(r.message); await refreshData(); resetProfileForm(); renderProfileLanguageList(); renderProfilePlatformList(); renderPatternList(); void renderProfileRoleRestrictions(api); }
      else if (!r.cancelled) showToast(r.message, true);
    });

    // Dispatched after series CRUD.
    document.addEventListener("schedules:refresh", () => {
      renderProfileList(api);
    });

    // Series recurrence form: live updates (step 3 series mode).
    if (dom.seriesFrequency) {
      dom.seriesFrequency.addEventListener("change", () => updateSeriesFrequencyVisibility());
    }
    if (dom.seriesDuration) {
      dom.seriesDuration.addEventListener("input", () => {
        dom.seriesDuration.value = sanitizeDurationInputValue(dom.seriesDuration.value);
        updateSeriesDurationPreview();
      });
      dom.seriesDuration.addEventListener("blur", () => {
        normalizeDurationInput(dom.seriesDuration, 120);
        updateSeriesDurationPreview();
      });
    }
      // Save dispatches based on editingType.
      dom.profileSave.addEventListener("click", async () => {
        if (state.schedules.editingType === "series") {
          const result = state.schedules.editingSeriesId
            ? await handleSeriesUpdate(api)
            : await handleSeriesCreate(api);
          if (result?.success) {
            await refreshData({ preserveSelection: true });
            renderProfileList(api);
            state.schedules.editingType = null;
            state.schedules.editingSeriesId = null;
            showScheduleMode(null, { lock: false });
            // Reset form fields so the next New click starts fresh; keep the group.
            resetProfileForm();
            if (dom.profileExisting) dom.profileExisting.value = "";
            updateProfileActionButtons();
            // Return to step 1 (Selection) for picking another or creating new.
            const wizard = getProfileWizard();
            if (wizard?.goTo) wizard.goTo(0);
          }
          return;
        }
        const r = await handleProfileSave(api);
        if (r.success) {
          showToast(r.message);
          await refreshData({ preserveSelection: true });
          renderProfileList(api);
          // Reset form fields and return to step 1 for picking another or creating new.
          resetProfileForm();
          if (dom.profileExisting) dom.profileExisting.value = "";
          updateProfileActionButtons();
          renderProfileLanguageList();
          renderProfilePlatformList();
          renderPatternList();
          await renderProfileRoleRestrictions(api);
          const wizard = getProfileWizard();
          if (wizard?.goTo) wizard.goTo(0);
        } else {
          showToast(r.message, true);
        }
      });
      dom.profileLanguageFilter.addEventListener("input", renderProfileLanguageList);
      dom.profileAccess.addEventListener("change", () => handleProfileAccessChange(api));
    if (dom.profileDuration) {
      dom.profileDuration.addEventListener("input", () => {
        dom.profileDuration.value = sanitizeDurationInputValue(dom.profileDuration.value);
        updateProfileDurationPreview();
      });
      dom.profileDuration.addEventListener("blur", () => {
        normalizeDurationInput(dom.profileDuration, 120);
        updateProfileDurationPreview();
      });
      updateProfileDurationPreview();
    }
    dom.profileDateMode.addEventListener("change", () => { const isManual = dom.profileDateMode.value === "manual"; dom.patternType.disabled = isManual; dom.patternWeekday.disabled = isManual; dom.patternMonth.disabled = isManual; dom.patternDay.disabled = isManual; dom.patternTime.disabled = isManual; dom.patternAdd.disabled = isManual; dom.patternClear.disabled = isManual; dom.patternList.classList.toggle("is-disabled", isManual); });
    dom.patternAdd.addEventListener("click", handlePatternAdd);
    dom.patternClear.addEventListener("click", handlePatternClear);
    dom.patternType.addEventListener("change", handlePatternTypeChange);
    dom.patternMonth.addEventListener("change", updatePatternDayOptions);
    dom.patternDay.addEventListener("change", updatePatternDatePreview);

    if (dom.automationEnabled) {
      dom.automationEnabled.addEventListener("change", handleAutomationEnabledChange);
    }
    if (dom.automationTimingMode) {
      dom.automationTimingMode.addEventListener("change", handleAutomationTimingModeChange);
    }
    if (dom.automationRepeatMode) {
      dom.automationRepeatMode.addEventListener("change", handleAutomationRepeatModeChange);
    }
    if (dom.automationConfirmOk) {
      dom.automationConfirmOk.addEventListener("click", handleAutomationConfirmOk);
    }
    if (dom.automationConfirmCancel) {
      dom.automationConfirmCancel.addEventListener("click", handleAutomationConfirmCancel);
    }
    if (dom.automationConfirmOverlay) {
      dom.automationConfirmOverlay.addEventListener("click", e => {
        if (e.target === dom.automationConfirmOverlay) {
          handleAutomationConfirmCancel();
        }
      });
    }
    // Automation timing input handlers (DD:HH:MM format, like duration).
    if (dom.automationTimingInput) {
      dom.automationTimingInput.addEventListener("input", () => {
        dom.automationTimingInput.value = sanitizeDurationInputValue(dom.automationTimingInput.value);
        updateAutomationProse();
      });
      dom.automationTimingInput.addEventListener("blur", () => {
        const timing = parseAutomationTimingInput(dom.automationTimingInput.value);
        dom.automationTimingInput.value = formatAutomationTimingValue(timing.days, timing.hours, timing.minutes);
        updateAutomationProse();
        validateAndCorrectAutomationOffset();
      });
    }
    if (dom.automationTimingMode) {
      dom.automationTimingMode.addEventListener("change", validateAndCorrectAutomationOffset);
    }
    if (dom.automationMonthlyDay) {
      dom.automationMonthlyDay.addEventListener("input", updateAutomationProse);
    }
    if (dom.automationMonthlyTime) {
      dom.automationMonthlyTime.addEventListener("input", updateAutomationProse);
    }
    if (dom.automationRestore) {
      dom.automationRestore.addEventListener("click", handleAutomationRestore);
    }

    if (dom.profileImagePicker) {
      dom.profileImagePicker.addEventListener("click", () => openGalleryPicker(dom.profileImageId));
    }
    if (dom.profileImportJson) {
      dom.profileImportJson.addEventListener("click", async () => {
        const result = await handleProfileImportJson(api);
        if (result.cancelled) return;
        if (result.success) {
          if (result.needsUiUpdate) {
            renderProfileLanguageList();
            renderProfilePlatformList();
            renderPatternList();
            const wizard = getProfileWizard();
            if (wizard) {
              wizard.goTo(1);
            }
          }
          showToast(t("profiles.importSuccess") || "Profile data imported.");
        } else if (result.message) {
          showToast(result.message, true);
        }
      });
    }
    if (dom.profileExportJson) {
      dom.profileExportJson.addEventListener("click", async () => {
        const result = await handleProfileExportJson(api);
        if (result.cancelled) return;
        if (result.success) {
          showToast(t("profiles.exportSuccess") || "Profile data exported.");
        } else if (result.message) {
          showToast(result.message, true);
        }
      });
    }
    dom.twoFactorForm.addEventListener("submit", e => { e.preventDefault(); const code = dom.twoFactorCode.value.trim(); if (!code) { showToast(t("twoFactor.enterCode"), true); return; } api.submitTwoFactor(code); dom.twoFactorCode.value = ""; dom.twoFactorOverlay.classList.add("is-hidden"); });
    bindWindowControls(windowControls);
  }

  async function init() {
    await initI18n();
    document.documentElement.lang = getCurrentLanguage();
    renderLanguageSelect();
    applyTranslations();
    setAuthState(false);
    renderUpcomingEventCountLabel();
    if (api?.isDemo && api.demoInitError) {
      console.error("Demo preload error:", api.demoInitError);
      showToast("Demo data failed to initialize. Check the terminal logs.", true, { duration: 8000 });
    }
    initThemeControls();
    initGalleryPicker(api);
    initModifyEvents(api);
    if (api.isDemo) {
      initDemoControls(api, checkForUpdates);
    }
    await loadTheme(api);
    // Clean stale gallery cache entries on startup (older than 30 days)
    api.cleanGalleryCache?.(30);
    renderSelect(dom.eventCategory, CATEGORIES);
    renderSelect(dom.profileCategory, CATEGORIES);
    renderSelect(dom.eventAccess, ACCESS_TYPES);
    renderSelect(dom.profileAccess, ACCESS_TYPES);
    renderSelect(dom.profileDateMode, DATE_MODES);
    renderSelect(dom.patternType, PATTERN_TYPES, t("profiles.patterns.selectPattern"));
    renderSelect(dom.patternWeekday, WEEKDAYS, t("profiles.patterns.selectWeekday"));
    renderSelect(dom.patternMonth, MONTHS, t("profiles.patterns.selectMonth"));
    updatePatternDayOptions();
    handlePatternTypeChange();
    initModifySelects();
    const { list, systemTz } = buildTimezones();
    renderSelect(dom.profileTimezone, list);
    renderSelect(dom.eventTimezone, list);
    dom.profileTimezone.value = systemTz;
    dom.eventTimezone.value = systemTz;
    state.profile.tagInput = createTagInput({
      inputEl: dom.profileTags,
      chipContainer: dom.profileTagsChips,
      wrapperEl: dom.profileTagsInput,
      maxTags: TAG_LIMIT
    });
    state.event.tagInput = createTagInput({
      inputEl: dom.eventTags,
      chipContainer: dom.eventTagsChips,
      wrapperEl: dom.eventTagsInput,
      maxTags: TAG_LIMIT
    });
    resetProfileForm();
    renderProfileLanguageList();
    renderProfilePlatformList();
    void renderProfileRoleRestrictions(api);
    renderPatternList();
    applyManualEventDefaults();
    void renderEventRoleRestrictions(api);
    // Date range: today through one year from now.
    const today = getTodayDateString();
    const maxDate = getMaxEventDateString();
    dom.eventManualDate.min = today;
    dom.eventManualDate.max = maxDate;
    setEventWizard(setupWizard({
      wizardId: "event-wizard",
      stepsId: "event-steps",
      backButton: dom.eventBack,
      nextButton: dom.eventNext,
      beforeStepChange: handleEventWizardStepChange
    }));
    setProfileWizard(setupWizard({ wizardId: "profile-wizard", stepsId: "profile-steps", backButton: dom.profileBack, nextButton: dom.profileNext, saveButton: dom.profileSave, beforeStepChange: handleProfileWizardStepChange }));
    api.onTwoFactorRequired(() => {
      dom.twoFactorOverlay.classList.remove("is-hidden");
      dom.twoFactorCode.focus();
      // This can fire during a background auto-relogin (the 2FA-trust cookie
      // expired), so raise a system notification too — the window may have been
      // sitting in the tray and the user needs to know a code is required.
      try {
        if (typeof Notification === "function" && Notification.permission !== "denied") {
          new Notification(t("auth.reauthNotifyTitle"), { body: t("auth.reauthNotifyBody") });
        }
      } catch (err) {
        // Notifications are best-effort; the overlay is the primary prompt.
      }
    });
    if (api.onReloginFailed) {
      api.onReloginFailed(() => {
        // Auto sign-in stopped working (usually a stale saved password); the saved
        // login was already dropped in main. Reveal the login and tell the user so
        // automation doesn't just go quiet.
        setAuthState(false);
        showToast(t("auth.reloginFailedBody"), true);
        try {
          if (typeof Notification === "function" && Notification.permission !== "denied") {
            new Notification(t("auth.reloginFailedTitle"), { body: t("auth.reloginFailedBody") });
          }
        } catch (err) {
          // Best-effort.
        }
      });
    }
    const info = await api.getAppInfo();
    if (info) {
      dom.aboutVersion.textContent = info.version || "-";
      dom.aboutDataDir.textContent = info.dataDir || "-";
    }
    // Credential-protection disclosure. Surfaces when real OS encryption isn't in
    // effect (keyring-less Linux), OR when a saved secret has become unreadable (a
    // keyring change) — which can happen even on an otherwise-secure machine. On
    // Windows/macOS with everything readable, `secure` is true and `unreadable` is
    // 0, so the notice stays hidden. Setting data-i18n keeps the copy correct
    // across a language switch.
    if (api.getEncryptionStatus) {
      try {
        const enc = await api.getEncryptionStatus();
        const notice = document.getElementById("credential-protection-notice");
        if (notice && enc && (!enc.secure || enc.unreadable > 0)) {
          const variant = enc.unreadable > 0
            ? "unreadable"
            : enc.mode === "plaintext" ? "plaintext" : "appKey";
          const titleEl = document.getElementById("credential-protection-title");
          const detailEl = document.getElementById("credential-protection-detail");
          titleEl.setAttribute("data-i18n", `settings.security.${variant}Title`);
          detailEl.setAttribute("data-i18n", `settings.security.${variant}Detail`);
          titleEl.textContent = t(`settings.security.${variant}Title`);
          detailEl.textContent = t(`settings.security.${variant}Detail`);
          notice.classList.remove("is-hidden");
        }
      } catch (err) {
        // Advisory only; leave the notice hidden if status can't be read.
      }
    }
    void checkForUpdates();
    window.setInterval(checkForUpdates, UPDATE_CHECK_INTERVAL);
    if (api.onUpdateProgress) {
      api.onUpdateProgress((data) => {
        updateInfo.downloading = true;
        updateInfo.progress = data.percent || 0;
        setUpdateProgress(data.percent || 0, true);
      });
    }
    if (api.onUpdateReady) {
      api.onUpdateReady(() => {
        updateInfo.downloaded = true;
        updateInfo.downloading = false;
        setUpdateAvailable(updateInfo.available, true);
      });
    }
    if (api.onProfilesUpdated) {
      api.onProfilesUpdated((payload) => {
        const nextProfiles = payload?.profiles || payload;
        if (!nextProfiles || typeof nextProfiles !== "object") {
          return;
        }
        state.profiles = nextProfiles;
        renderProfileList(api);
        renderEventProfileOptions(api);
        const selected = dom.profileExisting?.value;
        if (selected && !getProfileEditConfirmed()) {
          const [groupId, profileKey] = selected.split("::");
          applyProfileToForm(groupId, profileKey);
          updateProfileActionButtons();
          renderProfileLanguageList();
          renderProfilePlatformList();
          renderPatternList();
          void renderProfileRoleRestrictions(api);
        }
        // Modify view's pendingEvents may include projected events sourced
        // from a now-deleted template; refresh so projection re-runs
        // against the updated profilesRef and stale entries disappear.
        void refreshModifyEvents(api, { preserveScroll: true });
      });
    }

    if (windowControls.onShowTrayPrompt) {
      windowControls.onShowTrayPrompt(() => {
        dom.trayPromptOverlay.classList.remove("is-hidden");
      });
    }

    if (dom.trayPromptYes) {
      dom.trayPromptYes.addEventListener("click", async () => {
        dom.trayPromptOverlay.classList.add("is-hidden");
        await api.updateSettings({ minimizeToTray: true, trayPromptShown: true });
        if (dom.settingsMinimizeTray) {
          dom.settingsMinimizeTray.checked = true;
        }
        windowControls.close();
      });
    }

    if (dom.trayPromptNo) {
      dom.trayPromptNo.addEventListener("click", async () => {
        dom.trayPromptOverlay.classList.add("is-hidden");
        await api.updateSettings({ trayPromptShown: true });
        api.quitApp();
      });
    }

    pendingAuthStart = true;
    showView("create");
    if (shouldShowLanguageSetup()) {
      showLanguageSetup();
    } else {
      pendingAuthStart = false;
      await startAuthFlow();
    }
  }

  // Expose to global scope for profiles.js (cross-module access without import cycle).
  window.updateAutomationProse = updateAutomationProse;
  window.updateRestorableCount = updateRestorableCount;

  bindEvents();
  init().catch(() => showToast("Failed to initialize app.", true));
})();
