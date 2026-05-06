<h1 align="center">
  <img src="../electron/app.ico" alt="VRChat Event Creator" width="96" height="96" align="middle" />&nbsp;VRChat Event Creator
</h1>
<p align="center">
  <a href="https://github.com/Cynacedia/VRC-Event-Creator/releases">
    <img src="https://gist.githubusercontent.com/Cynacedia/30c5da7160619ca08933e7e3e92afcc3/raw/downloads-badge.svg" alt="Downloads" />
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
  <a href="README.ru.md">Русский</a> |
  <a href="README.nl.md">Nederlands</a>
</p>

Ein All-in-one-Tool zur Event-Erstellung für VRChat, das wiederkehrende Einrichtungsschritte eliminiert.
Erstelle und speichere gruppenbezogene Event-Vorlagen, generiere kommende Termine aus einfachen Wiederholungsmustern und fülle Details sofort automatisch aus. Ideal, um wöchentliche Treffen, Watch-Partys und Community-Events schnell zu planen.

<p align="center">
  <img src=".imgs/1MP-CE_CreationFlow-01-05-26.gif" width="900" alt="Event-Erstellungsablauf (Vorlage bis Veröffentlichung)" />
</p>

## Vorlagen und native Serien Seite an Seite

VRChat bringt inzwischen eine eigene Funktion für wiederkehrende Events mit. Sie eignet sich gut für stabile, sich wiederholende Termine: Sobald eine Serie angelegt ist, hält VRChat sie selbstständig am Laufen, ohne dass die App geöffnet sein muss, und der gesamte Lauf wird einmalig bei der Erstellung angekündigt. Eine laufende Serie in VRChat zu bearbeiten heißt normalerweise, sie zu löschen und neu anzulegen; diese App erledigt diesen Schritt für dich, sobald du den Zeitplan änderst, sodass es sich wie eine normale Bearbeitung anfühlt. Der Haken: Es gibt keine Ankündigungen pro Vorkommen, spätere Anpassungen an einzelnen Terminen können also unbemerkt an deiner Community vorbeigehen.

Vorlagen funktionieren anders. Der Kernablauf ist manuell: Du legst die Events einzeln an, wobei die Vorlage das Formular für dich vorausfüllt, damit du nicht jedes Mal die Details neu tippen musst. Optional übernimmt eine Automatisierung dann das Veröffentlichen der nächsten Termine nach Plan, wobei jede Veröffentlichung ihre eigene Ankündigung mitbringt, damit deine Community erfährt, dass etwas Neues ansteht. Änderungen an einem ausstehenden Event werden mit der Veröffentlichung mitangekündigt, sodass auch kurzfristige Anpassungen niemandem entgehen. Voraussetzung: Für die automatische Veröffentlichung muss die App laufen.

Beide leben im selben Tab **Pläne verwalten**. Du kannst in derselben Gruppe nur eines oder auch beides nutzen, je nachdem, was zum jeweiligen Event passt.

## Funktionen
- Vorlagen, die Event-Details pro Gruppe automatisch ausfüllen (mit optionaler Automatisierung für die geplante Veröffentlichung).
- Generator für wiederkehrende Muster mit Listen kommender Termine und manuellem Datum/Uhrzeit-Fallback.
- Unterstützung nativer VRChat-Serien, parallel zu Vorlagen.
- Event-Automatisierung: veröffentlicht Events anhand der Vorlagenmuster, solange die App läuft.
- Ansicht „Events bearbeiten" für kommende Events (Raster + Bearbeitungs-Modal, mit Filtern und einstellbarer Zeitspanne).
- Assistent zur Event-Erstellung für Gruppenkalender.
- Theme Studio mit Voreinstellungen und vollständiger UI-Farbsteuerung (unterstützt #RRGGBBAA).
- Lokalisierung mit Sprachauswahl beim ersten Start (en, fr, es, de, ja, zh, pt, ko, ru, nl).
- Galerieauswahl und -upload für Bild-IDs.
- Autostart beim Systemstart + Minimieren in den System-Tray.
- Single-Instance-Schutz, der doppeltes Starten verhindert.

### Optionale Integrationen (Erweiterte Optionen)

Standardmäßig deaktiviert; jede erfordert eine eigene Einrichtung. Nach dem Einrichten lässt sich jede pro Vorlage und pro Event unabhängig ein- oder ausschalten:

- **Discord:** erstellt automatisch geplante Discord-Events parallel zu VRChat-Events. Erfordert das Anlegen eines Discord-Bots und dessen Einladung auf deinen Server. ([Einrichtungsanleitung](Discord%20Setup/DISCORD_SETUP.de.md))
- **Kalender:** erzeugt `.ics`-Dateien mit Erinnerungen, ausgeliefert über einen Discord-Webhook oder lokal gespeichert. ([Einrichtungsanleitung](Calendar%20Setup/CALENDAR_SETUP.de.md))
- **EC Kit** (kostenpflichtige Lizenz): Anpassung der Webhook-Identität pro Gruppe (Anzeigename, Avatar, Embed-Farbe) sowie individuelle Nachrichten und Bildanhänge pro Event. ([Ko-fi](https://ko-fi.com/s/0735ce5375) · [Lizenz](https://eckit.cynacedia.dev/license/v1.0))

## Download
- Releases: https://github.com/Cynacedia/VRC-Event-Creator/releases

## Datenschutz und Datenspeicherung
Dein Passwort wird nicht gespeichert. Nur Sitzungstokens werden zwischengespeichert.
Die App speichert ihre Dateien im Electron-Benutzerdatenverzeichnis (zu sehen unter Einstellungen > Anwendungsinfo):

- `profiles.json` (Event-Vorlagen und Integrationskonfiguration pro Gruppe)
- `series.json` (lokal verfolgte native VRChat-Serien)
- `cache.json` (Sitzungstokens)
- `settings.json` (App-Einstellungen)
- `themes.json` (Theme-Voreinstellungen und individuelle Farben)
- `pending-events.json` (Automatisierungswarteschlange)
- `automation-state.json` (Automatisierungsverfolgung)
- `pending-rasterize.json` (Serien-Erstellungen, die wegen einer Ratenbegrenzung in der Warteschlange stehen)

Du kannst das Datenverzeichnis über die Umgebungsvariable `VRC_EVENT_DATA_DIR` überschreiben.
Beim ersten Start versucht die App, eine vorhandene `profiles.json` aus dem Projektordner zu importieren.

Bot-Tokens (für die Discord-Integration) und Webhook-URLs werden im Ruhezustand mit dem sicheren Speicher deines Betriebssystems verschlüsselt. Sie werden nirgendwohin außer direkt an die Discord-API oder deine Webhook-URL gesendet.

__**Gib weder Cache-Dateien noch Anwendungsdaten-Ordner an andere weiter.**__

## Hinweise zur Nutzung
- Vorlagen benötigen einen Plannamen, einen Eventnamen und eine Beschreibung, bevor du fortfahren kannst.
- Private Gruppen können nur den Zugangstyp = Gruppe verwenden.
- Die Dauer verwendet das Format DD:HH:MM und ist auf 31 Tage begrenzt.
- Tags sind auf 5 und Sprachen auf 3 begrenzt.
- Galerie-Uploads sind auf PNG/JPG, 64-2048 px, unter 10 MB und 64 Bilder pro Konto begrenzt.
- VRChat begrenzt die Event-Erstellung auf 10 Events pro Stunde pro Person pro Gruppe.
- Vorlagen brauchen die App im Hintergrund, damit Events automatisch veröffentlicht werden. Serien laufen, einmal angelegt, von selbst.
- Featured Event und andere besondere Schalter benötigen bestimmte Gruppenrechte; sie erscheinen nur, wenn sie erlaubt sind.

## Fehlerbehebung
- **Login-Probleme:** lösche `cache.json` und melde dich erneut an (verwende den Datenordner, der unter Einstellungen > Anwendungsinfo angezeigt wird).
- **Fehlende Gruppen im Dropdown:** dein Konto braucht Kalenderzugriff in der Zielgruppe. Wenn du gerade auf VRChat-Seite Berechtigungen geändert hast, klicke **Resync**, um die Liste zu aktualisieren.
- **Ratenbegrenzung:** VRChat kann die Event-Erstellung drosseln. Warte und versuche es erneut; höre auf, wenn mehrere Versuche scheitern. Spamme nicht den Aktualisieren- oder Erstellen-Button.
- **Serien-Erstellung pausiert:** Wenn VRChat eine Serien-Erstellung wegen einer Ratenbegrenzung gestoppt hat, versucht die App es automatisch erneut. Der Pläne-Tab zeigt den nächsten Versuch und bietet einen Button „Jetzt erneut versuchen" für ungeduldige Momente.
- **Updates:** Einige Funktionen sind blockiert, wenn ein Update aussteht. Lade die neueste Version herunter und führe sie aus.

## Haftungsausschluss
- Dieses Projekt ist nicht mit VRChat verbunden oder von VRChat unterstützt. Nutzung auf eigene Gefahr.
- Die Sprachen sind maschinell übersetzt und können ungenau sein; bitte trage Korrekturen bei.

## Voraussetzungen (Build aus Quelle)
- Node.js 20+ (22.21.1 empfohlen)
- npm
- Ein VRChat-Konto mit der Berechtigung, in mindestens einer Gruppe Events zu erstellen

---

## Danksagungen
- [🌸potato🌸](https://x.com/potatovrc), japanische Übersetzungen
- Garvas, französische Übersetzungen
- Sometsuki, portugiesische Übersetzungen
- Alle [GitHub-Mitwirkenden](https://github.com/Cynacedia/VRC-Event-Creator/graphs/contributors)
