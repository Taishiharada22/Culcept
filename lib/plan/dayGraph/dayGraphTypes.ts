/**
 * DayGraph 型定義 — Phase 3-K Layer 0 (= K-1a)。
 *
 * 設計書: docs/alter-plan-phase3-k-daygraph-design.md
 *   §4 Types / §22 v1.1 audit 補正
 *
 * 役割:
 *   1 日の構造 (= start → events → gaps → end + movement transitions) を
 *   computed projection として表現する型群。
 *
 * 不変原則:
 *   - Pure: 永続 entity ではない、 anchors から都度計算
 *   - mutation 不可 (= readonly すべての field)
 *   - LLM 不使用 (= Invariant 12)
 *   - sensitive redaction 型レベル強制 (= Invariant 4)
 *   - anchor mutation 不可 (= Invariant 10)
 *   - layered design 予約 (= 3-L で MovementSegment 昇格、 attribute 注入)
 *
 * 範囲外:
 *   - Movement の duration / mode / route (= 3-L)
 *   - Arrival Risk (= 3-M)
 *   - Counter-Factual alternative graph (= 3-N)
 *   - UI rendering / DB persistence
 */

import type {
  AnchorRigidity,
  AnchorSensitiveCategory,
  ExternalAnchor,
} from "@/lib/plan/external-anchor";
import type { LocationCategory } from "@/lib/plan/location-category";

import type { AnchorVerb } from "./anchorVerbMap";
import type { DayMood } from "./dayMood";
import type { LatencyTolerance } from "./latencyToleranceMap";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** default observation boundary start (= 設計 §5、 起床想定ではなく観測境界) */
export const DEFAULT_BOUNDARY_START_TIME = "06:00";
/** default observation boundary end (= 設計 §5、 就寝想定ではなく観測境界) */
export const DEFAULT_BOUNDARY_END_TIME = "23:00";
/** event の最小可視 gap 閾値 (= 設計 §6.2 / v1.1 維持) */
export const DEFAULT_MIN_GAP_MINUTES = 30;
/** endTime 欠落時の default duration (= v1.1 §22.2) */
export const DEFAULT_EVENT_DURATION_MIN = 60;
/**
 * snapshotId algorithm version (= 設計 §9、 cache invalidation 用)。
 * v2（RC2a-6A）: anchor 内容 revision（時刻/場所/companions/rigidity 等の content hash）を追加。
 *   v1 は date+anchorID集合+day境界+gap のみで anchor 内容変化を拾えず、RC2a identity chain
 *   （momentSnapshotCacheKey/graphBaseId/snapshotId）が collide していた根を修正。
 */
export const SNAPSHOT_ID_VERSION = "v2";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TimeBucket (= 7 帯)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type TimeBucket =
  | "early_morning" // 05:00-08:00
  | "morning"       // 08:00-11:00
  | "noon"          // 11:00-14:00
  | "afternoon"     // 14:00-17:00
  | "evening"       // 17:00-20:00
  | "night"         // 20:00-23:00
  | "late_night";   // 23:00-05:00 (= 翌日跨ぎ含む)

/**
 * TimeBucket canonical order (= v1.2 §22.9、 K-1f-β)。
 *
 * `DayGraphAttributes.timeBucketCoverage` を deterministic Array に変換する際の順序。
 * 同 input → 同 output を保証する (= snapshotId と同思想)。
 */
export const TIME_BUCKET_CANONICAL_ORDER: ReadonlyArray<TimeBucket> = [
  "early_morning",
  "morning",
  "noon",
  "afternoon",
  "evening",
  "night",
  "late_night",
] as const;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// BoundaryRationale (= StartNode / EndNode の意味出所)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface BoundaryRationale {
  /** 設定の出所 */
  readonly type: "default" | "user_override" | "future_observed";
  /** 将来 user 設定 phase で活用 (= 現状 undefined) */
  readonly note?: string;
  /** local time zone 想定 (= 将来 explicit 化予定) */
  readonly timezone: "local";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DayGraphNode (= 4 種、 Movement は別 transitions 配列)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type DayGraphNodeKind = "start" | "event" | "gap" | "end";

interface DayGraphNodeBase {
  /** node id (= unique 内 graph、 anchor 由来 EventNode は anchor.id を流用) */
  readonly id: string;
  readonly kind: DayGraphNodeKind;
  /** anchor 由来 = explicit、 計算生成 = implicit */
  readonly origin: "explicit" | "implicit";
  /** "HH:MM" local time、 anchor の local time と整合 */
  readonly startTime: string;
  /** "HH:MM" local time */
  readonly endTime: string;
  /** 分単位 (= endTime - startTime、 StartNode/EndNode は 0) */
  readonly durationMin: number;
  /** 時間帯 tag (= startTime ベースで分類) */
  readonly timeBucket: TimeBucket;
}

export interface StartNode extends DayGraphNodeBase {
  readonly kind: "start";
  readonly origin: "implicit";
  /** observation boundary (= 起床想定ではない、 §5) */
  readonly boundaryRationale: BoundaryRationale;
}

export interface EndNode extends DayGraphNodeBase {
  readonly kind: "end";
  readonly origin: "implicit";
  /** observation boundary (= 就寝想定ではない、 §5) */
  readonly boundaryRationale: BoundaryRationale;
}

/**
 * EventNode の duration 由来 (= v1.2 §22.8、 K-1f-α 補正)。
 *
 * 3-L / 3-M / 3-N で「仮置きの 60 分」 を事実扱いしないために導入。
 *   - "explicit":        anchor.endTime が明示されており、 EventNode.durationMin は user 由来
 *   - "assumed_default": anchor.endTime 欠落、 DEFAULT_EVENT_DURATION_MIN で補完済
 *
 * `boundaryClipped` (= 別 field) と直交:
 *   - durationSource × boundaryClipped で 4 状態を区別
 *   - 「明示 endTime が boundary で clip された」 と
 *     「仮置きの 60 分が boundary で clip された」 を後 phase で区別可能
 */
export type DurationSource = "explicit" | "assumed_default";

export interface EventNode extends DayGraphNodeBase {
  readonly kind: "event";
  readonly origin: "explicit";
  /** anchor.id 流用 (= unique 保証) */
  readonly anchorId: string;
  /** 常に安全な表示用ラベル (= sensitive なら generic、 非 sensitive なら title 等) */
  readonly displayLabel: string;
  /**
   * Raw title (= sensitive===true なら undefined = field 自体が欠落)。
   * privacy first (= Invariant 4)。
   */
  readonly title?: string;
  /** Raw locationText (= sensitive===true なら undefined) */
  readonly locationText?: string;
  /** location 分類補助 (= movement 判定には使わない、 v1.1 §22.3) */
  readonly locationCategory?: LocationCategory;
  /** anchor.title + locationText から推論 (= unknown 含む 7 値) */
  readonly verb: AnchorVerb;
  /** anchor.rigidity 継承 */
  readonly rigidity: AnchorRigidity;
  /**
   * Required field (= v1.1 §22.5、 inferLatencyTolerance が常に値返す)。
   * 3-M で activate 予定、 3-K では値持つだけ。
   */
  readonly latencyTolerance: LatencyTolerance;
  /**
   * duration の由来 (= v1.2 §22.8、 K-1f-α)。
   * 後 phase で「仮置きの時間を事実扱いしない」 ために使用。
   */
  readonly durationSource: DurationSource;
  /**
   * endTime が observation boundary を超えたため clip されたか (= v1.2 §22.8、 K-1f-α)。
   * durationSource と直交する別軸 (= explicit / assumed 共に clipped 可能)。
   */
  readonly boundaryClipped: boolean;
  /** sensitive flag (= anchor.sensitiveCategory != null) */
  readonly sensitive: boolean;
  /** anchor.sensitiveCategory (= 種類分類、 displayLabel branching 用) */
  readonly sensitiveCategory?: AnchorSensitiveCategory;
  /** 同日他 EventNode との時刻 overlap (= detectTimedAnchorOverlaps 由来 anchor id list) */
  readonly overlapsWithNodeIds: ReadonlyArray<string>;
}

export interface GapNode extends DayGraphNodeBase {
  readonly kind: "gap";
  readonly origin: "implicit";
  /**
   * gap の前後 event の sensitive flag が「OR」 で true なら true。
   * view shared で redaction 候補。
   */
  readonly sensitiveProximity: boolean;
}

export type DayGraphNode = StartNode | EndNode | EventNode | GapNode;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DayGraphEdge (= sequential 接続、 attribute 拡張余地)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface DayGraphEdge {
  readonly fromNodeId: string;
  readonly toNodeId: string;
  /** 現状 sequential のみ。 将来 "alternative" / "branch" 追加可能 */
  readonly kind: "sequential";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MovementTransition (= node ではなく separate 配列、 §4.5)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 連続 EventNode 間の location 変化を表す transition。
 * 3-K では時刻 / duration / mode 未確定 (= "unresolved")。
 *
 * 3-L で MovementSegment 相当に attribute 注入で昇格:
 *   - timingStatus: "resolved"
 *   - startTime / endTime / durationMin / mode / source 確定
 *
 * 3-K の重要不変原則:
 *   - sensitive node の locationText は EventNode で undefined のため、
 *     transition の fromLocationText / toLocationText も undefined に伝搬
 *   - sensitiveProximity flag で privacy 状態を保持
 */
export interface MovementTransition {
  readonly fromNodeId: string;
  readonly toNodeId: string;
  /** 3-K では常に "unresolved"、 3-L で "resolved" になる */
  readonly timingStatus: "unresolved";
  /** sensitive なら undefined (= privacy first) */
  readonly fromLocationText?: string;
  /** sensitive なら undefined */
  readonly toLocationText?: string;
  /** 前後 EventNode どちらかが sensitive なら true */
  readonly sensitiveProximity: boolean;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DayGraphAttributes (= day-level 集計、 §4.6)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface DayGraphAttributes {
  /** "YYYY-MM-DD" */
  readonly date: string;
  /** 既存 inferDayMood 再利用 */
  readonly dayMood: DayMood;
  /** event node 数 (= anchor 数の有効分) */
  readonly anchorCount: number;
  /** verb 別 count (= AnchorVerb 7 値全 key を含む、 v1.1 §22.4) */
  readonly verbDistribution: Readonly<Record<AnchorVerb, number>>;
  /** 1 日の密度 (= 設計 §4.6) */
  readonly density: "sparse" | "balanced" | "packed";
  /**
   * event が触れた時間帯集合 (= canonical order の Array、 v1.2 §22.9、 JSON-safe)。
   * 順序は TIME_BUCKET_CANONICAL_ORDER 固定 (= early_morning → late_night)。
   * 「集合」 として扱うが Set ではない理由は JSON.stringify 互換性のため。
   */
  readonly timeBucketCoverage: ReadonlyArray<TimeBucket>;
  /** overlap event が存在するか */
  readonly hasOverlap: boolean;
  /** sensitive event が存在するか */
  readonly hasSensitive: boolean;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Top-level DayGraph
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface DayGraph {
  /** deterministic cache key (= §9、 crypto なし) */
  readonly snapshotId: string;
  readonly attributes: DayGraphAttributes;
  /** 時系列順 + cycle なし (= IntegrityContract で機械保証) */
  readonly nodes: ReadonlyArray<DayGraphNode>;
  readonly edges: ReadonlyArray<DayGraphEdge>;
  /** event-to-event transitions (= nodes と分離) */
  readonly transitions: ReadonlyArray<MovementTransition>;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Build options + result
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface BuildDayGraphOptions {
  /** observation boundary start、 default "06:00" */
  readonly startTime?: string;
  /** observation boundary end、 default "23:00" */
  readonly endTime?: string;
  /** gap node 生成最小単位、 default 30 */
  readonly minGapMinutes?: number;
}

export interface BuildDayGraphInput {
  /** anchorsForDay で expand 済 anchors (= caller 責任) */
  readonly anchors: ReadonlyArray<ExternalAnchor>;
  /** "YYYY-MM-DD" */
  readonly date: string;
  readonly options?: BuildDayGraphOptions;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Warnings (= 設計 §8、 invalid anchor を黙って skip しない)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type DayGraphWarningKind =
  | "invalid_time"             // startTime / endTime が strict "HH:MM" parse 不能
  | "missing_date"             // one_off だが date undefined / 不正
  | "end_before_start"         // endTime <= startTime
  | "unsupported_anchor_kind"  // 不明な anchorKind (= 防御的)
  | "duplicate_anchor_id"      // 同 id を 2 個以上検出
  | "anchor_outside_boundary"; // anchor の startTime が options の boundary 外

export interface DayGraphWarning {
  readonly kind: DayGraphWarningKind;
  /** 該当 anchor の id (= 特定可能な場合) */
  readonly anchorId?: string;
  /** 内部 detail、 dev console / Sentry 用。 UI 露出禁止 (= Invariant 17) */
  readonly detail: string;
}

export interface BuildDayGraphResult {
  readonly graph: DayGraph;
  readonly warnings: ReadonlyArray<DayGraphWarning>;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DayGraphView (= view perspective、 §10)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type DayGraphView =
  | "user_self"     // user 自身が見る (= displayLabel 表示可、 raw 既に redacted)
  | "shared_view";  // 他人と共有 (= sensitive event を完全 generic placeholder 化)

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers — exhaustive switch (= 設計 §4.7)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Discriminated union 網羅性を type level + runtime で verify。
 * 新 node kind を将来追加する際に compile-time error で抜けを検出。
 *
 * Usage:
 *   switch (node.kind) {
 *     case "start": ...; break;
 *     case "event": ...; break;
 *     case "gap":   ...; break;
 *     case "end":   ...; break;
 *     default: exhaustiveDayGraphNodeKindCheck(node);
 *   }
 */
export function exhaustiveDayGraphNodeKindCheck(node: never): never {
  throw new Error(
    `exhaustive check failed: unhandled DayGraphNode kind ${JSON.stringify(node)}`,
  );
}
