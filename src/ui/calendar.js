import { el, clear } from './dom.js';
import { computeDayMoney } from '../lib/money.js';

const DOW_TH = ['จ','อ','พ','พฤ','ศ','ส','อา'];

function pad2(n){ return String(n).padStart(2,'0'); }
function ymd(y,m,d){ return `${y}-${pad2(m)}-${pad2(d)}`; }

function parseMonth(yyyyMM){
  const m = /^([0-9]{4})-([0-9]{2})$/.exec(yyyyMM || '');
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]) };
}
function daysInMonth(y, m){
  return new Date(y, m, 0).getDate();
}
function weekdayMon0(date){
  // JS: 0=Sun..6=Sat => convert to 0=Mon..6=Sun
  return (date.getDay() + 6) % 7;
}

function buildRecordMap(records){
  const map = new Map();
  for (const r of (records || [])) {
    if (r?.date) map.set(r.date, r);
  }
  return map;
}

function dayBadge(record){
  if (!record) return '';
  if (record.attendance && record.attendance !== 'present') {
    if (record.attendance === 'off') return '🛑';
    if (record.attendance === 'personal') return '📝';
    if (record.attendance === 'sick') return '🤒';
    return '⛔';
  }
  return '✅';
}

export function mountCalendar(container, store, onEditDate, yyyyMM) {
  const state = store?.state || {};
  const month = parseMonth(yyyyMM) || (()=>{
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth()+1 };
  })();

  function render(){
    clear(container);

    const { y, m } = month;
    const first = new Date(y, m-1, 1);
    const dim = daysInMonth(y, m);
    const lead = weekdayMon0(first); // 0..6

    const recMap = buildRecordMap(state.records);
    const hideMoney = !!state.settings?.privacyHideMoney;

    const title = el('div', { class:'calTitle' }, `${pad2(m)}/${y}`);

    const dow = el('div', { class:'calDowRow' },
      DOW_TH.map(d => el('div', { class:'calDow' }, d))
    );

    const grid = el('div', { class:'calGrid' });

    const today = new Date();
    const todayStr = ymd(today.getFullYear(), today.getMonth()+1, today.getDate());

    // 6 rows x 7 cols = 42 cells
    for (let i=0; i<42; i++) {
      const dayNum = i - lead + 1;
      const inMonth = dayNum >= 1 && dayNum <= dim;

      let dateStr = '';
      let record = null;
      if (inMonth) {
        dateStr = ymd(y, m, dayNum);
        record = recMap.get(dateStr) || null;
      }

      const badge = dayBadge(record);
      const c = record?.computed || {};
      const money = record ? computeDayMoney(record, state.settings) : null;

      const metaLines = [];
      if (record) {
        const ot = Number(c.otHoursNet || 0);
        const work = Number(c.workHoursNet || 0);
        if (ot > 0) metaLines.push(`OT ${ot.toFixed(2)}h`);
        else if (work > 0) metaLines.push(`${work.toFixed(2)}h`);

        if (!hideMoney && money && Number(money.grossDay || 0) > 0) {
          metaLines.push(`฿${Number(money.grossDay).toFixed(0)}`);
        }
      }

      const meta = el('div', { class:'calMeta' },
        metaLines.slice(0,2).map(t => el('div', { class:'calMetaLine' }, t))
      );

      const cell = el('button', {
        type:'button',
        class: `calCell ${inMonth ? '' : 'muted'} ${dateStr===todayStr ? 'today' : ''} ${record ? 'has' : ''}`,
        onClick: ()=>{ if (inMonth && dateStr) onEditDate?.(dateStr); }
      },
        el('div', { class:'calNum' }, inMonth ? String(dayNum) : ''),
        el('div', { class:'calBadge' }, badge),
        meta
      );

      grid.append(cell);
    }

    container.append(
      el('div', { class:'calWrap' },
        title,
        dow,
        grid,
        el('div', { class:'small', style:'margin-top:8px;color:var(--muted);' },
          'แตะวันที่เพื่อบันทึก/แก้ไข • สัญลักษณ์: ✅ งาน | 🛑 หยุด | 📝 ลากิจ | 🤒 ลาป่วย'
        )
      )
    );
  }

  render();
  return { calendar: null, refresh: render };
}
