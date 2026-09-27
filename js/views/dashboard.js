// ============================================================
// views/dashboard.js — Tableau de bord
// ============================================================

import { store } from '../store.js';
import { $, esc, fmtEuro, fmtPct, fmtMonth, prevMonth, todayISO, daysInMonth, MONTHS_SHORT, round2 } from '../utils.js';
import { barChart, donutChart, lineChart } from '../charts.js';
import { txRow, bindTxRows, emptyState, progressBar } from '../ui.js';

/** Carte indicateur (KPI) */
const kpi = (label, value, { sub = '', cls = '', icon = '' } = {}) => `
  <div class="card kpi ${cls}">
    <div class="kpi-label">${icon ? `<span>${icon}</span>` : ''}${esc(label)}</div>
    <div class="kpi-value">${value}</div>
    ${sub ? `<div class="kpi-sub">${sub}</div>` : ''}
  </div>`;

/** Variation en % avec flèche */
function delta(cur, prev, invert = false) {
  if (!prev) return '<span class="muted">— vs mois précédent</span>';
  const d = ((cur - prev) / prev) * 100;
  const good = invert ? d <= 0 : d >= 0;
  return `<span class="${good ? 'pos' : 'neg'}">${d >= 0 ? '▲' : '▼'} ${fmtPct(Math.abs(d))}</span> <span class="muted">vs mois précédent</span>`;
}

export function render(root, { navigate }) {
  const today = todayISO();
  const ym = today.slice(0, 7);
  const year = today.slice(0, 4);
  const [y, m] = ym.split('-').map(Number);
  const month = store.byMonth(ym);
  const prev = store.byMonth(prevMonth(ym));
  const tm = store.totals(month), tp = store.totals(prev), ty = store.totals(store.byYear(year));
  const dayOfMonth = Number(today.slice(8, 10));
  const dim = daysInMonth(y, m);
  const dailyAvg = round2(tm.expense / dayOfMonth);
  const remainingDays = dim - dayOfMonth;
  const resteAVivre = round2(tm.income - tm.expense);
  const balance = store.totalBalance();
  const cats = store.expensesByCategory(month);
  const budgets = Object.entries(store.state.budgets);

  // 12 derniers mois pour les graphiques
  const months = [];
  for (let i = 11; i >= 0; i--) { const d = new Date(y, m - 1 - i, 1); months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); }
  const mTotals = months.map((k) => store.totals(store.byMonth(k)));

  root.innerHTML = `
    <div class="page-head">
      <div><h1>Tableau de bord</h1><p class="muted">${fmtMonth(ym)} · jour ${dayOfMonth}/${dim}</p></div>
      <button class="btn btn-primary" data-add>＋ Ajouter</button>
    </div>

    <section class="kpi-grid">
      ${kpi('Solde actuel', fmtEuro(balance), { cls: 'kpi-hero ' + (balance >= 0 ? 'pos' : 'neg'), sub: `${store.state.accounts.length} compte${store.state.accounts.length > 1 ? 's' : ''}`, icon: '💶' })}
      ${kpi('Revenus du mois', fmtEuro(tm.income), { cls: 'income', sub: delta(tm.income, tp.income), icon: '📈' })}
      ${kpi('Dépenses du mois', fmtEuro(tm.expense), { cls: 'expense', sub: delta(tm.expense, tp.expense, true), icon: '📉' })}
      ${kpi('Reste à vivre', fmtEuro(resteAVivre), { cls: resteAVivre >= 0 ? 'pos' : 'neg', sub: remainingDays > 0 ? `${fmtEuro(Math.max(0, resteAVivre) / Math.max(1, remainingDays))} / jour sur ${remainingDays} j restants` : 'Fin du mois', icon: '🧮' })}
      ${kpi('Moyenne quotidienne', fmtEuro(dailyAvg), { sub: `Projection : ${fmtEuro(dailyAvg * dim)} sur le mois`, icon: '📅' })}
      ${kpi('Solde du mois précédent', fmtEuro(tp.balance), { sub: `${fmtMonth(prevMonth(ym))}`, cls: tp.balance >= 0 ? '' : 'neg', icon: '↩️' })}
      ${kpi(`Revenus ${year}`, fmtEuro(ty.income), { cls: 'income', icon: '🗓️' })}
      ${kpi(`Dépenses ${year}`, fmtEuro(ty.expense), { cls: 'expense', sub: `Épargne ${year} : <b class="${ty.balance >= 0 ? 'pos' : 'neg'}">${fmtEuro(ty.balance)}</b>`, icon: '🗓️' })}
    </section>

    <section class="grid-2col">
      <div class="card">
        <h2>Revenus vs dépenses <small class="muted">12 derniers mois</small></h2>
        <div id="chart-rvd" class="chart-box"></div>
      </div>
      <div class="card">
        <h2>Dépenses par catégorie <small class="muted">${fmtMonth(ym)}</small></h2>
        <div id="chart-cats" class="chart-box"></div>
      </div>
      <div class="card">
        <h2>Évolution des dépenses <small class="muted">12 derniers mois</small></h2>
        <div id="chart-exp" class="chart-box"></div>
      </div>
      <div class="card">
        <h2>Principales catégories</h2>
        <div id="top-cats" class="top-cats"></div>
      </div>
    </section>

    <section class="grid-2col">
      <div class="card">
        <div class="card-head"><h2>Dernières opérations</h2><button class="btn-link" data-nav="transactions">Tout voir →</button></div>
        <div class="tx-list" id="recent"></div>
      </div>
      <div class="card">
        <div class="card-head"><h2>Budgets du mois</h2><button class="btn-link" data-nav="budgets">Gérer →</button></div>
        <div id="budgets-mini"></div>
      </div>
    </section>`;

  // Graphiques
  const labels = months.map((k) => MONTHS_SHORT[Number(k.slice(5)) - 1]);
  barChart($('#chart-rvd', root), { labels, series: [
    { name: 'Revenus', color: 'var(--green)', data: mTotals.map((t) => t.income) },
    { name: 'Dépenses', color: 'var(--red)', data: mTotals.map((t) => t.expense) },
  ], onClick: (i) => navigate('transactions', { month: months[i] }) });
  donutChart($('#chart-cats', root), { items: cats.map(({ cat, total }) => ({ id: cat.id, name: cat.name, icon: cat.icon, color: cat.color, value: total })), centerLabel: 'Dépenses', onClick: (it) => navigate('transactions', { month: ym, category: it.id }) });
  lineChart($('#chart-exp', root), { labels, series: [{ name: 'Dépenses', color: 'var(--accent)', data: mTotals.map((t) => t.expense) }] });

  // Top catégories avec part en %
  const top = $('#top-cats', root);
  top.innerHTML = cats.length ? cats.slice(0, 6).map(({ cat, total }) => `
    <div class="top-cat clickable" data-cat="${esc(cat.id)}">
      <span class="tx-icon" style="--c:${cat.color}">${cat.icon}</span>
      <span class="top-cat-main"><b>${esc(cat.name)}</b>${progressBar(total / (tm.expense || 1))}</span>
      <span class="top-cat-val">${fmtEuro(total)}<small>${fmtPct((total / (tm.expense || 1)) * 100)}</small></span>
    </div>`).join('') : emptyState('🌱', 'Aucune dépense ce mois-ci');
  top.querySelectorAll('[data-cat]').forEach((e) => e.onclick = () => navigate('transactions', { month: ym, category: e.dataset.cat }));

  // Récentes
  const recent = store.sortedTransactions().slice(0, 8);
  $('#recent', root).innerHTML = recent.length ? recent.map((t) => txRow(t)).join('') : emptyState('📝', 'Aucune transaction', 'Ajoutez votre première opération avec le bouton « Ajouter ».');
  bindTxRows(root);

  // Budgets
  const bm = $('#budgets-mini', root);
  bm.innerHTML = budgets.length ? budgets.map(([cid, b]) => {
    const c = store.category(cid); const spent = cats.find((x) => x.cat.id === cid)?.total || 0; const ratio = spent / b;
    return `<div class="budget-mini"><span>${c.icon} ${esc(c.name)}</span><span class="muted">${fmtEuro(spent)} / ${fmtEuro(b)}</span>${progressBar(ratio)}</div>`;
  }).join('') : emptyState('🎯', 'Aucun budget défini', 'Fixez des limites mensuelles par catégorie.');

  root.querySelector('[data-add]').onclick = () => import('../ui.js').then((m) => m.transactionForm());
  root.querySelectorAll('[data-nav]').forEach((b) => b.onclick = () => navigate(b.dataset.nav));
}
