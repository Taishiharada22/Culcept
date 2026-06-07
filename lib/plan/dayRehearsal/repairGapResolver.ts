/**
 * lib/plan/dayRehearsal/repairGapResolver.ts — Repair Protect Signal → Gap Meaning Resolver v1（pure・read-only・unwired）
 *
 * protect signal（use_recovery_window）の `targetStepIndex` を、共有 DayGraph 上の **GapNode** に解決し、
 * 将来 Reality の gap-meaning `recovery`（INV-17）に渡せる中立 assertion を作る純粋層。
 * ★Reality に接続しない・ChangeSet を作らない・予定変更しない。GapNode 解決と recovery 表明を作るだけ。
 *
 * 不変原則 / 設計（Reality Bridge Contract Audit 2026-06-07 GO）:
 *   - 対象は **use_recovery_window のみ**。protect_buffer は **defer**（node 寄り・Option D dormant・ここでは解決しない=HARD GATE 遵守）。
 *   - ★targetStepIndex i は rehearsal と同じ `dayGraph.nodes.filter(event)[i]` に対応（呼び出し側は rehearsal を作った同一 dayGraph を渡す契約）。
 *     recovery gap = events[i] と events[i+1] の間。
 *   - ★**GapNode 解決は厳密 double time-match**（GapNode.startTime===events[i].endTime ∧ endTime===events[i+1].startTime）。
 *     **一意 match のときだけ解決**（0 match=overlap/skip / 2+ match=曖昧 は **skip**＝fail-safe・誤マップ皆無）。
 *     GapNode は disjoint 区間ゆえ 2+ は通常起こらないが防御的に除外。
 *   - 出力 `GapRecoveryAssertion` は中立 shape（**Reality enum を import しない**・gapNodeId=共有キー + 区間 + evidence）。
 *   - restrict-only / additive / reversible（gap を「残す」表明のみ・予定を動かさない）。
 *   - pure / Date 不使用 / 入力を破壊しない。
 *
 * 注: recovery gap は slack≥60min ⇒ gap≥60min > DEFAULT_MIN_GAP_MINUTES(30) ゆえ GapNode は skip されず生成される。
 *     overlap 周辺の稀ケースのみ match せず skip（coverage 欠落・正しさは不変）。
 */
import type { DayRepairKind } from "./dayRepairCandidates";
import type { Evidence } from "./dayRehearsalTypes";
import type { RepairProtectSignal } from "./repairProtectSignal";
import type { DayGraph, EventNode, GapNode } from "@/lib/plan/dayGraph/dayGraphTypes";

/** Reality gap-meaning `recovery`（INV-17）相当（Reality enum を import しない・doc 文字列）。 */
export type GapMeaningHint = "recovery";

/** 将来 Reality gap-meaning `recovery` に渡せる中立 assertion（GapNode 解決済）。 */
export interface GapRecoveryAssertion {
  /** 元 protect signal の kind（use_recovery_window）。 */
  readonly kind: DayRepairKind;
  /** 解決された GapNode の id（共有 DayGraph キー）。 */
  readonly gapNodeId: string;
  /** GapNode の時間範囲（id format 非依存の robust キー兼検証用・"HH:MM"）。 */
  readonly startTime: string;
  readonly endTime: string;
  /** gap-meaning hint。 */
  readonly meaning: GapMeaningHint;
  /** trace（signal 由来を保持）。 */
  readonly evidence: Evidence;
}

/**
 * protect signal を GapNode 解決し recovery assertion に変換（純粋・予定変更なし・Reality 非接続）。
 * - use_recovery_window のみ対象（protect_buffer は defer）。
 * - targetStepIndex → events[i]・events[i+1] → 厳密 double time-match で一意 GapNode を解決。
 * - 解決できないもの（event 不在 / overlap / 非一意）は **skip**（fail-safe・誤マップしない）。順序保持。
 * @param dayGraph rehearsal を構築した**同一** DayGraph（targetStepIndex↔events[i] 整合の前提）。
 */
export function resolveProtectSignalsToGapMeaning(
  signals: readonly RepairProtectSignal[],
  dayGraph: DayGraph,
): readonly GapRecoveryAssertion[] {
  const events = dayGraph.nodes.filter((n): n is EventNode => n.kind === "event");
  const gaps = dayGraph.nodes.filter((n): n is GapNode => n.kind === "gap");
  const out: GapRecoveryAssertion[] = [];

  for (const s of signals) {
    if (s.kind !== "use_recovery_window") continue; // protect_buffer 等は defer
    const i = s.targetStepIndex;
    if (i === null || i < 0) continue;

    const ev = events[i];
    const next = events[i + 1];
    if (!ev || !next) continue; // event[i] / event[i+1] 不在 → skip

    // 厳密 double time-match（一意のときだけ解決＝fail-safe）。
    const matches = gaps.filter((g) => g.startTime === ev.endTime && g.endTime === next.startTime);
    if (matches.length !== 1) continue; // 0=no match(overlap/skip) / 2+=曖昧 → skip
    const g = matches[0]!;

    out.push({
      kind: s.kind,
      gapNodeId: g.id,
      startTime: g.startTime,
      endTime: g.endTime,
      meaning: "recovery",
      evidence: s.evidence,
    });
  }

  return out;
}
