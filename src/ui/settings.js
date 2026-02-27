import { el, toast } from './dom.js';
import { deriveRates } from '../lib/money.js';

export function buildSettingsView(store) {
  const { state } = store;
  const s = structuredClone(state.settings);

  // ensure shiftTemplates (รองรับข้อมูลเก่าที่ยังไม่มี)
  if (!s.shiftTemplates) {
    s.shiftTemplates = {
      day: {
        workStart: s.defaultWorkStart || '08:00',
        workEnd: s.defaultWorkEnd || '17:00',
        otStart: s.defaultOtStart || '',
        otEnd: s.defaultOtEnd || '',
        breaks: structuredClone(s.defaultBreaks || []),
      },
      night: {
        workStart: '20:00',
        workEnd: '05:00',
        otStart: '05:00',
        otEnd: '07:00',
        breaks: [ { start:'00:00', end:'00:30' } ],
      },
      custom: {
        workStart: s.defaultWorkStart || '08:00',
        workEnd: s.defaultWorkEnd || '17:00',
        otStart: '',
        otEnd: '',
        breaks: [],
      },
    };
  } else {
    // เติม key ที่ขาด
    s.shiftTemplates.day ??= { workStart:'08:00', workEnd:'17:00', otStart:'', otEnd:'', breaks:[] };
    s.shiftTemplates.night ??= { workStart:'20:00', workEnd:'05:00', otStart:'', otEnd:'', breaks:[] };
    s.shiftTemplates.custom ??= { workStart:'08:00', workEnd:'17:00', otStart:'', otEnd:'', breaks:[] };
    for (const k of ['day','night','custom']) {
      const t = s.shiftTemplates[k] || {};
      if (!Array.isArray(t.breaks)) t.breaks = [];
    }
  }
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
    card('รอบตัดเงินเดือน/OT', [
      row('โหมดเลือกเดือนในหน้าหลัก', [
        el('select', {
          value: (s.cycleMonthAnchor || 'end'),
          onChange: (e)=> { s.cycleMonthAnchor = e.target.value; },
        },
          el('option', { value:'end' }, 'เดือนจบรอบ/เดือนจ่าย (แนะนำ)'),
          el('option', { value:'start' }, 'เดือนเริ่มรอบ (แบบเดิม)'),
        ),
      ]),
      el('div', { class:'small' }, 'ตัวอย่าง: ถ้าอยากได้ 21/01 → 20/02 ให้เลือกเดือน = “กุมภาพันธ์” แล้วตั้งวันเริ่ม=21 วันจบรอบ=20 ✅ (ระบบจะคิดงวดที่ “จบในเดือนที่เลือก”)'),

            (() => {
        const startDay = Number(s.salaryCycleStartDay || 1);
        const endDay = (s.salaryCycleEndDay == null) ? (startDay === 1 ? 0 : (startDay - 1)) : Number(s.salaryCycleEndDay);

        let preset = 'custom';
        if (startDay === 1 && (endDay === 0) && (s.salaryPayType === 'end' || s.salaryPayType === 'eom')) preset = 'm1';
        if (startDay === 21 && endDay === 20 && s.salaryPayType === 'eom') preset = 'd21_eom';
        if (startDay === 21 && endDay === 20 && s.salaryPayType === 'fixed' && Number(s.salaryPayDay || 0) === 25) preset = 'd21_25';

        return selectField('เงินเดือน: ตั้งค่ารวดเร็ว', [
          ['m1', 'ต้นเดือน → สิ้นเดือน • ออกสิ้นเดือน'],
          ['d21_eom', '21 → 20 • ออกสิ้นเดือน (เดือนที่จบรอบ)'],
          ['d21_25', '21 → 20 • ออกวันที่ 25 (เดือนที่จบรอบ)'],
          ['custom', 'กำหนดเอง (ดูช่องด้านล่าง)'],
        ], preset, v => {
          if (v === 'd21_eom') {
            s.salaryCycleStartDay = 21;
            s.salaryCycleEndDay = 20;
            s.salaryPayType = 'eom';
            s.salaryPayDay = 0;
          } else if (v === 'd21_25') {
            s.salaryCycleStartDay = 21;
            s.salaryCycleEndDay = 20;
            s.salaryPayType = 'fixed';
            s.salaryPayDay = 25;
          } else if (v === 'm1') {
            s.salaryCycleStartDay = 1;
            s.salaryCycleEndDay = 0; // สิ้นเดือน
            s.salaryPayType = 'eom';
            s.salaryPayDay = 0;
          }
        });
      })(),

      (() => {
        const sStart = Number(s.salaryCycleStartDay || 1);
        const sEnd = (s.salaryCycleEndDay == null) ? (sStart === 1 ? 0 : (sStart - 1)) : Number(s.salaryCycleEndDay);

        const startDay = Number(s.otCycleStartDay || 21);
        const endDay = (s.otCycleEndDay == null) ? (startDay === 1 ? 0 : (startDay - 1)) : Number(s.otCycleEndDay);

        let preset = 'custom';
        if (s.otCycleMode === 'sameAsSalary' && (s.otPayMode || 'sameAsSalary') === 'sameAsSalary') preset = 'same';
        else if (startDay === 1 && endDay === 0 && (s.otPayType === 'end' || s.otPayType === 'eom')) preset = 'm1';
        else if (startDay === 21 && endDay === 20 && s.otPayType === 'eom') preset = 'd21_eom';
        else if (startDay === 21 && endDay === 20 && s.otPayType === 'fixed' && Number(s.otPayDay || 0) === 25) preset = 'd21_25';

        return selectField('OT: ตั้งค่ารวดเร็ว', [
          ['same', 'ตามเงินเดือน'],
          ['m1', 'ต้นเดือน → สิ้นเดือน • ออกสิ้นเดือน'],
          ['d21_eom', '21 → 20 • ออกสิ้นเดือน (เดือนที่จบรอบ)'],
          ['d21_25', '21 → 20 • ออกวันที่ 25 (เดือนที่จบรอบ)'],
          ['custom', 'กำหนดเอง (ดูช่องด้านล่าง)'],
        ], preset, v => {
          if (v === 'same') {
            s.otCycleMode = 'sameAsSalary';
            s.otPayMode = 'sameAsSalary';
          } else if (v === 'd21_eom') {
            s.otCycleMode = 'custom';
            s.otCycleStartDay = 21;
            s.otCycleEndDay = 20;
            s.otPayMode = 'custom';
            s.otPayType = 'eom';
            s.otPayDay = 0;
          } else if (v === 'd21_25') {
            s.otCycleMode = 'custom';
            s.otCycleStartDay = 21;
            s.otCycleEndDay = 20;
            s.otPayMode = 'custom';
            s.otPayType = 'fixed';
            s.otPayDay = 25;
          } else if (v === 'm1') {
            s.otCycleMode = 'custom';
            s.otCycleStartDay = 1;
            s.otCycleEndDay = 0;
            s.otPayMode = 'custom';
            s.otPayType = 'eom';
            s.otPayDay = 0;
          }
        });
      })(),

      el('div', { class:'hr' }),
      el('div', { class:'small' }, 'กำหนดเอง (ละเอียด) — ใช้ได้ทั้งเงินเดือนและ OT'),

      inline([
        numberField('เงินเดือน: วันเริ่มรอบ (1-28)', s.salaryCycleStartDay, v=>{ s.salaryCycleStartDay = Number(v||1); }),
        numberField('เงินเดือน: วันจบรอบ (0=สิ้นเดือน)', s.salaryCycleEndDay ?? 0, v=>{ s.salaryCycleEndDay = Number(v||0); }),
      ]),
      inline([
        selectField('เงินเดือน: วันจ่าย', [
          ['end','วันสุดท้ายของรอบ'],
          ['eom','สิ้นเดือนของเดือนที่จบรอบ'],
          ['fixed','วันที่กำหนด (เดือนที่จบรอบ)'],
        ], s.salaryPayType || 'end', v=>{ s.salaryPayType = v; }),
        numberField('เงินเดือน: จ่ายวันที่ (ใช้เมื่อ “fixed”)', s.salaryPayDay ?? 0, v=>{ s.salaryPayDay = Number(v||0); }),
      ]),

      el('div', { class:'hr' }),

      inline([
        selectField('OT: รอบตัด', [
          ['sameAsSalary','ตามเงินเดือน'],
          ['custom','กำหนดเอง'],
        ], s.otCycleMode || 'custom', v=>{ s.otCycleMode = v; }),
        selectField('OT: วันจ่าย', [
          ['sameAsSalary','ตามเงินเดือน'],
          ['custom','กำหนดเอง'],
        ], s.otPayMode || 'sameAsSalary', v=>{ s.otPayMode = v; }),
      ]),

      inline([
        numberField('OT: วันเริ่มรอบ', s.otCycleStartDay ?? 21, v=>{ s.otCycleMode = 'custom'; s.otCycleStartDay = Number(v||21); }),
        numberField('OT: วันจบรอบ (0=สิ้นเดือน)', s.otCycleEndDay ?? 20, v=>{ s.otCycleMode = 'custom'; s.otCycleEndDay = Number(v||20); }),
      ]),
      inline([
        selectField('OT: รูปแบบวันจ่าย', [
          ['end','วันสุดท้ายของรอบ'],
          ['eom','สิ้นเดือนของเดือนที่จบรอบ'],
          ['fixed','วันที่กำหนด (เดือนที่จบรอบ)'],
        ], s.otPayType || 'fixed', v=>{ s.otPayMode = 'custom'; s.otPayType = v; }),
        numberField('OT: จ่ายวันที่ (ใช้เมื่อ “fixed”)', s.otPayDay ?? 25, v=>{ s.otPayMode = 'custom'; s.otPayDay = Number(v||25); }),
      ]),

      el('div', { class:'notice ok' },
        'ทิป: ในแท็บ “สรุป”/“Export PDF/CSV” เลือกโหมดได้ว่าใช้ “เงินเดือน” หรือ “OT” เพื่อให้ช่วงวันที่ตรงกับรอบตัด ✅'
      )
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
    card('เทมเพลตกะ (สลับกะง่าย: เข้า/ออก/OT/พัก)', [
      el('div', { class:'small' }, 'ตั้งเวลาแยก “กะกลางวัน/กะดึก/กำหนดเอง” แล้วเวลาไปบันทึกรายวัน แค่เลือกกะ ระบบจะเติมให้เอง ✅'),
      shiftTemplateSection('กะกลางวัน', 'day', s),
      shiftTemplateSection('กะดึก/ข้ามวัน', 'night', s),
      shiftTemplateSection('กำหนดเอง', 'custom', s),
      el('div', { class:'small', style:'margin-top:8px;color:var(--muted);' }, 'ทิป: ถ้า “เลิกงาน/เลิก OT” น้อยกว่า “เริ่ม” ระบบจะถือว่าเป็น “ข้ามวัน” อัตโนมัติ'),
    ])
,
    card('เบี้ยเลี้ยง/ค่ากะ (อัตโนมัติ)', [
      checkboxField('ค่าอาหารอัตโนมัติ', s.mealAllowanceEnabled ?? true, v=>{ s.mealAllowanceEnabled = v; }),
      inline([
        numberField('ค่าอาหาร/วัน (ทำงาน)', s.mealAllowanceBase ?? 30, v=>{ s.mealAllowanceBase = Number(v||0); }),
        numberField('ถ้า OT เกิน (ชม.)', s.mealAllowanceOtThreshold ?? 2.5, v=>{ s.mealAllowanceOtThreshold = Number(v||0); }),
      ]),
      numberField('ค่าอาหาร/วัน (เมื่อ OT เกิน)', s.mealAllowanceOtAmount ?? 60, v=>{ s.mealAllowanceOtAmount = Number(v||0); }),

      el('div', { class:'hr' }),

      checkboxField('ค่ากะอัตโนมัติ', s.shiftAllowanceEnabled ?? true, v=>{ s.shiftAllowanceEnabled = v; }),
      inline([
        numberField('ค่ากะกลางวัน', (s.shiftAllowances?.day ?? 0), v=>{ s.shiftAllowances = { ...(s.shiftAllowances||{}), day: Number(v||0) }; }),
        numberField('ค่ากะดึก/ข้ามวัน', (s.shiftAllowances?.night ?? 100), v=>{ s.shiftAllowances = { ...(s.shiftAllowances||{}), night: Number(v||0) }; }),
      ]),
      numberField('ค่ากะแบบกำหนดเอง', (s.shiftAllowances?.custom ?? 0), v=>{ s.shiftAllowances = { ...(s.shiftAllowances||{}), custom: Number(v||0) }; }),

      el('div', { class:'small' }, 'คิดเฉพาะวันที่ “มาทำงาน” • ค่าอาหารจะเป็น “OT เกิน” เมื่อ OT สุทธิ > เกณฑ์ที่ตั้งไว้'),
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



function shiftTemplateSection(title, key, s){
  const t = s.shiftTemplates?.[key] || (s.shiftTemplates[key] = { workStart:'', workEnd:'', otStart:'', otEnd:'', breaks:[] });

  const box = el('div', { style:'border:1px dashed var(--border);border-radius:14px;padding:12px;margin-top:10px;background:rgba(255,255,255,0.02);' });

  box.append(
    el('div', { style:'font-weight:700;margin-bottom:8px;' }, `🕒 ${title}`),
    inline([
      timeField('เข้า', t.workStart || '', v=>{ t.workStart = v; }),
      timeField('ออก', t.workEnd || '', v=>{ t.workEnd = v; }),
    ]),
    inline([
      timeField('เริ่ม OT (ค่าเริ่มต้น)', t.otStart || '', v=>{ t.otStart = v; }),
      timeField('เลิก OT (ค่าเริ่มต้น)', t.otEnd || '', v=>{ t.otEnd = v; }),
    ]),
    breaksEditor('พักของกะนี้', t.breaks || [], v=>{ t.breaks = v; })
  );

  return box;
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

function row(label, children){
  return el('div', { class:'field' },
    el('label', {}, label),
    ...(Array.isArray(children) ? children : [children])
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
