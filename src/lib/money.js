import { round2 } from './calc.js';

function num(x){ const n = Number(x); return Number.isFinite(n) ? n : 0; }
function pos(x, d){ const n = Number(x); return (Number.isFinite(n) && n>0) ? n : d; }

export function deriveRates(settings) {
  const baseSalary = num(settings?.baseSalary);
  const workingDaysPerMonth = pos(settings?.workingDaysPerMonth, 30);
  const standardHoursPerDay = pos(settings?.standardHoursPerDay, 8);

  const dailyRate = (baseSalary && workingDaysPerMonth) ? (baseSalary / workingDaysPerMonth) : 0;
  const hourlyRate = (dailyRate && standardHoursPerDay) ? (dailyRate / standardHoursPerDay) : 0;

  return {
    baseSalary: round2(baseSalary),
    workingDaysPerMonth,
    standardHoursPerDay,
    dailyRate: round2(dailyRate),
    hourlyRate: round2(hourlyRate),
  };
}

function multipliers(settings, dayType) {
  const work = settings?.workMultipliers || { normal: 1, holiday: 2, special: 3 };
  const ot = settings?.otMultipliers || { normal: 1.5, holiday: 2, special: 3 };
  return {
    workMultiplier: num(work[dayType] ?? work.normal ?? 1),
    otMultiplier: num(ot[dayType] ?? ot.normal ?? 1.5),
  };
}

export function attendanceLabel(att){
  if (att === 'off') return 'หยุด/ขาด';
  if (att === 'personal') return 'ลากิจ';
  if (att === 'sick') return 'ลาป่วย';
  return 'มาทำงาน';
}

/**
 * Compute money for a single day based on base salary.
 * Attendance rule (ตามเดย์):
 * - off: รายได้ 0, OT 0 (ignore dayType multipliers)
 * - personal/sick: รายได้ปกติ = dailyRate (baseSalary ÷ 30), OT 0 (ignore dayType multipliers)
 * - present: ใช้ชั่วโมงสุทธิ × เรท/ชม. × ตัวคูณวัน + OT ตามตัวคูณ OT
 */
export function computeDayMoney(record, settings) {
  const rates = deriveRates(settings);
  const computed = record?.computed || { workHoursNet: 0, otHoursNet: 0 };

  const attendance = record?.attendance || 'present';
  const dayType = record?.dayType || 'normal';
  const mult = multipliers(settings, dayType);

  const allowancesDay = num(record?.allowancesDay);
  const deductionsDay = num(record?.deductionsDay);

  // OFF: everything 0 (strict)
  if (attendance === 'off') {
    return {
      rates,
      dayType,
      attendance,
      attendanceText: attendanceLabel(attendance),
      workMultiplier: 0,
      otMultiplier: 0,
      workHours: 0,
      otHours: 0,
      normalPay: 0,
      otPay: 0,
      allowancesDay: 0,
      deductionsDay: 0,
      grossDay: 0,
    };
  }

  // LEAVE: pay normal as dailyRate (no double/special multipliers), OT = 0
  if (attendance === 'personal' || attendance === 'sick') {
    const normalPay = rates.dailyRate;
    const otPay = 0;
    const grossDay = normalPay + allowancesDay - deductionsDay;
    return {
      rates,
      dayType,
      attendance,
      attendanceText: attendanceLabel(attendance),
      workMultiplier: 1,
      otMultiplier: 0,
      workHours: round2(num(computed.workHoursNet)),
      otHours: 0,
      normalPay: round2(normalPay),
      otPay: round2(otPay),
      allowancesDay: round2(allowancesDay),
      deductionsDay: round2(deductionsDay),
      grossDay: round2(grossDay),
    };
  }

  // PRESENT
  const workHours = num(computed.workHoursNet);
  const otHours = num(computed.otHoursNet);

  const otManualEnabled = !!record?.otMultiplierManualEnabled;
  const otManual = num(record?.otMultiplierManual);
  const otMultiplier = (otManualEnabled && otManual > 0) ? otManual : mult.otMultiplier;

  const normalPay = workHours * rates.hourlyRate * mult.workMultiplier;
  const otPay = otHours * rates.hourlyRate * otMultiplier;

  const grossDay = normalPay + otPay + allowancesDay - deductionsDay;

  return {
    rates,
    dayType,
    attendance,
    attendanceText: attendanceLabel(attendance),
    workMultiplier: mult.workMultiplier,
    otMultiplier,
    workHours: round2(workHours),
    otHours: round2(otHours),
    normalPay: round2(normalPay),
    otPay: round2(otPay),
    allowancesDay: round2(allowancesDay),
    deductionsDay: round2(deductionsDay),
    grossDay: round2(grossDay),
  };
}

/**
 * Summary for a date range using "ตามรายการรายวันจริง" (เดย์เลือก A)
 */
export function computeRangeSummary(records, settings, dateFrom, dateToExclusive) {
  const rates = deriveRates(settings);

  let workHours = 0;
  let otHours = 0;

  let normalPay = 0;
  let otPay = 0;
  let allowances = 0;
  let deductions = 0;
  let grossDays = 0;

  let daysPresent = 0;
  let daysOff = 0;
  let daysPersonal = 0;
  let daysSick = 0;

  for (const r of records || []) {
    if (!r?.date || r.date < dateFrom || r.date >= dateToExclusive) continue;

    const att = r.attendance || 'present';
    if (att === 'off') daysOff += 1;
    else if (att === 'personal') daysPersonal += 1;
    else if (att === 'sick') daysSick += 1;
    else daysPresent += 1;

    const c = r.computed || {};
    workHours += num(c.workHoursNet);
    otHours += num(c.otHoursNet);

    const m = computeDayMoney(r, settings);
    normalPay += m.normalPay;
    otPay += m.otPay;
    allowances += m.allowancesDay;
    deductions += m.deductionsDay;
    grossDays += m.grossDay;
  }

  const allowancesMonthly = num(settings?.allowancesMonthly);
  const deductionsMonthly = num(settings?.deductionsMonthly);

  const gross = grossDays + allowancesMonthly - deductionsMonthly;

  return {
    rates,
    dateFrom,
    dateToExclusive,
    daysPresent,
    daysOff,
    daysPersonal,
    daysSick,
    daysPaid: daysPresent + daysPersonal + daysSick,
    workHours: round2(workHours),
    otHours: round2(otHours),
    normalPay: round2(normalPay),
    otPay: round2(otPay),
    allowances: round2(allowances + allowancesMonthly),
    deductions: round2(deductions + deductionsMonthly),
    gross: round2(gross),
    summaryMode: 'byRecords',
  };
}
