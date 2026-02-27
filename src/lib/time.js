export function parseHHMM(s) {
  if (!s || typeof s !== 'string') return null;
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(s.trim());
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

export function normalizeRange(startHHMM, endHHMM) {
  const s = parseHHMM(startHHMM);
  const e0 = parseHHMM(endHHMM);
  if (s == null || e0 == null) return null;
  let e = e0;
  if (e < s) e += 24 * 60; // cross-midnight
  return [s, e];
}

export function duration(range) {
  return range ? Math.max(0, range[1] - range[0]) : 0;
}

export function nowISO() {
  return new Date().toISOString();
}

export function toLocalDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Normalize date string into YYYY-MM-DD when possible
export function normalizeDateStr(input) {
  const s = String(input ?? '').trim();
  if (!s) return '';

  // ISO already
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  // ISO but missing leading zeros
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) {
    const mm = String(m[2]).padStart(2, '0');
    const dd = String(m[3]).padStart(2, '0');
    return `${m[1]}-${mm}-${dd}`;
  }

  // dd/mm/yyyy (common in Thailand)
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) {
    const dd = String(m[1]).padStart(2, '0');
    const mm = String(m[2]).padStart(2, '0');
    return `${m[3]}-${mm}-${dd}`;
  }

  return s;
}

// Numeric key for safe comparisons; returns null if unparseable
export function dateKey(dateStr) {
  const iso = normalizeDateStr(dateStr);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  return y * 10000 + mo * 100 + d;
}

export function formatThaiDate(ymd) {
  const iso = normalizeDateStr(ymd || '');
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return ymd || '';
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export function prevDate(dateToExclusive) {
  const iso = normalizeDateStr(dateToExclusive);
  const parts = iso.split('-').map(Number);
  if (parts.length !== 3 || parts.some(n => !Number.isFinite(n))) return dateToExclusive;
  const [y, m, d] = parts;
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - 1);
  return toLocalDateStr(dt);
}

function daysInMonth(y, m) {
  // m: 1-12
  return new Date(y, m, 0).getDate();
}

function clampDay(y, m, day) {
  const dim = daysInMonth(y, m);
  return Math.max(1, Math.min(day, dim));
}

/**
 * รอบตัดแบบกำหนดเอง (ยึด "เดือนที่เลือก" = เดือนเริ่มรอบ)
 * - startDay: 1-28 (แนะนำ)
 * - endDay:
 *    - 0  = สิ้นเดือน (EOM) ของเดือนที่สิ้นสุดรอบ
 *    - 1-31 = วันจบรอบ (ถ้า endDay < startDay จะถือว่าจบเดือนถัดไป)
 */
export function cycleRange(yyyyMM, startDay = 1, endDay = null) {
  const [y0, m0] = (yyyyMM || '').split('-').map(Number);
  if (!y0 || !m0) return monthRange(defaultMonthValue());

  // keep startDay within 1..28 เพื่อเลี่ยงเดือนสั้น
  const sd = Math.max(1, Math.min(Number(startDay || 1), 28));

  // compatible default
  let ed = endDay == null
    ? (sd === 1 ? 0 : (sd - 1))
    : Number(endDay);

  if (!Number.isFinite(ed)) ed = (sd === 1 ? 0 : (sd - 1));
  if (ed < 0) ed = 0;

  // start date
  const start = new Date(y0, m0 - 1, clampDay(y0, m0, sd));

  // if "ต้นเดือน → สิ้นเดือน"
  if (sd === 1 && (ed === 0 || ed >= 28)) {
    return monthRange(yyyyMM);
  }

  // decide end month/year
  let yE = y0;
  let mE = m0;
  if (ed !== 0 && ed < sd) {
    // end in next month
    yE = (m0 === 12) ? (y0 + 1) : y0;
    mE = (m0 === 12) ? 1 : (m0 + 1);
  }

  const endInclusiveDay = (ed === 0)
    ? daysInMonth(yE, mE)
    : clampDay(yE, mE, Math.max(1, Math.min(ed, 31)));

  // exclusive end = endInclusive + 1 day
  const endExclusive = new Date(yE, mE - 1, endInclusiveDay + 1);

  return { dateFrom: toLocalDateStr(start), dateToExclusive: toLocalDateStr(endExclusive) };
}



/**
 * Shift month value by delta months (YYYY-MM)
 */
export function shiftMonth(yyyyMM, deltaMonths = 0) {
  const [y0, m0] = (yyyyMM || '').split('-').map(Number);
  if (!y0 || !m0) return defaultMonthValue();
  const d = new Date(y0, (m0 - 1) + Number(deltaMonths || 0), 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2,'0');
  return `${y}-${m}`;
}


/**
 * Cycle range where the selected month is the "end month" of the cycle.
 * Example: startDay=21 endDay=20 and select 2026-02 => 21/01/2026 → 20/02/2026
 *
 * - If endDay == 0 => end at end of selected month (EOM)
 * - If endDay < startDay => start is in previous month
 */
export function cycleRangeByEndMonth(yyyyMM, startDay = 1, endDay = null) {
  const [y0, m0] = (yyyyMM || '').split('-').map(Number);
  if (!y0 || !m0) return monthRange(defaultMonthValue());

  // keep startDay safe (avoid 29-31 issues across months)
  let sd = Math.max(1, Math.min(28, Math.floor(Number(startDay || 1))));
  if (endDay == null) endDay = (sd === 1) ? 0 : (sd - 1);
  const ed = Math.max(0, Math.min(31, Math.floor(Number(endDay || 0)))); // 0 = EOM

  // endInclusive is in selected month
  const endInclusive = (ed === 0)
    ? new Date(y0, m0, 0) // last day of selected month
    : new Date(y0, m0 - 1, clampDay(y0, m0, ed));

  // start may be in previous month when ed < sd (and ed != 0)
  let sy = y0, sm = m0;
  if (ed !== 0 && ed < sd) {
    const pm = new Date(y0, m0 - 2, 1); // previous month
    sy = pm.getFullYear();
    sm = pm.getMonth() + 1;
  }
  const start = new Date(sy, sm - 1, clampDay(sy, sm, sd));
  const endExclusive = new Date(endInclusive.getFullYear(), endInclusive.getMonth(), endInclusive.getDate() + 1);

  return { dateFrom: toLocalDateStr(start), dateToExclusive: toLocalDateStr(endExclusive) };
}

/**
 * Wrapper to choose how the selected month anchors the cycle.
 * - anchor='start' => behavior of cycleRange() (selected month = start month)
 * - anchor='end'   => behavior of cycleRangeByEndMonth() (selected month = end/pay month)
 */
export function cycleRangeByAnchor(yyyyMM, startDay = 1, endDay = null, anchor = 'start') {
  return (anchor === 'end')
    ? cycleRangeByEndMonth(yyyyMM, startDay, endDay)
    : cycleRange(yyyyMM, startDay, endDay);
}


/**
 * คำนวณ "วันจ่าย" จากรอบ (ยึด "เดือนที่จบรอบ" = เดือนของ endInclusive)
 * - payType:
 *    - 'end'  : จ่าย "วันสุดท้ายของรอบ" (endInclusive)
 *    - 'eom'  : จ่าย "สิ้นเดือนของเดือนที่จบรอบ"
 *    - 'fixed': จ่าย "วันที่ X ของเดือนที่จบรอบ"
 */
export function payDateFromRange(range, payType = 'end', payDay = 0) {
  const endInclusive = prevDate(range.dateToExclusive);
  const iso = normalizeDateStr(endInclusive);
  const [y, m] = iso.split('-').slice(0, 2).map(Number);

  if (payType === 'eom') {
    const day = daysInMonth(y, m);
    return toLocalDateStr(new Date(y, m - 1, day));
  }

  if (payType === 'fixed') {
    const day = clampDay(y, m, Number(payDay || 1));
    return toLocalDateStr(new Date(y, m - 1, day));
  }

  return endInclusive;
}

export function monthRange(yyyyMM) {
  // yyyyMM: "YYYY-MM"
  const [y, m] = String(yyyyMM || '').split('-').map(Number);
  if (!y || !m) return monthRange(defaultMonthValue());
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 1);
  return { dateFrom: toLocalDateStr(start), dateToExclusive: toLocalDateStr(end) };
}

export function defaultMonthValue() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}
