import { computeComputed } from '../lib/calc.js';
import { nowISO } from '../lib/time.js';

const STORAGE_KEY = 'ot-tracker-th-static-v1';

export function defaultSettings() {
  return {
    schemaVersion: 1,
    employeeId: '',
    department: '',

    // Privacy
    privacyHideMoney: false,

    // Salary
    baseSalary: 12000,
    workingDaysPerMonth: 26,   // เดย์ปรับได้ (26/30)
    standardHoursPerDay: 8,

    workMultipliers: { normal: 1, holiday: 2, special: 3 },
    otMultipliers:   { normal: 1.5, holiday: 2, special: 3 },

    // Defaults for new records
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

    weekStartsOn: 1,     // 1=Mon, 0=Sun
    dateFormat: 'DD/MM/YYYY'
  };
}

function safeParse(jsonStr) {
  try { return JSON.parse(jsonStr); } catch { return null; }
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

export function createStore() {
  const state = {
    settings: defaultSettings(),
    records: [],
    lastSavedAt: null,
  };

  function _save() {
    const payload = {
      settings: state.settings,
      records: state.records,
      lastSavedAt: nowISO(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    state.lastSavedAt = payload.lastSavedAt;
  }

  function load() {
    const raw = localStorage.getItem(STORAGE_KEY);
    const data = raw ? safeParse(raw) : null;
    if (data?.settings) state.settings = { ...defaultSettings(), ...data.settings };
    const s = state.settings;

    const recs = Array.isArray(data?.records) ? data.records : [];
    state.records = recs
      .filter(r => r && typeof r.date === 'string')
      .map(r => normalizeRecord(r, s))
      .sort((a,b)=>a.date.localeCompare(b.date));

    state.lastSavedAt = data?.lastSavedAt || null;
  }

  function saveSettings(next) {
    state.settings = { ...state.settings, ...next };
    // recompute all records because rates/breaks/standard hours might change
    state.records = (state.records || []).map(r => normalizeRecord(r, state.settings));
    _save();
  }

  function getRecord(date) {
    return state.records.find(r => r.date === date) || null;
  }

  function upsertRecord(record) {
    const exists = getRecord(record.date);
    const now = nowISO();
    const rec = normalizeRecord({
      ...record,
      createdAt: exists?.createdAt || record.createdAt || now,
      updatedAt: now,
    }, state.settings);

    const idx = state.records.findIndex(r => r.date === rec.date);
    if (idx >= 0) state.records[idx] = rec;
    else state.records.push(rec);

    state.records.sort((a,b)=>a.date.localeCompare(b.date));
    _save();
    return rec;
  }

  function removeRecord(date) {
    const idx = state.records.findIndex(r => r.date === date);
    if (idx >= 0) {
      state.records.splice(idx, 1);
      _save();
      return true;
    }
    return false;
  }

  function replaceAll(nextState) {
    const s = { ...defaultSettings(), ...(nextState?.settings || {}) };
    state.settings = s;
    state.records = (nextState?.records || []).map(r => normalizeRecord(r, s)).sort((a,b)=>a.date.localeCompare(b.date));
    _save();
  }

  function clearAll() {
    state.settings = defaultSettings();
    state.records = [];
    _save();
  }

  return { state, load, saveSettings, getRecord, upsertRecord, removeRecord, replaceAll, clearAll };
}
