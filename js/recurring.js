// ============================================================
// recurring.js — Génération automatique des opérations récurrentes
//
// À chaque ouverture de l'application, on parcourt les récurrences actives
// et on crée les transactions dont la date d'échéance est atteinte.
// ============================================================

import { store } from './store.js';
import { addDays, addMonths, todayISO } from './utils.js';

/** Calcule la date d'échéance suivante selon la fréquence */
export function nextOccurrence(date, frequency, interval = 1) {
  switch (frequency) {
    case 'weekly': return addDays(date, 7 * interval);
    case 'monthly': return addMonths(date, interval);
    case 'yearly': return addMonths(date, 12 * interval);
    case 'custom': return addDays(date, Math.max(1, interval));
    default: return addMonths(date, 1);
  }
}

/**
 * Génère les transactions échues. Retourne le nombre créé.
 * Sécurité : au maximum 500 occurrences par récurrence pour éviter une boucle infinie.
 */
export function processRecurring() {
  const today = todayISO();
  const created = [];
  const { recurring } = store.state;

  for (const r of recurring) {
    if (!r.active) continue;
    let next = r.nextDate || r.startDate;
    let guard = 0;
    while (next && next <= today && guard < 500) {
      if (r.endDate && next > r.endDate) { store.patchRecurringSilently(r.id, { active: false }); break; }
      created.push({
        date: next, amount: r.amount, type: r.type, categoryId: r.categoryId, sub: r.sub || '',
        description: r.label, paymentId: r.paymentId, accountId: r.accountId, recurringId: r.id, note: 'Opération récurrente',
      });
      next = nextOccurrence(next, r.frequency, r.interval);
      guard++;
    }
    if (next !== r.nextDate) store.patchRecurringSilently(r.id, { nextDate: next });
  }

  if (created.length) store.addTransactions(created, `Génération de ${created.length} opération(s) récurrente(s)`);
  else store.commitSilently();
  return created.length;
}

/** Libellé lisible d'une fréquence */
export function frequencyLabel(r) {
  const n = r.interval || 1;
  switch (r.frequency) {
    case 'weekly': return n === 1 ? 'Chaque semaine' : `Toutes les ${n} semaines`;
    case 'monthly': return n === 1 ? 'Chaque mois' : `Tous les ${n} mois`;
    case 'yearly': return n === 1 ? 'Chaque année' : `Tous les ${n} ans`;
    case 'custom': return `Tous les ${n} jours`;
    default: return '';
  }
}

/** Montant mensuel équivalent (pour estimer les charges fixes) */
export function monthlyEquivalent(r) {
  const n = r.interval || 1;
  switch (r.frequency) {
    case 'weekly': return (r.amount * 52) / 12 / n;
    case 'monthly': return r.amount / n;
    case 'yearly': return r.amount / 12 / n;
    case 'custom': return (r.amount * 365) / 12 / n;
    default: return r.amount;
  }
}
