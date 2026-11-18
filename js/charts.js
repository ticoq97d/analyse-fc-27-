// Petits graphiques SVG (courbes et barres) avec info-bulle au toucher.

const W = 340, H = 180, PAD = { l: 34, r: 12, t: 12, b: 26 };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function legend(series) {
  if (series.length < 2) return '';
  return `<div class="legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>`;
}

// Maximum « rond » pour des graduations lisibles (0, 5, 10, 15…)
function niceMax(v, ticks) {
  const raw = v / ticks;
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map((m) => m * p).find((x) => x >= raw);
  return step * ticks;
}

function grid(yMin, yMax, ticks, unit) {
  const ih = H - PAD.t - PAD.b;
  let g = '';
  for (let i = 0; i <= ticks; i++) {
    const v = yMin + ((yMax - yMin) * i) / ticks;
    const y = PAD.t + ih - (ih * i) / ticks;
    g += `<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${y}" y2="${y}" class="grid"/>`;
    g += `<text x="${PAD.l - 6}" y="${y + 3.5}" class="axis" text-anchor="end">${Math.round(v * 10) / 10}${unit}</text>`;
  }
  return g;
}

function xLabels(labels, xAt) {
  if (!labels.length) return '';
  const idx = labels.length <= 2 ? labels.map((_, i) => i) : [0, Math.floor((labels.length - 1) / 2), labels.length - 1];
  return [...new Set(idx)].map((i) => {
    const anchor = i === 0 ? 'start' : i === labels.length - 1 ? 'end' : 'middle';
    return `<text x="${xAt(i)}" y="${H - 8}" class="axis" text-anchor="${anchor}">${esc(labels[i])}</text>`;
  }).join('');
}

// series: [{name, color, values:[number|null]}], labels: [string], tips: [string] (titre de l'info-bulle)
export function lineChart(el, { series, labels, yMin = 0, yMax, unit = '', ticks = 4, fmt = (v) => v }) {
  const n = labels.length;
  const all = series.flatMap((s) => s.values).filter((v) => v !== null);
  if (!n || !all.length) { el.innerHTML = '<p class="empty">Pas encore assez de données.</p>'; return; }
  if (yMax === undefined) yMax = niceMax(Math.max(...all) * 1.05, ticks);
  const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;
  const xAt = (i) => PAD.l + (n === 1 ? iw / 2 : (iw * i) / (n - 1));
  const yAt = (v) => PAD.t + ih - ((v - yMin) / (yMax - yMin)) * ih;

  let paths = '';
  for (const s of series) {
    let d = '', pen = false;
    s.values.forEach((v, i) => {
      if (v === null) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`; pen = true;
    });
    paths += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    const li = s.values.map((v, i) => (v === null ? -1 : i)).filter((i) => i >= 0).pop();
    if (li !== undefined) {
      paths += `<circle cx="${xAt(li)}" cy="${yAt(s.values[li])}" r="4" fill="${s.color}" stroke="var(--card)" stroke-width="2"/>`;
    }
  }

  el.innerHTML = `${legend(series)}<div class="chart-wrap"><svg viewBox="0 0 ${W} ${H}" class="chart" role="img">
    ${grid(yMin, yMax, ticks, unit)}${xLabels(labels, xAt)}${paths}
    <line class="cross" style="opacity:0" y1="${PAD.t}" y2="${H - PAD.b}" x1="-10" x2="-10"/>
    <g class="dots"></g>
    <rect x="${PAD.l}" y="0" width="${iw}" height="${H}" fill="transparent" class="hit"/>
  </svg><div class="tip" hidden></div></div>`;

  const svg = el.querySelector('svg'), tip = el.querySelector('.tip'), cross = el.querySelector('.cross'), dots = el.querySelector('.dots');
  const show = (evt) => {
    const rect = svg.getBoundingClientRect();
    const p = evt.touches ? evt.touches[0] : evt;
    const x = ((p.clientX - rect.left) / rect.width) * W;
    const i = Math.max(0, Math.min(n - 1, Math.round(n === 1 ? 0 : ((x - PAD.l) / iw) * (n - 1))));
    cross.setAttribute('x1', xAt(i)); cross.setAttribute('x2', xAt(i)); cross.style.opacity = 1;
    dots.innerHTML = series.map((s) => (s.values[i] === null ? '' :
      `<circle cx="${xAt(i)}" cy="${yAt(s.values[i])}" r="4.5" fill="${s.color}" stroke="var(--card)" stroke-width="2"/>`)).join('');
    tip.hidden = false;
    tip.innerHTML = `<b>${esc(labels[i])}</b>${series.map((s) =>
      `<div><i style="background:${s.color}"></i>${esc(s.name)} <strong>${s.values[i] === null ? '–' : esc(fmt(s.values[i]))}</strong></div>`).join('')}`;
    const px = (xAt(i) / W) * rect.width;
    tip.style.left = `${Math.min(Math.max(px - tip.offsetWidth / 2, 0), rect.width - tip.offsetWidth)}px`;
  };
  const hide = () => { tip.hidden = true; dots.innerHTML = ''; cross.style.opacity = 0; };
  svg.addEventListener('pointerdown', show);
  svg.addEventListener('pointermove', show);
  svg.addEventListener('pointerleave', hide);
}

// Barres groupées : series [{name,color,values}], une barre par série et par étiquette.
export function barChart(el, { series, labels, unit = '', fmt = (v) => v }) {
  const n = labels.length;
  const all = series.flatMap((s) => s.values).filter((v) => v !== null);
  if (!n || !all.length) { el.innerHTML = '<p class="empty">Pas encore assez de données.</p>'; return; }
  const yMax = niceMax(Math.max(4, ...all), 4);
  const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;
  const slot = iw / n;
  const bw = Math.min(16, (slot - 6) / series.length - 2);
  const xAt = (i) => PAD.l + slot * i + slot / 2;
  const yAt = (v) => PAD.t + ih - (v / yMax) * ih;

  let bars = '';
  labels.forEach((_, i) => {
    const groupW = series.length * (bw + 2) - 2;
    series.forEach((s, k) => {
      const v = s.values[i]; if (v === null || v === 0) return;
      const x = xAt(i) - groupW / 2 + k * (bw + 2);
      const y = yAt(v), h = PAD.t + ih - y, r = Math.min(4, bw / 2, h);
      bars += `<path d="M${x},${PAD.t + ih}V${y + r}Q${x},${y} ${x + r},${y}H${x + bw - r}Q${x + bw},${y} ${x + bw},${y + r}V${PAD.t + ih}Z" fill="${s.color}"/>`;
    });
    bars += `<rect x="${PAD.l + slot * i}" y="0" width="${slot}" height="${H}" fill="transparent" data-i="${i}" class="hit"/>`;
  });

  el.innerHTML = `${legend(series)}<div class="chart-wrap"><svg viewBox="0 0 ${W} ${H}" class="chart" role="img">
    ${grid(0, yMax, 4, unit)}${xLabels(labels, xAt)}<rect class="hl" x="-100" y="${PAD.t}" width="${slot}" height="${ih}"/>${bars}
  </svg><div class="tip" hidden></div></div>`;

  const svg = el.querySelector('svg'), tip = el.querySelector('.tip'), hl = el.querySelector('.hl');
  svg.querySelectorAll('.hit').forEach((h) => {
    const on = () => {
      const i = +h.dataset.i;
      hl.setAttribute('x', PAD.l + slot * i);
      tip.hidden = false;
      tip.innerHTML = `<b>${esc(labels[i])}</b>${series.map((s) =>
        `<div><i style="background:${s.color}"></i>${esc(s.name)} <strong>${s.values[i] === null ? '–' : esc(fmt(s.values[i]))}</strong></div>`).join('')}`;
      const rect = svg.getBoundingClientRect();
      const px = (xAt(i) / W) * rect.width;
      tip.style.left = `${Math.min(Math.max(px - tip.offsetWidth / 2, 0), rect.width - tip.offsetWidth)}px`;
    };
    h.addEventListener('pointerdown', on);
    h.addEventListener('pointerenter', on);
  });
  svg.addEventListener('pointerleave', () => { tip.hidden = true; hl.setAttribute('x', -100); });
}
