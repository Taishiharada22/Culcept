// lib/architecture/offlineObservation.ts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Offline-First Daily Observation（オフライン観測）
//
// 脳科学的根拠:
// 習慣ループ（Charles Duhigg）のRoutine（行動）を
// 外部環境（電波状況）に依存させると、習慣形成が阻害される。
// オフラインでも観測可能にすることで、
// 「Cue → Routine → Reward」のループが途切れない。
//
// 設計思想:
// 1. 今日の質問セット（5問）をIndexedDBにプリキャッシュ
// 2. オフラインでも回答を記録（IndexedDBに保存）
// 3. オンライン復帰時に自動同期（Background Sync API）
// 4. ストリークが「電波がなかった」で途切れない
//
// 既存資産:
// - public/sw.js が Background Sync (sync-actions) をサポート済み
// - IndexedDBアクセスの基盤が存在
//
// 世界参照: Duolingo（オフラインレッスン）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 1. Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** オフラインキャッシュされた質問セット */
export interface CachedQuestionSet {
  /** キャッシュ日（YYYY-MM-DD） */
  date: string;
  /** 質問リスト */
  questions: CachedQuestion[];
  /** セッションラベル */
  sessionLabel: string;
  /** キャッシュされた時刻（ISO） */
  cachedAt: string;
  /** 有効期限（ISO） */
  expiresAt: string;
}

export interface CachedQuestion {
  /** 質問ID */
  id: string;
  /** 質問テキスト */
  prompt: string;
  /** 選択肢 */
  options: { id: string; label: string; score: number }[];
  /** 軸ID */
  axisId: string;
  /** 質問タイプ */
  type: "state" | "context" | "deep" | "shadow" | "delta";
}

/** オフラインで保存された回答 */
export interface PendingAnswer {
  /** 回答ID（UUID） */
  id: string;
  /** 質問ID */
  questionId: string;
  /** 軸ID */
  axisId: string;
  /** 選択した選択肢のID */
  selectedOptionId: string;
  /** スコア */
  score: number;
  /** 回答時刻（ISO） */
  answeredAt: string;
  /** 応答時間（ms） */
  responseTimeMs: number;
  /** 回答変更があったか */
  wasChanged: boolean;
  /** 同期状態 */
  syncStatus: "pending" | "syncing" | "synced" | "failed";
  /** 同期試行回数 */
  syncAttempts: number;
}

/** オフライン同期の状態 */
export interface OfflineSyncState {
  /** 未同期の回答数 */
  pendingCount: number;
  /** 最後の同期時刻（ISO） */
  lastSyncAt: string | null;
  /** オンライン状態 */
  isOnline: boolean;
  /** 同期中か */
  isSyncing: boolean;
  /** ストリークが保護されているか */
  streakProtected: boolean;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 2. IndexedDB Operations
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const DB_NAME = "aneurasync_offline_v1";
const DB_VERSION = 1;
const STORE_QUESTIONS = "cached_questions";
const STORE_ANSWERS = "pending_answers";

/**
 * IndexedDBを開く
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not available"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_QUESTIONS)) {
        db.createObjectStore(STORE_QUESTIONS, { keyPath: "date" });
      }
      if (!db.objectStoreNames.contains(STORE_ANSWERS)) {
        const store = db.createObjectStore(STORE_ANSWERS, { keyPath: "id" });
        store.createIndex("syncStatus", "syncStatus", { unique: false });
        store.createIndex("answeredAt", "answeredAt", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 3. Question Set Caching
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 今日の質問セットをIndexedDBにキャッシュ
 *
 * 呼び出しタイミング:
 * - ホームページロード時（オンライン時）
 * - Service WorkerのBackground Fetch
 */
export async function cacheQuestionSet(
  questionSet: CachedQuestionSet,
): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_QUESTIONS, "readwrite");
    const store = tx.objectStore(STORE_QUESTIONS);
    await promisifyRequest(store.put(questionSet));
    db.close();
  } catch (err) {
    console.warn("[offlineObservation] Failed to cache questions:", err);
  }
}

/**
 * キャッシュされた今日の質問セットを取得
 */
export async function getCachedQuestionSet(
  date: string,
): Promise<CachedQuestionSet | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_QUESTIONS, "readonly");
    const store = tx.objectStore(STORE_QUESTIONS);
    const result = await promisifyRequest<CachedQuestionSet | undefined>(
      store.get(date),
    );
    db.close();

    if (!result) return null;

    // 有効期限チェック
    if (new Date(result.expiresAt) < new Date()) {
      return null;
    }

    return result;
  } catch {
    return null;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 4. Answer Storage (Offline)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 回答をオフライン保存
 *
 * オンラインでもオフラインでも、まずIndexedDBに保存。
 * その後、同期を試みる。
 */
export async function saveAnswerOffline(
  answer: Omit<PendingAnswer, "syncStatus" | "syncAttempts">,
): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_ANSWERS, "readwrite");
    const store = tx.objectStore(STORE_ANSWERS);

    const pendingAnswer: PendingAnswer = {
      ...answer,
      syncStatus: "pending",
      syncAttempts: 0,
    };

    await promisifyRequest(store.put(pendingAnswer));
    db.close();

    // オンラインなら即座に同期を試みる
    if (typeof navigator !== "undefined" && navigator.onLine) {
      requestSync();
    }
  } catch (err) {
    console.warn("[offlineObservation] Failed to save answer:", err);
  }
}

/**
 * 未同期の回答を全て取得
 */
export async function getPendingAnswers(): Promise<PendingAnswer[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_ANSWERS, "readonly");
    const store = tx.objectStore(STORE_ANSWERS);
    const index = store.index("syncStatus");
    const results = await promisifyRequest<PendingAnswer[]>(
      index.getAll("pending"),
    );
    db.close();
    return results ?? [];
  } catch {
    return [];
  }
}

/**
 * 回答の同期状態を更新
 */
export async function updateAnswerSyncStatus(
  id: string,
  status: PendingAnswer["syncStatus"],
): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_ANSWERS, "readwrite");
    const store = tx.objectStore(STORE_ANSWERS);
    const existing = await promisifyRequest<PendingAnswer | undefined>(
      store.get(id),
    );

    if (existing) {
      existing.syncStatus = status;
      existing.syncAttempts += 1;
      await promisifyRequest(store.put(existing));
    }

    db.close();
  } catch (err) {
    console.warn("[offlineObservation] Failed to update sync status:", err);
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 5. Sync Engine
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Background Syncをリクエスト
 */
function requestSync(): void {
  if (typeof navigator === "undefined") return;
  if ("serviceWorker" in navigator && "sync" in (navigator.serviceWorker as unknown as { sync: unknown })) {
    navigator.serviceWorker.ready
      .then((registration) => {
        // Background Sync APIが利用可能な場合
        (registration as unknown as { sync: { register: (tag: string) => Promise<void> } })
          .sync.register("sync-observations");
      })
      .catch(() => {
        // Background Sync APIが利用できない場合、直接同期
        syncPendingAnswers();
      });
  } else {
    // Background Sync APIがない場合、直接同期
    syncPendingAnswers();
  }
}

/**
 * 未同期の回答をサーバーに同期
 *
 * Service Workerの sync イベントから呼ばれるか、
 * オンライン復帰時に直接呼ばれる。
 */
export async function syncPendingAnswers(): Promise<{
  synced: number;
  failed: number;
}> {
  const pending = await getPendingAnswers();
  let synced = 0;
  let failed = 0;

  for (const answer of pending) {
    try {
      await updateAnswerSyncStatus(answer.id, "syncing");

      const response = await fetch("/api/stargazer/observations", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: answer.questionId,
          axisId: answer.axisId,
          selectedOptionId: answer.selectedOptionId,
          score: answer.score,
          answeredAt: answer.answeredAt,
          responseTimeMs: answer.responseTimeMs,
          wasChanged: answer.wasChanged,
          offlineSync: true,
        }),
      });

      if (response.ok) {
        await updateAnswerSyncStatus(answer.id, "synced");
        synced++;
      } else {
        await updateAnswerSyncStatus(answer.id, "failed");
        failed++;
      }
    } catch {
      await updateAnswerSyncStatus(answer.id, "pending");
      failed++;
    }
  }

  return { synced, failed };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 6. Sync State & Online Listener
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 現在の同期状態を取得
 */
export async function getOfflineSyncState(): Promise<OfflineSyncState> {
  const pending = await getPendingAnswers();

  return {
    pendingCount: pending.length,
    lastSyncAt: null, // TODO: 永続化
    isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
    isSyncing: false,
    streakProtected: pending.length > 0,
  };
}

/**
 * オンライン復帰時の自動同期をセットアップ
 *
 * 使い方（レイアウトコンポーネント等で）:
 * ```
 * useEffect(() => {
 *   const cleanup = setupOnlineListener();
 *   return cleanup;
 * }, []);
 * ```
 */
export function setupOnlineListener(): () => void {
  if (typeof window === "undefined") return () => {};

  const handler = () => {
    console.log("[offlineObservation] Online detected — syncing pending answers");
    syncPendingAnswers();
  };

  window.addEventListener("online", handler);
  return () => window.removeEventListener("online", handler);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 7. Internal Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
