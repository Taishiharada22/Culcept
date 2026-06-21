/**
 * UX-6b-2a: Travel personalization の **local-only consent state**（`plan_travel_personalization_consent_v0`）。
 *
 * 「あなたの性格傾向を旅行プランに反映する」同意。既定 **OFF**・明示 opt-in のみ・revoke で即 no-op・**solo 限定**。
 *
 * 規律:
 *   - **localStorage のみ**（DB/Supabase なし）。production 永続テーブルは UX-6b-2c（別 migration GO）。
 *   - 防御的 parse（壊れた JSON / schema 不一致 → DEFAULT_CONSENT）。SSR 安全（storage 注入・null 許容）。
 *   - companions は本 consent の対象外（scope="solo" 固定・pair は別 consent・HOLD）。
 */

import { safeSetItem } from "@/lib/stargazer/localStorageHelper";

export const TRAVEL_PERSONALIZATION_CONSENT_KEY = "plan_travel_personalization_consent_v0";

export interface TravelPersonalizationConsent {
  /** ユーザーが personality→travel 反映を明示同意したか（既定 false）。 */
  granted: boolean;
  /** 同意時刻 ISO（granted=true の時のみ非 null）。 */
  grantedAt: string | null;
  /** 対象範囲。本 consent は solo のみ（companions は別 consent・HOLD）。 */
  scope: "solo";
}

export const DEFAULT_CONSENT: TravelPersonalizationConsent = {
  granted: false,
  grantedAt: null,
  scope: "solo",
};

/** テスト注入用の最小 Storage 面（window.localStorage 互換）。 */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function getBrowserStorage(): StorageLike | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null; // SecurityError 等（private mode）
  }
}

/** consent を読む。未保存 / 壊れ / granted!=true → DEFAULT_CONSENT（OFF）。 */
export function loadConsent(storage: StorageLike | null): TravelPersonalizationConsent {
  if (!storage) return DEFAULT_CONSENT;
  try {
    const raw = storage.getItem(TRAVEL_PERSONALIZATION_CONSENT_KEY);
    if (!raw) return DEFAULT_CONSENT;
    const obj = JSON.parse(raw) as unknown;
    if (obj && typeof obj === "object") {
      const o = obj as Record<string, unknown>;
      // granted=true ∧ grantedAt が string の時のみ ON。scope は常に solo（companions を昇格させない）。
      if (o.granted === true && typeof o.grantedAt === "string") {
        return { granted: true, grantedAt: o.grantedAt, scope: "solo" };
      }
    }
    return DEFAULT_CONSENT;
  } catch {
    return DEFAULT_CONSENT;
  }
}

function writeConsent(storage: StorageLike, c: TravelPersonalizationConsent): void {
  const json = JSON.stringify(c);
  if (typeof window !== "undefined" && storage === window.localStorage) {
    safeSetItem(TRAVEL_PERSONALIZATION_CONSENT_KEY, json);
  } else {
    try {
      storage.setItem(TRAVEL_PERSONALIZATION_CONSENT_KEY, json);
    } catch {
      // fail-soft（保存失敗で UI を壊さない）
    }
  }
}

/** 明示同意（grantedAt は caller が現在時刻を注入＝決定論・test 可能）。 */
export function grantConsent(storage: StorageLike, nowIso: string): TravelPersonalizationConsent {
  const c: TravelPersonalizationConsent = { granted: true, grantedAt: nowIso, scope: "solo" };
  writeConsent(storage, c);
  return c;
}

/** 撤回（即 no-op に戻す）。 */
export function revokeConsent(storage: StorageLike): TravelPersonalizationConsent {
  writeConsent(storage, DEFAULT_CONSENT);
  return DEFAULT_CONSENT;
}
