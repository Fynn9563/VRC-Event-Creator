# Changelog

All notable changes to VRChat Event Creator will be documented in this file.

## [Unreleased]

### Added
- **Stay signed in for automation** — an opt-in "Keep me signed in" checkbox at sign-in. When you tick it, the app stores your VRChat login (encrypted, through the same secure storage as your other credentials) so it can quietly sign back in on its own if your session expires — no more silently missing automations because you got logged out in the background. Most re-logins are invisible; only if the ~30-day two-factor "trusted device" also lapses does the app surface itself and notify you to enter a fresh code. Off by default; you can revoke it any time from Settings (which deletes the saved login without signing you out), and it's also cleared when you sign out. Safeguards: if the saved login stops working (e.g. you changed your VRChat password elsewhere) the app stops retrying, forgets it, and asks you to sign in again — rather than hammering VRChat's login and risking a temporary block; and an unanswered two-factor prompt times out instead of stalling.
- **Accurate "after"-offset warning in Settings** — when your posting offset is larger than the real spacing between your events, the settings form now says so, measuring the actual gap between the dates your patterns produce (so "1st Monday + 1st Tuesday" is correctly seen as one day apart, not two weeks). If the offset would land after the next event, it warns it can't post after the next event; if it lands closer to the next event than the previous one, it tells you the equivalent "before" time it'll be applied at. It only warns — it never rewrites your setting.
- **A way out of the two-factor prompt** — the code prompt now has a Cancel button. Previously, if you couldn't supply a code at that moment, closing the app was the only way past it. Cancelling signs you out cleanly and returns you to the sign-in screen, rather than leaving the app sitting in a half-signed-in state.
- **A notice when your session expires and automation can't continue** — if your VRChat session lapses and you haven't asked the app to stay signed in, it now tells you, instead of automation quietly ceasing to post. It stays silent in the cases where it would be noise: when you signed out deliberately, or when the app can sign itself back in.

### Security
- **Your saved credentials are now encrypted at rest on every platform** — your VRChat sign-in and any Discord bot token or webhook URL are encrypted using your operating system's secure store (Windows and macOS always; Linux whenever a keyring such as GNOME Keyring or KWallet is present). Previously the VRChat session was saved as plain text, and on some Linux systems a Discord token could be stored unprotected while still looking encrypted. Credentials saved before this update are re-encrypted automatically the next time the app starts, so an existing install doesn't sit on plaintext — and you won't be signed out or have to re-enter anything.
- **An honest notice when your system can't fully encrypt** — on a Linux machine with no keyring, full encryption isn't possible without breaking unattended use, so the app protects your credentials with a local key file (which keeps them safe if you accidentally share your settings folder or a backup) and tells you plainly, in Settings → Application Info, that they aren't fully encrypted on that machine. Windows and macOS always have a secure store, so this notice never appears there.
- **A saved session that can no longer be decrypted signs you in again cleanly** — if the encrypted VRChat session can't be read (for example after a system keyring change), the app now treats it as a normal signed-out state and prompts a fresh login, instead of erroring on the unreadable data.
- **A clear notice when a saved credential can't be read** — if a saved VRChat session or Discord token was encrypted with your system's secure storage and can no longer be decrypted, Settings → Application Info now tells you plainly and points you to sign in again or re-enter it, instead of the credential (and the automation relying on it) failing silently.
- **A crafted imported template can't read files outside its image cache** — imported templates and events now reject an image reference that contains a path, so a malicious import can't trick the app into attaching a private file from elsewhere on your computer to a Discord or webhook post.
- **Kit image attachments stay inside the app's image folder** — a webhook's custom image can only be read from the app's managed images folder, never an arbitrary path on your computer.
- **Network-share paths are no longer opened from the app** — the "Open folder" action refuses a UNC path (`\\server\share`), closing a Windows credential-leak vector.

### Fixed
- **A "repeat N times" template never posts more than N events** — if some scheduled events were missed while the app was closed and you then edited the template, it could generate a fresh batch on top of the missed ones and post more events than you asked for. Now the total that actually post can never exceed your repeat count; a missed event stays recoverable (a Post Now on it still counts toward the limit), but it no longer causes an overshoot.
- **Imported templates keep their event category** — importing a template no longer resets several categories (Exploration, Roleplaying, Film & Media, Arts, Avatars, Education, Wellness) to "Hangout", and a "Patterns + manual" date mode now imports correctly.
- **A recurring series ends on the same date in its Discord event too** — the Discord scheduled-event recurrence end is now read in the series' timezone, matching the calendar file, instead of the computer's timezone.
- **The "Open folder" button works for normal drive paths again** — a Windows path like `C:\Users\…\Calendar` now opens instead of being silently treated as an unknown web address.
- **A stalled server can't hang a post for minutes** — image, webhook, and Discord-event requests now time out after 20 seconds and fail cleanly, so a half-open connection no longer holds up the rest of a post.
- **Editing a template while it's mid-post no longer leaves a phantom "missed" card or a duplicate** — saving a template change in the exact moment an automated event is being sent now keeps its card in sync with what actually posted, and can't double-post the same event.
- **An event created just before a crash isn't shown as "missed" on restart** — if the app is killed in the instant between recording a post and saving its card, the next launch recognizes the event was actually posted (rather than surfacing a stale "missed" card you might re-post).
- **A blocked save now tells you instead of pretending it worked** — if a settings or template change can't be written because another program is briefly holding the file, the app reports that it couldn't save so you can retry, instead of confirming a save that didn't happen and losing the change on the next launch.
- **Hitting the hourly limit through automation still cools down the Create button** — when the per-hour event limit is reached by automation's own posts, the manual Create button now arms its wait timer instead of staying clickable and bouncing off repeated rejections.
- **A recurring series ends on the same date on every machine** — a series' end date is read in the series' own timezone rather than the computer's, so the final occurrence no longer shifts between machines in different timezones.
- **The "this hour" count no longer carries over between accounts** — after switching VRChat accounts, the Create screen's hourly count reflects the account you're signed in as, not the previous one.
- **The Modify header count stays in step with a self-clearing card** — when a stuck "posted" card clears itself after a silently-failed post, the "upcoming events" number updates with it instead of reading one too high.
- **An automation post for another group can't flash into the group you're viewing** — a background post for a different group no longer briefly shows a card in the group currently open on the Modify screen.
- **A passing read glitch can't cost you data** — if a settings or template file can't be read for a temporary reason other than corruption (a busy disk, too many open files), the app treats it as temporarily unavailable and protects it, rather than risking overwriting good data with defaults.
- **A permission check made while signed out no longer sticks** — if a group's permission lookup failed because your session had lapsed, the app used to cache that failure and keep insisting you lacked permission on a group you own, until a restart or a Resync. It now only caches a successful lookup, so once you're signed back in (including automatically), the next attempt just works.
- **An "after the previous event" template announces at the same time it previews** — the first upcoming announcement is now computed the same way everywhere (preview, scheduling, editing, restoring), so the time you see on a card is the time that actually posts. After a break it measures from the event's real recent predecessor rather than a weeks-old last post, and a brand-new template's first announcement measures from the event you created to kick it off — never from a phantom occurrence that predates the template.
- **A file lock at startup can no longer wipe your saved groups** — if antivirus, a backup tool, or the search indexer briefly holds `profiles.json` open exactly as the app launches, the app now recognizes the file is present-but-locked and refuses to overwrite it, instead of loading an empty configuration and saving that over your real Discord tokens and webhook URLs.
- **No duplicate re-post after an interrupted launch** — when the app restarts and recognizes its own already-posted events, it now also checks cards that were re-armed as queued or missed after a crash, so one of those can't retry and create a duplicate.
- **The hourly-limit count now includes every event the app posts** — creating a native recurring series, regenerating a series, and draining the retry queue all count toward the per-account hourly tally now, so automation is less likely to fire into VRChat's 10-per-hour limit right after one of those.
- **Post Now on an event that already started explains why** — instead of a generic failure after a doomed request, it now says the event has already started and can't be posted.
- **Annual "after the previous event" schedules find their previous occurrence** — the look-back that times an announcement from the prior event now reaches a full year back, so yearly events time correctly instead of falling back to a rougher anchor.
- **The hourly-limit count is unified across manual and automated posts** — the app keeps one saved tally (per account, per group) of everything it posts, so the Create screen's "this hour" count reflects automation's posts too, and automation won't fire a batch straight into VRChat's 10-per-hour limit right after you've hand-made several events. The count also survives restarting the app instead of resetting to zero.
- **When conflict warnings are on and the app can't reach VRChat to check, it now says so** — instead of silently reporting "no conflict," it tells you the check couldn't run and lets you create anyway or pick another time. Only affects you if you've turned on the optional "Warn me about conflicting events" setting.
- **The app recognizes its own already-posted events at startup** — if it restarts (a crash, or launching hidden at login) it quietly re-checks against VRChat so automation won't re-post an event it already made, and stale "missed" reminders for events that already exist get cleared. It runs in the background, never blocks startup, and never deletes anything on its own.
- **A just-posted event card no longer gets stuck saying "posted" forever** — the instant card shown right after you post now clears itself within a few minutes if the event never actually appears (a silently-failed post), instead of lingering until you restart and hiding the real status behind it.
- **A monthly automation set to publish at midnight now publishes at midnight** — a publish hour of 12:00 AM was being read as "unset" and bumped to noon.
- **Your "before" announcement offset is no longer shrunk** — announcing well ahead is legal (announcements can stack and don't wait for the previous event), so the settings form no longer caps a large "before" offset or rewrites the number you typed.
- **The recurring-series queue is saved crash-safely** — the pending-rasterize file now uses the same atomic write + backup as your settings and templates, so a power-off mid-save can't truncate it.
- **The app more reliably recognizes an event it already posted** — when checking whether a scheduled announcement is already live, it matches on start time, title (ignoring case and extra spaces), description, and image, and ignores category and access type — so it won't repost a duplicate or overlook one it should skip.
- **Event cards show the timezone abbreviation for the event's own date** — a January event viewed in July now reads its standard-time label (e.g. CST) instead of the summer one (CDT), and vice versa. The abbreviation follows the event's daylight-saving state, not today's.
- **A template set up before automation is switched on now arms correctly** — create a template's first event while automation is still off, then turn automation on, and it starts posting the rest of the schedule right away. Before, it stayed dormant until you created a second event with automation already enabled.
- **Finished events drop off the Modify Events grid** — an event disappears from the grid once it's over (its start plus its length), so past events no longer pile up as if they were still upcoming; an event that's currently happening stays visible until it ends. Missed and queued announcements are the exception — they stay on the grid no matter how old, so you can always Post Now, edit, or dismiss them.
- **The long-range preview no longer shows events for a template you haven't started yet** — a template only begins previewing future events once you've created its first event, the same point at which it actually starts posting. Before, the "show next year" view could list events for a template that would never generate them.
- **An "after" offset that's too big for a tight gap now mirrors to the "before" side** — if an event is edited so it sits unusually close to its neighbor, "X hours after the previous event" is re-expressed as its equivalent distance before the next event, computed from your events' regular spacing (for daily events, "23 hours after" becomes "1 hour before"), rather than being flattened to a fixed lead. It still never lands within 15 minutes of the event.
- **Your "after" offset is no longer silently rewritten** — the settings form used to quietly convert a large "after" offset into a "before" offset and change the number, which mangled your setting and broke events later edited to a wider gap. It now leaves your "after" offset as typed; the engine places each announcement on the previous occurrence and pulls it back to a safe lead only if it would land too close to the show.
- **"After the previous event" timing is now correct and consistent** — the first announcement in an "after"-mode series is timed from the previous occurrence (the last event actually posted, or the event that kicked the template off), not from a wall-clock "when did we last post" stamp — which is what produced the odd, non-round announcement times. The silent mode-switch that could quietly turn "3 hours after" into a different "before" time is gone. All paths that compute an announcement time — generating the schedule, previewing further-out events, restoring a deleted one, backfilling on load — now share one computation, so the same event no longer shows different times depending on where it came from. An "after" announcement can never land within 15 minutes of (or after) the show it announces.
- **Monthly timing now uses the template's timezone**, not the computer's clock — "publish on the 1st at 6:00 PM" means 6:00 PM in the group's timezone regardless of which machine runs the app.
- **Editing an event's date recomputes its announcement from the rule** instead of dragging the old gap along — move a "post on the 1st" event to a different month and it re-lands on the 1st of that month.
- **Missed announcements wait for you instead of firing late on their own** — when an announcement's posting time slips into the past (the app was closed, the schedule was rebuilt, or an offset was changed) it now becomes a **missed** card you act on with Post Now / Edit / Delete, rather than silently bumping itself to "5 minutes from now" and posting. Both of the old auto-fire shortcuts and the unused Reschedule action have been removed.
- **Missed cards no longer silently vanish** — a missed (or rate-limit-queued) card is now preserved when its template is re-saved or another event posts, instead of being wiped by the regeneration that runs on every save. Editing a missed event to a valid future time still re-arms it back to scheduled. On restart, a card whose posting time already passed becomes missed (never a silent late post), and a queued card that was mid-flight is re-armed rather than stranded.
- **"Every other" patterns are now a true fortnight** — an every-other weekday pattern (e.g. "every other Friday") now generates events every 14 days from an anchor date, instead of every single week. Each every-other pattern is anchored independently by the first matching manual event you create (a Friday kickoff anchors the Fridays; a Saturday kickoff anchors the Saturdays), so "every other Friday AND every other Saturday" works as two independent fortnights. An every-other pattern that hasn't been anchored yet generates nothing rather than guessing which alternating weeks you meant. Existing every-other schedules continue from the most recent event they actually posted, so nothing silently resets. The manual date picker still lists every occurrence so you can choose which one starts the cadence.
- **No more posting past-dated events** — the app now refuses to create a VRChat event whose start time has already passed. Previously "Post Now" on a missed card (and some scheduled/retry paths) could publish an event dated in the past, sending a real announcement for a show that already happened. The guard sits at the single point every posting path funnels through, with an honest "already passed" message on the Post Now button.
- **Arizona timezone option** — added `America/Phoenix` ("MST (Arizona — no DST)") to the timezone picker, and relabeled the Denver row to "MT (Mountain Time — Denver, with DST)" to disambiguate. Arizona doesn't observe daylight saving, so an Arizona group that previously picked the Denver-backed "MST" row was an hour off for roughly eight months a year. Existing Denver selections are unchanged (label only).
- **Crash-proof state saving** — settings, profiles, series, pending events, and automation state now write to a temp file, flush to disk, and atomically swap into place, keeping a `.bak` of the last good copy. A hard power-off mid-save can no longer leave a truncated or empty file (which previously could silently wipe templates or the restore list). Loads fall back to the backup if the primary file is unreadable. The swap is atomic on Windows and Linux; on Windows it retries briefly when antivirus or the search indexer momentarily holds the file open.

- **Signing out now actually signs you out** — a saved login could survive signing out, because the backup copy of it was left behind. The next launch read that backup, quietly signed you back in, and asked for a two-factor code you weren't expecting. Signing out now clears the stored login and session completely, and records that you signed out, so a file left behind can't sign you back in.
- **No more "signed in" with none of your groups showing** — when a session still needed a two-factor code, the app took that as a finished sign-in: it showed you as logged in, then loaded nothing behind it, leaving every group list empty. That response is now recognized as "not signed in yet", so you're asked for the code instead.

### Changed
- **Your groups load in one request instead of one per group** — to work out which group calendars you can manage, the app used to ask VRChat about every group you belong to, one at a time. If you're in a lot of groups that meant hundreds of back-to-back requests on every launch, which could trip VRChat's rate limits and make a group vanish from every dropdown until you reloaded the app. It now fetches the permissions for all your groups in a single request, so signing in is faster and far less likely to hit a limit. If that request ever fails, it falls back to the old per-group check — now spaced out, and skipping the groups it doesn't need to ask about.
- **"Keep me signed in for automation" is now just "Keep me signed in"** — the description underneath still explains what it's for.

## [1.2.1] - 2026-05-08

### Fixed
- Featured Event and Group Fair toggles on series and scheduled (template-driven) events now take effect. Previously the manual one-off create flow respected both toggles, but series creation/update/regenerate hardcoded `featured: false` and dropped `vrc_event_group_fair` from the tag list, and the automation engine's profile-to-event projection never read either field. Editing an existing series now also restores the toggles' state instead of showing them unchecked.

### Changed
- Featured / Group Fair flags are now silently coerced off at create time when the group lacks the matching admin tag, across all five mutation paths (manual create, series create/update/regenerate, automation). Mirrors the renderer's existing visibility behavior: if the toggle isn't shown, the value is treated as false on the wire — no surprise 403 from VRChat, no error toast. Stored profile/series values are left intact so they reactivate cleanly if the group regains the admin tag.
- Privileged-flag requests that still 403 from VRChat (e.g. cached group tags went stale between fetch and create) now retry once with the flag stripped instead of failing the entire create. Featured / Group Fair are best-effort: an event will always be created, just without the privileged flag if the group can't carry it.

## [1.2.0] - 2026-05-05

### Added
- **Native VRChat recurring series** — first-class support for VRChat's server-side recurring events alongside EC's existing template flow
  - New unified **Manage Schedules** tab covering both templates and series, with a type picker in the wizard's Schedule step
  - Frequency model matching VRChat's: Daily / Weekly / Monthly / Yearly / Weekdays / Weekends / Custom (with interval, days-of-week, end-after-N or end-by-date conditions)
  - Local series store survives app restarts and rate-limit cooldowns; `series.json` and `pending-rasterize.json` join the user-data files
  - Series creation can fan out announcements (Discord events / webhook / .ics) for the recurrence as a whole
  - Edit-after-start flow: recurrence rule changes regenerate the series (delete + recreate) so future occurrences reflect the new rule while history is preserved
  - Persistent rasterize queue retries series creation that hit a 429
- **Automation event projection** — Modify Events filter ranges past 3 months now show projected future events from each enabled-automation template up to the chosen window
  - Renderer projects from template patterns past the engine's hard horizon; events render identically to scheduled pending events with no per-card visual distinction
  - Editing a projected event silently commits it to disk before applying overrides; deleting tombstones the slot so the engine never recreates it
  - Slot keys are deterministic (group + profile key + start time), so projected entries align cleanly when the engine eventually catches up
- **Modify Events filters panel** — collapsible filter section with toggles for pending events, standalone events, modified occurrences, per-series chips, and per-template chips
- **Time-range dropdown** — show events for the next 7 days through 1 year, persisted across restarts
- **Calendar integration** — generate .ics calendar invite files with configurable reminders when VRChat events are created
  - Per-template and per-event "Create .ics Calendar Invite" toggle with reminder configuration
  - Preset reminder intervals (5 min to 1 week) compatible with Outlook, Apple Calendar, Thunderbird, and other clients
  - Reminders sorted longest-first for best compatibility with single-reminder clients
  - Discord webhook delivery: posts a rich embed with event details, banner image, group icon, and .ics file attachment
  - Discord embed uses unix timestamps (each viewer sees their local timezone) and language-agnostic emoji labels
  - .ics files always auto-save to a local directory when calendar is enabled
  - Local save dialog for manual .ics export
  - Deterministic ICS UIDs for update-safe re-delivery
  - Per-group webhook URL configuration with test/verify button (encrypted storage)
- **EC Kit** — webhook identity customization for groups with an active license
  - Custom webhook display name, avatar URL, and embed color per group
  - Per-template and per-event custom webhook message textarea and image/audio/video attachment (up to 10 MB, matching Discord's per-file webhook attachment cap; .ics files ride on their own quota and don't consume this one)
  - Pending automated events can have custom message/image edited before posting
  - Ed25519 signed license verification (offline, public key in app)
  - Import button in Discord Integration per-group settings; importer accepts either the delivered ZIP (auto-extracts) or a bare `.eckit` file
  - Self-service purchase flow via Ko-fi shop with automated kit issuance through a Cloudflare Worker (Ed25519 signing, magic-link email delivery via Resend, group binding with confirmation step, self-service resend portal)
  - Bundled `LICENSE-eckit.txt` documenting voluntary-purchase / no-service-contract terms
- Calendar integration setting under Advanced Options
- Translations for all new strings across all 10 supported languages

### Changed
- **Decoupled posting options** — Discord scheduled events, Discord webhook posts, and .ics calendar file generation are now three independent toggles
  - "Create Discord Event" — creates a Discord scheduled event (requires bot token + guild ID)
  - "Post Discord Webhook" — posts to a Discord webhook (requires webhook URL, independent of Discord events and calendar)
  - "Create .ics Calendar Invite" — generates and auto-saves an .ics file (independent of webhook and Discord events)
  - When webhook and calendar are both enabled, .ics is attached to the webhook post and also auto-saved
  - When webhook and Discord event are both enabled, webhook message includes the Discord event link
  - Kit custom message/image fields now depend only on the webhook toggle being enabled
- Per-event posting toggles (Discord event / webhook / .ics) are now symmetric overrides — the form can opt *in* as well as out, regardless of the template's stored preference. Form values are pre-filled from the template on load, then the form is the source of truth at submit. Previously the template had to explicitly opt in; the form could only veto.
- "Sync to Discord" renamed to "Create Discord Event" across all languages
- Webhook URL field in Discord settings now visible when Discord integration is enabled (previously required calendar)
- "Manage Templates" renamed to "Manage Schedules" to cover both templates and native series
- Resync now bypasses the in-memory group-permission cache so VRChat-side role changes (e.g., granting calendar permissions to a role) surface without an app restart
- Modify Events series badges contrast improved on event cards
- Calendar setup guides rewritten for all 10 languages to reflect the decoupled architecture
- i18n parity sweep: 612 keys aligned across all 10 locales, 44 dead keys pruned, hardcoded English strings wired through `t()`

### Fixed
- Automation timing input no longer silently clamps to a 30-minute minimum — the engine honors the user's configured offset (form already documented this; engine now matches)
- Editing a saved template repopulates the pattern list, language list, and platform list in the Schedule and Audience steps (previously only state was loaded; the DOM render helpers weren't called from the wizard transition)
- Modify Events series filter chips show human-readable series labels instead of fallback "Series (cal_xxxxxxxx)" IDs on initial load
- Time-range dropdown expansion now re-fetches projected events; narrowing remains a re-render
- Stale projected events from a deleted template are dropped from the Modify Events grid
- Removed a stray no-op `.replace(/Z$/, "Z")` from the ICS timestamp formatter

### Security
- Renderer sandbox enabled (`sandbox: true`) — sandboxed renderer cannot escalate to Node even if a renderer-side vulnerability is exploited
- Filename sanitizer with path-traversal guards on all `.ics` save paths; preserves Japanese, Cyrillic, and accented characters in folder names (the prior whitelist stripped non-ASCII)
- Webhook display-name validator rejects "discord" / "clyde" / "@everyone" / "@here", caps at 80 chars, strips control characters
- `shell.openExternal` URL allowlist (http/https/mailto only); path-shaped inputs route to `shell.openPath`
- `setWindowOpenHandler` returns deny by default
- JSON import schema validator on `events:importJson` and `profiles:importJson` IPC handlers — strict whitelist + type coercion, rejects `__proto__` pollution attempts, caps every string and array length
- TOCTOU mitigation on file-system reads — kit imports and webhook attachment selection now `openSync` + `fstatSync` + `readSync` against a single file descriptor, eliminating the size-check / read race window
- Hard size caps on EC Kit imports: 256 KB source file, 64 KB extracted `.eckit` content, with `maxOutputLength` guard against DEFLATE bombs in the ZIP path
- Group ID format validation (`^grp_[0-9a-fA-F-]{36}$`) on kit import as defense-in-depth against destination-filename path traversal even with a valid signature

### Internal
- Dependency upgrades: electron 39.2.7 → 41.5.0, electron-builder 24.13.3 → 26.8.1, vrchat SDK 2.20.5 → 2.21.7. Net npm audit count: 18 → 1 (lodash false positive accepted).
- Module extraction for testability: `core/normalize-settings.js`, `core/debug-log.js`, `core/theme-store.js`, `core/gallery-cache.js`, `core/eckit.js`, `core/filename-sanitizer.js`, `core/import-validator.js`, `renderer/series-recurrence.js`
- Vitest + Playwright test infrastructure: 332 unit tests across 14 files, 20 Playwright E2E tests including auth-bypassed flows via env-gated VRChat SDK stub. IPC symmetry static-analysis suite verifies preload↔main wiring.
- Removed unused imports flagged by CodeQL: `normalizeVersion` (main.js), `populateSeriesTimezoneDropdown` and `refreshRasterizeStatus` (renderer/app.js), `addCalendarReminderRow` (renderer/modify.js)

## [1.1.3] - 2026-03-08

### Fixed
- Status pill "Resync" hover text now displays in the active language instead of always showing English
- Added `common.resync` translation key to all 10 language files

## [1.1.2] - 2026-03-08

### Fixed
- Disabled CSS `text-transform: uppercase` for CJK languages (Japanese, Chinese, Korean) so Latin brand names like "Discord" render with their original casing instead of all-caps

## [1.1.1] - 2026-03-08

### Fixed
- Resync button now also checks GitHub for app updates

## [1.1.0] - 2026-03-08

### Added
- **Discord Integration** - Automatically create Discord Events when VRChat events are created (manual or automated)
  - Per-group bot token and server ID configuration with encrypted token storage (OS secure storage)
  - Per-template and per-event "Sync to Discord" toggle for granular control
  - "Verify Bot Token" button to test bot connectivity before saving
  - Collapsible settings panels for Advanced Settings and Discord Integration
  - Discord setup guides in English and Japanese
- Translations for all Discord integration strings across all 10 supported languages

### Changed
- Advanced Settings and Discord Integration panels now use collapsible carets (expand/collapse independent of the enable checkbox, collapsed by default on restart)
- Existing templates default to Discord sync off (must opt in); new templates and manual events default to on

## [1.0.1] - 2026-03-07

### Fixed
- Automation engine now regenerates pending events after each successful automated post, making automation self-sustaining instead of stopping after the initial batch
- "After" timing mode no longer gets permanently stuck when publish times fall in the past due to stale state — recovers by scheduling 5 minutes from now if the event is still in the future
- Automation now reconciles scheduled pending events against existing VRChat events to prevent duplicate posting (matches on start time, title, description, category, and access type)

## [1.0.0] - 2026-02-20

### Changed
- Updated Japanese translations — thank you to [🌸potato🌸](https://x.com/potatovrc) for the contribution!

## [0.9.35] - 2026-02-06

### Added
- "Include in Group Fair" toggle in Create Event, Modify Event, and Templates when the group supports it (applies the `vrc_event_group_fair` tag)
- Group Fair flag saved in templates and included in template JSON import/export

### Changed
- "Profiles" have been renamed to "Templates" throughout the UI and translations
- Featured/Group Fair toggles now appear automatically based on group feature tags; removed the Featured Events Verification settings card
- Auto-upload gallery images setting copy now references templates
- App now enforces a single running instance and focuses the existing window if launched again

### Fixed
- Featured status now carries into Modify Event so the toggle reflects real featured events
- Create Event now surfaces clear permission-revoked errors for Featured and Group Fair events

## [0.9.33] - 2026-01-29

### Added
- "Start on system startup" setting to launch the app automatically when your computer starts
- Featured Event toggle for groups with featured event permissions
  - Checkbox appears in Event Creation, Profiles, and Modify Event forms (below Platforms)
  - Settings card for verifying which groups have featured event access
  - Groups are verified by checking for existing featured events via the API
- Translations for all new features across all 10 supported languages

### Changed
- Logout button now only visible in Settings menu (previously always visible in footer)

### Removed
- One-time data migration code (migrated users from vrc-event-creator to VRCEventCreator directory)

## [0.9.32] - 2026-01-15

### Fixed
- User data directory now pins to VRCEventCreator with a one-time migration from vrc-event-creator

## [0.9.31] - 2026-01-15

### Changed
- Automation pending events now use deterministic IDs with slot dedupe and adaptive recheck scheduling
- Theme Studio import/export icons refreshed
- Modify Events keeps optimistic cards until posted or queued/missed

### Fixed
- Manual event creation now passes profile key so automations can schedule follow-ups
- Restore deleted automations now uses current profile settings and clears restore pool when all pending are deleted (auto-disables automation)
- Manage Profiles group switching no longer locks when a profile is selected
- Pending cards pull cached gallery images when available
- Automation recheck jobs now prune for groups without calendar access
- Auto-disabled automations now sync back to profile UI
- Restore anchor uses actual event starts to avoid pre-anchor restores after edits
- Published automation slots now reconcile against upcoming events to allow regeneration after deletions
- Deleted pending events with date overrides restore to the profile slot time
- Modify refresh button now respects a short cooldown with visible countdown
- Post Now deletions now clear optimistic cards immediately and roll back if the delete fails
- Post Now now guards against double-post clicks per pending event
- Restore count now refreshes when returning to Manage Profiles
- Added missing translation keys for JSON import/export and restore controls across all languages
- Pending edit time conversion now uses the main process timezone calculation
- Update check now only flags newer versions
- Modify Events profile load now respects the selected group when applying access rules

## [0.9.30] - 2026-01-15

### Fixed
- Update pill progress bar now adapts colors to match any theme (uses lighter/darker shade of theme color)
- Resync button disabled until initial sync completes
- Resync button disabled while update is downloading
- Updated Chinese Translations (Thank you Omoyx)

## [0.9.29] - 2026-01-10

### Changed
- Demo mode test data improvements for better translation testing and automation visualization
- Default Showcase pending events now accurately match hangout profile (category, languages, platforms, image, duration)
- Automation group profiles renamed to include timing info ("Weekly Session - 3 Days Before", "Bi-Weekly Session - 3 Days After", "Weekly Spotlight - Monthly on 11th")
- Automation groups now include 2-4 published events showing automation history and context
- Automation pending events expanded from 1 to 4 cards per group demonstrating repeating patterns
- Monthly automation fixed to show batch publishing: 4 weekly events per month all publishing on the same day (11th)
- Monthly automation pattern changed from "1st Saturday" to "every Saturday" for accurate weekly demonstration
- Demo build configuration changed from NSIS installer to portable standalone executable

## [0.9.28] - 2026-01-10

### Added
- Dutch (Nederlands) language support (Thanks Soupercore)
- nl_NL installer language option


## [0.9.27] - 2026-01-09

### Fixed
- Better rate limit handling and helper text for edge cases where pending/scheduled automations are queued and waiting for rate limits to lift. 

## [0.9.26] - 2026-01-09

### Security
- Enhanced file system write validation for debug logs with content sanitization
- Added comprehensive security validation for gallery image downloads
  - URL restricted to trusted VRChat CDN domains only
  - Content-Type validation ensures image files only
  - File size limited to 10MB maximum
  - Magic byte verification confirms valid image formats (PNG, JPEG, WebP)
  - Path traversal protection via normalized path checking

### Fixed
- Removed unused duplicate `resetAutomationForm` function from app.js
- Added CodeQL suppression comments for validated file operations

## [0.9.25] - 2026-01-09

### Fixed
- Comprehensive translation audit and cleanup across all 9 language files
- Added missing `common.months` sections to Spanish, French, Russian, Japanese, Korean, Portuguese, and Chinese
- Removed orphaned field duplicate keys from Japanese, Korean, Portuguese, Russian, and Chinese files
- Removed extra translation keys not present in English reference file (editButton, deleteButton, save, delete)
- Fixed duplicate `profiles.patterns.format` object in German translation
- Standardized indentation to 2 spaces in languageSetup and gallery sections across all files
- All translation files now match English structure for consistency

## [0.9.24] - 2026-01-09
Feature Complete Release!

### Added
- **Event Automation System (Experimental)** - Automatically post events based on profile patterns
  - Three timing modes: "Before event starts", "After previous event ends", "Monthly on specific day"
  - Configurable offset timing (days/hours/minutes before or after)
  - Repeat modes: indefinite or fixed count
  - Pending events view in Modify Events tab with "Scheduled" and "Missed" status indicators
  - Smart scheduling: checks for missed automations on app launch
  - Persistent storage of pending events and automation state
  - Manual override capability for individual pending events (edit title, description, time, etc.)
  - Post now, reschedule, or cancel actions for missed automations
  - Automatic retry logic with 15-minute delay on API failures
  - Dynamic event resolution: pulls latest profile data when posting
- Pending event display limit setting (default: 10 events shown)
- Monthly automation with intelligent date handling (days 29-31 use last day of shorter months)
- Visual indicators for pending vs missed automations
- Confirmation dialog when enabling automation with disclaimer about app requirements

### Changed
- Profile management UI expanded with automation configuration panel
- Modify Events tab now includes "Show Pending" toggle to view automated events
- Automation state persisted separately from profiles for tracking created event counts
- Pattern-based date generation extended to 3 months for automation scheduling
- Pending events stored with profile references rather than full event data (dynamic resolution)

### Fixed
- Added missing `common.months` translation section to German (de.js)
- Fixed French typo: "Mise ? jour" → "Mise à jour"
- Standardized German automation keys to match English structure
- Cleaned up translation redundancies across all language files
- Translation coverage for all automation-related UI strings across 9 languages

## [0.9.23] - 2026-01-07

### Added
- Optional conflict warning toggle in event creation wizard (default: off)
- Minimize to system tray feature with first-time confirmation dialog
- System tray icon with Show/Quit menu options

### Changed
- Settings file now only stores application preferences

### Fixed
- Event creation button properly locks during creation to prevent duplicates
- Local event tracking handles VRChat API delay for conflict detection
- Tray prompt dialog button layout and spacing improved
- App quit behavior from tray prompt now works correctly

## [0.9.22] - 2026-01-06

### Changed
- Version bump

## [0.9.21] - 2026-01-06

### Changed
- Installer now shows setup wizard with directory selection instead of silent auto-install
- Auto-updates no longer download automatically; user must click update pill to start download

## [0.9.20] - 2026-01-06

### Fixed
- Update checks no longer block app startup, improving launch performance
- Removed dead code validation checks flagged by CodeQL analysis
- Removed unused variable in rate limit error handling

## [0.9.19] - 2026-01-06

### Added
- Optimistic event deletion with instant UI feedback (events disappear immediately)
- Automatic rollback if deletion fails on backend
- Tombstone tracking to prevent deleted events from reappearing (60-second filter)
- Exponential backoff for refresh button rate limiting (2s → 60s sequence)
- Visual countdown timer on refresh button during rate limit backoff
- Race condition prevention in modify events refresh logic
- Resync functionality via status pill (hover shows "Resync" when online, click to sync data)
- Green pulsing animation on status pill when update is ready to install
- Improved status pill accessibility (clickable when online, disabled when offline)
- WCAG-compliant contrast checking for update pill colors

### Changed
- Event deletion now provides immediate visual feedback before backend confirmation
- Refresh button respects 10-second deduplication window before allowing cache bypass
- Scroll position maintained when deleting events or refreshing event list
- Disabled event conflict detection backend logic (assumes user intent for duplicate time slots)
- Status pill now interactive when online (hover for resync, click to sync groups/profiles)
- Update pill colors now use theme accent with automatic fallback if contrast too low
- Restart pill displays in green with pulsing shadow animation
- Status pill transitions smoothly between states (online/update/downloading/restart)

### Fixed
- Ghost events no longer remain visible after deletion
- Multiple rapid refresh clicks no longer cause race conditions
- Scroll position no longer resets to top after deletions or refreshes
- 429 rate limit errors now trigger appropriate backoff delays
- Status pill color contrast issues with certain custom themes
- Update progress bar visual clarity during download phase

## [0.9.18] - 2026-01-06

### Added
- Request caching system to prevent redundant API calls (15-minute cache for failed 403/404 requests)
- Request deduplication for concurrent identical GET requests (10-second window)
- Hourly event creation tracking with persistent storage (tracks last hour of activity)
- Event metadata tracking (createdAt, createdById) for better history management
- Rate limiting protection for gallery uploads
- Client-side enforcement of VRChat's 10 events per group per hour limit

### Changed
- Event creation limit changed from "10 upcoming events" to "10 events per hour per group"
- Upcoming event counter now shows hourly creation count instead of total upcoming events
- Event creation now blocks temporarily when hourly limit is reached
- History merging from server events to maintain accurate hourly counts

### Fixed
- Reduced unnecessary API calls through intelligent caching and deduplication
- Improved rate limit error handling across event creation and gallery uploads
- Better user feedback when hitting rate limits
- Events created on VRChat website now correctly count toward hourly limit

## [0.9.17] - 2026-01-06

### Added
- Silent auto-update with progress indicator (pill shows "Updating XX%" during download)
- Fynn theme with orange accent and bioluminescent-style grid
- Multilingual installer support (auto-detects system language)

### Changed
- Updates now download automatically in background
- Update pill changes: "Update" → "Updating XX%" → "Restart"
- One-click silent installer (no setup wizard on updates)

### Fixed
- Theme seeding now tracks keys properly (new themes get added, deleted themes stay deleted)


## [0.9.16] - 2026-01-06

### Added
- Fynn theme

### Fixed
- Theme seeding now tracks keys properly (new themes get added, deleted themes stay deleted)


## [0.9.14] - 2026-01-06

### Added
- Auto-update functionality with electron-updater (click Update pill to download and install)
- Automated build and release workflow via GitHub Actions
- Linux AppImage build support

### Changed
- Windows build now uses NSIS installer instead of portable
- Dynamic repo configuration for fork support

## [0.9.0] - 2026-01-02

Fully functional release of VRC Event Creator.

Waiting for feedback and translation reviews before version 1.0.0 is finalized.

- Added Optional Role Restrictions for Group-only Access events.
