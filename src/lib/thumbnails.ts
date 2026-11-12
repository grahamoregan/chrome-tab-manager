/** Thumbnails live in IndexedDB keyed by normalised URL (= Link id). */

export interface Thumbnail {
  id: string;
  blob: Blob;
  capturedAt: number;
}

const DB_NAME = 'tabsort';
const STORE = 'thumbs';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        dbPromise = null;
        reject(req.error);
      };
    });
  }
  return dbPromise;
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function store(mode: IDBTransactionMode): Promise<IDBObjectStore> {
  return (await openDb()).transaction(STORE, mode).objectStore(STORE);
}

export async function getThumbnail(id: string): Promise<Thumbnail | undefined> {
  return wrap((await store('readonly')).get(id) as IDBRequest<Thumbnail | undefined>);
}

export async function putThumbnail(thumb: Thumbnail): Promise<void> {
  await wrap((await store('readwrite')).put(thumb));
}

/** Deletes thumbnails that aren't in `keepIds` and are older than `maxAgeMs`. */
export async function pruneThumbnails(keepIds: Set<string>, maxAgeMs: number, now = Date.now()): Promise<number> {
  const s = await store('readwrite');
  let removed = 0;
  await new Promise<void>((resolve, reject) => {
    const req = s.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return resolve();
      const t = cursor.value as Thumbnail;
      if (!keepIds.has(t.id) && now - t.capturedAt > maxAgeMs) {
        cursor.delete();
        removed++;
      }
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  });
  return removed;
}

/** Downscales a captured PNG/JPEG data URL to a small JPEG blob. Works in the service worker. */
export async function shrinkCapture(dataUrl: string, width = 400): Promise<Blob> {
  const src = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(src);
  const scale = Math.min(1, width / bitmap.width);
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2d context');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.72 });
}
