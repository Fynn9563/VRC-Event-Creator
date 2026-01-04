<h1 align="center">
  <img src="../electron/app.ico" alt="VRChat Event Creator" width="96" height="96" align="middle" />&nbsp;VRChat Event Creator
</h1>
<p align="center">
  <a href="https://github.com/Cynacedia/VRC-Event-Creator/releases">
    <img src="https://img.shields.io/github/downloads/Cynacedia/VRC-Event-Creator/total?style=plastic&labelColor=555&color=blue" alt="Downloads" />
  </a>
</p>
<p align="center">
  <a href="../README.md">English</a> |
  <a href="README.fr.md">Français</a> |
  <a href="README.es.md">Español</a> |
  <a href="README.de.md">Deutsch</a> |
  <a href="README.ja.md">日本語</a> |
  <a href="README.zh.md">中文（简体）</a> |
  <a href="README.pt.md">Português</a> |
  <a href="README.ko.md">한국어</a> |
  <a href="README.ru.md">Русский</a>
</p>
Ein All-in-one-Tool zur Event-Erstellung für VRChat, das wiederkehrende Einrichtungsschritte eliminiert.
Erstelle und speichere gruppenbezogene Event-Vorlagen, generiere kommende Termine aus einfachen Wiederholungsmustern und fülle Details sofort automatisch aus - ideal, um wöchentliche Treffen, Watch-Partys und Community-Events schnell zu planen.

## Screenshots
<table>
  <tr>
    <td align="center">
      <img src=".imgs/1MP-Basics-Screenshot%202026-01-02%20230956.png" width="300" alt="Profile: Vorlagen" />
      <br />
      Profile: Vorlagen
    </td>
    <td align="center">
      <img src=".imgs/2MP-Schedule-Screenshot%202026-01-02%20231523.png" width="300" alt="Profile: Planungsregeln" />
      <br />
      Profile: Planungsregeln
    </td>
    <td align="center">
      <img src=".imgs/3CE-ProfileSelect-Screenshot%202026-01-02%20231634.png" width="300" alt="Erstellen: Profil wählen" />
      <br />
      Erstellen: Profil wählen
    </td>
  </tr>
  <tr>
    <td align="center">
      <img src=".imgs/4CE-DateSelect-Screenshot%202026-01-02%20231805.png" width="300" alt="Erstellen: Datum wählen" />
      <br />
      Erstellen: Datum wählen
    </td>
    <td align="center">
      <img src=".imgs/5CE-Review-Screenshot%202026-01-02%20231907.png" width="300" alt="Erstellen: prüfen & absenden" />
      <br />
      Erstellen: prüfen & absenden
    </td>
    <td align="center">
      <img src=".imgs/6S-ThemeStudio-Screenshot%202026-01-02%20232221.png" width="300" alt="Theme Studio: eigene UI" />
      <br />
      Theme Studio: eigene UI
    </td>
  </tr>
</table>

## Download
- GitHub Releases: https://github.com/Cynacedia/VRC-Event-Creator/releases
- Die portable Windows-`.exe` läuft eigenständig (kein Node.js zum Ausführen erforderlich).
- App-Daten werden im standardmäßigen Electron-Benutzerdatenverzeichnis gespeichert (angezeigt unter Einstellungen > Anwendungsinfo), sofern du es nicht mit `VRC_EVENT_DATA_DIR` überschreibst.

## Funktionen
- Profile/Vorlagen, die Event-Details pro Gruppe automatisch ausfüllen.
- Generator für wiederkehrende Muster mit Listen kommender Termine und manuellem Datum/Uhrzeit-Fallback.
- Assistent zur Event-Erstellung für Gruppenkalender.
- Ansicht „Events bearbeiten“ für kommende Events (Raster + Bearbeitungs-Modal).
- Theme Studio mit Presets und voller UI-Farbkontrolle (unterstützt #RRGGBBAA).
- Galerieauswahl und Upload für Bild-IDs.
- Lokalisierung mit Sprachauswahl beim ersten Start (en, fr, es, de, ja, zh, pt, ko, ru).

## Datenspeicher
Die App speichert ihre Dateien im Electron-Benutzerdatenverzeichnis (angezeigt unter Einstellungen > Anwendungsinfo):

- `profiles.json` (Profilvorlagen)
- `cache.json` (Session-Tokens)
- `settings.json` (Kontakt-E-Mail)
- `themes.json` (Theme-Presets und benutzerdefinierte Farben)

Du kannst das Datenverzeichnis mit der Umgebungsvariable `VRC_EVENT_DATA_DIR` überschreiben.
Beim ersten Start versucht die App, eine vorhandene `profiles.json` aus dem Projektordner zu importieren.

Teile keine Cache-Dateien; sie enthalten Session-Tokens.

## Hinweise zur Nutzung
- Profile benötigen einen Profilnamen, Eventnamen und eine Beschreibung, bevor du fortfahren kannst.
- Für die VRChat-API ist beim ersten Start eine Kontakt-E-Mail erforderlich.
- Private Gruppen können nur Zugriffstyp = Gruppe verwenden.
- Dauer verwendet DD:HH:MM und ist auf 31 Tage begrenzt.
- Tags sind auf 5 und Sprachen auf 3 begrenzt.
- Galerie-Uploads sind auf PNG/JPG, 64-2048 px, unter 10 MB und 64 Bilder pro Konto begrenzt.
- VRChat erlaubt derzeit nur bis zu 10 kommende Events gleichzeitig.

## Updates
- Prüft beim Start und stündlich während der Ausführung.
- UPDATE verlinkt auf das GitHub-Repo, wenn eine neue Version verfügbar ist.
- Erstellung und Bearbeitung von Events sind blockiert, solange UPDATE angezeigt wird.
- Kein Auto-Updater; Updates manuell.

## Fehlerbehebung
- Login-Probleme: `cache.json` löschen und erneut anmelden (verwende den Datenordner aus Anwendungsinfo).
- Fehlende Gruppen: Dein Konto benötigt Kalenderzugriff in der Zielgruppe.
- Rate-Limiting: VRChat kann die Event-Erstellung begrenzen. Warte und versuche es erneut. Stoppe, wenn mehrere Versuche fehlschlagen. Buttons für Refresh oder Event-Erstellung nicht spammen.

## Datenschutz und Sicherheit
- Dein Passwort wird nicht gespeichert. Nur Session-Tokens werden gecacht.
- Teile weder `cache.json` noch App-Datenordner.

## Übersetzungen
*Die Übersetzungen sind maschinell erstellt und können ungenau sein. Bitte Korrekturen beitragen.
- English: ../README.md
- Français: README.fr.md
- Español: README.es.md
- Deutsch: README.de.md
- 日本語: README.ja.md
- 中文（简体）: README.zh.md
- Português: README.pt.md
- 한국어: README.ko.md
- Русский: README.ru.md

## So funktioniert es
- Die App nutzt Electron:
  - `electron/main.js` handhabt VRChat-API-Aufrufe, Profilpersistenz und Session-Cache.
  - `electron/preload.js` stellt IPC-Methoden für den Renderer bereit.
  - `electron/renderer/` rendert die UI und steuert den Wizard-Flow.
  - `electron/core/date-utils.js` erzeugt kommende Termine aus Patterns.

## Haftungsausschluss
Dieses Projekt ist nicht mit VRChat verbunden und wird nicht von VRChat unterstützt. Nutzung auf eigenes Risiko.

## Voraussetzungen (Build aus dem Quellcode)
- Node.js 20+ (22.21.1 empfohlen)
- npm
- Ein VRChat-Konto mit Berechtigung, Events für mindestens eine Gruppe zu erstellen

## Einrichtung (aus dem Quellcode)
1) Abhängigkeiten installieren:

```bash
npm install
```

2) Kontakt-E-Mail für die VRChat-API angeben:
- Beim ersten Start eingeben oder in der Anwendungsinfo aktualisieren.

## Ausführen (aus dem Quellcode)
```bash
npm run start:gui
```

## Build
- Portabler Windows-Build:

```bash
npm run dist:gui
```

- Plattformübergreifende Builds (benötigt macOS/Linux-Tools für DMG/AppImage):

```bash
npm run dist:gui:all
```
