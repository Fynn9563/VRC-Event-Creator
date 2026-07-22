// Persisted hourly rate-limit tally, keyed per (account, group).
//
// VRChat's limit is 10 events / hour / person / group — each signed-in account
// has its own budget, and another admin in the same group has their own. Both
// manual and automated posts record here, so the app keeps ONE true count of
// what it has posted instead of two blind halves (the Create screen and the
// automation engine) that each think the coast is clear.
//
// Lives in its own file so the crash-proof-save work and this tally ship
// independently. Only what this app posts is counted; events made outside the
// app (or by another admin) aren't attributed, so the number can read low, but
// it never over-counts and never blocks a post that would actually be allowed.

const { writeJsonAtomic, readJsonSafe } = require("./atomic-store");

const HOURLY_LIMIT = 10;
const WINDOW_MS = 60 * 60 * 1000;

let filePath = null;
let store = {}; // "userId::groupId" -> [epoch-ms timestamps]

function keyFor(userId, groupId) {
  return `${userId || "unknown"}::${groupId}`;
}

/**
 * Keep only timestamps inside the trailing hour. Future-dated entries are
 * dropped too — a clock jump can't lock an account out. Returned sorted asc.
 */
function pruneEntries(entries, now = Date.now()) {
  if (!Array.isArray(entries)) return [];
  const cutoff = now - WINDOW_MS;
  return entries
    .map(Number)
    .filter(t => Number.isFinite(t) && t > cutoff && t <= now)
    .sort((a, b) => a - b);
}

/** Load + prune from disk. Pruning is in-memory; disk is rewritten on next record. */
function load(path, now = Date.now()) {
  filePath = path;
  store = {};
  const { data } = readJsonSafe(path, {});
  if (data && typeof data === "object") {
    for (const [k, v] of Object.entries(data)) {
      const pruned = pruneEntries(v, now);
      if (pruned.length) store[k] = pruned;
    }
  }
  return store;
}

function save() {
  if (!filePath) return;
  try {
    writeJsonAtomic(filePath, store);
  } catch {
    // Best-effort; a failed tally write must never break posting.
  }
}

/** Record one create for (userId, groupId). Returns the new count in-window. */
function record(userId, groupId, now = Date.now()) {
  const k = keyFor(userId, groupId);
  const entries = pruneEntries(store[k], now);
  entries.push(now);
  store[k] = entries;
  save();
  return entries.length;
}

/** How many events this account has created for this group in the last hour. */
function count(userId, groupId, now = Date.now()) {
  const k = keyFor(userId, groupId);
  const entries = pruneEntries(store[k], now);
  store[k] = entries;
  return entries.length;
}

/** Milliseconds until the account is under the limit again, or 0 if it already is. */
function waitMs(userId, groupId, now = Date.now()) {
  const entries = pruneEntries(store[keyFor(userId, groupId)], now);
  if (entries.length < HOURLY_LIMIT) return 0;
  // Enough entries must age out to leave HOURLY_LIMIT-1 in the window. Entries are
  // oldest-first, so that's the (length - HOURLY_LIMIT)th one ageing out — not
  // just the oldest, which would still leave the count at the limit if the bucket
  // somehow holds more than HOURLY_LIMIT timestamps.
  return Math.max(0, entries[entries.length - HOURLY_LIMIT] + WINDOW_MS - now);
}

/** Test hook — drop all in-memory state and detach the file. */
function reset() {
  store = {};
  filePath = null;
}

module.exports = {
  load, save, record, count, waitMs, pruneEntries, keyFor, reset,
  HOURLY_LIMIT, WINDOW_MS,
};
