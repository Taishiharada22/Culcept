/**
 * composeGate — 予定追加 compose 体験の単一 gate（A-4b・pure）。
 *
 * 設計書: docs/alter-plan-add-anchor-timeline-redesign-proposal.md（A-4b）/ §9
 *
 * shouldUseComposeSheet: flag が明示 true のときだけ compose 体験を使う。
 *   - false / undefined 相当 → legacy AddAnchorModal（既存・完全不変）
 *   - 将来 canary 等を足す場合もここに集約し、呼び出し側（PlanClient.openAdd 分岐）を変えない。
 *
 * 範囲外: env 読み取り（PLAN_FLAGS は server-only。値は page.tsx 経由で client に渡る）。
 */

export function shouldUseComposeSheet(composeTimelineEnabled: boolean): boolean {
  return composeTimelineEnabled === true;
}
