/**
 * dev/staging 限定 host route `/plan/dev-shift-draft` の三重ガード（SR B1b-2C-8-a）
 *
 * 役割: VLM 下書き取り込みの dev/staging 限定 host route の表示可否を判定する pure helper。
 *
 * 三重ガード:
 *   ① draftMode === "true"（`PLAN_SHIFT_DRAFT_HOST` 環境変数・明示 opt-in / 既定 false で dormant）
 *   ② supabaseUrl が STAGING_PROJECT_REF を含む（staging allowlist）
 *   ③ supabaseUrl が PRODUCTION_PROJECT_REF を含まない（production deny）
 *
 * いずれか NG → false（呼び元は `notFound()`）。production env では flag 未設定で構造的に不可視。
 *
 * 設計（CEO 補正・2026-06-01）:
 *   - 既存 `devFixtureHost.ts` の `isShiftFixtureHostAllowed` と**同 pattern**・STAGING/PROD ref も**再利用**。
 *   - 必要なら共通化は最小限（個別関数を残し、定数のみ import 再利用）。
 *   - B1b-2C-7 server action `extractShiftDraftAction` と**同じ三重ガード思想**を route 側で適用。
 *     server action 側は env 直接読みで guard、host route 側は本 helper で guard。
 *
 * 不変原則: pure（IO / LLM / DB / canvas / DOM / Date / random / env / fetch なし）。
 *   throw しない。本 helper は env を**受け取って**判定するだけ（process.env を読まない）。
 */

import {
  STAGING_PROJECT_REF,
  PRODUCTION_PROJECT_REF,
} from "./devFixtureHost";

export interface DraftHostEnv {
  /** `PLAN_SHIFT_DRAFT_HOST` 値。明示的に "true" のみ通す（"1" / "yes" は false）。 */
  draftMode: string | undefined;
  /** `NEXT_PUBLIC_SUPABASE_URL ?? SUPABASE_URL`。staging ref 含む / production ref 含まない の両方を要求。 */
  supabaseUrl: string | undefined;
}

/**
 * 三重ガードの全条件を満たせば true。いずれか欠ければ false。
 */
export function isShiftDraftHostAllowed(env: DraftHostEnv): boolean {
  const draftMode = env.draftMode === "true";
  const url = env.supabaseUrl ?? "";
  const isStaging = url.includes(STAGING_PROJECT_REF);
  const isProduction = url.includes(PRODUCTION_PROJECT_REF);
  return draftMode && isStaging && !isProduction;
}
