// ============================================================
// store.js — État de l'application et persistance locale (localStorage)
//
// Par défaut toutes les données restent sur l'appareil. La
// synchronisation Famille (par code partagé) est optionnelle, chiffrée
// côté client (AES-GCM dérivée du code) et centralisée via un petit
// backend (kvdb.io par défaut, remplaçable).
//
// Structure des données :
//   version      : number (schéma)
//   updatedAt    : ISO string — dernière mutation (conflit last-write-wins)
//   transactions : [{ id, date, amount, type, categoryId, sub, description,
//                     paymentId, accountId, recurringId, note }]
//   categories   : [{ id, name, icon, color, type, subs[] }]
//   accounts     : [{ id, name, icon, color, initialBalance }]
//   payments     : [{ id, name, icon }]
//   budgets      : { [categoryId]: montantMensuel }
//   recurring    : [{ id, label, amount, type, categoryId, sub, paymentId,
//                    accountId, frequency, interval, startDate, endDate,
//                    nextDate, active }]
//   settings     : { theme, defaultAccount, defaultPayment, onboarded, ...,
//                    family: { code, lastSync, autoSync } }
// ============================================================

import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES, DEFAULT_PAYMENT_METHODS } from './defaults.js';
import { uid, round2, sum, todayISO } from './utils.js';

const KEY = 'europilot.data.v1';
const listeners = new Set();
const undoStack = []; // pile d'annulation (max 20 actions)

/** État initial vide */
const emptyState = () => ({
  version: 1,
  updatedAt: null,
  transactions: [],
  categories: structuredClone(DEFAULT_CATEGORIES),
  accounts: structuredClone(DEFAULT_ACCOUNTS),
  payments: structuredClone(DEFAULT_PAYMENT_METHODS),
  budgets: {},
  recurring: [],
  settings: {
    theme: 'auto',
    defaultAccount: 'courant',
    defaultPayment: 'cb',
    onboarded: false,
    demoLoaded: false,
    family: { code: '', lastSync: null, autoSync: false },
  },
});

let state = load();

/** Charge depuis localStorage (ou état vide) — avec migration drive → famille */
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw);
    const base = emptyState();
    // migration : family remplace drive (on conserve le code si présent)
    const familyFromDrive = parsed.settings?.drive?.clientId ? { code: '', lastSync: parsed.settings.drive.lastSync || null, autoSync: !!parsed.settings.drive.autoSync } : {};
    const mergedSettings = {
      ...base.settings,
      ...(parsed.settings || {}),
      family: { ...base.settings.family, ...familyFromDrive, ...(parsed.settings?.family || {}) },
    };
    // nettoie l'ancien drive
    delete mergedSettings.drive;
    const merged = { ...base, ...parsed, settings: mergedSettings };
    if (!merged.updatedAt && parsed.transactions?.length) merged.updatedAt = new Date().toISOString();
    return merged;
  } catch (e) {
    console.error('Impossible de lire les données locales', e);
    return emptyState();
  }
}

/** Sauvegarde et notifie les vues — met à jour updatedAt */
function save({ touch = true } = {}) {
  if (touch) state.updatedAt = new Date().toISOString();
  localStorage.setItem(KEY, JSON.stringify(state));
  listeners.forEach((fn) => fn(state));
}

/** Enregistre une action réversible dans la pile d'annulation */
function pushUndo(label, snapshot) {
  undoStack.push({ label, snapshot });
  if (undoStack.length > 20) undoStack.shift();
}

// ---------- API publique ----------
export const store = {
  get state() { return state; },
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  /** Annule la dernière action. Retourne le libellé ou null */
  undo() {
    const last = undoStack.pop();
    if (!last) return null;
    state = last.snapshot;
    save();
    return last.label;
  },
  get canUndo() { return undoStack.length > 0; },
  get lastUndoLabel() { return undoStack.at(-1)?.label ?? null; },

  // ----- Transactions -----
  addTransaction(t) {
    pushUndo('Ajout de transaction', structuredClone(state));
    const tx = normalizeTx({ ...t, id: t.id || uid() });
    state.transactions.push(tx);
    save();
    return tx;
  },
  updateTransaction(id, patch) {
    pushUndo('Modification de transaction', structuredClone(state));
    const i = state.transactions.findIndex((t) => t.id === id);
    if (i >= 0) state.transactions[i] = normalizeTx({ ...state.transactions[i], ...patch });
    save();
  },
  deleteTransaction(id) {
    pushUndo('Suppression de transaction', structuredClone(state));
    state.transactions = state.transactions.filter((t) => t.id !== id);
    save();
  },
  deleteTransactions(ids) {
    pushUndo(`Suppression de ${ids.length} transactions`, structuredClone(state));
    const set = new Set(ids);
    state.transactions = state.transactions.filter((t) => !set.has(t.id));
    save();
  },
  /** Ajout en masse (import, récurrences) sans multiplier les entrées d'annulation */
  addTransactions(list, label = 'Import') {
    pushUndo(label, structuredClone(state));
    list.forEach((t) => state.transactions.push(normalizeTx({ ...t, id: t.id || uid() })));
    save();
  },

  // ----- Catégories -----
  saveCategory(cat) {
    pushUndo('Modification de catégorie', structuredClone(state));
    const i = state.categories.findIndex((c) => c.id === cat.id);
    if (i >= 0) state.categories[i] = { ...state.categories[i], ...cat };
    else state.categories.push({ subs: [], color: '#64748b', icon: '📦', type: 'expense', ...cat, id: cat.id || uid() });
    save();
  },
  deleteCategory(id) {
    pushUndo('Suppression de catégorie', structuredClone(state));
    state.categories = state.categories.filter((c) => c.id !== id);
    // Les transactions orphelines sont basculées vers "Autres"
    state.transactions.forEach((t) => { if (t.categoryId === id) t.categoryId = 'autres'; });
    delete state.budgets[id];
    save();
  },

  // ----- Comptes -----
  saveAccount(acc) {
    pushUndo('Modification de compte', structuredClone(state));
    const i = state.accounts.findIndex((a) => a.id === acc.id);
    if (i >= 0) state.accounts[i] = { ...state.accounts[i], ...acc };
    else state.accounts.push({ icon: '🏦', color: '#2563eb', initialBalance: 0, ...acc, id: acc.id || uid() });
    save();
  },
  deleteAccount(id) {
    pushUndo('Suppression de compte', structuredClone(state));
    state.accounts = state.accounts.filter((a) => a.id !== id);
    state.transactions = state.transactions.filter((t) => t.accountId !== id);
    save();
  },

  // ----- Moyens de paiement -----
  savePayment(p) {
    pushUndo('Modification de moyen de paiement', structuredClone(state));
    const i = state.payments.findIndex((x) => x.id === p.id);
    if (i >= 0) state.payments[i] = { ...state.payments[i], ...p };
    else state.payments.push({ icon: '💳', ...p, id: p.id || uid() });
    save();
  },
  deletePayment(id) {
    pushUndo('Suppression de moyen de paiement', structuredClone(state));
    state.payments = state.payments.filter((x) => x.id !== id);
    save();
  },

  // ----- Budgets -----
  setBudget(categoryId, amount) {
    pushUndo('Modification de budget', structuredClone(state));
    if (!amount || amount <= 0) delete state.budgets[categoryId];
    else state.budgets[categoryId] = round2(amount);
    save();
  },

  // ----- Récurrences -----
  saveRecurring(r) {
    pushUndo('Modification de récurrence', structuredClone(state));
    const i = state.recurring.findIndex((x) => x.id === r.id);
    if (i >= 0) state.recurring[i] = { ...state.recurring[i], ...r };
    else state.recurring.push({ active: true, interval: 1, ...r, id: r.id || uid(), nextDate: r.nextDate || r.startDate });
    save();
  },
  deleteRecurring(id) {
    pushUndo('Suppression de récurrence', structuredClone(state));
    state.recurring = state.recurring.filter((x) => x.id !== id);
    save();
  },
  /** Mise à jour silencieuse (sans annulation) pour la génération automatique */
  patchRecurringSilently(id, patch) {
    const r = state.recurring.find((x) => x.id === id);
    if (r) Object.assign(r, patch);
  },
  commitSilently() { save({ touch: true }); },

  // ----- Paramètres -----
  setSetting(k, v) {
    state.settings[k] = v;
    save();
  },
  /** Mise à jour partielle de settings.family */
  setFamilySettings(patch) {
    state.settings.family = { ...(state.settings.family || {}), ...patch };
    save();
  },

  // ----- Sauvegarde / restauration -----
  exportAll() { return structuredClone(state); },
  importAll(data) {
    pushUndo('Restauration de sauvegarde', structuredClone(state));
    if (!data || !Array.isArray(data.transactions)) throw new Error('Fichier de sauvegarde invalide');
    const base = emptyState();
    state = {
      ...base,
      ...data,
      updatedAt: data.updatedAt || new Date().toISOString(),
      settings: { ...base.settings, ...(data.settings || {}), family: { ...base.settings.family, ...(data.settings?.family || {}) } },
    };
    state.transactions = state.transactions.map(normalizeTx);
    save();
  },
  /** Remplacement sans undo (utilisé par la sync famille) */
  replaceAll(data) {
    if (!data || !Array.isArray(data.transactions)) throw new Error('Fichier de sauvegarde invalide');
    const base = emptyState();
    state = {
      ...base,
      ...data,
      updatedAt: data.updatedAt || new Date().toISOString(),
      settings: { ...base.settings, ...(data.settings || {}), family: { ...base.settings.family, ...(data.settings?.family || {}) } },
    };
    state.transactions = state.transactions.map(normalizeTx);
    save();
  },
  /** Suppression définitive de toutes les données */
  wipe() {
    undoStack.length = 0;
    const prevFamily = state.settings.family;
    state = emptyState();
    state.settings.onboarded = true;
    // on conserve le code famille pour éviter de le ressaisir
    state.settings.family = { ...state.settings.family, code: prevFamily?.code || '' };
    localStorage.removeItem(KEY);
    try { localStorage.removeItem('europilot.family.v1'); localStorage.removeItem('europilot.family.meta.v1'); } catch {}
    try { localStorage.removeItem('europilot.drive.token.v1'); localStorage.removeItem('europilot.drive.meta.v1'); } catch {}
    save();
  },

  // ----- Lecture / calculs -----
  category(id) { return state.categories.find((c) => c.id === id) || { id, name: 'Inconnue', icon: '❔', color: '#94a3b8', subs: [] }; },
  account(id) { return state.accounts.find((a) => a.id === id) || { id, name: 'Compte supprimé', icon: '❔', color: '#94a3b8' }; },
  payment(id) { return state.payments.find((p) => p.id === id) || { id, name: '—', icon: '' }; },

  /** Transactions triées par date décroissante */
  sortedTransactions() { return [...state.transactions].sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id)); },

  /** Transactions d'un mois "AAAA-MM" */
  byMonth(ym) { return state.transactions.filter((t) => t.date.startsWith(ym)); },
  /** Transactions d'une année */
  byYear(y) { return state.transactions.filter((t) => t.date.startsWith(String(y))); },
  byDay(iso) { return state.transactions.filter((t) => t.date === iso); },

  /** Totaux { income, expense, balance } d'une liste */
  totals(list) {
    const income = sum(list.filter((t) => t.type === 'income').map((t) => t.amount));
    const expense = sum(list.filter((t) => t.type === 'expense').map((t) => t.amount));
    return { income, expense, balance: round2(income - expense) };
  },

  /** Solde d'un compte (solde initial + revenus − dépenses) jusqu'à aujourd'hui inclus (et futur si asked) */
  accountBalance(accountId, includeFuture = false) {
    const acc = this.account(accountId);
    const today = todayISO();
    const list = state.transactions.filter((t) => t.accountId === accountId && (includeFuture || t.date <= today));
    return round2((acc.initialBalance || 0) + this.totals(list).balance);
  },
  /** Solde global tous comptes */
  totalBalance(includeFuture = false) {
    return round2(state.accounts.reduce((a, acc) => a + this.accountBalance(acc.id, includeFuture), 0));
  },

  /** Dépenses par catégorie d'une liste -> [{ cat, total }] triées */
  expensesByCategory(list) {
    const map = {};
    list.filter((t) => t.type === 'expense').forEach((t) => { map[t.categoryId] = round2((map[t.categoryId] || 0) + t.amount); });
    return Object.entries(map).map(([id, total]) => ({ cat: this.category(id), total })).sort((a, b) => b.total - a.total);
  },

  /** Années présentes dans les données (plus l'année courante) */
  years() {
    const set = new Set(state.transactions.map((t) => Number(t.date.slice(0, 4))));
    set.add(new Date().getFullYear());
    return [...set].sort((a, b) => b - a);
  },
};

/** Normalise une transaction (types, valeurs par défaut) */
function normalizeTx(t) {
  return {
    id: t.id,
    date: t.date || todayISO(),
    amount: round2(Math.abs(Number(t.amount) || 0)),
    type: t.type === 'income' ? 'income' : 'expense',
    categoryId: t.categoryId || 'autres',
    sub: t.sub || '',
    description: t.description || '',
    paymentId: t.paymentId || '',
    accountId: t.accountId || state.accounts[0]?.id || 'courant',
    recurringId: t.recurringId || null,
    note: t.note || '',
  };
}
