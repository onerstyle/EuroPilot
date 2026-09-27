// ============================================================
// views/stats.js — Statistiques et graphiques interactifs
// ============================================================

import { store } from '../store.js';
import { $, esc, fmtEuro, MONTHS_SHORT, round2, todayISO, prevMonth } from '../utils.js';
import { barChart, lineChart, donutChart } from '../charts.js';
import { optionList, yearOptions } from '../ui.js';

let year = new Date().getFullYear();
let range = '12'; // "12" derniers mois, ou "year"
let catId = '';

export function render(root, { navigate }) {
  const { state } = store;
  const expCats = state.categories.filter((c) => c.type === 'expense');
  if (!catId) catId = expCats[0]?.id || '';

  // Périodes : soit les 12 derniers mois, soit l'année sélectionnée
  let months = [];
  if (range === 'year') months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
  else { let k = todayISO().slice(0, 7); for (let i = 0; i < 12; i++) { months.unshift(k); k = prevMonth(k); } }
  const labels = months.map((k) => MONTHS_SHORT[Number(k.slice(5)) - 1] + (range === 'year' ? '' : ' ' + k.slice(2, 4)));
  const lists = months.map((k) => store.byMonth(k));
  const totals = lists.map((l) => store.totals(l));
  const all = lists.flat();
  const cats = store.expensesByCategory(all);

  // Évolution du solde cumulé (solde initial des comptes + toutes les opérations jusqu'à fin de chaque mois)
  const initial = state.accounts.reduce((a, x) => a + (x.initialBalance || 0), 0);
  const balanceSeries = months.map((k) => round2(initial + store.totals(state.transactions.filter((t) => t.date <= k + '-31')).balance));

  // Années pour la répartition annuelle
  const years = store.years().slice(0, 6).reverse();
  const yTot = years.map((yy) => store.totals(store.byYear(yy)));

  root.innerHTML = `
    <div class="page-head">
      <div><h1>Statistiques</h1><p class="muted">Analysez vos habitudes financières</p></div>
      <div class="btn-row">
        <select id="s-range"><option value="12" ${range === '12' ? 'selected' : ''}>12 derniers mois</option><option value="year" ${range === 'year' ? 'selected' : ''}>Année civile</option></select>
        <select id="s-year" ${range === 'year' ? '' : 'hidden'}>${yearOptions(year)}</select>
      </div>
    </div>
    <section class="summary-row">
      <div class="card mini"><span class="muted">Revenus</span><b class="pos">${fmtEuro(store.totals(all).income)}</b></div>
      <div class="card mini"><span class="muted">Dépenses</span><b class="neg">${fmtEuro(store.totals(all).expense)}</b></div>
      <div class="card mini"><span class="muted">Épargne</span><b class="${store.totals(all).balance >= 0 ? 'pos' : 'neg'}">${fmtEuro(store.totals(all).balance)}</b></div>
      <div class="card mini"><span class="muted">Dépense moy. / mois</span><b>${fmtEuro(store.totals(all).expense / (lists.filter((l) => l.length).length || 1))}</b></div>
    </section>
    <section class="grid-2col">
      <div class="card"><h2>Dépenses par catégorie</h2><div id="c-donut" class="chart-box"></div></div>
      <div class="card"><h2>Dépenses mensuelles</h2><div id="c-monthly" class="chart-box"></div></div>
      <div class="card"><h2>Revenus vs dépenses</h2><div id="c-rvd" class="chart-box"></div></div>
      <div class="card"><h2>Évolution du solde</h2><div id="c-balance" class="chart-box"></div></div>
      <div class="card"><h2>Répartition annuelle</h2><div id="c-years" class="chart-box"></div></div>
      <div class="card"><div class="card-head"><h2>Évolution d'une catégorie</h2><select id="s-cat">${optionList(expCats, catId)}</select></div><div id="c-cat" class="chart-box"></div></div>
      <div class="card span-2"><h2>Dépenses par catégorie et par mois</h2><div id="c-stack" class="chart-box"></div></div>
    </section>`;

  $('#s-range', root).onchange = (e) => { range = e.target.value; render(root, { navigate }); };
  $('#s-year', root).onchange = (e) => { year = Number(e.target.value); render(root, { navigate }); };
  $('#s-cat', root).onchange = (e) => { catId = e.target.value; drawCat(); };

  donutChart($('#c-donut', root), { items: cats.map(({ cat, total }) => ({ id: cat.id, name: cat.name, icon: cat.icon, color: cat.color, value: total })), centerLabel: 'Dépenses', size: 220, onClick: (it) => { catId = it.id; $('#s-cat', root).value = it.id; drawCat(); } });
  barChart($('#c-monthly', root), { labels, series: [{ name: 'Dépenses', color: 'var(--red)', data: totals.map((t) => t.expense) }], onClick: (i) => navigate('transactions', { month: months[i] }) });
  barChart($('#c-rvd', root), { labels, series: [{ name: 'Revenus', color: 'var(--green)', data: totals.map((t) => t.income) }, { name: 'Dépenses', color: 'var(--red)', data: totals.map((t) => t.expense) }], onClick: (i) => navigate('transactions', { month: months[i] }) });
  lineChart($('#c-balance', root), { labels, series: [{ name: 'Solde', color: 'var(--accent)', data: balanceSeries }], zeroLine: true });
  barChart($('#c-years', root), { labels: years.map(String), series: [{ name: 'Revenus', color: 'var(--green)', data: yTot.map((t) => t.income) }, { name: 'Dépenses', color: 'var(--red)', data: yTot.map((t) => t.expense) }, { name: 'Épargne', color: 'var(--accent)', data: yTot.map((t) => Math.max(0, t.balance)) }], onClick: (i) => navigate('years', { year: years[i] }) });
  // Empilé : 6 premières catégories + "Autres"
  const topIds = cats.slice(0, 6).map((c) => c.cat.id);
  const series = cats.slice(0, 6).map(({ cat }) => ({ name: cat.name, color: cat.color, data: lists.map((l) => store.totals(l.filter((t) => t.categoryId === cat.id)).expense) }));
  if (cats.length > 6) series.push({ name: 'Autres', color: '#94a3b8', data: lists.map((l) => store.totals(l.filter((t) => t.type === 'expense' && !topIds.includes(t.categoryId))).expense) });
  barChart($('#c-stack', root), { labels, series, stacked: true, height: 260 });

  function drawCat() {
    const c = store.category(catId);
    lineChart($('#c-cat', root), { labels, series: [{ name: c.name, color: c.color, data: lists.map((l) => store.totals(l.filter((t) => t.categoryId === catId)).expense) }] });
  }
  drawCat();
}
