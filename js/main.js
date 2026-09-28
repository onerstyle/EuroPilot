// ============================================================
// main.js — Point d'entrée : routeur, navigation, thème, raccourcis
// ============================================================

import { store } from './store.js';
import { $, $$, fmtEuro } from './utils.js';
import { transactionForm, toast, closeModal, confirm } from './ui.js';
import { processRecurring } from './recurring.js';
import { initDriveSync, getDriveStatus, onDriveStatus } from './drive.js';

/** Table des vues (chargées à la demande) */
const VIEWS = {
  dashboard: { title: 'Dashboard', icon: '🏠', load: () => import('./views/dashboard.js') },
  transactions: { title: 'Transactions', icon: '📋', load: () => import('./views/transactions.js') },
  calendar: { title: 'Calendrier', icon: '📅', load: () => import('./views/calendar.js') },
  budgets: { title: 'Budgets', icon: '🎯', load: () => import('./views/budgets.js') },
  stats: { title: 'Statistiques', icon: '📊', load: () => import('./views/stats.js') },
  accounts: { title: 'Comptes', icon: '🏦', load: () => import('./views/accounts.js') },
  years: { title: 'Années', icon: '🗓️', load: () => import('./views/years.js') },
  settings: { title: 'Paramètres', icon: '⚙️', load: () => import('./views/settings.js') },
};

let currentView = 'dashboard';
let currentParams = {};
const root = $('#view');

/** Navigation : met à jour le hash, la vue et le menu */
export function navigate(view, params = {}) {
  if (!VIEWS[view]) view = 'dashboard';
  currentView = view; currentParams = params;
  const hash = '#/' + view;
  if (location.hash !== hash) history.pushState(null, '', hash);
  closeModal();
  renderCurrent();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/** Rend la vue courante */
let renderToken = 0;
async function renderCurrent() {
  const token = ++renderToken; // permet d'ignorer un rendu devenu obsolète
  const view = currentView;
  const params = currentParams;
  currentParams = {}; // les paramètres ne servent qu'au premier rendu
  $$('[data-view]').forEach((a) => a.classList.toggle('active', a.dataset.view === view));
  document.title = `${VIEWS[view].title} · EuroPilot`;
  const mod = await VIEWS[view].load();
  if (token !== renderToken) return; // un rendu plus récent a été demandé entre-temps
  root.className = 'view view-' + view;
  mod.render(root, { navigate, params });
  $('#app').classList.remove('nav-open');
}

/** Thème clair / sombre / auto */
export function applyTheme() {
  const t = store.state.settings.theme || 'auto';
  const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  $('meta[name=theme-color]')?.setAttribute('content', dark ? '#0f172a' : '#2563eb');
  const btn = $('#theme-toggle'); if (btn) btn.textContent = dark ? '☀️' : '🌙';
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

/** Construit le menu de navigation (barre latérale + barre mobile) */
function buildNav() {
  const side = $('#nav-side'), bottom = $('#nav-bottom');
  side.innerHTML = Object.entries(VIEWS).map(([k, v]) => `<a href="#/${k}" data-view="${k}"><span class="nav-icon">${v.icon}</span><span>${v.title}</span></a>`).join('');
  // Barre mobile : 4 raccourcis + bouton "+" central + menu
  const mobile = ['dashboard', 'transactions', 'calendar', 'stats'];
  bottom.innerHTML = mobile.slice(0, 2).map((k) => `<a href="#/${k}" data-view="${k}"><span class="nav-icon">${VIEWS[k].icon}</span><span>${VIEWS[k].title}</span></a>`).join('')
    + `<button class="fab-inline" id="fab-mobile" aria-label="Ajouter une transaction">＋</button>`
    + mobile.slice(2).map((k) => `<a href="#/${k}" data-view="${k}"><span class="nav-icon">${VIEWS[k].icon}</span><span>${VIEWS[k].title}</span></a>`).join('')
    + `<button id="more-btn" class="more" aria-label="Plus"><span class="nav-icon">☰</span><span>Plus</span></button>`;
  $$('[data-view]').forEach((a) => a.onclick = (e) => { e.preventDefault(); navigate(a.dataset.view); });
  $('#fab-mobile').onclick = () => transactionForm();
  $('#more-btn').onclick = () => $('#app').classList.toggle('nav-open');
  $('#nav-backdrop').onclick = () => $('#app').classList.remove('nav-open');
}

/** Bandeau de bienvenue à la première ouverture */
function onboarding() {
  if (store.state.settings.onboarded) return;
  const b = $('#welcome');
  b.hidden = false;
  $('[data-demo]', b).onclick = async () => { const { loadDemo } = await import('./demo.js'); loadDemo(); store.setSetting('onboarded', true); b.hidden = true; toast('Données de démonstration chargées — vous pouvez les effacer dans Paramètres', { type: 'success', duration: 6000 }); };
  $('[data-start]', b).onclick = () => { store.setSetting('onboarded', true); b.hidden = true; transactionForm(); };
  $('[data-dismiss]', b).onclick = () => { store.setSetting('onboarded', true); b.hidden = true; };
}

// ---------- Initialisation ----------
function init() {
  applyTheme();
  buildNav();
  // Synchronisation Drive (optionnelle, silencieuse au démarrage)
  try { initDriveSync(); } catch (e) { console.warn('[drive] init échoué', e); }

  // Génération des opérations récurrentes échues
  const n = processRecurring();
  if (n) toast(`${n} opération(s) récurrente(s) enregistrée(s) automatiquement`, { type: 'info', duration: 6000 });

  // Routage par hash (#/transactions)
  const fromHash = () => { const v = (location.hash.replace(/^#\/?/, '') || 'dashboard').split('?')[0]; currentView = VIEWS[v] ? v : 'dashboard'; renderCurrent(); };
  window.addEventListener('popstate', fromHash);
  window.addEventListener('hashchange', fromHash);
  fromHash();

  // Re-rendu automatique quand les données changent
  store.subscribe(() => { renderCurrent(); updateHeader(); });
  updateHeader();

  // Boutons globaux
  $('#fab').onclick = () => transactionForm();
  $('#theme-toggle').onclick = () => { const cur = document.documentElement.dataset.theme; store.setSetting('theme', cur === 'dark' ? 'light' : 'dark'); applyTheme(); };
  $('#undo-btn').onclick = () => { const l = store.undo(); toast(l ? `Annulé : ${l}` : 'Rien à annuler'); };

  // Raccourcis clavier : N = nouvelle transaction, Ctrl+Z = annuler
  document.addEventListener('keydown', (e) => {
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
    if (!typing && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'n') { e.preventDefault(); transactionForm(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); const l = store.undo(); if (l) toast(`Annulé : ${l}`); }
  });

  // Redessine les graphiques au redimensionnement
  let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(renderCurrent, 200); });

  onboarding();

  // Service worker pour le mode hors ligne (uniquement en http/https).
  // Jamais dans l'APK Android : les fichiers y sont déjà embarqués par
  // Capacitor, et un service worker y servirait des versions périmées des
  // assets après une mise à jour de l'application.
  const isNative = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
  if (!isNative && 'serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
}

/** En-tête : solde global + état du bouton d'annulation + indicateur Drive */
function updateHeader() {
  const b = store.totalBalance();
  const el = $('#header-balance'); el.textContent = fmtEuro(b); el.className = b >= 0 ? 'pos' : 'neg';
  const u = $('#undo-btn'); u.disabled = !store.canUndo; u.title = store.canUndo ? `Annuler : ${store.lastUndoLabel}` : 'Rien à annuler';
  // Indicateur discret Drive (point vert/bleu/gris dans le header)
  const ds = getDriveStatus();
  let dot = $('#drive-dot');
  if (!dot) {
    const bal = document.querySelector('.topbar-balance');
    if (bal) {
      dot = document.createElement('span');
      dot.id = 'drive-dot';
      dot.title = 'Google Drive';
      dot.style.cssText = 'display:inline-block;width:8px;height:8px;border-radius:50%;margin-left:6px;vertical-align:middle;';
      bal.querySelector('b')?.appendChild(dot);
      // alternative: ajouter à côté du solde sur mobile
    }
  }
  if (dot) {
    if (ds.syncing) { dot.style.background = '#3b82f6'; dot.title = 'Synchronisation Drive…'; dot.style.boxShadow = '0 0 0 3px rgba(59,130,246,.25)'; }
    else if (ds.signedIn) { dot.style.background = '#16a34a'; dot.title = `Drive connecté — dernière sync : ${ds.lastSync ? new Date(ds.lastSync).toLocaleString('fr-FR') : 'jamais'}`; dot.style.boxShadow = '0 0 0 3px rgba(22,163,74,.2)'; }
    else if (ds.configured) { dot.style.background = '#94a3b8'; dot.title = 'Drive configuré mais non connecté'; dot.style.boxShadow = 'none'; }
    else { dot.style.background = 'transparent'; dot.title = 'Drive non configuré'; dot.style.boxShadow = 'none'; }
  }
}

// Abonnement Drive → met à jour le header quand le statut change
try { onDriveStatus(() => updateHeader()); } catch {}

init();
