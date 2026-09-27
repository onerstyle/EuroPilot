// ============================================================
// charts.js — Graphiques SVG légers, sans dépendance externe
// (barres, barres groupées, courbes, anneau). Fonctionne hors ligne.
// ============================================================

import { esc, fmtEuro } from './utils.js';

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, children = []) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  children.forEach((c) => n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
  return n;
};

/** Arrondit le maximum à une valeur "propre" pour l'axe Y */
const niceMax = (v) => {
  if (v <= 0) return 100;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  const m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return m * p;
};
const fmtAxis = (v) => (Math.abs(v) >= 1000 ? (v / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' k€' : v.toLocaleString('fr-FR') + ' €');

/** Infobulle partagée */
let tip;
function showTip(e, htmlContent) {
  if (!tip) { tip = document.createElement('div'); tip.className = 'chart-tip'; document.body.appendChild(tip); }
  tip.innerHTML = htmlContent; tip.style.display = 'block';
  moveTip(e);
}
function moveTip(e) {
  if (!tip) return;
  const x = Math.min(e.clientX + 12, window.innerWidth - tip.offsetWidth - 8);
  const y = e.clientY - tip.offsetHeight - 12;
  tip.style.left = x + 'px'; tip.style.top = Math.max(8, y) + 'px';
}
function hideTip() { if (tip) tip.style.display = 'none'; }

/**
 * Graphique en barres (simples ou groupées).
 * @param {HTMLElement} container
 * @param {{labels:string[], series:{name:string,color:string,data:number[]}[], height?:number, onClick?:(i)=>void}} cfg
 */
export function barChart(container, { labels, series, height = 220, onClick, stacked = false }) {
  container.innerHTML = '';
  const W = Math.max(320, container.clientWidth || 600), H = height;
  const pad = { l: 56, r: 12, t: 12, b: 28 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const maxRaw = stacked
    ? Math.max(...labels.map((_, i) => series.reduce((a, s) => a + (s.data[i] || 0), 0)), 0)
    : Math.max(...series.flatMap((s) => s.data), 0);
  const max = niceMax(maxRaw);
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', width: '100%', height: H });

  // Grille + axe Y
  for (let i = 0; i <= 4; i++) {
    const y = pad.t + ih - (ih * i) / 4;
    svg.appendChild(el('line', { x1: pad.l, x2: W - pad.r, y1: y, y2: y, class: 'grid' }));
    svg.appendChild(el('text', { x: pad.l - 6, y: y + 4, class: 'axis', 'text-anchor': 'end' }, [fmtAxis((max * i) / 4)]));
  }
  const n = labels.length, gw = iw / n, gap = Math.min(10, gw * 0.25);
  const bw = stacked ? gw - gap : (gw - gap) / series.length;
  labels.forEach((lab, i) => {
    const g = el('g', { class: 'bar-group' + (onClick ? ' clickable' : '') });
    let stackY = pad.t + ih;
    series.forEach((s, si) => {
      const v = s.data[i] || 0;
      const h = (v / max) * ih;
      const x = stacked ? pad.l + i * gw + gap / 2 : pad.l + i * gw + gap / 2 + si * bw;
      const y = stacked ? stackY - h : pad.t + ih - h;
      if (stacked) stackY -= h;
      const r = el('rect', { x, y, width: Math.max(1, bw - (stacked ? 0 : 2)), height: Math.max(0, h), rx: 3, fill: s.color, class: 'bar' });
      r.addEventListener('mouseenter', (e) => showTip(e, `<b>${esc(lab)}</b><br>${esc(s.name)} : ${fmtEuro(v)}`));
      r.addEventListener('mousemove', moveTip); r.addEventListener('mouseleave', hideTip);
      g.appendChild(r);
    });
    if (n <= 16 || i % Math.ceil(n / 12) === 0) svg.appendChild(el('text', { x: pad.l + i * gw + gw / 2, y: H - 8, class: 'axis', 'text-anchor': 'middle' }, [lab]));
    if (onClick) g.addEventListener('click', () => onClick(i));
    svg.appendChild(g);
  });
  container.appendChild(svg);
  if (series.length > 1) container.appendChild(legend(series));
}

/**
 * Courbe(s) avec aire.
 * @param {{labels:string[], series:{name,color,data}[], height?, area?}} cfg
 */
export function lineChart(container, { labels, series, height = 220, area = true, zeroLine = false }) {
  container.innerHTML = '';
  const W = Math.max(320, container.clientWidth || 600), H = height;
  const pad = { l: 56, r: 12, t: 12, b: 28 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const all = series.flatMap((s) => s.data);
  let max = niceMax(Math.max(...all, 0));
  let min = Math.min(...all, 0);
  if (min < 0) min = -niceMax(-min);
  const range = max - min || 1;
  const yOf = (v) => pad.t + ih - ((v - min) / range) * ih;
  const xOf = (i) => pad.l + (labels.length > 1 ? (i / (labels.length - 1)) * iw : iw / 2);
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', width: '100%', height: H });
  for (let i = 0; i <= 4; i++) {
    const v = min + (range * i) / 4, y = yOf(v);
    svg.appendChild(el('line', { x1: pad.l, x2: W - pad.r, y1: y, y2: y, class: 'grid' }));
    svg.appendChild(el('text', { x: pad.l - 6, y: y + 4, class: 'axis', 'text-anchor': 'end' }, [fmtAxis(v)]));
  }
  if (zeroLine && min < 0) svg.appendChild(el('line', { x1: pad.l, x2: W - pad.r, y1: yOf(0), y2: yOf(0), class: 'zero' }));
  series.forEach((s) => {
    const pts = s.data.map((v, i) => [xOf(i), yOf(v)]);
    const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    if (area && pts.length > 1) svg.appendChild(el('path', { d: `${d} L${pts.at(-1)[0]} ${yOf(Math.max(min, 0))} L${pts[0][0]} ${yOf(Math.max(min, 0))} Z`, fill: s.color, opacity: 0.12 }));
    svg.appendChild(el('path', { d, fill: 'none', stroke: s.color, 'stroke-width': 2.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    pts.forEach(([x, y], i) => {
      const c = el('circle', { cx: x, cy: y, r: 4, fill: s.color, class: 'dot' });
      c.addEventListener('mouseenter', (e) => showTip(e, `<b>${esc(labels[i])}</b><br>${esc(s.name)} : ${fmtEuro(s.data[i])}`));
      c.addEventListener('mousemove', moveTip); c.addEventListener('mouseleave', hideTip);
      svg.appendChild(c);
    });
  });
  const step = Math.ceil(labels.length / 12);
  labels.forEach((lab, i) => { if (i % step === 0 || i === labels.length - 1) svg.appendChild(el('text', { x: xOf(i), y: H - 8, class: 'axis', 'text-anchor': 'middle' }, [lab])); });
  container.appendChild(svg);
  if (series.length > 1) container.appendChild(legend(series));
}

/**
 * Anneau (donut) de répartition.
 * @param {{items:{name,color,value,icon?}[], size?, total?, centerLabel?}} cfg
 */
export function donutChart(container, { items, size = 200, centerLabel = 'Total', onClick }) {
  container.innerHTML = '';
  const total = items.reduce((a, x) => a + x.value, 0);
  const wrap = document.createElement('div'); wrap.className = 'donut-wrap';
  const svg = el('svg', { viewBox: '0 0 100 100', class: 'donut', width: size, height: size });
  const r = 38, c = 2 * Math.PI * r;
  let offset = 0;
  if (!total) svg.appendChild(el('circle', { cx: 50, cy: 50, r, fill: 'none', stroke: 'var(--border)', 'stroke-width': 16 }));
  items.forEach((it) => {
    const frac = it.value / total;
    const seg = el('circle', {
      cx: 50, cy: 50, r, fill: 'none', stroke: it.color, 'stroke-width': 16, class: 'seg' + (onClick ? ' clickable' : ''),
      'stroke-dasharray': `${frac * c} ${c}`, 'stroke-dashoffset': -offset * c, transform: 'rotate(-90 50 50)',
    });
    seg.addEventListener('mouseenter', (e) => showTip(e, `<b>${esc(it.name)}</b><br>${fmtEuro(it.value)} (${(frac * 100).toFixed(1).replace('.', ',')} %)`));
    seg.addEventListener('mousemove', moveTip); seg.addEventListener('mouseleave', hideTip);
    if (onClick) seg.addEventListener('click', () => onClick(it));
    svg.appendChild(seg);
    offset += frac;
  });
  svg.appendChild(el('text', { x: 50, y: 47, class: 'donut-center-label', 'text-anchor': 'middle' }, [centerLabel]));
  svg.appendChild(el('text', { x: 50, y: 58, class: 'donut-center-value', 'text-anchor': 'middle' }, [fmtAxis(total)]));
  wrap.appendChild(svg);
  const leg = document.createElement('ul'); leg.className = 'donut-legend';
  items.slice(0, 8).forEach((it) => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="swatch" style="background:${esc(it.color)}"></span><span class="name">${it.icon || ''} ${esc(it.name)}</span><span class="val">${fmtEuro(it.value)}</span><span class="pct">${total ? ((it.value / total) * 100).toFixed(0) : 0} %</span>`;
    if (onClick) { li.classList.add('clickable'); li.onclick = () => onClick(it); }
    leg.appendChild(li);
  });
  wrap.appendChild(leg);
  container.appendChild(wrap);
}

/** Légende simple */
function legend(series) {
  const ul = document.createElement('ul'); ul.className = 'legend';
  series.forEach((s) => { const li = document.createElement('li'); li.innerHTML = `<span class="swatch" style="background:${esc(s.color)}"></span>${esc(s.name)}`; ul.appendChild(li); });
  return ul;
}

/** Barres horizontales (classement de catégories) */
export function hbarList(container, items, { onClick } = {}) {
  const max = Math.max(...items.map((i) => i.value), 1);
  container.innerHTML = items.length ? items.map((it) => `
    <div class="hbar ${onClick ? 'clickable' : ''}" data-id="${esc(it.id || '')}">
      <span class="hbar-label">${it.icon || ''} ${esc(it.name)}</span>
      <span class="hbar-track"><span style="width:${(it.value / max) * 100}%;background:${esc(it.color)}"></span></span>
      <span class="hbar-value">${fmtEuro(it.value)}</span>
    </div>`).join('') : '<p class="muted">Aucune donnée</p>';
  if (onClick) container.querySelectorAll('.hbar').forEach((h) => h.onclick = () => onClick(h.dataset.id));
}
