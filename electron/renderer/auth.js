import { dom, state } from "./state.js";
import { setStatus, showToast, setAuthState } from "./ui.js";
import { t } from "./i18n/index.js";
import { sanitizePassword, sanitizeUsername } from "./utils.js";
import { updateAdvancedSettingsVisibility, updateImportExportVisibility } from "./events.js";
import { updateDiscordVisibility, updateCalendarVisibility } from "./profiles.js";

export async function checkSession(api, refreshDataFn) {
  setStatus(t("auth.sessionChecking"));
  try {
    const user = await api.getCurrentUser();
    if (user) {
      await onLoginSuccess(api, user, refreshDataFn);
      return;
    }
  } catch (err) {
    showToast(t("auth.sessionCheckFailed"), true);
  }
  setAuthState(false);
  setStatus(t("auth.loginRequired"));
  // Reflect the saved "stay signed in" preference on the login form.
  try {
    const settings = await api.getSettings();
    if (dom.loginKeepSignedIn) {
      dom.loginKeepSignedIn.checked = Boolean(settings.keepSignedIn);
    }
  } catch (err) {
    // Leave it unchecked if settings can't be read.
  }
}

async function onLoginSuccess(api, user, refreshDataFn) {
  state.user = user;
  setAuthState(true);
  dom.aboutSession.textContent = user.displayName || "Authenticated";
  setStatus(t("auth.loggedInAs", { name: user.displayName || "user" }));

  try {
    const settings = await api.getSettings();
    if (dom.eventWarnConflicts) {
      dom.eventWarnConflicts.checked = Boolean(settings.warnConflicts);
    }
    if (dom.settingsMinimizeTray) {
      dom.settingsMinimizeTray.checked = Boolean(settings.minimizeToTray);
    }
    if (dom.settingsStartOnStartup) {
      dom.settingsStartOnStartup.checked = Boolean(settings.startOnStartup);
    }
    if (dom.settingsShowFeaturedVerification) {
      dom.settingsShowFeaturedVerification.checked = Boolean(settings.showFeaturedVerification);
    }
    if (dom.settingsEnableAdvanced) {
      dom.settingsEnableAdvanced.checked = Boolean(settings.enableAdvanced);
    }
    if (dom.settingsEnableImportExport) {
      dom.settingsEnableImportExport.checked = Boolean(settings.enableImportExport);
    }
    if (dom.settingsAutoUploadImages) {
      dom.settingsAutoUploadImages.checked = Boolean(settings.autoUploadImages);
    }
    if (dom.settingsDiscordEnabled) {
      dom.settingsDiscordEnabled.checked = Boolean(settings.discordEnabled);
    }
    if (dom.settingsCalendarEnabled) {
      dom.settingsCalendarEnabled.checked = Boolean(settings.calendarEnabled);
    }
    if (dom.calendarSaveDirDisplay) {
      dom.calendarSaveDirDisplay.textContent = settings.calendarSaveDir || "-";
    }
    state.settings = settings;
    // Hydrate persisted modify time range.
    if (Number.isFinite(settings.modifyTimeRangeDays)) {
      state.modify.timeRangeDays = settings.modifyTimeRangeDays;
      if (dom.modifyTimeRange) {
        dom.modifyTimeRange.value = String(settings.modifyTimeRangeDays);
      }
    }
    updateAdvancedSettingsVisibility();
    updateImportExportVisibility();
    // Discord caret visibility set on load; panel stays collapsed.
    updateDiscordVisibility();
    updateCalendarVisibility();
  } catch (err) {
    console.error("Failed to load settings:", err);
  }

  await refreshDataFn();
}

export async function handleLogin(event, api, refreshDataFn) {
  event.preventDefault();
  const username = sanitizeUsername(dom.loginUsername.value);
  const password = sanitizePassword(dom.loginPassword.value);
  dom.loginUsername.value = username;
  dom.loginPassword.value = password;
  if (!username || !password) {
    showToast(t("auth.enterCredentials"), true);
    return;
  }
  const keepSignedIn = Boolean(dom.loginKeepSignedIn?.checked);
  setStatus(t("auth.loggingIn"));
  try {
    const result = await api.login({ username, password, keepSignedIn });
    if (result && result.user) {
      dom.loginPassword.value = "";
      await onLoginSuccess(api, result.user, refreshDataFn);
    }
  } catch (err) {
    showToast(err?.message || t("auth.loginFailed"), true);
    setStatus(t("auth.loginFailed"));
  }
}

export function handleLoginClose(api) {
  api.quitApp();
}

export async function handleLogout(api) {
  try {
    await api.logout();
  } catch (err) {
    showToast(t("auth.logoutFailed"), true);
  }
  state.user = null;
  setAuthState(false);
  setStatus(t("auth.loggedOut"));
}

export function handleSettingsSave() {
  showToast(t("settings.saved"));
}
