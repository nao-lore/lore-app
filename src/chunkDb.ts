// PartialResult: generic shape for both worklog and handoff chunk partials
export type PartialResult = Record<string, unknown>;

const DB_NAME = 'threadlog_chunks';
const DB_VERSION = 1;
const STORE = 'sessions';

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

export interface ChunkSession {
  sourceHash: string;        // primary key
  chunks: string[];
  partials: Record<string, PartialResult>;  // index → result
  status: 'active' | 'completed';
  createdAt: number;
  partialsChecksum?: number; // count of completed partials at last save (for resume integrity)
}

function openDb(): Promise<IDBDatabase> {
  return withTimeout(new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'sourceHash' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }), OPEN_TIMEOUT_MS, 'open');
}

export function computeSourceHash(text: string): string {
  // Sample-based hash: first 5k + length + last 5k
  const sample = text.slice(0, 5000) + '|L=' + text.length + '|' + text.slice(-5000);
  let h = 5381;
  for (let i = 0; i < sample.length; i++) {
    h = ((h << 5) + h + sample.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

export async function loadSession(hash: string): Promise<ChunkSession | null> {
  const db = await openDb();
  return withTimeout(new Promise<ChunkSession | null>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(hash);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  }), TX_TIMEOUT_MS, 'transaction');
}

export async function saveSession(session: ChunkSession): Promise<void> {
  const db = await openDb();
  return withTimeout(new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(session);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }), TX_TIMEOUT_MS, 'transaction');
}

export async function deleteSession(hash: string): Promise<void> {
  const db = await openDb();
  return withTimeout(new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(hash);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }), TX_TIMEOUT_MS, 'transaction');
}

export async function findSession(sourceText: string): Promise<{
  found: boolean;
  completedChunks: number;
  totalChunks: number;
} | null> {
  const hash = computeSourceHash(sourceText);
  const session = await loadSession(hash);
  if (!session || session.status === 'completed') return null;
  return {
    found: true,
    completedChunks: Object.keys(session.partials).length,
    totalChunks: session.chunks.length,
  };
}
