// Crash-safe file writes for the app's small state files (settings, profiles,
// series, pending events, automation state, rate-limit tally).
//
// A plain writeFileSync can leave a truncated or empty file if the process
// dies mid-write — a real risk here because users hard-power-off nightly. This
// writes to a temp file, flushes it to disk, keeps a .bak of the last good
// copy, then atomically swaps the temp into place.
//
// Cross-platform notes:
//  - fs.renameSync replaces an existing target atomically on BOTH POSIX and
//    Windows (Node uses MoveFileEx with REPLACE_EXISTING under the hood), so we
//    never delete-then-rename — that would reopen the very crash window we're
//    closing.
//  - On Windows, antivirus / the search indexer / backup tools can briefly hold
//    a file open, making the swap fail with EPERM/EBUSY/EACCES. We retry a few
//    times with a short synchronous pause. POSIX doesn't hit this.

const fs = require("fs");

const RETRYABLE = new Set(["EPERM", "EBUSY", "EACCES"]);
const MAX_RENAME_RETRIES = 5;
const RETRY_DELAY_MS = 40;

// Synchronous sleep without blocking on a busy loop — used only on the rare
// Windows retry path. Atomics.wait parks the thread for the given ms.
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function backupPath(filePath) {
  return `${filePath}.bak`;
}

function renameWithRetry(from, to) {
  let lastErr;
  for (let attempt = 0; attempt < MAX_RENAME_RETRIES; attempt += 1) {
    try {
      fs.renameSync(from, to);
      return;
    } catch (err) {
      lastErr = err;
      if (!RETRYABLE.has(err.code)) throw err;
      sleepSync(RETRY_DELAY_MS);
    }
  }
  throw lastErr;
}

/**
 * Atomically write a string to filePath, preserving a .bak of the prior file.
 * @param {string} filePath
 * @param {string} contents
 */
function writeFileAtomic(filePath, contents) {
  const tmp = `${filePath}.tmp`;
  const fd = fs.openSync(tmp, "w");
  try {
    fs.writeFileSync(fd, contents);
    fs.fsyncSync(fd); // ensure the bytes are on disk before we swap
  } finally {
    fs.closeSync(fd);
  }
  // Best-effort backup of the last known-good file (copy, not rename, so the
  // live file is never absent even for an instant).
  if (fs.existsSync(filePath)) {
    try {
      fs.copyFileSync(filePath, backupPath(filePath));
    } catch (err) {
      // A missing backup is not fatal; the atomic swap below still protects us.
    }
  }
  renameWithRetry(tmp, filePath);
}

/** Atomically write `data` as pretty JSON. */
function writeJsonAtomic(filePath, data) {
  writeFileAtomic(filePath, JSON.stringify(data, null, 2));
}

/**
 * Read JSON, falling back to the .bak copy if the primary is missing or
 * corrupt, then to `fallback`.
 * @returns {{ data: any, source: "primary"|"backup"|"default", recovered: boolean }}
 */
function readJsonSafe(filePath, fallback) {
  const tryRead = (p) => {
    if (!fs.existsSync(p)) return undefined;
    return JSON.parse(fs.readFileSync(p, "utf8"));
  };
  try {
    const data = tryRead(filePath);
    if (data !== undefined) return { data, source: "primary", recovered: false };
  } catch (err) {
    // primary is corrupt — fall through to the backup
  }
  try {
    const data = tryRead(backupPath(filePath));
    if (data !== undefined) return { data, source: "backup", recovered: true };
  } catch (err) {
    // backup is corrupt too — fall through to the default
  }
  return { data: fallback, source: "default", recovered: false };
}

module.exports = { writeFileAtomic, writeJsonAtomic, readJsonSafe, backupPath };
