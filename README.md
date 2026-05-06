<h1 align="center">
  <img src="electron/app.ico" alt="VRChat Event Creator" width="96" height="96" align="middle" />&nbsp;VRChat Event Creator
</h1>
<p align="center">
  <a href="https://github.com/Cynacedia/VRC-Event-Creator/releases">
    <img src="https://gist.githubusercontent.com/Cynacedia/30c5da7160619ca08933e7e3e92afcc3/raw/downloads-badge.svg" alt="Downloads" />
  </a>
</p>
<p align="center">
  <a href="README.md">English</a> |
  <a href="README/README.fr.md">Français</a> |
  <a href="README/README.es.md">Español</a> |
  <a href="README/README.de.md">Deutsch</a> |
  <a href="README/README.ja.md">日本語</a> |
  <a href="README/README.zh.md">中文（简体）</a> |
  <a href="README/README.pt.md">Português</a> |
  <a href="README/README.ko.md">한국어</a> |
  <a href="README/README.ru.md">Русский</a> |
  <a href="README/README.nl.md">Nederlands</a>
</p>

An all-in-one event creation tool for VRChat that eliminates repetitive setup.
Create and save per-group event templates, generate upcoming event dates from simple recurring patterns, and auto-fill details instantly. Perfect for quickly scheduling weekly meetups, watch parties, and community events.

<p align="center">
  <img src="README/.imgs/1MP-CE_CreationFlow-01-05-26.gif" width="900" alt="Event creation flow (template to publish)" />
</p>

## Templates and native series, side by side

VRChat has its own recurring-events feature. It's great for stable repeating events: once you create a series, VRChat keeps it going on its own with no app required, and the whole run is announced at creation. Editing a running series in VRChat normally means deleting and recreating it; this app handles that for you when you change the schedule, so it feels like a regular edit. The downside is that there are no per-occurrence announcements, so tweaks you make to individual events later can slip past your community unnoticed.

Templates work differently. The core flow is manual: you create a single event, with the template auto-filling the form so you don't have to retype details every time. From there, optional automation can keep posting upcoming events on a schedule, each one with its own fresh announcement so your community knows when something's coming up. Edits to a pending event get announced when that post goes out, so last-minute changes don't slip past anyone. The catch: automated posting needs the app running.

Both live under the same **Manage Schedules** tab. You can use either or both in the same group, whichever fits the event.

## Features
- Templates that auto-fill event details per group with optional automations to post automatically on a schedule.
- Recurring pattern generator with upcoming date lists and manual date/time fallback.
- Native VRChat series support, alongside templates.
- Event automation that auto-posts events from template patterns while the app is running.
- Modify Events view for upcoming events (grid + edit modal, with filters and an adjustable time range).
- Event creation wizard for group calendar events.
- Theme Studio with presets and full UI color control (supports `#RRGGBBAA`).
- Localization with first-run language selection (en, fr, es, de, ja, zh, pt, ko, ru, nl).
- Gallery picker and upload for image IDs.
- Start on system startup + minimize to tray.
- Single-instance protection to prevent duplicate launches.

### Optional integrations (Advanced Options)

These are off by default and require their own setup. Once configured, each toggles independently per template and per event:

- **Discord:** automatically create Discord scheduled events alongside VRChat events. Requires creating a Discord bot and inviting it to your server. ([Setup Guide](README/Discord%20Setup/DISCORD_SETUP.en.md))
- **Calendar:** generate `.ics` files with reminders, optionally delivered via Discord webhook or auto-saved locally. ([Setup Guide](README/Calendar%20Setup/CALENDAR_SETUP.en.md))
- **EC Kit** (paid license): webhook identity customization (display name, avatar, embed color) plus per-event custom messages and image attachments. ([Ko-fi](https://ko-fi.com/s/0735ce5375) · [License](https://eckit.cynacedia.dev/license/v1.0))

## Download
- Releases: https://github.com/Cynacedia/VRC-Event-Creator/releases

## Privacy & Data storage
Your password is not stored. Only session tokens are cached.
The app stores its files in the Electron user data directory (shown in the Settings > Application Info section):

- `profiles.json` (event templates and per-group integration config)
- `series.json` (locally tracked native VRChat series)
- `cache.json` (session tokens)
- `settings.json` (app settings)
- `themes.json` (theme presets and custom colors)
- `pending-events.json` (automation queue)
- `automation-state.json` (automation tracking)
- `pending-rasterize.json` (queued series creations awaiting rate-limit retry)

You can override the data directory with the `VRC_EVENT_DATA_DIR` environment variable.
On first launch, the app will try to import an existing `profiles.json` from the project folder.

Bot tokens (for Discord integration) and webhook URLs are encrypted at rest using your OS's secure storage. They are never sent anywhere except directly to Discord's API or your webhook URL.

__**Do not share cache files or application data folders.**__

## Usage notes
- Templates require a Schedule Name, Event Name, and Description before saving.
- Private groups can only use Access Type = Group.
- Duration uses DD:HH:MM and caps at 31 days.
- Tags are limited to 5 and languages are limited to 3.
- Gallery uploads are limited to PNG/JPG, 64–2048 px, under 10 MB, and 64 images per account.
- VRChat limits event creation to 10 events per-hour per-person per-group.
- Templates need the app running to post events automatically. Series, once created, run on their own.
- Featured Event and other special toggles require specific group permissions; the toggles only appear when allowed.

## Troubleshooting
- **Login issues:** delete `cache.json` and sign in again (use the data folder shown in Settings > Application Info).
- **Missing groups in dropdown:** your account must have calendar access in the target group. If you just updated permissions on the VRChat side, click **Resync** to refresh the list.
- **Rate limiting:** VRChat may rate limit event creation. Wait and retry, and stop if several attempts fail. Do not spam refresh or event creation buttons.
- **Series creation paused:** if VRChat rate-limited a series creation, it'll retry automatically. The Schedules tab shows when the next attempt is, with a "Retry Now" option if you'd rather not wait.
- **Updates:** Some features are blocked when updates are pending. Download and run the latest release.

## Disclaimer
- This project is not affiliated with or endorsed by VRChat. Use at your own risk.
- Languages are machine translated and may be inaccurate, please contribute corrections.

## Requirements (building from source)
- Node.js 20+ (22.21.1 recommended)
- npm
- A VRChat account with permission to create events for at least one group

---

## Special Thanks
- [🌸potato🌸](https://x.com/potatovrc), Japanese translations
- Garvas, French translations
- Sometsuki, Portuguese translations
- All [GitHub contributors](https://github.com/Cynacedia/VRC-Event-Creator/graphs/contributors)
