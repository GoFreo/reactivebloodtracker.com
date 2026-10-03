const DB_NAME = "rht-db";
const DB_VERSION = 1;
export const STORES = ["glucose", "food", "diary"];

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const store of STORES) {
        if (!db.objectStoreNames.contains(store)) {
          const os = db.createObjectStore(store, { keyPath: "id" });
          os.createIndex("timestamp", "timestamp");
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

function tx(storeName, mode) {
  return openDB().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

export function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Sorts most-recent-first. `timestamp` alone isn't a reliable tiebreaker: the
// datetime-local inputs only carry minute precision (matching what the input
// itself can show/edit), so two readings logged moments apart in the same
// minute get an identical timestamp. `id` always carries full millisecond
// precision from makeId() above regardless, and stays a valid string-sortable
// tiebreak for the lifetime of this app (Date.now() is 13 digits until year 2286).
export function compareRecentFirst(a, b) {
  const diff = new Date(b.timestamp) - new Date(a.timestamp);
  return diff !== 0 ? diff : b.id.localeCompare(a.id);
}

export async function addEntry(storeName, entry) {
  const record = { id: makeId(), ...entry };
  const store = await tx(storeName, "readwrite");
  await new Promise((resolve, reject) => {
    const req = store.add(record);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
  // Lets "Keep my devices in sync" send new entries soon after they're saved.
  try {
    window.dispatchEvent(new CustomEvent("rht-record-added", { detail: { store: storeName } }));
  } catch {}
  return record;
}

// Saves records that came from another device (see cloudSync.js), keeping
// their ids. One transaction; an id already here is left as it is.
export async function addSyncedEntries(storeName, records) {
  if (!records.length) return 0;
  const store = await tx(storeName, "readwrite");
  return new Promise((resolve, reject) => {
    let added = 0;
    const t = store.transaction;
    for (const r of records) {
      const req = store.add(r);
      req.onsuccess = () => added++;
      req.onerror = (e) => {
        // Already here: skip it. preventDefault stops the duplicate from
        // aborting the whole transaction; stopPropagation keeps it quiet.
        e.preventDefault();
        e.stopPropagation();
      };
    }
    t.oncomplete = () => resolve(added);
    t.onabort = () => reject(t.error);
  });
}

export async function getAllEntries(storeName) {
  const store = await tx(storeName, "readonly");
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
