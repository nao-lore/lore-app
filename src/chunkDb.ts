// PartialResult: generic shape for both worklog and handoff chunk partials
export type PartialResult = Record<string, unknown>;

const DB_NAME = 'threadlog_chunks';
const DB_VERSION = 1;
const STORE = 'sessions';

export interface ChunkSession {
  sourceHash: string;        // primary key
  chunks: string[];
  partials: Record<string, PartialResult>;  // index → result
  status: 'active' | 'completed';
  createdAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'sourceHash' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
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
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(hash);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function saveSession(session: ChunkSession): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(session);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteSession(hash: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(hash);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
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
