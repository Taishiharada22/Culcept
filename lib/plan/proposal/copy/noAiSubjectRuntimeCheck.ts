/**
 * No-AI-Subject Runtime Check — Phase 3-J-2。
 *
 * 設計書: docs/alter-plan-phase3-predictive-day-orchestration-architecture.md
 *   §2.5 補正 invariant 34 / §3.1 J-2 / §10.4 Smoke 38
 *
 * 役割:
 *   ProposalChip / ProposalSheet が render する copy 文字列を dev mode で検査し、
 *   AI 主語混入を console.warn (= 非ブロッキング)。
 *   production では no-op (= cost 削減、 user 影響なし)。
 *
 * Smoke 38 (= J-7 で確認): 全 ProposalChip 経由の copy で violation 0 を確認。
 *
 * 注意: production import 禁止ではない (= 内部の lint module だが、 こちらは UI ランタイムで実行される dev helper)。
 *       testOverrideContext と異なり、 component から呼ぶことを想定。
 */

import { detectAiSubjectViolations } from "./noAiSubjectLint";

/**
 * dev mode で copy が AI 主語 pattern を含む場合 console.warn。
 * production では即 return (= no-op)。
 *
 * @param copy - 検査対象 copy 文字列
 * @param contextLabel - debug 用 context (= 例: "ProposalChip.headline")
 */
export function runtimeNoAiSubjectCheck(copy: string, contextLabel?: string): void {
  // production では skip (= performance + privacy、 user 影響なし)
  if (typeof process !== "undefined" && process.env?.NODE_ENV === "production") {
    return;
  }

  const violations = detectAiSubjectViolations(copy);
  if (violations.length === 0) return;

  // dev mode warning (= console.warn、 非ブロッキング)
  console.warn(
    `[Phase 3 No-AI-Subject Runtime Check]${contextLabel ? ` (${contextLabel})` : ""}: copy contains AI subject pattern: "${copy}"`,
    violations.map((v) => v.reason),
  );
}
