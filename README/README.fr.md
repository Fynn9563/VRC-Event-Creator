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
Un outil tout-en-un de création d'événements pour VRChat qui élimine la configuration répétitive.
Créez et enregistrez des modèles d'événements par groupe, générez des dates à venir à partir de motifs récurrents simples et préremplissez instantanément les détails - parfait pour planifier rapidement des rencontres hebdomadaires, des soirées de visionnage et des événements communautaires.

## Captures d'écran
<table>
  <tr>
    <td align="center">
      <img src=".imgs/1MP-Basics-Screenshot%202026-01-02%20230956.png" width="300" alt="Profils : modèles" />
      <br />
      Profils : modèles
    </td>
    <td align="center">
      <img src=".imgs/2MP-Schedule-Screenshot%202026-01-02%20231523.png" width="300" alt="Profils : règles de planification" />
      <br />
      Profils : règles de planification
    </td>
    <td align="center">
      <img src=".imgs/3CE-ProfileSelect-Screenshot%202026-01-02%20231634.png" width="300" alt="Création : choisir un profil" />
      <br />
      Création : choisir un profil
    </td>
  </tr>
  <tr>
    <td align="center">
      <img src=".imgs/4CE-DateSelect-Screenshot%202026-01-02%20231805.png" width="300" alt="Création : choisir une date" />
      <br />
      Création : choisir une date
    </td>
    <td align="center">
      <img src=".imgs/5CE-Review-Screenshot%202026-01-02%20231907.png" width="300" alt="Création : vérifier et valider" />
      <br />
      Création : vérifier et valider
    </td>
    <td align="center">
      <img src=".imgs/6S-ThemeStudio-Screenshot%202026-01-02%20232221.png" width="300" alt="Studio de thèmes : interface personnalisée" />
      <br />
      Studio de thèmes : interface personnalisée
    </td>
  </tr>
</table>

## Fonctionnalités
- Profils/modèles qui préremplissent les détails des événements par groupe.
- Générateur de récurrences avec liste des prochaines dates et option manuelle date/heure.
- Assistant de création d'événements pour les calendriers de groupe.
- Vue Modifier les événements pour les événements à venir (grille + fenêtre d'édition).
- Studio de thèmes avec préréglages et contrôle complet des couleurs UI (prend en charge #RRGGBBAA).
- Sélecteur et téléversement d'images de galerie pour les ID d'image.
- Localisation avec sélection de langue au premier lancement (en, fr, es, de, ja, zh, pt, ko, ru).

## Téléchargement
- Releases : https://github.com/Cynacedia/VRC-Event-Creator/releases
- L'exécutable portable Windows `.exe` fonctionne de façon autonome (aucun Node.js requis pour l'exécuter).

## Confidentialité et stockage des données
Votre mot de passe n'est pas stocké. Seuls les jetons de session sont mis en cache.
L'application stocke ses fichiers dans le répertoire de données utilisateur d'Electron (indiqué dans Paramètres > Informations sur l'application) :

- `profiles.json` (modèles de profils)
- `cache.json` (jetons de session)
- `settings.json` (email de contact)
- `themes.json` (préréglages de thèmes et couleurs personnalisées)

Vous pouvez remplacer le répertoire de données avec la variable d'environnement `VRC_EVENT_DATA_DIR`.
Au premier lancement, l'application tentera d'importer un `profiles.json` existant depuis le dossier du projet.

__**Ne partagez pas les fichiers de cache ni les dossiers de données de l'application.**__

## Notes d'utilisation
- Les profils nécessitent un nom de profil, un nom d'événement et une description avant de continuer.
- Un email de contact est requis au premier lancement pour l'usage de l'API VRChat.
- Les groupes privés ne peuvent utiliser que le type d'accès = Groupe.
- La durée utilise DD:HH:MM et est limitée à 31 jours.
- Les tags sont limités à 5 et les langues à 3.
- Les téléversements de galerie sont limités à PNG/JPG, 64-2048 px, moins de 10 Mo et 64 images par compte.
- VRChat n'autorise actuellement que 10 événements à venir à la fois.

## Dépannage
- Problèmes de connexion : supprimez `cache.json` et reconnectez-vous (utilisez le dossier de données indiqué dans Informations sur l'application).
- Groupes manquants : votre compte doit avoir accès au calendrier dans le groupe cible.
- Limitation de débit : VRChat peut limiter la création d'événements. Attendez et réessayez, et arrêtez si plusieurs tentatives échouent. Ne spammez pas les boutons d'actualisation ou de création d'événements.
- Mises à jour : Certaines fonctionnalités sont bloquées lorsqu'une mise à jour est en attente. Téléchargez et lancez la dernière version.

## Avertissement
- Ce projet n'est pas affilié à VRChat et n'est pas approuvé par VRChat. Utilisez-le à vos risques.
- Les langues sont traduites automatiquement et peuvent être inexactes ; merci de proposer des corrections.

## Prérequis (compilation depuis les sources)
- Node.js 20+ (22.21.1 recommandé)
- npm
- Un compte VRChat avec l'autorisation de créer des événements pour au moins un groupe
