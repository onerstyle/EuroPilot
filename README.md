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
4. [Fonctionnement](#fonctionnement)
5. [Architecture du code](#architecture-du-code)
6. [Sauvegarde des données](#sauvegarde-des-données)
7. [Contribuer](#contribuer)
8. [Licence](#licence)

---

## Fonctionnalités

| Module | Détails |
|---|---|
| **Tableau de bord** | Solde actuel, revenus/dépenses du mois, reste à vivre, moyenne quotidienne, revenus/dépenses de l'année, évolution vs mois précédent, graphiques revenus/dépenses et par catégorie, principales catégories, budgets du mois, dernières opérations. |
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
│   ├── store.js              # État + persistance localStorage, pile d'annulation, calculs (totaux, soldes…)
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
│       └── settings.js
├── .github/workflows/deploy.yml  # Déploiement GitHub Pages
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
  transactions: [{ id, date: 'AAAA-MM-JJ', amount, type: 'expense'|'income', categoryId, sub, description, paymentId, accountId, recurringId, note }],
  categories:   [{ id, name, icon, color, type, subs: [] }],
  accounts:     [{ id, name, icon, color, initialBalance }],
  payments:     [{ id, name, icon }],
  budgets:      { [categoryId]: montantMensuel },
  recurring:    [{ id, label, amount, type, categoryId, paymentId, accountId, frequency, interval, startDate, endDate, nextDate, active }],
  settings:     { theme, defaultAccount, defaultPayment, onboarded }
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
