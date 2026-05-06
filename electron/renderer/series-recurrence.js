/**
 * Pure series recurrence math, extracted from readSeriesFromWizard so it can
 * be unit-tested without Electron/DOM. The renderer owns DOM reads and value
 * parsing/clamping; this module assembles the VRChat recurrence object and
 * the wall-clock-to-UTC conversion. Behavior must stay byte-identical to the
 * inline version it replaced; .dev/tests/renderer/series-recurrence.test.js
 * locks that in.
 */

/**
 * Build a VRChat recurrence object from already-extracted wizard inputs.
 *
 * @param {object} params
 * @param {"daily"|"weekly"|"monthly"|"yearly"|"weekdays"|"weekends"|"custom"} params.uiFreq
 * @param {string} params.timezone - IANA zone; caller defaults to "UTC".
 * @param {"daily"|"weekly"|"monthly"|"yearly"} [params.customIntervalUnit] - only when uiFreq === "custom".
 * @param {number} [params.customInterval] - only when uiFreq === "custom"; pre-clamped to [1, 366].
 * @param {string[]} [params.customDaysOfWeek] - only when uiFreq === "custom" && unit === "weekly".
 * @param {"never"|"afterDate"|"afterOccurrences"} params.endType
 * @param {string} [params.endDate] - "YYYY-MM-DD" for afterDate; function appends "T23:59:00".
 * @param {number} [params.endCount] - for afterOccurrences; pre-clamped to [1, 366].
 * @returns {object} VRChat recurrence object.
 */
export function buildRecurrence({
  uiFreq,
  timezone,
  customIntervalUnit,
  customInterval,
  customDaysOfWeek,
  endType,
  endDate,
  endCount,
}) {
  let recurrence;
  if (uiFreq === "weekdays") {
    recurrence = { frequency: "weekly", interval: 1, timezone, daysOfWeek: ["MO", "TU", "WE", "TH", "FR"] };
  } else if (uiFreq === "weekends") {
    recurrence = { frequency: "weekly", interval: 1, timezone, daysOfWeek: ["SA", "SU"] };
  } else if (uiFreq === "custom") {
    recurrence = { frequency: customIntervalUnit, interval: customInterval, timezone };
    if (customIntervalUnit === "weekly" && Array.isArray(customDaysOfWeek) && customDaysOfWeek.length) {
      recurrence.daysOfWeek = customDaysOfWeek;
    }
  } else {
    // daily / weekly / monthly / yearly
    recurrence = { frequency: uiFreq, interval: 1, timezone };
  }

  if (endType === "afterDate") {
    if (endDate) recurrence.end = { type: "afterDate", date: `${endDate}T23:59:00` };
  } else if (endType === "afterOccurrences") {
    recurrence.end = { type: "afterOccurrences", count: endCount };
  }
  // "never" produces no end key.

  return recurrence;
}

/**
 * Convert a wall-clock date + time + duration into UTC ISO strings.
 * Returns { startsAtUtc: null, endsAtUtc: null } if either input is missing
 * or unparseable. Preserves the explicit-input requirement that avoids the
 * silent "default 8pm" footgun the inline version flagged.
 *
 * @param {object} params
 * @param {string} params.startDate - "YYYY-MM-DD" or empty.
 * @param {string} params.startTime - "HH:MM" or empty.
 * @param {number} params.durationMinutes - falls back to 120 if 0/NaN/null/undefined.
 * @returns {{ startsAtUtc: string|null, endsAtUtc: string|null }}
 */
export function computeStartEndUtc({ startDate, startTime, durationMinutes }) {
  if (!startDate || !startTime) {
    return { startsAtUtc: null, endsAtUtc: null };
  }
  const localStr = `${startDate}T${startTime}:00`;
  try {
    const localDate = new Date(localStr);
    if (Number.isNaN(localDate.getTime())) {
      return { startsAtUtc: null, endsAtUtc: null };
    }
    const startsAtUtc = localDate.toISOString();
    const durationMs = (durationMinutes || 120) * 60 * 1000;
    const endsAtUtc = new Date(localDate.getTime() + durationMs).toISOString();
    return { startsAtUtc, endsAtUtc };
  } catch (err) {
    return { startsAtUtc: null, endsAtUtc: null };
  }
}
