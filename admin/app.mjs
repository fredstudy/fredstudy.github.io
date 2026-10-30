// Admin dashboard (spec 125), demo mode only. All DOM writes go through el()/svgEl() with
// textContent/setAttribute: data values are never parsed as HTML (security update 28.10).
import { fixedCostForMonth, fixedCostOfRow, ratio, fmtUsd, fmtUsdAxis, axisLabels, failPct, fmtPct, minutesAgoText, fmtDuration, monthOf, KIND, STATUS, PUSH, EVENT, PLAT, label, alertText } from './calc.mjs';
import { demoData } from './demo-data.mjs';
import { supabaseConfig } from './config.mjs';

const SVGNS = 'http://www.w3.org/2000/svg';
const params = new URLSearchParams(location.search);
// Demo as before; on localhost `?live=1` switches to the local server (config.mjs LOCAL) for a manual check. Live in development
// only from http://localhost:8880 (the one dev origin of admin-stats, ADMIN_DEV_ORIGIN=1); 127.0.0.1 stays demo, CORS would refuse it.
const LOCAL_HOST = ['localhost', '127.0.0.1', ''].includes(location.hostname);
const DEMO = params.get('demo') === '1' || (LOCAL_HOST && (location.hostname !== 'localhost' || params.get('live') !== '1')) || location.protocol === 'file:';

/* ---------- DOM helpers ---------- */
function apply(e, attrs) {
  for (const [k, v] of Object.entries(attrs || {})) {
    if (typeof v === 'boolean' && k.startsWith('aria-')) { e.setAttribute(k, String(v)); continue; }
    if (v === null || v === undefined || v === false) continue;
    if (k === 'on') for (const [ev, fn] of Object.entries(v)) e.addEventListener(ev, fn);
    else e.setAttribute(k, v === true ? '' : String(v));
  }
}
function addKids(e, kids) {
  for (const c of kids.flat()) {
    if (c === null || c === undefined || c === false) continue;
    e.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}
export function el(tag, attrs, ...kids) { const e = document.createElement(tag); apply(e, attrs); addKids(e, kids); return e; }
export function svgEl(tag, attrs, ...kids) { const e = document.createElementNS(SVGNS, tag); apply(e, attrs); addKids(e, kids); return e; }
const num = (t, cls = '') => el('span', { class: ('num ' + cls).trim() }, t);

/* ---------- labels: calc.mjs (the real server names; unknown values are shown as they are, as text) ---------- */
const lab = label;
const COLORS = ['--s1', '--s2', '--s3', '--s4'];
const dm = (iso) => { const p = String(iso).split('-'); return +p[2] + '.' + +p[1]; };
const clock = (iso) => { const d = new Date(iso); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };

/* ---------- data layer: the only place that talks to the server ---------- */
// Live mode (spec 125.2, 125.3, 125.21, 125.22): Supabase Auth in the browser (Google, PKCE), the session in sessionStorage only,
// the token only in the Authorization header of the call to admin-stats (never in a URL).
class HttpError extends Error { constructor(status) { super('http ' + status); this.status = status; } }
const CONFIG = DEMO ? null : supabaseConfig(location.hostname);
let client = null;
function sb() {
  if (client || !CONFIG || !window.supabase || typeof window.supabase.createClient !== 'function') return client;
  client = window.supabase.createClient(CONFIG.url, CONFIG.anonKey, {
    auth: { storage: window.sessionStorage, flowType: 'pkce', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true },
  });
  return client;
}
async function currentSession() {
  const c = sb();
  if (!c) return null;
  const { data } = await c.auth.getSession();
  return data && data.session ? data.session : null;
}
async function callAdmin(method, query, body) {
  const s = await currentSession();
  if (!s) throw new HttpError(401);
  const res = await fetch(CONFIG.url + '/functions/v1/admin-stats' + query, {
    method,
    headers: { authorization: 'Bearer ' + s.access_token, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  });
  if (!res.ok) { await res.body?.cancel(); throw new HttpError(res.status); }
  return res.json();
}
async function loadData(section, days) {
  if (DEMO) {
    const d = demoData(section, days, { fewUsers: params.get('state') === 'fewusers' });
    if (section === 'glance') d.generated_at = new Date(Date.now() - 4 * 60000).toISOString();
    return d;
  }
  return callAdmin('GET', '?' + new URLSearchParams({ section, days: String(days) }).toString());
}
/** The one write (125.27): only the contract keys are sent, whatever else the row holds. */
async function saveFixed(row) {
  const until = row.until || null;
  return callAdmin('POST', '', { op: 'upsert', id: row.id ?? null, label: String(row.label ?? ''), amount_usd: Number(row.amount_usd) || 0, every: row.every, since: row.since, until });
}
async function deleteFixed(id) { return callAdmin('POST', '', { op: 'delete', id }); }
async function signIn() {
  const c = sb();
  if (c) await c.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } });
}
async function signOut() {
  const c = sb();
  if (c) await c.auth.signOut();
  state.glance = null; state.tabData = null; state.fixed = []; state.fixedLoaded = false; state.error = new HttpError(401);
  render();
}

/* ---------- charts ---------- */
function axisY(mx, w, h, pad, fmt) {
  const g = svgEl('g'), labels = axisLabels(mx, fmt === fmtUsd ? fmtUsdAxis(mx) : fmt);
  for (let t = 0; t <= 3; t++) {
    const v = (mx * t) / 3, y = h - pad.b - (v / mx) * (h - pad.t - pad.b);
    g.append(svgEl('line', { class: 'gl', x1: pad.l, x2: w - pad.r, y1: y, y2: y }), svgEl('text', { x: pad.l - 6, y: y + 4, 'text-anchor': 'end' }, labels[t]));
  }
  return g;
}
function xLabels(days, X, h) {
  const g = svgEl('g'), n = days.length;
  [...new Set([0, Math.floor((n - 1) / 2), n - 1])].forEach((i) => g.append(svgEl('text', { x: X(i), y: h - 4, 'text-anchor': 'middle' }, dm(days[i]))));
  return g;
}
function keys(series) {
  return el('div', { class: 'keys' }, series.map((s) => el('span', null, el('i', { style: `background:var(${s.c})` }), s.k)));
}
function chartWrap(svg, series) {
  return el('div', null, el('div', { class: 'chart' }, svg), series && series.length > 1 ? keys(series) : null);
}
function stacked(series, days, fmt, label) {
  const w = 600, h = 200, pad = { l: 44, r: 8, t: 10, b: 22 }, n = days.length;
  const tot = days.map((_, i) => series.reduce((a, s) => a + (s.v[i] || 0), 0));
  const mx = Math.max(0.01, Math.max(...tot) * 1.1);
  const step = (w - pad.l - pad.r) / n, bw = Math.max(2, step - 2);
  const svg = svgEl('svg', { viewBox: `0 0 ${w} ${h}`, style: 'direction:ltr', role: 'img', 'aria-label': label }, axisY(mx, w, h, pad, fmt));
  const X = (i) => pad.l + i * step + step / 2;
  for (let i = 0; i < n; i++) {
    let y0 = h - pad.b;
    series.forEach((s) => {
      const bh = ((s.v[i] || 0) / mx) * (h - pad.t - pad.b), y = y0 - bh;
      svg.append(svgEl('rect', { x: pad.l + i * step + 1, y: y + 1, width: bw, height: Math.max(0, bh - 1), fill: `var(${s.c})` }));
      y0 = y;
    });
  }
  svg.append(xLabels(days, X, h));
  for (let i = 0; i < n; i++) {
    const tip = dm(days[i]) + '\n' + series.map((s) => s.k + ': ' + fmt(s.v[i] || 0)).join('\n') + (series.length > 1 ? '\nסה״כ: ' + fmt(tot[i]) : '');
    svg.append(svgEl('rect', { class: 'hit', x: pad.l + i * step, y: pad.t, width: step, height: h - pad.t - pad.b, 'data-tip': tip }));
  }
  return chartWrap(svg, series);
}
function lines(series, days, fmt, label) {
  const w = 600, h = 180, pad = { l: 44, r: 30, t: 10, b: 22 }, n = days.length;
  const mx = Math.max(0.01, Math.max(...series.flatMap((s) => s.v)) * 1.15);
  const step = n > 1 ? (w - pad.l - pad.r) / (n - 1) : 0;
  const X = (i) => pad.l + i * step, Y = (v) => h - pad.b - (v / mx) * (h - pad.t - pad.b);
  const svg = svgEl('svg', { viewBox: `0 0 ${w} ${h}`, style: 'direction:ltr', role: 'img', 'aria-label': label }, axisY(mx, w, h, pad, fmt));
  series.forEach((s) => {
    const d = s.v.map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1)).join(' ');
    svg.append(svgEl('path', { d, fill: 'none', stroke: `var(${s.c})`, 'stroke-width': 2 }),
      svgEl('circle', { cx: X(n - 1), cy: Y(s.v[n - 1]), r: 4, fill: `var(${s.c})`, stroke: 'var(--panel)', 'stroke-width': 2 }));
  });
  svg.append(xLabels(days, X, h));
  for (let i = 0; i < n; i++) {
    svg.append(svgEl('rect', { class: 'hit', x: X(i) - Math.max(step, 4) / 2, y: pad.t, width: Math.max(step, 4), height: h - pad.t - pad.b,
      'data-tip': dm(days[i]) + '\n' + series.map((s) => s.k + ': ' + fmt(s.v[i])).join('\n') }));
  }
  return chartWrap(svg, series);
}
function spark(vals, c) {
  const w = 160, h = 30, mx = Math.max(...vals), mn = Math.min(...vals);
  const pts = vals.map((v, i) => [i * (w / Math.max(1, vals.length - 1)), h - 3 - ((v - mn) / (mx - mn || 1)) * (h - 6)]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const l = pts[pts.length - 1];
  return svgEl('svg', { viewBox: `0 0 ${w} ${h}`, preserveAspectRatio: 'none', 'aria-hidden': 'true', style: 'direction:ltr' },
    svgEl('path', { d: d + ` L${w} ${h} L0 ${h}Z`, fill: `var(${c})`, opacity: '.12' }),
    svgEl('path', { d, fill: 'none', stroke: `var(${c})`, 'stroke-width': 2, 'vector-effect': 'non-scaling-stroke' }),
    svgEl('circle', { cx: l[0], cy: l[1], r: 3, fill: `var(${c})` }));
}
function hbars(rows, fmt) {
  const mx = Math.max(1e-9, ...rows.map((r) => r[1]));
  return el('div', { class: 'hbar' }, rows.map((r) => el('div', { class: 'hrow' },
    el('span', null, r[0]),
    el('div', { class: 'tr' }, el('div', { class: 'fl', style: `width:${((r[1] / mx) * 100).toFixed(1)}%` })),
    el('span', { class: 'v num', 'data-tip': r[0] + ': ' + fmt(r[1]) }, fmt(r[1])))));
}

/* ---------- blocks ---------- */
function card(title, ...body) { return el('div', { class: 'card' }, el('h3', null, title), ...body); }
function table(heads, rows, opts = {}) {
  return el('div', { class: 'tbl-wrap' }, el('table', null,
    el('thead', null, el('tr', null, heads.map((h) => el('th', { class: h.n ? 'n' : null }, h.t)))),
    el('tbody', null, rows.map((r) => el('tr', { class: r.total ? 'total' : null }, r.cells.map((c, i) => {
      const n = heads[i].n;
      return c instanceof Node && c.tagName === 'TD' ? c : el('td', { class: [n ? 'n' : '', r.cls && r.cls[i] ? r.cls[i] : ''].join(' ').trim() || null }, c);
    }))))));
}
function soon(...items) {
  return el('div', { class: 'soon' }, items.map(([what, missing]) => el('div', null, el('b', null, 'בקרוב: '), what, ' ', el('span', { class: 'small' }, '(' + missing + ')'))));
}
function tile(lbl, val, delta, dcls, sub, sp, color) {
  return el('div', { class: 'tile' }, el('div', { class: 'lbl' }, lbl), el('div', { class: 'val num' }, val),
    delta ? el('div', { class: 'delta ' + dcls }, delta) : null, sp ? spark(sp, color) : null, sub ? el('div', { class: 'sub' }, sub) : null);
}
function sinceNote(d, period) {
  if (!d.days || d.days.length >= period) return null;
  return el('p', { class: 'note' }, 'יש נתונים מ־' + dm(d.days[0]) + ' בלבד (' + d.days.length + ' ימים מתוך ' + period + ').');
}
function alertsView(alerts) {
  if (!alerts.length) return null;
  return el('div', { class: 'alerts' }, alerts.map((a) => {
    const [t, thr] = alertText(a);
    return el('div', { class: 'alert ' + (a.kind === 'cost' || a.kind === 'ai_fail' ? 'bad' : 'warn') }, el('span', { class: 'ic' }, '!'),
      el('span', null, el('b', null, t), ' ', el('span', { class: 'small' }, thr + (a.pushed_at ? ' · נשלח פוש ב־' + clock(a.pushed_at) : ''))));
  }));
}

/* ---------- tabs ---------- */
function topKinds(costByKind, days) {
  const entries = Object.entries(costByKind).map(([k, v]) => [k, v, v.reduce((s, x) => s + x, 0)]).sort((a, b) => b[2] - a[2]);
  const top = entries.slice(0, 3).map(([k, v], i) => ({ k: lab(KIND, k), c: COLORS[i], v }));
  const rest = entries.slice(3);
  if (rest.length) top.push({ k: 'אחר', c: COLORS[3], v: days.map((_, i) => rest.reduce((s, e) => s + (e[1][i] || 0), 0)) });
  return top;
}
function fixedEditor(state, rerender) {
  const rows = state.fixed;
  const mth = state.month;
  const inp = (r, field, type) => el('input', { type, value: r[field] ?? '', 'aria-label': field, on: { change: (e) => {
    const v = e.target.value;
    r[field] = type === 'number' ? Math.max(0, Number(v) || 0) : (field === 'label' ? v.slice(0, 60) : v || null);
    rerender();
  } } });
  const sel = (r) => {
    const s = el('select', { 'aria-label': 'every', on: { change: (e) => { r.every = e.target.value; rerender(); } } },
      [['month', 'חודש'], ['year', 'שנה'], ['once', 'פעם אחת']].map(([v, t]) => el('option', { value: v }, t)));
    s.value = r.every;
    return s;
  };
  // Live: each row is saved on its own (POST to admin-stats), then the data is read again from the server.
  const act = (fn) => async () => {
    state.fixedMsg = null;
    try { await fn(); state.fixedLoaded = false; await refresh(); } catch (e) { state.fixedMsg = errorText(e); rerender(); }
  };
  const buttons = (r) => DEMO ? null : el('td', null,
    el('button', { class: 'btn', type: 'button', on: { click: act(() => saveFixed(r)) } }, 'שמירה'), ' ',
    r.id ? el('button', { class: 'btn', type: 'button', on: { click: act(() => deleteFixed(r.id)) } }, 'מחיקה') : null);
  return el('div', { class: 'tbl-wrap' }, el('table', { class: 'fixed' },
    el('thead', null, el('tr', null, ['מה', 'סכום ($)', 'כל כמה זמן', 'מתאריך', 'עד תאריך', 'בחודש הזה', DEMO ? null : ''].filter((h) => h !== null).map((h) => el('th', null, h)))),
    el('tbody', null, rows.map((r) => el('tr', null, el('td', null, inp(r, 'label', 'text')), el('td', null, inp(r, 'amount_usd', 'number')),
      el('td', null, sel(r)), el('td', null, inp(r, 'since', 'date')), el('td', null, inp(r, 'until', 'date')),
      el('td', { class: 'n' }, fmtUsd(fixedCostOfRow(r, mth))), buttons(r))))));
}
function errorText(e) {
  const s = e && e.status;
  if (s === 400) return 'השרת דחה את השורה: לבדוק שם (עד 60 תווים, בלי קישור), סכום (0 עד 100,000) ותאריכים.';
  if (s === 401) return 'ההתחברות פגה. צריך להתחבר שוב.';
  if (s === 413) return 'הבקשה גדולה מדי.';
  return 'השמירה נכשלה' + (s ? ' (קוד ' + s + ')' : '') + '.';
}
function moneyTab(d, state, rerender) {
  const dayLabels = d.days;
  const mths = d.months.map((m) => {
    const fx = fixedCostForMonth(state.fixed, m.month);
    return { cells: [m.month, fmtUsd(m.ai_usd), fmtUsd(fx), fmtUsd(m.ai_usd + fx)], total: m.month === state.month };
  });
  const splitBody = d.split
    ? [el('p', { class: 'small' }, 'איך העלות מתחלקת בין המשתמשים (בלי שמות):'), hbars([['10% הכבדים', d.split.top10], ['10%–50%', d.split.mid40], ['50% הקלים', d.split.low50]], (v) => v + '%')]
    : [el('p', { class: 'note' }, 'מעט מדי משתמשים כדי להציג חלוקה בין כבדים לקלים.')];
  return [
    sinceNote(d, state.period),
    el('div', { class: 'grid2' },
      card('עלות AI לפי יום ויכולת', stacked(topKinds(d.cost_by_kind, dayLabels), dayLabels, fmtUsd, 'עלות לפי יום ולפי יכולת')),
      card('לפי מודל', table([{ t: 'מודל' }, { t: 'משמש ל' }, { t: 'קריאות', n: 1 }, { t: 'עלות', n: 1 }, { t: 'לקריאה', n: 1 }, { t: 'נכשל', n: 1 }],
        d.models.map((m) => ({ cells: [m.model, m.kinds.map((k) => lab(KIND, k)).join(', '), m.calls.toLocaleString('en-US'), fmtUsd(m.cost_usd),
          '$' + (m.calls ? m.cost_usd / m.calls : 0).toFixed(4), fmtPct(m.fail_pct)], cls: { 5: m.fail_pct > 2 ? 'neg' : '' } }))))),
    el('div', { class: 'grid2' },
      card('עלות למשתמש שהשתמש ב־AI', lines([{ k: 'עלות למשתמש', c: '--s2', v: d.cost_per_ai_user }], dayLabels, fmtUsd, 'עלות למשתמש'),
        lines([{ k: 'משתמשי AI ביום', c: '--s1', v: d.ai_users }], dayLabels, (v) => String(Math.round(v)), 'משתמשי AI'), ...splitBody),
      card('הוצאות לפי חודש (AI + קבוע)', table([{ t: 'חודש' }, { t: 'AI', n: 1 }, { t: 'קבוע', n: 1 }, { t: 'סה״כ', n: 1 }], mths),
        el('p', { class: 'small' }, 'עלות קבועה היא שורה חודשית אחת ולא מחולקת למשתמש.'),
        soon(['הכנסות, ARPU ו־LTV', 'שלב ג׳: אחרי מנויים']))),
    card('עלויות קבועות', fixedEditor(state, rerender),
      DEMO ? null : el('div', null, el('button', { class: 'btn', type: 'button', on: { click: () => {
        state.fixed.push({ id: null, label: '', amount_usd: 0, every: 'month', since: new Date().toISOString().slice(0, 10), until: null });
        rerender();
      } } }, 'הוספת שורה')),
      state.fixedMsg ? el('p', { class: 'note', role: 'alert' }, state.fixedMsg) : null,
      el('p', { class: 'note' }, DEMO ? 'עריכה מקומית בלבד, לא נשמרת (נתונים לדוגמה).' : 'כל שורה נשמרת בשרת בלחיצה על ״שמירה״.')),
  ];
}
function usersTab(d, state) {
  const dev = d.devices.map((x) => ({ cells: [lab(PLAT, x.platform), x.app_version, x.n] }));
  return [
    sinceNote(d, state.period),
    el('div', { class: 'grid2' },
      card('הרשמות ליום', stacked([{ k: 'הרשמות', c: '--s3', v: d.signups }], d.days, (v) => String(Math.round(v)), 'הרשמות')),
      card('במה משתמשים (קריאות AI)', hbars(Object.entries(d.use_by_kind).sort((a, b) => b[1] - a[1]).map(([k, v]) => [lab(KIND, k), v]), (v) => v + ' קריאות'))),
    el('div', { class: 'grid2' },
      card('מכשירים וגרסאות', table([{ t: 'מכשיר' }, { t: 'גרסה', n: 1 }, { t: 'מכשירים', n: 1 }], dev)),
      card('עוד לא קיים', soon(['פעילים ביום ובשבוע, דביקות ושימור', 'שלב ב׳: אות פעילות מהטלפון']))),
  ];
}
function healthTab(d, state) {
  const failRows = Object.entries(d.ai_fail_by_status).map(([s, n]) => ({ cells: [lab(STATUS, s), n] }));
  const push = Object.entries(d.push_by_category).map(([c, v]) => ({ cells: [lab(PUSH, c), v.sent, v.undelivered, fmtPct(failPct(v.undelivered, v.sent))] }));
  return [
    sinceNote(d, state.period),
    el('div', { class: 'grid2' },
      card('כישלונות קריאות AI', table([{ t: 'סוג' }, { t: 'מספר', n: 1 }], failRows), lines([{ k: 'אחוז כישלון', c: '--s2', v: d.ai_fail_pct }], d.days, (v) => v.toFixed(1) + '%', 'אחוז כישלון ליום')),
      card('תור העבודות', table([{ t: 'סוג' }, { t: 'ממתינות', n: 1 }, { t: 'רצות', n: 1 }, { t: 'הסתיימו', n: 1 }, { t: 'נכשלו', n: 1 }, { t: 'המתנה (בערך)', n: 1 }, { t: 'ריצה (בערך)', n: 1 }],
        d.queue.map((q) => ({ cells: [lab(KIND, q.kind), q.queued, q.working, q.done, q.failed, '~' + fmtDuration(q.wait_s_avg), '~' + fmtDuration(q.run_s_avg)], cls: { 4: q.failed ? 'neg' : '' } }))),
        el('p', { class: 'small' }, 'אין זמן התחלה בשרת, ולכן זמני ההמתנה והריצה הם קירוב.'))),
    el('div', { class: 'grid2' },
      card('התראות שנשלחו', table([{ t: 'סוג' }, { t: 'נשלחו', n: 1 }, { t: 'לא נמסרו', n: 1 }, { t: '%', n: 1 }], push)),
      card('שגיאות שרת', hbars(Object.entries(d.server_events).map(([k, v]) => [lab(EVENT, k), v]), String))),
    card('עוד לא קיים', soon(['כשלי רענון והורדה', 'שלב ב׳: מונה מהטלפון'], ['קריסות', 'שלב ג׳: Sentry'])),
  ];
}
function feedbackTab(d, state) {
  return [
    sinceNote(d, state.period),
    el('div', { class: 'tiles' }, tile('בקשות פתוחות', String(d.requests_open)), tile('דיווחי קהילה', String(d.community_reports))),
    el('div', { class: 'grid2' },
      card('דיווחי AI לפי סוג ומודל', table([{ t: 'סוג' }, { t: 'מודל' }, { t: 'מספר', n: 1 }], d.ai_reports.map((r) => ({ cells: [lab(KIND, r.kind), r.model, r.n] }))),
        el('p', { class: 'small' }, 'רק ספירות. התוכן עצמו לא מגיע ללוח (פרטיות).')),
      card('דיווחים לפי יום', stacked([{ k: 'דיווחים', c: '--s1', v: d.reports_per_day }], d.days, (v) => String(Math.round(v)), 'דיווחים'))),
  ];
}

/* ---------- states ---------- */
export function renderNotAdmin(idPrefix8) {
  return el('div', { class: 'center' }, el('h2', null, 'החשבון הזה אינו מנהל'),
    el('p', { class: 'small' }, 'מזהה החשבון שהתחבר בדפדפן מתחיל ב־'), num(String(idPrefix8).slice(0, 8)),
    el('p', { class: 'small' }, 'כדי לתקן: להגדיר את admin_user_id לפי המזהה, או להתחבר בספק הנכון.'));
}
function renderNotConnected() {
  return el('div', { class: 'center' }, el('h2', null, 'הלוח עוד לא מחובר'), el('p', { class: 'small' }, 'הוא יהיה זמין אחרי אישור האבטחה והחיבור לשרת.'));
}
function renderSignIn() {
  return el('div', { class: 'center' }, el('h2', null, 'לומו · לוח ניהול'), el('p', { class: 'small' }, 'הכניסה עם אותו חשבון Google של האפליקציה.'),
    el('button', { class: 'btn', type: 'button', on: { click: () => signIn() } }, 'התחבר עם Google'));
}
function renderLoadError(status) {
  return el('div', { class: 'center' }, el('h2', null, 'לא הצלחתי לטעון את הנתונים'), el('p', { class: 'small' }, status ? 'קוד ' + status : 'אין חיבור לשרת'),
    el('button', { class: 'btn', type: 'button', on: { click: () => refresh() } }, 'לנסות שוב'), signOutButton());
}
function signOutButton() { return DEMO ? null : el('button', { class: 'btn', type: 'button', on: { click: () => signOut() } }, 'התנתק'); }

/* ---------- main ---------- */
const TABS = [['money', 'כסף'], ['users', 'משתמשים'], ['health', 'בריאות'], ['feedback', 'משוב']];
const state = { tab: 'money', period: 30, glance: null, fixed: [], month: '2026-10', tabData: null, error: null };
const root = document.getElementById('root');

async function refresh() {
  try {
    state.glance = await loadData('glance', 7);
    state.month = monthOf(state.glance.generated_at);
    state.tabData = await loadData(state.tab, state.period);
    if (state.tab === 'money' && !state.fixedLoaded) { state.fixed = state.tabData.fixed_costs; state.fixedLoaded = true; }
    else if (!state.fixedLoaded) { state.fixed = (await loadData('money', 7)).fixed_costs; state.fixedLoaded = true; }
    state.error = null;
    render(); // inside the try: a bad value in the data shows the error screen, not an empty page
  } catch (e) { state.error = e; render(); }
}
async function renderLiveProblem() {
  const s = state.error && state.error.status;
  if (!CONFIG || !sb()) return renderNotConnected(); // config not filled in, or the SDK did not load (SRI mismatch, CDN down)
  if (s === 401) return renderSignIn();
  if (s === 404) { // not the admin (125.3); the id comes from the browser's own sign-in, never from the server (spec 125 §11)
    const ses = await currentSession();
    return ses ? el('div', null, renderNotAdmin(String(ses.user.id).slice(0, 8)), el('div', { class: 'center' }, signOutButton())) : renderSignIn();
  }
  return renderLoadError(s);
}
function render() {
  if (DEMO && state.error) { root.replaceChildren(renderLoadError(state.error.status)); return; }
  if (!DEMO && (state.error || !state.glance)) { renderLiveProblem().then((v) => root.replaceChildren(v)); return; }
  if (DEMO && params.get('state') === 'notadmin') { root.replaceChildren(renderNotAdmin('a1b2c3d4e5f6')); return; }
  const g = state.glance;
  const fixedNow = fixedCostForMonth(state.fixed, state.month);
  const ratioV = ratio(g.cost_today_usd, g.cost_avg7_usd);
  const f = g.fails_24h;
  const body = state.tabData && ({ money: () => moneyTab(state.tabData, state, render), users: () => usersTab(state.tabData, state), health: () => healthTab(state.tabData, state), feedback: () => feedbackTab(state.tabData, state) })[state.tab]();
  root.replaceChildren(...[
    el('div', { class: 'dhead' }, el('span', { class: 't' }, 'לומו · לוח ניהול'),
      el('span', { class: 'side' }, DEMO ? el('span', { class: 'badge' }, 'נתונים לדוגמה') : null, minutesAgoText(g.generated_at),
        el('button', { class: 'btn', type: 'button', on: { click: () => refresh() } }, 'רענון'), signOutButton())),
    alertsView(g.alerts),
    el('div', { class: 'tiles' },
      tile('עלות AI היום', fmtUsd(g.cost_today_usd), ratioV === null ? null : 'פי ' + ratioV.toFixed(1) + ' מהממוצע השבועי', ratioV >= 2 ? 'up-bad' : 'flat', 'ממוצע 7 ימים: ' + (g.cost_avg7_usd === null ? '—' : fmtUsd(g.cost_avg7_usd))),
      tile('הוצאות החודש', fmtUsd(g.spend_month.ai_usd + fixedNow), null, '', 'AI ' + fmtUsd(g.spend_month.ai_usd) + ' + קבוע ' + fmtUsd(fixedNow)),
      tile('השתמשו ב־AI היום', String(g.ai_users_today), null, '', 'פעילים: בקרוב, שלב ב׳'),
      tile('כישלונות 24 שעות', f.ai_pct + '%', null, '', `AI ${f.ai_calls} קריאות · תור ${f.queue_failed} · התראות ${f.push_undelivered}`)),
    el('div', { class: 'tabs', role: 'tablist' }, TABS.map(([k, t]) => el('button', { role: 'tab', type: 'button', 'aria-selected': k === state.tab, on: { click: () => { state.tab = k; refresh(); } } }, t))),
    el('div', { class: 'filters' }, 'תקופה:', [7, 30, 90].map((p) => el('button', { class: 'pill', type: 'button', 'aria-pressed': p === state.period, on: { click: () => { state.period = p; refresh(); } } }, p + ' ימים'))),
    ...(body || []),
  ].filter(Boolean));
}

/* tooltip */
const tip = document.getElementById('tip');
function showTip(e) {
  const t = e.target.closest ? e.target.closest('[data-tip]') : null;
  if (!t) { tip.hidden = true; return; }
  tip.textContent = t.getAttribute('data-tip');
  tip.hidden = false;
  tip.style.left = Math.min(innerWidth - tip.offsetWidth - 8, Math.max(8, e.clientX + 12)) + 'px';
  tip.style.top = Math.max(8, e.clientY - tip.offsetHeight - 12) + 'px';
}
document.addEventListener('pointermove', showTip);
document.addEventListener('pointerdown', showTip);

// Live: refresh() first reads the session (getSession waits for the PKCE code exchange after the Google redirect).
// A CSP in <meta> cannot set frame-ancestors, so a page that frames this one gets nothing drawn (security, 28.10).
if (window.top !== window.self) { /* framed: draw nothing */ } else if (DEMO || CONFIG) refresh(); else render();
