const { DateTime } = require("luxon");

function safeZone(timezone) {
  const zone = timezone || "UTC";
  const test = DateTime.now().setZone(zone);
  return test.isValid ? zone : "UTC";
}

function getNthWeekdayOfMonth(baseDate, weekday, occurrence) {
  const firstOfMonth = baseDate.startOf("month");
  const firstWeekday = firstOfMonth.set({ weekday });
  let targetDate = firstWeekday < firstOfMonth
    ? firstWeekday.plus({ weeks: 1 })
    : firstWeekday;
  targetDate = targetDate.plus({ weeks: occurrence - 1 });
  return targetDate;
}

function getLastWeekdayOfMonth(baseDate, weekday) {
  const lastOfMonth = baseDate.endOf("month");
  const lastWeekday = lastOfMonth.set({ weekday });
  if (lastWeekday > lastOfMonth) {
    return lastWeekday.minus({ weeks: 1 });
  }
  return lastWeekday;
}

function countWeekdayInMonth(baseDate, weekday) {
  let count = 0;
  const firstOccurrence = getNthWeekdayOfMonth(baseDate, weekday, 1);
  let current = firstOccurrence;
  while (current.month === baseDate.month) {
    count += 1;
    current = current.plus({ weeks: 1 });
  }
  return count;
}

function generateDateOptionsFromPatterns(patterns, monthsAhead = 6, timezone = "UTC", opts = {}) {
  const zone = safeZone(timezone);
  // opts.nowMs overrides the "now" reference (used to look at a past window when
  // finding the occurrence before a given date); defaults to the real now.
  const now = Number.isFinite(opts.nowMs)
    ? DateTime.fromMillis(opts.nowMs).setZone(zone)
    : DateTime.now().setZone(zone);
  const options = [];
  const seenDates = new Set();
  const weekdays = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday"
  ];

  // First, handle annual patterns separately (they're year-based, not month-based)
  for (const pattern of patterns) {
    if (pattern.type === "annual") {
      // Check current year and next year for the annual date
      for (let y = now.year; y <= now.year + 1; y++) {
        // Handle leap year for Feb 29
        const maxDay = pattern.month === 2 && pattern.day === 29
          ? (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : 28)
          : pattern.day;
        const actualDay = Math.min(pattern.day, maxDay);

        const date = DateTime.fromObject({
          year: y,
          month: pattern.month,
          day: actualDay,
          hour: pattern.hour,
          minute: pattern.minute,
          second: 0,
          millisecond: 0
        }, { zone });

        if (!date.isValid) continue;
        if (date <= now) continue;
        if (date > now.plus({ months: monthsAhead })) continue;

        const dateKey = date.toISO();
        if (seenDates.has(dateKey)) continue;
        seenDates.add(dateKey);

        options.push({
          iso: date.toISO(),
          weekday: null,
          occurrence: null,
          isLast: false,
          isAnnual: true,
          sortKey: date.toMillis()
        });
      }
    }
  }

  // Every-other (fortnightly) patterns in automation mode: stride 14 days from
  // the stored anchor date, at the pattern's time-of-day. An un-anchored
  // every-other pattern produces nothing — the app can't know which alternating
  // weeks were intended until the user picks a starting date. In picker mode
  // (opts.enforceEveryOther is falsy) every-other instead falls through to the
  // month loop below and shows every occurrence, so the user can choose one as
  // the anchor.
  if (opts.enforceEveryOther) {
    const horizon = now.plus({ months: monthsAhead });
    for (const pattern of patterns) {
      if (pattern.type !== "every-other") continue;
      const weekday = pattern.weekday?.toLowerCase();
      const weekdayNum = weekdays.indexOf(weekday) + 1;
      if (weekdayNum <= 0) continue;
      const anchorIso = opts.everyOtherAnchors?.[weekday];
      if (!anchorIso) continue; // un-anchored → generate nothing

      let occ = DateTime.fromISO(anchorIso, { zone });
      if (!occ.isValid) continue;
      occ = occ.set({
        hour: pattern.hour,
        minute: pattern.minute,
        second: 0,
        millisecond: 0
      });
      // The anchor date itself is the kickoff/last-posted event, which already
      // exists — pending generation must not regenerate it (that would duplicate
      // a multi-pattern kickoff). opts.excludeEveryOtherAnchor drops it for the
      // generation paths; the backwards timing lookup leaves it in (the event
      // right after the anchor needs it as its predecessor).
      const anchorOccMs = occ.toMillis();
      // Jump close to "now" first so a far-past anchor doesn't iterate for years.
      if (occ < now.minus({ days: 14 })) {
        const periods = Math.floor(now.diff(occ, "days").days / 14);
        occ = occ.plus({ days: 14 * periods });
      }
      while (occ <= horizon) {
        const isAnchorItself = opts.excludeEveryOtherAnchor && occ.toMillis() === anchorOccMs;
        if (occ > now && !isAnchorItself) {
          const dateKey = occ.toISO();
          if (!seenDates.has(dateKey)) {
            seenDates.add(dateKey);
            options.push({
              iso: occ.toISO(),
              weekday,
              occurrence: null,
              isLast: false,
              sortKey: occ.toMillis()
            });
          }
        }
        occ = occ.plus({ days: 14 });
      }
    }
  }

  // Handle weekday-based patterns
  for (let m = 0; m <= monthsAhead; m += 1) {
    const targetMonth = now.plus({ months: m });

    for (const pattern of patterns) {
      // Skip annual patterns (already handled above)
      if (pattern.type === "annual") continue;

      const weekdayNum = weekdays.indexOf(pattern.weekday?.toLowerCase()) + 1;
      if (weekdayNum <= 0) {
        continue;
      }

      let dates = [];
      if (pattern.type === "every" || (pattern.type === "every-other" && !opts.enforceEveryOther)) {
        for (let i = 1; i <= 5; i += 1) {
          const date = getNthWeekdayOfMonth(targetMonth, weekdayNum, i);
          if (date.month === targetMonth.month) {
            dates.push({ date, occurrence: i });
          }
        }
      } else if (pattern.type === "nth") {
        const date = getNthWeekdayOfMonth(targetMonth, weekdayNum, pattern.occurrence);
        if (date.month === targetMonth.month) {
          dates.push({ date, occurrence: pattern.occurrence });
        }
      } else if (pattern.type === "last") {
        const date = getLastWeekdayOfMonth(targetMonth, weekdayNum);
        dates.push({ date, occurrence: "last" });
      }

      for (const { date, occurrence } of dates) {
        const dateWithTime = date.set({
          hour: pattern.hour,
          minute: pattern.minute,
          second: 0,
          millisecond: 0
        });

        if (dateWithTime <= now) {
          continue;
        }

        const dateKey = dateWithTime.toISO();
        if (seenDates.has(dateKey)) {
          continue;
        }
        seenDates.add(dateKey);

        const totalOccurrences = countWeekdayInMonth(dateWithTime, weekdayNum);
        const occurrenceNum = occurrence === "last" ? totalOccurrences : occurrence;
        const isLast = occurrenceNum === totalOccurrences;

        options.push({
          iso: dateWithTime.toISO(),
          weekday: weekdays[weekdayNum - 1],
          occurrence: occurrenceNum,
          isLast,
          sortKey: dateWithTime.toMillis()
        });
      }
    }
  }

  return options
    .sort((a, b) => a.sortKey - b.sortKey)
    .map(({ iso, weekday, occurrence, isLast, isAnnual }) => ({
      iso,
      weekday,
      occurrence,
      isLast,
      isAnnual: isAnnual || false
    }));
}

/**
 * The monthly-mode publish instant, in the template's timezone (not the OS
 * clock). Returns the most recent "{monthlyDay} at {hour}:{minute}" that falls
 * strictly before the event start, mapping day-of-month past the month's end to
 * the last day. Returns epoch millis.
 */
function monthlyPublishMs(eventStartsAtIso, monthlyDay, monthlyHour, monthlyMinute, timezone) {
  const zone = safeZone(timezone);
  const eventStart = DateTime.fromISO(eventStartsAtIso, { zone });
  if (!eventStart.isValid) return null;

  const targetDay = monthlyDay || 1;
  const build = (year, month) => {
    let dt = DateTime.fromObject(
      { year, month, day: 1, hour: monthlyHour || 12, minute: monthlyMinute || 0 },
      { zone }
    );
    return dt.set({ day: Math.min(targetDay, dt.daysInMonth) });
  };

  let dt = build(eventStart.year, eventStart.month);
  if (dt >= eventStart) {
    const prev = dt.minus({ months: 1 });
    dt = build(prev.year, prev.month);
  }
  return dt.toMillis();
}

/**
 * The lowercase weekday name of an ISO instant, as seen in the given timezone.
 * Used to match a manually-created kickoff event to an every-other pattern.
 * @returns {string|null}
 */
function weekdayInZone(iso, timezone) {
  const dt = DateTime.fromISO(iso, { zone: safeZone(timezone) });
  if (!dt.isValid) return null;
  const names = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  return names[dt.weekday - 1] || null;
}

/**
 * The smallest real gap (ms) between consecutive occurrences the patterns
 * produce over the given window — the actual tightest spacing, not a per-type
 * guess. Used both to mirror an "after" offset ("X after = Y before" on the
 * regular cadence) and to warn when an offset is larger than that spacing.
 * @returns {number|null} min gap in ms, or null if fewer than two occurrences.
 */
function minPatternGapMs(patterns, monthsAhead = 13, timezone = "UTC", opts = {}) {
  const times = generateDateOptionsFromPatterns(patterns, monthsAhead, timezone, opts)
    .map(d => new Date(d.iso).getTime())
    .filter(t => Number.isFinite(t))
    .sort((a, b) => a - b);

  let min = Infinity;
  for (let i = 1; i < times.length; i += 1) {
    const gap = times[i] - times[i - 1];
    if (gap > 0 && gap < min) min = gap;
  }
  return Number.isFinite(min) ? min : null;
}

/**
 * The most recent occurrence the patterns produce strictly before `beforeMs` —
 * i.e. an event's own previous occurrence in the series. Used to time a single
 * "after"-mode event (edit / restore / commit) from its real predecessor rather
 * than the series head. Returns epoch millis, or null if none is found.
 */
function getPreviousOccurrenceBeforeMs(patterns, beforeMs, timezone = "UTC", opts = {}) {
  if (!Number.isFinite(beforeMs)) return null;
  // Look at a window that starts well before the target so nth/annual patterns
  // are covered, generated relative to a point ~100 days before beforeMs.
  const times = generateDateOptionsFromPatterns(patterns, 5, timezone, {
    ...opts,
    nowMs: beforeMs - 100 * 24 * 60 * 60 * 1000
  })
    .map(d => new Date(d.iso).getTime())
    .filter(t => Number.isFinite(t) && t < beforeMs)
    .sort((a, b) => a - b);
  return times.length ? times[times.length - 1] : null;
}

module.exports = {
  generateDateOptionsFromPatterns,
  safeZone,
  weekdayInZone,
  monthlyPublishMs,
  minPatternGapMs,
  getPreviousOccurrenceBeforeMs
};
