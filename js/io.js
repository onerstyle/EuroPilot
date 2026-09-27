// ============================================================
// io.js — Import / export CSV & JSON, sauvegarde et restauration
// ============================================================

import { store } from './store.js';
import { fmtDate, parseAmount, todayISO } from './utils.js';

/** Télécharge un fichier texte */
export function download(filename, content, mime = 'text/plain') {
  const blob = new Blob(['\ufeff' + content], { type: mime + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const csvCell = (v) => {
  const s = String(v ?? '');
  return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

/** Export CSV (séparateur ; compatible Excel français) */
export function exportCSV(transactions = store.sortedTransactions()) {
  const head = ['Date', 'Type', 'Montant', 'Catégorie', 'Sous-catégorie', 'Description', 'Moyen de paiement', 'Compte', 'Récurrent', 'Note'];
  const rows = transactions.map((t) => [
    fmtDate(t.date), t.type === 'income' ? 'Revenu' : 'Dépense', String(t.amount).replace('.', ','),
    store.category(t.categoryId).name, t.sub, t.description, store.payment(t.paymentId).name,
    store.account(t.accountId).name, t.recurringId ? 'Oui' : 'Non', t.note,
  ].map(csvCell).join(';'));
  download(`europilot-transactions-${todayISO()}.csv`, [head.join(';'), ...rows].join('\r\n'), 'text/csv');
}

/** Export JSON des transactions uniquement */
export function exportJSON(transactions = store.sortedTransactions()) {
  download(`europilot-transactions-${todayISO()}.json`, JSON.stringify(transactions, null, 2), 'application/json');
}

/** Sauvegarde complète (toutes les données) */
export function exportBackup() {
  const data = { app: 'EuroPilot', exportedAt: new Date().toISOString(), ...store.exportAll() };
  download(`europilot-sauvegarde-${todayISO()}.json`, JSON.stringify(data, null, 2), 'application/json');
}

/** Lit un fichier texte choisi par l'utilisateur */
export const readFile = (file) => new Promise((res, rej) => {
  const fr = new FileReader();
  fr.onload = () => res(fr.result);
  fr.onerror = rej;
  fr.readAsText(file, 'utf-8');
});

/** Analyseur CSV tolérant (séparateur ; ou , ou tab, guillemets) */
export function parseCSV(text) {
  text = text.replace(/^\ufeff/, '');
  const firstLine = text.split(/\r?\n/)[0] || '';
  const sep = [';', ',', '\t'].map((s) => [s, (firstLine.match(new RegExp('\\' + s, 'g')) || []).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}

/** Convertit une date "JJ/MM/AAAA" ou "AAAA-MM-JJ" en ISO */
function toISODate(s) {
  s = String(s).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

/** Retrouve un id par nom (catégorie/compte/moyen), en créant la catégorie si nécessaire */
function findByName(list, name) {
  const n = String(name || '').trim().toLowerCase();
  return list.find((x) => x.name.toLowerCase() === n || x.id === n);
}

/**
 * Import CSV : reconnaît les colonnes par leur en-tête (insensible à la casse).
 * Colonnes reconnues : date, type, montant, catégorie, sous-catégorie, description,
 * moyen de paiement, compte, note. Un montant négatif = dépense.
 */
export function importCSV(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) throw new Error('Fichier CSV vide');
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (...names) => header.findIndex((h) => names.some((n) => h.includes(n)));
  const iDate = col('date'), iType = col('type'), iAmt = col('montant', 'amount'), iCat = col('catégorie', 'categorie', 'category');
  const iSub = col('sous'), iDesc = col('description', 'libellé', 'libelle', 'label'), iPay = col('moyen', 'paiement', 'payment');
  const iAcc = col('compte', 'account'), iNote = col('note');
  if (iDate < 0 || iAmt < 0) throw new Error('Colonnes "Date" et "Montant" introuvables');

  const { state } = store;
  const list = []; let skipped = 0;
  for (const r of rows.slice(1)) {
    const date = toISODate(r[iDate]);
    const raw = parseAmount(r[iAmt]);
    if (!date || !raw) { skipped++; continue; }
    let type = raw < 0 ? 'expense' : 'income';
    if (iType >= 0) {
      const t = (r[iType] || '').toLowerCase();
      if (t.startsWith('rev') || t.startsWith('inc') || t === 'crédit' || t === 'credit') type = 'income';
      else if (t.startsWith('dép') || t.startsWith('dep') || t.startsWith('exp') || t === 'débit' || t === 'debit') type = 'expense';
    } else if (raw > 0 && iType < 0) type = 'expense'; // Sans colonne type : positif = dépense par défaut (relevé de dépenses)
    let cat = iCat >= 0 ? findByName(state.categories, r[iCat]) : null;
    if (!cat && iCat >= 0 && r[iCat]?.trim()) {
      store.saveCategory({ name: r[iCat].trim(), type, icon: '📦', color: '#64748b', subs: [] });
      cat = findByName(store.state.categories, r[iCat]);
    }
    const acc = iAcc >= 0 ? findByName(state.accounts, r[iAcc]) : null;
    const pay = iPay >= 0 ? findByName(state.payments, r[iPay]) : null;
    list.push({
      date, amount: Math.abs(raw), type,
      categoryId: cat?.id || (type === 'income' ? 'autres-revenus' : 'autres'), sub: iSub >= 0 ? r[iSub] : '',
      description: iDesc >= 0 ? r[iDesc] : '', paymentId: pay?.id || state.settings.defaultPayment,
      accountId: acc?.id || state.settings.defaultAccount, note: iNote >= 0 ? r[iNote] : '',
    });
  }
  store.addTransactions(list, `Import CSV (${list.length})`);
  return { imported: list.length, skipped };
}

/** Restauration d'une sauvegarde complète ou d'un export JSON de transactions */
export function importJSON(text) {
  const data = JSON.parse(text);
  if (Array.isArray(data)) { store.addTransactions(data.map(({ id, ...t }) => t), `Import JSON (${data.length})`); return { imported: data.length, full: false }; }
  store.importAll(data);
  return { imported: data.transactions.length, full: true };
}
