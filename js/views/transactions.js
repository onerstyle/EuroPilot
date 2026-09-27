// ============================================================
// views/transactions.js — Liste, recherche et filtres, suivi mensuel
// ============================================================

import { store } from '../store.js';
import { $, $$, esc, fmtEuro, fmtMonth, fmtDateLong, prevMonth, nextMonth, todayISO, groupBy, debounce, MONTHS } from '../utils.js';
import { txRow, bindTxRows, emptyState, optionList, transactionForm, confirm, toastUndo, yearOptions } from '../ui.js';
import { barChart, hbarList } from '../charts.js';
import { exportCSV, exportJSON } from '../io.js';

/** Filtres courants (persistés pendant la session) */
let filters = { q: '', period: 'month', month: todayISO().slice(0, 7), year: todayISO().slice(0, 4), from: '', to: '', type: '', category: '', account: '', payment: '', min: '', max: '' };

/** Applique les filtres à la liste complète */
function applyFilters(list) {
  const f = filters;
  const q = f.q.trim().toLowerCase();
  return list.filter((t) => {
    if (f.period === 'month' && !t.date.startsWith(f.month)) return false;
    if (f.period === 'year' && !t.date.startsWith(f.year)) return false;
    if (f.period === 'custom') { if (f.from && t.date < f.from) return false; if (f.to && t.date > f.to) return false; }
    if (f.type && t.type !== f.type) return false;
    if (f.category && t.categoryId !== f.category) return false;
    if (f.account && t.accountId !== f.account) return false;
    if (f.payment && t.paymentId !== f.payment) return false;
    if (f.min !== '' && t.amount < Number(f.min)) return false;
    if (f.max !== '' && t.amount > Number(f.max)) return false;
    if (q) {
      const hay = [t.description, t.note, t.sub, store.category(t.categoryId).name, store.account(t.accountId).name, store.payment(t.paymentId).name, String(t.amount).replace('.', ',')].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function render(root, { navigate, params = {} }) {
  // Paramètres de navigation (depuis le tableau de bord, le calendrier…)
  if (params.month) { filters.period = 'month'; filters.month = params.month; }
  if (params.year) { filters.period = 'year'; filters.year = String(params.year); }
  if (params.category !== undefined) filters.category = params.category;
  if (params.account !== undefined) filters.account = params.account;
  if (params.day) { filters.period = 'custom'; filters.from = params.day; filters.to = params.day; }
  const { state } = store;

  root.innerHTML = `
    <div class="page-head">
      <div><h1>Transactions</h1><p class="muted" id="tx-count"></p></div>
      <div class="btn-row">
        <button class="btn btn-ghost" data-export="csv">⬇ CSV</button>
        <button class="btn btn-ghost" data-export="json">⬇ JSON</button>
        <button class="btn btn-primary" data-add>＋ Ajouter</button>
      </div>
    </div>

    <div class="card filters">
      <div class="search-row">
        <input type="search" id="f-q" placeholder="🔍 Rechercher une description, une catégorie, un montant…" value="${esc(filters.q)}">
        <button class="btn btn-ghost" id="f-toggle">Filtres ▾</button>
      </div>
      <div class="filter-grid" id="filter-grid">
        <label>Période<select id="f-period">
          <option value="month" ${filters.period === 'month' ? 'selected' : ''}>Mois</option>
          <option value="year" ${filters.period === 'year' ? 'selected' : ''}>Année</option>
          <option value="custom" ${filters.period === 'custom' ? 'selected' : ''}>Dates personnalisées</option>
          <option value="all" ${filters.period === 'all' ? 'selected' : ''}>Tout l'historique</option>
        </select></label>
        <label data-for="month">Mois<input type="month" id="f-month" value="${esc(filters.month)}"></label>
        <label data-for="year">Année<select id="f-year">${yearOptions(filters.year)}</select></label>
        <label data-for="custom">Du<input type="date" id="f-from" value="${esc(filters.from)}"></label>
        <label data-for="custom">Au<input type="date" id="f-to" value="${esc(filters.to)}"></label>
        <label>Type<select id="f-type"><option value="">Tous</option><option value="expense" ${filters.type === 'expense' ? 'selected' : ''}>Dépenses</option><option value="income" ${filters.type === 'income' ? 'selected' : ''}>Revenus</option></select></label>
        <label>Catégorie<select id="f-cat"><option value="">Toutes</option>${optionList(state.categories, filters.category)}</select></label>
        <label>Compte<select id="f-acc"><option value="">Tous</option>${optionList(state.accounts, filters.account)}</select></label>
        <label>Moyen de paiement<select id="f-pay"><option value="">Tous</option>${optionList(state.payments, filters.payment)}</select></label>
        <label>Montant min<input type="number" step="0.01" id="f-min" value="${esc(filters.min)}" placeholder="0"></label>
        <label>Montant max<input type="number" step="0.01" id="f-max" value="${esc(filters.max)}" placeholder="∞"></label>
        <button class="btn btn-ghost" id="f-reset">Réinitialiser</button>
      </div>
    </div>

    <div id="month-nav" class="month-nav"></div>
    <section class="summary-row" id="summary"></section>
    <section id="month-detail"></section>
    <div class="card"><div class="tx-list" id="list"></div></div>`;

  // --- Liaison des filtres ---
  const bind = (id, key, ev = 'change') => $(`#${id}`, root).addEventListener(ev, (e) => { filters[key] = e.target.value; update(); });
  $('#f-q', root).addEventListener('input', debounce((e) => { filters.q = e.target.value; update(); }, 150));
  bind('f-period', 'period'); bind('f-month', 'month'); bind('f-year', 'year'); bind('f-from', 'from'); bind('f-to', 'to');
  bind('f-type', 'type'); bind('f-cat', 'category'); bind('f-acc', 'account'); bind('f-pay', 'payment'); bind('f-min', 'min', 'input'); bind('f-max', 'max', 'input');
  $('#f-reset', root).onclick = () => { filters = { ...filters, q: '', type: '', category: '', account: '', payment: '', min: '', max: '', period: 'month', month: todayISO().slice(0, 7) }; render(root, { navigate }); };
  $('#f-toggle', root).onclick = () => $('#filter-grid', root).classList.toggle('open');
  if (filters.type || filters.category || filters.account || filters.payment || filters.min || filters.max || filters.period !== 'month') $('#filter-grid', root).classList.add('open');
  $('[data-add]', root).onclick = () => transactionForm(null, filters.period === 'month' && filters.month !== todayISO().slice(0, 7) ? { date: filters.month + '-01' } : {});
  $$('[data-export]', root).forEach((b) => b.onclick = () => (b.dataset.export === 'csv' ? exportCSV : exportJSON)(applyFilters(store.sortedTransactions())));

  function update() {
    $$('[data-for]', root).forEach((l) => l.style.display = l.dataset.for === filters.period ? '' : 'none');
    const list = applyFilters(store.sortedTransactions());
    const tot = store.totals(list);
    $('#tx-count', root).textContent = `${list.length} opération${list.length > 1 ? 's' : ''}`;

    // Navigation mois précédent / suivant
    const nav = $('#month-nav', root);
    if (filters.period === 'month') {
      nav.innerHTML = `<button class="icon-btn" data-m="prev">‹</button><h2>${fmtMonth(filters.month)}</h2><button class="icon-btn" data-m="next">›</button>`;
      $('[data-m=prev]', nav).onclick = () => { filters.month = prevMonth(filters.month); $('#f-month', root).value = filters.month; update(); };
      $('[data-m=next]', nav).onclick = () => { filters.month = nextMonth(filters.month); $('#f-month', root).value = filters.month; update(); };
    } else nav.innerHTML = '';

    // Résumé
    $('#summary', root).innerHTML = `
      <div class="card mini"><span class="muted">Revenus</span><b class="pos">${fmtEuro(tot.income)}</b></div>
      <div class="card mini"><span class="muted">Dépenses</span><b class="neg">${fmtEuro(tot.expense)}</b></div>
      <div class="card mini"><span class="muted">Solde</span><b class="${tot.balance >= 0 ? 'pos' : 'neg'}">${fmtEuro(tot.balance)}</b></div>`;

    // Détail mensuel : catégories + comparaison avec les 6 derniers mois
    const det = $('#month-detail', root);
    if (filters.period === 'month' && !filters.q) {
      const cats = store.expensesByCategory(list);
      const months = []; let k = filters.month;
      for (let i = 0; i < 6; i++) { months.unshift(k); k = prevMonth(k); }
      det.innerHTML = `<div class="grid-2col">
        <div class="card"><h2>Dépenses par catégorie</h2><div id="m-cats"></div></div>
        <div class="card"><h2>Comparaison avec les mois précédents</h2><div id="m-cmp" class="chart-box"></div></div></div>`;
      hbarList($('#m-cats', det), cats.map(({ cat, total }) => ({ id: cat.id, name: cat.name, icon: cat.icon, color: cat.color, value: total })), { onClick: (id) => { filters.category = id; $('#f-cat', root).value = id; update(); } });
      const mt = months.map((mm) => store.totals(store.byMonth(mm)));
      barChart($('#m-cmp', det), { labels: months.map((mm) => MONTHS[Number(mm.slice(5)) - 1].slice(0, 4) + ' ' + mm.slice(2, 4)), series: [
        { name: 'Revenus', color: 'var(--green)', data: mt.map((t) => t.income) }, { name: 'Dépenses', color: 'var(--red)', data: mt.map((t) => t.expense) }],
        onClick: (i) => { filters.month = months[i]; $('#f-month', root).value = filters.month; update(); } });
    } else det.innerHTML = '';

    // Liste groupée par jour
    const box = $('#list', root);
    if (!list.length) { box.innerHTML = emptyState('🔍', 'Aucune transaction trouvée', 'Modifiez vos filtres ou ajoutez une opération.'); return; }
    const groups = groupBy(list, (t) => t.date);
    box.innerHTML = Object.entries(groups).map(([d, items]) => {
      const dt = store.totals(items);
      return `<div class="day-group"><div class="day-head"><span>${fmtDateLong(d)}</span><span class="${dt.balance >= 0 ? 'pos' : 'neg'}">${dt.balance >= 0 ? '+' : '−'}${fmtEuro(Math.abs(dt.balance))}</span></div>${items.map((t) => txRow(t)).join('')}</div>`;
    }).join('');
    bindTxRows(box);
  }
  update();
}
