// Pure display calculations for the admin dashboard (spec 125). No DOM, no network.

const MONTH_RE = /^(\d{4})-(\d{2})$/;

/** 'YYYY-MM' of an ISO date/time string. */
export function monthOf(iso) {
  return String(iso).slice(0, 7);
}

/** Month cost of one fixed-cost row for 'YYYY-MM' (0 when not active). */
export function fixedCostOfRow(row, month) {
  if (!MONTH_RE.test(month)) return 0;
  const amount = Number(row && row.amount_usd);
  if (!Number.isFinite(amount) || !row.since) return 0;
  const sinceM = monthOf(row.since);
  const untilM = row.until ? monthOf(row.until) : null;
  if (sinceM > month) return 0;
  if (row.every === 'once') return sinceM === month ? amount : 0;
  if (untilM !== null && untilM < month) return 0;
  if (row.every === 'month') return amount;
  if (row.every === 'year') return amount / 12;
  return 0;
}

/** Fixed cost for a month: sum over rows. */
export function fixedCostForMonth(rows, month) {
  return (rows || []).reduce((s, r) => s + fixedCostOfRow(r, month), 0);
}

/** Mean of up to 7 values before index `idx` (default: last item). null when no data. */
export function avgPrev7(series, idx = (series ? series.length - 1 : 0)) {
  if (!Array.isArray(series)) return null;
  const from = Math.max(0, idx - 7);
  const part = series.slice(from, Math.max(0, idx)).filter((v) => Number.isFinite(v));
  if (!part.length) return null;
  return part.reduce((s, v) => s + v, 0) / part.length;
}

/** today / average; null when the average is missing or zero. */
export function ratio(today, avg) {
  if (!Number.isFinite(today) || !Number.isFinite(avg) || avg === 0) return null;
  return today / avg;
}

/** $0.42, $12.30, $1,234 */
export function fmtUsd(v) {
  if (!Number.isFinite(v)) return '—';
  const sign = v < 0 ? '-' : '';
  const a = Math.abs(v);
  if (a >= 1000) return sign + '$' + Math.round(a).toLocaleString('en-US');
  return sign + '$' + a.toFixed(2);
}

/** A money formatter for a y axis whose top is mx: tiny tops get more decimals ($0.003, not $0.00 twice). */
export function fmtUsdAxis(mx) {
  if (!(mx < 0.1)) return fmtUsd;
  const d = mx >= 0.01 ? 3 : 4;
  return (v) => (Number.isFinite(v) ? '$' + v.toFixed(d) : '—');
}

/** The 4 y-axis labels (0, 1/3, 2/3, top); a label equal to the one below it is left empty (Jonathan 30.10). */
export function axisLabels(mx, fmt) {
  const out = [];
  let prev = null;
  for (let t = 0; t <= 3; t++) {
    const s = fmt((mx * t) / 3);
    out.push(s === prev ? '' : s);
    prev = s;
  }
  return out;
}

/** failed/total as a percent number; null when total is 0. */
export function failPct(failed, total) {
  if (!Number.isFinite(failed) || !Number.isFinite(total) || total <= 0) return null;
  return (failed / total) * 100;
}

/** 3.1% (null -> —) */
export function fmtPct(p) {
  if (p === null || p === undefined || !Number.isFinite(p)) return '—';
  return (p >= 10 ? p.toFixed(0) : p.toFixed(1)) + '%';
}

/** Hebrew "updated n minutes ago". */
export function minutesAgoText(iso, nowMs = Date.now()) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 'עודכן: לא ידוע';
  const min = Math.max(0, Math.floor((nowMs - t) / 60000));
  if (min < 1) return 'עודכן עכשיו';
  if (min === 1) return 'עודכן לפני דקה';
  if (min < 60) return `עודכן לפני ${min} דקות`;
  const h = Math.floor(min / 60);
  if (h === 1) return 'עודכן לפני שעה';
  if (h < 24) return `עודכן לפני ${h} שעות`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'עודכן לפני יום' : `עודכן לפני ${d} ימים`;
}

/** seconds -> m:ss (null -> —) */
export function fmtDuration(s) {
  if (!Number.isFinite(s) || s < 0) return '—';
  const r = Math.round(s);
  return Math.floor(r / 60) + ':' + String(r % 60).padStart(2, '0');
}

/* ---------- labels: the real names of the server (unknown names are shown as they are) ---------- */
// KIND serves three closed lists at once: ai_usage.kind (the ai_kind table), job.kind (+ 'video' that admin_health adds for
// animation_job) and ai_report_count.kind. PUSH = push_outbox.category. EVENT = the server_event kinds worth a Hebrew name.
export const KIND = {
  // ai_usage.kind
  organize: 'סידור הקורס', games: 'משחקים', summarize: 'סיכומים', answers_check: 'בדיקת תשובות', study_chat: 'צ׳אט לימוד',
  fred_understand: 'פרד (הבנה)', fred_memory: 'פרד (זיכרון)', describe_image: 'תיאור תמונה', image_moderate: 'בדיקת תמונות',
  group_reader: 'קריאת קבוצות', podcast: 'פודקאסט', practice_prep: 'הכנת תרגול', animation: 'וידאו (AI)',
  // job.kind (+ video)
  summary: 'סיכום (עבודה)', selftest: 'מבחן עצמי', avatar_moderate: 'בדיקת תמונת פרופיל', pdf_unlock: 'פתיחת PDF נעול', video: 'וידאו',
  // ai_report_count.kind
  summary_error: 'טעות בסיכום', disputed_verdict: 'ערעור על בדיקת תשובה',
};
export const STATUS = { model_failed: 'המודל נכשל', timeout: 'חריגת זמן', model_busy: 'המודל עמוס', invalid_answer: 'תשובה לא תקינה' };
export const PUSH = { job: 'עבודה מוכנה', group: 'קבוצות', reminder: 'תזכורות', weekly: 'סיכום שבועי', admin: 'התראות ללוח' };
export const EVENT = {
  ai_user_day_cap: 'משתמש הגיע לתקרת AI יומית', ai_user_over_day: 'משתמש מעל השימוש היומי', ai_global_day_high: 'שימוש AI כללי גבוה',
  anthropic_billing_block: 'חסימת חיוב ב־Anthropic', rate_limited: 'הגבלת קצב', push_row_failed: 'התראה שנכשלה',
  push_weekly_failed: 'סיכום שבועי שנכשל', group_reader_failing: 'קריאת קבוצות נכשלת', pdf_unlock_failed: 'פתיחת PDF נכשלה',
  pdf_unlock_global_cap: 'תקרת פתיחת PDF', animation_segments_invalid: 'קטעי וידאו פגומים', animation_worker_bad_key: 'מפתח שגוי בעובד הווידאו',
  podcast_extension_paused: 'הארכת פודקאסט הושהתה', blob_deleted: 'קובץ נמחק', sha1_collision: 'התנגשות sha1',
};
export const PLAT = { ios: 'iPhone', android: 'Android' };
/** The closed list of refresh failure classes (spec 125.12). */
export const FAIL_CLASS = { auth: 'התחברות', network: 'רשת', moodle_blocked: 'חסימה של האתר', parse: 'קריאה', other: 'אחר' };

/** In-app feedback (spec 138): the closed lists of the server (app_feedback.kind and .tags). */
export const FB_KIND = { practice: 'תרגול', podcast: 'פודקאסט', video: 'וידאו', fred: 'פרד', profile: 'פרופיל' };
export const FB_TAG = {
  unclear: 'לא היה ברור', off_material: 'לא מהחומר', slow: 'איטי', other: 'אחר', too_long: 'ארוך מדי',
  voice: 'הקול', visuals: 'החזותי', wrong: 'שגוי', bug: 'באג', idea: 'רעיון',
};
/** Response rate of the feedback sheet in percent (sent / shown). null while nothing was counted as shown (the switch of the phone counters is off). */
export function feedbackRate(prompted, shown) {
  if (!Number.isFinite(prompted) || !Number.isFinite(shown) || shown <= 0) return null;
  return (prompted / shown) * 100;
}
/** The one line under the feedback title: how often the sheet pops up, from config (gap_days, kind_days, quiet_days). */
export function feedbackConfigLine(c) {
  if (!c || c.enabled !== true) return 'החלון כבוי כרגע, ולכן לא קופץ לאף אחד.';
  const n = (v) => (Number.isFinite(v) ? String(v) : '?');
  return 'החלון קופץ לכל היותר פעם ב־' + n(c.gap_days) + ' ימים, אותו סוג רק אחרי ' + n(c.kind_days) + ' ימים, ואחרי שלוש סגירות ברצף הוא שותק ' + n(c.quiet_days) + ' ימים.';
}

/** Stickiness (spec 125.11): percent of the 30-day actives who came on the last day that has both numbers. null -> no such day. */
export function stickiness(active) {
  const dau = (active && active.dau) || [];
  const mau = (active && active.mau) || [];
  for (let i = Math.min(dau.length, mau.length) - 1; i >= 0; i--) {
    if (dau[i] > 0 && mau[i] > 0) return (dau[i] / mau[i]) * 100;
  }
  return null;
}
/** True when one of the arrays holds a count above zero (the phone counters of stage B: all zeros until the switch is on). */
export function anyCount(...arrays) {
  return arrays.some((a) => Array.isArray(a) && a.some((v) => v > 0));
}

/** The Hebrew label of a server name, or the name itself when unknown (shown as text, never parsed). */
export function label(map, k) {
  return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : String(k);
}

/** [text, threshold note] of one glance alert (spec 125.16, 125.28). value may be null (cost with a zero average). */
export function alertText(a) {
  const v = a && Number.isFinite(a.value) ? a.value : null;
  switch (a && a.kind) {
    case 'cost':
      return [v === null ? 'עלות AI היום גבוהה מהרגיל.' : 'עלות AI היום פי ' + v.toFixed(1) + ' מהממוצע השבועי.', 'הסף: פי ' + a.threshold];
    case 'ai_fail':
      return ['כישלון קריאות AI: ' + (v ?? '—') + '%.', 'הסף: ' + a.threshold + '%'];
    case 'queue':
      return [(v === 1 ? 'עבודה אחת ממתינה' : (v ?? '—') + ' עבודות ממתינות') + ' בתור יותר מ־' + a.threshold + ' דקות.', ''];
    case 'push_fail':
      return ['התראות שלא נמסרו: ' + (v ?? '—') + '%.', 'הסף: ' + a.threshold + '%'];
    case 'rollup_stale':
      return ['סיכום הלילה לא רץ.', ''];
    case 'ai_global': // 125.28
      return ['עלות AI של כל המשתמשים ב־24 שעות: ' + (v === null ? '—' : '$' + v.toFixed(2)) + '.',
        Number.isFinite(a.threshold) ? 'סף ההתראה: $' + a.threshold : ''];
    case 'pdf_global': // 125.28
      return ['פתיחות PDF ב־24 שעות: ' + (v ?? '—') + '.', Number.isFinite(a.threshold) ? 'סף ההתראה: ' + a.threshold : ''];
    case 'video_fail': // 117.27 §1: value = the number of failure events today
      return ['סרטונים: ' + (v === null ? '' : v + ' ') + 'כשלים היום. פרטים בלוח.', ''];
    case 'podcast_fail': // 140 §5.6: value = the number of podcast_job_failed events today
      return ['פודקאסטים: ' + (v === null ? '' : v + ' ') + 'כשלים היום. פרטים בלוח.', ''];
    case 'pdf_notice_due': // spec draft-pdf-server-read §8: value = accounts whose PDF files are deleted in about two months, the student notice not built
      return ['יש ' + (v === null ? '' : v + ' ') + 'חשבונות שקבצי ה־PDF שלהם יימחקו בעוד חודשיים, וההודעה לסטודנט לפני המחיקה עוד לא בנויה. פרטים בלוח.', ''];
    case 'job_input_old': // 128a §4.4: value = rows of text kept past the hour
      return ['טקסט של ' + (v === null ? '' : v + ' ') + 'עבודות נשאר בשרת מעבר לשעה. פרטים בלוח.', ''];
    case 'topic_map_fail': // 076 §16.12: value = failed topic_map jobs and phone notes today
      return ['מפת נושאים: ' + (v === null ? '' : v + ' ') + 'כשלים היום. פרטים בלוח.', ''];
    case 'anthropic_block': // 076 §16.12: value = billing blocks today
      return ['Anthropic: נגמר הקרדיט. המפות נשמרות בלי שיבוץ. פרטים בלוח.', ''];
    case 'ai_day_usd': // cost alert 490000: value = dollars of everybody today, threshold = admin_ai_day_alert_micro in dollars
      return ['עלות AI של כל המשתמשים היום: ' + (v === null ? '—' : '$' + v.toFixed(2)) + '.',
        Number.isFinite(a.threshold) ? 'סף ההתראה: $' + a.threshold : ''];
    case 'ai_user_day_usd': // cost alert 490000: value = accounts over the line today (a count, never who)
      return [(v === 1 ? 'חשבון אחד הוציא' : (v ?? '—') + ' חשבונות הוציאו') + ' היום על AI מעל סף ההתראה.',
        Number.isFinite(a.threshold) ? 'סף ההתראה: $' + a.threshold + ' לחשבון' : ''];
    case 'repeat_check': // cost alert 490000: value = failed repeat checks of the summarize and describe-image doors in the last hour
      return ['בדיקת הבקשות החוזרות (סיכומים ותיאור תמונות) נכשלה ' + (v === null ? '' : v + ' ') + 'פעמים בשעה האחרונה.',
        Number.isFinite(a.threshold) ? 'הסף: ' + a.threshold : ''];
    default:
      return [String(a && a.kind), ''];
  }
}
