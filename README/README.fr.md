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

Un outil tout-en-un de création d'événements pour VRChat qui élimine la configuration répétitive.
Créez et enregistrez des modèles d'événements par groupe, générez des dates à venir à partir de motifs récurrents simples et préremplissez instantanément les détails. Parfait pour planifier rapidement des rencontres hebdomadaires, des soirées de visionnage et des événements communautaires.

<p align="center">
  <img src=".imgs/1MP-CE_CreationFlow-01-05-26.gif" width="900" alt="Flux de création d'événements (modèle vers publication)" />
</p>

## Modèles et séries natives, côte à côte

VRChat propose désormais sa propre fonctionnalité d'événements récurrents. Elle convient bien aux événements stables et répétitifs : une fois la série créée, VRChat la maintient tout seul sans que l'application ait besoin d'être lancée, et l'ensemble du cycle est annoncé en une seule fois au moment de la création. Modifier une série en cours dans VRChat suppose normalement de la supprimer puis de la recréer ; cette application gère cette étape pour vous lorsque vous changez le planning, l'opération ressemble donc à une simple modification. Le revers, c'est qu'il n'y a pas d'annonces par occurrence : les ajustements faits ensuite sur des événements individuels risquent de passer inaperçus auprès de votre communauté.

Les modèles fonctionnent autrement. Le flux principal reste manuel : vous créez un événement à la fois, le modèle préremplissant le formulaire pour vous éviter de retaper les détails à chaque fois. À partir de là, une automatisation optionnelle peut continuer à publier les prochains événements selon un calendrier, chaque publication s'accompagnant de sa propre annonce afin que votre communauté soit informée des prochaines dates. Les modifications apportées à un événement en attente seront annoncées au moment où la publication est faite, donc les changements de dernière minute ne passent pas inaperçus. Le revers : la publication automatique exige que l'application soit en cours d'exécution.

Les deux cohabitent dans le même onglet **Gérer les plannings**. Vous pouvez utiliser l'un, l'autre ou les deux dans un même groupe, selon ce qui convient à l'événement.

## Fonctionnalités
- Modèles qui préremplissent les détails des événements par groupe (avec automatisation optionnelle pour publier selon un calendrier).
- Générateur de récurrences avec liste des prochaines dates et option manuelle date/heure.
- Prise en charge des séries natives VRChat, en complément des modèles.
- Automatisation d'événements : publie les événements à partir des motifs des modèles tant que l'application est lancée.
- Vue Modifier les événements pour les événements à venir (grille + fenêtre d'édition, avec filtres et plage temporelle ajustable).
- Assistant de création d'événements pour les calendriers de groupe.
- Studio de thèmes avec préréglages et contrôle complet des couleurs UI (prend en charge #RRGGBBAA).
- Localisation avec sélection de langue au premier lancement (en, fr, es, de, ja, zh, pt, ko, ru, nl).
- Sélecteur et téléversement d'images de galerie pour les ID d'image.
- Démarrage au lancement du système + réduction dans la zone de notification.
- Protection mono-instance pour éviter les doubles lancements.

### Intégrations optionnelles (Options avancées)

Désactivées par défaut, elles nécessitent chacune leur propre configuration. Une fois configurées, chacune se règle indépendamment par modèle et par événement :

- **Discord :** crée automatiquement des événements programmés Discord en parallèle des événements VRChat. Nécessite la création d'un bot Discord et son invitation sur votre serveur. ([Guide de configuration](Discord%20Setup/DISCORD_SETUP.fr.md))
- **Calendrier :** génère des fichiers `.ics` avec rappels, livrés via un webhook Discord ou enregistrés localement. ([Guide de configuration](Calendar%20Setup/CALENDAR_SETUP.fr.md))
- **EC Kit** (licence payante) : personnalisation de l'identité du webhook par groupe (nom affiché, avatar, couleur d'embed) et messages personnalisés avec pièces jointes par événement. ([Ko-fi](https://ko-fi.com/s/0735ce5375) · [Licence](https://eckit-worker.cynacedia.workers.dev/license/v1.0))

## Téléchargement
- Releases : https://github.com/Cynacedia/VRC-Event-Creator/releases

## Confidentialité et stockage des données
Votre mot de passe n'est pas stocké. Seuls les jetons de session sont mis en cache.
L'application stocke ses fichiers dans le répertoire de données utilisateur d'Electron (indiqué dans Paramètres > Informations sur l'application) :

- `profiles.json` (modèles d'événements et configuration des intégrations par groupe)
- `series.json` (séries VRChat natives suivies localement)
- `cache.json` (jetons de session)
- `settings.json` (paramètres de l'application)
- `themes.json` (préréglages de thèmes et couleurs personnalisées)
- `pending-events.json` (file d'attente d'automatisation)
- `automation-state.json` (suivi de l'automatisation)
- `pending-rasterize.json` (créations de séries en file d'attente après une limitation de débit)

Vous pouvez remplacer le répertoire de données avec la variable d'environnement `VRC_EVENT_DATA_DIR`.
Au premier lancement, l'application tentera d'importer un `profiles.json` existant depuis le dossier du projet.

Les tokens de bot (pour l'intégration Discord) et les URL de webhook sont chiffrés au repos à l'aide du stockage sécurisé de votre système d'exploitation. Ils ne sont jamais envoyés ailleurs que directement à l'API Discord ou à votre URL de webhook.

__**Ne partagez pas les fichiers de cache ni les dossiers de données de l'application.**__

## Notes d'utilisation
- Les modèles nécessitent un nom de planning, un nom d'événement et une description avant de continuer.
- Les groupes privés ne peuvent utiliser que le type d'accès = Groupe.
- La durée utilise DD:HH:MM et est limitée à 31 jours.
- Les tags sont limités à 5 et les langues à 3.
- Les téléversements de galerie sont limités à PNG/JPG, 64-2048 px, moins de 10 Mo et 64 images par compte.
- VRChat limite la création d'événements à 10 événements par heure par personne par groupe.
- Les modèles ont besoin que l'application soit lancée pour publier automatiquement. Les séries, une fois créées, fonctionnent toutes seules.
- Featured Event et d'autres commutateurs spéciaux nécessitent des permissions de groupe spécifiques ; les commutateurs n'apparaissent que lorsqu'ils sont autorisés.

## Dépannage
- **Problèmes de connexion :** supprimez `cache.json` et reconnectez-vous (utilisez le dossier de données indiqué dans Paramètres > Informations sur l'application).
- **Groupes manquants dans la liste :** votre compte doit avoir accès au calendrier dans le groupe cible. Si vous venez d'ajuster les permissions côté VRChat, cliquez sur **Resync** pour rafraîchir la liste.
- **Limitation de débit :** VRChat peut limiter la création d'événements. Attendez et réessayez, et arrêtez si plusieurs tentatives échouent. Ne spammez pas les boutons d'actualisation ou de création d'événements.
- **Création de série en pause :** si VRChat a appliqué une limitation à la création d'une série, la tentative reprendra automatiquement. L'onglet Plannings indique le moment de la prochaine tentative et propose un bouton « Réessayer maintenant » si vous ne voulez pas attendre.
- **Mises à jour :** Certaines fonctionnalités sont bloquées lorsqu'une mise à jour est en attente. Téléchargez et lancez la dernière version.

## Avertissement
- Ce projet n'est pas affilié à VRChat et n'est pas approuvé par VRChat. Utilisez-le à vos risques.
- Les langues sont traduites automatiquement et peuvent être inexactes ; merci de proposer des corrections.

## Prérequis (compilation depuis les sources)
- Node.js 20+ (22.21.1 recommandé)
- npm
- Un compte VRChat avec l'autorisation de créer des événements pour au moins un groupe

---

## Remerciements
- [🌸potato🌸](https://x.com/potatovrc), traductions japonaises
- Garvas, traductions françaises
- Sometsuki, traductions portugaises
- Tous les [contributeurs GitHub](https://github.com/Cynacedia/VRC-Event-Creator/graphs/contributors)
