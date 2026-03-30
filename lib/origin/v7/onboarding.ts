// lib/origin/v7/onboarding.ts
// Origin 初回体験判定ユーティリティ

import type { OriginV7Save } from "./types";

const ONBOARDED_KEY = "origin_onboarded";

/** 初回ユーザーかどうか */
export function isFirstTimeUser(save: OriginV7Save): boolean {
  return (
    save.chapters.length === 0 &&
    !save.draft &&
    !save.currentPosition
  );
}

/** オンボーディング完了フラグ取得 */
export function getOnboardedFlag(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(ONBOARDED_KEY) === "true";
}

/** オンボーディング完了をマーク */
export function markOnboarded(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ONBOARDED_KEY, "true");
  } catch {
    // QuotaExceededError
  }
}
