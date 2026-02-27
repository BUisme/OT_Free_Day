import { el, toast } from './dom.js';
import { formatThaiDate } from '../lib/time.js';
import { computeDayMoney, attendanceLabel } from '../lib/money.js';
import { computeComputed } from '../lib/calc.js';

function getShiftTemplate(settings, shiftType) {
  const t = settings?.shiftTemplates?.[shiftType] || null;
  const fallback = {
    workStart: settings?.defaultWorkStart ?? '',
    workEnd: settings?.defaultWorkEnd ?? '',
    otStart: settings?.defaultOtStart ?? '',
    otEnd: settings?.defaultOtEnd ?? '',
    breaks: structuredClone(settings?.defaultBreaks || []),
  };
  if (!t) return fallback;
  return {
    workStart: t.workStart ?? fallback.workStart,
    workEnd: t.workEnd ?? fallback.workEnd,
    otStart: t.otStart ?? fallback.otStart,
    otEnd: t.otEnd ?? fallback.otEnd,
    breaks: Array.isArray(t.breaks) ? structuredClone(t.breaks) : structuredClone(fallback.breaks),
  };
}

function addMinutesToTimeStr(hhmm, minutesToAdd) {
  if (!hhmm) return '';
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return hhmm;
  let h = Number(m[1]), mm = Number(m[2]);
  let total = h * 60 + mm + Math.round(Number(minutesToAdd) || 0);
  total = ((total % (24*60)) + (24*60)) % (24*60);
  const hh = String(Math.floor(total / 60)).padStart(2,'0');
  const mn = String(total % 60).padStart(2,'0');
  return `${hh}:${mn}`;
}

export function buildDailyEditor(store, date, onDone) {
  const { state } = store;
  const s = state.settings;
  const existing = store.getRecord(date);

  // ใช้เทมเพลตกะเป็นค่าเริ่มต้นหลัก (กัน “ตั้งค่า” กับ “เทมเพลตกะ” ไม่ตรงกัน)
  const tmpl0 = getShiftTemplate(s, existing?.shiftType || s.defaultShiftType);

  const record = existing ? structuredClone(existing) : {
    date,
    shiftType: s.defaultShiftType,
    dayType: s.defaultDayType || 'normal',
    attendance: 'present',
    workStart: tmpl0.workStart,
    workEnd: tmpl0.workEnd,
    breaks: structuredClone(tmpl0.breaks || []),
    otStart: tmpl0.otStart,
    otEnd: tmpl0.otEnd,
    otMultiplierManualEnabled: false,
    otMultiplierManual: '',
    tags: [],
    note: '',
    allowancesDay: 0,
    deductionsDay: 0,

    // optional: override ค่ากะรายวัน (ถ้าเว้นว่าง จะใช้จากตั้งค่าอัตโนมัติ)
    shiftAllowanceOverride: (existing?.shiftAllowanceOverride ?? ''),
  };

  record.attendance = record.attendance || 'present';
  record.computed = computeComputed(record, s);

  const badge = el('div', { class:'badge' }, `วันที่: ${formatThaiDate(date)}`);

  // ===== fields =====
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

  // time inputs with refs (เพื่ออัปเดตค่าอัตโนมัติได้)
  const workStartF = timeFieldRef('เริ่มงาน', record.workStart, v=>{ record.workStart=v; recompute(); });
  const workEndF   = timeFieldRef('เลิกงาน', record.workEnd, v=>{ record.workEnd=v; recompute(); });
  const otStartF   = timeFieldRef('เริ่ม OT', record.otStart, v=>{ record.otStart=v; recompute(); });
  const otEndF     = timeFieldRef('เลิก OT', record.otEnd, v=>{ record.otEnd=v; recompute(); });

  const shiftSel = selectField('กะ', [
    ['day','กะกลางวัน'],
    ['night','กะดึก/ข้ามวัน'],
    ['custom','กำหนดเอง'],
  ], record.shiftType, v=>{
    record.shiftType = v;
    applyShiftTemplate(v, true);
  });

  const workTimes = inline([workStartF.wrap, workEndF.wrap]);
  const otTimes = inline([otStartF.wrap, otEndF.wrap]);

  // OT quick buttons
  const otQuick = el('div', { class:'actions' },
    el('div', { class:'small', style:'margin-right:auto;opacity:.85' }, 'ปุ่มลัด OT'),
    ...[
      ['ปิด OT', 0],
      ['OT 1 ชม.', 1],
      ['OT 2 ชม.', 2],
      ['OT 2.5 ชม.', 2.5],
      ['OT 3 ชม.', 3],
    ].map(([label, h]) => el('button', { class:'btn', type:'button', onClick: ()=>{
      if (!record.workEnd) { toast('ต้องมี “เลิกงาน” ก่อน 😅', 'danger'); return; }
      if (h === 0) {
        record.otStart = '';
        record.otEnd = '';
        otStartF.input.value = '';
        otEndF.input.value = '';
        recompute();
        return;
      }
      // ✅ ปุ่มลัด OT ให้ยึด “เริ่ม OT” (ถ้าตั้งไว้แล้ว) ก่อน
      // - ถ้าว่าง ให้ใช้ค่าเริ่มต้นจากเทมเพลตกะ
      // - ถ้ายังว่าง ให้ fallback = เลิกงาน
      const tmpl = getShiftTemplate(s, record.shiftType);
      const cur = (record.otStart || '').trim();
      const workEnd = (record.workEnd || '').trim();

      // ถ้าเคยใช้ปุ่มลัดแบบเดิม (มันจะบังคับ otStart = workEnd)
      // แต่ผู้ใช้ตั้งค่าเทมเพลต otStart ใหม่ (เช่น 17:30) → ให้ยึดเทมเพลตแทน
      let st = cur;
      if (!st) st = (tmpl.otStart || '').trim();
      if (st && workEnd && st === workEnd && (tmpl.otStart || '').trim() && (tmpl.otStart || '').trim() !== st) {
        st = (tmpl.otStart || '').trim();
      }
      if (!st) st = workEnd;

      record.otStart = st;
      record.otEnd = addMinutesToTimeStr(st, Number(h)*60);
      otStartF.input.value = record.otStart || '';
      otEndF.input.value = record.otEnd || '';
      recompute();
    }}, label))
  );

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

  // ค่ากะ override (optional)
  const shiftAllowOverride = numberFieldNullable(
    'ค่ากะวันนี้ (Override, เว้นว่าง=อัตโนมัติ)',
    record.shiftAllowanceOverride ?? '',
    v=>{
      record.shiftAllowanceOverride = v;
      updatePreview();
    }
  );

  const moneyAdj = el('div', {},
    inline([
      numberField('เพิ่มเองรายวัน (บาท)', record.allowancesDay, v=>{ record.allowancesDay = Number(v||0); updatePreview(); }),
      numberField('หักรายวัน (บาท)', record.deductionsDay, v=>{ record.deductionsDay = Number(v||0); updatePreview(); }),
    ]),
    shiftAllowOverride
  );

  const timeWrap = el('div', {}, workTimes, otTimes, otQuick, breaksWrap, manualWrap);

  function toggleSections(){
    const att = record.attendance || 'present';
    const isPresent = att === 'present';
    const isOff = att === 'off';
    timeWrap.style.display = isPresent ? '' : 'none';
    moneyAdj.querySelectorAll('input').forEach(inp => inp.disabled = isOff);
    if (isOff) {
      record.allowancesDay = 0;
      record.deductionsDay = 0;
      record.shiftAllowanceOverride = '';
    }
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

      const parts = [];
      if (state.settings?.mealAllowanceEnabled) parts.push(`อาหาร ${m.allowancesMeal.toFixed(2)}`);
      if (state.settings?.shiftAllowanceEnabled) parts.push(`ค่ากะ ${m.allowancesShift.toFixed(2)}`);
      parts.push(`เพิ่มเอง ${m.allowancesManual.toFixed(2)}`);
      const detail = parts.join(' + ');

      const line3 = `<div class="small">เรท/ชม.: <b>${m.rates.hourlyRate.toFixed(2)}</b> • เงินงาน: <b>${m.normalPay.toFixed(2)}</b> • เงิน OT: <b>${m.otPay.toFixed(2)}</b></div>`;
      const line4 = `<div class="small">เพิ่ม: <b>${m.allowancesDay.toFixed(2)}</b> <span class="small">(${detail})</span> • หัก: <b>${m.deductionsDay.toFixed(2)}</b> • รวมสุทธิวันนี้: <b>${m.grossDay.toFixed(2)}</b> บาท</div>`;
      return line1 + line2 + line3 + line4;
    })();
  }

  function applyShiftTemplate(shiftType, showToast=false){
    const tmpl = getShiftTemplate(s, shiftType);
    record.workStart = tmpl.workStart ?? '';
    record.workEnd = tmpl.workEnd ?? '';
    record.otStart = tmpl.otStart ?? '';
    record.otEnd = tmpl.otEnd ?? '';
    record.breaks = structuredClone(tmpl.breaks || []);
    // update inputs
    workStartF.input.value = record.workStart || '';
    workEndF.input.value = record.workEnd || '';
    otStartF.input.value = record.otStart || '';
    otEndF.input.value = record.otEnd || '';
    renderBreaks();
    recompute();
    if (showToast) toast('เติมเวลา/พักตามกะแล้ว ✅');
  }

  renderBreaks();
  updatePreview();

  const applyDefaultsBtn = el('button', { class:'btn', type:'button', onClick: ()=>{
    record.shiftType = s.defaultShiftType;
    shiftSel.querySelector('select').value = record.shiftType;
    record.dayType = s.defaultDayType || 'normal';
    // ใช้ “เทมเพลตกะเริ่มต้น” เป็นค่าเริ่มต้น (แก้ปัญหาไม่ตรงกัน)
    applyShiftTemplate(record.shiftType, false);
    toast('ใช้ค่าเริ่มต้นจากตั้งค่าแล้ว ✅');
  }}, '↺ ใช้ค่าเริ่มต้นจากตั้งค่า');

  const applyBreaksBtn = el('button', { class:'btn', type:'button', onClick: ()=>{
    record.breaks = structuredClone(s.defaultBreaks || []);
    renderBreaks();
    recompute();
    toast('ใช้ “พักเริ่มต้น” จากตั้งค่าแล้ว ✅');
  }}, '↺ ใช้พักเริ่มต้น');

  const applyShiftBtn = el('button', { class:'btn', type:'button', onClick: ()=>{
    applyShiftTemplate(record.shiftType, true);
  }}, '⚡ ใช้เทมเพลตกะนี้');

  const body = el('div', {},
    badge,
    el('div', { class:'hr' }),
    el('div', { class:'inline' }, attendanceSel, dayTypeSel),
    el('div', { class:'actions' }, applyDefaultsBtn, applyBreaksBtn, applyShiftBtn),
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

function timeFieldRef(label, value, onChange){
  const input = el('input', { type:'time', value: value || '', onInput:(e)=>onChange?.(e.target.value) });
  const wrap = el('div', { class:'field' }, el('label', {}, label), input);
  return { wrap, input };
}

function numberField(label, value, onChange){
  return el('div', { class:'field' }, el('label', {}, label),
    el('input', { type:'number', step:'0.01', value: value ?? 0, onInput:(e)=>onChange?.(e.target.value) })
  );
}

function numberFieldNullable(label, value, onChange){
  const input = el('input', { type:'number', step:'0.01', value: (value ?? '') === '' ? '' : String(value),
    placeholder:'เว้นว่าง = ใช้อัตโนมัติ',
    onInput:(e)=>onChange?.(e.target.value)
  });
  return el('div', { class:'field' }, el('label', {}, label), input);
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
