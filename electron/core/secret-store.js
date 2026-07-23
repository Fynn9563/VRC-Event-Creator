// Cross-platform secret encryption for the app's stored credentials.
//
// Two credential sites route through here:
//   - the Discord bot token + webhook URL (profiles.json), via encryptSecret /
//     decryptSecret called from main.js's encryptToken / decryptToken; and
//   - the VRChat session cookie (cache.json), via the store wrapper in main.js
//     that runs every value through encryptSecret on write and decryptSecret on
//     read.
// Both have to keep working on every platform the app targets: Windows
// (primary), macOS, and Linux — including the unattended / minimal Linux boxes
// that have no OS keyring at all.
//
// Three protection modes, decided at runtime:
//   keyring   — a real OS secret store backs safeStorage (Windows DPAPI, macOS
//               Keychain, Linux gnome-libsecret / kwallet). Genuine at-rest
//               encryption. This is ALWAYS the mode on Windows and macOS, so the
//               app-key file and the honest-disclosure UI below never come into
//               play there.
//   app-key   — no OS keyring (keyring-less Linux). We keep a random 256-bit key
//               in a separate 0600 file and encrypt with AES-256-GCM. This
//               protects a leaked config / backup / bug-report (the secret and
//               the key live in different files, so copying one leaks nothing),
//               but NOT against someone who can read the whole data directory.
//               The UI says exactly that rather than claiming "encrypted."
//   plaintext — even the app key could not be established (e.g. the data dir is
//               read-only). Last resort: store readable, but clearly marked, so
//               the disclosure can be honest instead of silently lying.
//
// The load-bearing correctness point: on Linux safeStorage.isEncryptionAvailable()
// returns true EVEN when the selected backend is `basic_text`, which the Electron
// docs describe as "unprotected ... encrypted via hardcoded plaintext password."
// Gating on isEncryptionAvailable() alone (as the old code did) therefore writes
// enc-prefixed data that is effectively plaintext-with-a-known-key on such a box —
// a false assurance. So we ALSO check getSelectedStorageBackend() and treat
// basic_text (and anything unrecognised) as NOT real encryption. We deliberately
// never call setUsePlainTextEncryption(true): that would force basic_text to
// report as available and defeat this very detection.

const KEY_FILE = "secret.key";

// Value markers. Our own outputs are always "v1:<algo>:"; the bare "enc:" form is
// the legacy output of the old encryptToken (safeStorage base64, no algo tag).
// Legacy plaintext values carry no marker at all. None of these collide: a Keyv-
// serialized cookie envelope is a JSON object (starts with "{"), a base64 blob
// never contains ":", and our markers all begin "v1:".
const SK_PREFIX = "v1:sk:"; // safeStorage / OS keyring
const AK_PREFIX = "v1:ak:"; // app-managed key (AES-256-GCM)
const PT_PREFIX = "v1:pt:"; // explicit, acknowledged plaintext
const LEGACY_ENC_PREFIX = "enc:"; // old encryptToken output

// The Linux backends that mean a real secret store is present. `basic_text`
// (unrecognised desktop / --password-store=basic) and `unknown` (called before
// app `ready`) are deliberately excluded.
const REAL_LINUX_BACKENDS = new Set([
  "gnome_libsecret",
  "kwallet",
  "kwallet5",
  "kwallet6"
]);

const IV_BYTES = 12; // AES-GCM standard nonce length
const TAG_BYTES = 16; // AES-GCM auth tag length
const KEY_BYTES = 32; // AES-256

/**
 * Build a secret store. Every external dependency is injected so the module can
 * be unit-tested against a fake safeStorage / fs with no Electron and no real
 * OS keyring.
 *
 * @param {object}   deps
 * @param {object}   deps.safeStorage  Electron safeStorage (or a fake).
 * @param {string}   deps.platform     process.platform.
 * @param {string}   deps.dataDir      directory the app-key file lives in.
 * @param {object}   deps.fs           node fs (or a fake).
 * @param {object}   deps.path         node path.
 * @param {object}   deps.crypto       node crypto.
 * @param {function} [deps.logger]     (channel, ...args) debug logger.
 */
function createSecretStore({ safeStorage, platform, dataDir, fs, path, crypto, logger }) {
  const log = typeof logger === "function" ? logger : () => {};
  const keyPath = path.join(dataDir, KEY_FILE);
  let appKey = null; // Buffer once loaded/created; null until needed
  let decryptFailures = 0; // real ciphertext that couldn't be decrypted this run

  // A stored secret that should have decrypted but didn't (keyring gone, tampered
  // file, regenerated key). Counted so the UI can tell the user a saved credential
  // has become unreadable, instead of it only failing silently at use time.
  function noteDecryptFailure(reason, err, silent) {
    // `silent` failures (the VRChat cookie cache) aren't counted toward the
    // "a saved credential can no longer be read" notice: a cookie that won't
    // decrypt just triggers a clean re-login, so it shouldn't cry wolf about a
    // lost credential. The notice is for profile secrets (Discord token / login).
    if (!silent) decryptFailures += 1;
    log("secret", reason, err ? err.message : "");
    return "";
  }

  function linuxBackend() {
    try {
      return safeStorage.getSelectedStorageBackend();
    } catch (err) {
      log("secret", "getSelectedStorageBackend threw:", err.message);
      return "";
    }
  }

  // True only when safeStorage is backed by a genuine OS secret store. On Linux
  // that additionally requires a recognised keyring backend (not basic_text).
  function keyringIsReal() {
    let available = false;
    try {
      available = safeStorage.isEncryptionAvailable();
    } catch (err) {
      log("secret", "isEncryptionAvailable threw:", err.message);
      return false;
    }
    if (!available) return false;
    if (platform === "linux") {
      return REAL_LINUX_BACKENDS.has(linuxBackend());
    }
    // Windows (DPAPI) and macOS (Keychain): available means real.
    return true;
  }

  // Load the app key, or generate and persist one. Returns a 32-byte Buffer, or
  // null if the key can't be established (unwritable data dir) — the caller then
  // falls back to marked plaintext. The key file is written owner-only (0600);
  // Windows ignores the POSIX mode but that path only runs on keyring-less Linux.
  function loadOrCreateAppKey() {
    if (appKey) return appKey;
    try {
      if (fs.existsSync(keyPath)) {
        const raw = fs.readFileSync(keyPath, "utf8").trim();
        const buf = Buffer.from(raw, "base64");
        if (buf.length === KEY_BYTES) {
          appKey = buf;
          return appKey;
        }
        log("secret", "app key file has unexpected length; regenerating");
      }
    } catch (err) {
      log("secret", "reading app key failed; regenerating:", err.message);
    }
    try {
      const key = crypto.randomBytes(KEY_BYTES);
      // temp + rename so a crash mid-write can't orphan every app-key secret.
      const tmp = `${keyPath}.tmp`;
      fs.writeFileSync(tmp, key.toString("base64"), { mode: 0o600 });
      try {
        fs.chmodSync(tmp, 0o600);
      } catch (err) {
        log("secret", "chmod app key failed (non-fatal):", err.message);
      }
      fs.renameSync(tmp, keyPath);
      // A second instance racing first-run may have won the rename; adopt whatever
      // key actually landed on disk so both converge on one key. The app's
      // single-instance lock normally prevents this race — this is belt and braces.
      try {
        const onDisk = Buffer.from(fs.readFileSync(keyPath, "utf8").trim(), "base64");
        appKey = onDisk.length === KEY_BYTES ? onDisk : key;
      } catch {
        appKey = key;
      }
      return appKey;
    } catch (err) {
      log("secret", "persisting app key failed; using plaintext:", err.message);
      return null;
    }
  }

  // Resolve the active mode. Recomputed per call (the calls are rare — a
  // credential save or a cookie refresh) so a change in keyring availability is
  // always reflected, and so we never cache a decision made before app `ready`.
  function getMode() {
    if (keyringIsReal()) return "keyring";
    if (loadOrCreateAppKey()) return "app-key";
    return "plaintext";
  }

  // Shape consumed by the Settings disclosure. `secure` gates the whole UI: it is
  // true only under real OS encryption, so on Windows / macOS nothing renders.
  function getStatus() {
    const mode = getMode();
    return {
      mode, // "keyring" | "app-key" | "plaintext"
      platform,
      backend: platform === "linux" ? linuxBackend() || null : null,
      secure: mode === "keyring", // genuine at-rest encryption
      sharingSafe: mode !== "plaintext", // safe against an accidental config/backup leak
      unreadable: decryptFailures // >0 means a stored secret couldn't be decrypted this run
    };
  }

  // Attempt to decrypt a stored value purely to detect an unreadable secret (its
  // failure feeds getStatus().unreadable). Used to probe existing credentials at
  // load so a keyring change is surfaced up front, not only when a post fails.
  function probeSecret(stored) {
    decryptSecret(stored);
  }

  function appKeyEncrypt(plain) {
    const key = loadOrCreateAppKey();
    if (!key) return null;
    const iv = crypto.randomBytes(IV_BYTES);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const ct = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return AK_PREFIX + Buffer.concat([iv, tag, ct]).toString("base64");
  }

  function appKeyDecrypt(marked) {
    const key = loadOrCreateAppKey();
    if (!key) throw new Error("app key unavailable");
    const raw = Buffer.from(marked.slice(AK_PREFIX.length), "base64");
    const iv = raw.subarray(0, IV_BYTES);
    const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const ct = raw.subarray(IV_BYTES + TAG_BYTES);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  }

  /**
   * Encrypt a secret for storage. Always returns a v1-marked string (or "" for an
   * empty input), so the on-disk format is self-describing and decryptSecret can
   * route it back without guessing.
   */
  function encryptSecret(plain) {
    if (plain == null || plain === "") return "";
    const value = String(plain);
    if (keyringIsReal()) {
      try {
        return SK_PREFIX + safeStorage.encryptString(value).toString("base64");
      } catch (err) {
        // A momentary keyring failure degrades to the app key rather than losing
        // the write outright.
        log("secret", "keyring encrypt failed; degrading to app key:", err.message);
      }
    }
    const appEncrypted = appKeyEncrypt(value);
    if (appEncrypted) return appEncrypted;
    return PT_PREFIX + value;
  }

  /**
   * Decrypt a stored secret. Handles every format the app can encounter: the v1
   * markers we write, the legacy `enc:` safeStorage form, and bare un-prefixed
   * plaintext (a value written before encryption existed, or a not-yet-migrated
   * cookie). Unreadable ciphertext returns "" — for the cookie that means a
   * silent re-login, never a crash.
   */
  function decryptSecret(stored, opts = {}) {
    const silent = opts.silent === true;
    if (stored == null || stored === "") return "";
    const s = String(stored);

    if (s.startsWith(SK_PREFIX)) {
      try {
        return safeStorage.decryptString(Buffer.from(s.slice(SK_PREFIX.length), "base64"));
      } catch (err) {
        return noteDecryptFailure("keyring decrypt failed:", err, silent);
      }
    }
    if (s.startsWith(AK_PREFIX)) {
      try {
        return appKeyDecrypt(s);
      } catch (err) {
        return noteDecryptFailure("app-key decrypt failed:", err, silent);
      }
    }
    if (s.startsWith(PT_PREFIX)) {
      return s.slice(PT_PREFIX.length);
    }
    if (s.startsWith(LEGACY_ENC_PREFIX)) {
      try {
        if (!safeStorage.isEncryptionAvailable()) {
          return noteDecryptFailure("legacy decrypt unavailable (no keyring)", null, silent);
        }
        return safeStorage.decryptString(Buffer.from(s.slice(LEGACY_ENC_PREFIX.length), "base64"));
      } catch (err) {
        return noteDecryptFailure("legacy decrypt failed:", err, silent);
      }
    }
    // Legacy un-prefixed plaintext (pre-encryption Discord token, or a cookie
    // value written by an older build). Returned as-is; it re-encrypts to a v1
    // form on the next write.
    return s;
  }

  // True when a stored value is a legacy format (bare plaintext, or the old
  // `enc:` safeStorage form) that should be rewritten to the current v1 scheme.
  // Empty values and already-v1 values don't need upgrading.
  function needsUpgrade(stored) {
    return typeof stored === "string" && stored !== "" && !stored.startsWith("v1:");
  }

  return {
    encryptSecret,
    decryptSecret,
    needsUpgrade,
    probeSecret,
    getMode,
    getStatus,
    // exposed for the store wrapper / diagnostics
    keyPath
  };
}

module.exports = {
  createSecretStore,
  SK_PREFIX,
  AK_PREFIX,
  PT_PREFIX,
  LEGACY_ENC_PREFIX,
  REAL_LINUX_BACKENDS
};
