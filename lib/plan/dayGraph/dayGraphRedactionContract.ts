/**
 * DayGraph Redaction Contract — Phase 3-K (= K-1a)。
 *
 * 設計書: docs/alter-plan-phase3-k-daygraph-design.md §7
 *
 * 役割:
 *   sensitive 情報漏洩を型レベル + runtime で機械保証する contract。
 *   ProposalIntegrityContract と並ぶ privacy first 三重防御の一翼。
 *
 * 不変原則 (= Invariant 4 / 17 整合):
 *   - sensitive===true な EventNode は raw title / locationText を field 自体として持たない (= undefined)
 *   - displayLabel は **常に**存在 + 非空 (= sensitive でも generic 安全文字列)
 *   - sensitive node を含む transition も同様の redaction (= fromLocationText / toLocationText)
 *   - debug / ASCII 出力では displayLabel のみを使う (= raw title 触らない)
 */

import type { DayGraph } from "./dayGraphTypes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Contract definition
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface DayGraphRedactionContract {
  /** sensitive EventNode の title が undefined */
  readonly sensitiveTitleHidden: true;
  /** sensitive EventNode の locationText が undefined */
  readonly sensitiveLocationHidden: true;
  /** EventNode の displayLabel は常に非空文字列 */
  readonly displayLabelAlwaysPresent: true;
  /** sensitive proximity transition の location は undefined */
  readonly sensitiveTransitionLocationHidden: true;
}

export const DAY_GRAPH_REDACTION_CONTRACT: DayGraphRedactionContract = {
  sensitiveTitleHidden: true,
  sensitiveLocationHidden: true,
  displayLabelAlwaysPresent: true,
  sensitiveTransitionLocationHidden: true,
} as const;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Custom error class
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export class DayGraphRedactionError extends Error {
  override readonly name = "DayGraphRedactionError";
  readonly violation: keyof DayGraphRedactionContract;
  constructor(violation: keyof DayGraphRedactionContract, detail: string) {
    super(`[DayGraphRedaction] ${violation}: ${detail}`);
    this.violation = violation;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Compliance assertion
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 全 EventNode + MovementTransition について redaction 不変条件を verify。
 * 違反検出 → throw DayGraphRedactionError。
 */
export function assertRedactionCompliance(
  graph: DayGraph,
  // contract は signature に含めるが v1.0 では固定使用
  _contract: DayGraphRedactionContract = DAY_GRAPH_REDACTION_CONTRACT,
): void {
  for (const n of graph.nodes) {
    if (n.kind !== "event") continue;

    // 1. displayLabel は常に非空
    if (typeof n.displayLabel !== "string" || n.displayLabel.length === 0) {
      throw new DayGraphRedactionError(
        "displayLabelAlwaysPresent",
        `event node "${n.id}" missing or empty displayLabel`,
      );
    }

    // sensitive node 専用検査
    if (n.sensitive) {
      // 2. raw title 不可
      if (n.title !== undefined) {
        throw new DayGraphRedactionError(
          "sensitiveTitleHidden",
          `sensitive event "${n.id}" has raw title (= must be undefined)`,
        );
      }
      // 3. raw locationText 不可
      if (n.locationText !== undefined) {
        throw new DayGraphRedactionError(
          "sensitiveLocationHidden",
          `sensitive event "${n.id}" has raw locationText (= must be undefined)`,
        );
      }
    }
  }

  // 4. sensitive proximity な transition の location は undefined
  for (const t of graph.transitions) {
    if (!t.sensitiveProximity) continue;
    if (t.fromLocationText !== undefined) {
      throw new DayGraphRedactionError(
        "sensitiveTransitionLocationHidden",
        `transition ${t.fromNodeId}→${t.toNodeId} sensitive but has raw fromLocationText`,
      );
    }
    if (t.toLocationText !== undefined) {
      throw new DayGraphRedactionError(
        "sensitiveTransitionLocationHidden",
        `transition ${t.fromNodeId}→${t.toNodeId} sensitive but has raw toLocationText`,
      );
    }
  }
}
