'use strict';
/* Billsyboos Notebook – prototype 0.1.0
   Everything lives on this iPad in IndexedDB:
     'state'     – notebooks, pages, projects, inbox, today, settings
     'ink:<id>'  – handwriting strokes for a page, brain dump or label
     'safety'    – automatic copy of everything, taken just before a restore
*/
const APP_VERSION = '0.1.0';
const BACKUP_FORMAT = 1;
const DB_NAME = 'billsyboos-notebook';
const STORE = 'kv';
const PAGE_W = 1000, PAGE_H = 1414;     // A4 portrait, in page units
const LABEL_W = 1000, LABEL_H = 230;    // writing strip for titles and steps
const PEN_COLORS = ['#1F3B3A', '#2E7F77', '#3F6FA0', '#C8664F'];
const HL_COLORS = ['#88C9C2', '#F3D36B', '#F2A99F', '#A9C9EE'];
const PEN_SIZES = [2.2, 3.6, 6];
const HL_SIZE = 24;
const ERASER_R = 12;
const PAPERS = ['blank', 'lined', 'dotted', 'grid'];
const CHEERS = ['Nice. One small step done.', 'Done – that counts.', 'Ticked off. Well done.',
  "That's one less thing to hold in your head.", 'Lovely. Keep the momentum if you like.'];

/* ---------------- Utilities ---------------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDay = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const daysBetween = (a, b) => Math.round((parseDay(b) - parseDay(a)) / 86400000);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const niceDate = k => { const d = parseDay(k); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; };
const DPR = () => Math.min(window.devicePixelRatio || 1, 2);
const r1 = n => Math.round(n * 10) / 10;
const isStandalone = () => window.navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;

function dueLabel(due) {
  if (!due) return null;
  const n = daysBetween(dayKey(), due);
  if (n === 0) return { text: 'Today', cls: 'soon' };
  if (n === 1) return { text: 'Tomorrow', cls: 'soon' };
  if (n > 1 && n <= 6) return { text: 'This week · ' + DAYS[parseDay(due).getDay()].slice(0, 3), cls: 'soon' };
  if (n > 6) return { text: niceDate(due), cls: '' };
  return { text: `Was ${niceDate(due)} · pick a new day when ready`, cls: 'past' };
}
function ago(ts) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + ' min ago';
  if (s < 86400) return Math.floor(s / 3600) + ' hr ago';
  const d = Math.floor(s / 86400);
  return d === 1 ? 'yesterday' : d + ' days ago';
}
function fmtStamp(ts) { const d = new Date(ts); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function fmtBytes(b) { return b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; }

const ICON = {
  pen: '<path d="M4 20l4-1 11-11-3-3L5 16l-1 4z"/><path d="M14 7l3 3"/>',
  hl: '<path d="M5 20h6"/><path d="M8 17l-1 3"/><path d="M8 17l9-9-3-3-9 9 3 3z"/><path d="M14 5l2-2 3 3-2 2"/>',
  eraser: '<path d="M9 20h11"/><path d="M4.5 15.5l9-9a2 2 0 012.8 0l2.2 2.2a2 2 0 010 2.8L11 19H8z"/><path d="M9 11l5 5"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/>',
  redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 000 12h3"/>',
  more: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
  tick: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  projects: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8 12l3 3 5-6"/>',
  book: '<path d="M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3z"/><path d="M5 17a3 3 0 013-3h11"/>',
  inbox: '<path d="M4 13l2.5-8h11L20 13v6H4z"/><path d="M4 13h5l1 2h4l1-2h5"/>',
  leaf: '<path d="M5 19c0-8 6-14 15-14 0 9-6 15-14 15"/><path d="M5 19l8-8"/>',
  settings: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>'
};
const icon = n => `<svg viewBox="0 0 24 24">${ICON[n]}</svg>`;

/* ---------------- Database ---------------- */
const DB = {
  db: null,
  open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => { this.db = r.result; this.db.onversionchange = () => this.db.close(); res(); };
      r.onerror = () => rej(r.error);
      r.onblocked = () => rej(new Error('Storage is blocked by another open copy of the app.'));
    });
  },
  tx(mode, fn) {
    return new Promise((res, rej) => {
      const t = this.db.transaction(STORE, mode);
      let out;
      fn(t.objectStore(STORE), v => { out = v; });
      t.oncomplete = () => res(out);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error || new Error('Save was interrupted'));
    });
  },
  get(k) { return this.tx('readonly', (s, set) => { const r = s.get(k); r.onsuccess = () => set(r.result); }); },
  write(puts, dels) { return this.tx('readwrite', s => { for (const [k, v] of puts) s.put(v, k); for (const k of dels) s.delete(k); }); },
  all() {
    return this.tx('readonly', (s, set) => {
      const out = []; const r = s.openCursor();
      r.onsuccess = () => { const c = r.result; if (c) { out.push([c.key, c.value]); c.continue(); } else set(out); };
    });
  },
  replaceAll(entries) { return this.tx('readwrite', s => { s.clear(); for (const [k, v] of entries) s.put(v, k); }); }
};

/* ---------------- Store: autosave ---------------- */
const thumbCache = new Map();
const Store = {
  state: null, ink: new Map(),
  dirtyState: false, dirtyInk: new Set(), deletedInk: new Set(),
  timer: null, saving: null, locked: false,
  markState() { this.dirtyState = true; this.schedule(); },
  markInk(id) { this.dirtyInk.add(id); this.deletedInk.delete(id); this.schedule(150); },
  schedule(ms = 250) { setSaved('saving'); clearTimeout(this.timer); this.timer = setTimeout(() => this.flush(), ms); },
  async flush() {
    clearTimeout(this.timer);
    if (this.locked) return;
    while (this.saving) await this.saving;
    if (!this.dirtyState && !this.dirtyInk.size && !this.deletedInk.size) { setSaved('saved'); return; }
    const puts = [];
    if (this.dirtyState) puts.push(['state', this.state]);
    for (const id of this.dirtyInk) puts.push(['ink:' + id, this.ink.get(id) || []]);
    const dels = [...this.deletedInk].map(id => 'ink:' + id);
    const wasState = this.dirtyState, wasInk = new Set(this.dirtyInk), wasDel = new Set(this.deletedInk);
    this.dirtyState = false; this.dirtyInk.clear(); this.deletedInk.clear();
    this.saving = DB.write(puts, dels)
      .then(() => { if (!this.dirtyState && !this.dirtyInk.size && !this.deletedInk.size) setSaved('saved'); })
      .catch(err => {
        if (wasState) this.dirtyState = true;
        wasInk.forEach(i => this.dirtyInk.add(i)); wasDel.forEach(i => this.deletedInk.add(i));
        setSaved('error', err);
        setTimeout(() => this.flush(), 4000);
      })
      .finally(() => { this.saving = null; });
    await this.saving;
  },
  async loadInk(id) {
    if (!id) return [];
    if (this.ink.has(id)) return this.ink.get(id);
    const v = await DB.get('ink:' + id);
    if (!this.ink.has(id)) this.ink.set(id, Array.isArray(v) ? v : []);
    return this.ink.get(id);
  },
  setInk(id, strokes) { this.ink.set(id, strokes); clearThumbs(id); this.markInk(id); },
  deleteInk(id) {
    if (!id) return;
    this.ink.delete(id); clearThumbs(id); this.dirtyInk.delete(id); this.deletedInk.add(id); this.schedule();
  }
};
function clearThumbs(id) { for (const k of [...thumbCache.keys()]) if (k.startsWith(id + '@')) thumbCache.delete(k); }
function setSaved(st, err) {
  const el = $('#saved'); if (!el) return;
  el.dataset.state = st;
  el.textContent = st === 'saving' ? 'Saving…' : st === 'error' ? 'Not saved – tap' : 'Saved';
  el.onclick = st === 'error'
    ? () => alert('The iPad refused to save just now (' + ((err && err.message) || err) + ').\nThe app will keep retrying. To be safe, open Settings and export a backup.')
    : null;
}

let S; // shortcut for Store.state
const save = () => Store.markState();

function defaultState() {
  const nb = { id: uid('B'), name: 'Billsyboos', sections: [] };
  for (const n of ['Ideas', 'Notes', 'Sketches']) nb.sections.push({ id: uid('C'), name: n, pages: [] });
  return {
    v: 1, created: Date.now(),
    notebooks: [nb], pages: {}, projects: [], inbox: [], today: [],
    settings: {},
    last: null, ui: {}, lastBackup: null, backupSnooze: 0
  };
}
function migrate(st) {
  st.settings = Object.assign({
    tabs: { today: true, projects: true, notebook: true, inbox: true },
    openTo: 'last', labelMode: 'ink', paper: 'lined', fingerDraw: false, lowEnergy: false, slots: 3,
    pen: { tool: 'pen', color: 0, size: 1, hl: 0 }
  }, st.settings || {});
  st.ui = Object.assign({ view: 'today', notebookId: null, sectionId: null, projectFilter: 'active', projectId: null, showDone: false }, st.ui || {});
  for (const k of ['notebooks', 'projects', 'inbox', 'today']) if (!Array.isArray(st[k])) st[k] = [];
  if (!st.pages || typeof st.pages !== 'object') st.pages = {};
  if (!st.notebooks.length) st.notebooks = defaultState().notebooks;
  return st;
}

/* ---------------- Lookups ---------------- */
const proj = id => S.projects.find(p => p.id === id);
const stepOf = (pid, sid) => { const p = proj(pid); return p ? p.steps.find(s => s.id === sid) : null; };
function progress(p) {
  const t = p.steps.length, d = p.steps.filter(s => s.done).length;
  return { t, d, pct: t ? d / t : (p.status === 'done' ? 1 : 0) };
}
const nextStep = p => p.steps.find(s => !s.done);
function notebook() { return S.notebooks.find(n => n.id === S.ui.notebookId) || S.notebooks[0]; }
function section() { const nb = notebook(); return nb.sections.find(s => s.id === S.ui.sectionId) || nb.sections[0]; }
function findPageHome(pageId) {
  for (const nb of S.notebooks) for (const sec of nb.sections) {
    const i = sec.pages.indexOf(pageId);
    if (i >= 0) return { nb, sec, index: i };
  }
  return null;
}
function quickProject() {
  let p = S.projects.find(x => x.system === 'quick');
  if (!p) { p = newProject({ title: 'Quick tasks', system: 'quick' }); }
  return p;
}
function newProject(fields) {
  const p = Object.assign({ id: uid('P'), title: '', titleInk: null, status: 'active', due: null, steps: [], notesPage: null, created: Date.now(), updated: Date.now() }, fields);
  S.projects.unshift(p); save(); return p;
}
function newStep(p, lbl) {
  const st = { id: uid('S'), ink: lbl.ink || null, text: lbl.text || '', done: false, doneAt: null };
  p.steps.push(st); p.updated = Date.now(); save(); return st;
}

/* ---------------- Drawing ---------------- */
function drawPaper(ctx, paper, k, W, H, baseline) {
  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W * k, H * k);
  const g = 44;
  ctx.save();
  if (baseline) {
    ctx.strokeStyle = '#CFE7E3'; ctx.lineWidth = Math.max(1, 2 * k); ctx.setLineDash([8 * k, 8 * k]);
    ctx.beginPath(); ctx.moveTo(30 * k, H * 0.74 * k); ctx.lineTo((W - 30) * k, H * 0.74 * k); ctx.stroke();
  }
  if (paper === 'lined') {
    ctx.strokeStyle = '#C9E5E0'; ctx.lineWidth = Math.max(1, 1.2 * k);
    for (let y = g * 3; y < H - 8; y += g) { ctx.beginPath(); ctx.moveTo(0, y * k); ctx.lineTo(W * k, y * k); ctx.stroke(); }
    ctx.strokeStyle = '#F0CFC6'; ctx.beginPath(); ctx.moveTo(96 * k, 0); ctx.lineTo(96 * k, H * k); ctx.stroke();
  } else if (paper === 'grid') {
    ctx.strokeStyle = '#DCEFEB'; ctx.lineWidth = Math.max(1, 1 * k);
    for (let x = g / 2; x < W; x += g) { ctx.beginPath(); ctx.moveTo(x * k, 0); ctx.lineTo(x * k, H * k); ctx.stroke(); }
    for (let y = g / 2; y < H; y += g) { ctx.beginPath(); ctx.moveTo(0, y * k); ctx.lineTo(W * k, y * k); ctx.stroke(); }
  } else if (paper === 'dotted') {
    ctx.fillStyle = '#9FCFC8'; const r = Math.max(1, 2.2 * k);
    for (let y = g; y < H - 4; y += g) for (let x = g / 2 + 6; x < W; x += g) { ctx.beginPath(); ctx.arc(x * k, y * k, r, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.restore();
}
const penW = (st, p, k) => Math.max(st.size * (0.35 + 0.9 * p) * k, 1);
function drawSeg(ctx, st, i, k) {
  const P = st.pts, a = 3 * (i - 1), b = 3 * i;
  let sx, sy;
  if (i === 1) { sx = P[0]; sy = P[1]; } else { const z = 3 * (i - 2); sx = (P[z] + P[a]) / 2; sy = (P[z + 1] + P[a + 1]) / 2; }
  ctx.lineWidth = penW(st, (P[a + 2] + P[b + 2]) / 2, k);
  ctx.beginPath(); ctx.moveTo(sx * k, sy * k);
  ctx.quadraticCurveTo(P[a] * k, P[a + 1] * k, (P[a] + P[b]) / 2 * k, (P[a + 1] + P[b + 1]) / 2 * k);
  ctx.stroke();
}
function drawStroke(ctx, st, k) {
  const P = st.pts, n = P.length / 3;
  if (!n) return;
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = st.color; ctx.fillStyle = st.color;
  if (st.tool === 'hl') {
    ctx.globalAlpha = 0.45; ctx.globalCompositeOperation = 'multiply'; ctx.lineWidth = st.size * k;
    ctx.beginPath(); ctx.moveTo(P[0] * k, P[1] * k);
    if (n === 1) ctx.lineTo(P[0] * k + 0.5, P[1] * k);
    for (let i = 1; i < n - 1; i++) { const a = 3 * i, b = 3 * (i + 1); ctx.quadraticCurveTo(P[a] * k, P[a + 1] * k, (P[a] + P[b]) / 2 * k, (P[a + 1] + P[b + 1]) / 2 * k); }
    if (n > 1) ctx.lineTo(P[3 * (n - 1)] * k, P[3 * (n - 1) + 1] * k);
    ctx.stroke(); ctx.restore(); return;
  }
  if (n === 1) {
    ctx.beginPath(); ctx.arc(P[0] * k, P[1] * k, penW(st, P[2], k) / 2, 0, Math.PI * 2); ctx.fill(); ctx.restore(); return;
  }
  for (let i = 1; i < n; i++) drawSeg(ctx, st, i, k);
  const a = 3 * (n - 2), b = 3 * (n - 1);
  ctx.lineWidth = penW(st, P[b + 2], k);
  ctx.beginPath(); ctx.moveTo((P[a] + P[b]) / 2 * k, (P[a + 1] + P[b + 1]) / 2 * k); ctx.lineTo(P[b] * k, P[b + 1] * k); ctx.stroke();
  ctx.restore();
}
const bbCache = new WeakMap();
function bbox(st) {
  let b = bbCache.get(st); if (b) return b;
  const P = st.pts; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < P.length; i += 3) { if (P[i] < x0) x0 = P[i]; if (P[i] > x1) x1 = P[i]; if (P[i + 1] < y0) y0 = P[i + 1]; if (P[i + 1] > y1) y1 = P[i + 1]; }
  const m = st.size; b = [x0 - m, y0 - m, x1 + m, y1 + m]; bbCache.set(st, b); return b;
}
function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
  let t = l ? ((px - ax) * dx + (py - ay) * dy) / l : 0; t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function hitStroke(st, x, y, r) {
  const b = bbox(st);
  if (x < b[0] - r || x > b[2] + r || y < b[1] - r || y > b[3] + r) return false;
  const P = st.pts, rr = r + st.size / 2;
  if (P.length === 3) return Math.hypot(P[0] - x, P[1] - y) <= rr;
  for (let i = 3; i < P.length; i += 3) if (distSeg(x, y, P[i - 3], P[i - 2], P[i], P[i + 1]) <= rr) return true;
  return false;
}

/* Thumbnails: handwritten labels are cropped to the writing so short notes stay readable */
async function labelURL(id, h) {
  const key = id + '@L' + h;
  if (thumbCache.has(key)) return thumbCache.get(key);
  const strokes = await Store.loadInk(id);
  if (!strokes.length) { thumbCache.set(key, null); return null; }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const st of strokes) { const b = bbox(st); x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]); }
  const dpr = DPR(), H = h * dpr, bw = x1 - x0 + 8, bh = y1 - y0 + 8, maxW = 900 * dpr;
  let k = (H - 4) / bh; if (bw * k > maxW) k = maxW / bw;
  k = Math.min(k, 1.6 * dpr);
  const c = document.createElement('canvas'); c.width = Math.ceil(bw * k); c.height = H;
  const ctx = c.getContext('2d');
  ctx.translate((-x0 + 4) * k, (H - bh * k) / 2 + (-y0 + 4) * k);
  for (const st of strokes) drawStroke(ctx, st, k);
  const out = { url: c.toDataURL('image/png'), w: c.width / dpr };
  thumbCache.set(key, out); return out;
}
async function pageURL(id, paper) {
  const key = id + '@P' + paper;
  if (thumbCache.has(key)) return thumbCache.get(key);
  const strokes = await Store.loadInk(id);
  const dpr = DPR(), cssW = 200, k = cssW * dpr / PAGE_W;
  const c = document.createElement('canvas'); c.width = Math.round(PAGE_W * k); c.height = Math.round(PAGE_H * k);
  const ctx = c.getContext('2d');
  drawPaper(ctx, paper, k, PAGE_W, PAGE_H);
  for (const st of strokes) drawStroke(ctx, st, k);
  const url = c.toDataURL('image/jpeg', 0.85);
  thumbCache.set(key, url); return url;
}
async function hydrate(root) {
  const jobs = [];
  for (const img of $$('img[data-ink-label]', root)) {
    jobs.push((async () => {
      const h = +img.dataset.h || 40;
      const out = await labelURL(img.dataset.inkLabel, h);
      if (!out) {
        const sp = document.createElement('span'); sp.className = 'lbl-empty'; sp.textContent = '(blank)'; img.replaceWith(sp);
      } else { img.src = out.url; img.style.width = out.w + 'px'; img.style.height = h + 'px'; }
    })());
  }
  for (const img of $$('img[data-ink-page]', root)) jobs.push(pageURL(img.dataset.inkPage, img.dataset.paper).then(u => { img.src = u; }));
  await Promise.all(jobs);
}

/* ---------------- Ink surface (Apple Pencil) ---------------- */
class InkSurface {
  constructor(host, o) {
    this.host = host; this.o = o; this.w = o.w; this.h = o.h; this.paper = o.paper || 'blank';
    this.strokes = []; this.undo = []; this.redo = []; this.cur = null;
    host.innerHTML = '<canvas class="ink-base"></canvas><canvas class="ink-live"></canvas>';
    this.base = host.children[0]; this.live = host.children[1];
    this.bctx = this.base.getContext('2d'); this.lctx = this.live.getContext('2d');
    this.bind();
  }
  setStrokes(arr) { this.strokes = arr; this.undo = []; this.redo = []; this.layout(); }
  layout() {
    const cssW = this.host.clientWidth; if (!cssW) return;
    const dpr = DPR(); this.s = cssW / this.w; this.dpr = dpr;
    const cssH = this.h * this.s;
    for (const c of [this.base, this.live]) { c.width = Math.round(cssW * dpr); c.height = Math.round(cssH * dpr); c.style.width = cssW + 'px'; c.style.height = cssH + 'px'; }
    this.host.style.height = cssH + 'px';
    this.redraw();
  }
  get k() { return this.s * this.dpr; }
  redraw() {
    const ctx = this.bctx; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, this.base.width, this.base.height);
    drawPaper(ctx, this.paper, this.k, this.w, this.h, this.o.baseline);
    for (const st of this.strokes) drawStroke(ctx, st, this.k);
  }
  bind() {
    const el = this.live;
    el.addEventListener('pointerdown', e => this.down(e));
    el.addEventListener('pointermove', e => this.move(e));
    el.addEventListener('pointerup', e => this.up(e));
    el.addEventListener('pointercancel', e => this.up(e));
    // Stop the Pencil (and a resting palm while writing) from scrolling the page; fingers still scroll.
    const block = e => {
      if (S.settings.fingerDraw || this.cur || Array.from(e.touches).some(t => t.touchType === 'stylus')) e.preventDefault();
    };
    el.addEventListener('touchstart', block, { passive: false });
    el.addEventListener('touchmove', block, { passive: false });
  }
  canDraw(e) { return e.pointerType === 'pen' || e.pointerType === 'mouse' || (e.pointerType === 'touch' && S.settings.fingerDraw); }
  pressure(e) { if (e.pointerType === 'pen') return e.pressure > 0 ? e.pressure : 0.3; return 0.5; }
  xy(e) { return [(e.clientX - this.rect.left) / this.s, (e.clientY - this.rect.top) / this.s]; }
  events(e) { const c = e.getCoalescedEvents ? e.getCoalescedEvents() : null; return c && c.length ? c : [e]; }
  down(e) {
    if (!this.canDraw(e) || this.cur) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    try { this.live.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    this.rect = this.live.getBoundingClientRect();
    const st = this.o.style();
    if (st.tool === 'eraser') { this.cur = { id: e.pointerId, eraser: true, removed: [] }; this.erase(e); return; }
    this.cur = { id: e.pointerId, drawn: 1, stroke: { tool: st.tool, color: st.color, size: st.size, pts: [] } };
    this.add(e);
  }
  add(ev) {
    const [x, y] = this.xy(ev); const P = this.cur.stroke.pts, n = P.length;
    if (n >= 3) { const dx = x - P[n - 3], dy = y - P[n - 2]; if (dx * dx + dy * dy < 0.3) return; }
    P.push(r1(x), r1(y), Math.round(this.pressure(ev) * 100) / 100);
  }
  move(e) {
    if (!this.cur || e.pointerId !== this.cur.id) return;
    e.preventDefault();
    if (this.cur.eraser) { this.erase(e); return; }
    for (const ev of this.events(e)) this.add(ev);
    const st = this.cur.stroke, ctx = this.lctx; ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (st.tool === 'hl') { ctx.clearRect(0, 0, this.live.width, this.live.height); drawStroke(ctx, st, this.k); return; }
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = st.color;
    const n = st.pts.length / 3;
    for (let i = this.cur.drawn; i < n; i++) drawSeg(ctx, st, i, this.k);
    ctx.restore(); this.cur.drawn = Math.max(this.cur.drawn, n);
  }
  up(e) {
    if (!this.cur || e.pointerId !== this.cur.id) return;
    if (e.type === 'pointerup' && !this.cur.eraser) this.add(e);
    const c = this.cur; this.cur = null;
    if (c.eraser) {
      if (c.removed.length) { this.undo.push({ type: 'erase', items: c.removed }); this.redo = []; this.changed(); }
      return;
    }
    this.lctx.setTransform(1, 0, 0, 1, 0, 0); this.lctx.clearRect(0, 0, this.live.width, this.live.height);
    const st = c.stroke; if (!st.pts.length) return;
    this.strokes.push(st); drawStroke(this.bctx, st, this.k);
    this.undo.push({ type: 'add', stroke: st }); this.redo = []; this.changed();
  }
  erase(e) {
    let hit = false;
    for (const ev of this.events(e)) {
      const [x, y] = this.xy(ev);
      for (let i = this.strokes.length - 1; i >= 0; i--) {
        if (hitStroke(this.strokes[i], x, y, ERASER_R)) { this.cur.removed.push({ stroke: this.strokes[i], index: i }); this.strokes.splice(i, 1); hit = true; }
      }
    }
    if (hit) this.redraw();
  }
  doUndo() {
    const op = this.undo.pop(); if (!op) return;
    if (op.type === 'add') { const i = this.strokes.lastIndexOf(op.stroke); if (i >= 0) this.strokes.splice(i, 1); }
    else if (op.type === 'erase') { for (const it of [...op.items].reverse()) this.strokes.splice(Math.min(it.index, this.strokes.length), 0, it.stroke); }
    else if (op.type === 'clear') { this.strokes.push(...op.strokes); }
    this.redo.push(op); this.redraw(); this.changed();
  }
  doRedo() {
    const op = this.redo.pop(); if (!op) return;
    if (op.type === 'add') this.strokes.push(op.stroke);
    else if (op.type === 'erase') { for (const it of op.items) { const i = this.strokes.indexOf(it.stroke); if (i >= 0) this.strokes.splice(i, 1); } }
    else if (op.type === 'clear') this.strokes.length = 0;
    this.undo.push(op); this.redraw(); this.changed();
  }
  clearAll() {
    if (!this.strokes.length) return;
    this.undo.push({ type: 'clear', strokes: this.strokes.slice() }); this.strokes.length = 0; this.redo = [];
    this.redraw(); this.changed();
  }
  changed() { if (this.o.onChange) this.o.onChange(this.strokes); }
}

/* ---------------- Full-page editor ---------------- */
const Editor = {
  el: null, surf: null, kind: null, id: null, scrollTimer: null,
  item() { return this.kind === 'page' ? S.pages[this.id] : S.inbox.find(d => d.id === this.id); },
  style() {
    const p = S.settings.pen;
    if (p.tool === 'eraser') return { tool: 'eraser' };
    if (p.tool === 'hl') return { tool: 'hl', color: HL_COLORS[p.hl] || HL_COLORS[0], size: HL_SIZE };
    return { tool: 'pen', color: PEN_COLORS[p.color] || PEN_COLORS[0], size: PEN_SIZES[p.size] ?? PEN_SIZES[1] };
  },
  async open(kind, id, opts = {}) {
    const it = kind === 'page' ? S.pages[id] : S.inbox.find(d => d.id === id);
    if (!it) { toast("That page isn't here any more."); return; }
    this.kind = kind; this.id = id;
    const el = $('#editor'); this.el = el;
    el.innerHTML = `
      <div class="ed-bar">
        <button class="btn" data-ed="close">${icon('back')} Done</button>
        <div class="ed-title"></div>
        <span class="sp"></span>
        <div class="ed-group tools"></div>
        <div class="ed-group colors"></div>
        <div class="ed-group sizes"></div>
        <div class="ed-group">
          <button class="tb" data-ed="undo" aria-label="Undo">${icon('undo')}</button>
          <button class="tb" data-ed="redo" aria-label="Redo">${icon('redo')}</button>
          <button class="tb" data-ed="more" aria-label="More">${icon('more')}</button>
        </div>
      </div>
      <div class="ed-scroll"><div class="ed-paper"></div><div class="ed-foot"></div></div>`;
    el.hidden = false;
    this.surf = new InkSurface($('.ed-paper', el), {
      w: PAGE_W, h: PAGE_H, paper: it.paper || 'blank', style: () => this.style(),
      onChange: strokes => { Store.setInk(this.id, strokes); const i = this.item(); if (i) i.updated = Date.now(); save(); this.syncButtons(); }
    });
    el.onclick = e => this.click(e);
    const scroller = $('.ed-scroll', el);
    scroller.onscroll = () => {
      clearTimeout(this.scrollTimer);
      this.scrollTimer = setTimeout(() => { if (S.last && S.last.id === this.id) { S.last.scroll = scroller.scrollTop; save(); } }, 600);
    };
    this.renderBar(); this.renderFoot();
    const strokes = await Store.loadInk(id);
    if (this.id !== id) return;
    this.surf.setStrokes(strokes);
    if (opts.scroll) scroller.scrollTop = opts.scroll;
    if (!S.last || S.last.id !== id) this.prevLast = S.last;
    S.last = { type: kind, id, at: Date.now(), scroll: opts.scroll || 0 }; save();
    this.syncButtons();
  },
  renderBar() {
    const p = S.settings.pen, el = this.el;
    $('.ed-title', el).textContent = this.title();
    $('.tools', el).innerHTML = ['pen', 'hl', 'eraser'].map(t =>
      `<button class="tb ${p.tool === t ? 'on' : ''}" data-tool="${t}" aria-label="${t === 'hl' ? 'Highlighter' : t}">${icon(t)}</button>`).join('');
    const colors = $('.colors', el), sizes = $('.sizes', el);
    colors.style.display = p.tool === 'eraser' ? 'none' : '';
    sizes.style.display = p.tool === 'pen' ? '' : 'none';
    const list = p.tool === 'hl' ? HL_COLORS : PEN_COLORS, sel = p.tool === 'hl' ? p.hl : p.color;
    colors.innerHTML = list.map((c, i) => `<button class="tb ${sel === i ? 'on' : ''}" data-color="${i}" aria-label="Colour ${i + 1}"><span class="dot" style="background:${c}"></span></button>`).join('');
    sizes.innerHTML = PEN_SIZES.map((s, i) => `<button class="tb ${p.size === i ? 'on' : ''}" data-size="${i}" aria-label="Size ${i + 1}"><span class="szdot" style="width:${4 + i * 4}px;height:${4 + i * 4}px"></span></button>`).join('');
  },
  title() {
    if (this.kind === 'dump') return 'Brain dump';
    const home = findPageHome(this.id);
    if (home) return `${home.sec.name} · Page ${home.index + 1}`;
    const pr = S.projects.find(x => x.notesPage === this.id);
    return pr ? 'Project notes' : 'Page';
  },
  renderFoot() {
    const f = $('.ed-foot', this.el);
    if (this.kind === 'dump') {
      f.innerHTML = `<span>This is in your Inbox. Sort it later – or now, if you like.</span><button class="btn" data-ed="sort">Sort it now</button>`;
      return;
    }
    const home = findPageHome(this.id);
    if (!home) {
      const pr = S.projects.find(x => x.notesPage === this.id);
      f.innerHTML = pr ? `<button class="btn" data-ed="toproject" data-id="${pr.id}">Back to the project</button>` : '';
      return;
    }
    const n = home.sec.pages.length, i = home.index;
    f.innerHTML = `
      <button class="btn" data-ed="prev" ${i === 0 ? 'disabled' : ''}>‹ Previous</button>
      <span>Page ${i + 1} of ${n}</span>
      <button class="btn" data-ed="next" ${i >= n - 1 ? 'disabled' : ''}>Next ›</button>
      <button class="btn primary" data-ed="newpage">${icon('plus')} New page</button>`;
  },
  syncButtons() {
    if (!this.el || !this.surf) return;
    const u = $('[data-ed="undo"]', this.el), r = $('[data-ed="redo"]', this.el);
    if (u) u.disabled = !this.surf.undo.length;
    if (r) r.disabled = !this.surf.redo.length;
  },
  async switchTo(pageId) { await Store.flush(); this.open('page', pageId); },
  click(e) {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    const p = S.settings.pen;
    if (b.dataset.tool) { p.tool = b.dataset.tool; save(); this.renderBar(); return; }
    if (b.dataset.color) { if (p.tool === 'hl') p.hl = +b.dataset.color; else p.color = +b.dataset.color; save(); this.renderBar(); return; }
    if (b.dataset.size) { p.size = +b.dataset.size; save(); this.renderBar(); return; }
    const home = this.kind === 'page' ? findPageHome(this.id) : null;
    switch (b.dataset.ed) {
      case 'close': this.close(); break;
      case 'undo': this.surf.doUndo(); break;
      case 'redo': this.surf.doRedo(); break;
      case 'more': this.moreMenu(); break;
      case 'sort': { const id = this.id; this.close(); sortDump(id); break; }
      case 'toproject': { const id = b.dataset.id; this.close(); go('project', { projectId: id }); break; }
      case 'prev': if (home && home.index > 0) this.switchTo(home.sec.pages[home.index - 1]); break;
      case 'next': if (home && home.index < home.sec.pages.length - 1) this.switchTo(home.sec.pages[home.index + 1]); break;
      case 'newpage': if (home) { const pg = createPage(home.sec, this.item().paper); this.switchTo(pg.id); } break;
    }
  },
  moreMenu() {
    const it = this.item();
    const card = openSheet(`
      <h2>Page options</h2>
      <h3>Paper</h3>
      <div class="seg">${PAPERS.map(pp => `<button data-paper="${pp}" class="${it.paper === pp ? 'on' : ''}">${pp[0].toUpperCase() + pp.slice(1)}</button>`).join('')}</div>
      <h3>Page</h3>
      <div class="menu-list">
        <button class="btn" data-m="clear">Clear all writing on this page</button>
        <button class="btn danger" data-m="delete">Delete this ${this.kind === 'dump' ? 'brain dump' : 'page'}</button>
      </div>
      <div class="sheet-actions"><button class="btn primary" data-close>Done</button></div>`);
    card.onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.paper) {
        it.paper = b.dataset.paper; this.surf.paper = it.paper; this.surf.redraw(); save(); clearThumbs(this.id);
        $$('[data-paper]', card).forEach(x => x.classList.toggle('on', x === b));
      } else if (b.dataset.m === 'clear') {
        closeSheet(); this.surf.clearAll(); toast('Cleared – Undo brings it back.');
      } else if (b.dataset.m === 'delete') {
        if (!confirm('Delete this for good? This cannot be undone.')) return;
        closeSheet(); const id = this.id, kind = this.kind;
        this.close(true);
        if (kind === 'page') deletePage(id); else deleteDump(id);
        render();
      }
    };
  },
  close(skipCleanup) {
    if (!this.el) return;
    const kind = this.kind, id = this.id;
    const sc = $('.ed-scroll', this.el);
    if (S.last && S.last.id === id && sc) S.last.scroll = sc.scrollTop;
    this.el.hidden = true; this.el.innerHTML = ''; this.surf = null; this.kind = null; this.id = null;
    // A brain dump that was opened but never written in quietly disappears – no clutter.
    if (!skipCleanup && kind === 'dump') {
      const strokes = Store.ink.get(id);
      if (!strokes || !strokes.length) { deleteDump(id); if (S.last && S.last.id === id) S.last = this.prevLast || null; }
    }
    save(); Store.flush(); render();
  },
  relayout() { if (this.surf) this.surf.layout(); }
};

/* ---------------- Sheets & toast ---------------- */
function openSheet(html, opts = {}) {
  const sh = $('#sheet');
  sh.innerHTML = `<div class="sheet-backdrop" ${opts.modal ? '' : 'data-close'}></div><div class="sheet-card ${opts.wide ? 'wide' : ''}">${html}</div>`;
  sh.hidden = false;
  sh.onclick = e => { if (e.target.closest('[data-close]')) closeSheet(); };
  return $('.sheet-card', sh);
}
function closeSheet() { const sh = $('#sheet'); sh.hidden = true; sh.innerHTML = ''; }
function toast(msg, action) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button>${esc(action.label)}</button>` : ''}`;
  if (action) t.querySelector('button').onclick = () => { t.classList.remove('show'); action.fn(); };
  t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), action ? 7000 : 2600);
}

/* Label editor: handwriting by default, typing optional */
function openLabelEditor({ title, hint, lbl = {}, onSave, another }) {
  let mode = lbl.ink ? 'ink' : lbl.text ? 'text' : S.settings.labelMode;
  const card = openSheet(`
    <h2>${esc(title)}</h2>
    ${hint ? `<p class="muted">${esc(hint)}</p>` : ''}
    <div class="seg" style="margin-bottom:12px"><button data-mode="ink">✎ Write</button><button data-mode="text">Aa Type</button></div>
    <div class="ink-mode"><div class="strip"></div>
      <div class="strip-tools"><button class="btn quiet" data-lb="undo">Undo</button><button class="btn quiet" data-lb="clear">Clear</button></div></div>
    <div class="text-mode"><input class="lbl-input" type="text" maxlength="160" placeholder="Type it here" value="${esc(lbl.text || '')}"></div>
    <div class="sheet-actions">
      <button class="btn ghost" data-lb="cancel">Cancel</button>
      ${another ? '<button class="btn" data-lb="another">Save + add another</button>' : ''}
      <button class="btn primary" data-lb="save">Save</button>
    </div>`, { modal: true, wide: true });
  const surf = new InkSurface($('.strip', card), {
    w: LABEL_W, h: LABEL_H, paper: 'blank', baseline: true,
    style: () => ({ tool: 'pen', color: PEN_COLORS[0], size: 5 })
  });
  const input = $('.lbl-input', card);
  const setMode = m => {
    mode = m;
    $$('[data-mode]', card).forEach(b => b.classList.toggle('on', b.dataset.mode === m));
    $('.ink-mode', card).style.display = m === 'ink' ? '' : 'none';
    $('.text-mode', card).style.display = m === 'text' ? '' : 'none';
    if (m === 'ink') requestAnimationFrame(() => surf.layout()); else setTimeout(() => input.focus(), 50);
  };
  setMode(mode);
  (async () => { const s = lbl.ink ? await Store.loadInk(lbl.ink) : []; surf.setStrokes(s.slice()); })();
  const commit = () => {
    if (mode === 'ink') {
      if (!surf.strokes.length) { toast('Write something first – or tap Cancel.'); return false; }
      const id = lbl.ink || uid('L');
      Store.setInk(id, surf.strokes.slice());
      onSave({ ink: id, text: '' });
    } else {
      const t = input.value.trim();
      if (!t) { toast('Type something first – or tap Cancel.'); return false; }
      if (lbl.ink) Store.deleteInk(lbl.ink);
      onSave({ ink: null, text: t });
    }
    return true;
  };
  card.onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.mode) { setMode(b.dataset.mode); return; }
    switch (b.dataset.lb) {
      case 'undo': surf.doUndo(); break;
      case 'clear': surf.clearAll(); break;
      case 'cancel': closeSheet(); break;
      case 'save': if (commit()) closeSheet(); break;
      case 'another':
        if (commit()) { lbl = {}; surf.setStrokes([]); input.value = ''; toast('Saved. Next one…'); }
        break;
    }
  };
  input.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); if (commit()) closeSheet(); } };
}

/* ---------------- Common UI pieces ---------------- */
function labelHTML(l, big, hh) {
  const h = hh || (big ? 64 : 40);
  if (l.ink) return `<span class="lbl ${big ? 'big' : ''}"><img data-ink-label="${esc(l.ink)}" data-h="${h}" alt="Handwritten label"></span>`;
  if (l.text) return `<span class="lbl text ${big ? 'big' : ''}">${esc(l.text)}</span>`;
  return `<span class="lbl text empty ${big ? 'big' : ''}">Untitled</span>`;
}
const projLabel = (p, big) => labelHTML({ ink: p.titleInk, text: p.title }, big);
const stepLabel = s => labelHTML({ ink: s.ink, text: s.text });
function ringHTML(p, size = 64) {
  const pr = progress(p), r = (size - 8) / 2, c = 2 * Math.PI * r;
  return `<span data-ring="${p.id}"><svg class="ring" style="width:${size}px;height:${size}px" viewBox="0 0 ${size} ${size}">
    <circle class="ring-track" cx="${size / 2}" cy="${size / 2}" r="${r}"/>
    <circle class="ring-fill" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-dasharray="${c}" style="stroke-dashoffset:${c * (1 - pr.pct)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle">${Math.round(pr.pct * 100)}%</text></svg></span>`;
}
const checkHTML = (done, attrs) => `<button class="check ${done ? 'done' : ''}" ${attrs} aria-label="${done ? 'Done' : 'Mark done'}">${icon('tick')}</button>`;
function dueHTML(due) { const d = dueLabel(due); return d ? `<div class="due ${d.cls}">${esc(d.text)}</div>` : ''; }

/* ---------------- Routing & render ---------------- */
function go(view, params = {}) {
  S.ui.view = view; Object.assign(S.ui, params);
  if (view === 'project' && params.projectId) S.last = { type: 'project', id: params.projectId, at: Date.now() };
  save(); $('#view').scrollTop = 0; render();
}
function render() {
  document.body.classList.toggle('low', !!S.settings.lowEnergy);
  renderTop(); renderTabs();
  let html;
  if (S.settings.lowEnergy) html = viewLow();
  else switch (S.ui.view) {
    case 'projects': html = viewProjects(); break;
    case 'project': html = proj(S.ui.projectId) ? viewProject() : viewProjects(); break;
    case 'notebook': html = viewNotebook(); break;
    case 'inbox': html = viewInbox(); break;
    default: html = viewToday();
  }
  const v = $('#view'); v.innerHTML = `<div class="wrap">${html}</div>`;
  hydrate(v);
}
function renderTop() {
  const t = $('#topbar'), state = $('#saved') ? $('#saved').dataset.state : 'saved';
  t.innerHTML = `<div class="brand">Billsyboos</div><span id="saved"></span>
    <button class="top-btn ${S.settings.lowEnergy ? 'on' : ''}" data-act="low-toggle" aria-pressed="${!!S.settings.lowEnergy}">${icon('leaf')}<span>Low energy</span></button>
    <button class="top-btn" data-act="settings" aria-label="Settings">${icon('settings')}</button>`;
  setSaved(state || 'saved');
}
function renderTabs() {
  const tabs = [['today', 'Today', 'sun'], ['projects', 'Projects', 'projects'], ['notebook', 'Notebook', 'book'], ['inbox', 'Inbox', 'inbox']]
    .filter(([k]) => S.settings.tabs[k]);
  const cur = S.ui.view === 'project' ? 'projects' : S.ui.view;
  $('#tabbar').innerHTML = tabs.map(([k, label, ic]) =>
    `<button class="${cur === k ? 'on' : ''}" data-act="tab" data-v="${k}">${icon(ic)}<span>${label}</span>${k === 'inbox' && S.inbox.length ? `<span class="badge">${S.inbox.length}</span>` : ''}</button>`).join('');
}

/* ---------------- Today ---------------- */
function todayItems() {
  const t = dayKey(), before = S.today.length;
  S.today = S.today.filter(it => {
    const st = stepOf(it.pid, it.sid);
    if (!st) return false;
    if (st.done && st.doneAt && dayKey(new Date(st.doneAt)) !== t) return false;
    return true;
  });
  if (S.today.length > S.settings.slots) S.today = S.today.slice(0, S.settings.slots);
  if (S.today.length !== before) save();
  return S.today;
}
function prioHTML(it, i) {
  const p = proj(it.pid), st = stepOf(it.pid, it.sid);
  return `<div class="prio ${st.done ? 'is-done' : ''}">
    ${checkHTML(st.done, `data-act="step-check" data-pid="${p.id}" data-sid="${st.id}"`)}
    <div class="meta">${stepLabel(st)}<div class="proj-name">${p.system ? 'Quick task' : p.title ? 'in ' + esc(p.title) : p.titleInk ? 'in ' + labelHTML({ ink: p.titleInk }, false, 24) : ''}</div></div>
    <button class="icon-btn" data-act="today-menu" data-i="${i}" aria-label="Options">${icon('more')}</button></div>`;
}
function viewToday() {
  const items = todayItems(), d = new Date();
  let html = `<h1>Today</h1><p class="date">${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}</p>`;
  if (!isStandalone() && !S.ui.hideInstall) {
    html += `<div class="banner"><strong>Add this to your Home Screen before you start.</strong><br>
      In Safari tap Share, then <em>Add to Home Screen</em>, and open it from there. Notes written here in a Safari tab are stored separately from the Home Screen app.
      <div class="row-btns"><button class="btn quiet" data-act="hide-install">Hide this</button></div></div>`;
  }
  if (needsBackupNudge()) {
    html += `<div class="banner">Your notes live only on this iPad. A backup takes one tap.
      <div class="row-btns"><button class="btn primary" data-act="backup-now">Back up now</button><button class="btn quiet" data-act="backup-later">Not now</button></div></div>`;
  }
  const slots = S.settings.slots;
  html += items.map(prioHTML).join('');
  for (let i = items.length; i < slots; i++) html += `<button class="prio empty" data-act="today-pick">${icon('plus')} Choose ${items.length === 0 && i === 0 ? 'a priority' : 'another'}</button>`;
  if (items.length && items.every(it => stepOf(it.pid, it.sid).done)) html += `<p class="muted" style="text-align:center;margin:6px 0 16px">That's today's priorities done. Anything else is a bonus.</p>`;
  html += resumeCard();
  const soon = S.projects.filter(p => p.status === 'active' && p.due && daysBetween(dayKey(), p.due) <= 7).sort((a, b) => a.due.localeCompare(b.due)).slice(0, 3);
  if (soon.length) {
    html += `<section class="card"><p class="eyebrow">Coming up</p>${soon.map(p => `
      <button class="list-row" style="width:100%;text-align:left" data-act="open-project" data-id="${p.id}"><div class="meta">${projLabel(p)}${dueHTML(p.due)}</div></button>`).join('')}</section>`;
  }
  if (S.inbox.length) html += `<button class="btn ghost" style="width:100%" data-act="tab" data-v="inbox">${S.inbox.length} brain dump${S.inbox.length > 1 ? 's' : ''} in your Inbox – sort whenever suits</button>`;
  return html;
}
function resumeCard() {
  const L = S.last; if (!L) return '';
  let thumb = '', body = '';
  if (L.type === 'page') {
    const pg = S.pages[L.id]; if (!pg) return '';
    const home = findPageHome(L.id), pr = S.projects.find(x => x.notesPage === L.id);
    thumb = `<img class="resume-thumb" data-ink-page="${L.id}" data-paper="${pg.paper}" alt="">`;
    body = `<strong>${home ? esc(home.sec.name) + ' · Page ' + (home.index + 1) : 'Project notes'}</strong>${pr ? '<div class="due">' + (pr.title ? esc(pr.title) : '') + '</div>' : ''}`;
  } else if (L.type === 'dump') {
    const dmp = S.inbox.find(x => x.id === L.id); if (!dmp) return '';
    thumb = `<img class="resume-thumb" data-ink-page="${L.id}" data-paper="${dmp.paper || 'blank'}" alt="">`;
    body = `<strong>Brain dump</strong><div class="due">${ago(dmp.updated)}</div>`;
  } else if (L.type === 'project') {
    const p = proj(L.id); if (!p || p.status === 'done') return '';
    const nx = nextStep(p);
    body = `${projLabel(p)}${nx ? `<div class="next-line">Next: ${stepLabel(nx)}</div>` : '<div class="due">No steps yet – add the first small one</div>'}`;
  } else return '';
  return `<section class="card"><p class="eyebrow">Pick up where you left off</p>
    <div class="resume-row">${thumb}<div class="meta">${body}</div><button class="btn primary" data-act="resume">Continue</button></div></section>`;
}
function resumeLast(silent) {
  const L = S.last; if (!L) return;
  if ((L.type === 'page' && S.pages[L.id]) || (L.type === 'dump' && S.inbox.find(d => d.id === L.id))) Editor.open(L.type, L.id, { scroll: L.scroll });
  else if (L.type === 'project' && proj(L.id)) go('project', { projectId: L.id });
  else return;
  if (silent) toast('Picked up where you left off.');
}
function openPicker() {
  const inToday = new Set(S.today.map(t => t.sid));
  const groups = S.projects.filter(p => p.status === 'active').map(p => {
    const steps = p.steps.filter(s => !s.done && !inToday.has(s.id)).slice(0, 4);
    return steps.length ? `<div class="pick-group"><div class="gname">${p.system ? 'Quick tasks' : (p.title ? esc(p.title) : 'Project')}</div>${p.titleInk && !p.system ? `<div style="margin:-4px 0 6px">${projLabel(p)}</div>` : ''}
      ${steps.map(s => `<button class="pick-row" data-pid="${p.id}" data-sid="${s.id}">${stepLabel(s)}</button>`).join('')}</div>` : '';
  }).join('');
  const card = openSheet(`<h2>Choose a priority</h2>
    <div class="menu-list" style="margin-bottom:16px"><button class="btn primary" data-new>✎ Write a new one</button></div>
    ${groups || '<p class="muted">No open steps yet. Write a new one above, or add small steps inside a project.</p>'}
    <div class="sheet-actions"><button class="btn ghost" data-close>Close</button></div>`, { wide: true });
  hydrate(card);
  card.onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.sid) { addToday(b.dataset.pid, b.dataset.sid); closeSheet(); render(); }
    else if (b.hasAttribute('data-new')) {
      openLabelEditor({ title: 'What matters today?', onSave: l => { const p = quickProject(); const st = newStep(p, l); addToday(p.id, st.id); render(); } });
    }
  };
}
function addToday(pid, sid) {
  todayItems();
  if (S.today.some(t => t.sid === sid)) return true;
  if (S.today.length >= S.settings.slots) { toast(`Today already has ${S.settings.slots} – that's plenty. Swap one out first.`); return false; }
  S.today.push({ pid, sid, added: dayKey() }); save(); return true;
}
function needsBackupNudge() {
  const has = S.projects.length || S.inbox.length || Object.keys(S.pages).length;
  if (!has || Date.now() < (S.backupSnooze || 0)) return false;
  if (!S.lastBackup) return Date.now() - S.created > 2 * 86400000;
  return Date.now() - S.lastBackup > 7 * 86400000;
}

/* ---------------- Low-energy ---------------- */
function viewLow() {
  const items = todayItems();
  const it = items.find(x => { const s = stepOf(x.pid, x.sid); return s && !s.done; });
  let core;
  if (it) {
    const st = stepOf(it.pid, it.sid);
    core = `<h1>Just this one thing</h1><div class="low-card">${checkHTML(false, `data-act="step-check" data-pid="${it.pid}" data-sid="${st.id}"`)}<div>${stepLabel(st)}</div></div>`;
  } else {
    core = `<h1>Nothing needed right now.</h1><p class="muted">Resting counts. If a thought pops up, drop it in a brain dump.</p>
      <button class="btn ghost" data-act="today-pick">Pick one small thing</button>`;
  }
  return `<div class="low-wrap"><p class="eyebrow">Low-energy mode</p>${core}
    <button class="btn huge" data-act="dump">✎ Brain dump</button>
    <button class="btn quiet" data-act="low-toggle">Back to the normal view</button></div>`;
}

/* ---------------- Projects ---------------- */
function viewProjects() {
  const f = S.ui.projectFilter;
  const list = S.projects.filter(p => p.status === f);
  const count = s => S.projects.filter(p => p.status === s).length;
  let html = `<div class="view-head"><h1>Projects</h1></div>
    <div class="seg">
      <button class="${f === 'active' ? 'on' : ''}" data-act="pfilter" data-f="active">Active · ${count('active')}</button>
      <button class="${f === 'parked' ? 'on' : ''}" data-act="pfilter" data-f="parked">Parking Lot · ${count('parked')}</button>
      <button class="${f === 'done' ? 'on' : ''}" data-act="pfilter" data-f="done">Done · ${count('done')}</button>
    </div>`;
  if (f === 'parked') html += `<p class="hint" style="margin-top:12px">Ideas you're not ready to act on. No dates, no pressure – they'll wait here safely.</p>`;
  if (f !== 'done') html += `<div style="margin-top:14px"><button class="btn big" data-act="new-project">${icon('plus')} ${f === 'parked' ? 'Park a new idea' : 'New project'}</button></div>`;
  if (!list.length) {
    html += `<div class="empty-state">${f === 'active' ? 'No active projects yet.' : f === 'parked' ? 'The Parking Lot is empty.' : 'Finished projects will appear here.'}</div>`;
    return html;
  }
  html += `<div class="proj-grid">${list.map(p => {
    const pr = progress(p), nx = nextStep(p);
    return `<button class="proj-card" data-act="open-project" data-id="${p.id}">${ringHTML(p, 60)}
      <div class="meta">${projLabel(p)}
        ${f === 'active' ? (nx ? `<div class="next-line">Next: ${stepLabel(nx)}</div>` : `<div class="next-line">${pr.t ? 'All steps done' : 'No steps yet'}</div>`) : ''}
        ${f === 'active' ? dueHTML(p.due) : ''}
        <div class="due">${pr.d} of ${pr.t} steps</div></div></button>`;
  }).join('')}</div>`;
  return html;
}
function viewProject() {
  const p = proj(S.ui.projectId), pr = progress(p), nx = nextStep(p);
  const inToday = new Set(S.today.map(t => t.sid));
  const open = p.steps.filter(s => !s.done), done = p.steps.filter(s => s.done);
  const stepRow = s => `<div class="step ${s.done ? 'is-done' : ''}">
    ${checkHTML(s.done, `data-act="step-check" data-pid="${p.id}" data-sid="${s.id}"`)}
    <button class="lblbtn" data-act="step-edit" data-sid="${s.id}">${stepLabel(s)}</button>
    ${s.done ? '' : `<button class="icon-btn ${inToday.has(s.id) ? 'on' : ''}" data-act="step-today" data-sid="${s.id}" aria-label="Add to Today">${icon('star')}</button>`}
    <button class="icon-btn" data-act="step-menu" data-sid="${s.id}" aria-label="Step options">${icon('more')}</button></div>`;
  return `
    <button class="btn quiet" data-act="tab" data-v="projects">${icon('back')} Projects</button>
    <div class="proj-head" style="margin-top:8px">
      <button class="title" data-act="edit-title">${projLabel(p, true)}</button>
      <button class="icon-btn" data-act="project-menu" aria-label="Project options">${icon('more')}</button>
    </div>
    <div class="seg" style="margin-bottom:16px">
      ${[['active', 'Active'], ['parked', 'Parked'], ['done', 'Done']].map(([k, l]) => `<button class="${p.status === k ? 'on' : ''}" data-act="pstatus" data-s="${k}">${l}</button>`).join('')}
    </div>
    <div class="card progress-line">${ringHTML(p, 84)}
      <div style="flex:1"><strong class="progress-text">${pr.t ? `${pr.d} of ${pr.t} small steps done` : 'No steps yet'}</strong>
        <div class="due-row" style="margin-top:8px"><span class="muted">Aim for:</span>
          <input type="date" data-change="due" value="${p.due || ''}" aria-label="Target date">
          ${p.due ? '<button class="btn quiet" data-act="due-clear">No date</button>' : ''}</div>
        ${p.due ? dueHTML(p.due) : '<div class="due">A date is optional.</div>'}
      </div></div>
    ${nx && p.status !== 'done' ? `<div class="next-card"><p class="eyebrow">Next small step</p><div class="row">
      ${checkHTML(false, `data-act="step-check" data-pid="${p.id}" data-sid="${nx.id}"`)}<div style="flex:1;min-width:0">${stepLabel(nx)}</div>
      ${inToday.has(nx.id) ? '<span class="due soon">On Today</span>' : `<button class="btn" data-act="step-today" data-sid="${nx.id}">${icon('star')} Today</button>`}</div></div>` : ''}
    <h3>Steps</h3>
    ${open.map(stepRow).join('')}
    <button class="btn big" data-act="add-step">${icon('plus')} Add a small step</button>
    <p class="hint">Tip: make each step small enough to start in two minutes.</p>
    ${done.length ? `<h3>Done · ${done.length}</h3>${S.ui.showDone ? done.map(stepRow).join('') : ''}
      <button class="btn quiet" data-act="toggle-done">${S.ui.showDone ? 'Hide done steps' : 'Show done steps'}</button>` : ''}
    <h3>Notes</h3>
    <button class="btn" data-act="open-notes">✎ ${p.notesPage ? 'Open handwritten notes' : 'Start handwritten notes'}</button>`;
}
function toggleStep(pid, sid, btn) {
  const p = proj(pid), st = stepOf(pid, sid); if (!st) return;
  st.done = !st.done; st.doneAt = st.done ? Date.now() : null; p.updated = Date.now(); save();
  if (btn) { btn.classList.toggle('done', st.done); if (st.done) btn.classList.add('pop'); }
  const pr = progress(p);
  $$(`[data-ring="${pid}"]`).forEach(w => {
    const c = $('.ring-fill', w); const C = +c.getAttribute('stroke-dasharray');
    c.style.strokeDashoffset = C * (1 - pr.pct); $('text', w).textContent = Math.round(pr.pct * 100) + '%';
  });
  const allDone = st.done && pr.t && pr.d === pr.t && p.status === 'active' && !p.system;
  if (allDone) toast('Every step done!', { label: 'Mark project done', fn: () => { p.status = 'done'; save(); render(); } });
  else if (st.done) toast(CHEERS[Math.floor(Math.random() * CHEERS.length)]);
  setTimeout(render, 700);
}
function deleteProject(p) {
  Store.deleteInk(p.titleInk);
  for (const s of p.steps) Store.deleteInk(s.ink);
  if (p.notesPage) { Store.deleteInk(p.notesPage); delete S.pages[p.notesPage]; }
  S.projects = S.projects.filter(x => x !== p);
  S.today = S.today.filter(t => t.pid !== p.id);
  save();
}
function stepMenu(p, st) {
  const i = p.steps.indexOf(st), inToday = S.today.some(t => t.sid === st.id);
  const card = openSheet(`<h2>Step</h2><div style="margin-bottom:14px">${stepLabel(st)}</div>
    <div class="menu-list">
      <button class="btn" data-m="edit">✎ Rewrite this step</button>
      ${st.done ? '' : `<button class="btn" data-m="today">${inToday ? 'Remove from Today' : '☆ Add to Today'}</button>`}
      <button class="btn" data-m="up" ${i === 0 ? 'disabled' : ''}>Move up</button>
      <button class="btn" data-m="down" ${i === p.steps.length - 1 ? 'disabled' : ''}>Move down</button>
      <button class="btn danger" data-m="delete">Delete step</button>
    </div><div class="sheet-actions"><button class="btn ghost" data-close>Close</button></div>`);
  hydrate(card);
  card.onclick = e => {
    const b = e.target.closest('button'); if (!b || b.disabled || !b.dataset.m) return;
    const m = b.dataset.m;
    if (m === 'edit') { closeSheet(); editStep(p, st); return; }
    if (m === 'today') { if (inToday) S.today = S.today.filter(t => t.sid !== st.id); else addToday(p.id, st.id); save(); }
    if (m === 'up' || m === 'down') { const j = m === 'up' ? i - 1 : i + 1; [p.steps[i], p.steps[j]] = [p.steps[j], p.steps[i]]; save(); }
    if (m === 'delete') { if (!confirm('Delete this step?')) return; Store.deleteInk(st.ink); p.steps.splice(i, 1); S.today = S.today.filter(t => t.sid !== st.id); save(); }
    closeSheet(); render();
  };
}
function editStep(p, st) {
  openLabelEditor({ title: 'Rewrite this step', lbl: { ink: st.ink, text: st.text }, onSave: l => { st.ink = l.ink; st.text = l.text; p.updated = Date.now(); save(); render(); } });
}
function projectMenu(p) {
  const card = openSheet(`<h2>Project</h2><div class="menu-list">
      <button class="btn" data-m="rename">✎ Rename</button>
      <button class="btn danger" data-m="delete">Delete project</button></div>
    <div class="sheet-actions"><button class="btn ghost" data-close>Close</button></div>`);
  card.onclick = e => {
    const b = e.target.closest('button'); if (!b || !b.dataset.m) return;
    if (b.dataset.m === 'rename') { closeSheet(); renameProject(p); }
    if (b.dataset.m === 'delete') {
      if (!confirm('Delete this project, its steps and its notes? This cannot be undone.')) return;
      closeSheet(); deleteProject(p); go('projects');
    }
  };
}
function renameProject(p) {
  openLabelEditor({ title: 'Name your project', lbl: { ink: p.titleInk, text: p.title }, onSave: l => { p.titleInk = l.ink; p.title = l.text; p.updated = Date.now(); save(); render(); } });
}

/* ---------------- Notebook ---------------- */
function createPage(sec, paper) {
  const pg = { id: uid('G'), paper: paper || S.settings.paper, created: Date.now(), updated: Date.now() };
  S.pages[pg.id] = pg; sec.pages.push(pg.id); Store.setInk(pg.id, []); save(); return pg;
}
function deletePage(id) {
  const home = findPageHome(id);
  if (home) home.sec.pages.splice(home.index, 1);
  for (const p of S.projects) if (p.notesPage === id) p.notesPage = null;
  delete S.pages[id]; Store.deleteInk(id); save();
}
function viewNotebook() {
  const nb = notebook(), sec = section();
  let html = `<div class="view-head"><h1>Notebook</h1><button class="chip" data-act="nb-switch">${esc(nb.name)} ▾</button></div>
    <div class="tabs-row">${nb.sections.map(s => `<button class="sec ${sec && s.id === sec.id ? 'on' : ''}" data-act="sec" data-id="${s.id}">${esc(s.name)}</button>`).join('')}
    <button class="sec add" data-act="sec-add">+ Section</button></div>`;
  if (!sec) return html + '<div class="empty-state">Add a section to start writing.</div>';
  html += `<p class="hint" style="margin:0 0 12px">Tap the highlighted section tab again to rename or remove it.</p>
    <div class="pages"><button class="page-card" data-act="page-new"><span class="newp">+</span>New page</button>
    ${sec.pages.map((id, i) => { const pg = S.pages[id]; return pg ? `<button class="page-card" data-act="page-open" data-id="${id}"><img data-ink-page="${id}" data-paper="${pg.paper}" alt="Page ${i + 1}"><span>Page ${i + 1}</span></button>` : ''; }).join('')}</div>`;
  return html;
}
function notebookMenu() {
  const nb = notebook();
  const card = openSheet(`<h2>Notebooks</h2><div class="menu-list">
    ${S.notebooks.map(n => `<button class="btn" data-nb="${n.id}">${n.id === nb.id ? '● ' : ''}${esc(n.name)}</button>`).join('')}
    <button class="btn" data-m="new">${icon('plus')} New notebook</button>
    <button class="btn" data-m="rename">Rename “${esc(nb.name)}”</button>
    ${S.notebooks.length > 1 ? `<button class="btn danger" data-m="delete">Delete “${esc(nb.name)}”</button>` : ''}
    </div><div class="sheet-actions"><button class="btn ghost" data-close>Close</button></div>`);
  card.onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.nb) { S.ui.notebookId = b.dataset.nb; S.ui.sectionId = null; save(); closeSheet(); render(); return; }
    const m = b.dataset.m;
    if (m === 'new') {
      const name = (prompt('Name for the new notebook?', 'New notebook') || '').trim(); if (!name) return;
      const n = { id: uid('B'), name, sections: [{ id: uid('C'), name: 'Notes', pages: [] }] };
      S.notebooks.push(n); S.ui.notebookId = n.id; S.ui.sectionId = null; save(); closeSheet(); render();
    } else if (m === 'rename') {
      const name = (prompt('Rename notebook', nb.name) || '').trim(); if (!name) return;
      nb.name = name; save(); closeSheet(); render();
    } else if (m === 'delete') {
      const count = nb.sections.reduce((a, s) => a + s.pages.length, 0);
      if (!confirm(`Delete “${nb.name}” and its ${count} page${count === 1 ? '' : 's'}? This cannot be undone.`)) return;
      for (const s of nb.sections) for (const id of [...s.pages]) deletePage(id);
      S.notebooks = S.notebooks.filter(x => x !== nb); S.ui.notebookId = S.notebooks[0].id; S.ui.sectionId = null;
      save(); closeSheet(); render();
    }
  };
}
function sectionMenu(sec) {
  const nb = notebook(), i = nb.sections.indexOf(sec);
  const card = openSheet(`<h2>Section: ${esc(sec.name)}</h2><div class="menu-list">
    <button class="btn" data-m="rename">Rename</button>
    <button class="btn" data-m="left" ${i === 0 ? 'disabled' : ''}>Move left</button>
    <button class="btn" data-m="right" ${i === nb.sections.length - 1 ? 'disabled' : ''}>Move right</button>
    <button class="btn danger" data-m="delete">Delete section</button></div>
    <div class="sheet-actions"><button class="btn ghost" data-close>Close</button></div>`);
  card.onclick = e => {
    const b = e.target.closest('button'); if (!b || b.disabled || !b.dataset.m) return;
    const m = b.dataset.m;
    if (m === 'rename') { const n = (prompt('Rename section', sec.name) || '').trim(); if (!n) return; sec.name = n; }
    if (m === 'left' || m === 'right') { const j = m === 'left' ? i - 1 : i + 1; [nb.sections[i], nb.sections[j]] = [nb.sections[j], nb.sections[i]]; }
    if (m === 'delete') {
      if (!confirm(`Delete “${sec.name}” and its ${sec.pages.length} page${sec.pages.length === 1 ? '' : 's'}? This cannot be undone.`)) return;
      for (const id of [...sec.pages]) deletePage(id);
      nb.sections.splice(i, 1); S.ui.sectionId = null;
    }
    save(); closeSheet(); render();
  };
}

/* ---------------- Inbox (brain dumps) ---------------- */
function newDump() {
  const d = { id: uid('D'), paper: 'blank', created: Date.now(), updated: Date.now() };
  S.inbox.unshift(d); Store.setInk(d.id, []); save();
  Editor.open('dump', d.id);
}
function deleteDump(id) { S.inbox = S.inbox.filter(d => d.id !== id); Store.deleteInk(id); save(); }
function viewInbox() {
  let html = `<div class="view-head"><h1>Inbox</h1></div><p class="muted">Brain dumps land here. Sort them whenever you like – or never.</p>`;
  if (!S.inbox.length) return html + `<div class="empty-state">Nothing waiting.<br>Tap <strong>Brain dump</strong> any time a thought arrives.</div>`;
  return html + `<div class="dump-grid">${S.inbox.map(d => `<div class="dump">
      <button data-act="dump-open" data-id="${d.id}"><img data-ink-page="${d.id}" data-paper="${d.paper || 'blank'}" alt="Brain dump"></button>
      <div class="when">${ago(d.created)}</div>
      <div class="row-btns"><button class="btn" data-act="dump-open" data-id="${d.id}">Open</button><button class="btn primary" data-act="dump-sort" data-id="${d.id}">Sort</button></div>
    </div>`).join('')}</div>`;
}
function sortDump(id) {
  const d = S.inbox.find(x => x.id === id); if (!d) return;
  const card = openSheet(`<h2>Where should this go?</h2>
    <p class="muted">Your handwriting moves with it.</p>
    <div class="menu-list">
      <button class="btn" data-m="project">Make it a new project</button>
      <button class="btn" data-m="step">Add it as a step to a project…</button>
      <button class="btn" data-m="park">Put it in the Parking Lot</button>
      <button class="btn" data-m="page">File it in a notebook…</button>
      <button class="btn danger" data-m="delete">Delete it</button>
    </div><div class="sheet-actions"><button class="btn ghost" data-close>Keep it in the Inbox</button></div>`);
  const removeFromInbox = () => { S.inbox = S.inbox.filter(x => x.id !== id); };
  card.onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.pid) {
      const p = proj(b.dataset.pid); newStep(p, { ink: id }); removeFromInbox(); save(); closeSheet(); render();
      toast('Added as a step.', { label: 'Open project', fn: () => go('project', { projectId: p.id }) }); return;
    }
    if (b.dataset.sec) {
      const [nbId, secId] = b.dataset.sec.split('|');
      const sec = S.notebooks.find(n => n.id === nbId).sections.find(s => s.id === secId);
      S.pages[id] = { id, paper: d.paper || 'blank', created: d.created, updated: d.updated };
      sec.pages.push(id); removeFromInbox(); save(); closeSheet(); render();
      toast(`Filed in ${sec.name}.`); return;
    }
    switch (b.dataset.m) {
      case 'project': { const p = newProject({ titleInk: id }); removeFromInbox(); save(); closeSheet(); go('project', { projectId: p.id }); break; }
      case 'park': newProject({ titleInk: id, status: 'parked' }); removeFromInbox(); save(); closeSheet(); render(); toast('Parked. It will wait safely.'); break;
      case 'delete': if (!confirm('Delete this brain dump?')) return; deleteDump(id); closeSheet(); render(); break;
      case 'step': {
        const ps = S.projects.filter(p => p.status !== 'done');
        $('.menu-list', card).innerHTML = ps.length
          ? ps.map(p => `<button class="btn" data-pid="${p.id}">${p.system ? 'Quick tasks' : projLabel(p)}</button>`).join('')
          : '<p class="muted">No projects yet – choose “Make it a new project” instead.</p>';
        $('h2', card).textContent = 'Add to which project?'; hydrate(card); break;
      }
      case 'page': {
        $('.menu-list', card).innerHTML = S.notebooks.map(n => n.sections.map(s =>
          `<button class="btn" data-sec="${n.id}|${s.id}">${esc(n.name)} › ${esc(s.name)}</button>`).join('')).join('');
        $('h2', card).textContent = 'File in which section?'; break;
      }
    }
  };
}

/* ---------------- Backup & restore ---------------- */
function countsOf(st, ink) {
  let strokes = 0; for (const v of Object.values(ink)) strokes += v.length;
  return {
    notebooks: st.notebooks.length, pages: Object.keys(st.pages).length, projects: st.projects.length,
    steps: st.projects.reduce((a, p) => a + p.steps.length, 0), dumps: st.inbox.length,
    inkItems: Object.keys(ink).length, strokes
  };
}
const countsText = c => `${c.notebooks} notebook${c.notebooks === 1 ? '' : 's'}, ${c.pages} page${c.pages === 1 ? '' : 's'}, ${c.projects} project${c.projects === 1 ? '' : 's'}, ${c.steps} step${c.steps === 1 ? '' : 's'}, ${c.dumps} brain dump${c.dumps === 1 ? '' : 's'} and ${c.strokes.toLocaleString('en-GB')} pen strokes`;
async function buildBackup() {
  await Store.flush();
  const all = await DB.all();
  const stEntry = all.find(([k]) => k === 'state');
  const st = stEntry ? stEntry[1] : S;
  const ink = {};
  for (const [k, v] of all) if (typeof k === 'string' && k.startsWith('ink:')) ink[k.slice(4)] = v;
  const data = { app: 'billsyboos-notebook', format: BACKUP_FORMAT, appVersion: APP_VERSION, exportedAt: new Date().toISOString(), counts: countsOf(st, ink), state: st, ink };
  const json = JSON.stringify(data);
  const d = new Date();
  const name = `billsyboos-backup-${dayKey(d)}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
  return { file: new File([json], name, { type: 'application/json' }), counts: data.counts, size: json.length, name };
}
async function exportFlow() {
  const card = openSheet(`<h2>Back up everything</h2><p class="muted">Preparing your backup…</p>`);
  let b;
  try { b = await buildBackup(); } catch (err) { card.innerHTML = `<h2>Backup failed</h2><p>${esc(err.message || err)}</p><div class="sheet-actions"><button class="btn" data-close>Close</button></div>`; return; }
  const canShare = !!(navigator.canShare && navigator.canShare({ files: [b.file] }));
  card.innerHTML = `<h2>Your backup is ready</h2>
    <p>It contains ${countsText(b.counts)} (${fmtBytes(b.size)}).</p>
    <p class="muted">Tap below, then choose <strong>Save to Files</strong> and pick <strong>iCloud Drive</strong>, so it's safe even if something happens to this iPad.</p>
    <div class="sheet-actions"><button class="btn ghost" data-close>Cancel</button><button class="btn primary" data-go>${canShare ? 'Save to Files…' : 'Download backup'}</button></div>`;
  $('[data-go]', card).onclick = async () => {
    if (canShare) {
      try { await navigator.share({ files: [b.file], title: b.name }); }
      catch (err) { if (err && err.name === 'AbortError') return; downloadFile(b.file); }
    } else downloadFile(b.file);
    S.lastBackup = Date.now(); save(); closeSheet(); render();
    toast('Backup saved. Keep it somewhere safe.');
  };
}
function downloadFile(file) {
  const url = URL.createObjectURL(file); const a = document.createElement('a');
  a.href = url; a.download = file.name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 5000);
}
function validateBackup(d) {
  if (!d || d.app !== 'billsyboos-notebook') throw new Error("This doesn't look like a Billsyboos Notebook backup.");
  if (d.format > BACKUP_FORMAT) throw new Error('This backup was made by a newer version of the app. Update the app first.');
  const s = d.state;
  if (!s || !Array.isArray(s.notebooks) || !Array.isArray(s.projects) || !Array.isArray(s.inbox) || typeof s.pages !== 'object') throw new Error('The backup file is incomplete.');
  if (!d.ink || typeof d.ink !== 'object') throw new Error('The handwriting is missing from this backup.');
  for (const v of Object.values(d.ink)) {
    if (!Array.isArray(v)) throw new Error('Some handwriting in the backup is damaged.');
    for (const st of v) if (!st || !Array.isArray(st.pts) || st.pts.length % 3) throw new Error('Some handwriting in the backup is damaged.');
  }
  const c = countsOf(s, d.ink);
  if (d.counts && JSON.stringify(d.counts) !== JSON.stringify(c)) throw new Error('The backup file looks incomplete – its contents don’t match its own summary.');
  return c;
}
function pickFile() {
  return new Promise(res => {
    const inp = $('#fileInput'); inp.value = '';
    inp.onchange = () => res(inp.files && inp.files[0]); inp.click();
  });
}
async function readBackupFile() {
  const f = await pickFile(); if (!f) return null;
  const text = await f.text();
  let d; try { d = JSON.parse(text); } catch (_) { throw new Error("That file isn't a backup (it couldn't be read)."); }
  const counts = validateBackup(d);
  return { d, counts, name: f.name };
}
async function checkFlow() {
  try {
    const r = await readBackupFile(); if (!r) return;
    openSheet(`<h2>Backup looks good ✓</h2><p><strong>${esc(r.name)}</strong></p>
      <p>Made ${fmtStamp(Date.parse(r.d.exportedAt))}. It contains ${countsText(r.counts)}.</p>
      <p class="muted">Every page of handwriting was checked. Nothing was changed in the app.</p>
      <div class="sheet-actions"><button class="btn primary" data-close>Done</button></div>`);
  } catch (err) { openSheet(`<h2>Problem with that file</h2><p>${esc(err.message)}</p><div class="sheet-actions"><button class="btn" data-close>Close</button></div>`); }
}
async function restoreFlow() {
  let r;
  try { r = await readBackupFile(); if (!r) return; }
  catch (err) { openSheet(`<h2>Can't restore that file</h2><p>${esc(err.message)}</p><div class="sheet-actions"><button class="btn" data-close>Close</button></div>`); return; }
  const card = openSheet(`<h2>Restore this backup?</h2>
    <p>Made ${fmtStamp(Date.parse(r.d.exportedAt))}. It contains ${countsText(r.counts)}.</p>
    <p><strong>This replaces everything currently in the app.</strong> A safety copy of what's here now is kept, so you can undo the restore from Settings.</p>
    <div class="sheet-actions"><button class="btn ghost" data-close>Cancel</button><button class="btn primary" data-go>Restore</button></div>`, { modal: true });
  $('[data-go]', card).onclick = async () => {
    card.innerHTML = '<h2>Restoring…</h2><p class="muted">Please keep the app open.</p>';
    try { await applyEntries([['state', r.d.state], ...Object.entries(r.d.ink).map(([id, v]) => ['ink:' + id, v])], true, countsOf(r.d.state, r.d.ink)); }
    catch (err) { card.innerHTML = `<h2>Restore failed</h2><p>${esc(err.message || err)}</p><p class="muted">Nothing was lost – reopen the app.</p>`; }
  };
}
async function applyEntries(entries, keepSafety, expected) {
  await Store.flush();
  Store.locked = true;
  const all = await DB.all();
  const current = all.filter(([k]) => k !== 'safety');
  if (keepSafety) entries.push(['safety', { at: Date.now(), entries: current }]);
  await DB.replaceAll(entries);
  const after = await DB.all();
  const st = (after.find(([k]) => k === 'state') || [])[1];
  const ink = {}; for (const [k, v] of after) if (typeof k === 'string' && k.startsWith('ink:')) ink[k.slice(4)] = v;
  const got = st ? countsOf(st, ink) : null;
  const ok = !!got && (!expected || JSON.stringify(got) === JSON.stringify(expected));
  try { sessionStorage.setItem('bb-restored', JSON.stringify({ ok, counts: got })); } catch (_) { /* ignore */ }
  location.reload();
}
async function undoRestore() {
  const sf = await DB.get('safety'); if (!sf) return;
  if (!confirm(`Go back to how things were before the restore on ${fmtStamp(sf.at)}?`)) return;
  await applyEntries(sf.entries.slice(), false, null);
}

/* ---------------- Settings ---------------- */
async function openSettings() {
  const s = S.settings;
  const safety = await DB.get('safety');
  let persisted = null, est = null;
  try { persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : null; } catch (_) { /* ignore */ }
  try { est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null; } catch (_) { /* ignore */ }
  const offline = !!(navigator.serviceWorker && navigator.serviceWorker.controller);
  const seg = (key, opts) => `<div class="seg">${opts.map(([v, l]) => `<button data-set="${key}" data-val="${v}" class="${String(s[key]) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  const card = openSheet(`
    <h2>Settings</h2>
    <h3>Backup &amp; restore</h3>
    <p>Last backup: <strong>${S.lastBackup ? ago(S.lastBackup) : 'never'}</strong>. <span class="muted">Your notes live only on this iPad until you back them up.</span></p>
    <div class="row-btns">
      <button class="btn primary" data-a="export">Export backup</button>
      <button class="btn" data-a="restore">Restore from backup</button>
      <button class="btn ghost" data-a="check">Check a backup file</button>
      ${safety ? `<button class="btn ghost" data-a="undo-restore">Undo last restore (${fmtStamp(safety.at)})</button>` : ''}
    </div>
    <h3>Today</h3>
    <div class="set-row"><span>Priorities on Today</span>${seg('slots', [[1, '1'], [2, '2'], [3, '3']])}</div>
    <h3>Layout</h3>
    <div class="set-row"><span>Tabs to show</span><div class="seg">${[['today', 'Today'], ['projects', 'Projects'], ['notebook', 'Notebook'], ['inbox', 'Inbox']].map(([k, l]) => `<button data-tab="${k}" class="${s.tabs[k] ? 'on' : ''}">${l}</button>`).join('')}</div></div>
    <div class="set-row"><span>When I open the app</span>${seg('openTo', [['last', 'Where I left off'], ['today', 'Today']])}</div>
    <h3>Writing</h3>
    <div class="set-row"><span>Titles and steps start as</span>${seg('labelMode', [['ink', 'Handwriting'], ['text', 'Typing']])}</div>
    <div class="set-row"><span>New pages use</span>${seg('paper', PAPERS.map(p => [p, p[0].toUpperCase() + p.slice(1)]))}</div>
    <div class="set-row"><span>Draw with finger<br><small class="muted">For testing without a Pencil. Fingers won't scroll pages while on.</small></span>${seg('fingerDraw', [[false, 'Off'], [true, 'On']])}</div>
    <h3>This iPad</h3>
    <p>Installed as an app: <strong>${isStandalone() ? 'Yes' : 'No – add to Home Screen'}</strong><br>
    Works offline: <strong>${offline ? 'Yes' : 'Not yet – open once while online'}</strong><br>
    Storage protection: <strong>${persisted === true ? 'On' : persisted === false ? 'Not granted yet' : 'Unknown'}</strong>${persisted === false ? ' <button class="btn quiet" data-a="persist">Ask again</button>' : ''}<br>
    ${est && est.usage != null ? `Space used: <strong>${fmtBytes(est.usage)}</strong><br>` : ''}
    Version ${APP_VERSION}</p>
    <div class="sheet-actions"><button class="btn primary" data-close>Done</button></div>`, { wide: true });
  card.onclick = async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.set) {
      const k = b.dataset.set; let v = b.dataset.val;
      if (k === 'slots') v = +v; if (k === 'fingerDraw') v = v === 'true';
      s[k] = v; save(); $$(`[data-set="${k}"]`, card).forEach(x => x.classList.toggle('on', x === b)); render(); return;
    }
    if (b.dataset.tab) {
      const k = b.dataset.tab; const on = !s.tabs[k];
      if (!on && Object.values(s.tabs).filter(Boolean).length === 1) { toast('Keep at least one tab.'); return; }
      s.tabs[k] = on; b.classList.toggle('on', on);
      if (!on && S.ui.view === k) S.ui.view = Object.keys(s.tabs).find(t => s.tabs[t]);
      save(); render(); return;
    }
    switch (b.dataset.a) {
      case 'export': exportFlow(); break;
      case 'restore': restoreFlow(); break;
      case 'check': checkFlow(); break;
      case 'undo-restore': closeSheet(); undoRestore(); break;
      case 'persist': { const g = await navigator.storage.persist(); toast(g ? 'Storage protection is on.' : 'iPadOS said no for now – it usually agrees once the app is on your Home Screen.'); break; }
    }
  };
}

/* ---------------- Global events ---------------- */
function onAct(e) {
  const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
  const a = b.dataset.act, p = proj(S.ui.projectId);
  switch (a) {
    case 'tab': go(b.dataset.v); break;
    case 'dump': newDump(); break;
    case 'low-toggle': S.settings.lowEnergy = !S.settings.lowEnergy; save(); $('#view').scrollTop = 0; render(); break;
    case 'settings': openSettings(); break;
    case 'hide-install': S.ui.hideInstall = true; save(); render(); break;
    case 'backup-now': exportFlow(); break;
    case 'backup-later': S.backupSnooze = Date.now() + 3 * 86400000; save(); render(); break;
    case 'today-pick': openPicker(); break;
    case 'today-menu': {
      const it = S.today[+b.dataset.i]; if (!it) return;
      const card = openSheet(`<h2>Priority</h2><div class="menu-list">
        <button class="btn" data-m="open">Open its project</button>
        <button class="btn" data-m="remove">Take off Today</button></div>
        <div class="sheet-actions"><button class="btn ghost" data-close>Close</button></div>`);
      card.onclick = ev => {
        const m = ev.target.closest('[data-m]'); if (!m) return;
        closeSheet();
        if (m.dataset.m === 'open') go('project', { projectId: it.pid });
        else { S.today = S.today.filter(t => t !== it); save(); render(); }
      };
      break;
    }
    case 'resume': resumeLast(false); break;
    case 'step-check': toggleStep(b.dataset.pid, b.dataset.sid, b); break;
    case 'pfilter': S.ui.projectFilter = b.dataset.f; save(); render(); break;
    case 'new-project':
      openLabelEditor({
        title: S.ui.projectFilter === 'parked' ? 'What is the idea?' : 'Name your project',
        onSave: l => { const np = newProject({ titleInk: l.ink, title: l.text, status: S.ui.projectFilter === 'parked' ? 'parked' : 'active' }); if (np.status === 'parked') render(); else go('project', { projectId: np.id }); }
      });
      break;
    case 'open-project': go('project', { projectId: b.dataset.id }); break;
    case 'edit-title': if (p) renameProject(p); break;
    case 'project-menu': if (p) projectMenu(p); break;
    case 'pstatus': if (p) { p.status = b.dataset.s; p.updated = Date.now(); if (p.status !== 'active') S.today = S.today.filter(t => t.pid !== p.id); save(); render(); } break;
    case 'due-clear': if (p) { p.due = null; save(); render(); } break;
    case 'add-step':
      if (p) openLabelEditor({ title: 'Add a small step', hint: 'Small enough to start in two minutes.', another: true, onSave: l => { newStep(p, l); render(); } });
      break;
    case 'step-edit': { const st = p && p.steps.find(s => s.id === b.dataset.sid); if (st) editStep(p, st); break; }
    case 'step-menu': { const st = p && p.steps.find(s => s.id === b.dataset.sid); if (st) stepMenu(p, st); break; }
    case 'step-today': {
      const sid = b.dataset.sid;
      if (S.today.some(t => t.sid === sid)) { S.today = S.today.filter(t => t.sid !== sid); save(); render(); toast('Taken off Today.'); }
      else if (addToday(p.id, sid)) { render(); toast('Added to Today.'); }
      break;
    }
    case 'toggle-done': S.ui.showDone = !S.ui.showDone; save(); render(); break;
    case 'open-notes':
      if (p) {
        if (!p.notesPage || !S.pages[p.notesPage]) {
          const id = uid('N'); S.pages[id] = { id, paper: S.settings.paper, created: Date.now(), updated: Date.now() };
          p.notesPage = id; Store.setInk(id, []); save();
        }
        Editor.open('page', p.notesPage);
      }
      break;
    case 'nb-switch': notebookMenu(); break;
    case 'sec': {
      const sec = section();
      if (sec && sec.id === b.dataset.id) sectionMenu(sec);
      else { S.ui.sectionId = b.dataset.id; save(); render(); }
      break;
    }
    case 'sec-add': {
      const name = (prompt('Name for the new section?', 'New section') || '').trim(); if (!name) return;
      const s = { id: uid('C'), name, pages: [] }; notebook().sections.push(s); S.ui.sectionId = s.id; save(); render(); break;
    }
    case 'page-new': { const sec = section(); if (sec) { const pg = createPage(sec); Editor.open('page', pg.id); } break; }
    case 'page-open': Editor.open('page', b.dataset.id); break;
    case 'dump-open': Editor.open('dump', b.dataset.id); break;
    case 'dump-sort': sortDump(b.dataset.id); break;
  }
}
function onChange(e) {
  const el = e.target.closest('[data-change]'); if (!el) return;
  const p = proj(S.ui.projectId);
  if (el.dataset.change === 'due' && p) { p.due = el.value || null; p.updated = Date.now(); save(); render(); }
}

/* ---------------- Service worker & updates ---------------- */
function registerSW() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  // Only reload when the person tapped "Update now" – never on first install, so writing is never interrupted.
  let updating = false;
  navigator.serviceWorker.register('sw.js').then(reg => {
    const offer = w => toast('A new version is ready.', { label: 'Update now', fn: async () => { await Store.flush(); updating = true; w.postMessage('skipWaiting'); } });
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w && w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w); });
    });
  }).catch(() => { /* offline support unavailable – app still works */ });
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!updating || reloading) return; reloading = true; location.reload(); });
}

/* ---------------- Start ---------------- */
async function init() {
  try { await DB.open(); }
  catch (err) {
    document.body.innerHTML = `<div class="fatal"><h1>Storage isn't available</h1><p>The notebook can't save on this device (${esc(err.message || err)}). If Private Browsing is on, turn it off and reopen the app.</p></div>`;
    return;
  }
  let st = await DB.get('state');
  const fresh = !st;
  Store.state = migrate(st || defaultState());
  S = Store.state;
  if (fresh) save();
  document.addEventListener('click', onAct);
  document.addEventListener('change', onChange);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') Store.flush(); });
  window.addEventListener('pagehide', () => Store.flush());
  let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => Editor.relayout(), 150); });
  document.addEventListener('pointerdown', () => { try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (_) { /* ignore */ } }, { once: true });
  render();
  let restored = null;
  try { restored = JSON.parse(sessionStorage.getItem('bb-restored') || 'null'); sessionStorage.removeItem('bb-restored'); } catch (_) { /* ignore */ }
  if (restored) {
    openSheet(restored.ok
      ? `<h2>Restore complete ✓</h2><p>Checked after restoring: ${countsText(restored.counts)}.</p><div class="sheet-actions"><button class="btn primary" data-close>Lovely</button></div>`
      : `<h2>Restore finished – please check</h2><p>Some numbers didn't match what was expected${restored.counts ? ': ' + countsText(restored.counts) : ''}. You can undo the restore from Settings.</p><div class="sheet-actions"><button class="btn" data-close>OK</button></div>`);
  } else if (S.settings.openTo === 'last' && S.last && !S.settings.lowEnergy) {
    resumeLast(true);
  }
  registerSW();
}
init();
