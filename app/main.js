import { createStore } from './state/store.js';
import { el, qs, toast, fmtMoney } from './ui/dom.js';
import { openModal, confirmModal } from './ui/modal.js';
import { mountCalendarView } from './ui/calendar.js';
import { mountListView } from './ui/list.js';
import { mountSummaryView } from './ui/summary.js';
import { mountSettingsView } from './ui/settings.js';

import { computeComputed } from './lib/calc.js';
import { computeDayMoney } from './lib/money.js';
import { exportJSON, exportCSV, exportPDFReport } from './lib/export.js';
import { defaultMonthValue, monthRange, formatThaiDate, nowISO } from './lib/time.js';

const store = createStore();
store.load();

const root = qs('#app');

function header() {
  return el('div', { class:'topbar' },
    el('div', { class:'brand' },
      el('div', { class:'logo' }, '⏱️'),
      el('div', {},
        el('div', { class:'title' }, 'OT Tracker (Thai) — Static'),
        el('div', { class:'sub muted' }, 'รันบน GitHub Pages ได้ทันที (ไม่ต้อง build)')
      )
    ),
    el('div', { class:'row gap' },
      el('button', { class:'btn ghost', onclick:()=>openQuickAddToday() }, '＋ วันนี้'),
      el('button', { class:'btn ghost', onclick:()=>openExportModal() }, 'ส่งออก/นำเข้า')
    )
  );
}

const content = el('div', { class:'content' });

const nav = el('div', { class:'nav' },
  navBtn('calendar', '📅 ปฏิทิน'),
  navBtn('list', '📋 รายการ'),
  navBtn('summary', '📈 สรุป'),
  navBtn('settings', '⚙️ ตั้งค่า'),
);

function navBtn(key, label){
  return el('button', {
    class:'navBtn',
    type:'button',
    'data-key': key,
    onclick:()=>switchView(key)
  }, label);
}

root.appendChild(header());
root.appendChild(nav);
root.appendChild(content);

let current = { key:null, api:null };

function switchView(key){
  // set active button
  document.querySelectorAll('.navBtn').forEach(btn=>{
    btn.classList.toggle('active', btn.getAttribute('data-key') === key);
  });

  content.innerHTML = '';
  let api = null;

  if (key === 'calendar') api = mountCalendarView(content, store, openEditDate);
  if (key === 'list') api = mountListView(content, store, openEditDate);
  if (key === 'summary') api = mountSummaryView(content, store);
  if (key === 'settings') api = mountSettingsView(content, store);

  current = { key, api };
}

function refreshAll(){
  current?.api?.refresh?.();
}

function openQuickAddToday(){
  const today = new Date().toISOString().slice(0,10);
  openEditDate(today);
}

function openEditDate(date){
  const existing = store.getRecord(date);
  const s = store.state.settings || {};

  const rec = existing ? structuredClone(existing) : {
    date,
    attendance: 'present',
    dayType: s.defaultDayType || 'normal',
    shiftType: s.defaultShiftType || 'day',
    workStart: s.defaultWorkStart || '08:00',
    workEnd: s.defaultWorkEnd || '17:00',
    breaks: structuredClone(s.defaultBreaks || []),
    otStart: s.defaultOtStart || '17:00',
    otEnd: s.defaultOtEnd || '20:00',
    otMultiplierManualEnabled: false,
    otMultiplierManual: '',
    allowancesDay: 0,
    deductionsDay: 0,
    tags: [],
    note: '',
    createdAt: null,
    updatedAt: null,
  };

  const hideMoney = !!s.privacyHideMoney;

  // build form
  const attendance = select(['present','off','personal','sick'], rec.attendance);
  const dayType = select(['normal','holiday','special'], rec.dayType);

  const workStart = timeInput(rec.workStart);
  const workEnd = timeInput(rec.workEnd);
  const otStart = timeInput(rec.otStart);
  const otEnd = timeInput(rec.otEnd);

  const otManualOn = el('input', { type:'checkbox', checked: !!rec.otMultiplierManualEnabled });
  const otManual = el('input', { class:'input', type:'number', step:'0.1', min:'0', value: String(rec.otMultiplierManual ?? '') });

  const allowDay = el('input', { class:'input', type:'number', step:'1', min:'0', value: String(rec.allowancesDay ?? 0) });
  const dedDay = el('input', { class:'input', type:'number', step:'1', min:'0', value: String(rec.deductionsDay ?? 0) });

  const note = el('textarea', { class:'textarea', rows:'3' }, rec.note || '');

  const breaksBox = el('div', { class:'breaksBox' });
  function renderBreaks(){
    breaksBox.innerHTML = '';
    const br = Array.isArray(rec.breaks) ? rec.breaks : [];
    if (!br.length) breaksBox.appendChild(el('div', { class:'small muted' }, 'ไม่มีพัก'));
    br.forEach((b, idx)=>{
      const sI = timeInput(b.start || '');
      const eI = timeInput(b.end || '');
      sI.addEventListener('input', ()=>{ rec.breaks[idx].start = sI.value; updatePreview(); });
      eI.addEventListener('input', ()=>{ rec.breaks[idx].end = eI.value; updatePreview(); });
      breaksBox.appendChild(el('div', { class:'row gap' },
        el('div', { class:'field' }, el('label', {}, `พัก ${idx+1} เริ่ม`), sI),
        el('div', { class:'field' }, el('label', {}, `พัก ${idx+1} จบ`), eI),
        el('button', { class:'btn danger sm', type:'button', onclick:()=>{ rec.breaks.splice(idx,1); renderBreaks(); updatePreview(); } }, 'ลบ')
      ));
    });
  }

  const addBreakBtn = el('button', { class:'btn ghost sm', type:'button', onclick:()=>{ rec.breaks.push({ start:'', end:'' }); renderBreaks(); } }, '＋ เพิ่มพัก');

  const preview = el('div', { class:'notice ok' });

  function collectRecord(){
    return {
      ...rec,
      attendance: attendance.value,
      dayType: dayType.value,
      workStart: workStart.value || null,
      workEnd: workEnd.value || null,
      otStart: otStart.value || null,
      otEnd: otEnd.value || null,
      otMultiplierManualEnabled: !!otManualOn.checked,
      otMultiplierManual: otManual.value,
      allowancesDay: Number(allowDay.value||0),
      deductionsDay: Number(dedDay.value||0),
      note: note.value || '',
    };
  }

  function updateDisabled(){
    const att = attendance.value;
    const isOff = att === 'off';
    const isLeave = att === 'personal' || att === 'sick';
    for (const elx of [workStart, workEnd, otStart, otEnd, otManual, otManualOn]) {
      elx.disabled = isOff || isLeave;
    }
    // breaks disabled for leave/off (leave is computed by standardHoursPerDay)
    breaksBox.querySelectorAll('input').forEach(i=>i.disabled = isOff || isLeave);
    addBreakBtn.disabled = isOff || isLeave;
  }

  function updatePreview(){
    updateDisabled();
    const tmp = collectRecord();
    tmp.computed = computeComputed(tmp, store.state.settings);
    const money = computeDayMoney(tmp, store.state.settings);

    const attText = tmp.attendance === 'off' ? 'หยุด/ขาด' : (tmp.attendance === 'personal' ? 'ลากิจ' : (tmp.attendance === 'sick' ? 'ลาป่วย' : 'มาทำงาน'));
    const dtText = tmp.dayType === 'holiday' ? 'สองแรง' : (tmp.dayType === 'special' ? 'พิเศษ' : 'ปกติ');

    preview.innerHTML = `
      <div><b>${formatThaiDate(tmp.date)}</b> • ${attText} • ${dtText}</div>
      <div class="small">งาน ${money.workHours.toFixed(2)} ชม. | OT ${money.otHours.toFixed(2)} ชม.</div>
      <div class="small">ค่าแรง ${hideMoney ? '***' : money.normalPay.toFixed(2)} | OT ${hideMoney ? '***' : money.otPay.toFixed(2)} | รวม ${fmtMoney(money.grossDay, hideMoney)}</div>
    `;
  }

  function select(opts, value){
    const s = el('select', { class:'input' }, opts.map(o=>el('option', { value:o, selected:o===value }, o)));
    return s;
  }
  function timeInput(value){
    return el('input', { class:'input', type:'time', value: value ?? '' });
  }

  attendance.addEventListener('change', ()=>{ rec.attendance = attendance.value; updatePreview(); });
  dayType.addEventListener('change', ()=>{ rec.dayType = dayType.value; updatePreview(); });
  for (const i of [workStart, workEnd, otStart, otEnd, otManual, otManualOn, allowDay, dedDay]) {
    i.addEventListener('input', updatePreview);
    i.addEventListener('change', updatePreview);
  }
  note.addEventListener('input', ()=>{ /* no preview change needed */ });

  renderBreaks();
  updatePreview();

  const content = el('div', {},
    el('div', { class:'grid' },
      el('div', { class:'card' },
        el('div', { class:'hd' }, el('h2', {}, 'ข้อมูลวัน')),
        el('div', { class:'bd' },
          el('div', { class:'row gap' },
            el('div', { class:'field' }, el('label', {}, 'สถานะ'), attendance),
            el('div', { class:'field' }, el('label', {}, 'ประเภทวัน'), dayType),
          ),
          preview
        )
      ),
      el('div', { class:'card' },
        el('div', { class:'hd' }, el('h2', {}, 'เวลา')),
        el('div', { class:'bd' },
          el('div', { class:'row gap' },
            el('div', { class:'field' }, el('label', {}, 'เริ่มงาน'), workStart),
            el('div', { class:'field' }, el('label', {}, 'เลิกงาน'), workEnd),
          ),
          el('div', { class:'row gap' },
            el('div', { class:'field' }, el('label', {}, 'เริ่ม OT'), otStart),
            el('div', { class:'field' }, el('label', {}, 'จบ OT'), otEnd),
          ),
          el('div', { class:'hr' }),
          el('div', { class:'row between' },
            el('div', {},
              el('b', {}, 'ปรับตัวคูณ OT เอง'),
              el('div', { class:'small muted' }, 'ติ๊กแล้วใส่ค่า เช่น 2.0 / 3.0')
            ),
            otManualOn
          ),
          el('div', { class:'field' }, el('label', {}, 'ตัวคูณ OT (manual)'), otManual),
        )
      ),
    ),
    el('div', { class:'card mt' },
      el('div', { class:'hd' }, el('h2', {}, 'พัก / เพิ่ม / หัก')),
      el('div', { class:'bd' },
        el('div', {}, breaksBox, addBreakBtn),
        el('div', { class:'row gap mt' },
          el('div', { class:'field' }, el('label', {}, 'เพิ่ม (รายวัน)'), allowDay),
          el('div', { class:'field' }, el('label', {}, 'หัก (รายวัน)'), dedDay),
        ),
        el('div', { class:'field mt' }, el('label', {}, 'หมายเหตุ'), note),
      )
    ),
  );

  const actions = [
    el('button', { class:'btn ghost', type:'button', onclick:()=>modal.close() }, 'ยกเลิก'),
    existing ? el('button', { class:'btn danger', type:'button', onclick:async ()=>{
      const ok = await confirmModal({ title:'ลบรายการ', message:`ลบวันที่ ${formatThaiDate(date)} ?`, okText:'ลบ', danger:true });
      if (!ok) return;
      store.removeRecord(date);
      toast('ลบแล้ว 🗑️', 'warn');
      modal.close();
      refreshAll();
    } }, 'ลบ') : null,
    el('button', { class:'btn primary', type:'button', onclick:()=>{
      const saved = store.upsertRecord(collectRecord());
      toast('บันทึกแล้ว ✅');
      modal.close();
      refreshAll();
    } }, 'บันทึก'),
  ].filter(Boolean);

  const modal = openModal({
    title: existing ? `แก้ไข: ${formatThaiDate(date)}` : `เพิ่ม: ${formatThaiDate(date)}`,
    content,
    actions
  });
}

function openExportModal(){
  const s = store.state.settings || {};
  const hideMoney = !!s.privacyHideMoney;

  const month = el('input', { type:'month', class:'input', value: defaultMonthValue() });

  const hint = el('div', { class:'small muted' },
    '• Export JSON/CSV = ทั้งหมดในเครื่องเดย์\n',
    '• Report = เปิดหน้าพิมพ์ -> Save as PDF ได้เลย'
  );

  const content = el('div', {},
    el('div', { class:'field' }, el('label', {}, 'เดือนสำหรับรายงาน (Report)'), month),
    el('div', { class:'row gap mt' },
      el('button', { class:'btn primary', type:'button', onclick:()=>{
        exportJSON(store.state);
      }}, 'Export JSON'),
      el('button', { class:'btn primary', type:'button', onclick:()=>{
        exportCSV(store.state);
      }}, 'Export CSV'),
    ),
    el('div', { class:'row gap mt' },
      el('label', { class:'btn ghost', for:'importFile' }, 'Import JSON'),
      el('input', { id:'importFile', type:'file', accept:'application/json', style:'display:none', onchange: (e)=>importJSONFile(e) }),
      el('button', { class:'btn ghost', type:'button', onclick:()=>{ 
        const r = monthRange(month.value);
        exportPDFReport(store.state, { label:`เดือน ${month.value}`, ...r }, hideMoney ? 'timeOnly' : 'withMoney', null);
      }}, 'Report → Print/PDF'),
    ),
    el('div', { class:'hr mt' }),
    el('div', { class:'row between mt' },
      el('div', {}, el('b', {}, 'ล้างข้อมูลทั้งหมด'), el('div', { class:'small muted' }, 'ล้าง localStorage ในเครื่องนี้')),
      el('button', { class:'btn danger', type:'button', onclick: async ()=>{
        const ok = await confirmModal({ title:'ล้างข้อมูลทั้งหมด', message:'แน่ใจไหม? ข้อมูลในเครื่องนี้จะหายหมด', okText:'ล้าง', danger:true });
        if (!ok) return;
        store.clearAll();
        toast('ล้างแล้ว 🧹', 'warn');
        modal.close();
        refreshAll();
      }}, 'ล้าง')
    ),
    hint
  );

  async function importJSONFile(e){
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data || typeof data !== 'object') throw new Error('ไฟล์ไม่ถูกต้อง');
      store.replaceAll(data);
      toast('นำเข้าแล้ว ✅');
      modal.close();
      refreshAll();
    } catch (err) {
      console.error(err);
      toast('นำเข้าไม่สำเร็จ ❌', 'bad', 2200);
    } finally {
      e.target.value = '';
    }
  }

  const modal = openModal({
    title: 'ส่งออก / นำเข้า',
    content,
    actions: [ el('button', { class:'btn ghost', onclick:()=>modal.close() }, 'ปิด') ]
  });
}

// init
switchView('calendar');
