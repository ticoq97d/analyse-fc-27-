# Coach FC 27

Application web (pour iPhone) qui analyse tes matchs **EA Sports FC 27 Ultimate Team** à partir d'une photo de l'écran de statistiques de fin de match.

👉 **Ouvrir l'appli** : https://ticoq97d.github.io/analyse-fc-27-/

## Comment l'utiliser
1. Ouvre le lien dans **Safari** sur ton iPhone.
2. Touche **Partager** → **Sur l'écran d'accueil** → **Ajouter**.
3. Après un match, touche **Nouveau match** et photographie l'écran des statistiques (bien de face, sans reflet si possible).
4. Vérifie les chiffres (boutons − / +), indique si ton équipe est **à gauche (domicile)** ou **à droite (extérieur)**, choisis le mode et valide.

## Vie privée
- Tout reste **sur ton téléphone** : pas de compte, pas de serveur, aucune connexion à EA.
- La photo est lue sur le téléphone (Tesseract.js) puis effacée. Elle n'est jamais enregistrée dans ta galerie.
- **Réglages → Exporter** crée un fichier de sauvegarde ; **Importer** le recharge.

## Fonctionnalités
- Bilan victoires / nuls / défaites et buts, par mode (Rivals, Champions, Autre) et par semaine
- Courbes de progression (victoires, buts, xG, précision des passes, tirs cadrés)
- Conseils du coach calculés à partir de tes chiffres
- Bilan de la session du jour
- Mode démo avec de fausses données
- Fonctionne hors connexion une fois ouverte une première fois

## Technique (pour les curieux)
- HTML / CSS / JavaScript sans outil de compilation, hébergé par GitHub Pages.
- Lecture de texte : [Tesseract.js](https://github.com/naptha/tesseract.js) v5 (licence Apache 2.0), fichiers inclus dans `vendor/tesseract/`.
- Données : `localStorage` du navigateur.

*Application non officielle, sans lien avec Electronic Arts.*
