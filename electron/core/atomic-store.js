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
  // Swap the good new bytes into place first, THEN refresh the backup from that
  // just-written primary. Refreshing after the swap (never copying the prior
  // on-disk primary) means a recovery write — where the primary was corrupt and
  // we're rewriting good data recovered from .bak — can't overwrite the good
  // backup with the corrupt primary.
  renameWithRetry(tmp, filePath);
  try {
    fs.copyFileSync(filePath, backupPath(filePath));
  } catch (err) {
    // A missing/stale backup is not fatal; the primary now holds good data.
  }
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
  // Read a file, distinguishing three outcomes: parsed data, "not there",
  // "corrupt" (parse failed), or "locked" (a transient Windows lock from AV /
  // indexer / backup — the same codes the write path retries). We retry a
  // locked read rather than treating it as corruption, because falling to a
  // stale .bak over a good-but-locked primary would silently lose data.
  const tryRead = (p) => {
    if (!fs.existsSync(p)) return { status: "missing" };
    for (let attempt = 0; attempt < MAX_RENAME_RETRIES; attempt += 1) {
      try {
        return { status: "ok", data: JSON.parse(fs.readFileSync(p, "utf8")) };
      } catch (err) {
        if (RETRYABLE.has(err.code)) {
          sleepSync(RETRY_DELAY_MS);
          continue;
        }
        return { status: "corrupt" }; // parse error or non-retryable read error
      }
    }
    return { status: "locked" };
  };

  const primary = tryRead(filePath);
  if (primary.status === "ok") {
    return { data: primary.data, source: "primary", recovered: false };
  }
  // Only recover from the backup when the primary is genuinely corrupt or
  // missing — NOT when it's merely locked (recovering + re-saving would clobber
  // a good primary we just couldn't read yet).
  if (primary.status === "corrupt" || primary.status === "missing") {
    const backup = tryRead(backupPath(filePath));
    if (backup.status === "ok") {
      return { data: backup.data, source: "backup", recovered: true };
    }
  }
  // Locked primary, or both files unusable: hand back the fallback but do NOT
  // signal recovery, so the caller won't re-save over a primary that may still
  // be good on the next launch.
  return { data: fallback, source: "default", recovered: false };
}

module.exports = { writeFileAtomic, writeJsonAtomic, readJsonSafe, backupPath };
