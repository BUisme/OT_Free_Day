import { nowISO, formatThaiDate, prevDate } from './time.js';
import { computeRangeSummary, computeDayMoney, attendanceLabel } from './money.js';

export function downloadText(filename, text, mime='text/plain') {
  const blob = new Blob([text], { type: mime + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 200);
}

export function exportJSON(appState) {
  const payload = {
    schemaVersion: 2,
    exportedAt: nowISO(),
    settings: appState.settings,
    records: appState.records,
  };
  downloadText(`ot_backup_${new Date().toISOString().slice(0,10)}.json`, JSON.stringify(payload, null, 2), 'application/json');
}

export async function importJSONFile(file) {
  const text = await file.text();
  const data = JSON.parse(text);
  if (!data || typeof data !== 'object' || !Array.isArray(data.records)) throw new Error('ไฟล์ JSON ไม่ถูกต้อง');
  return data;
}

export function exportCSV(appState) {
  const rows = [];
  rows.push([
    'date','date_th','attendance','attendance_th','dayType','workHours','otHours','totalHours',
    'hourlyRate','workMultiplier','otMultiplier','normalPay','otPay','allowancesDay','deductionsDay','grossDay',
    'employeeId','department','note','tags','createdAt','updatedAt'
  ].join(','));

  const s = appState.settings || {};
  for (const r of appState.records || []) {
    const c = r.computed || {};
    const m = computeDayMoney(r, s);
    rows.push([
      esc(r.date),
      esc(formatThaiDate(r.date)),
      esc(r.attendance || 'present'),
      esc(attendanceLabel(r.attendance || 'present')),
      esc(r.dayType || 'normal'),
      num(c.workHoursNet),
      num(c.otHoursNet),
      num(c.totalHoursNet),
      num(m.rates.hourlyRate),
      num(m.workMultiplier),
      num(m.otMultiplier),
      num(m.normalPay),
      num(m.otPay),
      num(m.allowancesDay),
      num(m.deductionsDay),
      num(m.grossDay),
      esc(s.employeeId || ''),
      esc(s.department || ''),
      esc(r.note || ''),
      esc((r.tags || []).join('|')),
      esc(r.createdAt || ''),
      esc(r.updatedAt || '')
    ].join(','));
  }

  downloadText(`ot_${new Date().toISOString().slice(0,10)}.csv`, rows.join('\n'), 'text/csv');
}

function esc(s) {
  const str = String(s ?? '');
  if (/[",\n]/.test(str)) return '"' + str.replace(/"/g,'""') + '"';
  return str;
}
function num(n) {
  const x = Number(n);
  return Number.isFinite(x) ? String(x) : '0';
}

/**
 * Export PDF via a printable report page.
 * - mode: 'timeOnly' | 'withMoney'
 * - If settings.privacyHideMoney is true, mode will be forced to timeOnly.
 */
export function exportPDFReport(appState, range, mode='withMoney', openInlineCb=null) {
  const { dateFrom, dateToExclusive } = range;
  const settings = appState.settings || {};
  const records = appState.records || [];
  const hideMoney = !!settings.privacyHideMoney;
  const finalMode = hideMoney ? 'timeOnly' : mode;

  const summary = computeRangeSummary(records, settings, dateFrom, dateToExclusive);
  const docHtml = buildReportHTML(settings, records, summary, range, finalMode);

  // ✅ Mobile-safe: render report in the same tab (no popup) when callback is provided
  if (typeof openInlineCb === 'function') {
    const styleTag = (docHtml.match(/<style[\s\S]*?<\/style>/i) || [''])[0];
    const bodyMatch = docHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    let bodyHtml = bodyMatch ? bodyMatch[1] : docHtml;

    // Replace "close" behavior for inline preview
    bodyHtml = bodyHtml.replace(/onclick="window\.close\(\)"/g,
      'onclick="window.__ot_closePrintPreview && window.__ot_closePrintPreview()"'
    );

    openInlineCb({
      title: `OT Report ${dateFrom}`,
      html: `${styleTag}\n${bodyHtml}`
    });
    return;
  }

  // Fallback: open in a new tab using a Blob URL (more reliable than document.write on Android)
  try {
    const blob = new Blob([docHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (!win) {
      // If popup blocked, at least navigate in the same tab
      window.location.href = url;
    }
  } catch (e) {
    // Very old fallback
    const win = window.open('', '_blank');
    if (!win) throw new Error('เปิดหน้าต่างใหม่ไม่ได้ (โดนบล็อก pop-up?)');
    win.document.open();
    win.document.write(docHtml);
    win.document.close();
    win.document.title = `OT Report ${dateFrom}`;
    win.focus();
  }
}

function buildReportHTML(settings, records, summary, range, mode) {
  const { dateFrom, dateToExclusive, label, payDate, kind } = range;
  const now = new Date().toLocaleString('th-TH');
  const payPart = payDate ? ` • วันจ่าย${kind==='ot' ? ' OT' : 'เงินเดือน'}: <b>${escapeHtml(formatThaiDate(payDate))}</b>` : '';
  const s = settings || {};
  const withMoney = mode === 'withMoney';
  // When report is "timeOnly" (or privacyHideMoney forces timeOnly), mask money fields.
  const moneyMask = '------';
  const baseSalaryText = withMoney ? fmtMoney(summary?.rates?.baseSalary) : moneyMask;

  const rows = records
    .filter(r => r.date >= dateFrom && r.date < dateToExclusive)
    .sort((a,b)=>a.date.localeCompare(b.date))
    .map(r => {
      const c = r.computed || {};
      const m = computeDayMoney(r, settings);
      return `
        <tr>
          <td>${formatThaiDate(r.date)}</td>
          <td>${escapeHtml(m.attendanceText)}</td>
          <td>${thaiDayType(r.dayType)}</td>
          <td class="num">${fmt(c.workHoursNet)}</td>
          <td class="num">${fmt(c.otHoursNet)}</td>
          <td class="num">${fmt(c.totalHoursNet)}</td>
          ${withMoney ? `
            <td class="num">${fmtMoney(m.normalPay)}</td>
            <td class="num">${fmtMoney(m.otPay)}</td>
            <td class="num">${fmtMoney(m.allowancesDay)}</td>
            <td class="num">${fmtMoney(m.deductionsDay)}</td>
            <td class="num"><b>${fmtMoney(m.grossDay)}</b></td>
          ` : ``}
          <td class="small">${escapeHtml((r.tags||[]).join(', '))}</td>
          <td class="small">${escapeHtml(r.note||'')}</td>
        </tr>
        <tr class="metaRow">
          <td colspan="${withMoney ? 13 : 8}">
            <span>บันทึกเมื่อ: ${escapeHtml(r.createdAt || '-')}</span>
            <span>แก้ไขล่าสุด: ${escapeHtml(r.updatedAt || '-')}</span>
          </td>
        </tr>
      `;
    }).join('');

  const sumTiles = `
    <div class="sumgrid">
      <div class="tile"><div class="k">มาทำงาน</div><div class="v">${summary.daysPresent} วัน</div></div>
      <div class="tile"><div class="k">หยุด/ขาด</div><div class="v">${summary.daysOff} วัน</div></div>
      <div class="tile"><div class="k">ลากิจ</div><div class="v">${summary.daysPersonal} วัน</div></div>
      <div class="tile"><div class="k">ลาป่วย</div><div class="v">${summary.daysSick} วัน</div></div>
      <div class="tile"><div class="k">ชั่วโมงงานรวม</div><div class="v">${fmt(summary.workHours)} ชม.</div></div>
      <div class="tile"><div class="k">ชั่วโมง OT รวม</div><div class="v">${fmt(summary.otHours)} ชม.</div></div>
      ${withMoney ? `
        <div class="tile"><div class="k">เงินงานรวม</div><div class="v">${fmtMoney(summary.normalPay)}</div></div>
        <div class="tile"><div class="k">เงิน OT รวม</div><div class="v">${fmtMoney(summary.otPay)}</div></div>
        <div class="tile"><div class="k">รวมสุทธิ (Gross)</div><div class="v">${fmtMoney(summary.gross)}</div></div>
      ` : ``}
    </div>
  `;

  return `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>OT Report</title>
<style>
  @page { size: A4 portrait; margin: 12mm; }
  body{ font-family: system-ui, -apple-system, "Segoe UI", "Noto Sans Thai", Arial, sans-serif; color:#0b1220; }
  h1{ font-size: 16px; margin:0 0 6px 0; }
  .sub{ color:#334155; font-size: 12px; margin: 0 0 10px 0; }
  .box{ border:1px solid #cbd5e1; border-radius: 10px; padding:10px; margin: 8px 0 10px 0; }
  .grid{ display:grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .kv{ font-size: 12px; }
  .kv b{ display:inline-block; min-width: 130px; }
  table{ width:100%; border-collapse:collapse; font-size: 11px; }
  th,td{ border:1px solid #cbd5e1; padding:6px 6px; vertical-align: top; }
  th{ background:#f1f5f9; text-align:left; }
  .num{ text-align:right; white-space:nowrap; }
  .small{ color:#334155; font-size: 10px; }
  .metaRow td{ background: #ffffff; border-top: none; font-size: 10px; color:#475569; }
  .metaRow span{ margin-right: 14px; }
  .foot{ margin-top: 8px; font-size: 11px; color:#475569; }
  .sumgrid{ display:grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
  .tile{ border:1px solid #cbd5e1; border-radius: 10px; padding: 8px; }
  .tile .k{ font-size: 10px; color:#334155; }
  .tile .v{ font-size: 13px; font-weight:700; margin-top: 4px; }
  .topActions{ display:flex; gap:8px; flex-wrap:wrap; margin: 10px 0 12px; }
  .btn{ border:1px solid #0f172a; background:#0f172a; color:#fff; border-radius: 10px; padding: 10px 12px; font-size: 12px; cursor:pointer; }
  .btn.secondary{ background:#334155; border-color:#334155; }
  .hint{ font-size: 11px; color:#475569; margin-top: 6px; }
  @media print{
    .topActions, .hint{ display:none; }
  }
</style>
</head>
<body>
  <h1>รายงาน OT / ชั่วโมงทำงาน (${escapeHtml(label)})</h1>
  <p class="sub">ช่วงวันที่: <b>${escapeHtml(formatThaiDate(dateFrom))}</b> ถึง <b>${escapeHtml(formatThaiDate(prevDate(dateToExclusive)))}</b>${payPart} • สร้างเมื่อ: ${escapeHtml(now)}</p>

  <div class="topActions">
    <button class="btn" onclick="window.print()">🖨️ พิมพ์ / บันทึกเป็น PDF</button>
    <button class="btn secondary" onclick="window.close()">ปิด</button>
  </div>
  <div class="hint">ทิป: ในหน้าพิมพ์ เลือก “บันทึกเป็น PDF” เพื่อเซฟไฟล์ลงเครื่อง</div>

  <div class="box grid">
    <div class="kv">
      <div><b>รหัสพนักงาน:</b> ${escapeHtml(s.employeeId || '-')}</div>
      <div><b>แผนก:</b> ${escapeHtml(s.department || '-')}</div>
      <div><b>โหมดรายงาน:</b> ${withMoney ? 'วันเวลา + ยอดเงิน' : 'เฉพาะวันเวลา'}</div>
    </div>
    <div class="kv">
      <div><b>ฐานเงินเดือน:</b> ${baseSalaryText}</div>
      <div><b>หารวัน/เดือน:</b> ${escapeHtml(String(summary.rates.workingDaysPerMonth))}</div>
      <div><b>ชั่วโมงมาตรฐาน/วัน:</b> ${escapeHtml(String(summary.rates.standardHoursPerDay))}</div>
    </div>
  </div>

  <div class="box">
    ${sumTiles}
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:68px">วันที่</th>
        <th style="width:70px">สถานะ</th>
        <th style="width:54px">ประเภทวัน</th>
        <th style="width:54px" class="num">งาน (ชม.)</th>
        <th style="width:54px" class="num">OT (ชม.)</th>
        <th style="width:54px" class="num">รวม (ชม.)</th>
        ${withMoney ? `
          <th style="width:64px" class="num">เงินงาน</th>
          <th style="width:64px" class="num">เงิน OT</th>
          <th style="width:64px" class="num">เพิ่ม</th>
          <th style="width:64px" class="num">หัก</th>
          <th style="width:74px" class="num">รวมวัน</th>
        ` : ``}
        <th>แท็ก</th>
        <th>หมายเหตุ</th>
      </tr>
    </thead>
    <tbody>
      ${rows || `<tr><td colspan="${withMoney ? 13 : 8}" class="small">ไม่มีข้อมูลในช่วงนี้</td></tr>`}
    </tbody>
  </table>
</body>
</html>`;
}

function thaiDayType(t){
  if (t==='holiday') return 'วันหยุด';
  if (t==='special') return 'พิเศษ';
  return 'ปกติ';
}
function fmt(x){
  const n = Number(x);
  if (!Number.isFinite(n)) return '0.00';
  return n.toFixed(2);
}
function fmtMoney(x){
  const n = Number(x);
  if (!Number.isFinite(n)) return '0.00';
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function escapeHtml(s){
  return String(s ?? '').replace(/[&<>"']/g, (c)=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
