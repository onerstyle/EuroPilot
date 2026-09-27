// ============================================================
// utils.js — Fonctions utilitaires : formats français, dates, DOM
// ============================================================

/** Formate un montant en euros au format français : 1 250,50 € */
export const fmtEuro = (n, opts = {}) => {
  const v = Number(n) || 0;
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency', currency: 'EUR',
    minimumFractionDigits: 2, maximumFractionDigits: 2, ...opts,
  }).format(v);
};

/** Montant signé avec + / − selon le type de transaction */
export const fmtSigned = (n, type) => (type === 'income' ? '+' : '−') + fmtEuro(Math.abs(n));

/** Pourcentage : 12,3 % */
export const fmtPct = (n) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(n) + ' %';

/** Date ISO (AAAA-MM-JJ) -> "12/03/2026" */
export const fmtDate = (iso) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

/** Date ISO -> "jeudi 12 mars 2026" */
export const fmtDateLong = (iso) =>
  new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

export const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
export const MONTHS_SHORT = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
export const DAYS_SHORT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

/** "2026-03" -> "Mars 2026" */
export const fmtMonth = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};

/** Date du jour au format ISO local */
export const todayISO = () => toISO(new Date());

/** Objet Date -> "AAAA-MM-JJ" (fuseau local) */
export const toISO = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** Nombre de jours dans un mois (année, mois 1-12) */
export const daysInMonth = (y, m) => new Date(y, m, 0).getDate();

/** Mois précédent "AAAA-MM" */
export const prevMonth = (ym) => {
  let [y, m] = ym.split('-').map(Number);
  m -= 1; if (m === 0) { m = 12; y -= 1; }
  return `${y}-${String(m).padStart(2, '0')}`;
};
export const nextMonth = (ym) => {
  let [y, m] = ym.split('-').map(Number);
  m += 1; if (m === 13) { m = 1; y += 1; }
  return `${y}-${String(m).padStart(2, '0')}`;
};

/** Ajoute n jours à une date ISO */
export const addDays = (iso, n) => {
  const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return toISO(d);
};
/** Ajoute n mois à une date ISO (borne au dernier jour du mois) */
export const addMonths = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number);
  const target = new Date(y, m - 1 + n, 1);
  const last = daysInMonth(target.getFullYear(), target.getMonth() + 1);
  target.setDate(Math.min(d, last));
  return toISO(target);
};

/** Identifiant unique */
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

/** Échappe le HTML pour éviter les injections */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Raccourci querySelector */
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Crée un élément à partir d'une chaîne HTML */
export const html = (str) => {
  const t = document.createElement('template');
  t.innerHTML = str.trim();
  return t.content.firstElementChild;
};

/** Arrondit à 2 décimales (évite les erreurs flottantes) */
export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** Somme d'un tableau de nombres */
export const sum = (arr) => round2(arr.reduce((a, b) => a + (Number(b) || 0), 0));

/** Regroupe un tableau selon une clé */
export const groupBy = (arr, fn) => arr.reduce((acc, x) => { const k = fn(x); (acc[k] ||= []).push(x); return acc; }, {});

/** Analyse un montant saisi ("1 250,50" ou "1250.50") */
export const parseAmount = (s) => {
  if (typeof s === 'number') return s;
  const clean = String(s).replace(/\s/g, '').replace(/€/g, '').replace(',', '.');
  const n = parseFloat(clean);
  return isNaN(n) ? 0 : n;
};

/** Debounce simple */
export const debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
