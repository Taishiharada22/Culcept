/**
 * RealityJudgmentInputV0 — RJ 判断器の入力契約（RJ1a・pure core 限定）
 *
 * 正本: docs/reality-graph-contract-hardening-rg06.md §1 / CEO RJ1a GO（2026-06-13）
 *
 * 思想: RJ（判断層）は RealityGraphSnapshot（編成層）を消費して判断する。本型はその境界契約。
 *   RC2a-6 で確立した「単一正本」規律を踏襲する。
 *
 * 独立裁定（CEO 仕様への adjudication・前提を疑う）:
 *   CEO は ern/cs/mv/decisionDebt/missingInputRefs/inputRevisionSet/derivationVersionSet を input の
 *   field として列挙したが、**それらは全て graphSnapshot に内包済み**。複製すると mismatch を生む
 *   （RC2a-6 adjudication C と同じ轍）。よって本型は **graphSnapshot を単一正本として参照**し、
 *   sub-field はそこ経由でアクセスする。新規 field は targetScope と pending marker のみ。
 *
 * pending marker（CEO RJ1a §sourceType note）: sources-map（ExternalAnchorSource）は identity chain に
 *   未配線（sourceType は capture-time の provenance fact で実質不変 = 検証済み・別 input）。よって
 *   sourcesRevisionPending / sourceRecordRevisionPending を明示し、RJ が「sources 由来の判断材料は
 *   未確定」と扱えるようにする。
 */

import type { RealityGraphSnapshotV0 } from "./realityGraphSnapshot";

/** 判断対象の範囲。v0 は event（単一予定の成立性）と day（今日=upcoming の rollup） */
export type TargetScope =
  | { readonly kind: "event"; readonly eventRealityNodeId: string }
  | { readonly kind: "day" };

/** identity / trace 用の決定的キー（raw text を含まない） */
export function targetScopeKey(scope: TargetScope): string {
  return scope.kind === "event" ? `event:${scope.eventRealityNodeId}` : "day";
}

export interface RealityJudgmentInputV0 {
  readonly schemaVersion: 0;
  /**
   * **単一正本**（ern/cs/mv/decisionDebt/momentSnapshot/missingInputRefs/inputRevisionSet/
   * derivationVersionSet を内包・複製しない）。RJ はここからのみ材料を読む。
   */
  readonly graphSnapshot: RealityGraphSnapshotV0;
  readonly targetScope: TargetScope;
  /** sources-map（sourceType 等）は identity chain 未配線 = pending。RJ は sources 由来材料を未確定扱い */
  readonly sourcesRevisionPending: true;
  /** 個別 source record の revision も未追跡 = pending */
  readonly sourceRecordRevisionPending: true;
}

/**
 * RealityGraphSnapshot + targetScope から判断入力を組む（pure・複製しない）。
 * targetScope が event の場合、対象 ern が snapshot に存在することを検証（不在は throw = 別 graph 由来の疑い）。
 */
export function buildRealityJudgmentInput(
  graphSnapshot: RealityGraphSnapshotV0,
  targetScope: TargetScope,
): RealityJudgmentInputV0 {
  if (targetScope.kind === "event") {
    const exists = graphSnapshot.eventRealityNodes.some((e) => e.eventRealityNodeId === targetScope.eventRealityNodeId);
    if (!exists) {
      throw new Error(`buildRealityJudgmentInput: targetScope.eventRealityNodeId "${targetScope.eventRealityNodeId}" が snapshot に存在しない`);
    }
  }
  return {
    schemaVersion: 0,
    graphSnapshot,
    targetScope,
    sourcesRevisionPending: true,
    sourceRecordRevisionPending: true,
  };
}
