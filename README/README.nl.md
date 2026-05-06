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

Een alles-in-één tool voor VRChat-evenementen die tijdrovend instelwerk overbodig maakt.
Maak en bewaar per-groep event-sjablonen, genereer aankomende eventdatums op basis van eenvoudige herhalingspatronen en vul details automatisch in. Ideaal om snel wekelijkse meetups, watch parties en community-evenementen te plannen.

<p align="center">
  <img src="../README/.imgs/1MP-CE_CreationFlow-01-05-26.gif" width="900" alt="Event-creatie flow (sjabloon naar publicatie)" />
</p>

## Sjablonen en native series naast elkaar

VRChat heeft inmiddels een eigen functie voor terugkerende evenementen. Die is geschikt voor stabiele, terugkerende evenementen: zodra je een serie aanmaakt, houdt VRChat hem zelf draaiende zonder dat de app open hoeft te staan, en de hele reeks wordt eenmalig aangekondigd op het moment van aanmaken. Een lopende serie binnen VRChat aanpassen betekent doorgaans verwijderen en opnieuw aanmaken; deze app handelt die stap voor je af zodra je het schema wijzigt, dus het voelt als een gewone bewerking. De keerzijde is dat er geen aankondigingen per voorkomen zijn, dus aanpassingen die je later aan losse evenementen doet kunnen onopgemerkt aan je community voorbijgaan.

Sjablonen werken anders. De kernstroom is handmatig: je maakt één evenement tegelijk aan, waarbij het sjabloon het formulier voor je invult zodat je niet steeds opnieuw alle details hoeft te typen. Vanaf daar kan een optionele automatisering de volgende evenementen volgens een schema blijven plaatsen, elk met zijn eigen aankondiging zodat je community weet dat er iets nieuws op stapel staat. Wijzigingen in een wachtend evenement worden meegenomen in de aankondiging op het moment van plaatsing, dus last-minute aanpassingen ontgaan niemand. De keerzijde: voor automatisch plaatsen moet de app draaien.

Beide leven onder hetzelfde tabblad **Roosters beheren**. Je kunt binnen dezelfde groep het ene of het andere gebruiken, of beide combineren, afhankelijk van wat bij het evenement past.

## Functies
- Sjablonen die eventdetails per groep automatisch invullen (met optionele automatisering om volgens schema te plaatsen).
- Generator voor herhalingspatronen met lijsten van aankomende datums en een handmatige datum/tijd-terugvaloptie.
- Ondersteuning voor native VRChat-series, naast sjablonen.
- Evenement-automatisering: plaatst evenementen op basis van sjabloonpatronen zolang de app draait.
- Weergave "Modify Events" voor aankomende evenementen (raster + bewerkvenster, met filters en een instelbare tijdsperiode).
- Wizard voor het aanmaken van evenementen voor groepskalenders.
- Theme Studio met presets en volledige UI-kleurcontrole (ondersteunt #RRGGBBAA).
- Lokalisatie met taalkeuze bij eerste opstart (en, fr, es, de, ja, zh, pt, ko, ru, nl).
- Galerij-keuze en upload voor afbeeldings-IDs.
- Starten met systeem + minimaliseren naar het systeemvak.
- Beveiliging tegen meerdere gelijktijdige instances.

### Optionele integraties (Geavanceerde opties)

Standaard uitgeschakeld; elk vraagt om eigen instellingen. Eenmaal ingesteld is elk per sjabloon en per evenement onafhankelijk in te schakelen:

- **Discord:** maakt automatisch geplande Discord-evenementen aan naast VRChat-evenementen. Vereist het maken van een Discord-bot en deze uitnodigen op je server. ([Setup-handleiding](Discord%20Setup/DISCORD_SETUP.nl.md))
- **Kalender:** genereert `.ics`-bestanden met herinneringen, te bezorgen via een Discord-webhook of lokaal opgeslagen. ([Setup-handleiding](Calendar%20Setup/CALENDAR_SETUP.nl.md))
- **EC Kit** (betaalde licentie): aanpassen van de webhook-identiteit per groep (weergavenaam, avatar, embed-kleur), plus aangepaste berichten en bijgevoegde afbeeldingen per evenement. ([Ko-fi](https://ko-fi.com/s/0735ce5375) · [Licentie](https://eckit.cynacedia.dev/license/v1.0))

## Download
- Releases: https://github.com/Cynacedia/VRC-Event-Creator/releases

## Privacy en gegevensopslag
Je wachtwoord wordt niet opgeslagen. Alleen sessietokens worden in cache bewaard.
De app slaat zijn bestanden op in de Electron-userdata-map (te zien onder Instellingen > Applicatie-info):

- `profiles.json` (event-sjablonen en integratie-configuratie per groep)
- `series.json` (lokaal gevolgde native VRChat-series)
- `cache.json` (sessietokens)
- `settings.json` (app-instellingen)
- `themes.json` (theme-presets en aangepaste kleuren)
- `pending-events.json` (automatiseringswachtrij)
- `automation-state.json` (automatisering-tracking)
- `pending-rasterize.json` (in de wachtrij staande serie-aanmakingen na een rate-limit)

Je kunt de gegevensmap overschrijven met de omgevingsvariabele `VRC_EVENT_DATA_DIR`.
Bij de eerste start probeert de app een bestaande `profiles.json` uit de projectmap te importeren.

Bot-tokens (voor de Discord-integratie) en webhook-URL's worden bij opslag versleuteld via de beveiligde opslag van je besturingssysteem. Ze worden nergens anders heen verzonden dan rechtstreeks naar de Discord-API of naar je webhook-URL.

__**Deel geen cachebestanden of applicatiedatamappen.**__

## Gebruikstips
- Sjablonen vereisen een roosternaam, eventnaam en beschrijving voordat je verder kunt.
- Privégroepen kunnen alleen het toegangstype = Groep gebruiken.
- Duur gebruikt het formaat DD:HH:MM en is begrensd op 31 dagen.
- Tags zijn beperkt tot 5 en talen tot 3.
- Galerij-uploads zijn beperkt tot PNG/JPG, 64-2048 px, onder 10 MB en 64 afbeeldingen per account.
- VRChat beperkt event-aanmaak tot 10 evenementen per uur per persoon per groep.
- Sjablonen hebben de app draaiende nodig om automatisch te plaatsen. Series draaien na het aanmaken zelfstandig door.
- Featured Event en andere speciale toggles vereisen specifieke groepsrechten; de toggles verschijnen alleen als ze toegestaan zijn.

## Probleemoplossing
- **Inlogproblemen:** verwijder `cache.json` en log opnieuw in (gebruik de gegevensmap zoals weergegeven in Instellingen > Applicatie-info).
- **Groepen ontbreken in het dropdownmenu:** je account moet kalender-toegang hebben binnen de doelgroep. Heb je net aan VRChat-zijde rechten aangepast, klik dan **Resync** om de lijst te verversen.
- **Rate-limiting:** VRChat kan event-aanmaak vertragen. Wacht en probeer opnieuw; stop als meerdere pogingen mislukken. Klop niet eindeloos op de vernieuw- of aanmaakknoppen.
- **Serie-aanmaak gepauzeerd:** als VRChat een serie-aanmaak heeft afgekapt door een rate-limit, probeert de app het automatisch opnieuw. Het Roosters-tabblad toont wanneer de volgende poging is, met een knop "Nu opnieuw proberen" als je niet wilt wachten.
- **Updates:** sommige functies worden geblokkeerd zolang er een update klaarstaat. Download en start de nieuwste release.

## Disclaimer
- Dit project is niet gelieerd aan of goedgekeurd door VRChat. Gebruik op eigen risico.
- Talen zijn machinaal vertaald en kunnen onnauwkeurig zijn; draag gerust verbeteringen bij.

## Vereisten (vanaf de bron bouwen)
- Node.js 20+ (22.21.1 aanbevolen)
- npm
- Een VRChat-account met toestemming om in minstens één groep evenementen aan te maken

---

## Met dank aan
- [🌸potato🌸](https://x.com/potatovrc), Japanse vertalingen
- Garvas, Franse vertalingen
- Sometsuki, Portugese vertalingen
- Alle [GitHub-bijdragers](https://github.com/Cynacedia/VRC-Event-Creator/graphs/contributors)
