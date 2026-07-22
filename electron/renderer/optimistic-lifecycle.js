// Pure lifecycle logic for the Modify grid's instant "posted" (optimistic)
// cards. Kept DOM-free so it can be unit-tested directly.
//
// An optimistic card is shown the moment you post, before VRChat's calendar
// catches up — without it the event would blink out and back in. It's taken
// back once the real event appears, you switch groups, or the underlying
// pending event moves on. The backstop below is the fix for a silently-failed
// post: a card with no real event to match is dropped once it's older than the
// TTL, so it can't claim success forever.

export const OPTIMISTIC_TTL_MS = 3 * 60 * 1000; // 3 minutes

/**
 * Should this optimistic card be dropped from the grid?
 * All inputs are precomputed by the caller so this stays DOM-free.
 *
 * @param {{event: object, createdAt: number}} entry
 * @param {object} ctx
 * @param {Set<string>} ctx.realIds      - ids of real VRChat events in view
 * @param {Set<string>} ctx.realSlots    - slot keys of real events in view
 * @param {string|null} ctx.entrySlotKey - this card's own slot key
 * @param {object|undefined} ctx.pending - the underlying pending event, if any
 * @param {string} ctx.groupId           - the group currently being viewed
 * @param {number} ctx.now               - Date.now()
 * @param {number} [ctx.ttlMs]           - override the expiry window
 * @returns {boolean}
 */
export function shouldDropOptimistic(entry, ctx) {
  const { realIds, realSlots, entrySlotKey, pending, groupId, now, ttlMs = OPTIMISTIC_TTL_MS } = ctx;
  const event = entry?.event;
  if (!event) return true;
  // Switched to a different group.
  if (event.groupId && event.groupId !== groupId) return true;
  // The real event has arrived — matched by id or by slot key.
  if (event.eventId && realIds.has(event.eventId)) return true;
  if (event.id && realIds.has(event.id)) return true;
  if (entrySlotKey && realSlots.has(entrySlotKey)) return true;
  // The underlying pending event moved on (a retry, a miss, or a cancellation).
  if (pending && (pending.status === "queued" || pending.status === "missed" || pending.status === "cancelled")) {
    return true;
  }
  // Backstop: no real event ever matched and the card has outlived the window —
  // the post silently failed, or VRChat never returned it.
  if (typeof entry.createdAt === "number" && now - entry.createdAt > ttlMs) return true;
  return false;
}
