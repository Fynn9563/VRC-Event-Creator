<h1 align="center">
  <img src="electron/app.ico" alt="VRChat Event Creator" width="96" height="96" align="middle" />&nbsp;VRChat Event Creator
</h1>
<p align="center">
  <a href="https://github.com/Cynacedia/VRC-Event-Creator/releases">
    <img src="https://img.shields.io/github/downloads/Cynacedia/VRC-Event-Creator/total?style=plastic&labelColor=555&color=blue" alt="Downloads" />
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
  <a href="README/README.ru.md">Русский</a>
</p>

An all-in-one event creation tool for VRChat that eliminates repetitive setup.
Create and save per-group event templates, generate upcoming event dates from simple recurring patterns, and auto-fill details instantly - perfect for quickly scheduling weekly meetups, watch parties, and community events.

## Screenshots
<table>
  <tr>
    <td align="center">
      <img src="README/.imgs/1MP-Basics-Screenshot%202026-01-02%20230956.png" width="300" alt="Profiles: templates" />
      <br />
      Profiles: templates
    </td>
    <td align="center">
      <img src="README/.imgs/2MP-Schedule-Screenshot%202026-01-02%20231523.png" width="300" alt="Profiles: schedule rules" />
      <br />
      Profiles: schedule rules
    </td>
    <td align="center">
      <img src="README/.imgs/3CE-ProfileSelect-Screenshot%202026-01-02%20231634.png" width="300" alt="Create: select profile" />
      <br />
      Create: select profile
    </td>
  </tr>
  <tr>
    <td align="center">
      <img src="README/.imgs/4CE-DateSelect-Screenshot%202026-01-02%20231805.png" width="300" alt="Create: pick a date" />
      <br />
      Create: pick a date
    </td>
    <td align="center">
      <img src="README/.imgs/5CE-Review-Screenshot%202026-01-02%20231907.png" width="300" alt="Create: review & submit" />
      <br />
      Create: review & submit
    </td>
    <td align="center">
      <img src="README/.imgs/6S-ThemeStudio-Screenshot%202026-01-02%20232221.png" width="300" alt="Theme Studio: custom UI" />
      <br />
      Theme Studio: custom UI
    </td>
  </tr>
</table>

## Download
- GitHub Releases: https://github.com/Cynacedia/VRC-Event-Creator/releases
- The Windows portable `.exe` runs standalone (no Node.js required to run it).
- App data is stored in the standard Electron user data directory (shown in Settings > Application Info), unless you override it with `VRC_EVENT_DATA_DIR`.

## Features
- Profiles/templates that auto-fill event details per group.
- Recurring pattern generator with upcoming date lists and manual date/time fallback.
- Event creation wizard for group calendar events.
- Modify Events view for upcoming events (grid + edit modal).
- Theme Studio with presets and full UI color control (supports #RRGGBBAA).
- Gallery picker and upload for image IDs.
- Localization with first-run language selection (en, fr, es, de, ja, zh, pt, ko, ru).

## Privacy & Data storage
Your password is not stored. Only session tokens are cached.
The app stores its files in the Electron user data directory (shown in the Settings > Application Info section):

- `profiles.json` (profile templates)
- `cache.json` (session tokens)
- `settings.json` (contact email)
- `themes.json` (theme presets and custom colors)

You can override the data directory with the `VRC_EVENT_DATA_DIR` environment variable.
On first launch, the app will try to import an existing `profiles.json` from the project folder.

__**Do not share cache files or application data folders.**__

## Usage notes
- Profiles require a Profile Name, Event Name, and Description before you can continue.
- Contact email is required on first run for VRChat API usage.
- Private groups can only use Access Type = Group.
- Duration uses DD:HH:MM and caps at 31 days.
- Tags are limited to 5 and languages are limited to 3.
- Gallery uploads are limited to PNG/JPG, 64-2048 px, under 10 MB, and 64 images per account.
- VRChat currently only allows up to 10 upcoming events at a time.

## Updates
- Checks on startup and once per hour while running.
- UPDATE links to the GitHub repo when a new version is available.
- Event creation and editing are blocked while UPDATE is shown.
- No auto-updater; update manually by downloading the latest `.exe` here: https://github.com/Cynacedia/VRC-Event-Creator/releases.

## Troubleshooting
- Login issues: delete `cache.json` and sign in again (use the data folder from About).
- Missing groups: your account must have calendar access in the target group.
- Rate limiting: VRChat may rate limit event creation. Wait and retry, and stop if several attempts fail. Do not spam refresh or event creation buttons.

## Translations
*Languages are machine translated and may be inaccurate, please contribute corrections.
- English: README.md
- Français: README/README.fr.md
- Español: README/README.es.md
- Deutsch: README/README.de.md
- 日本語: README/README.ja.md
- 中文（简体）: README/README.zh.md
- Português: README/README.pt.md
- 한국어: README/README.ko.md
- Русский: README/README.ru.md

## Disclaimer
This project is not affiliated with or endorsed by VRChat. Use at your own risk.

## Requirements (building from source)
- Node.js 20+ (22.21.1 recommended)
- npm
- A VRChat account with permission to create events for at least one group