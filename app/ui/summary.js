import { el, fmtMoney } from './dom.js';
import { defaultMonthValue, monthRange, formatThaiDate, prevDate } from '../lib/time.js';
import { computeRangeSummary } from '../lib/money.js';

export function mountSummaryView(container, store) {
  const monthInput = el('input', { type:'month', value: defaultMonthValue(), class:'input' });
  const fromInput = el('input', { type:'date', class:'input' });
  const toInput = el('input', { type:'date', class:'input' });
  const useCustom = el('input', { type:'checkbox' });

  const body = el('div', {});

  const card = el('div', { class:'card' },
    el('div', { class:'hd' }, el('h2', {}, 'สรุป')),
    el('div', { class:'bd' },
      el('div', { class:'row between gap' },
        el('div', { class:'row gap' },
          el('div', { class:'field' }, el('label', {}, 'เดือน'), monthInput),
          el('div', { class:'field inline' },
            el('label', {}, 'กำหนดช่วงเอง'),
            el('div', {}, useCustom)
          )
        ),
        el('div', { class:'small muted' }, 'เลือกเดือน หรือกำหนดช่วงวันที่เอง')
      ),
      el('div', { class:'row gap' },
        el('div', { class:'field' }, el('label', {}, 'จาก'), fromInput),
        el('div', { class:'field' }, el('label', {}, 'ถึง (รวมวันนี้)'), toInput),
      ),
      body
    )
  );

  container.innerHTML = '';
  container.appendChild(card);

  function currentRange() {
    if (useCustom.checked && fromInput.value && toInput.value) {
      const dateFrom = fromInput.value;
      const d = new Date(toInput.value);
      d.setDate(d.getDate()+1);
      const dateToExclusive = d.toISOString().slice(0,10);
      return { label:'ช่วงที่กำหนด', dateFrom, dateToExclusive };
    }
    const yyyyMM = monthInput.value || defaultMonthValue();
    const r = monthRange(yyyyMM);
    return { label:`เดือน ${yyyyMM}`, ...r };
  }

  function render() {
    const r = currentRange();
    const s = store.state.settings || {};
    const hideMoney = !!s.privacyHideMoney;
    const sum = computeRangeSummary(store.state.records || [], s, r.dateFrom, r.dateToExclusive);

    const lines = [
      ['ช่วงวันที่', `${formatThaiDate(r.dateFrom)} ถึง ${formatThaiDate(prevDate(r.dateToExclusive))}`],
      ['มาทำงาน', `${sum.daysPresent} วัน`],
      ['หยุด/ขาด', `${sum.daysOff} วัน`],
      ['ลากิจ', `${sum.daysPersonal} วัน`],
      ['ลาป่วย', `${sum.daysSick} วัน`],
      ['ชั่วโมงงาน', `${sum.workHours.toFixed(2)} ชม.`],
      ['ชั่วโมง OT', `${sum.otHours.toFixed(2)} ชม.`],
      ['ค่าแรงปกติ', fmtMoney(sum.normalPay, hideMoney)],
      ['ค่า OT', fmtMoney(sum.otPay, hideMoney)],
      ['เบี้ย/เพิ่ม', fmtMoney(sum.allowances, hideMoney)],
      ['หัก', fmtMoney(sum.deductions, hideMoney)],
      ['รวมสุทธิ', fmtMoney(sum.gross, hideMoney)],
    ];

    body.innerHTML = '';
    body.appendChild(el('div', { class:'notice ok' }, `สรุป: ${r.label}`));
    const grid = el('div', { class:'kv' }, lines.map(([k,v])=>[
      el('div', { class:'k' }, k),
      el('div', { class:'v' }, v)
    ]).flat());
    body.appendChild(grid);
  }

  function updateCustomEnabled(){
    const en = useCustom.checked;
    fromInput.disabled = !en;
    toInput.disabled = !en;
    render();
  }

  monthInput.addEventListener('change', render);
  fromInput.addEventListener('change', render);
  toInput.addEventListener('change', render);
  useCustom.addEventListener('change', updateCustomEnabled);

  // init
  updateCustomEnabled();
  return { refresh: render };
}
