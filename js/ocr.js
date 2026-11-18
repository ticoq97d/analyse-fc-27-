// Lecture de l'écran de stats avec Tesseract.js, 100 % sur le téléphone.
// Les fichiers de Tesseract sont hébergés avec l'appli (dossier vendor/).
import { STAT_KEYS } from './stats.js';

const base = (p) => new URL(p, document.baseURI).href;
let worker = null;
let progressCb = null;
let phase = 'load';

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (window.Tesseract) return resolve();
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('Impossible de charger le lecteur de texte.'));
    document.head.appendChild(s);
  });
}

async function getWorker() {
  if (worker) return worker;
  await loadScript(base('vendor/tesseract/tesseract.min.js'));
  worker = await window.Tesseract.createWorker('fra', 1, {
    workerPath: base('vendor/tesseract/worker.min.js'),
    corePath: base('vendor/tesseract/core'),
    langPath: base('vendor/tesseract/lang'),
    logger: (m) => {
      if (!progressCb) return;
      if (m.status === 'recognizing text' && phase === 'pass1') progressCb(0.35 + m.progress * 0.25, 'Recherche des statistiques…');
      else if (/loading|initializ/i.test(m.status)) progressCb(0.05 + (m.progress || 0) * 0.25, 'Préparation du lecteur…');
    },
  });
  await worker.setParameters({ tessedit_pageseg_mode: '11' });
  return worker;
}

// Prépare l'image : taille fixe, niveaux de gris, lissage (lignes de l'écran, moiré),
// inversion (texte clair sur fond sombre), puis seuillage adaptatif (résiste aux reflets).
export async function preprocess(file, { binarize = true, t = 0.25, blur = 1, maxSide = 2400 } = {}) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Photo illisible.')); i.src = url;
    });
    const big = Math.max(img.naturalWidth, img.naturalHeight);
    const scale = big > maxSide ? maxSide / big : big < 1600 ? Math.min(2, 1600 / big) : 1;
    const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h);
    const px = data.data;
    const n = w * h;
    let g = new Float32Array(n);
    let total = 0;
    for (let i = 0, j = 0; j < n; i += 4, j++) { g[j] = px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114; total += g[j]; }
    const invert = total / n < 128;
    if (invert) for (let j = 0; j < n; j++) g[j] = 255 - g[j];
    if (blur) g = boxBlur(g, w, h, blur);

    let out;
    if (binarize) {
      // Seuillage de Bradley : chaque pixel est comparé à la moyenne de son voisinage.
      const integ = new Float64Array((w + 1) * (h + 1));
      for (let y = 0; y < h; y++) {
        let row = 0;
        for (let x = 0; x < w; x++) { row += g[y * w + x]; integ[(y + 1) * (w + 1) + x + 1] = integ[y * (w + 1) + x + 1] + row; }
      }
      const r = Math.max(8, Math.round(w / 40));
      out = new Uint8ClampedArray(n);
      for (let y = 0; y < h; y++) {
        const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
        for (let x = 0; x < w; x++) {
          const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
          const s = integ[y1 * (w + 1) + x1] - integ[y0 * (w + 1) + x1] - integ[y1 * (w + 1) + x0] + integ[y0 * (w + 1) + x0];
          const mean = s / ((x1 - x0) * (y1 - y0));
          out[y * w + x] = g[y * w + x] < mean * (1 - t) ? 0 : 255;
        }
      }
    } else {
      out = g;
    }
    for (let i = 0, j = 0; j < n; i += 4, j++) px[i] = px[i + 1] = px[i + 2] = out[j];
    ctx.putImageData(data, 0, 0);
    return c;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function boxBlur(src, w, h, r) {
  const tmp = new Float32Array(src.length), dst = new Float32Array(src.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0, k = 0;
    for (let d = -r; d <= r; d++) { const xx = x + d; if (xx >= 0 && xx < w) { s += src[y * w + xx]; k++; } }
    tmp[y * w + x] = s / k;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0, k = 0;
    for (let d = -r; d <= r; d++) { const yy = y + d; if (yy >= 0 && yy < h) { s += tmp[yy * w + x]; k++; } }
    dst[y * w + x] = s / k;
  }
  return dst;
}

const PASS1 = { tessedit_pageseg_mode: '11', tessedit_char_whitelist: '' };
const PASS2 = { tessedit_pageseg_mode: '7', tessedit_char_whitelist: '0123456789,.%' };

export async function readStatsScreen(file, onProgress = () => {}, opts = {}) {
  onProgress(0.02, 'Préparation du lecteur…');
  progressCb = onProgress; phase = 'load';
  try {
    return await run(file, onProgress, opts);
  } finally {
    progressCb = null;
  }
}

async function run(file, onProgress, opts) {
  const w = await getWorker();
  onProgress(0.3, 'Préparation de la photo…');
  const canvas = await preprocess(file, opts);
  phase = 'pass1';
  await w.setParameters(PASS1);
  const { data } = await w.recognize(canvas);
  const res = parseWords(data.words || [], canvas.width);

  // 2e passage : relecture ciblée (chiffres uniquement) de chaque valeur, à côté de chaque intitulé.
  const p2 = { left: {}, right: {} };
  if (res.labels.length) {
    phase = 'pass2';
    await w.setParameters(PASS2);
    let done = 0;
    for (const l of res.labels) {
      for (const sd of ['left', 'right']) {
        const crop = cropBeside(canvas, l, sd, res.angle);
        if (!crop) continue;
        const { data: d2 } = await w.recognize(crop);
        const v = pickNumber(d2.text, sd);
        if (opts.debug) (window.__crops ||= []).push({ key: l.key, sd, text: d2.text, url: crop.toDataURL() });
        if (v !== null) p2[sd][l.key] = v;
        crop.width = crop.height = 0;
      }
      onProgress(0.6 + (0.38 * ++done) / res.labels.length, 'Vérification des chiffres…');
    }
    await w.setParameters(PASS1);
    reconcile(res, p2);
  }
  canvas.width = canvas.height = 0; // libère la mémoire de l'image
  onProgress(1, 'Terminé');
  const out = finalize(res);
  if (opts.debug) out.debug = { angle: res.angle, labels: res.labels.map((l) => l.key), words: (data.words || []).map((x) => x.text).join(' ') };
  return out;
}

const digits = (v) => String(v).replace(/\D/g, '').length;

// Choisit, pour chaque valeur, entre la 1re lecture (page entière) et la 2e (zone ciblée).
function reconcile(res, p2) {
  const keys = new Set([...Object.keys(p2.left), ...Object.keys(p2.right)]);
  for (const k of keys) {
    const cand = {};
    for (const sd of ['left', 'right']) {
      const a = res[sd][k] ?? null, b = p2[sd][k] ?? null;
      cand[sd] = [...new Set([b, a].filter((v) => v !== null))];
      // par défaut : la lecture ciblée, sauf si elle a perdu des chiffres
      let pick = b ?? a;
      if (a !== null && b !== null && a !== b && digits(a) > digits(b)) pick = a;
      res[sd][k] = pick;
    }
    // Possession : les deux côtés doivent faire 100
    if (k === 'possession') {
      outer: for (const l of cand.left) for (const r of cand.right) {
        if (Math.abs(l + r - 100) <= 1) { res.left[k] = l; res.right[k] = r; break outer; }
      }
    }
    if (res.left[k] != null || res.right[k] != null) res.found.add(k);
  }
}

// Découpe la bande à gauche ou à droite d'un intitulé, redressée selon l'inclinaison de la photo.
function cropBeside(src, l, side, angle) {
  const bandH = Math.round(l.h * 1.9);
  const gap = l.h * 0.4;
  const len = side === 'left' ? l.x0 - gap : src.width - (l.x1 + gap);
  const width = Math.round(Math.min(len, src.width * 0.45));
  if (width < l.h) return null;
  const c = document.createElement('canvas');
  c.width = width + 20; c.height = bandH + 20;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  // point d'ancrage : bord de l'intitulé, sur la ligne de texte
  const ax = side === 'left' ? l.x0 - gap : l.x1 + gap;
  const ay = l.cy + Math.tan(angle) * (ax - l.cx);
  ctx.translate(side === 'left' ? c.width - 10 : 10, c.height / 2);
  ctx.rotate(-angle);
  ctx.drawImage(src, -ax, -ay);
  return tightCrop(c, side, l.h);
}

// Garde uniquement le groupe de caractères le plus proche de l'intitulé, avec une marge,
// et l'agrandit : Tesseract lit bien mieux un chiffre isolé et assez grand.
function tightCrop(c, side, h) {
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const { data } = ctx.getImageData(0, 0, c.width, c.height);
  const W = c.width, H = c.height;
  const col = new Uint16Array(W);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (data[(y * W + x) * 4] < 128) col[x]++;
  // groupes de colonnes contenant de l'encre, séparés par plus d'une demi-hauteur de texte
  const groups = [];
  let cur = null, gapRun = 0;
  for (let x = 0; x < W; x++) {
    if (col[x] > 0) {
      if (cur && gapRun <= h * 0.6) cur.x1 = x; else { cur = { x0: x, x1: x, ink: 0 }; groups.push(cur); }
      cur.ink += col[x]; gapRun = 0;
    } else gapRun++;
  }
  const real = groups.filter((g) => g.ink > h * 1.5 && g.x0 > 3 && g.x1 < W - 4 && g.x1 - g.x0 >= h * 0.2);
  if (!real.length) return null;
  const g = side === 'left' ? real[real.length - 1] : real[0];
  // bloc vertical d'encre le plus proche du centre de la bande (ignore les bouts des lignes voisines)
  const rowInk = new Uint16Array(H);
  for (let y = 0; y < H; y++) for (let x = g.x0; x <= g.x1; x++) if (data[(y * W + x) * 4] < 128) rowInk[y]++;
  const runs = [];
  for (let y = 0, r = null; y < H; y++) {
    if (rowInk[y]) { if (r && y - r.y1 <= 2) r.y1 = y; else { r = { y0: y, y1: y }; runs.push(r); } }
  }
  if (!runs.length) return null;
  const mid = H / 2;
  const dist = (r) => (mid >= r.y0 && mid <= r.y1 ? 0 : Math.min(Math.abs(mid - r.y0), Math.abs(mid - r.y1)));
  const best = runs.filter((r) => r.y1 - r.y0 >= h * 0.35).sort((a, b) => dist(a) - dist(b))[0];
  if (!best) return null;
  const y0 = best.y0, y1 = best.y1;
  // recalcule la largeur sur ce bloc seulement
  let gx0 = g.x1, gx1 = g.x0;
  for (let y = y0; y <= y1; y++) for (let x = g.x0; x <= g.x1; x++) if (data[(y * W + x) * 4] < 128) { if (x < gx0) gx0 = x; if (x > gx1) gx1 = x; }
  g.x0 = gx0; g.x1 = gx1;
  const pad = Math.round(h * 0.5);
  const cw = g.x1 - g.x0 + 1, ch = y1 - y0 + 1;
  const k = Math.max(1, Math.min(3, 48 / Math.max(ch, 1)));
  const out = document.createElement('canvas');
  out.width = Math.round((cw + pad * 2) * k); out.height = Math.round((ch + pad * 2) * k);
  const o = out.getContext('2d');
  o.fillStyle = '#fff'; o.fillRect(0, 0, out.width, out.height);
  o.imageSmoothingEnabled = true;
  o.drawImage(c, g.x0, y0, cw, ch, pad * k, pad * k, cw * k, ch * k);
  return out;
}

function pickNumber(text, side) {
  const toks = (text || '').split(/\s+/).map(toNumber).filter((v) => v !== null);
  if (!toks.length) return null;
  return side === 'left' ? toks[toks.length - 1] : toks[0];
}

// ---------- Analyse du texte lu ----------

const strip = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const DICT = ['possession', 'tirs', 'tir', 'cadres', 'attendus', 'buts', 'passes', 'precision', 'tacles', 'reussis', 'reussies', 'fautes', 'commises', 'xg'];

function lev(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 9;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

// Corrige les petites fautes de lecture sur les intitulés (« Possesslon » → « possession »).
function canonWord(raw) {
  const w = strip(raw).replace(/[^a-z]/g, '');
  if ((/^t[a-z]{0,2}r[a-z]?s$/.test(w) && w.length <= 5) || /^t[a-z]{0,2}s$/.test(w)) return 'tirs';
  if (w.length < 3) return w;
  let best = w, bestD = 9;
  for (const k of DICT) {
    const dd = lev(w, k);
    const tol = k.length >= 7 ? 2 : k.length >= 4 ? 1 : 0;
    if (dd <= tol && dd < bestD) { best = k; bestD = dd; }
  }
  return best;
}

// Convertit « 55% », « 1,8 », « O.9 » en nombre.
function toNumber(raw) {
  if (/^\(/.test(raw.trim())) return null; // « (%) », « (xG) » : unité de l'intitulé
  let t = raw.trim().replace(/[()]/g, '');
  if (!/^[0-9OoIlSsBZ%,.]+$/.test(t)) return null;
  // « ss » → 55, « B4 » → 84 : uniquement pour des mots courts faits de caractères ambigus
  if (!/[0-9]/.test(t) && !(t.length >= 2 && t.length <= 3 && /^[SsBZ]+$/.test(t))) return null;
  t = t.replace(/[Oo]/g, '0').replace(/[Il]/g, '1').replace(/[Ss]/g, '5').replace(/B/g, '8').replace(/Z/g, '2').replace('%', '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  return parseFloat(t);
}

const FAMILY = { possession: 'poss', tirs: 'tirs', tir: 'tirs', passes: 'pass', tacles: 'tac', fautes: 'faute', attendus: 'xg', xg: 'xg' };

// Règles de reconnaissance des lignes (plus spécifique d'abord).
const RULES = [
  { key: 'passAccuracy', test: (s) => /precision/.test(s) && /passes?/.test(s) },
  { key: 'shotsOnTarget', test: (s) => /\btirs?\b/.test(s) && /cadre/.test(s) },
  { key: 'xg', test: (s) => /attendus|\bxg\b/.test(s) },
  { key: 'shots', test: (s) => /\btirs?\b/.test(s) && !/cadre|precision/.test(s) },
  { key: 'passes', test: (s) => /\bpasses?\b/.test(s) && !/precision|reussi|cle|decisive/.test(s) },
  { key: 'tacklesWon', test: (s) => /\btacles?\b/.test(s) && /reussi/.test(s) },
  { key: 'tackles', test: (s) => /\btacles?\b/.test(s) && !/reussi/.test(s) },
  { key: 'fouls', test: (s) => /\bfautes?\b/.test(s) },
  { key: 'possession', test: (s) => /possession/.test(s) },
  { key: 'goals', test: (s) => /^buts?$/.test(s.trim()) },
];

// Inclinaison de la photo : on cherche l'angle le plus fréquent entre mots de même taille
// éloignés horizontalement (ils sont alors presque toujours sur la même ligne).
function estimateSkew(tokens) {
  const t = tokens.filter((x) => x.h >= 8);
  const bins = new Map();
  const angles = [];
  for (let i = 0; i < t.length; i++) {
    for (let j = i + 1; j < t.length; j++) {
      const a = t[i], b = t[j];
      if (Math.abs(a.h - b.h) > 0.35 * Math.max(a.h, b.h)) continue;
      const dx = b.cx - a.cx;
      if (Math.abs(dx) < 8 * a.h) continue;
      const ang = Math.atan((b.cy - a.cy) / dx);
      if (Math.abs(ang) > 0.14) continue;
      const k = Math.round(ang / 0.004);
      bins.set(k, (bins.get(k) || 0) + 1);
      angles.push(ang);
    }
  }
  if (!angles.length) return 0;
  let best = 0, bestN = -1;
  for (const [k] of bins) {
    const nb = (bins.get(k - 1) || 0) + bins.get(k) + (bins.get(k + 1) || 0);
    if (nb > bestN) { bestN = nb; best = k; }
  }
  const near = angles.filter((a) => Math.abs(a - best * 0.004) <= 0.006);
  return near.reduce((x, y) => x + y, 0) / near.length;
}

function groupRows(tokens) {
  const sorted = [...tokens].sort((a, b) => a.ry - b.ry);
  const rows = [];
  for (const t of sorted) {
    const row = rows.find((r) => Math.abs(r.ry - t.ry) < Math.max(r.h, t.h) * 0.6);
    if (row) { row.items.push(t); row.ry = (row.ry * (row.items.length - 1) + t.ry) / row.items.length; row.h = Math.max(row.h, t.h); }
    else rows.push({ ry: t.ry, h: t.h, items: [t] });
  }
  rows.forEach((r) => r.items.sort((a, b) => a.x0 - b.x0));
  return rows;
}

export function parseWords(words, imgW = 1600) {
  const tokens = words
    .filter((w) => w.text && (/[0-9a-zA-Zà-ü]/.test(w.text) || /^[-–:]$/.test(w.text.trim())) && w.confidence > 25)
    .map((w) => {
      const { x0, x1, y0, y1 } = w.bbox;
      return { raw: w.text.trim(), word: canonWord(w.text), num: toNumber(w.text), x0, x1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, h: y1 - y0 };
    });
  const angle = estimateSkew(tokens);
  const tan = Math.tan(angle);
  tokens.forEach((t) => { t.ry = t.cy - tan * (t.cx - imgW / 2); });
  const imgH = Math.max(1, ...tokens.map((t) => t.cy + t.h));
  const rows = groupRows(tokens);
  const left = {}, right = {};
  const found = new Set();
  const labels = [];

  for (const row of rows) {
    const labelToks = row.items.filter((t) => t.num === null && t.word.length >= 2);
    if (!labelToks.length) continue;
    const text = labelToks.map((t) => t.word).join(' ');
    // Une ligne qui cite plusieurs statistiques à la fois est un menu (onglets), pas une ligne de stats.
    const families = new Set(labelToks.map((t) => FAMILY[t.word]).filter(Boolean));
    if (families.size >= 2) continue;
    const rule = RULES.find((r) => r.test(text));
    if (!rule || labels.some((l) => l.key === rule.key)) continue;
    // ne garder que les mots de l'intitulé lui-même (groupe contigu le plus central)
    const core = labelToks.filter((t) => DICT.includes(t.word) || /^\(?%\)?$|^\(xg\)$/i.test(t.raw));
    const lt = core.length ? core : labelToks;
    const lx0 = Math.min(...lt.map((t) => t.x0));
    const lx1 = Math.max(...lt.map((t) => t.x1));
    const h = Math.max(...lt.map((t) => t.h));
    const cy = lt.reduce((s, t) => s + t.cy, 0) / lt.length;
    labels.push({ key: rule.key, x0: lx0, x1: lx1, cx: (lx0 + lx1) / 2, cy, h });

    const nums = row.items.filter((t) => t.num !== null);
    const before = nums.filter((t) => t.cx < lx0);
    const after = nums.filter((t) => t.cx > lx1);
    let l = null, r = null;
    if (before.length) l = before[before.length - 1].num;
    if (after.length) r = after[0].num;
    if (!before.length && after.length >= 2) { l = after[0].num; r = after[1].num; }
    if (!after.length && before.length >= 2) { l = before[before.length - 2].num; r = before[before.length - 1].num; }
    if (l !== null) left[rule.key] = l;
    if (r !== null) right[rule.key] = r;
    if (l !== null || r !== null) found.add(rule.key);
  }

  // Score : ligne « Buts », sinon motif « 2 - 1 », sinon les deux plus gros chiffres du haut de l'écran.
  if (left.goals == null || right.goals == null) {
    const sc = findScore(tokens, rows, imgH);
    if (sc) { left.goals = sc[0]; right.goals = sc[1]; found.add('goals'); }
  }
  return { left, right, found, labels, angle };
}

// Corrections de cohérence et format final.
export function finalize({ left, right, found }) {
  // Tacles : à défaut de « Tacles », on prend « Tacles réussis »
  for (const o of [left, right]) {
    if (o.tackles == null && o.tacklesWon != null) o.tackles = o.tacklesWon;
    delete o.tacklesWon;
  }
  if (found.has('tacklesWon')) found.add('tackles');
  const fix = (o) => {
    if (o.xg != null && o.xg >= 10 && Number.isInteger(o.xg)) o.xg = o.xg / 10; // « 18 » lu au lieu de « 1,8 »
    for (const k of ['possession', 'passAccuracy']) if (o[k] != null && o[k] > 100) o[k] = null;
    if (o.shots != null && o.shotsOnTarget != null && o.shotsOnTarget > o.shots) o.shotsOnTarget = null;
    if (o.goals != null && o.goals > 30) o.goals = null;
  };
  fix(left); fix(right);
  if (left.possession != null && right.possession == null) right.possession = 100 - left.possession;
  if (right.possession != null && left.possession == null) left.possession = 100 - right.possession;

  const doubtful = [];
  if (left.possession != null && right.possession != null && Math.abs(left.possession + right.possession - 100) > 2) doubtful.push('possession');

  const clean = (o) => Object.fromEntries(STAT_KEYS.map((k) => [k, typeof o[k] === 'number' ? o[k] : null]));
  const L = clean(left), R = clean(right);
  return { left: L, right: R, found: STAT_KEYS.filter((k) => L[k] !== null || R[k] !== null), doubtful };
}

function findScore(tokens, rows, imgH) {
  // Motif dans un seul mot : « 2-1 », « 2:1 »
  for (const t of tokens) {
    const m = t.raw.match(/^(\d{1,2})\s*[-–:]\s*(\d{1,2})$/);
    if (m && t.cy < imgH * 0.5) return [+m[1], +m[2]];
  }
  // Motif sur une ligne : « 2 - 1 »
  for (const r of rows) {
    const txt = r.items.map((t) => (/^[JIl|]$/.test(t.raw) ? '1' : t.raw)).join(' ');
    const m = txt.match(/(?:^|\s)(\d{1,2})\s*[-–:]\s*(\d{1,2})(?:\s|$)/);
    if (m && r.items[0].cy < imgH * 0.5) return [+m[1], +m[2]];
  }
  // Deux grands chiffres en haut de l'écran, sur la même ligne
  const big = tokens
    .filter((t) => t.num !== null && Number.isInteger(t.num) && t.num <= 20 && /^\d{1,2}$/.test(t.raw) && t.cy < imgH * 0.45)
    .sort((a, b) => b.h - a.h);
  for (let i = 0; i < big.length; i++) {
    for (let j = i + 1; j < big.length; j++) {
      const a = big[i], b = big[j];
      if (Math.abs(a.ry - b.ry) < a.h * 0.5 && Math.abs(a.h - b.h) < a.h * 0.3 && a.h > 0) {
        return a.cx < b.cx ? [a.num, b.num] : [b.num, a.num];
      }
    }
  }
  return null;
}
