import { getAllRecords, getSettings, putRecord, putSettings, deleteRecord } from '../lib/db.js';
import { computeComputed } from '../lib/calc.js';
import { nowISO, normalizeDateStr } from '../lib/time.js';

export function defaultSettings() {
  return {
    schemaVersion: 2,
    employeeId: '',
    department: '',

    // Privacy
    privacyHideMoney: false,

    // Salary (ตามเดย์)
    baseSalary: 12000,
    workingDaysPerMonth: 30,
    standardHoursPerDay: 8,
    salaryMode: 'fixed', // fixed | prorateByDays | prorateByHours

    // เลือกเดือนในหน้าหลักอ้างอิงเป็น: 'end' = เดือนจบรอบ/เดือนจ่าย, 'start' = เดือนเริ่มรอบ
    cycleMonthAnchor: 'end',

    // รอบตัดเงินเดือน/OT
    // หมายเหตุ: เลือกเดือนในหน้าหลัก = เดือนจบรอบ/เดือนจ่าย (ค่าเริ่มต้นตามเดย์)
    // - ถ้า startDay = 1 => ต้นเดือน → สิ้นเดือน
    // - ถ้า startDay = 21 => 21 → 20 (ข้ามเดือน)
    salaryCycleStartDay: 1,
    salaryCycleEndDay: 0, // 0=สิ้นเดือน
    salaryPayType: 'end', // end | eom | fixed
    salaryPayDay: 0, // ใช้เมื่อ fixed (เช่น 25)

    // OT แยกจากเงินเดือนได้
    otCycleMode: 'custom', // custom | sameAsSalary
    otCycleStartDay: 21,
    otCycleEndDay: 20, // 0=สิ้นเดือน หรือ วันจบรอบ
    otPayMode: 'sameAsSalary', // sameAsSalary | custom
    otPayType: 'fixed', // end | eom | fixed (ใช้เมื่อ otPayMode=custom)
    otPayDay: 25,


    workMultipliers: { normal: 1, holiday: 2, special: 3 },
    otMultipliers: { normal: 1.5, holiday: 3, special: 3 },

    // Defaults
    defaultShiftType: 'day',
    defaultDayType: 'normal',
    defaultWorkStart: '08:00',
    defaultWorkEnd: '17:00',
    defaultOtStart: '17:00',
    defaultOtEnd: '20:00',
    defaultBreaks: [
      { start:'11:30', end:'12:00' },
      { start:'17:00', end:'17:30' }
    ],


    // เทมเพลตกะ (ตั้งเวลาแยกกะเพื่อสลับกะง่ายขึ้น)
    // ปรับได้ใน “ตั้งค่า” → เทมเพลตกะ
    shiftTemplates: {
      day: {
        workStart: '08:00',
        workEnd: '17:00',
        otStart: '17:00',
        otEnd: '20:00',
        breaks: [
          { start:'11:30', end:'12:00' },
          { start:'17:00', end:'17:30' }
        ],
      },
      night: {
        workStart: '20:00',
        workEnd: '05:00',
        otStart: '05:00',
        otEnd: '07:00',
        breaks: [
          { start:'00:00', end:'00:30' }
        ],
      },
      custom: {
        workStart: '08:00',
        workEnd: '17:00',
        otStart: '',
        otEnd: '',
        breaks: [],
      },
    },

    // เบี้ยเลี้ยง/ค่ากะ (อัตโนมัติ)
    mealAllowanceEnabled: true,
    mealAllowanceBase: 30,
    mealAllowanceOtThreshold: 2.5,
    mealAllowanceOtAmount: 60,

    shiftAllowanceEnabled: true,
    shiftAllowances: { day: 0, night: 100, custom: 0 },

    allowancesMonthly: 0,
    deductionsMonthly: 0,

    weekStartsOn: 1,
    dateFormat: 'DD/MM/YYYY'
  };
}

// ให้ “ค่าเริ่มต้นเวลางาน/OT” และ “เทมเพลตกะ” ไม่สวนกัน
// แนวคิด: ใช้ shiftTemplates เป็นแหล่งความจริงหลัก
// แต่ถ้าผู้ใช้ปรับค่า default* มาก่อน (สมัยก่อนมีแต่ default*)
// จะ “ดูด” ค่า default* ไปใส่ template ของกะเริ่มต้นให้อัตโนมัติ
function normalizeSettings(s) {
  const base = defaultSettings();
  const out = { ...base, ...(s || {}) };

  // ensure shiftTemplates structure
  if (!out.shiftTemplates) {
    out.shiftTemplates = structuredClone(base.shiftTemplates);
  }
  out.shiftTemplates.day ??= structuredClone(base.shiftTemplates.day);
  out.shiftTemplates.night ??= structuredClone(base.shiftTemplates.night);
  out.shiftTemplates.custom ??= structuredClone(base.shiftTemplates.custom);
  for (const k of ['day','night','custom']) {
    const t = out.shiftTemplates[k] || (out.shiftTemplates[k] = {});
    if (!Array.isArray(t.breaks)) t.breaks = [];
  }

  const defShift = out.defaultShiftType || 'day';
  const t = out.shiftTemplates[defShift] || out.shiftTemplates.day;

  const defaultsNow = {
    workStart: out.defaultWorkStart ?? '',
    workEnd: out.defaultWorkEnd ?? '',
    otStart: out.defaultOtStart ?? '',
    otEnd: out.defaultOtEnd ?? '',
    breaks: Array.isArray(out.defaultBreaks) ? out.defaultBreaks : [],
  };
  const defaultsBase = {
    workStart: base.defaultWorkStart ?? '',
    workEnd: base.defaultWorkEnd ?? '',
    otStart: base.defaultOtStart ?? '',
    otEnd: base.defaultOtEnd ?? '',
    breaks: Array.isArray(base.defaultBreaks) ? base.defaultBreaks : [],
  };
  const templateBase = base.shiftTemplates?.[defShift] || base.shiftTemplates.day;

  const sameBreaks = (a,b) => {
    try { return JSON.stringify(a||[]) === JSON.stringify(b||[]); } catch { return false; }
  };
  const sameTimes = (x,y) => (x||'') === (y||'');

  const defaultsChanged = !(
    sameTimes(defaultsNow.workStart, defaultsBase.workStart) &&
    sameTimes(defaultsNow.workEnd, defaultsBase.workEnd) &&
    sameTimes(defaultsNow.otStart, defaultsBase.otStart) &&
    sameTimes(defaultsNow.otEnd, defaultsBase.otEnd) &&
    sameBreaks(defaultsNow.breaks, defaultsBase.breaks)
  );
  const templateStillBase = (templateBase &&
    sameTimes(t.workStart, templateBase.workStart) &&
    sameTimes(t.workEnd, templateBase.workEnd) &&
    sameTimes(t.otStart, templateBase.otStart) &&
    sameTimes(t.otEnd, templateBase.otEnd) &&
    sameBreaks(t.breaks, templateBase.breaks)
  );

  // ถ้าผู้ใช้แก้ “default*” แต่ยังไม่ได้แก้เทมเพลต (ยังเป็นค่าเดิมของโปรแกรม)
  // ให้ sync template ของกะเริ่มต้นตาม default* เพื่อให้ “เลือกกะ/ปุ่มลัด OT” ตรงกับที่ตั้งไว้
  if (defaultsChanged && templateStillBase) {
    t.workStart = defaultsNow.workStart;
    t.workEnd = defaultsNow.workEnd;
    t.otStart = defaultsNow.otStart;
    t.otEnd = defaultsNow.otEnd;
    t.breaks = structuredClone(defaultsNow.breaks || []);
  }

  // ขั้นสุดท้าย: ทำให้ default* สะท้อน template ของกะเริ่มต้นเสมอ (กัน UI งง)
  out.defaultWorkStart = t.workStart ?? out.defaultWorkStart;
  out.defaultWorkEnd = t.workEnd ?? out.defaultWorkEnd;
  out.defaultOtStart = t.otStart ?? out.defaultOtStart;
  out.defaultOtEnd = t.otEnd ?? out.defaultOtEnd;
  out.defaultBreaks = structuredClone(Array.isArray(t.breaks) ? t.breaks : (out.defaultBreaks || []));

  return out;
}



function getShiftTemplate(settings, shiftType) {
  const t = settings?.shiftTemplates?.[shiftType] || null;

  // Fallback (เพื่อรองรับข้อมูลเก่าที่ยังไม่มี shiftTemplates)
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

export function createStore() {
  const state = { settings: defaultSettings(), records: [], lastSavedAt: null };

  async function load() {
    const s = await getSettings();
    if (s) state.settings = normalizeSettings({ ...defaultSettings(), ...s });
    else state.settings = normalizeSettings(defaultSettings());
    const recs = await getAllRecords();
    state.records = (recs || []).map(r => normalizeRecord(r, state.settings));
    state.records.sort((a,b)=>a.date.localeCompare(b.date));
  }

  async function saveSettings(next) {
    state.settings = normalizeSettings({ ...state.settings, ...next });
    await putSettings(state.settings);
    state.lastSavedAt = nowISO();
  }

  function getRecord(date) {
    return state.records.find(r => r.date === date) || null;
  }

  async function upsertRecord(record) {
    const exists = getRecord(record.date);
    const now = nowISO();
    const rec = normalizeRecord({
      ...record,
      createdAt: exists?.createdAt || record.createdAt || now,
      updatedAt: now,
    }, state.settings);

    await putRecord(rec);

    const idx = state.records.findIndex(r => r.date === rec.date);
    if (idx >= 0) state.records[idx] = rec;
    else state.records.push(rec);

    state.records.sort((a,b)=>a.date.localeCompare(b.date));
    state.lastSavedAt = now;
    return rec;
  }

  async function removeRecord(date) {
    await deleteRecord(date);
    state.records = state.records.filter(r => r.date !== date);
    state.lastSavedAt = nowISO();
  }

  function normalizeRecord(r, settings) {
    const shiftType = r.shiftType || settings.defaultShiftType || 'day';
    const tmpl = getShiftTemplate(settings, shiftType);
    const record = {
      date: normalizeDateStr(r.date),
      shiftType,
      dayType: r.dayType || settings.defaultDayType || 'normal',
      attendance: r.attendance || 'present',

      workStart: r.workStart ?? tmpl.workStart ?? null,
      workEnd: r.workEnd ?? tmpl.workEnd ?? null,
      breaks: Array.isArray(r.breaks) ? r.breaks : structuredClone(tmpl.breaks || []),

      otStart: r.otStart ?? tmpl.otStart ?? null,
      otEnd: r.otEnd ?? tmpl.otEnd ?? null,

      otMultiplierManualEnabled: !!r.otMultiplierManualEnabled,
      otMultiplierManual: r.otMultiplierManual ?? '',

      allowancesDay: r.allowancesDay ?? 0,
      deductionsDay: r.deductionsDay ?? 0,

      shiftAllowanceOverride: r.shiftAllowanceOverride ?? '',

      tags: Array.isArray(r.tags) ? r.tags : [],
      note: r.note || '',

      createdAt: r.createdAt || null,
      updatedAt: r.updatedAt || null,
    };

    record.computed = computeComputed(record, settings);
    return record;
  }

  return { state, load, saveSettings, getRecord, upsertRecord, removeRecord };
}
