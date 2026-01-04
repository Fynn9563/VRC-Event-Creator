// Authentication and session management for VRChat Event Creator

import { dom, state } from "./state.js";
import { setStatus, setFootMeta, showToast, setAuthState } from "./ui.js";
import { t } from "./i18n/index.js";
import { loadSettings, saveSettings, requireContactEmail, sanitizeEmail, sanitizePassword, sanitizeUsername } from "./utils.js";

// ============================================================================
// Session Management
// ============================================================================

export async function checkSession(api, refreshDataFn) {
  setStatus(t("auth.sessionChecking"));
  try {
    const user = await api.getCurrentUser();
    if (user) {
      await onLoginSuccess(api, user, refreshDataFn);
      return;
    }
  } catch (err) {
    showToast("Session check failed.", true);
  }
  setAuthState(false);
  setStatus(t("auth.loginRequired"));
}

async function onLoginSuccess(api, user, refreshDataFn) {
  state.user = user;
  setAuthState(true);
  dom.aboutSession.textContent = user.displayName || "Authenticated";
  setStatus(t("auth.loggedInAs", { name: user.displayName || "user" }));
  await refreshDataFn();
}

// ============================================================================
// Login/Logout Handlers
// ============================================================================

export async function handleLogin(event, api, refreshDataFn) {
  event.preventDefault();
  if (!dom.contactOverlay.classList.contains("is-hidden")) {
    showToast("Set contact email before logging in.", true);
    return;
  }
  const username = sanitizeUsername(dom.loginUsername.value);
  const password = sanitizePassword(dom.loginPassword.value);
  dom.loginUsername.value = username;
  dom.loginPassword.value = password;
  if (!username || !password) {
    showToast("Enter username and password.", true);
    return;
  }
  setStatus(t("auth.loggingIn"));
  try {
    const result = await api.login({ username, password });
    if (result && result.user) {
      dom.loginPassword.value = "";
      await onLoginSuccess(api, result.user, refreshDataFn);
    }
  } catch (err) {
    showToast(err?.message || "Login failed.", true);
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
    showToast("Logout failed.", true);
  }
  state.user = null;
  setAuthState(false);
  setStatus(t("auth.loggedOut"));
}

// ============================================================================
// Contact Email / Settings Handlers
// ============================================================================

export async function handleContactSave(event, api) {
  if (event) {
    event.preventDefault();
  }
  const email = sanitizeEmail(dom.contactEmail.value || dom.settingsContactEmail.value || "");
  dom.contactEmail.value = email;
  dom.settingsContactEmail.value = email;
  if (!email || !/.+@.+\..+/.test(email)) {
    showToast("Enter a valid contact email.", true);
    return;
  }
  try {
    const settings = await saveSettings(api, email);
    if (requireContactEmail(settings)) {
      await checkSession(api, async () => {});
    }
    setStatus(t("contact.saved"));
    showToast("Contact email saved.");
  } catch (err) {
    showToast(err?.message || "Could not save settings.", true);
  }
}

export async function handleSettingsSave(api) {
  dom.contactEmail.value = dom.settingsContactEmail.value;
  await handleContactSave(null, api);
  showToast("Settings saved.");
}
