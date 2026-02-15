import { el, toast } from './dom.js';
import { deriveRates } from '../lib/money.js';

function numberInput(value, step='1', min=null){
  const a = { class:'input', type:'number', value: String(value ?? ''), step };
  if (min != null) a.min = String(min);
  return el('input', a);
}

function checkbox(value){
  return el('input', { type:'checkbox', checked: !!value });
}

export function mountSettingsView(container, store) {
  const s = structuredClone(store.state.settings || {});
  const ratesBox = el('div', { class:'notice ok' });

  const baseSalary = numberInput(s.baseSalary, '1', 0);
  const workingDays = numberInput(s.workingDaysPerMonth, '1', 1);
  const hoursPerDay = numberInput(s.standardHoursPerDay, '0.5', 1);

  const wN = numberInput(s.workMultipliers?.normal ?? 1, '0.1', 0);
  const wH = numberInput(s.workMultipliers?.holiday ?? 2, '0.1', 0);
  const wS = numberInput(s.workMultipliers?.special ?? 3, '0.1', 0);

  const oN = numberInput(s.otMultipliers?.normal ?? 1.5, '0.1', 0);
  const oH = numberInput(s.otMultipliers?.holiday ?? 2, '0.1', 0);
  const oS = numberInput(s.otMultipliers?.special ?? 3, '0.1', 0);

  const allowM = numberInput(s.allowancesMonthly ?? 0, '1', 0);
  const dedM = numberInput(s.deductionsMonthly ?? 0, '1', 0);

  const hideMoney = checkbox(!!s.privacyHideMoney);

  function updateRates(){
    const next = collect(false);
    const r = deriveRates(next);
    ratesBox.innerHTML = `
      <div><b>เรทที่คำนวณได้</b></div>
      <div class="small">ค่าแรง/วัน = ${r.dailyRate.toFixed(2)} (÷${r.workingDaysPerMonth})</div>
      <div class="small">ค่าแรง/ชม. = ${r.hourlyRate.toFixed(2)} (÷${r.standardHoursPerDay})</div>
    `;
  }

  function collect(includePrivacy=true){
    return {
      ...s,
      baseSalary: Number(baseSalary.value||0),
      workingDaysPerMonth: Number(workingDays.value||26),
      standardHoursPerDay: Number(hoursPerDay.value||8),
      workMultipliers: { normal:Number(wN.value||1), holiday:Number(wH.value||2), special:Number(wS.value||3) },
      otMultipliers:   { normal:Number(oN.value||1.5), holiday:Number(oH.value||2), special:Number(oS.value||3) },
      allowancesMonthly: Number(allowM.value||0),
      deductionsMonthly: Number(dedM.value||0),
      privacyHideMoney: includePrivacy ? !!hideMoney.checked : s.privacyHideMoney,
    };
  }

  const form = el('div', {},
    el('div', { class:'grid' },
      el('div', { class:'card' },
        el('div', { class:'hd' }, el('h2', {}, 'เงินเดือน / เรท')),
        el('div', { class:'bd' },
          el('div', { class:'field' }, el('label', {}, 'ฐานเงินเดือน'), baseSalary),
          el('div', { class:'field' }, el('label', {}, 'หาร/วัน (26 หรือ 30)'), workingDays),
          el('div', { class:'field' }, el('label', {}, 'ชั่วโมงมาตรฐาน/วัน'), hoursPerDay),
          ratesBox
        )
      ),
      el('div', { class:'card' },
        el('div', { class:'hd' }, el('h2', {}, 'ความเป็นส่วนตัว')),
        el('div', { class:'bd' },
          el('div', { class:'row between' },
            el('div', {}, el('b', {}, 'ซ่อนจำนวนเงิน'), el('div', { class:'small muted' }, 'แสดงเป็น *** แต่ยังคำนวณจริงอยู่')),
            hideMoney
          )
        )
      ),
    ),
    el('div', { class:'card mt' },
      el('div', { class:'hd' }, el('h2', {}, 'ตัวคูณ “งาน” และ “OT”')),
      el('div', { class:'bd' },
        el('div', { class:'small muted' }, 'แก้ได้ตามหน้างาน: ปกติ 1 / วันหยุด 2 / พิเศษ 3 • OT ปกติ 1.5'),
        el('div', { class:'row gap' },
          el('div', { class:'field' }, el('label', {}, 'งาน ปกติ'), wN),
          el('div', { class:'field' }, el('label', {}, 'งาน วันหยุด/สองแรง'), wH),
          el('div', { class:'field' }, el('label', {}, 'งาน วันพิเศษ'), wS),
        ),
        el('div', { class:'row gap' },
          el('div', { class:'field' }, el('label', {}, 'OT ปกติ'), oN),
          el('div', { class:'field' }, el('label', {}, 'OT วันหยุด/สองแรง'), oH),
          el('div', { class:'field' }, el('label', {}, 'OT วันพิเศษ'), oS),
        ),
      )
    ),
    el('div', { class:'card mt' },
      el('div', { class:'hd' }, el('h2', {}, 'เพิ่ม/หัก รายเดือน')),
      el('div', { class:'bd' },
        el('div', { class:'row gap' },
          el('div', { class:'field' }, el('label', {}, 'เบี้ย/เพิ่ม (รายเดือน)'), allowM),
          el('div', { class:'field' }, el('label', {}, 'หัก (รายเดือน)'), dedM),
        )
      )
    ),
    el('div', { class:'row end gap mt' },
      el('button', { class:'btn primary', type:'button', onclick:()=>{ store.saveSettings(collect(true)); toast('บันทึกแล้ว ✅'); } }, 'บันทึก'),
    )
  );

  // Update rates live
  for (const inp of [baseSalary, workingDays, hoursPerDay, wN, wH, wS, oN, oH, oS]) {
    inp.addEventListener('input', updateRates);
  }
  updateRates();

  container.innerHTML = '';
  container.appendChild(form);

  return { refresh: ()=>{ /* settings view is static from cloned settings */ } };
}
