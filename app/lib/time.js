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
