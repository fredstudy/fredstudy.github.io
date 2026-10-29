// Deterministic sample data in the shape of the admin-stats answers (spec 125 §4.3). Fake numbers only.
import { avgPrev7 } from './calc.mjs';

// The real server names (ai_usage.kind, job.kind, push_outbox.category, server_event.kind, ai_report_count.kind): see calc.mjs labels.
const KINDS = ['summarize', 'games', 'study_chat', 'answers_check', 'podcast', 'animation', 'organize'];
const BASE = { summarize: 1.6, games: 0.7, study_chat: 1.1, answers_check: 0.3, podcast: 0.8, animation: 0.4, organize: 0.2 };
const AVAILABLE = 62; // 90-day view is shorter than the period on purpose
const END = Date.UTC(2026, 9, 28);

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const r2 = (v) => Math.round(v * 100) / 100;

function build() {
  const rand = rng(125);
  const days = [];
  for (let i = AVAILABLE - 1; i >= 0; i--) days.push(new Date(END - i * 86400000).toISOString().slice(0, 10));
  const cost = {};
  for (const k of KINDS) {
    cost[k] = days.map((_, i) => r2(BASE[k] * (0.7 + rand() * 0.6) * (1 + i * 0.006)));
  }
  cost.summarize[AVAILABLE - 1] = r2(cost.summarize[AVAILABLE - 1] * 3.2); // today's spike
  const aiUsers = days.map((_, i) => Math.round(18 + i * 0.25 + rand() * 8));
  const signups = days.map(() => Math.round(1 + rand() * 7));
  const failPctSeries = days.map(() => r2(1 + rand() * 4));
  const reports = days.map(() => Math.round(rand() * 3));
  return { days, cost, aiUsers, signups, failPctSeries, reports };
}
const B = build();
const last = (a, n) => a.slice(-Math.min(n, a.length));
const total = (i) => KINDS.reduce((s, k) => s + B.cost[k][i], 0);
const totals = B.days.map((_, i) => r2(total(i)));

export const DEMO_FIXED_COSTS = [
  { id: 1, label: '(לדוגמה) Supabase', amount_usd: 25, every: 'month', since: '2026-08-01', until: null },
  { id: 2, label: '(לדוגמה) Apple Developer', amount_usd: 99, every: 'year', since: '2026-09-01', until: null },
  { id: 3, label: '(לדוגמה) Google Play', amount_usd: 25, every: 'once', since: '2026-09-15', until: null },
  { id: 4, label: '(לדוגמה) Expo EAS', amount_usd: 19, every: 'month', since: '2026-09-01', until: null },
  { id: 5, label: '(לדוגמה) דומיין', amount_usd: 12, every: 'year', since: '2026-08-01', until: null },
];

export function demoNow() {
  return new Date(END + 14 * 3600000 + 5 * 60000).toISOString(); // 28.10 14:05 UTC
}

/** opts.fewUsers -> split null. section in glance|money|users|health|feedback. */
export function demoData(section, days, opts = {}) {
  const n = Math.min(days, AVAILABLE);
  const dayList = last(B.days, n);
  const idx = B.days.length - 1;
  if (section === 'glance') {
    const monthAi = last(totals, 28).reduce((s, v) => s + v, 0);
    return {
      generated_at: new Date(Date.parse(demoNow()) - 4 * 60000).toISOString(),
      cost_today_usd: totals[idx],
      cost_avg7_usd: avgPrev7(totals, idx),
      spend_month: { ai_usd: r2(monthAi), fixed_usd: 0 },
      ai_users_today: B.aiUsers[idx],
      fails_24h: { ai_pct: 6, ai_calls: 214, queue_failed: 1, push_undelivered: 1 },
      alerts: [
        { kind: 'cost', value: r2(totals[idx] / avgPrev7(totals, idx)), threshold: 2, pushed_at: new Date(END + 14 * 3600000 - 3 * 60000).toISOString() },
        { kind: 'queue', value: 41, threshold: 15, pushed_at: null },
      ],
      data_since: B.days[0],
    };
  }
  if (section === 'money') {
    const costByKind = {};
    for (const k of KINDS) costByKind[k] = last(B.cost[k], n);
    const per = last(totals, n).map((c, i) => r2(c / Math.max(1, last(B.aiUsers, n)[i])));
    const sc = n / 30;
    return {
      days: dayList,
      cost_by_kind: costByKind,
      models: [
        { model: 'gemini-flash', kinds: ['summarize', 'organize'], calls: Math.round(1840 * sc), cost_usd: r2(21.4 * sc), fail_pct: 1.2 },
        { model: 'claude-haiku', kinds: ['study_chat', 'answers_check'], calls: Math.round(960 * sc), cost_usd: r2(14.8 * sc), fail_pct: 0.6 },
        { model: 'claude-opus', kinds: ['summarize'], calls: Math.round(42 * sc), cost_usd: r2(9.1 * sc), fail_pct: 0 },
        { model: 'gpt-mini', kinds: ['games'], calls: Math.round(610 * sc), cost_usd: r2(5.2 * sc), fail_pct: 2.8 },
        { model: 'tts', kinds: ['podcast', 'animation'], calls: Math.round(58 * sc), cost_usd: r2(11.7 * sc), fail_pct: 3.4 },
      ],
      cost_per_ai_user: per,
      ai_users: last(B.aiUsers, n),
      split: opts.fewUsers ? null : { top10: 46, mid40: 38, low50: 16 }, // percent of the split cost (admin_money: sum about 100)
      months: [{ month: '2026-09', ai_usd: 44 }, { month: '2026-10', ai_usd: r2(last(totals, 28).reduce((s, v) => s + v, 0)) }],
      fixed_costs: DEMO_FIXED_COSTS.map((r) => ({ ...r })),
    };
  }
  if (section === 'users') {
    return {
      days: dayList,
      signups: last(B.signups, n),
      use_by_kind: { study_chat: 812, summarize: 640, games: 512, answers_check: 230, podcast: 96, animation: 31 },
      devices: [
        { platform: 'ios', app_version: '1.0.6', n: 48 },
        { platform: 'ios', app_version: '1.0.5', n: 12 },
        { platform: 'android', app_version: '1.0.6', n: 21 },
        { platform: 'android', app_version: '1.0.4', n: 4 },
      ],
    };
  }
  if (section === 'health') {
    return {
      days: dayList,
      ai_fail_by_status: { model_failed: 9, timeout: 5, model_busy: 3, invalid_answer: 2 },
      ai_fail_pct: last(B.failPctSeries, n),
      queue: [
        { kind: 'podcast', queued: 2, working: 1, done: 7, failed: 1, wait_s_avg: 2460, run_s_avg: 250 },
        { kind: 'summary', queued: 1, working: 0, done: 38, failed: 0, wait_s_avg: 40, run_s_avg: 52 },
        { kind: 'practice_prep', queued: 0, working: 0, done: 22, failed: 0, wait_s_avg: 12, run_s_avg: 31 },
        { kind: 'video', queued: 0, working: 0, done: 2, failed: 0, wait_s_avg: 90, run_s_avg: 400 },
      ],
      push_by_category: {
        reminder: { sent: 412, undelivered: 4 },
        job: { sent: 96, undelivered: 2 },
        weekly: { sent: 88, undelivered: 1 },
        group: { sent: 61, undelivered: 2 },
      },
      server_events: { rate_limited: 12, push_row_failed: 9, pdf_unlock_failed: 6 },
    };
  }
  if (section === 'feedback') {
    return {
      days: dayList,
      ai_reports: [
        { kind: 'summary_error', model: 'gemini-flash', n: 5 },
        { kind: 'disputed_verdict', model: 'claude-haiku', n: 3 },
        { kind: 'summary_error', model: 'gpt-mini', n: 2 },
      ],
      reports_per_day: last(B.reports, n),
      requests_open: 4,
      community_reports: 2,
    };
  }
  throw new Error('unknown section');
}
