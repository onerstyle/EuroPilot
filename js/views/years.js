// ============================================================
// views/years.js — Suivi annuel par année civile
// ============================================================

import { store } from '../store.js';
import { $, $$, esc, fmtEuro, fmtPct, MONTHS, MONTHS_SHORT, round2, todayISO } from '../utils.js';
import { barChart, donutChart, hbarList } from '../charts.js';
import { yearOptions } from '../ui.js';

let year = new Date().getFullYear();

export function render(root, { navigate, params = {} }) {
  if (params.year) year = Number(params.year);
  const years = store.years();
  if (!years.includes(year)) year = years[0];
  const list = store.byYear(year);
  const tot = store.totals(list);
  const today = todayISO();
  const isCurrent = year === new Date().getFullYear();
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  // Jours écoulés (année en cours) ou 365/366 (année passée)
  const daysElapsed = isCurrent ? Math.floor((new Date(today + 'T12:00:00') - new Date(year, 0, 1)) / 86400000) + 1 : (year < new Date().getFullYear() ? (isLeap ? 366 : 365) : 0);
  const monthsElapsed = isCurrent ? Number(today.slice(5, 7)) : 12;

  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
  const mt = months.map((k) => store.totals(store.byMonth(k)));
  const cats = store.expensesByCategory(list);
  const prevYears = years.filter((y) => y < year).slice(0, 5);
  const compare = [year, ...prevYears].map((y) => ({ y, ...store.totals(store.byYear(y)) }));
  const prev = compare[1];
  const savingRate = tot.income ? (tot.balance / tot.income) * 100 : 0;
  const deltaHtml = (cur, p, invert = false) => { if (!p) return ''; const d = ((cur - p) / p) * 100; const good = invert ? d <= 0 : d >= 0; return `<span class="${good ? 'pos' : 'neg'}">${d >= 0 ? '▲' : '▼'} ${fmtPct(Math.abs(d))}</span> <span class="muted">vs ${prev.y}</span>`; };

  root.innerHTML = `
    <div class="page-head">
      <div><h1>Bilan annuel</h1><p class="muted">Année civile du 1er janvier au 31 décembre</p></div>
      <div class="btn-row"><button class="icon-btn" data-y="-1">‹</button><select id="y-sel" class="year-select">${yearOptions(year)}</select><button class="icon-btn" data-y="1">›</button></div>
    </div>
    <section class="kpi-grid">
      <div class="card kpi income"><div class="kpi-label">📈 Revenus ${year}</div><div class="kpi-value">${fmtEuro(tot.income)}</div><div class="kpi-sub">${deltaHtml(tot.income, prev?.income)}</div></div>
      <div class="card kpi expense"><div class="kpi-label">📉 Dépenses ${year}</div><div class="kpi-value">${fmtEuro(tot.expense)}</div><div class="kpi-sub">${deltaHtml(tot.expense, prev?.expense, true)}</div></div>
      <div class="card kpi ${tot.balance >= 0 ? 'pos' : 'neg'}"><div class="kpi-label">🐖 Épargne ${year}</div><div class="kpi-value">${fmtEuro(tot.balance)}</div><div class="kpi-sub">Taux d'épargne : ${fmtPct(savingRate)}</div></div>
      <div class="card kpi"><div class="kpi-label">📆 Moyenne mensuelle</div><div class="kpi-value">${fmtEuro(tot.expense / (monthsElapsed || 1))}</div><div class="kpi-sub">de dépenses sur ${monthsElapsed} mois</div></div>
      <div class="card kpi"><div class="kpi-label">📅 Moyenne quotidienne</div><div class="kpi-value">${fmtEuro(tot.expense / (daysElapsed || 1))}</div><div class="kpi-sub">de dépenses sur ${daysElapsed} jours</div></div>
      <div class="card kpi"><div class="kpi-label">🧾 Opérations</div><div class="kpi-value">${list.length}</div><div class="kpi-sub">${list.filter((t) => t.type === 'expense').length} dépenses · ${list.filter((t) => t.type === 'income').length} revenus</div></div>
    </section>

    <section class="grid-2col">
      <div class="card"><h2>Revenus, dépenses et épargne par mois</h2><div id="y-bars" class="chart-box"></div></div>
      <div class="card"><h2>Dépenses par catégorie</h2><div id="y-donut" class="chart-box"></div></div>
    </section>

    <div class="card">
      <h2>Tableau janvier → décembre ${year}</h2>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Mois</th><th class="r">Revenus</th><th class="r">Dépenses</th><th class="r">Solde</th><th class="r">Cumul</th><th></th></tr></thead>
        <tbody>${(() => { let cum = 0; return mt.map((t, i) => { cum = round2(cum + t.balance); const empty = !t.income && !t.expense; return `
          <tr class="${empty ? 'muted' : ''} clickable" data-month="${months[i]}">
            <td>${MONTHS[i]}</td><td class="r pos">${t.income ? fmtEuro(t.income) : '—'}</td><td class="r neg">${t.expense ? fmtEuro(t.expense) : '—'}</td>
            <td class="r ${t.balance >= 0 ? 'pos' : 'neg'}"><b>${empty ? '—' : fmtEuro(t.balance)}</b></td><td class="r">${empty ? '—' : fmtEuro(cum)}</td><td class="r muted">›</td>
          </tr>`; }).join(''); })()}
        </tbody>
        <tfoot><tr><th>Total ${year}</th><th class="r pos">${fmtEuro(tot.income)}</th><th class="r neg">${fmtEuro(tot.expense)}</th><th class="r ${tot.balance >= 0 ? 'pos' : 'neg'}">${fmtEuro(tot.balance)}</th><th></th><th></th></tr></tfoot>
      </table></div>
    </div>

    <section class="grid-2col">
      <div class="card"><h2>Classement des catégories</h2><div id="y-cats"></div></div>
      <div class="card"><h2>Comparaison avec les années précédentes</h2>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Année</th><th class="r">Revenus</th><th class="r">Dépenses</th><th class="r">Épargne</th><th class="r">Taux</th></tr></thead>
          <tbody>${compare.map((c) => `<tr class="${c.y === year ? 'current' : ''} clickable" data-year="${c.y}"><td><b>${c.y}</b></td><td class="r pos">${fmtEuro(c.income)}</td><td class="r neg">${fmtEuro(c.expense)}</td><td class="r ${c.balance >= 0 ? 'pos' : 'neg'}"><b>${fmtEuro(c.balance)}</b></td><td class="r">${c.income ? fmtPct((c.balance / c.income) * 100) : '—'}</td></tr>`).join('')}</tbody>
        </table></div>
        <div id="y-cmp" class="chart-box mt"></div>
      </div>
    </section>`;

  const go = (y) => { year = y; render(root, { navigate }); };
  $('#y-sel', root).onchange = (e) => go(Number(e.target.value));
  $$('[data-y]', root).forEach((b) => b.onclick = () => go(year + Number(b.dataset.y)));
  $$('[data-month]', root).forEach((r) => r.onclick = () => navigate('transactions', { month: r.dataset.month }));
  $$('[data-year]', root).forEach((r) => r.onclick = () => go(Number(r.dataset.year)));

  barChart($('#y-bars', root), { labels: MONTHS_SHORT, series: [
    { name: 'Revenus', color: 'var(--green)', data: mt.map((t) => t.income) },
    { name: 'Dépenses', color: 'var(--red)', data: mt.map((t) => t.expense) },
    { name: 'Épargne', color: 'var(--accent)', data: mt.map((t) => Math.max(0, t.balance)) },
  ], onClick: (i) => navigate('transactions', { month: months[i] }) });
  donutChart($('#y-donut', root), { items: cats.map(({ cat, total }) => ({ id: cat.id, name: cat.name, icon: cat.icon, color: cat.color, value: total })), centerLabel: String(year), size: 220, onClick: (it) => navigate('transactions', { year, category: it.id }) });
  hbarList($('#y-cats', root), cats.map(({ cat, total }) => ({ id: cat.id, name: cat.name, icon: cat.icon, color: cat.color, value: total })), { onClick: (id) => navigate('transactions', { year, category: id }) });
  if (compare.length > 1) {
    const rev = [...compare].reverse();
    barChart($('#y-cmp', root), { labels: rev.map((c) => String(c.y)), series: [{ name: 'Revenus', color: 'var(--green)', data: rev.map((c) => c.income) }, { name: 'Dépenses', color: 'var(--red)', data: rev.map((c) => c.expense) }], height: 180, onClick: (i) => go(rev[i].y) });
  }
}
