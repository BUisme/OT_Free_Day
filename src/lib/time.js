export function parseHHMM(s) {
  if (!s || typeof s !== 'string') return null;
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(s.trim());
  if (!m) return null;
  return parseInt(m[1],10)*60 + parseInt(m[2],10);
}
export function normalizeRange(startHHMM, endHHMM) {
  const s = parseHHMM(startHHMM);
  const e0 = parseHHMM(endHHMM);
  if (s == null || e0 == null) return null;
  let e = e0;
  if (e < s) e += 24*60; // cross-midnight
  return [s,e];
}
export function duration(range){ return range ? Math.max(0, range[1]-range[0]) : 0; }
export function nowISO(){ return new Date().toISOString(); }
export function toLocalDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth()+1).padStart(2,'0');
  const d = String(date.getDate()).padStart(2,'0');
  return `${y}-${m}-${d}`;
}
export function formatThaiDate(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || '');
  if (!m) return ymd || '';
  return `${m[3]}/${m[2]}/${m[1]}`;
}
export function prevDate(dateToExclusive) {
  const [y,m,d] = dateToExclusive.split('-').map(Number);
  const dt = new Date(y, m-1, d);
  dt.setDate(dt.getDate()-1);
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
 * รอบตัดรายเดือนแบบ "เริ่มวันที่ X ของเดือนนี้ → ถึงวันที่ (X-1) ของเดือนถัดไป"
 * - ใช้ร่วมกับการเลือกเดือน (YYYY-MM) โดยเดือนนี้ = เดือนเริ่มรอบ
 * - startDay แนะนำ 1-28 เพื่อเลี่ยงเดือนสั้น
 */
export function cycleRange(yyyyMM, startDay = 1) {
  const [y0, m0] = (yyyyMM || '').split('-').map(Number);
  const sd = Math.max(1, Math.min(Number(startDay || 1), 28));
  if (!y0 || !m0) return monthRange(defaultMonthValue());
  if (sd === 1) return monthRange(yyyyMM);

  const start = new Date(y0, m0 - 1, clampDay(y0, m0, sd));
  const y2 = (m0 === 12) ? (y0 + 1) : y0;
  const m2 = (m0 === 12) ? 1 : (m0 + 1);
  const end = new Date(y2, m2 - 1, clampDay(y2, m2, sd));

  return { dateFrom: toLocalDateStr(start), dateToExclusive: toLocalDateStr(end) };
}

/**
 * คำนวณ "วันจ่าย" จากรอบ (เดือนจ่าย = เดือนที่จบรอบ)
 * - payType: 'end' | 'fixed'
 * - payDay: ใช้เมื่อ payType='fixed' (1-31) ถ้าเกินวันในเดือนจะถูก clamp
 */
export function payDateFromRange(range, payType = 'end', payDay = 0) {
  const endInclusive = prevDate(range.dateToExclusive);
  if (payType === 'fixed') {
    const [y, m] = endInclusive.split('-').slice(0, 2).map(Number);
    const day = clampDay(y, m, Number(payDay || 1));
    return toLocalDateStr(new Date(y, m - 1, day));
  }
  return endInclusive;
}

export function monthRange(yyyyMM) {
  // yyyyMM: "YYYY-MM"
  const [y,m] = yyyyMM.split('-').map(Number);
  const start = new Date(y, m-1, 1);
  const end = new Date(y, m, 1);
  return { dateFrom: toLocalDateStr(start), dateToExclusive: toLocalDateStr(end) };
}
export function defaultMonthValue() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  return `${y}-${m}`;
}
