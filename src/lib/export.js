import { nowISO, formatThaiDate, prevDate, payDateFromRange, dateKey, cycleRangeByAnchor, shiftMonth } from './time.js';
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

function filterRecordsByRange(records, range) {
  if (!range?.dateFrom || !range?.dateToExclusive) return [...(records || [])];
  const dfk = dateKey(range.dateFrom);
  const dtk = dateKey(range.dateToExclusive);
  return (records || []).filter(r => {
    const k = dateKey(r?.date);
    if (k == null) return false;
    if (dfk != null && k < dfk) return false;
    if (dtk != null && k >= dtk) return false;
    return true;
  });
}

export function exportCSV(appState, range = null) {
  const rows = [];
  rows.push([
    'date','date_th','attendance','attendance_th','dayType','workHours','otHours','totalHours',
    'hourlyRate','workMultiplier','otMultiplier','normalPay','otPay','allowancesDay','deductionsDay','grossDay',
    'employeeId','department','note','tags','createdAt','updatedAt'
  ].join(','));

  const s = appState.settings;
  const employeeId = s.employeeId || '';
  const department = s.department || '';

  const recs = range ? filterRecordsByRange(appState.records, range) : (appState.records || []);

  for (const r of recs) {
    const c = r.computed || {};
    const m = computeDayMoney(r, s);

    const dayType = r.dayType || 'normal';
    const workMul = s.workMultipliers?.[dayType] ?? 1;
    const otMul = s.otMultipliers?.[dayType] ?? 1.5;

    const row = [
      r.date,
      formatThaiDate(r.date),
      r.attendance || 'present',
      attendanceLabel(r.attendance || 'present'),
      dayType,
      (c.workHoursNet ?? 0),
      (c.otHoursNet ?? 0),
      (c.totalHoursNet ?? 0),
      m.rates?.hourlyRate ?? 0,
      workMul,
      otMul,
      m.normalPay,
      m.otPay,
      m.allowancesDay,
      m.deductionsDay,
      m.grossDay,
      employeeId,
      department,
      (r.note || '').replace(/\n/g,' '),
      (Array.isArray(r.tags) ? r.tags.join('|') : ''),
      r.createdAt || '',
      r.updatedAt || ''
    ];

    const esc = v => {
      const s = String(v ?? '');
      if (/[\",\n]/.test(s)) return '"' + s.replace(/"/g,'""') + '"';
      return s;
    };

    rows.push(row.map(esc).join(','));
  }

  const tag = range?.label ? `_${range.label.replace(/\s+/g,'_')}` : '';
  downloadText(`ot_export${tag}_${new Date().toISOString().slice(0,10)}.csv`, rows.join('\n'), 'text/csv');
}

function formatMoney(n, hide=false) {
  if (hide) return '***';
  return Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function computeOtCycleStats(records, settings, range) {
  let otDays = 0;
  let otHours = 0;
  let otPay = 0;

  const recs = filterRecordsByRange(records, range);
  for (const r of recs) {
    const c = r.computed || {};
    const h = Number(c.otHoursNet || 0);
    if (h > 0) otDays += 1;
    otHours += h;
    const m = computeDayMoney(r, settings);
    otPay += Number(m.otPay || 0);
  }

  return {
    otDays,
    otHours: Math.round((otHours + Number.EPSILON) * 100) / 100,
    otPay: Math.round((otPay + Number.EPSILON) * 100) / 100,
  };
}

function sortByDate(a, b) {
  return (dateKey(a?.date) ?? 0) - (dateKey(b?.date) ?? 0);
}

function cycleContext(settings, monthValue) {
  const cycleAnchor = settings.cycleMonthAnchor || 'end';

  const salaryStart = Number(settings.salaryCycleStartDay || 1);
  const salaryEnd = settings.salaryCycleEndDay == null
    ? (salaryStart === 1 ? 0 : (salaryStart - 1))
    : Number(settings.salaryCycleEndDay);

  const salaryR = cycleRangeByAnchor(monthValue, salaryStart, salaryEnd, cycleAnchor);
  const salaryPay = payDateFromRange(salaryR, settings.salaryPayType || 'end', Number(settings.salaryPayDay || 0));

  const otStart = ((settings.otCycleMode || 'custom') === 'sameAsSalary')
    ? salaryStart
    : Number(settings.otCycleStartDay || 21);

  const otEnd = ((settings.otCycleMode || 'custom') === 'sameAsSalary')
    ? salaryEnd
    : (settings.otCycleEndDay == null ? (otStart === 1 ? 0 : (otStart - 1)) : Number(settings.otCycleEndDay));

  const otR = cycleRangeByAnchor(monthValue, otStart, otEnd, cycleAnchor);
  const otPay = ((settings.otPayMode || 'sameAsSalary') === 'sameAsSalary')
    ? salaryPay
    : payDateFromRange(otR, settings.otPayType || 'fixed', Number(settings.otPayDay || 25));

  const prevMonthValue = shiftMonth(monthValue, -1);
  const prevOtR = cycleRangeByAnchor(prevMonthValue, otStart, otEnd, cycleAnchor);
  const prevOtPay = ((settings.otPayMode || 'sameAsSalary') === 'sameAsSalary')
    ? payDateFromRange(prevOtR, settings.salaryPayType || 'end', Number(settings.salaryPayDay || 0))
    : payDateFromRange(prevOtR, settings.otPayType || 'fixed', Number(settings.otPayDay || 25));

  return { salaryR, salaryPay, otR, otPay, prevOtR, prevOtPay, otStart, otEnd, salaryStart, salaryEnd };
}

function buildOtRows(records, settings, range) {
  return filterRecordsByRange(records, range)
    .filter(r => Number(r?.computed?.otHoursNet || 0) > 0)
    .sort(sortByDate)
    .map(r => ({ ...r, money: computeDayMoney(r, settings) }));
}

function buildReportHTML(appState, range, reportMode = 'withMoney') {
  const s = appState.settings;
  const records = appState.records || [];
  const hideMoney = !!s.privacyHideMoney || reportMode === 'noMoney' || reportMode === 'timeOnly';

  const monthValue = range?.monthValue || (range?.dateFrom ? String(range.dateFrom).slice(0,7) : null);
  const { salaryR, salaryPay, otR, otPay, prevOtR, prevOtPay } = cycleContext(s, monthValue);

  const salarySum = computeRangeSummary(records, s, salaryR.dateFrom, salaryR.dateToExclusive);
  const otStats = computeOtCycleStats(records, s, otR);
  const prevOtStats = computeOtCycleStats(records, s, prevOtR);
  const reportSum = computeRangeSummary(records, s, range.dateFrom, range.dateToExclusive);
  const reportRecords = filterRecordsByRange(records, range).sort(sortByDate);
  const otCycleRows = buildOtRows(records, s, otR);
  const prevOtCycleRows = buildOtRows(records, s, prevOtR);

  const reportTitle = `รายงาน OT / ชั่วโมงทำงาน (${range.label})`;
  const createdAtTH = new Date().toLocaleString('th-TH');

  return `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${reportTitle}</title>
<style>
  body{ font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 16px; color:#111; }
  h1{ font-size: 18px; margin: 0 0 6px; }
  .sub{ color:#444; font-size: 12px; margin-bottom: 10px; }
  .card{ border:1px solid #ddd; border-radius: 10px; padding:12px; margin: 10px 0; }
  .grid{ display:grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap:8px; }
  .kv{ border:1px solid #eee; border-radius: 10px; padding:8px; }
  .k{ font-size: 11px; color:#555; }
  .v{ font-size: 14px; font-weight: 700; }
  .two{ display:grid; grid-template-columns: 1fr 1fr; gap:10px; }
  .muted{ color:#666; font-size: 12px; }
  table{ width:100%; border-collapse: collapse; }
  th,td{ border-bottom:1px solid #eee; padding:6px 6px; font-size: 12px; vertical-align: top; }
  th{ text-align:left; background:#fafafa; }
  .topActions{ display:flex; gap:8px; margin: 8px 0 12px; }
  button{ padding:8px 12px; border-radius: 10px; border: 1px solid #ddd; background:#fff; }
  .tag{ display:inline-block; padding:2px 6px; border-radius:999px; border:1px solid #ddd; font-size:11px; margin-right:4px; }
  .warn{ background:#fff7ed; border-color:#fed7aa; }
  @media print { .topActions{ display:none; } .hint{ display:none; } body{ margin: 0; } }
</style>
</head>
<body>
  <div class="topActions">
    <button onclick="window.print()">🖨️ พิมพ์ / บันทึกเป็น PDF</button>
    <button onclick="window.close()">ปิด</button>
  </div>

  <h1>${reportTitle}</h1>
  <div class="sub">
    เดือนจ่าย/เดือนจบรอบ: ${monthValue || '-'} • ช่วงรายงาน: ${formatThaiDate(range.dateFrom)} ถึง ${formatThaiDate(prevDate(range.dateToExclusive))}
    • สร้างเมื่อ: ${createdAtTH}
  </div>

  <div class="card">
    <div class="two">
      <div>
        <div style="font-weight:800; margin-bottom:4px;">รอบเงินเดือน</div>
        <div class="muted">ช่วง: ${formatThaiDate(salaryR.dateFrom)} → ${formatThaiDate(prevDate(salaryR.dateToExclusive))}</div>
        <div class="muted">วันจ่ายเงินเดือน: ${formatThaiDate(salaryPay)}</div>
        <div class="muted">วันทำงาน: ${salarySum.daysPresent} วัน • OT ในช่วงเงินเดือน: ${salarySum.otHours} ชม.</div>
      </div>
      <div>
        <div style="font-weight:800; margin-bottom:4px;">รอบ OT ที่จ่ายเดือนนี้</div>
        <div class="muted">ช่วง: ${formatThaiDate(otR.dateFrom)} → ${formatThaiDate(prevDate(otR.dateToExclusive))}</div>
        <div class="muted">วันจ่าย OT: ${formatThaiDate(otPay)}</div>
        <div class="muted">วันมี OT: ${otStats.otDays} วัน • OT รวม: ${otStats.otHours} ชม.</div>
        <div class="muted">เงิน OT รอบนี้: ${formatMoney(otStats.otPay, hideMoney)} บาท</div>
        <div class="muted" style="margin-top:6px; padding-top:6px; border-top:1px dashed #ddd;">
          OT งวดก่อนหน้า: ช่วง ${formatThaiDate(prevOtR.dateFrom)} → ${formatThaiDate(prevDate(prevOtR.dateToExclusive))} • จ่าย ${formatThaiDate(prevOtPay)} • ${prevOtStats.otDays} วัน • ${prevOtStats.otHours} ชม. • ${formatMoney(prevOtStats.otPay, hideMoney)} บาท
        </div>
      </div>
    </div>
    <div class="hint muted" style="margin-top:8px;">PDF นี้อิง “เดือนจ่าย/เดือนจบรอบ” ตามที่เลือกในหน้าเว็บ และยังแสดง OT งวดก่อนหน้าไว้เช็คตกหล่นด้วย</div>
  </div>

  <div class="card">
    <div style="font-weight:800; margin-bottom:8px;">สรุปช่วงรายงาน (ตามแท็บที่เลือก)</div>
    <div class="grid">
      <div class="kv"><div class="k">มาทำงาน</div><div class="v">${reportSum.daysPresent} วัน</div></div>
      <div class="kv"><div class="k">หยุด/ขาด</div><div class="v">${reportSum.daysOff} วัน</div></div>
      <div class="kv"><div class="k">ลากิจ</div><div class="v">${reportSum.daysPersonal} วัน</div></div>
      <div class="kv"><div class="k">ลาป่วย</div><div class="v">${reportSum.daysSick} วัน</div></div>
      <div class="kv"><div class="k">ชั่วโมงงานรวม</div><div class="v">${reportSum.workHours} ชม.</div></div>
      <div class="kv"><div class="k">ชั่วโมง OT รวม</div><div class="v">${reportSum.otHours} ชม.</div></div>
      <div class="kv"><div class="k">เงินงานรวม</div><div class="v">${formatMoney(reportSum.normalPay, hideMoney)}</div></div>
      <div class="kv"><div class="k">เงิน OT รวม</div><div class="v">${formatMoney(reportSum.otPay, hideMoney)}</div></div>
      <div class="kv"><div class="k">ค่าอาหารรวม</div><div class="v">${formatMoney(reportSum.allowancesMeal, hideMoney)}</div></div>
      <div class="kv"><div class="k">ค่ากะรวม</div><div class="v">${formatMoney(reportSum.allowancesShift, hideMoney)}</div></div>
      <div class="kv"><div class="k">เพิ่มเองรวม</div><div class="v">${formatMoney(reportSum.allowancesManual, hideMoney)}</div></div>
      <div class="kv"><div class="k">หักทั้งหมด</div><div class="v">${formatMoney(reportSum.deductions, hideMoney)}</div></div>
      <div class="kv warn" style="grid-column: span 4;"><div class="k">รวมสุทธิ (Gross)</div><div class="v">${formatMoney(reportSum.gross, hideMoney)}</div></div>
    </div>
    <div class="muted" style="margin-top:8px;">ฐานเงินเดือน: ${formatMoney(reportSum.rates.baseSalary, hideMoney)} • หารวัน/เดือน: ${reportSum.rates.workingDaysPerMonth} • ชั่วโมงมาตรฐาน/วัน: ${reportSum.rates.standardHoursPerDay}</div>
  </div>

  <div class="card">
    <div style="font-weight:800; margin-bottom:8px;">รายละเอียดรายวัน (ช่วงรายงาน)</div>
    <table>
      <thead>
        <tr>
          <th>วันที่</th><th>สถานะ</th><th>ประเภท</th><th>วันงาน (ชม.)</th><th>OT (ชม.)</th><th>รวม (ชม.)</th><th>เงินงาน</th><th>เงิน OT</th><th>เพิ่ม</th><th>หัก</th><th>รวมวัน</th><th>แท็ก</th><th>หมายเหตุ</th>
        </tr>
      </thead>
      <tbody>
        ${reportRecords.map(r => {
          const c = r.computed || {};
          const m = computeDayMoney(r, s);
          return `
          <tr>
            <td>${formatThaiDate(r.date)}</td>
            <td>${attendanceLabel(r.attendance || 'present')}</td>
            <td>${r.dayType || 'normal'}</td>
            <td>${Number(c.workHoursNet || 0).toFixed(2)}</td>
            <td>${Number(c.otHoursNet || 0).toFixed(2)}</td>
            <td>${Number(c.totalHoursNet || 0).toFixed(2)}</td>
            <td>${formatMoney(m.normalPay, hideMoney)}</td>
            <td>${formatMoney(m.otPay, hideMoney)}</td>
            <td>${formatMoney(m.allowancesDay, hideMoney)}</td>
            <td>${formatMoney(m.deductionsDay, hideMoney)}</td>
            <td>${formatMoney(m.grossDay, hideMoney)}</td>
            <td>${(Array.isArray(r.tags) ? r.tags.map(t=>`<span class="tag">${t}</span>`).join('') : '')}</td>
            <td>${(r.note || '').replace(/\n/g,'<br/>')}<div class="muted">บันทึกเมื่อ: ${r.createdAt || '-'} • แก้ไขล่าสุด: ${r.updatedAt || '-'}</div></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>

  <div class="card">
    <div style="font-weight:800; margin-bottom:8px;">รายการวันมี OT (งวดที่จ่ายเดือนนี้)</div>
    <div class="muted" style="margin-bottom:8px;">ช่วง: ${formatThaiDate(otR.dateFrom)} → ${formatThaiDate(prevDate(otR.dateToExclusive))}</div>
    <table>
      <thead><tr><th>วันที่</th><th>OT (ชม.)</th><th>เงิน OT</th><th>หมายเหตุ</th></tr></thead>
      <tbody>
        ${otCycleRows.length ? otCycleRows.map(r => `
          <tr>
            <td>${formatThaiDate(r.date)}</td>
            <td>${Number(r?.computed?.otHoursNet || 0).toFixed(2)}</td>
            <td>${formatMoney(r.money.otPay, hideMoney)}</td>
            <td>${(r.note || '').replace(/\n/g,'<br/>')}</td>
          </tr>`).join('') : `<tr><td colspan="4" class="muted">(ไม่มี OT ในรอบนี้)</td></tr>`}
      </tbody>
    </table>
  </div>

  <div class="card">
    <div style="font-weight:800; margin-bottom:8px;">รายการวันมี OT (งวดก่อนหน้า)</div>
    <div class="muted" style="margin-bottom:8px;">ช่วง: ${formatThaiDate(prevOtR.dateFrom)} → ${formatThaiDate(prevDate(prevOtR.dateToExclusive))}</div>
    <table>
      <thead><tr><th>วันที่</th><th>OT (ชม.)</th><th>เงิน OT</th><th>หมายเหตุ</th></tr></thead>
      <tbody>
        ${prevOtCycleRows.length ? prevOtCycleRows.map(r => `
          <tr>
            <td>${formatThaiDate(r.date)}</td>
            <td>${Number(r?.computed?.otHoursNet || 0).toFixed(2)}</td>
            <td>${formatMoney(r.money.otPay, hideMoney)}</td>
            <td>${(r.note || '').replace(/\n/g,'<br/>')}</td>
          </tr>`).join('') : `<tr><td colspan="4" class="muted">(ไม่มี OT ในงวดก่อนหน้า)</td></tr>`}
      </tbody>
    </table>
  </div>

</body>
</html>`;
}

export function exportPDFReport(appState, range, reportMode='withMoney', showPrintPreview=true) {
  const html = buildReportHTML(appState, range, reportMode);
  const w = window.open('', '_blank');
  if (!w) {
    alert('เปิดหน้าต่างใหม่ไม่สำเร็จ (อาจโดนบล็อก)');
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  if (!showPrintPreview) {
    setTimeout(() => {
      w.print();
    }, 300);
  }
}
