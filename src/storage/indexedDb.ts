// ─── IndexedDB fallback for large data ───
// Used when localStorage quota is exceeded.

const DB_NAME = 'lore-db';
const DB_VERSION = 1;
const STORE_NAME = 'logs';

const OPEN_TIMEOUT_MS = 10_000;
const TX_TIMEOUT_MS = 30_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`IndexedDB ${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

function openDb(): Promise<IDBDatabase> {
  return withTimeout(new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }), OPEN_TIMEOUT_MS, 'open');
}

export async function saveToIdb(key: string, data: unknown): Promise<void> {
  const db = await openDb();
  return withTimeout(new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(data, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }), TX_TIMEOUT_MS, 'transaction');
}

export async function loadFromIdb(key: string): Promise<unknown | null> {
  const db = await openDb();
  return withTimeout(new Promise<unknown | null>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  }), TX_TIMEOUT_MS, 'transaction');
}
