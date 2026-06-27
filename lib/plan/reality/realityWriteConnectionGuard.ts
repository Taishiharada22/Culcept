/**
 * Reality write の接続先 guard（pure / no env / no IO）— P18
 *
 * 背景: reality の learning-event / review-decision / tendency-feedback の各 write は、
 *   従来 **flag 単独**（「production env で flag OFF」前提）でしか production を守っていなかった。
 *   lifeops / capture は P15 で flag に加え **接続先 guard**（staging-positive ∧ all-production-deny）
 *   を持つ二重防御に揃えたため、reality write も同型の guard を入れて plod を構造的に拒否する。
 *
 * 判定（lifeops staging-and-not-prod gate と同型）:
 *   - **staging-positive**: 接続先 URL が STAGING_PROJECT_REF(hjcr) を含む
 *   - **all-production-deny**: legacy PRODUCTION_PROJECT_REF(aljav) も active CLEAN_PRODUCTION_PROJECT_REF(plod)
 *     も含まない
 *   両方を満たす時のみ true。URL 未設定 / 不明 host / production 含有 はすべて false（fail-closed）。
 *
 * 不変: pure（process.env / IO / DB / fetch を読まない・呼ばない）。throw しない。
 *   URL 値を log / return しない（boolean のみ）。flag は呼出側が別途 AND する（本 helper は flag を見ない）。
 */

import {
  STAGING_PROJECT_REF,
  PRODUCTION_PROJECT_REF,
  CLEAN_PRODUCTION_PROJECT_REF,
} from "@/lib/plan/shift/devFixtureHost";

/**
 * reality write を接続先的に許可してよいか（staging-positive ∧ all-production-deny・fail-closed）。
 * 呼出側は `flag ∧ isRealityWriteConnectionAllowed(url)` の形で使う（flag OFF or 非 staging で write 0）。
 */
export function isRealityWriteConnectionAllowed(
  supabaseUrl: string | undefined
): boolean {
  const url = supabaseUrl ?? "";
  return (
    url.includes(STAGING_PROJECT_REF) &&
    !url.includes(PRODUCTION_PROJECT_REF) &&
    !url.includes(CLEAN_PRODUCTION_PROJECT_REF)
  );
}
