# EuroPilot

> **Pilotez votre argent, jour après jour.**

EuroPilot est une application web **open source** de gestion financière personnelle en euros. Elle permet de suivre quotidiennement ses dépenses et revenus, de tenir des budgets, de gérer plusieurs comptes et d'obtenir automatiquement des **bilans mensuels et annuels** (par année civile).

- 🔒 **100 % locale** : les données restent dans le navigateur (`localStorage`). Aucun serveur, aucune inscription, aucune clé API, aucun traceur.
- ⚡ **Rapide et hors ligne** : site statique + service worker, installable comme une application (PWA).
- 🆓 **Gratuit et libre** : licence MIT, hébergeable gratuitement sur GitHub Pages.
- 🇫🇷 **Formats français** : `1 250,50 €`, dates `JJ/MM/AAAA`, semaine commençant le lundi.

---

## Sommaire

1. [Fonctionnalités](#fonctionnalités)
2. [Installation et lancement local](#installation-et-lancement-local)
3. [Déploiement sur GitHub Pages](#déploiement-sur-github-pages)
4. [Application Android (APK) avec Capacitor](#application-android-apk-avec-capacitor)
5. [Synchronisation Famille (par code partagé)](#synchronisation-famille-par-code-partage)
6. [Fonctionnement](#fonctionnement)
7. [Architecture du code](#architecture-du-code)
8. [Sauvegarde des données](#sauvegarde-des-données)
9. [Contribuer](#contribuer)
10. [Licence](#licence)

---

## Fonctionnalités

| Module | Détails |
|---|---|
| **Tableau de bord** | Solde actuel, revenus/dépenses du mois, reste à vivre, moyenne quotidienne, revenus/dépenses de l'année, évolution vs mois précédent, graphiques revenus/dépenses et par catégorie, principales catégories, budgets du mois, dernières opérations. |
| **Famille** | Synchronisation **optionnelle et ultra simple** par code `EURO-XXXX` : ID de salon + clé AES-GCM 256 (PBKDF2 120k). Données chiffrées côté téléphone, aucun compte Google. Backend au choix : **Firebase Realtime Database** (par défaut, gratuit, voir `FIREBASE_SETUP.md`) ou **Worker Cloudflare 1-clic** (`worker/worker.js`, `WORKER_SETUP.md`) ou **Supabase** (`SUPABASE_SETUP.md`) — ancien `kvdb.io` remplacé (403/500). Fallback QR/lien/fichier hors ligne, *last-write-wins* sur `updatedAt`, auto-sync 2 s. |
| **Transactions** | Ajout rapide (date, montant, type, catégorie, sous-catégorie, description, moyen de paiement, compte, récurrence, note). Recherche instantanée et filtres : période, année, mois, dates personnalisées, type, catégorie, compte, moyen de paiement, montant min/max. Suivi mensuel avec dépenses par catégorie et comparaison avec les mois précédents. Export CSV/JSON de la sélection. |
| **Calendrier** | Vue mensuelle avec total quotidien, carte de chaleur des dépenses, détail des opérations du jour sélectionné, ajout direct à une date. |
| **Budgets** | Budget mensuel par catégorie : *Budget / Dépensé / Reste*, barre de progression, alertes visuelles à 80 % et au dépassement, reste par jour. |
| **Récurrences** | Opérations récurrentes hebdomadaires, mensuelles, annuelles ou personnalisées (tous les N jours), avec date de fin optionnelle. Génération automatique à l'ouverture de l'application. Estimation des charges fixes mensuelles. |
| **Statistiques** | Graphiques interactifs : dépenses par catégorie, dépenses mensuelles, revenus vs dépenses, évolution du solde, répartition annuelle, évolution de chaque catégorie, empilement catégories × mois. |
| **Comptes** | Comptes multiples (courant, épargne, espèces…) avec solde initial, solde courant, solde prévisionnel, évolution sur 12 mois et historique. |
| **Années** | Bilan par année civile : revenus, dépenses, épargne, taux d'épargne, moyennes mensuelle et quotidienne, dépenses par catégorie, tableau janvier → décembre avec cumul, comparaison avec les années précédentes. |
| **Paramètres** | Thème clair/sombre/auto, catégories et sous-catégories personnalisables, moyens de paiement, import CSV, export CSV/JSON, sauvegarde et restauration complètes, données de démonstration, suppression définitive. |
| **UX** | Responsive ordinateur/tablette/mobile, barre de navigation mobile avec bouton « + » central, saisie au pouce, confirmations avant suppression, **annulation** (bouton ↶ ou `Ctrl+Z`), raccourci `N` pour une nouvelle opération. |

---

## Installation et lancement local

EuroPilot est un site **100 % statique** : aucune dépendance, aucun build.

```bash
git clone https://github.com/onerstyle/EuroPilot.git
cd EuroPilot
```

Comme l'application utilise des modules JavaScript (`type="module"`), il faut la servir via HTTP (pas en `file://`). Au choix :

```bash
# Python
python3 -m http.server 8080

# Node.js
npx serve .

# PHP
php -S localhost:8080
```

Puis ouvrez <http://localhost:8080/> (page d'accueil) ou <http://localhost:8080/app.html> (application).

---

## Déploiement sur GitHub Pages

Le dépôt contient un workflow GitHub Actions (`.github/workflows/deploy.yml`) qui publie automatiquement le site à **chaque push sur `main`**.

1. Créez un dépôt GitHub nommé **`EuroPilot`** et poussez le code.
2. Dans le dépôt : **Settings → Pages → Build and deployment → Source : GitHub Actions**.
3. Poussez sur `main` (ou lancez le workflow manuellement dans l'onglet *Actions*).
4. L'application est disponible sur `https://<votre-utilisateur>.github.io/EuroPilot/`.

Tous les chemins sont relatifs : le site fonctionne aussi bien à la racine d'un domaine que dans un sous-dossier. Le fichier `.nojekyll` désactive le traitement Jekyll.

---

## Application Android (APK) avec Capacitor

EuroPilot est empaqueté en application Android native avec [Capacitor 6](https://capacitorjs.com/) : le site statique est embarqué dans un WebView, sans serveur ni connexion réseau. L'APK se construit localement ou via GitHub Actions.

### Prérequis

- **Node.js 20** (ou plus récent) et npm ;
- **Java 21** (Temurin recommandé) ;
- **Android Studio** (SDK Android 35 inclus) pour ouvrir le projet natif et brancher un appareil.

```bash
npm install          # installe Capacitor (+ sharp pour les icônes)
npm run sync:www     # copie les assets web dans www/
npx cap sync android # copie www/ dans le projet Android + met à jour Gradle
npm run open:android # ouvre android/ dans Android Studio
```

### Scripts utiles

| Commande | Effet |
|---|---|
| `npm run sync:www` | Régénère `www/` (copie de `index.html`, `app.html`, `manifest.webmanifest`, `sw.js`, `css/`, `js/`, `assets/`). |
| `npm run copy` | `sync:www` puis `npx cap copy` (toutes plateformes). |
| `npm run sync` | `sync:www` puis `npx cap sync`. |
| `npm run build:android` | `sync:www` + `cap copy android` + `cap sync android` : le projet Android est à jour. |
| `npm run open:android` | Ouvre le projet natif dans Android Studio. |
| `npm run android:debug` | `cd android && ./gradlew assembleDebug` → APK dans `android/app/build/outputs/apk/debug/`. |
| `npm run android:release` | `./gradlew assembleRelease` (nécessite une signature pour être installable). |
| `npm run android:bundle` | `./gradlew bundleRelease` (AAB pour le Play Store). |
| `npm run icons` | Régénère icônes (`mipmap-*`) et écrans de démarrage (`drawable*/splash.png`) depuis `assets/icon.svg`, avec sharp. |

Après toute modification du code web, relancez `npm run build:android` (ou `npx cap copy android`) avant de reconstruire l'APK : Capacitor ne surveille pas les fichiers, il les copie.

### Workflow GitHub Actions (APK automatique)

Le workflow `.github/workflows/android.yml` construit l'APK de debug :

- **Déclencheurs** : push sur `main` touchant le web (`www/`, `*.html`, `css/`, `js/`, `assets/`, `manifest.webmanifest`, `sw.js`), la config Capacitor ou le projet `android/` ; pull requests sur ces mêmes chemins ; lancement manuel (*workflow_dispatch*).
- **Étapes** : checkout → Node 20 (cache npm) → `npm ci` → `npm run sync:www` → `npx cap sync android` → JDK 21 (Temurin) → SDK Android → `./gradlew assembleDebug` → artifact **`europilot-debug-apk`** (téléchargeable depuis l'onglet *Actions*, valable 30 jours).
- La partie **AAB release** (`bundleRelease`) est présente mais commentée : elle nécessite un keystore de signature.

### Structure du projet Capacitor

```
EuroPilot/
├── capacitor.config.json   # appId fr.europilot.app, webDir www/, schéma https, splash bleue
├── package.json            # scripts sync/copy/build/android + dépendances Capacitor 6
├── scripts/generate-icons.mjs  # génère icônes & splashs Android depuis assets/icon.svg
├── www/                    # COPIE des assets web servant de source au WebView (non versionnée)
└── android/                # projet natif Gradle (versionné), généré par `npx cap add android`
    ├── app/src/main/assets/public/   # copie de www/ faite par `cap copy` (non versionnée)
    ├── app/src/main/java/fr/europilot/app/MainActivity.java
    ├── app/src/main/res/             # icônes mipmap-*, splashs, couleurs de la marque
    └── gradlew                       # wrapper Gradle 8.11.1 (AGP 8.7.3, JDK 21, SDK 35)
```

Points d'attention :

- **`www/` et `android/app/src/main/assets/public/` ne sont pas versionnés** : ils sont régénérés par `npm run sync:www` puis `cap copy` (localement comme dans le workflow). Le projet Gradle (`android/`), lui, est versionné.
- **Page d'entrée** : dans l'APK, `index.html` (page de présentation) redirige immédiatement vers `app.html` ; sur le web, le comportement est inchangé.
- **Service worker** : désactivé dans l'APK (les fichiers sont déjà embarqués), il reste actif sur le web pour le mode hors ligne.
- **Icônes adaptatives** : fond `#2563eb` (`values/ic_launcher_background.xml`) + premier plan `ic_launcher_foreground.png` (glyphe « € » blanc) ; icônes legacy et rondes déclinées en mdpi→xxxhdpi.

---

## Synchronisation Famille (par code partagé)

EuroPilot reste **100 % local par défaut**. La synchronisation Famille est **100 % optionnelle**, ne demande **aucun compte Google ni Client ID**, et centralise les données pour les alimenter **à plusieurs** avec un seul code.

### Principe

- Un **code court** `EURO-XXXX` (4 lettres A-Z, ex: `EURO-8K2P`) est l'**ID du salon** + la **clé de chiffrement**. Le créateur le partage à sa famille (copier, lien, QR code) ; chaque membre le saisit une fois → même salon, même budget.
- **Chiffrement de bout en bout côté téléphone** : AES-GCM 256, clé dérivée du code par PBKDF2 (120 000 itérations, sel aléatoire 16 octets, IV 12 octets). Le serveur ne stocke que du `base64` illisible sans le code.
- **Backend par défaut : Firebase** (`FIREBASE_SETUP.md` : console.firebase.google.com → Realtime Database europe-west1, test mode → `https://xxx.firebasedatabase.app/family`) — **alternatives 1-clic** : **Worker Cloudflare** (`WORKER_SETUP.md`) ou **Supabase** (`SUPABASE_SETUP.md`). Anciens `kvdb.io`/`keyvalue` conservés en fallback. Config live sans rebuild : `F12` → `localStorage.setItem('europilot.family.endpoint','https://xxx.workers.dev')` + `location.reload()` — ou éditer `js/family-sync-config.js` / `globalThis.__EUROPILOT_FAMILY_ENDPOINT__`. Mettre à `""` désactive le cloud (QR/fichier uniquement).
- **Résolution de conflit** : *last-write-wins* sur `updatedAt` (seuil 5 s). Pas de merge ligne-à-ligne : tout le fichier est remplacé.
- **Hors ligne** : l'app fonctionne sans réseau ; la synchro sera retentée à la reconnexion. Un **partage manuel de secours** (QR / lien / fichier chiffré) reste disponible même sans backend.

### Configuration (30 s, une seule fois)

1. Sur un téléphone : **Paramètres → 👨‍👩‍👧‍👦 Synchronisation Famille → ✨ Créer un salon** → un code `EURO-XXXX` apparaît.
2. **Copier le code / Partager le lien / QR** et l'envoyer à ton/ta partenaire (SMS, WhatsApp…).
3. Sur son téléphone : **Paramètres → Famille → Rejoindre un salon** → coller le code → **Synchroniser maintenant**.
4. C'est tout — utilisez le **même code sur tous les appareils** qui doivent partager le même budget. L'auto-sync s'occupe du reste.

> Backend : **Firebase** (`FIREBASE_SETUP.md`) : `https://xxx-default-rtdb.europe-west1.firebasedatabase.app/family` → `F12: localStorage.setItem('europilot.family.endpoint','https://xxx.firebasedatabase.app/family');location.reload()`. **Worker** : `WORKER_SETUP.md` → `https://xxx.workers.dev`. **Supabase** : `SUPABASE_SETUP.md`. En dur : `js/family-sync-config.js`. Surcharge volatile : `globalThis.__EUROPILOT_FAMILY_ENDPOINT__`.

### Utilisation

Dans **Paramètres → 👨‍👩‍👧‍👦 Synchronisation Famille** :

| Action | Effet |
|---|---|
| **✨ Créer un salon** | Génère un code `EURO-XXXX` et l'enregistre localement. |
| **👋 Rejoindre un salon** | Saisissez le code reçu → rejoint le salon existant (puis sync). |
| **🔄 Synchroniser maintenant** | Compare `updatedAt` local vs salon : pousse si plus récent, tire si distant plus récent. |
| **⬆ Envoyer / ⬇ Restaurer** | Force un *push* (écrase le salon) ou un *pull* (écrase le local, avec confirmation). |
| **📋 Copier / 🔗 Partager / 📷 QR** | Partage le code ou un lien `…#family=EURO-XXXX` (QR via `api.qrserver.com`). |
| **💾 Exporter fichier chiffré / 📥 Importer** | Secours hors ligne : exporte un `.txt` base64 chiffré (ou QR) importable même sans réseau. |
| **Synchronisation automatique** | Si cochée, envoie 2 s après chaque modification (debounce). |
| **🚪 Quitter le salon** | Efface localement le code ; les données restent, plus de sync jusqu'au prochain code. |

Un **point coloré** dans l'en-tête indique l'état Famille : `🟢 salon actif`, `🔵 synchro…`, `⚪ aucun salon`.

### Sécurité & vie privée

- Le **code n'est jamais envoyé en clair comme clé** : seule la donnée chiffrée (`iv:salt:ciphertext` en base64) transite. Sans le code, le contenu est indéchiffrable.
- Le backend (Worker/Supabase/`kvdb.io`) n'a **aucune authentification** autre que la connaissance du code : choisissez un code non devinable et ne le publiez pas publiquement. Pour plus de contrôle, déployez votre propre Worker avec authentification.
- La **taille** est limitée (~1 Mo) : suffisant pour des milliers de transactions ; au-delà, utilisez la sauvegarde JSON manuelle.
- Vous pouvez à tout moment **exporter une sauvegarde non chiffrée** (`Paramètres → Sauvegarde complète`) et l'archiver.

### Limites connues

- Pas de fusion ligne-à-ligne : tout le fichier est remplacé (dernier écrit gagne). Évitez de modifier exactement la même transaction simultanément sur deux téléphones sans synchroniser entre temps.
- `kvdb.io` est un service gratuit sans SLA ; pour une famille dépendante de la sync, préférez un backend perso (Supabase/Firebase) — un Worker Cloudflare de 30 lignes suffit.
- L'APK Android utilise le même code : aucune étape OAuth, aucun popup bloqué.

---

## Fonctionnement

### Première utilisation
À l'ouverture, un bandeau propose d'ajouter une première opération ou de charger un **jeu de données de démonstration** (18 mois fictifs) pour découvrir l'interface. Les données de démo se suppriment depuis *Paramètres → Zone dangereuse* (ou via ↶ juste après le chargement).

### Ajouter une opération
Bouton **« + Nouvelle transaction »** (ordinateur), bouton **« + »** central de la barre mobile, touche **`N`**, ou clic sur un jour du calendrier. Le montant accepte `12,50` comme `12.50`. Cocher « Rendre cette opération récurrente » crée une récurrence mensuelle.

### Récurrences
Chaque récurrence possède une **prochaine échéance**. À chaque ouverture, EuroPilot crée les opérations dont l'échéance est passée, puis avance la date. Les opérations générées portent le badge ↻ et restent modifiables individuellement.

### Comptes et solde
Le solde d'un compte = solde initial + revenus − dépenses (jusqu'à aujourd'hui). Le « solde total » de l'en-tête est la somme de tous les comptes. Un virement entre comptes se saisit comme une dépense sur le compte source et un revenu sur le compte cible (ou via la catégorie *Épargne*).

### Confidentialité
Les données sont stockées dans `localStorage` sous la clé `europilot.data.v1`. Rien n'est envoyé sur le réseau. Le service worker ne fait que mettre en cache les fichiers de l'application pour le mode hors ligne.

---

## Architecture du code

Vanilla **HTML5 / CSS3 / JavaScript ES2022** (modules natifs), sans framework ni bundler : le code est lisible directement dans le navigateur et déployable tel quel.

```
EuroPilot/
├── index.html                # Page d'accueil (présentation)
├── app.html                  # Application (coquille : barre latérale, en-tête, navigation mobile)
├── manifest.webmanifest      # PWA
├── sw.js                     # Service worker (cache hors ligne)
├── css/style.css             # Styles, thèmes clair/sombre, responsive
├── assets/icon.svg
├── js/
│   ├── main.js               # Point d'entrée : routeur (#/vue), navigation, thème, raccourcis
│   ├── store.js              # État + persistance localStorage, pile d'annulation, calculs (totaux, soldes…) + updatedAt / family
│   ├── family-sync.js        # Synchronisation Famille par code (PBKDF2+AES-GCM, kvdb.io, last-write-wins, auto-sync)
│   ├── family-sync-config.js # Endpoint remplaçable (FAMILY_SYNC_ENDPOINT / __EUROPILOT_FAMILY_ENDPOINT__)
│   ├── defaults.js           # Catégories, comptes, moyens de paiement et fréquences par défaut
│   ├── utils.js              # Formats FR (euros, dates), utilitaires dates/DOM
│   ├── ui.js                 # Modales, toasts, confirmations, formulaire de transaction, lignes de liste
│   ├── charts.js             # Graphiques SVG maison (barres, courbes, anneau, barres horizontales)
│   ├── recurring.js          # Génération des opérations récurrentes
│   ├── io.js                 # Import/export CSV & JSON, sauvegarde/restauration
│   ├── demo.js               # Données de démonstration
│   └── views/                # Une vue = un module exportant render(root, { navigate, params })
│       ├── dashboard.js
│       ├── transactions.js
│       ├── calendar.js
│       ├── budgets.js        # Budgets + récurrences
│       ├── stats.js
│       ├── accounts.js
│       ├── years.js
│       └── settings.js       # Paramètres + panneau 👨‍👩‍👧‍👦 Famille
├── .github/workflows/deploy.yml  # Déploiement GitHub Pages
├── .github/workflows/android.yml # Construction de l'APK Android (artifact)
├── capacitor.config.json         # Configuration Capacitor (appId, webDir, splash)
├── package.json                  # Scripts npm + dépendances Capacitor 6 / sharp
├── scripts/generate-icons.mjs    # Génère icônes & splashs Android (sharp)
├── android/                      # Projet natif Android Gradle (Capacitor 6)
├── LICENSE                   # MIT
└── README.md
```

### Flux de données
1. Les vues lisent l'état via `store.state` et les helpers (`store.byMonth`, `store.totals`, `store.expensesByCategory`, `store.accountBalance`…).
2. Toute modification passe par une méthode du store (`addTransaction`, `setBudget`, `saveRecurring`…), qui **enregistre un instantané pour l'annulation**, sauvegarde dans `localStorage` et notifie les abonnés.
3. `main.js` est abonné au store et **re-rend la vue courante** à chaque changement.

### Modèle de données
```js
{
  version: 1,
  updatedAt: '2026-09-28T12:00:00.000Z', // pour conflit Famille (last-write-wins)
  transactions: [{ id, date: 'AAAA-MM-JJ', amount, type: 'expense'|'income', categoryId, sub, description, paymentId, accountId, recurringId, note }],
  categories:   [{ id, name, icon, color, type, subs: [] }],
  accounts:     [{ id, name, icon, color, initialBalance }],
  payments:     [{ id, name, icon }],
  budgets:      { [categoryId]: montantMensuel },
  recurring:    [{ id, label, amount, type, categoryId, paymentId, accountId, frequency, interval, startDate, endDate, nextDate, active }],
  settings:     { theme, defaultAccount, defaultPayment, onboarded, family: { code, lastSync, autoSync } }
}
```

---

## Sauvegarde des données

Les données étant locales au navigateur, **exportez régulièrement une sauvegarde** (avant de changer d'appareil, de navigateur, ou de vider le cache).

- **Paramètres → Sauvegarde complète (JSON)** : exporte tout (transactions, comptes, catégories, budgets, récurrences, paramètres).
- **Paramètres → Restaurer une sauvegarde** : recharge un fichier de sauvegarde (remplace les données actuelles, annulable via ↶).
- **Export CSV / JSON** : transactions seules (depuis Paramètres, ou la sélection filtrée depuis Transactions).
- **Import CSV** : colonnes reconnues par leur en-tête — `Date`, `Type`, `Montant`, `Catégorie`, `Sous-catégorie`, `Description`, `Moyen de paiement`, `Compte`, `Note`. Séparateur `;` ou `,`, dates `JJ/MM/AAAA` ou `AAAA-MM-JJ`, montants `12,50` ou `12.50`. Sans colonne *Type*, un montant négatif est une dépense et un montant positif… une dépense aussi (relevé de dépenses) ; ajoutez une colonne *Type* (`Revenu`/`Dépense`) pour importer des revenus. Les catégories inconnues sont créées automatiquement.
- **Suppression définitive** : *Paramètres → Zone dangereuse*, avec double confirmation.

---

## Contribuer

Les contributions sont les bienvenues !

1. Forkez le dépôt et créez une branche : `git checkout -b feature/ma-fonctionnalite`.
2. Respectez le style existant : modules ES, code commenté en français, pas de dépendance externe obligatoire, aucune donnée envoyée sur le réseau.
3. Testez localement (`python3 -m http.server`) sur ordinateur et mobile, en thème clair et sombre.
4. Ouvrez une *pull request* décrivant le changement.

Idées : import de formats bancaires (OFX/QIF), objectifs d'épargne, pièces jointes, chiffrement optionnel de la sauvegarde, traductions.

---

## Licence

Distribué sous licence **MIT** — voir [LICENSE](LICENSE). Vous êtes libre d'utiliser, modifier et redistribuer EuroPilot.
