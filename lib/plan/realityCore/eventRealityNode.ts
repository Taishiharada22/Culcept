/**
 * EventRealityNodeV0 — 予定を「現実ノード」として編成する型契約（RC1a）
 *
 * 正本: docs/reality-core-guardrail-r05.md §2/§7 / CEO RC1 GO（2026-06-13・追加ガード 1-8）
 *
 * 思想: 新しい属性エンジンの発明ではなく **既存語彙の予定単位への編成（compile）**。
 *  - 値域は全て既存正本を参照: AnchorRigidity / LatencyTolerance / PlanItemFlexibility(authority.ts) /
 *    MovementResolutionStatus(transportTypes.ts) / PermissionLevel(permission-model.ts) /
 *    ProtectionReason(authority.ts) / interpersonalLoad は dayState の既存 union
 *  - domain enum の新造ゼロ（数値は number 0-1。新 union は realityAttribute.ts の安全制御語彙のみ）
 *
 * stable identity（CEO ガード 3）:
 *  - eventRealityNodeId = "ern:<date>:<anchorId>"（配列 index 不使用・表示順非依存・reload 不変）
 *  - sourceRefs に anchorId / dayGraphNodeId / dayGraphSnapshotId を保持
 *
 * leave-by（CEO ガード 8）: ETA 分布が無い限り value=null / departureStatus="unresolved" /
 *  whyUnresolved 明示。LSAT(lib/plan/reality/lsat.ts) に仮分布を作って食わせることを禁止。
 *
 * delayImpact（CEO ガード 4）: 本型に delayImpact は **存在しない**。drift シナリオなしの断定を
 *  構造的に不可能にするため、構造のみの cascadeSensitivity（debugOnly）を持つ。
 *  実 impact は RC2/RC3 で recomputeAfterDrift(post-event-recompute.ts) に実 drift を渡して判定する。
 */

import type { AnchorRigidity } from "@/lib/plan/external-anchor";
import type { TimeBucket } from "@/lib/plan/dayGraph/dayGraphTypes";
import type { LatencyTolerance } from "@/lib/plan/dayGraph/latencyToleranceMap";
import type { AnchorVerb } from "@/lib/plan/dayGraph/anchorVerbMap";
import type { MovementResolutionStatus } from "@/lib/plan/transport/transportTypes";
import type { PlanItemFlexibility, PlanItemOrigin, ProtectionReason } from "@/lib/plan/reality/authority";
import type { PermissionLevel } from "@/lib/plan/reality/permission/permission-model";
import type { DayStateBuildInput } from "@/lib/plan/dayState/dayStateTypes";
import type { RealityAttribute } from "./realityAttribute";

/** 既存 dayState 語彙の再利用（"high" | "low"。新 union を作らない） */
export type InterpersonalLoadValue = NonNullable<DayStateBuildInput["interpersonalLoadHint"]>;

/** leave-by 診断語彙（CEO/GPT 指定の安全制御語彙 — 偽 deadline 防止。domain enum ではない） */
export type LeaveByUnresolvedReason = "place_missing" | "route_missing" | "eta_source_missing";

/** fixedness は既存 3 語彙の束（整理統合 — 新しい意味論を足さない） */
export interface FixednessValue {
  readonly rigidity: AnchorRigidity; // "hard" | "soft"（external-anchor.ts）
  readonly latencyTolerance: LatencyTolerance; // dayGraph 計算済み
  readonly flexibility: PlanItemFlexibility; // authority.ts（v0 写像: hard→locked / soft→movable）
}

/** 介入可否 — 既存 governance からの導出 view（独自正本にしない。guardrail §5） */
export interface ChangeEligibilityValue {
  readonly canSuggestMove: boolean;
  readonly canSuggestShorten: boolean; // v0 は常に false（shortenable を立てる材料が無い）
  readonly canSuggestSkip: boolean; // v0 は常に false
  readonly canSuggestDelegate: false; // v0 固定（委任は対外コミュニケーションを含む）
  readonly requiresConfirmation: boolean;
  readonly requiresExternalCommunication: boolean;
  /** 守る理由（authority.ts）。blocked 要因が governance 由来でない場合は null（理由は evidenceRefs） */
  readonly blockedReason: ProtectionReason | null;
}

export interface EventRealityNodeV0 {
  readonly schemaVersion: 0;

  // ── stable identity（ガード 3） ──
  /** "ern:<date>:<anchorId>"。表示順・reload・再 compile で不変 */
  readonly eventRealityNodeId: string;
  /** 暦日（DayGraph キー） */
  readonly date: string;
  /** 主観日（05:00 境界 — 00:00-04:59 開始の予定は前日に属する） */
  readonly subjectiveDate: string;
  readonly sourceRefs: {
    readonly anchorId: string;
    readonly dayGraphNodeId: string;
    /** deterministic snapshot id（どの graph build から compile したか） */
    readonly dayGraphSnapshotId: string;
  };

  // ── 事実（DayGraph 計算済み値の転記。属性ではないため裸でよい） ──
  /** redact 済み表示ラベル（sensitive は EventNode 側で generic 化済み） */
  readonly displayLabel: string;
  readonly timeWindow: {
    readonly startHHMM: string;
    readonly endHHMM: string;
    readonly durationMin: number;
    readonly timeBucket: TimeBucket;
  };
  readonly verb: AnchorVerb;

  // ── reality 属性（全て RealityAttribute — 裸の値・数値を禁止） ──
  readonly fixedness: RealityAttribute<FixednessValue>;
  /** 場所確度 0-1。RC1 は常に unknown（場所解決の供給後に値が入る — 捏造しない） */
  readonly placeCertainty: RealityAttribute<number>;
  /** この予定への移動が必要か。transition が無ければ unknown（「不要」を断定しない） */
  readonly movementRequired: RealityAttribute<boolean>;
  /** 既存 MovementResolutionStatus。3-K では常に "unresolved" */
  readonly departureStatus: RealityAttribute<MovementResolutionStatus>;
  /** 出発限界。ETA 分布の供給まで常に value=null（ガード 8）。whyUnresolved を必ず持つ */
  readonly leaveBy: RealityAttribute<string> & {
    readonly whyUnresolved: ReadonlyArray<LeaveByUnresolvedReason>;
  };
  /**
   * 遅延が波及し得る「構造」があるか（後続に strict/tight 予定が存在するか）のみ。
   * 実際の影響判定ではない（ガード 4 — delayImpact は本型に存在しない）。常に debugOnly
   */
  readonly cascadeSensitivity: RealityAttribute<boolean>;
  /** 0-1 heuristic（duration×verb）。confidence ≤0.35・debugOnly・RC1 では行動判断に使わない（ガード 7） */
  readonly energyCost: RealityAttribute<number>;
  /** 対人負荷。構造化供給（Stage 1.5）まで unknown — withWhom 自由文から推測しない */
  readonly interpersonalLoad: RealityAttribute<InterpersonalLoadValue>;
  /** 秘書の自律度（permission-model.ts 0-5）。v0 上限 2（候補を提案）・不明は 0 + blocked */
  readonly permissionLevel: RealityAttribute<PermissionLevel>;
  /** 介入可否の導出 view。不明 origin は全 false + requiresConfirmation（ガード 6） */
  readonly changeEligibility: RealityAttribute<ChangeEligibilityValue>;

  // ── provenance 補助 ──
  /** origin の判定結果（governance 由来の透明性。判定不能は "unknown"） */
  readonly resolvedOrigin: PlanItemOrigin | "unknown";
}

/** EventRealityNodeV0 の 10 reality 属性キー（invariant 機械検証・fixture 走査用） */
export const EVENT_REALITY_ATTRIBUTE_KEYS = [
  "fixedness",
  "placeCertainty",
  "movementRequired",
  "departureStatus",
  "leaveBy",
  "cascadeSensitivity",
  "energyCost",
  "interpersonalLoad",
  "permissionLevel",
  "changeEligibility",
] as const;

export type EventRealityAttributeKey = (typeof EVENT_REALITY_ATTRIBUTE_KEYS)[number];
