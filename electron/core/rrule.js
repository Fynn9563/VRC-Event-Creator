const { DateTime } = require("luxon");

/**
 * Convert a VRChat recurrence object into an RFC 5545 RRULE string.
 *
 * Input (matches VRChat API):
 * {
 *   frequency: "daily" | "weekly" | "monthly" | "yearly",
 *   interval: number (>= 1),
 *   timezone: string (IANA, e.g. "America/Chicago"),
 *   daysOfWeek?: ["MO","TU","WE","TH","FR","SA","SU"]  // weekly only
 *   end?: {
 *     type: "afterOccurrences" | "afterDate",
 *     count?: number,            // afterOccurrences
 *     date?: string              // afterDate, "YYYY-MM-DDTHH:MM:SS" (no offset)
 *   }
 * }
 *
 * Output: "FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE;COUNT=10"
 * Returns null if input is invalid.
 */
function recurrenceToRRule(recurrence) {
  if (!recurrence || typeof recurrence !== "object") return null;
  const freqMap = {
    daily: "DAILY",
    weekly: "WEEKLY",
    monthly: "MONTHLY",
    yearly: "YEARLY"
  };
  const freq = freqMap[recurrence.frequency];
  if (!freq) return null;

  const parts = [`FREQ=${freq}`];
  const interval = Number.isFinite(recurrence.interval) ? Math.floor(recurrence.interval) : 1;
  if (interval > 1) {
    parts.push(`INTERVAL=${interval}`);
  }

  if (Array.isArray(recurrence.daysOfWeek) && recurrence.daysOfWeek.length > 0) {
    const validDays = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
    const days = recurrence.daysOfWeek.filter(d => validDays.includes(d));
    if (days.length) {
      parts.push(`BYDAY=${days.join(",")}`);
    }
  }

  if (recurrence.end && typeof recurrence.end === "object") {
    if (recurrence.end.type === "afterOccurrences" && Number.isFinite(recurrence.end.count) && recurrence.end.count >= 1) {
      parts.push(`COUNT=${Math.floor(recurrence.end.count)}`);
    } else if (recurrence.end.type === "afterDate" && typeof recurrence.end.date === "string") {
      // The end date string carries no offset, so parse it in the recurrence's
      // own timezone rather than the host OS zone — otherwise UNTIL drifts
      // between machines in different zones from identical input.
      const endUtc = DateTime.fromISO(recurrence.end.date, { zone: recurrence.timezone || "UTC" });
      if (endUtc.isValid) {
        parts.push(`UNTIL=${endUtc.toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'")}`);
      }
    }
  }

  return parts.join(";");
}

module.exports = {
  recurrenceToRRule
};
