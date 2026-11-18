import { STATS, MODES, modeLabel, result, summarize, isNum, groupBy, weekKey, dayKey, localDay,
  sortByDate, rolling, pct, fmtDate, fmtTime } from './stats.js';
import { load, save, newId, exportPayload, parseImport } from './storage.js';
import { coachTips, sessionReport } from './coach.js';
import { demoMatches } from './demo.js';
import { lineChart, barChart } from './charts.js';

const COLORS = { me: '#3B8FE8', opp: '#D9772B' };
const RES_LABEL = { W: 'V', D: 'N', L: 'D' };
const RES_TEXT = { W: 'Victoire', D: 'Nul', L: 'Défaite' };

const state = load();
let demoCache = null;
let tab = 'home';
let modeFilter = 'all';
let listLimit = 25;

const $ = (s, el = document) => el.querySelector(s);
const view = $('#view');
const sheet = $('#sheet');
const panel = $('.sheet-panel');

const allMatches = () => {
  if (state.settings.demo) return demoCache || (demoCache = demoMatches());
  return state.matches;
};
const filtered = () => sortByDate(allMatches().filter((m) => modeFilter === 'all' || m.mode === modeFilter));
const persist = () => { if (!save(state)) toast('⚠️ Enregistrement impossible (mémoire pleine ?)'); };

function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), ms);
}

const pill = (m) => { const r = result(m); return `<span class="pill ${r}" title="${RES_TEXT[r]}">${RES_LABEL[r]}</span>`; };
const fmt1 = (v, d = 1) => (v === null ? '–' : v.toFixed(d).replace('.', ','));

// ---------------- Navigation ----------------
document.querySelectorAll('.tabbar button[data-tab]').forEach((b) =>
  b.addEventListener('click', () => { tab = b.dataset.tab; render(); window.scrollTo(0, 0); }));

function render() {
  document.querySelectorAll('.tabbar button[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  $('#demo-banner').hidden = !state.settings.demo;
  ({ home: renderHome, matches: renderMatches, progress: renderProgress, coach: renderCoach })[tab]();
}

function modeChips() {
  const opts = [{ key: 'all', label: 'Tous' }, ...MODES];
  return `<div class="chips">${opts.map((o) =>
    `<button class="chip ${modeFilter === o.key ? 'active' : ''}" data-mode="${o.key}">${o.label}</button>`).join('')}</div>`;
}
function bindChips() {
  view.querySelectorAll('.chip[data-mode]').forEach((c) => c.addEventListener('click', () => { modeFilter = c.dataset.mode; listLimit = 25; render(); }));
}

function recordBlock(s) {
  return `<div class="record">
    <div class="w"><b>${s.w}</b><span>Victoires</span></div>
    <div class="d"><b>${s.d}</b><span>Nuls</span></div>
    <div class="l"><b>${s.l}</b><span>Défaites</span></div>
  </div>`;
}

// ---------------- Accueil ----------------
function renderHome() {
  const ms = sortByDate(allMatches());
  const today = localDay(new Date());
  const todayMs = ms.filter((m) => dayKey(m.date) === today);
  const rep = sessionReport(todayMs, ms);
  const all = summarize(ms);
  const tips = coachTips(ms);

  let html = `
    <label for="cam-input" class="hero-cta">
      <span class="ico"><svg viewBox="0 0 24 24"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg></span>
      <span><strong>Nouveau match</strong><span>Photographie l’écran des stats</span></span>
    </label>
    <div class="alt-links">
      <label for="pick-input">Choisir une photo</label>
      <button id="btn-manual">Saisie manuelle</button>
    </div>`;

  if (!ms.length) {
    html += `<div class="card welcome">
      <h2>Bienvenue, coach 👋</h2>
      <p>Après chaque match, photographie l’écran de statistiques de ta télé. L’appli lit les chiffres, tu vérifies, et le coach analyse ton jeu.</p>
      <button class="btn block" id="btn-try-demo">🎮 Voir l’appli avec des fausses données</button>
    </div>`;
    view.innerHTML = html;
    bindHome();
    return;
  }

  html += `<div class="card">
    <h2>Session du jour <small>${todayMs.length ? `${todayMs.length} match${todayMs.length > 1 ? 's' : ''}` : ''}</small></h2>
    <div class="verdict">${rep.verdict}</div>
    ${todayMs.length ? `${recordBlock(rep.s)}
      <div class="kpis">
        <div class="kpi"><b>${rep.s.gf}</b><span>Buts marqués</span></div>
        <div class="kpi"><b>${rep.s.ga}</b><span>Buts encaissés</span></div>
        <div class="kpi"><b>${pct(rep.s.winRate)}</b><span>Victoires</span></div>
      </div>
      <div class="form-row" style="margin-top:12px">${todayMs.map((m) =>
        `<button class="pill ${result(m)}" data-open="${m.id}" style="width:auto;padding:0 8px;border-style:solid">${m.me.goals}-${m.opp.goals}</button>`).join('')}</div>
      ${rep.lines.length ? `<ul class="cmp">${rep.lines.map((l) => `
        <li><span>${l.label}</span><span class="val">${l.value.replace('.', ',')} <span class="ref">moy. ${l.ref.replace('.', ',')}</span>
        <span class="trend ${l.trend}" aria-label="${{ up: 'mieux que d’habitude', down: 'moins bien que d’habitude', eq: 'comme d’habitude' }[l.trend]}">${{ up: '▲', down: '▼', eq: '=' }[l.trend]}</span></span></li>`).join('')}</ul>` : ''}`
    : ''}
  </div>`;

  const last10 = ms.slice(-10);
  html += `<div class="card">
    <h2>Ma forme <small>${ms.length} matchs au total</small></h2>
    <div class="form-row">${last10.map(pill).join('')}</div>
    <p class="sub" style="margin:8px 0 12px">10 derniers matchs, du plus ancien au plus récent</p>
    ${recordBlock(all)}
    <div class="kpis">
      <div class="kpi"><b>${fmt1(all.gf / all.n)}</b><span>Buts / match</span></div>
      <div class="kpi"><b>${fmt1(all.ga / all.n)}</b><span>Encaissés / match</span></div>
      <div class="kpi"><b>${pct(all.winRate)}</b><span>Victoires</span></div>
    </div>
  </div>`;

  const t = tips[0];
  html += `<div class="card tip-card ${t.kind}">
    <h2>Le conseil du coach <small><a href="#" id="go-coach" style="color:var(--accent)">Tous →</a></small></h2>
    ${tipInner(t)}
  </div>`;

  view.innerHTML = html;
  bindHome();
}
function bindHome() {
  $('#btn-manual')?.addEventListener('click', () => openReview({}));
  $('#btn-try-demo')?.addEventListener('click', () => setDemo(true));
  $('#go-coach')?.addEventListener('click', (e) => { e.preventDefault(); tab = 'coach'; render(); });
  view.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openDetail(b.dataset.open)));
}

// ---------------- Matchs ----------------
function renderMatches() {
  const ms = filtered();
  const s = summarize(ms);
  let html = `<div class="section-title">Mes matchs</div>${modeChips()}`;
  if (!ms.length) {
    view.innerHTML = html + '<div class="card"><p class="empty">Aucun match pour ce filtre.</p></div>';
    bindChips(); return;
  }
  html += `<div class="card"><h2>Bilan <small>${modeFilter === 'all' ? 'tous modes' : modeLabel(modeFilter)}</small></h2>
    ${recordBlock(s)}
    <div class="kpis">
      <div class="kpi"><b>${s.gf}</b><span>Buts marqués</span></div>
      <div class="kpi"><b>${s.ga}</b><span>Buts encaissés</span></div>
      <div class="kpi"><b>${s.gf - s.ga > 0 ? '+' : ''}${s.gf - s.ga}</b><span>Différence</span></div>
    </div></div>`;

  const weeks = [...groupBy(ms, (m) => weekKey(m.date)).entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  html += `<div class="card"><h2>Par semaine</h2><table class="weeks">
    <thead><tr><th>Semaine du</th><th>M</th><th>V</th><th>N</th><th>D</th><th>Buts</th><th>% V</th></tr></thead><tbody>
    ${weeks.map(([k, wm]) => { const w = summarize(wm); return `<tr><td>${fmtDate(k + 'T12:00:00')}</td><td>${w.n}</td>
      <td class="w">${w.w}</td><td>${w.d}</td><td class="l">${w.l}</td><td>${w.gf}-${w.ga}</td><td>${pct(w.winRate)}</td></tr>`; }).join('')}
    </tbody></table></div>`;

  const recent = [...ms].reverse().slice(0, listLimit);
  const days = [...groupBy(recent, (m) => dayKey(m.date)).entries()];
  for (const [d, dm] of days) {
    html += `<div class="day-head">${fmtDate(d + 'T12:00:00', { weekday: 'long', day: 'numeric', month: 'long' })}</div>`;
    html += dm.map((m) => `<button class="match" data-open="${m.id}">
      ${pill(m)}
      <span class="score">${m.me.goals} - ${m.opp.goals}</span>
      <span class="meta"><div>${RES_TEXT[result(m)]}</div><small>${fmtTime(m.date)} · ${m.side === 'away' ? 'Extérieur' : 'Domicile'}</small></span>
      <span class="badge ${m.mode}">${modeLabel(m.mode)}</span>
    </button>`).join('');
  }
  if (ms.length > listLimit) html += `<button class="btn block" id="btn-more">Afficher plus (${ms.length - listLimit} restants)</button>`;
  view.innerHTML = html;
  bindChips();
  $('#btn-more')?.addEventListener('click', () => { listLimit += 25; renderMatches(); });
  view.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openDetail(b.dataset.open)));
}

// ---------------- Progression ----------------
function renderProgress() {
  const ms = filtered();
  let html = `<div class="section-title">Ma progression</div>${modeChips()}`;
  if (ms.length < 2) {
    view.innerHTML = html + '<div class="card"><p class="empty">Il faut au moins 2 matchs pour tracer des courbes.</p></div>';
    bindChips(); return;
  }
  html += `
    <div class="card"><h2>Taux de victoire <small>moyenne sur 10 matchs</small></h2><div id="c-win"></div>
      <p class="chart-note">Chaque point = ton % de victoires sur les 10 matchs précédents.</p></div>
    <div class="card"><h2>Buts par semaine</h2><div id="c-goals"></div></div>
    <div class="card"><h2>Occasions (xG) <small>moyenne sur 5 matchs</small></h2><div id="c-xg"></div>
      <p class="chart-note">xG = qualité des occasions. Bleu au-dessus de l’orange : tu domines.</p></div>
    <div class="card"><h2>Précision des passes <small>moyenne sur 5 matchs</small></h2><div id="c-pass"></div></div>
    <div class="card"><h2>Tirs cadrés <small>% moyenne sur 5 matchs</small></h2><div id="c-shots"></div></div>`;
  view.innerHTML = html;
  bindChips();

  const labels = ms.map((m) => `${fmtDate(m.date)} ${fmtTime(m.date)}`);
  const winVals = rolling(ms.map((m) => (result(m) === 'W' ? 100 : 0)), 10, Math.min(5, ms.length));
  lineChart($('#c-win'), { labels, series: [{ name: 'Victoires', color: COLORS.me, values: winVals }],
    yMin: 0, yMax: 100, unit: '%', fmt: (v) => `${Math.round(v)} %` });

  const weeks = [...groupBy(ms, (m) => weekKey(m.date)).entries()].sort((a, b) => (a[0] > b[0] ? 1 : -1)).slice(-8);
  barChart($('#c-goals'), {
    labels: weeks.map(([k]) => fmtDate(k + 'T12:00:00')),
    series: [
      { name: 'Marqués', color: COLORS.me, values: weeks.map(([, w]) => summarize(w).gf) },
      { name: 'Encaissés', color: COLORS.opp, values: weeks.map(([, w]) => summarize(w).ga) },
    ],
  });

  const series2 = (key, n = 5) => [
    { name: 'Moi', color: COLORS.me, values: rolling(ms.map((m) => m.me[key]), n) },
    { name: 'Adversaire', color: COLORS.opp, values: rolling(ms.map((m) => m.opp[key]), n) },
  ];
  lineChart($('#c-xg'), { labels, series: series2('xg'), fmt: (v) => fmt1(v) });
  lineChart($('#c-pass'), { labels, series: series2('passAccuracy'), yMin: 50, yMax: 100, ticks: 5, unit: '%', fmt: (v) => `${Math.round(v)} %` });

  const acc = (side) => rolling(ms.map((m) => (isNum(m[side].shots) && m[side].shots > 0 && isNum(m[side].shotsOnTarget)
    ? (100 * m[side].shotsOnTarget) / m[side].shots : null)), 5);
  lineChart($('#c-shots'), { labels, series: [
    { name: 'Moi', color: COLORS.me, values: acc('me') },
    { name: 'Adversaire', color: COLORS.opp, values: acc('opp') },
  ], yMin: 0, yMax: 100, unit: '%', fmt: (v) => `${Math.round(v)} %` });
}

// ---------------- Coach ----------------
function tipInner(t) {
  const tag = { warn: 'À travailler', good: 'Point fort', info: 'À savoir' }[t.kind];
  return `<div class="head"><span class="emo">${t.icon}</span><div>
    <span class="kind-tag">${tag}</span><h3>${t.title}</h3><p>${t.text}</p></div></div>
    ${t.advice ? `<div class="advice">${t.advice}</div>` : ''}
    ${t.basis ? `<div class="basis">${t.basis}</div>` : ''}`;
}
function renderCoach() {
  const ms = filtered();
  const tips = coachTips(ms);
  view.innerHTML = `<div class="section-title">Conseils du coach</div>${modeChips()}
    ${tips.map((t) => `<div class="card tip-card ${t.kind}">${tipInner(t)}</div>`).join('')}
    <p class="sub" style="text-align:center">Les conseils se mettent à jour à chaque match. Un conseil n’apparaît que s’il repose sur assez de matchs.</p>`;
  bindChips();
}

// ---------------- Fenêtres ----------------
let onSheetClose = null;
function openSheet(html, onClose) {
  panel.innerHTML = html;
  sheet.hidden = false;
  panel.scrollTop = 0;
  document.body.style.overflow = 'hidden';
  onSheetClose = onClose || null;
}
function closeSheet() {
  sheet.hidden = true;
  panel.innerHTML = '';
  document.body.style.overflow = '';
  const cb = onSheetClose; onSheetClose = null;
  if (cb) cb();
}
sheet.addEventListener('click', (e) => { if (e.target === sheet) closeSheet(); });

// ---------------- Photo → lecture ----------------
let photoURL = null;
function dropPhoto() {
  if (photoURL) URL.revokeObjectURL(photoURL);
  photoURL = null;
  $('#cam-input').value = '';
  $('#pick-input').value = '';
}

async function handlePhoto(file) {
  if (!file) return;
  dropPhoto();
  photoURL = URL.createObjectURL(file);
  openSheet(`<h2>Analyse en cours…</h2>
    <p class="sub" id="scan-status">Préparation…</p>
    <div class="progress"><div id="scan-bar"></div></div>
    <p class="sub">La première fois, le lecteur se télécharge (quelques secondes). Ensuite, il fonctionne même hors connexion.</p>
    <img class="scan-preview" src="${photoURL}" alt="Photo de l’écran de statistiques">`, dropPhoto);
  try {
    const { readStatsScreen } = await import('./ocr.js');
    const res = await readStatsScreen(file, (p, msg) => {
      const bar = $('#scan-bar'); if (bar) bar.style.width = `${Math.round(p * 100)}%`;
      const st = $('#scan-status'); if (st) st.textContent = msg;
    });
    if (sheet.hidden) return; // annulé entre-temps
    openReview({ left: res.left, right: res.right, ocr: res, keepPhoto: true });
  } catch (err) {
    console.error(err);
    if (sheet.hidden) return;
    openReview({ keepPhoto: true, ocrError: err.message || 'Lecture impossible.' });
  }
}
$('#cam-input').addEventListener('change', (e) => handlePhoto(e.target.files[0]));
$('#pick-input').addEventListener('change', (e) => handlePhoto(e.target.files[0]));

// ---------------- Vérification / saisie ----------------
const toLocalInput = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

function openReview({ left = {}, right = {}, ocr = null, ocrError = null, keepPhoto = false, edit = null }) {
  let side = edit ? edit.side : state.settings.side || 'home';
  let mode = edit ? edit.mode : state.settings.mode || 'rivals';
  const date = edit ? new Date(edit.date) : new Date();
  if (edit) {
    const [l, r] = edit.side === 'home' ? [edit.me, edit.opp] : [edit.opp, edit.me];
    left = l; right = r;
  }
  if (!keepPhoto) dropPhoto();

  let note = '';
  if (ocrError) note = `<div class="ocr-note bad">⚠️ ${ocrError} Remplis les chiffres à la main.</div>`;
  else if (ocr) {
    const nb = ocr.found.length;
    note = nb >= 6
      ? `<div class="ocr-note">✅ ${nb} statistiques lues sur ${STATS.length}. Vérifie-les rapidement avec la photo.</div>`
      : `<div class="ocr-note bad">⚠️ Seulement ${nb} statistique${nb > 1 ? 's' : ''} lue${nb > 1 ? 's' : ''} sur ${STATS.length}. Complète les cases orange, ou reprends une photo plus nette (de face, sans reflet).</div>`;
  }
  const doubt = new Set(ocr ? ocr.doubtful : []);
  const val = (o, k) => (isNum(o[k]) ? String(o[k]).replace('.', ',') : '');
  const stepper = (sd, s, o) => `<div class="stepper" data-side="${sd}">
      <button type="button" data-step="-1" data-key="${s.key}" aria-label="moins">−</button>
      <input inputmode="decimal" data-key="${s.key}" data-side="${sd}" value="${val(o, s.key)}" placeholder="?"
        class="${val(o, s.key) === '' ? 'missing' : ''} ${doubt.has(s.key) ? 'doubt' : ''}" aria-label="${s.label} ${sd === 'left' ? 'gauche' : 'droite'}">
      <button type="button" data-step="1" data-key="${s.key}" aria-label="plus">+</button></div>`;

  openSheet(`
    <h2>${edit ? 'Modifier le match' : 'Vérifie le match'}</h2>
    <p class="sub">${edit ? '' : 'Corrige d’un geste avec − / + ou en tapant le chiffre.'}</p>
    ${photoURL ? `<img class="photo-thumb" id="thumb" src="${photoURL}" alt="Photo prise (touche pour agrandir)">
      <p class="sub" style="margin:4px 0 0;font-size:12px">Touche la photo pour l’agrandir. Elle sera supprimée à l’enregistrement.</p>` : ''}
    ${note}
    <span class="field-label">Mon équipe est…</span>
    <div class="seg" id="seg-side">
      <button type="button" data-v="home">À gauche<small>Domicile</small></button>
      <button type="button" data-v="away">À droite<small>Extérieur</small></button>
    </div>
    <span class="field-label">Statistiques (comme sur ta télé)</span>
    <div class="stat-grid">
      <div class="stat-head"><span id="h-left"></span><span></span><span id="h-right"></span></div>
      ${STATS.map((s) => `<div class="stat-row ${s.key === 'goals' ? 'score-row' : ''}">
        ${stepper('left', s, left)}<span class="lbl">${s.label}${s.unit ? ` (${s.unit})` : ''}</span>${stepper('right', s, right)}</div>`).join('')}
    </div>
    <span class="field-label">Mode de jeu</span>
    <div class="seg three" id="seg-mode">${MODES.map((m) => `<button type="button" data-v="${m.key}">${m.label}</button>`).join('')}</div>
    <span class="field-label">Date et heure</span>
    <input type="datetime-local" id="f-date" value="${toLocalInput(date)}">
    <div class="form-actions">
      <button class="btn" id="f-cancel" type="button">Annuler</button>
      <button class="btn primary" id="f-save" type="button">${edit ? 'Enregistrer' : 'Valider le match'}</button>
    </div>`, dropPhoto);

  const refreshSide = () => {
    panel.querySelectorAll('#seg-side button').forEach((b) => b.classList.toggle('active', b.dataset.v === side));
    const mineLeft = side === 'home';
    $('#h-left').innerHTML = mineLeft ? '<span class="me">Moi</span>' : '<span class="opp-h">Adv.</span>';
    $('#h-right').innerHTML = mineLeft ? '<span class="opp-h">Adv.</span>' : '<span class="me">Moi</span>';
    panel.querySelectorAll('.stepper').forEach((st) => st.classList.toggle('mine', (st.dataset.side === 'left') === mineLeft));
  };
  const refreshMode = () => panel.querySelectorAll('#seg-mode button').forEach((b) => b.classList.toggle('active', b.dataset.v === mode));
  refreshSide(); refreshMode();

  panel.querySelectorAll('#seg-side button').forEach((b) => b.addEventListener('click', () => { side = b.dataset.v; refreshSide(); }));
  panel.querySelectorAll('#seg-mode button').forEach((b) => b.addEventListener('click', () => { mode = b.dataset.v; refreshMode(); }));
  $('#thumb')?.addEventListener('click', (e) => e.currentTarget.classList.toggle('big'));

  panel.querySelectorAll('.stepper button').forEach((b) => b.addEventListener('click', () => {
    const def = STATS.find((s) => s.key === b.dataset.key);
    const input = b.parentElement.querySelector('input');
    const cur = parseFloat(input.value.replace(',', '.'));
    let v = (isNaN(cur) ? 0 : cur) + def.step * +b.dataset.step;
    v = Math.max(0, Math.min(def.max, Math.round(v * 10) / 10));
    input.value = String(v).replace('.', ',');
    input.classList.remove('missing', 'doubt');
    // Possession : l'autre côté s'ajuste automatiquement
    if (def.key === 'possession') syncPossession(input);
  }));
  panel.querySelectorAll('.stepper input').forEach((inp) => inp.addEventListener('input', () => {
    inp.classList.toggle('missing', inp.value.trim() === '');
    inp.classList.remove('doubt');
    if (inp.dataset.key === 'possession') syncPossession(inp);
  }));
  panel.querySelectorAll('.stepper input').forEach((inp) => inp.addEventListener('focus', () => inp.select()));

  $('#f-cancel').addEventListener('click', closeSheet);
  $('#f-save').addEventListener('click', () => {
    const read = (sd) => Object.fromEntries(STATS.map((s) => {
      const raw = $(`input[data-side="${sd}"][data-key="${s.key}"]`, panel).value.trim().replace(',', '.');
      const n = raw === '' ? null : parseFloat(raw);
      return [s.key, n === null || isNaN(n) ? null : Math.max(0, Math.min(s.max, n))];
    }));
    const L = read('left'), R = read('right');
    if (!isNum(L.goals) || !isNum(R.goals)) { toast('Indique le score des deux équipes'); return; }
    const d = new Date($('#f-date').value);
    const match = {
      id: edit ? edit.id : newId(),
      date: isNaN(d) ? new Date().toISOString() : d.toISOString(),
      mode, side,
      me: side === 'home' ? L : R,
      opp: side === 'home' ? R : L,
    };
    let msg = edit ? 'Match modifié ✅' : 'Match enregistré ✅ Photo supprimée.';
    if (state.settings.demo) { state.settings.demo = false; demoCache = null; msg += ' Mode démo quitté.'; }
    if (edit) state.matches = state.matches.map((m) => (m.id === edit.id ? match : m));
    else state.matches.push(match);
    state.settings.side = side; state.settings.mode = mode;
    persist();
    closeSheet();
    if (!edit) tab = 'home';
    render();
    toast(msg);
  });
}

function syncPossession(input) {
  const other = $(`input[data-key="possession"][data-side="${input.dataset.side === 'left' ? 'right' : 'left'}"]`, panel);
  const v = parseFloat(input.value.replace(',', '.'));
  if (!isNaN(v) && v >= 0 && v <= 100) { other.value = String(Math.round((100 - v) * 10) / 10); other.classList.remove('missing', 'doubt'); }
}

// ---------------- Détail d'un match ----------------
function openDetail(id) {
  const m = allMatches().find((x) => x.id === id);
  if (!m) return;
  const r = result(m);
  const rows = STATS.filter((s) => s.key !== 'goals').map((s) => {
    const a = m.me[s.key], b = m.opp[s.key];
    if (!isNum(a) && !isNum(b)) return '';
    const total = (a || 0) + (b || 0) || 1;
    const fa = (v) => (v === null ? '–' : (s.decimals ? v.toFixed(1).replace('.', ',') : v) + (s.unit === '%' ? '%' : ''));
    const pa = s.unit === '%' && s.key !== 'possession' ? a || 0 : ((a || 0) / total) * 100;
    const pb = s.unit === '%' && s.key !== 'possession' ? b || 0 : ((b || 0) / total) * 100;
    return `<div class="row"><div class="t"><b style="color:var(--text)">${fa(a)}</b><span>${s.label}</span><b>${fa(b)}</b></div>
      <div class="track"><div class="a" style="flex:${pa || 0.0001}"></div><div class="b" style="flex:${pb || 0.0001}"></div></div></div>`;
  }).join('');
  openSheet(`
    <div style="display:flex;justify-content:space-between;align-items:center">
      <span class="badge ${m.mode}">${modeLabel(m.mode)}</span>
      <span class="sub">${fmtDate(m.date, { weekday: 'short', day: 'numeric', month: 'short' })} · ${fmtTime(m.date)}</span>
    </div>
    <div class="duel">
      <div class="side me">Moi<div class="big">${m.me.goals}</div></div>
      <div>${pill(m)}</div>
      <div class="side opp">Adv.<div class="big">${m.opp.goals}</div></div>
    </div>
    <p class="sub" style="text-align:center;margin-top:-8px">${RES_TEXT[r]} · ${m.side === 'away' ? 'à l’extérieur' : 'à domicile'}</p>
    <div class="bars">${rows || '<p class="empty">Pas d’autres statistiques.</p>'}</div>
    <div class="form-actions" style="grid-template-columns:1fr 1fr">
      <button class="btn danger" id="d-del">Supprimer</button>
      <button class="btn" id="d-edit">Modifier</button>
    </div>`);
  $('#d-edit').addEventListener('click', () => {
    if (state.settings.demo) { toast('Impossible de modifier en mode démo'); return; }
    openReview({ edit: m });
  });
  $('#d-del').addEventListener('click', () => {
    if (state.settings.demo) { toast('Impossible de supprimer en mode démo'); return; }
    if (!confirm('Supprimer ce match ?')) return;
    state.matches = state.matches.filter((x) => x.id !== m.id);
    persist(); closeSheet(); render(); toast('Match supprimé');
  });
}

// ---------------- Réglages ----------------
function setDemo(on) {
  state.settings.demo = on; demoCache = null; persist();
  closeSheet(); tab = 'home'; render();
  toast(on ? 'Mode démo activé 🎮' : 'Retour à tes vraies données');
}
$('#btn-exit-demo').addEventListener('click', () => setDemo(false));

$('#btn-settings').addEventListener('click', () => {
  const n = state.matches.length;
  openSheet(`
    <h2>Réglages</h2>
    <p class="sub" style="margin-bottom:14px">${n} match${n > 1 ? 's' : ''} enregistré${n > 1 ? 's' : ''} sur ce téléphone.</p>
    <div class="settings-list">
      <button class="btn block" id="s-export"><span class="i">📤</span><span>Exporter mes données<small>Crée un fichier de sauvegarde (à ranger dans Fichiers / iCloud)</small></span></button>
      <button class="btn block" id="s-import"><span class="i">📥</span><span>Importer une sauvegarde<small>Ajoute les matchs d’un fichier exporté</small></span></button>
      <button class="btn block" id="s-demo"><span class="i">🎮</span><span>${state.settings.demo ? 'Quitter le mode démo' : 'Activer le mode démo'}<small>${state.settings.demo ? 'Revenir à tes vrais matchs' : 'Voir l’appli remplie avec des fausses données'}</small></span></button>
      <button class="btn block" id="s-install"><span class="i">📱</span><span>Installer sur l’écran d’accueil<small>Pour l’ouvrir comme une vraie appli</small></span></button>
      <button class="btn block danger" id="s-wipe"><span class="i">🗑️</span><span>Effacer toutes mes données<small>Pense à exporter avant !</small></span></button>
    </div>
    <div class="privacy">🔒 <b>Vie privée</b> : tes matchs restent uniquement sur ce téléphone. Pas de compte, pas de serveur, aucune connexion à EA. Les photos sont lues sur le téléphone puis effacées, sans passer par ta galerie.</div>
    <p class="sub" style="text-align:center;margin-top:14px;font-size:12px">Coach FC 27 · v1.0 · application non officielle, sans lien avec EA Sports.</p>`);
  $('#s-export').addEventListener('click', exportData);
  $('#s-import').addEventListener('click', () => $('#import-input').click());
  $('#s-demo').addEventListener('click', () => setDemo(!state.settings.demo));
  $('#s-install').addEventListener('click', showInstall);
  $('#s-wipe').addEventListener('click', () => {
    if (!state.matches.length) { toast('Aucune donnée à effacer'); return; }
    if (!confirm(`Effacer définitivement tes ${state.matches.length} matchs ?`)) return;
    if (!confirm('Vraiment sûr ? Cette action est irréversible.')) return;
    state.matches = []; persist(); closeSheet(); render(); toast('Données effacées');
  });
});

async function exportData() {
  if (!state.matches.length) { toast('Aucun match à exporter'); return; }
  const name = `coach-fc27-sauvegarde-${localDay(new Date())}.json`;
  const blob = new Blob([exportPayload(state.matches)], { type: 'application/json' });
  const file = new File([blob], name, { type: 'application/json' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Sauvegarde Coach FC 27' });
      toast('Sauvegarde prête ✅');
      return;
    }
  } catch (e) {
    if (e.name === 'AbortError') return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast('Fichier de sauvegarde téléchargé ✅');
}

$('#import-input').addEventListener('change', async (e) => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  try {
    const list = parseImport(await f.text());
    if (!list.length) { toast('Aucun match trouvé dans ce fichier'); return; }
    const ids = new Set(state.matches.map((m) => m.id));
    const added = list.filter((m) => !ids.has(m.id));
    state.matches.push(...added);
    if (state.settings.demo) { state.settings.demo = false; demoCache = null; }
    persist(); closeSheet(); render();
    toast(`${added.length} match${added.length > 1 ? 's' : ''} importé${added.length > 1 ? 's' : ''}${list.length - added.length ? ` (${list.length - added.length} déjà présents)` : ''} ✅`);
  } catch {
    toast('Fichier non reconnu. Choisis une sauvegarde Coach FC 27.');
  }
});

function showInstall() {
  openSheet(`<h2>Installer l’appli</h2>
    <ol style="padding-left:20px;color:var(--text2);line-height:1.7">
      <li>Ouvre cette page dans <b>Safari</b>.</li>
      <li>Touche le bouton <b>Partager</b> (le carré avec une flèche vers le haut).</li>
      <li>Fais défiler et choisis <b>« Sur l’écran d’accueil »</b>.</li>
      <li>Touche <b>Ajouter</b>. L’icône Coach FC 27 apparaît avec tes autres applis.</li>
    </ol>
    <button class="btn block primary" id="i-ok">Compris</button>`);
  $('#i-ok').addEventListener('click', closeSheet);
}

// ---------------- Démarrage ----------------
render();
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
// Demande au navigateur de ne pas effacer les données
navigator.storage?.persist?.().catch(() => {});
