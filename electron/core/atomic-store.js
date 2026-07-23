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

// Paths whose primary was present-but-unreadable (a transient AV / indexer /
// backup lock) at load time. We handed the caller fallback data it didn't ask
// for, so its in-memory state doesn't reflect what's really on disk — writing it
// back would clobber the real file. Quarantined paths refuse writes until a
// successful read proves the real data is readable again and clears them. A
// genuinely missing or corrupt primary is NOT quarantined: there's nothing intact
// to protect, and the app should be free to write good data over it.
const quarantined = new Set();

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
  if (quarantined.has(filePath)) {
    // The primary was locked at load; the caller is holding fallback data, so
    // persisting it would overwrite the real (present-but-unread) file. Skip the
    // write and report it, rather than destroy data we simply couldn't read yet.
    return false;
  }
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
  return true;
}

/** Atomically write `data` as pretty JSON. Returns false if the path is
 * quarantined from a locked read and the write was skipped. */
function writeJsonAtomic(filePath, data) {
  return writeFileAtomic(filePath, JSON.stringify(data, null, 2));
}

/**
 * Read JSON, falling back to the .bak copy if the primary is missing or
 * corrupt, then to `fallback`.
 * @returns {{ data: any, source: "primary"|"backup"|"default", recovered: boolean, blocked: boolean }}
 */
function readJsonSafe(filePath, fallback) {
  // Read a file, distinguishing four outcomes: ok, missing, corrupt (parse
  // failed), or locked (a transient Windows lock from AV / indexer / backup —
  // the same codes the write path retries). We retry a locked read rather than
  // treating it as corruption, because falling to a stale .bak over a
  // good-but-locked primary would silently lose data.
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
        // A genuine parse failure is corruption; any other read error (EIO,
        // EMFILE, ENOMEM, …) is transient/environmental — not proof the data is
        // bad — so treat it like a lock and quarantine rather than clobber a file
        // we merely couldn't read.
        if (err instanceof SyntaxError) return { status: "corrupt" };
        return { status: "locked" };
      }
    }
    return { status: "locked" };
  };

  const primary = tryRead(filePath);
  if (primary.status === "ok") {
    quarantined.delete(filePath); // the real data is readable again
    return { data: primary.data, source: "primary", recovered: false, blocked: false };
  }
  // Recover from the backup when the primary is corrupt, missing, OR locked. A
  // locked primary is present-but-unreadable: we still quarantine the path so the
  // fallback can't be saved over it, but a good backup beats an empty fallback, so
  // hand the backup's data back read-only (blocked) rather than running on nothing.
  const lockedPrimary = primary.status === "locked";
  if (primary.status === "corrupt" || primary.status === "missing" || lockedPrimary) {
    const backup = tryRead(backupPath(filePath));
    if (backup.status === "ok") {
      if (lockedPrimary) {
        quarantined.add(filePath); // present-but-unread primary — refuse writes over it
      } else {
        quarantined.delete(filePath);
      }
      return { data: backup.data, source: "backup", recovered: true, blocked: lockedPrimary };
    }
  }
  // Both files unusable. A locked primary stays quarantined so the fallback can't
  // clobber present-but-unread data; a genuinely missing/corrupt primary is left
  // writable so the app can save good data over it. `blocked` tells the caller its
  // state is untrusted.
  if (lockedPrimary) {
    quarantined.add(filePath);
  }
  return { data: fallback, source: "default", recovered: false, blocked: quarantined.has(filePath) };
}

module.exports = { writeFileAtomic, writeJsonAtomic, readJsonSafe, backupPath };
