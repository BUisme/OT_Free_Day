import { el } from './dom.js';
import { computeRangeSummary, computeDayMoney } from '../lib/money.js';
import { formatThaiDate, prevDate } from '../lib/time.js';

export function buildSummaryView(store, range) {
  const { state } = store;
  const s = state.settings;
  const records = state.records;

  const sum = computeRangeSummary(records, s, range.dateFrom, range.dateToExclusive);
  const hideMoney = !!s.privacyHideMoney;

  const summaryCard = el('div', { class:'card' },
    el('div', { class:'hd' }, el('h2', {}, `สรุป (${range.label})`)),
    el('div', { class:'bd' },
      el('div', { class:'notice ok' },
        el('div', {}, `ช่วงวันที่: ${formatThaiDate(range.dateFrom)} ถึง ${formatThaiDate(prevDate(range.dateToExclusive))}`),
        range.payDate ? el('div', { class:'small' }, `${range.kind==='ot' ? 'วันจ่าย OT' : 'วันจ่ายเงินเดือน'}: ${formatThaiDate(range.payDate)}`) : null
      ),
      kvGrid([
        ['มาทำงาน', `${sum.daysPresent} วัน`],
        ['หยุด/ขาด', `${sum.daysOff} วัน`],
        ['ลากิจ', `${sum.daysPersonal} วัน`],
        ['ลาป่วย', `${sum.daysSick} วัน`],
        ['ชั่วโมงงานรวม', `${sum.workHours.toFixed(2)} ชม.`],
        ['ชั่วโมง OT รวม', `${sum.otHours.toFixed(2)} ชม.`],
        ...(hideMoney ? [] : [
          ['เงินงานรวม', `${sum.normalPay.toFixed(2)} บาท`],
          ['เงิน OT รวม', `${sum.otPay.toFixed(2)} บาท`],
          ['รวมสุทธิ (Gross)', `${sum.gross.toFixed(2)} บาท`],
        ])
      ]),
      el('div', { class:'hr' }),
      el('div', { class:'small' },
        hideMoney
          ? '🙈 ซ่อนเงิน (เปิดในตั้งค่า)'
          : `เรท: วันละ ${sum.rates.dailyRate.toFixed(2)} • ชม.ละ ${sum.rates.hourlyRate.toFixed(2)} • หารวัน/เดือน ${sum.rates.workingDaysPerMonth}`
      )
    )
  );

  const top = topOTDays(records, s, range.dateFrom, range.dateToExclusive).slice(0,5);
  const topCard = el('div', { class:'card' },
    el('div', { class:'hd' }, el('h2', {}, 'Top OT Days')),
    el('div', { class:'bd' },
      top.length ? el('div', { class:'list' }, top.map(t => topItem(t, hideMoney))) : el('div', { class:'small' }, 'ยังไม่มีวัน OT ในช่วงนี้')
    )
  );

  return el('div', { class:'list' }, summaryCard, topCard);
}

function kvGrid(pairs){
  const grid = el('div', { class:'kv' });
  for (const [k,v] of pairs) {
    grid.append(
      el('div', {}, el('div', { class:'k' }, k), el('div', { class:'v' }, v))
    );
  }
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = '1fr 1fr';
  grid.style.gap = '10px';
  return grid;
}

function topOTDays(records, settings, from, to) {
  const list = [];
  for (const r of records || []) {
    if (!r?.date || r.date < from || r.date >= to) continue;
    const otHours = Number(r?.computed?.otHoursNet || 0);
    if (otHours <= 0) continue;
    const m = computeDayMoney(r, settings);
    list.push({ date:r.date, dayType:r.dayType||'normal', otHours, otPay:m.otPay, grossDay:m.grossDay });
  }
  list.sort((a,b)=> b.otPay - a.otPay || b.otHours - a.otHours);
  return list;
}

function topItem(t, hideMoney){
  return el('div', { class:'item' },
    el('div', { class:'row' },
      el('div', { class:'date' }, formatThaiDate(t.date)),
      el('div', {}, `OT ${t.otHours.toFixed(2)} ชม.`)
    ),
    el('div', { class:'meta' },
      ...(hideMoney ? [] : [
        el('span', {}, `เงิน OT ${t.otPay.toFixed(2)}฿`),
        el('span', {}, `รวมวัน ${t.grossDay.toFixed(2)}฿`),
      ]),
      el('span', {}, `ประเภท ${thaiDayType(t.dayType)}`)
    )
  );
}
function thaiDayType(t){
  if (t==='holiday') return 'วันหยุด';
  if (t==='special') return 'พิเศษ';
  return 'ปกติ';
}
