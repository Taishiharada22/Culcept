/**
 * dev/staging 限定 host route `/plan/dev-candidate-actions` の三重ガード（A1-6-8 render-only preview・§9.14）
 *
 * 役割: candidate action UI（A1-6-8 banner + buttons）の **render-only preview** host route の表示可否を判定する pure helper。
 *   製品の入口ではなく、staging/dev で UI を目視確認するための host。**production では構造的に不可視**。
 *
 * 三重ガード（devDraftHost.isShiftDraftHostAllowed と同 pattern・**定数のみ再利用**）:
 *   ① hostMode === "true"（`REALITY_CANDIDATE_ACTIONS_DEV_HOST`・明示 opt-in・既定 false で dormant）
 *   ② supabaseUrl が STAGING_PROJECT_REF を含む（staging allowlist）
 *   ③ supabaseUrl が PRODUCTION_PROJECT_REF を含まない（production deny）
 *   いずれか NG → false（呼び元は notFound()）。production env では flag 未設定で構造的に不可視。
 *
 * 不変原則: pure（IO / DB / DOM / Date / random / env / fetch なし）。throw しない。env を**受け取って**判定するだけ。
 */

import {
  STAGING_PROJECT_REF,
  PRODUCTION_PROJECT_REF,
  CLEAN_PRODUCTION_PROJECT_REF,
} from "@/lib/plan/shift/devFixtureHost";

export interface CandidateActionsPreviewEnv {
  /** `REALITY_CANDIDATE_ACTIONS_DEV_HOST` 値。明示的に "true" のみ通す（"1"/"yes" は false）。 */
  readonly hostMode: string | undefined;
  /** `NEXT_PUBLIC_SUPABASE_URL ?? SUPABASE_URL`。staging ref 含む / production ref 含まない の両方を要求。 */
  readonly supabaseUrl: string | undefined;
}

/** 三重ガードの全条件を満たせば true。いずれか欠ければ false（呼び元 notFound）。 */
export function isCandidateActionsPreviewHostAllowed(env: CandidateActionsPreviewEnv): boolean {
  const enabled = env.hostMode === "true";
  const url = env.supabaseUrl ?? "";
  const isStaging = url.includes(STAGING_PROJECT_REF);
  const isProduction = url.includes(PRODUCTION_PROJECT_REF) || url.includes(CLEAN_PRODUCTION_PROJECT_REF);
  return enabled && isStaging && !isProduction;
}
