import { el, toast } from './dom.js';
import { deriveRates } from '../lib/money.js';

export function buildSettingsView(store) {
  const { state } = store;
  const s = structuredClone(state.settings);
  const ratesBox = el('div', { class:'notice ok' });

  function updateRates(){
    const r = deriveRates(s);
    ratesBox.innerHTML = `
      <div><b>เรทที่คำนวณได้</b></div>
      <div class="small">ค่าแรง/วัน = ${r.dailyRate.toFixed(2)} (÷${r.workingDaysPerMonth})</div>
      <div class="small">ค่าแรง/ชม. = ${r.hourlyRate.toFixed(2)} (÷${r.standardHoursPerDay})</div>
    `;
  }

  updateRates();

  const body = el('div', {},
    card('ข้อมูลพนักงาน', [
      textField('รหัสพนักงาน', s.employeeId, v=>{ s.employeeId=v; }),
      textField('แผนก', s.department, v=>{ s.department=v; }),
    ]),
    card('ความเป็นส่วนตัว', [
      checkboxField('ซ่อนตัวเลขเงินทั้งระบบ (UI + PDF)', !!s.privacyHideMoney, v=>{ s.privacyHideMoney = v; }),
      el('div', { class:'small' }, 'เปิดแล้วจะซ่อนยอดเงินในปฏิทิน/สรุป/รายการ และ PDF จะบังคับเป็น “เฉพาะวันเวลา”')
    ]),
    card('ฐานเงินเดือน', [
      numberField('ฐานเงินเดือน (บาท/เดือน)', s.baseSalary, v=>{ s.baseSalary=Number(v||0); updateRates(); }),
      numberField('หารวันทำงาน/เดือน (เดย์เลือก 30)', s.workingDaysPerMonth, v=>{ s.workingDaysPerMonth=Number(v||30); updateRates(); }),
      numberField('ชั่วโมงมาตรฐาน/วัน', s.standardHoursPerDay, v=>{ s.standardHoursPerDay=Number(v||8); updateRates(); }),
      selectField('โหมดเงินเดือน', [
        ['fixed','เงินเดือนคงที่ (รวมทั้งเดือน)'],
        ['prorateByDays','โปรเรทตามวันมาทำ'],
        ['prorateByHours','โปรเรทตามชั่วโมงงาน'],
      ], s.salaryMode, v=>{ s.salaryMode=v; }),
      ratesBox
    ]),
    card('ตัวคูณวัน + ตัวคูณ OT', [
      el('div', { class:'small' }, 'เดย์จำได้: ปกติ 1.5 • วันหยุด 2 • พิเศษ 3 (แก้ได้)'),
      inline([
        numberField('ตัวคูณ “งาน” ปกติ', s.workMultipliers?.normal ?? 1, v=>{ s.workMultipliers = { ...s.workMultipliers, normal: Number(v||1) }; }),
        numberField('ตัวคูณ “งาน” วันหยุด/สองแรง', s.workMultipliers?.holiday ?? 2, v=>{ s.workMultipliers = { ...s.workMultipliers, holiday: Number(v||2) }; }),
      ]),
      inline([
        numberField('ตัวคูณ “งาน” วันพิเศษ', s.workMultipliers?.special ?? 3, v=>{ s.workMultipliers = { ...s.workMultipliers, special: Number(v||3) }; }),
        el('div', { class:'field' }, el('label', {}, ' '), el('div', { class:'small' }, ' ') )
      ]),
      el('div', { class:'hr' }),
      inline([
        numberField('OT ปกติ', s.otMultipliers?.normal ?? 1.5, v=>{ s.otMultipliers = { ...s.otMultipliers, normal: Number(v||1.5) }; }),
        numberField('OT วันหยุด', s.otMultipliers?.holiday ?? 2, v=>{ s.otMultipliers = { ...s.otMultipliers, holiday: Number(v||2) }; }),
      ]),
      inline([
        numberField('OT วันพิเศษ', s.otMultipliers?.special ?? 3, v=>{ s.otMultipliers = { ...s.otMultipliers, special: Number(v||3) }; }),
        el('div', { class:'field' }, el('label', {}, ' '), el('div', { class:'small' }, ' ') )
      ]),
    ]),
    card('ค่าเริ่มต้นเวลางาน/OT', [
      selectField('กะเริ่มต้น', [
        ['day','กะกลางวัน'],
        ['night','กะดึก/ข้ามวัน'],
        ['custom','กำหนดเอง'],
      ], s.defaultShiftType, v=>{ s.defaultShiftType=v; }),
      inline([
        timeField('เริ่มงาน', s.defaultWorkStart, v=>{ s.defaultWorkStart=v; }),
        timeField('เลิกงาน', s.defaultWorkEnd, v=>{ s.defaultWorkEnd=v; }),
      ]),
      inline([
        timeField('เริ่ม OT', s.defaultOtStart, v=>{ s.defaultOtStart=v; }),
        timeField('เลิก OT', s.defaultOtEnd, v=>{ s.defaultOtEnd=v; }),
      ]),
      breaksEditor('พักเริ่มต้น (Default Breaks)', s.defaultBreaks || [], v=>{ s.defaultBreaks = v; }),
    ]),
    card('ปรับรายเดือน (Optional)', [
      numberField('เพิ่มรายเดือน (บาท)', s.allowancesMonthly ?? 0, v=>{ s.allowancesMonthly=Number(v||0); }),
      numberField('หักรายเดือน (บาท)', s.deductionsMonthly ?? 0, v=>{ s.deductionsMonthly=Number(v||0); }),
    ])
  );

  const footer = el('button', { class:'btn good', type:'button', onClick: async ()=>{
    try{
      await store.saveSettings(s);
      toast('บันทึกตั้งค่าแล้ว ✅');
    }catch(e){
      console.error(e);
      toast('บันทึกไม่สำเร็จ: ' + (e?.message||e), 'danger', 3200);
    }
  }}, '💾 บันทึกตั้งค่า');

  return { body, footer };
}


function breaksEditor(label, breaksArr, onChange){
  const breaks = Array.isArray(breaksArr) ? structuredClone(breaksArr) : [];
  const list = el('div', { class:'list' });

  function redraw(){
    list.innerHTML = '';
    breaks.forEach((b, idx) => {
      const row = el('div', { class:'item' });
      row.append(
        el('div', { class:'inline' },
          timeField('เริ่มพัก', b.start, v=>{ b.start=v; onChange?.(breaks); }),
          timeField('เลิกพัก', b.end, v=>{ b.end=v; onChange?.(breaks); }),
        ),
        el('div', { class:'btns' },
          el('button', { class:'btn bad', type:'button', onClick: ()=>{ breaks.splice(idx,1); onChange?.(breaks); redraw(); }}, 'ลบ')
        )
      );
      list.append(row);
    });
    if (!breaks.length) list.append(el('div', { class:'small' }, 'ยังไม่มีช่วงพักเริ่มต้น'));
  }

  redraw();

  const addBtn = el('button', { class:'btn', type:'button', onClick: ()=>{ breaks.push({ start:'', end:'' }); onChange?.(breaks); redraw(); }}, '➕ เพิ่มช่วงพักเริ่มต้น');

  return el('div', { class:'field' },
    el('label', {}, label),
    list,
    addBtn,
    el('div', { class:'small' }, 'ช่วงพักนี้จะถูกใส่อัตโนมัติเมื่อสร้างวันใหม่ และมีปุ่มกดดึงในหน้า “บันทึกวัน”')
  );
}
function card(title, children){
  return el('div', { class:'card' },
    el('div', { class:'hd' }, el('h2', {}, title)),
    el('div', { class:'bd' }, children)
  );
}
function inline(children){ return el('div', { class:'inline' }, children); }

function textField(label, value, onChange){
  return el('div', { class:'field' }, el('label', {}, label),
    el('input', { type:'text', value: value || '', onInput:(e)=>onChange?.(e.target.value) })
  );
}
function numberField(label, value, onChange){
  return el('div', { class:'field' }, el('label', {}, label),
    el('input', { type:'number', step:'0.01', value: value ?? 0, onInput:(e)=>onChange?.(e.target.value) })
  );
}
function timeField(label, value, onChange){
  return el('div', { class:'field' }, el('label', {}, label),
    el('input', { type:'time', value: value || '', onInput:(e)=>onChange?.(e.target.value) })
  );
}
function selectField(label, options, value, onChange){
  const sel = el('select', { onChange:(e)=>onChange?.(e.target.value) });
  for (const [v,t] of options) sel.append(el('option', { value:v, selected: v===value ? 'selected' : null }, t));
  return el('div', { class:'field' }, el('label', {}, label), sel);
}

function checkboxField(label, checked, onChange){
  return el('div', { class:'field' }, el('label', {}, label),
    el('label', { class:'btn', style:'justify-content:flex-start;gap:10px;' },
      el('input', { type:'checkbox', checked: checked ? 'checked' : null, onChange:(e)=>onChange?.(e.target.checked) }),
      checked ? 'เปิด' : 'ปิด'
    )
  );
}
