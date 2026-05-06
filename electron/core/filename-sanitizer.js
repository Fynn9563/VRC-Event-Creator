// Filename sanitizer: produces a single safe filename component from any
// user-controlled input. Used everywhere a string from a profile/event/
// group becomes part of a path on disk (.ics auto-save, kit imports,
// gallery cache, theme presets, webhook attachment filenames, etc.).
//
// Strategy: blacklist + length cap + reserved-name guard, NOT a strict
// whitelist. The app has international users (10 locales); a Japanese or
// Russian group name should still produce a meaningful filename, not an
// empty string. Strip the dangerous chars instead of the safe ones.
//
// What this does NOT do:
//   - Resolve full paths (use path.join + pathIsWithin)
//   - Sanitize file contents (see ics.js escapeText)
//   - Validate URLs (see webhook.js)

// NTFS reserved chars, path separators, control chars (0x00-0x1F).
// Stripping these gives a string safe on Windows, macOS, and Linux.
const FORBIDDEN_CHARS = /[<>:"/\\|?*\x00-\x1F]/g;

// Windows refuses to create files with these base names regardless of
// extension. Case-insensitive; replace if encountered.
const RESERVED_WINDOWS_NAMES = new Set([
  "CON", "PRN", "AUX", "NUL",
  "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
  "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
]);

// Default max for the FINAL filename including extension. Most filesystems
// cap at 255 bytes; the lower value leaves headroom for parent path length
// (Windows MAX_PATH is 260 by default).
const DEFAULT_MAX_LENGTH = 200;

// Returned when input sanitizes down to empty/dangerous-only. Callers can
// override via options.fallback.
const DEFAULT_FALLBACK = "untitled";

/**
 * Sanitize an arbitrary string for use as a single filename component.
 *
 * @param {string} input
 * @param {object} [options]
 * @param {string} [options.fallback="untitled"] - Returned when input is
 *   empty or sanitizes down to nothing meaningful.
 * @param {number} [options.maxLength=200] - Total length of the returned
 *   filename, extension included. Truncates the base name, not the
 *   extension, when over.
 * @param {string} [options.extension] - When supplied, ensure the result
 *   ends with this extension. Already-present matching extensions are
 *   preserved; mismatches are appended. The extension itself isn't
 *   subjected to forbidden-char stripping (caller is trusted).
 * @returns {string} A safe filename: never empty, never contains path
 *   separators or control chars, never matches a Windows reserved name.
 */
function sanitizeFilename(input, options = {}) {
  const fallback = options.fallback || DEFAULT_FALLBACK;
  const maxLength = Number.isFinite(options.maxLength) && options.maxLength > 0
    ? Math.floor(options.maxLength)
    : DEFAULT_MAX_LENGTH;

  let base = typeof input === "string" ? input : "";

  // 1. Strip forbidden characters (path separators, NTFS reserved, control).
  base = base.replace(FORBIDDEN_CHARS, "");

  // 2. Trim leading/trailing whitespace AND dots. Windows silently strips
  //    trailing dots and spaces from filenames; leaving them in opens
  //    bypass risk where "evil." and "evil" are the same on disk.
  base = base.replace(/^[\s.]+|[\s.]+$/g, "");

  // 3. Empty after cleanup -> fallback.
  if (!base) base = fallback;

  // 4. Reserved Windows name check (case-insensitive, ignoring extension).
  //    "con" -> "_con"; "CON.txt" -> "_CON.txt".
  const baseStem = base.split(".")[0];
  if (RESERVED_WINDOWS_NAMES.has(baseStem.toUpperCase())) {
    base = `_${base}`;
  }

  // 5. Apply explicit extension if requested.
  let result = base;
  if (typeof options.extension === "string" && options.extension) {
    const ext = options.extension.startsWith(".")
      ? options.extension
      : `.${options.extension}`;
    if (!result.toLowerCase().endsWith(ext.toLowerCase())) {
      result = `${result}${ext}`;
    }
  }

  // 6. Length cap: truncate the stem, preserve any extension.
  if (result.length > maxLength) {
    const lastDot = result.lastIndexOf(".");
    if (lastDot > 0 && lastDot >= result.length - 10) {
      // Has a short trailing extension; preserve it, cut the stem.
      const ext = result.slice(lastDot);
      const stem = result.slice(0, lastDot);
      result = stem.slice(0, maxLength - ext.length) + ext;
    } else {
      // No extension or unusually long one; just truncate.
      result = result.slice(0, maxLength);
    }
    // Re-trim trailing dots/spaces in case truncation created them.
    result = result.replace(/[\s.]+$/g, "");
    if (!result) result = fallback;
  }

  return result;
}

/**
 * Returns true if `target` (after path resolution) is a descendant of `base`.
 * Use AFTER joining a sanitized filename onto a base directory for belt-
 * and-suspenders protection against traversal that slipped through (e.g.,
 * a bug in upstream input handling).
 *
 * @param {string} base
 * @param {string} target
 * @returns {boolean}
 */
function pathIsWithin(base, target) {
  const path = require("path");
  const resolvedBase = path.resolve(base);
  const resolvedTarget = path.resolve(target);
  // Normalize trailing separator so /foo doesn't match /foobar.
  const baseWithSep = resolvedBase.endsWith(path.sep)
    ? resolvedBase
    : resolvedBase + path.sep;
  return resolvedTarget === resolvedBase
    || resolvedTarget.startsWith(baseWithSep);
}

module.exports = {
  sanitizeFilename,
  pathIsWithin,
};
