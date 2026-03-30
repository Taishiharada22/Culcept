// lib/origin/lifeProfile/store.ts
// localStorage永続化 + ユーティリティ

import type {
  LifeProfileStore,
  LifeProfileEntry,
  LifeProfileCategory,
  DepthResponse,
  CategoryDepth,
} from "./types";
import { CATEGORY_META } from "./types";

const STORAGE_KEY = "culcept_life_profile_v1";

function emptyStore(): LifeProfileStore {
  const now = new Date().toISOString();
  return {
    version: 1,
    entries: [],
    rendezvousConsentAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function loadLifeProfileStore(): LifeProfileStore {
  if (typeof window === "undefined") return emptyStore();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as LifeProfileStore;
      return { ...emptyStore(), ...parsed };
    }
    return emptyStore();
  } catch {
    return emptyStore();
  }
}

export function saveLifeProfileStore(store: LifeProfileStore): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...store, updatedAt: new Date().toISOString() }),
    );
  } catch {
    /* quota exceeded — silent */
  }
}

/** エントリIDを生成 */
export function newEntryId(): string {
  return `lp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

/** エントリを追加 */
export function addEntry(
  store: LifeProfileStore,
  entry: LifeProfileEntry,
): LifeProfileStore {
  return { ...store, entries: [...store.entries, entry] };
}

/** エントリを更新 */
export function updateEntry(
  store: LifeProfileStore,
  id: string,
  patch: Partial<LifeProfileEntry>,
): LifeProfileStore {
  return {
    ...store,
    entries: store.entries.map((e) =>
      e.id === id ? { ...e, ...patch, updatedAt: new Date().toISOString() } : e,
    ),
  };
}

/** エントリを削除 */
export function removeEntry(
  store: LifeProfileStore,
  id: string,
): LifeProfileStore {
  return { ...store, entries: store.entries.filter((e) => e.id !== id) };
}

/** 深掘り回答を追加 */
export function addDepthResponse(
  store: LifeProfileStore,
  entryId: string,
  response: DepthResponse,
): LifeProfileStore {
  return {
    ...store,
    entries: store.entries.map((e) =>
      e.id === entryId
        ? {
            ...e,
            depthResponses: [...e.depthResponses, response],
            updatedAt: new Date().toISOString(),
          }
        : e,
    ),
  };
}

/** カテゴリ別にエントリを取得 */
export function getEntriesByCategory(
  store: LifeProfileStore,
  category: LifeProfileCategory,
): LifeProfileEntry[] {
  return store.entries.filter((e) => e.category === category);
}

/** カテゴリごとの深度を計算 */
export function getCategoryDepths(
  store: LifeProfileStore,
): CategoryDepth[] {
  const categories = Object.keys(CATEGORY_META) as LifeProfileCategory[];

  return categories.map((category) => {
    const entries = store.entries.filter((e) => e.category === category);
    const meta = CATEGORY_META[category];
    const totalDepthAnswers = entries.reduce(
      (sum, e) => sum + e.depthResponses.length,
      0,
    );
    const totalDepthQuestions = entries.length * meta.depthQuestions.length;

    // 完成度: エントリ有無(40%) + 深掘り回答率(60%)
    const hasEntry = entries.length > 0 ? 40 : 0;
    const depthRate =
      totalDepthQuestions > 0
        ? (totalDepthAnswers / totalDepthQuestions) * 60
        : 0;

    return {
      category,
      entryCount: entries.length,
      totalDepthAnswers,
      totalDepthQuestions,
      completeness: Math.min(100, Math.round(hasEntry + depthRate)),
    };
  });
}

/** 全体の自己理解深度を計算 (0-100) */
export function getOverallDepth(store: LifeProfileStore): number {
  const depths = getCategoryDepths(store);
  if (depths.length === 0) return 0;
  const total = depths.reduce((sum, d) => sum + d.completeness, 0);
  return Math.round(total / depths.length);
}

/** まだ回答していない深掘り質問を取得 */
export function getNextDepthQuestion(
  entry: LifeProfileEntry,
): string | null {
  const meta = CATEGORY_META[entry.category];
  const answeredQuestions = new Set(entry.depthResponses.map((r) => r.question));
  return meta.depthQuestions.find((q) => !answeredQuestions.has(q)) ?? null;
}

/** Rendezvous同意を記録 */
export function setRendezvousConsent(
  store: LifeProfileStore,
): LifeProfileStore {
  return { ...store, rendezvousConsentAt: new Date().toISOString() };
}
