import { openDB } from 'idb';

const DB_NAME = 'ot-tracker-th-full';
const DB_VERSION = 1;
const STORE_RECORDS = 'records';
const STORE_SETTINGS = 'settings';

async function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_RECORDS)) {
        db.createObjectStore(STORE_RECORDS, { keyPath: 'date' });
      }
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
        db.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
      }
    }
  });
}

export async function putRecord(record) {
  const db = await getDB();
  await db.put(STORE_RECORDS, record);
}
export async function deleteRecord(date) {
  const db = await getDB();
  await db.delete(STORE_RECORDS, date);
}
export async function getAllRecords() {
  const db = await getDB();
  return db.getAll(STORE_RECORDS);
}
export async function putSettings(settings) {
  const db = await getDB();
  await db.put(STORE_SETTINGS, { key: 'app', value: settings });
}
export async function getSettings() {
  const db = await getDB();
  const row = await db.get(STORE_SETTINGS, 'app');
  return row?.value || null;
}
