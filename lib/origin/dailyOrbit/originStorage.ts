// lib/origin/dailyOrbit/originStorage.ts
// 薄い localStorage wrapper — 将来 Supabase 同期に差し替えやすい構造
// Phase 3 以降の新規 client-side 資産はすべてこの wrapper 経由で保存する

const PREFIX = "origin_p3_";

type StorageBackend = {
  get: (key: string) => string | null;
  set: (key: string, value: string) => void;
  remove: (key: string) => void;
};

// 現在は localStorage。将来サーバー同期に差し替え可能
const localBackend: StorageBackend = {
  get: (key) => {
    try {
      return localStorage.getItem(PREFIX + key);
    } catch {
      return null;
    }
  },
  set: (key, value) => {
    try {
      localStorage.setItem(PREFIX + key, value);
    } catch {
      // quota exceeded — silent
    }
  },
  remove: (key) => {
    try {
      localStorage.removeItem(PREFIX + key);
    } catch {
      // silent
    }
  },
};

let backend: StorageBackend = localBackend;

/** テスト/将来用: バックエンドを差し替える */
export function setStorageBackend(b: StorageBackend): void {
  backend = b;
}

/** JSON値を保存 */
export function originStore<T>(key: string, value: T): void {
  backend.set(key, JSON.stringify(value));
}

/** JSON値を取得。なければ null */
export function originLoad<T>(key: string): T | null {
  const raw = backend.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** 値を削除 */
export function originRemove(key: string): void {
  backend.remove(key);
}

/** 最終表示日を記録して、クールダウン制御に使う */
export function originCooldown(key: string, cooldownMs: number): boolean {
  const last = originLoad<number>(key + "_ts");
  if (last && Date.now() - last < cooldownMs) return false; // まだクール中
  originStore(key + "_ts", Date.now());
  return true; // 表示OK
}

/** 日付キーで dismiss した日を記録 */
export function originDismiss(key: string, dateKey: string): void {
  originStore(key + "_dismissed", dateKey);
}

/** dismiss 済みかチェック */
export function originIsDismissed(key: string, dateKey: string): boolean {
  return originLoad<string>(key + "_dismissed") === dateKey;
}
