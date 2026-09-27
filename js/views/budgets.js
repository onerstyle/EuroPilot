// ============================================================
// views/budgets.js — Budgets mensuels par catégorie + opérations récurrentes
// ============================================================

import { store } from '../store.js';
import { $, $$, esc, fmtEuro, fmtDate, fmtMonth, prevMonth, nextMonth, todayISO, parseAmount, daysInMonth, round2 } from '../utils.js';
import { progressBar, openModal, closeModal, confirm, toast, toastUndo, optionList, emptyState } from '../ui.js';
import { FREQUENCIES } from '../defaults.js';
import { frequencyLabel, monthlyEquivalent, processRecurring } from '../recurring.js';

let current = todayISO().slice(0, 7);

export function render(root) {
  const { state } = store;
  const month = store.byMonth(current);
  const spentBy = Object.fromEntries(store.expensesByCategory(month).map(({ cat, total }) => [cat.id, total]));
  const budgets = Object.entries(state.budgets).map(([id, b]) => ({ cat: store.category(id), budget: b, spent: spentBy[id] || 0 }));
  const totalB = round2(budgets.reduce((a, b) => a + b.budget, 0));
  const totalS = round2(budgets.reduce((a, b) => a + b.spent, 0));
  const [y, m] = current.split('-').map(Number);
  const isCurrent = current === todayISO().slice(0, 7);
  const dayRatio = isCurrent ? Number(todayISO().slice(8)) / daysInMonth(y, m) : 1;

  const recs = [...state.recurring].sort((a, b) => (a.nextDate || '').localeCompare(b.nextDate || ''));
  const fixedExp = round2(recs.filter((r) => r.active && r.type === 'expense').reduce((a, r) => a + monthlyEquivalent(r), 0));
  const fixedInc = round2(recs.filter((r) => r.active && r.type === 'income').reduce((a, r) => a + monthlyEquivalent(r), 0));

  root.innerHTML = `
    <div class="page-head">
      <div><h1>Budgets</h1><p class="muted">Limites mensuelles par catégorie</p></div>
      <button class="btn btn-primary" data-add-budget>＋ Nouveau budget</button>
    </div>
    <div class="month-nav"><button class="icon-btn" data-m="prev">‹</button><h2>${fmtMonth(current)}</h2><button class="icon-btn" data-m="next">›</button></div>

    ${budgets.length ? `
    <div class="card budget-total">
      <div class="budget-total-head"><div><span class="muted">Total des budgets</span><h2>${fmtEuro(totalS)} <small class="muted">/ ${fmtEuro(totalB)}</small></h2></div>
      <div class="right"><span class="muted">Reste</span><h2 class="${totalB - totalS >= 0 ? 'pos' : 'neg'}">${fmtEuro(totalB - totalS)}</h2></div></div>
      ${progressBar(totalS / (totalB || 1))}
      ${isCurrent ? `<p class="muted small">Repère temporel : ${Math.round(dayRatio * 100)} % du mois écoulé</p>` : ''}
    </div>
    <div class="budget-grid">${budgets.sort((a, b) => b.spent / b.budget - a.spent / a.budget).map(({ cat, budget, spent }) => {
      const ratio = spent / budget; const rest = round2(budget - spent);
      const status = ratio >= 1 ? '<span class="badge over">Dépassé</span>' : ratio >= 0.8 ? '<span class="badge warn">Attention</span>' : '<span class="badge ok">OK</span>';
      return `<div class="card budget-card ${ratio >= 1 ? 'over' : ratio >= 0.8 ? 'warn' : ''}" data-cat="${esc(cat.id)}">
        <div class="budget-head"><span class="tx-icon" style="--c:${cat.color}">${cat.icon}</span><b>${esc(cat.name)}</b>${status}</div>
        <div class="budget-lines">
          <div><span class="muted">Budget</span><span>${fmtEuro(budget)}</span></div>
          <div><span class="muted">Dépensé</span><span>${fmtEuro(spent)}</span></div>
          <div><span class="muted">Reste</span><b class="${rest >= 0 ? 'pos' : 'neg'}">${fmtEuro(rest)}</b></div>
        </div>
        ${progressBar(ratio)}
        <div class="muted small">${Math.round(ratio * 100)} % utilisé${rest > 0 && isCurrent ? ` · ${fmtEuro(rest / Math.max(1, daysInMonth(y, m) - Number(todayISO().slice(8)) + 1))} / jour restant` : ''}</div>
      </div>`; }).join('')}</div>`
    : `<div class="card">${emptyState('🎯', 'Aucun budget', 'Définissez une limite mensuelle pour vos catégories de dépenses et suivez-la en temps réel.')}</div>`}

    <div class="page-head mt">
      <div><h1>Opérations récurrentes</h1><p class="muted">Charges fixes ≈ <b class="neg">${fmtEuro(fixedExp)}</b> / mois · Revenus fixes ≈ <b class="pos">${fmtEuro(fixedInc)}</b> / mois</p></div>
      <button class="btn btn-primary" data-add-rec>＋ Nouvelle récurrence</button>
    </div>
    <div class="card">
      ${recs.length ? `<div class="rec-list">${recs.map((r) => { const c = store.category(r.categoryId); return `
        <div class="rec-row ${r.active ? '' : 'inactive'}" data-rec="${esc(r.id)}">
          <span class="tx-icon" style="--c:${c.color}">${c.icon}</span>
          <span class="tx-main"><span class="tx-title">${esc(r.label)}</span><span class="tx-meta">${frequencyLabel(r)} · ${esc(c.name)} · ${esc(store.account(r.accountId).name)}${r.active ? ` · prochaine : ${fmtDate(r.nextDate)}` : ' · en pause'}${r.endDate ? ` · fin : ${fmtDate(r.endDate)}` : ''}</span></span>
          <span class="tx-amount ${r.type}">${r.type === 'income' ? '+' : '−'}${fmtEuro(r.amount)}</span>
        </div>`; }).join('')}</div>` : emptyState('🔁', 'Aucune opération récurrente', 'Loyer, salaire, abonnements… créez-les une fois, EuroPilot les enregistre automatiquement à chaque échéance.')}
    </div>`;

  $('[data-m=prev]', root).onclick = () => { current = prevMonth(current); render(root); };
  $('[data-m=next]', root).onclick = () => { current = nextMonth(current); render(root); };
  $('[data-add-budget]', root).onclick = () => budgetForm();
  $$('[data-cat]', root).forEach((c) => c.onclick = () => budgetForm(c.dataset.cat));
  $('[data-add-rec]', root).onclick = () => recurringForm();
  $$('[data-rec]', root).forEach((r) => r.onclick = () => recurringForm(state.recurring.find((x) => x.id === r.dataset.rec)));
}

/** Formulaire de budget */
function budgetForm(catId = '') {
  const { state } = store;
  const cats = state.categories.filter((c) => c.type === 'expense');
  const cur = catId ? state.budgets[catId] : '';
  const m = openModal({
    title: catId ? 'Modifier le budget' : 'Nouveau budget',
    content: `<form class="tx-form" id="bform">
      <label>Catégorie<select name="cat" ${catId ? 'disabled' : ''}>${optionList(cats, catId)}</select></label>
      <div class="amount-field"><input name="amount" inputmode="decimal" placeholder="0,00" value="${cur || ''}" required><span>€ / mois</span></div>
      <div class="form-actions">${catId ? '<button type="button" class="btn btn-danger-ghost" data-del>Supprimer</button>' : ''}<span class="spacer"></span><button type="button" class="btn btn-ghost" data-close>Annuler</button><button class="btn btn-primary">Enregistrer</button></div>
    </form>`,
  });
  const f = $('#bform', m);
  f.onsubmit = (e) => { e.preventDefault(); const id = catId || f.elements.cat.value; const a = parseAmount(f.elements.amount.value); if (a <= 0) return toast('Montant invalide', { type: 'error' }); store.setBudget(id, a); closeModal(); toastUndo('Budget enregistré'); };
  if (catId) $('[data-del]', f).onclick = async () => { if (await confirm('Supprimer ce budget ?', { okLabel: 'Supprimer' })) { store.setBudget(catId, 0); closeModal(); toastUndo('Budget supprimé'); } };
}

/** Formulaire de récurrence (export pour réutilisation) */
export function recurringForm(rec = null) {
  const { state } = store;
  const r = { label: '', amount: '', type: 'expense', categoryId: '', sub: '', paymentId: state.settings.defaultPayment, accountId: state.settings.defaultAccount, frequency: 'monthly', interval: 1, startDate: todayISO(), endDate: '', active: true, ...(rec || {}) };
  const cats = (t) => state.categories.filter((c) => c.type === t);
  const m = openModal({
    title: rec ? 'Modifier la récurrence' : 'Nouvelle opération récurrente',
    content: `<form class="tx-form" id="rform">
      <div class="type-toggle"><label class="${r.type === 'expense' ? 'active' : ''}"><input type="radio" name="type" value="expense" ${r.type === 'expense' ? 'checked' : ''}> Dépense</label><label class="${r.type === 'income' ? 'active' : ''}"><input type="radio" name="type" value="income" ${r.type === 'income' ? 'checked' : ''}> Revenu</label></div>
      <div class="amount-field"><input name="amount" inputmode="decimal" placeholder="0,00" value="${r.amount || ''}" required><span>€</span></div>
      <div class="grid-2">
        <label>Libellé<input name="label" value="${esc(r.label)}" placeholder="Ex : Loyer, Salaire, Netflix…" required></label>
        <label>Catégorie<select name="categoryId">${optionList(cats(r.type), r.categoryId)}</select></label>
        <label>Fréquence<select name="frequency">${FREQUENCIES.map((f) => `<option value="${f.id}" ${f.id === r.frequency ? 'selected' : ''}>${f.name}</option>`).join('')}</select></label>
        <label>Intervalle<input type="number" name="interval" min="1" value="${r.interval || 1}"><small class="muted">Ex : 2 = tous les 2 mois / semaines…</small></label>
        <label>Première échéance<input type="date" name="startDate" value="${esc(r.startDate)}" required></label>
        <label>Fin (facultatif)<input type="date" name="endDate" value="${esc(r.endDate || '')}"></label>
        <label>Moyen de paiement<select name="paymentId">${optionList(state.payments, r.paymentId)}</select></label>
        <label>Compte<select name="accountId">${optionList(state.accounts, r.accountId)}</select></label>
      </div>
      <label class="check"><input type="checkbox" name="active" ${r.active ? 'checked' : ''}> Active (génère automatiquement les opérations)</label>
      <div class="form-actions">${rec ? '<button type="button" class="btn btn-danger-ghost" data-del>Supprimer</button>' : ''}<span class="spacer"></span><button type="button" class="btn btn-ghost" data-close>Annuler</button><button class="btn btn-primary">Enregistrer</button></div>
    </form>`,
  });
  const f = $('#rform', m);
  $$('.type-toggle input', f).forEach((i) => i.onchange = () => { $$('.type-toggle label', f).forEach((l) => l.classList.toggle('active', $('input', l).checked)); f.elements.categoryId.innerHTML = optionList(cats(i.value)); });
  f.onsubmit = (e) => {
    e.preventDefault();
    const amount = parseAmount(f.elements.amount.value); if (amount <= 0) return toast('Montant invalide', { type: 'error' });
    const data = { id: rec?.id, label: f.elements.label.value.trim(), amount, type: f.elements.type.value, categoryId: f.elements.categoryId.value, frequency: f.elements.frequency.value, interval: Math.max(1, Number(f.elements.interval.value) || 1), startDate: f.elements.startDate.value, endDate: f.elements.endDate.value || '', paymentId: f.elements.paymentId.value, accountId: f.elements.accountId.value, active: f.elements.active.checked };
    if (!rec || rec.startDate !== data.startDate) data.nextDate = data.startDate; // nouvelle date de départ -> on repart de là
    store.saveRecurring(data);
    const n = processRecurring();
    closeModal();
    toastUndo(n ? `Récurrence enregistrée · ${n} opération(s) générée(s)` : 'Récurrence enregistrée');
  };
  if (rec) $('[data-del]', f).onclick = async () => { if (await confirm('Supprimer cette récurrence ? Les opérations déjà générées sont conservées.', { okLabel: 'Supprimer' })) { store.deleteRecurring(rec.id); closeModal(); toastUndo('Récurrence supprimée'); } };
}
