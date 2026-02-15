import { getAllRecords, getSettings, putRecord, putSettings, deleteRecord } from '../lib/db.js';
import { computeComputed } from '../lib/calc.js';
import { nowISO } from '../lib/time.js';

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

    workMultipliers: { normal: 1, holiday: 2, special: 3 },
    otMultipliers: { normal: 1.5, holiday: 2, special: 3 },

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

    allowancesMonthly: 0,
    deductionsMonthly: 0,

    weekStartsOn: 1,
    dateFormat: 'DD/MM/YYYY'
  };
}

export function createStore() {
  const state = { settings: defaultSettings(), records: [], lastSavedAt: null };

  async function load() {
    const s = await getSettings();
    if (s) state.settings = { ...defaultSettings(), ...s };
    const recs = await getAllRecords();
    state.records = (recs || []).map(r => normalizeRecord(r, state.settings));
    state.records.sort((a,b)=>a.date.localeCompare(b.date));
  }

  async function saveSettings(next) {
    state.settings = { ...state.settings, ...next };
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
    const record = {
      date: r.date,
      shiftType: r.shiftType || settings.defaultShiftType || 'day',
      dayType: r.dayType || settings.defaultDayType || 'normal',
      attendance: r.attendance || 'present',

      workStart: r.workStart ?? settings.defaultWorkStart ?? null,
      workEnd: r.workEnd ?? settings.defaultWorkEnd ?? null,
      breaks: Array.isArray(r.breaks) ? r.breaks : structuredClone(settings.defaultBreaks || []),

      otStart: r.otStart ?? settings.defaultOtStart ?? null,
      otEnd: r.otEnd ?? settings.defaultOtEnd ?? null,

      otMultiplierManualEnabled: !!r.otMultiplierManualEnabled,
      otMultiplierManual: r.otMultiplierManual ?? '',

      allowancesDay: r.allowancesDay ?? 0,
      deductionsDay: r.deductionsDay ?? 0,

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
