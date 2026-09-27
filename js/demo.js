// ============================================================
// demo.js — Jeu de données fictives pour découvrir l'application
// (18 mois d'historique, généré localement, pseudo-aléatoire déterministe)
// ============================================================

import { store } from './store.js';
import { toISO, daysInMonth, round2 } from './utils.js';

/** Générateur pseudo-aléatoire déterministe (même démo à chaque fois) */
function rng(seed) { let s = seed; return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; }

export function loadDemo() {
  const rand = rng(42);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const between = (a, b) => round2(a + rand() * (b - a));
  const list = [];
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 17, 1);

  for (let d = new Date(start); d <= now; d.setDate(d.getDate() + 1)) {
    const iso = toISO(d); const day = d.getDate(); const dow = d.getDay(); const dim = daysInMonth(d.getFullYear(), d.getMonth() + 1);
    // Revenus fixes
    if (day === 1) list.push({ date: iso, amount: 2650, type: 'income', categoryId: 'salaire', sub: 'Salaire net', description: 'Salaire', paymentId: 'virement', accountId: 'courant' });
    if (day === 5 && rand() < 0.6) list.push({ date: iso, amount: 180, type: 'income', categoryId: 'aides', sub: 'CAF', description: 'Allocation CAF', paymentId: 'virement', accountId: 'courant' });
    // Charges fixes
    if (day === 2) list.push({ date: iso, amount: 850, type: 'expense', categoryId: 'logement', sub: 'Loyer', description: 'Loyer appartement', paymentId: 'prelevement', accountId: 'courant' });
    if (day === 3) list.push({ date: iso, amount: 45.9, type: 'expense', categoryId: 'assurances', sub: 'Habitation', description: 'Assurance habitation', paymentId: 'prelevement', accountId: 'courant' });
    if (day === 8) list.push({ date: iso, amount: 19.99, type: 'expense', categoryId: 'abonnements', sub: 'Téléphone', description: 'Forfait mobile', paymentId: 'prelevement', accountId: 'courant' });
    if (day === 10) list.push({ date: iso, amount: 34.99, type: 'expense', categoryId: 'abonnements', sub: 'Internet', description: 'Box Internet', paymentId: 'prelevement', accountId: 'courant' });
    if (day === 12) list.push({ date: iso, amount: 13.49, type: 'expense', categoryId: 'abonnements', sub: 'Streaming', description: 'Netflix', paymentId: 'cb', accountId: 'courant' });
    if (day === 15) list.push({ date: iso, amount: between(60, 110), type: 'expense', categoryId: 'logement', sub: 'Électricité', description: 'Facture électricité', paymentId: 'prelevement', accountId: 'courant' });
    if (day === 20) list.push({ date: iso, amount: 300, type: 'expense', categoryId: 'epargne', sub: 'Livret A', description: 'Virement épargne', paymentId: 'virement', accountId: 'courant' });
    if (day === 28) list.push({ date: iso, amount: 62.5, type: 'expense', categoryId: 'assurances', sub: 'Auto', description: 'Assurance auto', paymentId: 'prelevement', accountId: 'courant' });
    if (day === dim && d.getMonth() === 8) list.push({ date: iso, amount: 1240, type: 'expense', categoryId: 'impots', sub: 'Impôt sur le revenu', description: 'Impôt sur le revenu', paymentId: 'prelevement', accountId: 'courant' });
    // Dépenses variables
    if (dow === 6 || rand() < 0.25) list.push({ date: iso, amount: between(18, 85), type: 'expense', categoryId: 'alimentation', sub: 'Courses', description: pick(['Courses Carrefour', 'Courses Lidl', 'Courses Leclerc', 'Marché']), paymentId: 'cb', accountId: 'courant' });
    if (rand() < 0.2) list.push({ date: iso, amount: between(8, 45), type: 'expense', categoryId: 'restaurants', sub: pick(['Restaurant', 'Fast-food', 'Café']), description: pick(['Déjeuner', 'Dîner entre amis', 'Café', 'Pizza']), paymentId: pick(['cb', 'especes']), accountId: pick(['courant', 'courant', 'especes']) });
    if (rand() < 0.1) list.push({ date: iso, amount: between(45, 75), type: 'expense', categoryId: 'carburant', sub: 'Essence', description: 'Plein essence', paymentId: 'cb', accountId: 'courant' });
    if (rand() < 0.08) list.push({ date: iso, amount: between(10, 60), type: 'expense', categoryId: 'loisirs', sub: pick(['Cinéma', 'Sport', 'Livres']), description: pick(['Cinéma', 'Salle de sport', 'Librairie', 'Concert']), paymentId: 'cb', accountId: 'courant' });
    if (rand() < 0.05) list.push({ date: iso, amount: between(20, 90), type: 'expense', categoryId: 'vetements', sub: 'Vêtements', description: pick(['Zara', 'Decathlon', 'H&M']), paymentId: 'cb', accountId: 'courant' });
    if (rand() < 0.05) list.push({ date: iso, amount: between(15, 40), type: 'expense', categoryId: 'sante', sub: 'Pharmacie', description: 'Pharmacie', paymentId: 'cb', accountId: 'courant' });
    if (rand() < 0.04) list.push({ date: iso, amount: between(15, 40), type: 'income', categoryId: 'remboursements', sub: 'Sécurité sociale', description: 'Remboursement CPAM', paymentId: 'virement', accountId: 'courant' });
    if (rand() < 0.03) list.push({ date: iso, amount: between(20, 200), type: 'expense', categoryId: 'achats', sub: pick(['High-tech', 'Maison', 'Cadeaux']), description: pick(['Amazon', 'Fnac', 'Ikea', 'Cadeau anniversaire']), paymentId: 'cb', accountId: 'courant' });
    if (rand() < 0.03) list.push({ date: iso, amount: between(30, 150), type: 'income', categoryId: 'ventes', sub: 'Vinted', description: 'Vente Vinted', paymentId: 'virement', accountId: 'courant' });
    if (d.getMonth() === 7 && day === 3) list.push({ date: iso, amount: between(600, 900), type: 'expense', categoryId: 'vacances', sub: 'Hébergement', description: 'Location vacances', paymentId: 'cb', accountId: 'courant' });
  }

  store.addTransactions(list, 'Chargement de la démo');
  const s = store.state;
  if (!Object.keys(s.budgets).length) {
    s.budgets = { alimentation: 400, restaurants: 120, loisirs: 100, carburant: 150, vetements: 80, achats: 150 };
  }
  const courant = s.accounts.find((a) => a.id === 'courant'); if (courant && !courant.initialBalance) courant.initialBalance = 1500;
  const epargne = s.accounts.find((a) => a.id === 'epargne'); if (epargne && !epargne.initialBalance) epargne.initialBalance = 4200;
  if (!s.recurring.length) {
    const first = toISO(new Date(now.getFullYear(), now.getMonth() + 1, 1));
    s.recurring.push(
      { id: 'demo-salaire', label: 'Salaire', amount: 2650, type: 'income', categoryId: 'salaire', sub: 'Salaire net', paymentId: 'virement', accountId: 'courant', frequency: 'monthly', interval: 1, startDate: first, nextDate: first, active: true },
      { id: 'demo-loyer', label: 'Loyer appartement', amount: 850, type: 'expense', categoryId: 'logement', sub: 'Loyer', paymentId: 'prelevement', accountId: 'courant', frequency: 'monthly', interval: 1, startDate: toISO(new Date(now.getFullYear(), now.getMonth() + 1, 2)), nextDate: toISO(new Date(now.getFullYear(), now.getMonth() + 1, 2)), active: true },
      { id: 'demo-netflix', label: 'Netflix', amount: 13.49, type: 'expense', categoryId: 'abonnements', sub: 'Streaming', paymentId: 'cb', accountId: 'courant', frequency: 'monthly', interval: 1, startDate: toISO(new Date(now.getFullYear(), now.getMonth() + 1, 12)), nextDate: toISO(new Date(now.getFullYear(), now.getMonth() + 1, 12)), active: true },
    );
  }
  store.commitSilently();
}
