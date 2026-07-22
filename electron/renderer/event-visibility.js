// Pure grid-visibility helpers, kept DOM-free so they can be unit-tested
// directly. The Modify grid uses these to decide the lower ("already ended")
// bound of which event cards to draw.

/**
 * An event's end instant, in epoch ms. Prefer its stored end; fall back to
 * start + duration (default 120 min) when only a start is known. Returns null
 * when no finite start is available.
 */
export function eventEndMs(event) {
  if (event.endsAtUtc) {
    const e = Date.parse(event.endsAtUtc);
    if (Number.isFinite(e)) return e;
  }
  const startMs = event.sortTime || (event.startsAtUtc ? Date.parse(event.startsAtUtc) : null);
  if (!Number.isFinite(startMs)) return null;
  const durMin = Number(event.durationMinutes ?? event.duration ?? 120);
  return startMs + (Number.isFinite(durMin) ? durMin : 120) * 60 * 1000;
}

/**
 * True when an event should be dropped from the grid because it has already
 * ended. An in-progress event (started, not yet ended) still shows.
 *
 * Missed and queued cards are the exception: their start is in the past by
 * definition, but the user still has to act on them (Post Now / Edit / Delete),
 * so the end-time cutoff must never hide them — that would leave the header's
 * "N missed" count with no cards behind it.
 */
export function isHiddenByEndCutoff(event, nowMs) {
  if (event.status === "missed" || event.status === "queued") return false;
  const endMs = eventEndMs(event);
  // Drop the moment it ends (inclusive), matching "a finished event drops from
  // the grid the moment it ends."
  return Number.isFinite(endMs) && endMs <= nowMs;
}
