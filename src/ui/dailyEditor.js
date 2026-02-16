import { el, toast } from './dom.js';
import { formatThaiDate } from '../lib/time.js';
import { computeDayMoney, attendanceLabel } from '../lib/money.js';
import { computeComputed } from '../lib/calc.js';

export function buildDailyEditor(store, date, onDone) {
  const { state } = store;
  const s = state.settings;
  const existing = store.getRecord(date);

  const record = existing ? structuredClone(existing) : {
    date,
    shiftType: s.defaultShiftType,
    dayType: s.defaultDayType || 'normal',
    attendance: 'present',
    workStart: s.defaultWorkStart,
    workEnd: s.defaultWorkEnd,
    breaks: structuredClone(s.defaultBreaks || []),
    otStart: s.defaultOtStart,
    otEnd: s.defaultOtEnd,
    otMultiplierManualEnabled: false,
    otMultiplierManual: '',
    tags: [],
    note: '',
    allowancesDay: 0,
    deductionsDay: 0,
  };
  record.computed = computeComputed(record, s);
  record.attendance = record.attendance || 'present';

  const badge = el('div', { class:'badge' }, `วันที่: ${formatThaiDate(date)}`);

  const attendanceSel = selectField('สถานะวันนี้', [
    ['present','✅ มาทำงาน'],
    ['off','🛑 หยุด/ขาด (รายได้ 0)'],
    ['personal','📝 ลากิจ (รายได้ปกติ, OT 0)'],
    ['sick','🤒 ลาป่วย (รายได้ปกติ, OT 0)'],
  ], record.attendance, v=>{ record.attendance = v; recompute(); toggleSections(); updatePreview(); });

  const dayTypeSel = selectField('ประเภทวัน', [
    ['normal','ปกติ'],
    ['holiday','วันหยุด/สองแรง'],
    ['special','พิเศษ (เช่น 3 เท่า)'],
  ], record.dayType, v=>{ record.dayType = v; updatePreview(); });

  const shiftSel = selectField('กะ', [
    ['day','กะกลางวัน'],
    ['night','กะดึก/ข้ามวัน'],
    ['custom','กำหนดเอง'],
  ], record.shiftType, v=>{ record.shiftType = v; });

  const workTimes = inline([
    timeField('เริ่มงาน', record.workStart, v=>{ record.workStart=v; recompute(); }),
    timeField('เลิกงาน', record.workEnd, v=>{ record.workEnd=v; recompute(); }),
  ]);
  const otTimes = inline([
    timeField('เริ่ม OT', record.otStart, v=>{ record.otStart=v; recompute(); }),
    timeField('เลิก OT', record.otEnd, v=>{ record.otEnd=v; recompute(); }),
  ]);

  // breaks
  const breaksList = el('div', { class:'list' });
  function renderBreaks(){
    breaksList.innerHTML = '';
    (record.breaks || []).forEach((b, idx) => {
      const row = el('div', { class:'item' });
      row.append(
        inline([
          timeField('เริ่มพัก', b.start, v=>{ b.start=v; recompute(); }),
          timeField('เลิกพัก', b.end, v=>{ b.end=v; recompute(); }),
        ]),
        el('div', { class:'btns' },
          el('button', { class:'btn bad', type:'button', onClick: ()=>{ record.breaks.splice(idx,1); renderBreaks(); recompute(); }}, 'ลบช่วงพัก')
        )
      );
      breaksList.append(row);
    });
    if (!record.breaks?.length) breaksList.append(el('div', { class:'small' }, 'ยังไม่มีช่วงพัก'));
  }
  const breaksWrap = el('div', { class:'field' },
    el('label', {}, 'พัก (ระบบจะหักเฉพาะช่วงที่ทับซ้อนกับงาน/OT)'),
    breaksList,
    el('button', { class:'btn', type:'button', onClick: ()=>{ record.breaks.push({start:'',end:''}); renderBreaks(); recompute(); }}, '➕ เพิ่มช่วงพัก')
  );

  const manualToggle = el('label', { class:'btn', style:'justify-content:flex-start;gap:10px;' },
    el('input', { type:'checkbox', checked: record.otMultiplierManualEnabled ? 'checked' : null,
      onChange:(e)=>{ record.otMultiplierManualEnabled = e.target.checked; manualInput.disabled = !record.otMultiplierManualEnabled; updatePreview(); }
    }),
    'กำหนดตัวคูณ OT เอง'
  );
  const manualInput = el('input', { type:'number', step:'0.5', min:'0', value: record.otMultiplierManual || '',
    placeholder:'เช่น 1.5 / 2 / 3',
    disabled: record.otMultiplierManualEnabled ? null : 'disabled',
    onInput:(e)=>{ record.otMultiplierManual = e.target.value; updatePreview(); }
  });
  const manualWrap = el('div', { class:'field' },
    el('label', {}, 'ตัวคูณ OT'),
    el('div', { class:'inline' }, manualToggle, manualInput)
  );

  const moneyAdj = inline([
    numberField('เพิ่มรายวัน (บาท)', record.allowancesDay, v=>{ record.allowancesDay = Number(v||0); updatePreview(); }),
    numberField('หักรายวัน (บาท)', record.deductionsDay, v=>{ record.deductionsDay = Number(v||0); updatePreview(); }),
  ]);

  const timeWrap = el('div', {}, workTimes, otTimes, breaksWrap, manualWrap);

  function toggleSections(){
    const att = record.attendance || 'present';
    const isPresent = att === 'present';
    const isOff = att === 'off';
    // For leave/off: hide time + OT inputs
    timeWrap.style.display = isPresent ? '' : 'none';
    // For off: disable daily adjustments (รายได้ต้อง 0)
    moneyAdj.querySelectorAll('input').forEach(inp => inp.disabled = isOff);
    if (isOff) { record.allowancesDay = 0; record.deductionsDay = 0; }
  }

  toggleSections();

  const tags = tagPicker(record);
  const note = el('div', { class:'field' },
    el('label', {}, 'หมายเหตุ'),
    el('textarea', { placeholder:'เช่น OT เร่งด่วน / งานพิเศษ', value: record.note || '',
      onInput:(e)=>{ record.note = e.target.value; }
    })
  );

  const preview = el('div', { class:'notice ok' });
  function recompute(){
    record.attendance = record.attendance || 'present';
    record.computed = computeComputed(record, s);
    toggleSections();
    updatePreview();
  }
  function updatePreview(){
    preview.innerHTML = (() => {
    const att = record.attendance || 'present';
    const hideMoney = !!state.settings?.privacyHideMoney;
    const m = computeDayMoney(record, state.settings);
    const line1 = `<div><b>สรุปวันนี้</b></div>`;
    const line2 = `<div class="small">สถานะ: <b>${attendanceLabel(att)}</b> • งานสุทธิ: <b>${record.computed.workHoursNet.toFixed(2)}</b> ชม. • OT สุทธิ: <b>${record.computed.otHoursNet.toFixed(2)}</b> ชม. • รวม: <b>${record.computed.totalHoursNet.toFixed(2)}</b> ชม.</div>`;
    if (hideMoney) {
      return line1 + line2 + `<div class="small">🙈 ซ่อนเงิน (เปิดในตั้งค่า)</div>`;
    }
    const line3 = `<div class="small">เรท/ชม.: <b>${m.rates.hourlyRate.toFixed(2)}</b> • เงินงาน: <b>${m.normalPay.toFixed(2)}</b> • เงิน OT: <b>${m.otPay.toFixed(2)}</b></div>`;
    const line4 = `<div class="small">เพิ่ม: <b>${m.allowancesDay.toFixed(2)}</b> • หัก: <b>${m.deductionsDay.toFixed(2)}</b> • รวมสุทธิวันนี้: <b>${m.grossDay.toFixed(2)}</b> บาท</div>`;
    return line1 + line2 + line3 + line4;
  })();
  }

  renderBreaks();
  updatePreview();

  const applyDefaultsBtn = el('button', { class:'btn', type:'button', onClick: ()=>{
    record.shiftType = s.defaultShiftType;
    record.dayType = s.defaultDayType || 'normal';
    record.workStart = s.defaultWorkStart;
    record.workEnd = s.defaultWorkEnd;
    record.otStart = s.defaultOtStart;
    record.otEnd = s.defaultOtEnd;
    record.breaks = structuredClone(s.defaultBreaks || []);
    renderBreaks();
    recompute();
    toast('ใช้ค่าเริ่มต้นจากตั้งค่าแล้ว ✅');
  }}, '↺ ใช้ค่าเริ่มต้นจากตั้งค่า');

  const applyBreaksBtn = el('button', { class:'btn', type:'button', onClick: ()=>{
    record.breaks = structuredClone(s.defaultBreaks || []);
    renderBreaks();
    recompute();
    toast('ใช้ “พักเริ่มต้น” จากตั้งค่าแล้ว ✅');
  }}, '↺ ใช้พักเริ่มต้น');

  const body = el('div', {},
    badge,
    el('div', { class:'hr' }),
    el('div', { class:'inline' }, attendanceSel, dayTypeSel),
    el('div', { class:'actions' }, applyDefaultsBtn, applyBreaksBtn),
    el('div', { class:'inline' }, shiftSel),
    timeWrap,
    moneyAdj,
    tags,
    note,
    preview
  );

  const btnDel = el('button', { class:'btn bad', type:'button', onClick: async ()=>{
    if (!confirm('ลบข้อมูลของวันนี้?')) return;
    await store.removeRecord(date);
    toast('ลบแล้ว 🗑️');
    onDone?.();
  }}, '🗑️ ลบวัน');

  const btnSave = el('button', { class:'btn good', type:'button', onClick: async ()=>{
    try{
      await store.upsertRecord(record);
      toast('บันทึกแล้ว ✅');
      onDone?.();
    }catch(e){
      console.error(e);
      toast('บันทึกไม่สำเร็จ: ' + (e?.message||e), 'danger', 3200);
    }
  }}, '💾 บันทึก');

  return { body, footerButtons: [btnDel, btnSave], subtitle: 'คำนวณชั่วโมงสุทธิ + เงินจากฐานเงินเดือน' };
}

function inline(children){ return el('div', { class:'inline' }, children); }

function selectField(label, options, value, onChange){
  const sel = el('select', { onChange:(e)=>onChange?.(e.target.value) });
  for (const [v,t] of options) sel.append(el('option', { value:v, selected: v===value ? 'selected' : null }, t));
  return el('div', { class:'field' }, el('label', {}, label), sel);
}
function timeField(label, value, onChange){
  return el('div', { class:'field' }, el('label', {}, label),
    el('input', { type:'time', value: value || '', onInput:(e)=>onChange?.(e.target.value) })
  );
}
function numberField(label, value, onChange){
  return el('div', { class:'field' }, el('label', {}, label),
    el('input', { type:'number', step:'0.01', value: value ?? 0, onInput:(e)=>onChange?.(e.target.value) })
  );
}
function tagPicker(record){
  const tags = ['สองแรง','วันหยุด','กะดึก','เร่งด่วน','ลาป่วย','ลากิจ'];
  const set = new Set(record.tags || []);
  const wrap = el('div', { class:'field' }, el('label', {}, 'แท็ก'));
  const grid = el('div', { class:'actions' });

  function redraw(){
    grid.innerHTML = '';
    for (const t of tags){
      const active = set.has(t);
      grid.append(el('button', { type:'button', class:'btn ' + (active?'primary':''), onClick:()=>{
        if (set.has(t)) set.delete(t); else set.add(t);
        record.tags = Array.from(set);
        redraw();
      }}, active ? `✅ ${t}` : t));
    }
  }
  redraw();
  wrap.append(grid);
  return wrap;
}
