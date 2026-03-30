import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  isOnline,
  loadSyncQueue,
  enqueueSync,
  processSyncQueue,
  getPendingSyncCount,
  cleanStaleSyncItems,
} from "@/app/(immersive)/my-style/_lib/offlineManager";

/* ── Mocks ── */

const mockStorage: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (key: string) => mockStorage[key] ?? null,
  setItem: (key: string, value: string) => {
    mockStorage[key] = value;
  },
  removeItem: (key: string) => {
    delete mockStorage[key];
  },
  clear: () => {
    Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
  },
  length: 0,
  key: (_index: number) => null as string | null,
};

beforeEach(() => {
  Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
  vi.stubGlobal("localStorage", mockLocalStorage);
  vi.stubGlobal("navigator", { onLine: true });
  vi.restoreAllMocks();
});

/* ── Tests ── */

describe("offlineManager", () => {
  it("isOnline returns true when navigator.onLine is true", () => {
    vi.stubGlobal("navigator", { onLine: true });
    expect(isOnline()).toBe(true);
  });

  it("isOnline returns true when navigator is undefined (server-side)", () => {
    vi.stubGlobal("navigator", undefined);
    expect(isOnline()).toBe(true);
  });

  it("enqueueSync adds item to queue", () => {
    enqueueSync("/api/test", "POST", { data: 1 });
    const queue = loadSyncQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].endpoint).toBe("/api/test");
    expect(queue[0].method).toBe("POST");
    expect(JSON.parse(queue[0].body)).toEqual({ data: 1 });
    expect(queue[0].retries).toBe(0);
  });

  it("enqueueSync preserves existing items", () => {
    enqueueSync("/api/first", "POST", { a: 1 });
    enqueueSync("/api/second", "PUT", { b: 2 });
    const queue = loadSyncQueue();
    expect(queue).toHaveLength(2);
    expect(queue[0].endpoint).toBe("/api/first");
    expect(queue[1].endpoint).toBe("/api/second");
  });

  it("processSyncQueue sends pending items", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", mockFetch);

    enqueueSync("/api/a", "POST", { x: 1 });
    enqueueSync("/api/b", "POST", { y: 2 });

    const result = await processSyncQueue();
    expect(result.success).toBe(2);
    expect(result.failed).toBe(0);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Queue should be empty after success
    expect(loadSyncQueue()).toHaveLength(0);
  });

  it("processSyncQueue retries failed items up to 5 times", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    vi.stubGlobal("fetch", mockFetch);

    enqueueSync("/api/fail", "POST", { z: 1 });

    const result = await processSyncQueue();
    expect(result.success).toBe(0);
    expect(result.failed).toBe(0); // not yet failed (only 1 retry so far)

    const queue = loadSyncQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].retries).toBe(1);
  });

  it("processSyncQueue removes items after 5 retries", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    vi.stubGlobal("fetch", mockFetch);

    // Manually set an item with retries = 4
    const item = {
      id: "sync_test",
      endpoint: "/api/doomed",
      method: "POST" as const,
      body: JSON.stringify({ fail: true }),
      createdAt: Date.now(),
      retries: 4,
    };
    mockStorage["culcept_sync_queue_v1"] = JSON.stringify([item]);

    const result = await processSyncQueue();
    expect(result.failed).toBe(1); // retries 4 -> 5, removed
    expect(loadSyncQueue()).toHaveLength(0);
  });

  it("processSyncQueue skips when offline", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    enqueueSync("/api/test", "POST", { data: 1 });

    const result = await processSyncQueue();
    expect(result.success).toBe(0);
    expect(result.failed).toBe(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("cleanStaleSyncItems removes items older than 24h", () => {
    const oldItem = {
      id: "sync_old",
      endpoint: "/api/old",
      method: "POST" as const,
      body: "{}",
      createdAt: Date.now() - 25 * 60 * 60 * 1000, // 25 hours ago
      retries: 0,
    };
    const freshItem = {
      id: "sync_fresh",
      endpoint: "/api/fresh",
      method: "POST" as const,
      body: "{}",
      createdAt: Date.now(),
      retries: 0,
    };
    mockStorage["culcept_sync_queue_v1"] = JSON.stringify([oldItem, freshItem]);

    cleanStaleSyncItems();

    const queue = loadSyncQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].id).toBe("sync_fresh");
  });

  it("getPendingSyncCount returns correct count", () => {
    expect(getPendingSyncCount()).toBe(0);

    enqueueSync("/api/a", "POST", {});
    expect(getPendingSyncCount()).toBe(1);

    enqueueSync("/api/b", "POST", {});
    expect(getPendingSyncCount()).toBe(2);
  });
});
