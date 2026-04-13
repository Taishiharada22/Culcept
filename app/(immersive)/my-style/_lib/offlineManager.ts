"use client";

const SYNC_QUEUE_KEY = "culcept_sync_queue_v1";

export type SyncQueueItem = {
  id: string;
  endpoint: string;
  method: "POST" | "PUT";
  body: string;
  createdAt: number;
  retries: number;
};

/** Check if the browser is online */
export function isOnline(): boolean {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}

/** Load pending sync items from localStorage */
export function loadSyncQueue(): SyncQueueItem[] {
  try {
    const raw = localStorage.getItem(SYNC_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

/** Save sync queue to localStorage */
function saveSyncQueue(queue: SyncQueueItem[]): void {
  try { localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue)); } catch { /* ignore */ }
}

/** Add an item to the sync queue (for offline use) */
export function enqueueSync(endpoint: string, method: "POST" | "PUT", body: object): void {
  const queue = loadSyncQueue();
  queue.push({
    id: `sync_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    endpoint,
    method,
    body: JSON.stringify(body),
    createdAt: Date.now(),
    retries: 0,
  });
  saveSyncQueue(queue);
}

/** Process the sync queue - attempt to send all pending items */
export async function processSyncQueue(): Promise<{ success: number; failed: number; needsReauth: boolean }> {
  if (!isOnline()) return { success: 0, failed: 0, needsReauth: false };

  const queue = loadSyncQueue();
  if (queue.length === 0) return { success: 0, failed: 0, needsReauth: false };

  let success = 0;
  let failed = 0;
  let needsReauth = false;
  const remaining: SyncQueueItem[] = [];

  for (const item of queue) {
    try {
      const res = await fetch(item.endpoint, {
        method: item.method,
        headers: { "Content-Type": "application/json" },
        body: item.body,
      });
      if (res.ok) {
        success++;
      } else if (res.status === 401) {
        // 認証切れ — キューに残して再認証後にリトライ
        console.warn("[offlineManager] 401: 再認証が必要です");
        remaining.push(item);
        needsReauth = true;
      } else {
        item.retries++;
        if (item.retries < 5) remaining.push(item);
        else failed++;
      }
    } catch {
      item.retries++;
      if (item.retries < 5) remaining.push(item);
      else failed++;
    }
  }

  saveSyncQueue(remaining);
  return { success, failed, needsReauth };
}

/** Get pending sync count */
export function getPendingSyncCount(): number {
  return loadSyncQueue().length;
}

/** Clear old sync items (older than 24h) */
export function cleanStaleSyncItems(): void {
  const queue = loadSyncQueue();
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  saveSyncQueue(queue.filter(item => item.createdAt > cutoff));
}
