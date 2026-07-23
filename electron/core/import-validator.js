// Schema validator for user-supplied JSON imports (events + profiles).
//
// Threat model: an attacker hands the user a malicious JSON file and the
// user imports it via dialog. Without validation, any field shape is
// possible:
//   - Prototype pollution via __proto__ / constructor / prototype keys
//   - Oversized strings or arrays causing memory pressure / UI hangs
//   - Wrong types causing downstream crashes when state.* is used
//   - Unknown fields persisting through saves and quietly accumulating
//
// Strategy: strict whitelist + type coercion. Anything not in the schema
// is dropped silently. Each schema field has a type plus an optional max
// length / array cap. Non-conformant values fall back to documented
// defaults rather than rejecting the whole import; a single bad field
// shouldn't prevent the user from importing a mostly-good event.

// Cap string fields at 10k chars before downstream code sees them. UI
// limits descriptions to a few thousand; anything larger is a memory-
// pressure attempt or accidentally-pasted binary. Per-field caps below
// override this for short fields.
const STRING_CAP = 10000;

// Max array length for any whitelisted array field. The UI iterates these;
// an array of 100k strings would wedge the renderer.
const ARRAY_CAP = 100;

// Reject these top-level keys outright; they're dangerous regardless of
// value type. Object.create(null) on the working object would belt this;
// the explicit reject is the suspenders.
const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function asString(v, max = STRING_CAP) {
  if (typeof v !== "string") return "";
  return v.length > max ? v.slice(0, max) : v;
}

// VRChat file IDs are `file_<uuid>` — a strict charset. Reject anything with a
// path separator or traversal so a crafted imageId can't escape the gallery
// cache directory when it's later joined into a filesystem path.
function asFileId(v) {
  if (typeof v !== "string") return "";
  const s = v.slice(0, 128);
  return /^[A-Za-z0-9_-]+$/.test(s) ? s : "";
}

function asBoolean(v, fallback = false) {
  return typeof v === "boolean" ? v : fallback;
}

function asNumber(v, { min = -Infinity, max = Infinity, fallback = 0 } = {}) {
  if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}

function asStringArray(v, { itemMax = 200, capacity = ARRAY_CAP } = {}) {
  if (!Array.isArray(v)) return [];
  return v
    .filter(item => typeof item === "string")
    .slice(0, capacity)
    .map(item => (item.length > itemMax ? item.slice(0, itemMax) : item));
}

function asEnum(v, allowed, fallback) {
  return typeof v === "string" && allowed.includes(v) ? v : fallback;
}

// Reject + warn if dangerous prototype-pollution keys appear at the top
// level. Silent drops would work; throwing surfaces the attempt in logs.
function rejectDangerousKeys(raw) {
  for (const key of Object.keys(raw)) {
    if (DANGEROUS_KEYS.has(key)) {
      return `Refused: import contains forbidden key "${key}".`;
    }
  }
  return null;
}

const VALID_CATEGORIES = [
  "hangout", "exploration", "roleplaying", "film_media", "gaming", "music",
  "dance", "performance", "arts", "avatars", "education", "wellness", "other",
];
const VALID_ACCESS_TYPES = ["public", "group"];
const VALID_PLATFORMS = ["standalonewindows", "android", "ios"];

// Mirrors the value codes in renderer/config.js LANGUAGES. Kept in sync manually
// (the renderer config is an ES module the CommonJS validator can't import).
const VALID_LANGUAGES = [
  "eng", "jpn", "zho", "spa", "fra", "deu", "por", "rus", "kor", "ase", "bfi",
  "jsl", "tok", "ita", "pol", "afr", "ara", "asf", "ben", "bul", "yue", "ces",
  "dan", "nld", "epo", "est", "fil", "fin", "ell", "heb", "hin", "hmn", "hun",
  "isl", "ind", "gle", "lav", "lit", "ltz", "mkd", "msa", "mri", "mar", "nor",
  "nzs", "ron", "sco", "slk", "slv", "swe", "tel", "tha", "tur", "ukr", "urd",
  "vie", "cym", "zxx"
];
const VALID_DATE_MODES = ["manual", "pattern", "both"];

// ─────────────────────────────────────────────────────────────────────────
// Event JSON schema. See electron/renderer/events.js handleEventExportJson
// for the source of truth on what fields are produced.
// ─────────────────────────────────────────────────────────────────────────

function validateEventImport(raw) {
  if (!isPlainObject(raw)) {
    return { ok: false, error: "Event JSON must be an object." };
  }
  const dangerous = rejectDangerousKeys(raw);
  if (dangerous) return { ok: false, error: dangerous };

  const out = {
    title: asString(raw.title, 100),
    description: asString(raw.description, 10000),
    category: asEnum(raw.category, VALID_CATEGORIES, "hangout"),
    accessType: asEnum(raw.accessType, VALID_ACCESS_TYPES, "public"),
    tags: asStringArray(raw.tags, { itemMax: 50, capacity: 5 }),
    roleIds: asStringArray(raw.roleIds, { itemMax: 100, capacity: 50 }),
    imageId: asFileId(raw.imageId),
    imageBase64: asString(raw.imageBase64, 8 * 1024 * 1024), // 8 MB cap
    sendNotification: asBoolean(raw.sendNotification, false),
    featured: asBoolean(raw.featured, false),
    groupFair: asBoolean(raw.groupFair, false),
    duration: asNumber(raw.duration, { min: 1, max: 31 * 24 * 60, fallback: 120 }),
    timezone: asString(raw.timezone, 80),
    languages: asStringArray(raw.languages, { itemMax: 10, capacity: 3 })
      .filter(l => VALID_LANGUAGES.includes(l)),
    platforms: asStringArray(raw.platforms, { itemMax: 32, capacity: 5 })
      .filter(p => VALID_PLATFORMS.includes(p)),
    date: asString(raw.date, 10),  // YYYY-MM-DD
    time: asString(raw.time, 5),   // HH:MM
  };
  return { ok: true, data: out };
}

// ─────────────────────────────────────────────────────────────────────────
// Profile JSON schema: superset of event with patterns + automation.
// ─────────────────────────────────────────────────────────────────────────

function validateProfileImport(raw) {
  if (!isPlainObject(raw)) {
    return { ok: false, error: "Profile JSON must be an object." };
  }
  const dangerous = rejectDangerousKeys(raw);
  if (dangerous) return { ok: false, error: dangerous };

  const out = {
    displayName: asString(raw.displayName, 100),
    name: asString(raw.name, 100),
    description: asString(raw.description, 10000),
    category: asEnum(raw.category, VALID_CATEGORIES, "hangout"),
    accessType: asEnum(raw.accessType, VALID_ACCESS_TYPES, "public"),
    tags: asStringArray(raw.tags, { itemMax: 50, capacity: 5 }),
    roleIds: asStringArray(raw.roleIds, { itemMax: 100, capacity: 50 }),
    imageId: asFileId(raw.imageId),
    imageBase64: asString(raw.imageBase64, 8 * 1024 * 1024),
    sendNotification: asBoolean(raw.sendNotification, false),
    featured: asBoolean(raw.featured, false),
    groupFair: asBoolean(raw.groupFair, false),
    duration: asNumber(raw.duration, { min: 1, max: 31 * 24 * 60, fallback: 120 }),
    timezone: asString(raw.timezone, 80),
    languages: asStringArray(raw.languages, { itemMax: 10, capacity: 3 })
      .filter(l => VALID_LANGUAGES.includes(l)),
    platforms: asStringArray(raw.platforms, { itemMax: 32, capacity: 5 })
      .filter(p => VALID_PLATFORMS.includes(p)),
    dateMode: asEnum(raw.dateMode, VALID_DATE_MODES, "manual"),
    patterns: validatePatterns(raw.patterns),
    automation: validateAutomation(raw.automation),
  };
  return { ok: true, data: out };
}

// Patterns are an array of objects. Each pattern has type, weekday, hour,
// minute, occurrence, month, day. Cap the array; whitelist each field.
function validatePatterns(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, ARRAY_CAP).map(p => {
    if (!isPlainObject(p)) return null;
    return {
      type: asString(p.type, 20),
      weekday: asString(p.weekday, 20),
      hour: asNumber(p.hour, { min: 0, max: 23, fallback: 0 }),
      minute: asNumber(p.minute, { min: 0, max: 59, fallback: 0 }),
      occurrence: asNumber(p.occurrence, { min: 1, max: 5, fallback: 1 }),
      month: asNumber(p.month, { min: 1, max: 12, fallback: 1 }),
      day: asNumber(p.day, { min: 1, max: 31, fallback: 1 }),
    };
  }).filter(Boolean);
}

// Automation is an opaque-ish nested object; the only known constraint is
// that it must be a plain object or null. Strip dangerous prototype-
// pollution keys silently rather than rejecting the whole automation
// block, which keeps the rest of the import usable. The downstream
// automation engine has its own normalizePendingStore for further checks.
function validateAutomation(raw) {
  if (raw === null || raw === undefined) return null;
  if (!isPlainObject(raw)) return null;
  // Strip dangerous keys (one level deep; automation is shallow in practice)
  const clean = {};
  for (const [k, v] of Object.entries(raw)) {
    if (DANGEROUS_KEYS.has(k)) continue;
    clean[k] = v;
  }
  return clean;
}

module.exports = {
  validateEventImport,
  validateProfileImport,
};
