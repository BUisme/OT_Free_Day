import { el } from './dom.js';
import { formatThaiDate } from '../lib/time.js';
import { computeDayMoney } from '../lib/money.js';

export function buildListView(store, range, onEdit) {
  const { state } = store;
  const s = state.settings;
  const hideMoney = !!s.privacyHideMoney;
  const records = (state.records || [])
    .filter(r => r.date >= range.dateFrom && r.date < range.dateToExclusive)
    .sort((a,b)=>b.date.localeCompare(a.date));

  const list = el('div', { class:'list' });

  if (!records.length) {
    list.append(el('div', { class:'small' }, 'ยังไม่มีข้อมูลในช่วงนี้'));
    return list;
  }

  for (const r of records) {
    const c = r.computed || {};
    const m = computeDayMoney(r, s);

    list.append(el('div', { class:'item' },
      el('div', { class:'row' },
        el('div', { class:'date' }, formatThaiDate(r.date)),
        el('div', {}, hideMoney ? '' : `${m.grossDay.toFixed(2)}฿`)
      ),
      el('div', { class:'meta' },
        el('span', {}, `สถานะ ${m.attendanceText}`),
        el('span', {}, `งาน ${c.workHoursNet.toFixed(2)} ชม.`),
        el('span', {}, `OT ${c.otHoursNet.toFixed(2)} ชม.`),
        ...(hideMoney ? [] : [
          el('span', {}, `OT ฿${m.otPay.toFixed(2)}`),
          el('span', {}, `รวมวัน ฿${m.grossDay.toFixed(2)}`),
        ]),
        el('span', {}, `ประเภท ${thaiDayType(r.dayType)}`)
      ),
      el('div', { class:'small' }, (r.tags||[]).length ? `แท็ก: ${(r.tags||[]).join(', ')}` : ''),
      el('div', { class:'small' }, r.note || ''),
      el('div', { class:'small' }, `บันทึก: ${r.createdAt || '-'} • แก้ไข: ${r.updatedAt || '-'}`),
      el('div', { class:'btns' },
        el('button', { class:'btn primary', type:'button', onClick: ()=>onEdit?.(r.date) }, 'แก้ไข'),
        el('button', { class:'btn', type:'button', onClick: ()=>navigator.clipboard?.writeText(JSON.stringify(r,null,2)) }, 'คัดลอก JSON')
      )
    ));
  }

  return list;
}

function thaiDayType(t){
  if (t==='holiday') return 'วันหยุด';
  if (t==='special') return 'พิเศษ';
  return 'ปกติ';
}
