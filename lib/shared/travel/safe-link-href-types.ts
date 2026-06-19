/**
 * Tier1-B A — Safe Travel Link Href **model** 型（**pure types only**）
 *
 * 設計正本: docs/t11-tier1-b-safe-link-href-render-design.md（§13 + CEO 補正: href-capable model であって rendered anchor でない）
 *
 * ★ これは **display-safe な href-CAPABLE model であって、rendered anchor ではない**。
 *   `<a href>` の描画は **Tier1-B-C（別 GO）**。本型は「eligible な inert 参照を href にしてよい」状態を表す **data のみ**。
 *
 * 厳守:
 *   - `rendered: false`（まだ UI 描画していない）・`external: true`・`authoritative: false`。
 *   - **持たない**: executionAuthority / booking / calendar / action / livePrice / availability /
 *     cancellation / generatedUrl / private(red_line/preference) / raw userId / M2・Stargazer / diagnostics。
 *   - ★ Tier1-C render distinction: `source` + `generated` を **display-safe metadata** として carry
 *     （UI が manual と generated Maps 検索 hand-off を区別するため・raw intent を UI に渡さない）。
 */

import type { SafeTravelLinkSource } from "./safe-link-types";

/** display-safe な external hand-off href model（**rendered anchor でない**）。 */
export interface SafeTravelLinkHrefModel {
  kind: "external_handoff";
  /** = `SafeTravelLinkIntent.externalReference.value`（unchanged・mutate/生成/fetch しない）。 */
  handoffUrl: string;
  /** 中立 copy（予約語を含まない＝caller 責務）。 */
  label: string;
  /** ★ visibly external。 */
  external: true;
  /** ★ 非権威（予約/確定でない）。 */
  authoritative: false;
  /** ★ まだ UI 描画していない（`<a href>` は Tier1-B-C 別 GO）。 */
  rendered: false;
  /** ★ display-safe 区別用（intent.source を faithfully carry・source kind のみ・private でない）。 */
  source: SafeTravelLinkSource;
  /** ★ display-safe 区別用（`intent.generated === true` を faithfully carry。manual は false）。 */
  generated: boolean;
}

/** href 化を拒否した中立理由（任意・helper は null を返すが文書/将来用）。 */
export type SafeTravelLinkHrefRejectionReason = "not_eligible" | "invalid_input";
