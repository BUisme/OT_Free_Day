import { el, fmtMoney } from './dom.js';
import { defaultMonthValue, monthRange, formatThaiDate } from '../lib/time.js';
import { computeDayMoney } from '../lib/money.js';

export function mountListView(container, store, onEditDate) {
  const monthInput = el('input', { type:'month', value: defaultMonthValue(), class:'input' });
  const tableWrap = el('div', { class:'tableWrap' });

  const card = el('div', { class:'card' },
    el('div', { class:'hd' }, el('h2', {}, 'รายการรายวัน')),
    el('div', { class:'bd' },
      el('div', { class:'row between gap' },
        el('div', { class:'field' }, el('label', {}, 'เดือน'), monthInput),
        el('div', { class:'small muted' }, 'คลิกแถวเพื่อแก้ไข')
      ),
      tableWrap
    )
  );

  container.innerHTML = '';
  container.appendChild(card);

  function render() {
    const s = store.state.settings || {};
    const hideMoney = !!s.privacyHideMoney;
    const { dateFrom, dateToExclusive } = monthRange(monthInput.value || defaultMonthValue());

    const rows = (store.state.records || [])
      .filter(r => r.date >= dateFrom && r.date < dateToExclusive)
      .slice()
      .sort((a,b)=>a.date.localeCompare(b.date))
      .map(r => {
        const m = computeDayMoney(r, s);
        return {
          date: r.date,
          dateTh: formatThaiDate(r.date),
          attendance: r.attendance || 'present',
          dayType: r.dayType || 'normal',
          workHours: m.workHours,
          otHours: m.otHours,
          gross: m.grossDay,
        };
      });

    const head = el('tr', {},
      el('th', {}, 'วันที่'),
      el('th', {}, 'สถานะ'),
      el('th', {}, 'ประเภทวัน'),
      el('th', {}, 'งาน (ชม.)'),
      el('th', {}, 'OT (ชม.)'),
      el('th', { class:'right' }, 'รวม/วัน')
    );

    const tbody = el('tbody', {},
      rows.length ? rows.map(r => el('tr', { class:'rowBtn', onclick:()=>onEditDate(r.date) },
        el('td', {}, r.dateTh),
        el('td', {}, r.attendance === 'off' ? 'หยุด/ขาด' : (r.attendance === 'personal' ? 'ลากิจ' : (r.attendance === 'sick' ? 'ลาป่วย' : 'มาทำงาน'))),
        el('td', {}, r.dayType === 'holiday' ? 'สองแรง' : (r.dayType === 'special' ? 'พิเศษ' : 'ปกติ')),
        el('td', {}, r.workHours.toFixed(2)),
        el('td', {}, r.otHours.toFixed(2)),
        el('td', { class:'right' }, fmtMoney(r.gross, hideMoney)),
      )) : el('tr', {}, el('td', { colspan:'6', class:'small muted' }, 'ยังไม่มีรายการในเดือนนี้'))
    );

    const table = el('table', { class:'table' }, el('thead', {}, head), tbody);
    tableWrap.innerHTML = '';
    tableWrap.appendChild(table);
  }

  monthInput.addEventListener('change', render);
  render();
  return { refresh: render };
}
