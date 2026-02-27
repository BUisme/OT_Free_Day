import { createStore } from './state/store.js';
import { el, clear, toast } from './ui/dom.js';
import { createModal } from './ui/modal.js';
import { buildDailyEditor } from './ui/dailyEditor.js';
import { buildSettingsView } from './ui/settings.js';
import { buildSummaryView } from './ui/summary.js';
import { buildListView } from './ui/listView.js';
import { mountCalendar } from './ui/calendar.js';
import { defaultMonthValue, monthRange, cycleRangeByAnchor, payDateFromRange, formatThaiDate, prevDate } from './lib/time.js';
import { exportJSON, importJSONFile, exportCSV, exportPDFReport } from './lib/export.js';

const app = document.querySelector('#app');
const appMain = document.createElement('div');
appMain.id = 'appMain';
const printRoot = document.createElement('div');
printRoot.id = 'printRoot';

// Mount once
app.innerHTML = '';
app.append(appMain, printRoot);

function showPrintPreview(payload) {
  // payload: { title, html }
  document.body.classList.add('print-preview');
  // Provide a way for inline report to close itself
  window.__ot_closePrintPreview = hidePrintPreview;
  printRoot.innerHTML = payload?.html || '';
  // Ensure user sees the top actions
  window.scrollTo(0, 0);
}

function hidePrintPreview() {
  document.body.classList.remove('print-preview');
  printRoot.innerHTML = '';
  try { delete window.__ot_closePrintPreview; } catch {}
}

const store = createStore();
const modal = createModal();

const TABS = [
  { key: 'calendar', label: '🗓️ ปฏิทิน' },
  { key: 'summary', label: '📊 สรุป' },
  { key: 'list', label: '📋 รายการ' },
  { key: 'settings', label: '⚙️ ตั้งค่า' },
];

let activeTab = 'calendar';
let selectedMonth = defaultMonthValue(); // YYYY-MM
let activePeriod = 'salary'; // salary | ot (ใช้กับสรุป/Export)
let calendarHandle = null;

(async () => {
  try {
    await store.load();
  } catch (e) {
    console.error('store.load failed', e);
  }
  render();
})();

function render() {
  clear(appMain);
  const container = el('div', { class:'container' });

  const topbar = el('div', { class:'topbar' },
    el('div', { class:'brand' },
      el('h1', {}, 'OT Tracker (Thai) — Full'),
      el('div', { class:'sub' }, 'คำนวณชั่วโมงสุทธิ + มา/หยุด/ลากิจ/ลาป่วย + ฐานเงินเดือน (÷30) + Export JSON/CSV/PDF')
    ),
    el('div', { class:'badge' }, store.state.lastSavedAt ? `อัปเดตล่าสุด: ${store.state.lastSavedAt}` : 'พร้อมใช้งาน ✅')
  );

  const tabs = el('div', { class:'pills', role:'tablist' }, 
    TABS.map(t => el('button', {
      class:'pill',
      role:'tab',
      'aria-selected': t.key === activeTab ? 'true' : 'false',
      type:'button',
      onClick: ()=>{ activeTab=t.key; render(); }
    }, t.label))
  );

  const rangeBar = buildRangeBar();

  const left = el('div', { class:'card' },
    el('div', { class:'hd' }, el('h2', {}, headerTitle())),
    el('div', { class:'bd' }, buildMainPane())
  );

  const right = el('div', { class:'card' },
    el('div', { class:'hd' }, el('h2', {}, 'คำสั่งเร็ว')),
    el('div', { class:'bd' }, buildActions())
  );

  const grid = el('div', { class:'grid' }, left, right);

  container.append(topbar, tabs, rangeBar, grid);
  appMain.append(container);
}

function headerTitle() {
  if (activeTab === 'calendar') return 'ปฏิทิน (แตะวันที่เพื่อบันทึก)';
  if (activeTab === 'summary') return `สรุป (${activePeriod === 'ot' ? 'รอบ OT' : 'รอบเงินเดือน'})`;
  if (activeTab === 'list') return `รายการรายวัน (${activePeriod === 'ot' ? 'รอบ OT' : 'รอบเงินเดือน'})`;
  return 'ตั้งค่า';
}

function buildRangeBar() {
  const range = currentRange();
  const rangeLabel = `${formatThaiDate(range.dateFrom)} – ${formatThaiDate(prevDate(range.dateToExclusive))}`;
  const payLabel = range.payDate ? ` • วันจ่าย: ${formatThaiDate(range.payDate)}` : '';

  const monthInput = el('input', {
    type:'month',
    value: selectedMonth,
    onInput: (e)=>{ selectedMonth = e.target.value || selectedMonth; render(); }
  });

  const modeSelect = el('select', {
    onChange: (e)=>{ activePeriod = e.target.value; render(); }
  },
    el('option', { value:'salary', selected: activePeriod==='salary' ? 'selected' : null }, '💼 เงินเดือน'),
    el('option', { value:'ot', selected: activePeriod==='ot' ? 'selected' : null }, '⚡ OT')
  );

  return el('div', { class:'card', style:'margin-bottom:12px;' },
    el('div', { class:'hd' },
      el('h2', {}, 'ช่วงรอบ'),
      el('span', { class:'badge' }, `${rangeLabel}${payLabel}`)
    ),
    el('div', { class:'bd' },
      el('div', { class:'inline' },
        el('div', { class:'field' }, el('label', {}, 'เลือกเดือน (เดือนจ่าย/เดือนจบรอบ)'), monthInput),
        el('div', { class:'field' }, el('label', {}, 'โหมดสรุป/Export'), modeSelect),
        el('div', { class:'field' },
          el('label', {}, 'หมายเหตุ'),
          el('div', { class:'small' }, 'Export PDF/CSV จะใช้ “ช่วงรอบ” และ “โหมด” นี้ • ตัวอย่าง: อยากได้ 21/01→20/02 ให้เลือกเดือน = กุมภาพันธ์ (เดือนจ่าย/เดือนจบรอบ)')
        )
      )
    )
  );
}

function currentRange() {
  const settings = store?.state?.settings || {};
  const cycleAnchor = (settings.cycleMonthAnchor || 'end');

  const salaryStart = Number(settings.salaryCycleStartDay || 1);
  const salaryEnd = (settings.salaryCycleEndDay == null)
    ? (salaryStart === 1 ? 0 : (salaryStart - 1))
    : Number(settings.salaryCycleEndDay);

  const salaryRange = cycleRangeByAnchor(selectedMonth, salaryStart, salaryEnd, cycleAnchor);
  const salaryPay = payDateFromRange(salaryRange, settings.salaryPayType || 'end', Number(settings.salaryPayDay || 0));

  const otStart = ((settings.otCycleMode || 'custom') === 'sameAsSalary')
    ? salaryStart
    : Number(settings.otCycleStartDay || 21);

  const otEnd = ((settings.otCycleMode || 'custom') === 'sameAsSalary')
    ? salaryEnd
    : (settings.otCycleEndDay == null ? (otStart === 1 ? 0 : (otStart - 1)) : Number(settings.otCycleEndDay));

  const otRange = cycleRangeByAnchor(selectedMonth, otStart, otEnd, cycleAnchor);

  const otPay = ((settings.otPayMode || 'sameAsSalary') === 'sameAsSalary')
    ? salaryPay
    : payDateFromRange(otRange, settings.otPayType || 'fixed', Number(settings.otPayDay || 25));

  function endLabel(ed){ return (ed === 0) ? 'สิ้นเดือน' : String(ed); }

  if (activePeriod === 'ot') {
    const label = `OT (เดือนจ่าย) ${selectedMonth} (${otStart}→${endLabel(otEnd)})`;
    return { ...otRange, label, kind:'ot', payDate: otPay, monthValue: selectedMonth };
  }

  const label = `เงินเดือน (เดือนจ่าย) ${selectedMonth} (${salaryStart}→${endLabel(salaryEnd)})`;
  return { ...salaryRange, label, kind:'salary', payDate: salaryPay, monthValue: selectedMonth };
}

function buildMainPane() {
  const range = currentRange();

  if (activeTab === 'calendar') {
    const wrap = el('div', {});
    const calDiv = el('div', { id:'calendar' });
    wrap.append(calDiv);

    // mount calendar after node in DOM
    setTimeout(() => {
      calendarHandle = mountCalendar(calDiv, store, (dateStr)=>openEditor(dateStr), selectedMonth);
    }, 0);

    return wrap;
  }

  if (activeTab === 'summary') {
    return buildSummaryView(store, range);
  }

  if (activeTab === 'list') {
    return buildListView(store, range, (dateStr)=>openEditor(dateStr));
  }

  // settings
  const { body, footer } = buildSettingsView(store);
  return el('div', {}, body, el('div', { class:'hr' }), footer);
}

function buildActions() {
  const range = currentRange();

  const btnToday = el('button', { class:'btn primary', type:'button', onClick: ()=> {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const dd = String(d.getDate()).padStart(2,'0');
    openEditor(`${y}-${m}-${dd}`);
  }}, '➕ บันทึกวันนี้');

  const btnExportJSON = el('button', { class:'btn', type:'button', onClick: ()=>exportJSON(store.state) }, '📦 Export JSON');
  const fileIn = el('input', { type:'file', accept:'application/json', style:'display:none' });
  const btnImportJSON = el('button', { class:'btn', type:'button', onClick: ()=>fileIn.click() }, '📥 Import JSON');
  fileIn.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await importJSONFile(file);
      // apply
      if (data.settings) await store.saveSettings({ ...store.state.settings, ...data.settings });
      if (Array.isArray(data.records)) {
        for (const r of data.records) {
          if (!r?.date) continue;
          await store.upsertRecord(r);
        }
      }
      toast('นำเข้าข้อมูลแล้ว ✅');
      if (calendarHandle) calendarHandle.refresh();
      render();
    } catch (err) {
      console.error(err);
      toast('Import ไม่สำเร็จ: ' + (err?.message || err), 'danger', 3200);
    } finally {
      fileIn.value = '';
    }
  });

  const btnExportCSV = el('button', { class:'btn', type:'button', onClick: ()=>exportCSV(store.state, range) }, '📄 Export CSV');
  const btnPDF = el('button', { class:'btn', type:'button', onClick: ()=>{
    try{
      const hideMoney = !!store.state.settings?.privacyHideMoney;
      let mode = 'withMoney';
      if (hideMoney) mode = 'timeOnly';
      else {
        const ok = confirm('ต้องการพิมพ์ PDF แบบ “รวมยอดเงิน” ไหม?\n\nกด OK = รวมยอดเงิน\nกด Cancel = เฉพาะวันเวลา');
        mode = ok ? 'withMoney' : 'timeOnly';
      }
      exportPDFReport(store.state, range, mode, showPrintPreview);
    }
    catch(e){ toast('Export PDF ไม่สำเร็จ: ' + (e?.message||e), 'danger', 3200); }
  }}, '🧾 Export PDF');

  const btnBackupTip = el('div', { class:'notice' },
    'ทิป: เก็บข้อมูลยาวๆ ให้ปลอดภัย → Export JSON ไว้เรื่อยๆ (เช่น ทุกสิ้นเดือน) ✅'
  );

  return el('div', {},
    el('div', { class:'actions' }, btnToday, btnPDF, btnExportJSON, btnImportJSON, btnExportCSV, el('button',{class:'btn small',type:'button',onClick:()=>location.reload()},'รีเฟรช')),
    fileIn,
    el('div', { class:'hr' }),
    btnBackupTip,
    el('div', { class:'small' }, 'PDF ใช้โหมดพิมพ์ (Print) เพื่อให้ภาษาไทยขึ้นชัวร์บนมือถือ')
  );
}

function openEditor(dateStr) {
  const { body, footerButtons, subtitle } = buildDailyEditor(store, dateStr, async ()=>{
    modal.close();
    if (calendarHandle) calendarHandle.refresh();
    // re-render to update summary/list quickly
    render();
  });
  modal.open({
    heading: `บันทึกวัน: ${formatThaiDate(dateStr)}`,
    subtitle,
    body,
    footerButtons
  });
}
