/**
 * Reality read の接続先 guard（pure / no env / no IO）— E1 hero canary
 *
 * 背景: E1 hero canary は **実 anchor を read** する（write ではない）。read であっても production 実データに
 *   触れる以上、write guard（`realityWriteConnectionGuard`・P18）と同型の **接続先二重防御**を read 経路にも置く。
 *   flag 単独（env 依存）に頼らず、接続先 URL で plod/aljav を構造的に拒否する。
 *
 * 判定（write guard と同型・staging-and-not-prod）:
 *   - staging-positive: 接続先 URL が STAGING_PROJECT_REF(hjcr) を含む
 *   - all-production-deny: legacy PRODUCTION_PROJECT_REF(aljav) も active CLEAN_PRODUCTION_PROJECT_REF(plod) も含まない
 *   両方を満たす時のみ true。未設定 / 不明 host / production 含有 はすべて false（fail-closed）。
 *
 * 不変: pure（process.env / IO / DB / fetch を読まない）。throw しない。URL を log / return しない（boolean のみ）。
 *   呼出側は `flag ∧ canaryUser ∧ isRealityReadConnectionAllowed(url)` の形で AND する。
 */

import {
  STAGING_PROJECT_REF,
  PRODUCTION_PROJECT_REF,
  CLEAN_PRODUCTION_PROJECT_REF,
} from "@/lib/plan/shift/devFixtureHost";

/**
 * reality read（hero canary の実 anchor read）を接続先的に許可してよいか
 * （staging-positive ∧ all-production-deny・fail-closed）。flag は呼出側が別途 AND する。
 */
export function isRealityReadConnectionAllowed(supabaseUrl: string | undefined): boolean {
  const url = supabaseUrl ?? "";
  return (
    url.includes(STAGING_PROJECT_REF) &&
    !url.includes(PRODUCTION_PROJECT_REF) &&
    !url.includes(CLEAN_PRODUCTION_PROJECT_REF)
  );
}
