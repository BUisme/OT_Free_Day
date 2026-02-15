import { parseHHMM } from './time.js';

export function normalizeBreaks(breaks = []) {
  const out = [];
  for (const b of breaks) {
    const s = parseHHMM(b?.start);
    const e0 = parseHHMM(b?.end);
    if (s == null || e0 == null) continue;
    let e = e0;
    if (e < s) e += 24*60;
    if (e === s) continue;
    out.push([s,e]);
  }
  return mergeIntervals(out);
}
export function mergeIntervals(intervals) {
  const arr = (intervals || []).slice().filter(x => x && x.length===2);
  arr.sort((a,b)=>a[0]-b[0] || a[1]-b[1]);
  const merged = [];
  for (const iv of arr) {
    if (!merged.length) merged.push(iv.slice());
    else {
      const last = merged[merged.length-1];
      if (iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]);
      else merged.push(iv.slice());
    }
  }
  return merged;
}
export function overlapMinutes(intervals, range) {
  if (!range) return 0;
  const [rs,re] = range;
  let sum = 0;
  for (const [s,e] of intervals || []) {
    const a = Math.max(s, rs);
    const b = Math.min(e, re);
    if (b > a) sum += (b-a);
  }
  return sum;
}
