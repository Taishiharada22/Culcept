// lib/origin/v7/onboarding.ts
// Origin 初回体験判定ユーティリティ

import type { OriginV7Save } from "./types";

const ONBOARDED_KEY = "origin_onboarded";
const ONBOARDED_COOKIE = "origin_onboarded=1";

/** 初回ユーザーかどうか */
export function isFirstTimeUser(save: OriginV7Save): boolean {
  return (
    save.chapters.length === 0 &&
    !save.draft &&
    !save.currentPosition
  );
}

/** オンボーディング完了フラグ取得（localStorage → cookie → セーブデータの3段階） */
export function getOnboardedFlag(): boolean {
  if (typeof window === "undefined") return false;

  // 1. localStorage
  try {
    const val = localStorage.getItem(ONBOARDED_KEY);
    if (val && val !== "false" && val !== "0") return true;
  } catch {
    // SecurityError etc.
  }

  // 2. cookie fallback
  try {
    if (document.cookie.includes(ONBOARDED_COOKIE)) return true;
  } catch {
    // cookie access blocked
  }

  return false;
}

/** オンボーディング完了をマーク（localStorage + cookie 二重書き込み） */
export function markOnboarded(): void {
  if (typeof window === "undefined") return;

  // 1. localStorage（容量不足時は古いデータを整理して再試行）
  try {
    localStorage.setItem(ONBOARDED_KEY, "true");
  } catch {
    // QuotaExceededError: 不要データを掃除して再試行
    try {
      cleanupLocalStorage();
      localStorage.setItem(ONBOARDED_KEY, "true");
    } catch {
      // それでもダメなら cookie に頼る
    }
  }

  // 2. cookie fallback（365日有効）
  try {
    const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString();
    document.cookie = `${ONBOARDED_COOKIE}; path=/; expires=${expires}; SameSite=Lax`;
  } catch {
    // cookie write failed
  }
}

/** localStorage の容量を空けるためのクリーンアップ */
function cleanupLocalStorage(): void {
  try {
    // 既知の大きなキーで不要になりやすいものを削除候補に
    const expendableKeys = [
      // 古いバージョンのデータ
      "culcept_origin_memory_v6",
      "culcept_origin_memory_v5",
      "culcept_origin_memory_v4",
      // HMR/dev関連
      "__next_hmr_refresh_hash__",
      // 古い一時データ
      "aneurasync_alter_cache",
    ];

    for (const key of expendableKeys) {
      if (localStorage.getItem(key) !== null) {
        localStorage.removeItem(key);
      }
    }

    // それでも足りない場合: 100KB以上のキーで origin_onboarded 以外を探して警告
    const allKeys = Object.keys(localStorage);
    for (const key of allKeys) {
      if (key === ONBOARDED_KEY) continue;
      try {
        const val = localStorage.getItem(key);
        if (val && val.length > 100_000) {
          console.warn(`[Origin] localStorage key "${key}" is ${(val.length / 1024).toFixed(0)}KB — consider cleanup`);
        }
      } catch {
        // ignore
      }
    }
  } catch {
    // cleanup itself failed
  }
}
