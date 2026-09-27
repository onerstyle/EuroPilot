// ============================================================
// views/calendar.js — Vue calendrier mensuelle
// ============================================================

import { store } from '../store.js';
import { $, $$, esc, fmtEuro, fmtMonth, fmtDateLong, prevMonth, nextMonth, todayISO, daysInMonth, DAYS_SHORT } from '../utils.js';
import { txRow, bindTxRows, emptyState, transactionForm } from '../ui.js';

let current = todayISO().slice(0, 7);
let selected = todayISO();

export function render(root) {
  const today = todayISO();
  const [y, m] = current.split('-').map(Number);
  const dim = daysInMonth(y, m);
  const firstDow = (new Date(y, m - 1, 1).getDay() + 6) % 7; // Lundi = 0
  const month = store.byMonth(current);
  const tot = store.totals(month);

  // Totaux par jour
  const byDay = {};
  month.forEach((t) => { const d = byDay[t.date] ||= { income: 0, expense: 0, n: 0 }; d[t.type] += t.amount; d.n++; });
  const maxExp = Math.max(...Object.values(byDay).map((d) => d.expense), 1);

  let cells = '';
  for (let i = 0; i < firstDow; i++) cells += '<div class="cal-cell empty"></div>';
  for (let d = 1; d <= dim; d++) {
    const iso = `${current}-${String(d).padStart(2, '0')}`;
    const info = byDay[iso];
    const net = info ? info.income - info.expense : 0;
    const heat = info ? Math.min(1, info.expense / maxExp) : 0;
    cells += `<div class="cal-cell ${iso === today ? 'today' : ''} ${iso === selected ? 'selected' : ''} ${info ? 'has' : ''}" data-day="${iso}" style="--heat:${heat.toFixed(2)}">
      <span class="cal-num">${d}</span>
      ${info ? `<span class="cal-net ${net >= 0 ? 'pos' : 'neg'}">${net >= 0 ? '+' : '−'}${fmtEuro(Math.abs(net), { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
      <span class="cal-dots">${info.expense ? '<i class="dot-exp"></i>' : ''}${info.income ? '<i class="dot-inc"></i>' : ''}</span>` : ''}
    </div>`;
  }

  root.innerHTML = `
    <div class="page-head">
      <div><h1>Calendrier</h1><p class="muted">${fmtMonth(current)} · <span class="pos">+${fmtEuro(tot.income)}</span> / <span class="neg">−${fmtEuro(tot.expense)}</span></p></div>
      <div class="btn-row">
        <button class="btn btn-ghost" data-today>Aujourd'hui</button>
        <button class="btn btn-primary" data-add>＋ Ajouter</button>
      </div>
    </div>
    <div class="grid-cal">
      <div class="card">
        <div class="month-nav"><button class="icon-btn" data-m="prev">‹</button><h2>${fmtMonth(current)}</h2><button class="icon-btn" data-m="next">›</button></div>
        <div class="cal-grid">${DAYS_SHORT.map((d) => `<div class="cal-dow">${d}</div>`).join('')}${cells}</div>
      </div>
      <div class="card" id="day-panel"></div>
    </div>`;

  const goto = (ym) => { current = ym; selected = ym === today.slice(0, 7) ? today : ym + '-01'; render(root); };
  $('[data-m=prev]', root).onclick = () => goto(prevMonth(current));
  $('[data-m=next]', root).onclick = () => goto(nextMonth(current));
  $('[data-today]', root).onclick = () => goto(today.slice(0, 7));
  $('[data-add]', root).onclick = () => transactionForm(null, { date: selected });
  $$('.cal-cell[data-day]', root).forEach((c) => c.onclick = () => { selected = c.dataset.day; $$('.cal-cell.selected', root).forEach((x) => x.classList.remove('selected')); c.classList.add('selected'); renderDay(); });

  function renderDay() {
    const list = store.byDay(selected).sort((a, b) => b.amount - a.amount);
    const t = store.totals(list);
    $('#day-panel', root).innerHTML = `
      <h2 class="cap">${fmtDateLong(selected)}</h2>
      <div class="day-totals">
        <div><span class="muted">Revenus</span><b class="pos">${fmtEuro(t.income)}</b></div>
        <div><span class="muted">Dépenses</span><b class="neg">${fmtEuro(t.expense)}</b></div>
        <div><span class="muted">Total du jour</span><b class="${t.balance >= 0 ? 'pos' : 'neg'}">${t.balance >= 0 ? '+' : '−'}${fmtEuro(Math.abs(t.balance))}</b></div>
      </div>
      <div class="tx-list">${list.length ? list.map((x) => txRow(x)).join('') : emptyState('📭', 'Aucune opération ce jour')}</div>
      <button class="btn btn-ghost full" data-add-day>＋ Ajouter une opération le ${esc(selected.split('-').reverse().join('/'))}</button>`;
    bindTxRows(root);
    $('[data-add-day]', root).onclick = () => transactionForm(null, { date: selected });
  }
  renderDay();
}
