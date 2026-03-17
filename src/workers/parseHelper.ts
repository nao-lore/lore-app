export function parseJsonInWorker(text: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./parseWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ result?: unknown; error?: string }>) => {
      worker.terminate();
      if (e.data.error) {
        reject(new Error(e.data.error));
      } else {
        resolve(e.data.result);
      }
    };
    worker.onerror = (e) => { worker.terminate(); reject(e); };
    worker.postMessage(text);
  });
}
