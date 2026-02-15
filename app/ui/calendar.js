import { el, fmtMoney } from './dom.js';
import { monthRange, defaultMonthValue, formatThaiDate, toLocalDateStr } from '../lib/time.js';
import { computeDayMoney } from '../lib/money.js';

function weekdayLabels(weekStartsOn){
  return weekStartsOn === 1
    ? ['จ','อ','พ','พฤ','ศ','ส','อา']
    : ['อา','จ','อ','พ','พฤ','ศ','ส'];
}

function startOffset(dateObj, weekStartsOn){
  // JS: 0=Sun..6=Sat
  const d = dateObj.getDay();
  return weekStartsOn === 1 ? (d === 0 ? 6 : d-1) : d;
}

function addDays(dateObj, n){
  const d = new Date(dateObj);
  d.setDate(d.getDate()+n);
  return d;
}

export function mountCalendarView(container, store, onEditDate) {
  const monthInput = el('input', { type:'month', value: defaultMonthValue(), class:'input' });
  const info = el('div', { class:'small muted' }, 'คลิกวันที่เพื่อเพิ่ม/แก้ไขรายการ');
  const grid = el('div', { class:'calWrap' });

  const top = el('div', { class:'row between gap' },
    el('div', { class:'row gap' },
      el('div', { class:'field' },
        el('label', {}, 'เดือน'),
        monthInput
      ),
      el('div', { class:'field' }, el('label', {}, ' '), info)
    ),
    el('div', { class:'small muted' }, '💾 บันทึกอัตโนมัติในเครื่อง (localStorage)')
  );

  const card = el('div', { class:'card' },
    el('div', { class:'hd' }, el('h2', {}, 'ปฏิทิน')),
    el('div', { class:'bd' }, top, grid)
  );

  container.innerHTML = '';
  container.appendChild(card);

  function render() {
    const s = store.state.settings || {};
    const hideMoney = !!s.privacyHideMoney;
    const weekStartsOn = Number.isFinite(Number(s.weekStartsOn)) ? Number(s.weekStartsOn) : 1;

    const yyyyMM = monthInput.value || defaultMonthValue();
    const { dateFrom, dateToExclusive } = monthRange(yyyyMM);
    const [y,m] = yyyyMM.split('-').map(Number);

    // Build day array
    const first = new Date(y, m-1, 1);
    const offset = startOffset(first, weekStartsOn);
    const start = addDays(first, -offset);

    const labels = weekdayLabels(weekStartsOn);

    const head = el('div', { class:'calHead' }, labels.map(l=>el('div', { class:'calHeadCell' }, l)));

    const cells = [];
    for (let i=0;i<42;i++){
      const d = addDays(start, i);
      const ymd = toLocalDateStr(d);
      const inMonth = (d.getMonth() === (m-1));
      const rec = store.getRecord(ymd);
      const mny = rec ? computeDayMoney(rec, s) : null;

      const cls = [
        'calCell',
        inMonth ? '' : 'dim',
        rec ? 'has' : '',
        rec?.attendance === 'off' ? 'off' : '',
        (rec?.attendance === 'personal' || rec?.attendance === 'sick') ? 'leave' : '',
        rec?.dayType === 'holiday' ? 'holiday' : '',
        rec?.dayType === 'special' ? 'special' : '',
      ].filter(Boolean).join(' ');

      const topRow = el('div', { class:'calCellTop' },
        el('div', { class:'calDay' }, String(d.getDate())),
        rec ? el('div', { class:'pill' }, rec.attendance === 'off' ? 'หยุด' : (rec.attendance === 'personal' ? 'ลากิจ' : (rec.attendance === 'sick' ? 'ลาป่วย' : 'ทำงาน'))) : el('div')
      );

      const mid = rec ? el('div', { class:'calMeta' },
        el('div', { class:'small' }, rec.dayType === 'holiday' ? 'สองแรง' : (rec.dayType === 'special' ? 'พิเศษ' : 'ปกติ')),
        el('div', { class:'small' }, `งาน ${mny.workHours.toFixed(2)}h • OT ${mny.otHours.toFixed(2)}h`),
        el('div', { class:'small money' }, `รวม ${fmtMoney(mny.grossDay, hideMoney)}`)
      ) : el('div', { class:'calMeta muted small' }, inMonth ? '—' : '');

      const cell = el('button', { type:'button', class: cls, onclick:()=>onEditDate(ymd) },
        topRow,
        mid
      );
      cells.push(cell);
    }

    const body = el('div', { class:'calGrid' }, cells);

    grid.innerHTML = '';
    grid.appendChild(head);
    grid.appendChild(body);
  }

  monthInput.addEventListener('change', render);
  render();

  return { refresh: render, setMonth:(yyyyMM)=>{ monthInput.value=yyyyMM; render(); } };
}
