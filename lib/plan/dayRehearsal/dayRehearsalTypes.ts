/**
 * lib/plan/dayRehearsal/dayRehearsalTypes.ts — Wave 2 Day Rehearsal 型定義（pure）
 *
 * 「今日のあなたの1日を先に試す」forward simulation の型。★最適化でなく simulation。
 *
 * 不変原則（CEO/GPT 2026-06-06 GO）:
 *   - strain / recovery / friction / convergence は **仮説的 estimate**（医学的・身体的事実でない）。
 *     予定密度・移動・余白・連続負荷から見た相対指標。生数字(score)は内部のみ・表示は level。
 *   - **evidence trace 必須**: 各推定が何を根拠にしたか + 入力が known/unknown/inferred のどれか。
 *   - unknown duration は unknown（捏造しない）。fake fatigue 禁止。人格診断しない。
 *   - 「risk」は Arrival Risk（確率/警告）でない。buffer/strain/friction が重なる convergence 仮説。
 *   - pure / READ のみ / Date 不使用 / 予定を動かさない / 修正案を作らない。
 */
import type { SlackStatus } from "@/lib/plan/feasibility/feasibilityTypes";
import type { TransportMode } from "@/lib/alter-morning/transport/types";
import type { TimeBucket } from "@/lib/plan/dayGraph/dayGraphTypes";
import type { DayMood } from "@/lib/plan/dayGraph/dayMood";

// ───────────────────────── Evidence trace ─────────────────────────

/** 各推定の根拠。known/unknown/inferred を区別し過剰主張を防ぐ。 */
export interface Evidence {
  /** human-readable な根拠（例: "packed density", "travel 35min"） */
  readonly basis: readonly string[];
  /** 実データ由来の入力（例: "explicit event duration", "feasibility slack"） */
  readonly known: readonly string[];
  /** 欠落した入力（例: "travel duration unknown"）。捏造しない印 */
  readonly unknown: readonly string[];
  /** 推定した入力（例: "strain from density (hypothesis)"）。事実でない印 */
  readonly inferred: readonly string[];
}

export type EstimateLevel = "low" | "moderate" | "high" | "unknown";

/** 仮説的推定。score は内部・相対 [0,∞)（表示しない）。level が観測トーンの出力。 */
export interface Estimate {
  readonly level: EstimateLevel;
  readonly score: number;
  readonly evidence: Evidence;
}

// ───────────────────────── 正規化入力（adapter が構築） ─────────────────────────

export interface RehearsalEventInput {
  readonly id: string;
  readonly timeBucket: TimeBucket;
  readonly durationMin: number;
  /** durationSource === "assumed_default"（仮置きの 60 分・事実扱いしない） */
  readonly durationAssumed: boolean;
  readonly sensitive: boolean;
}
export interface RehearsalTransitionInput {
  readonly mode: TransportMode;
  /** null = unknown（捏造しない） */
  readonly travelMin: number | null;
  /** duration が実測/明示由来か（heuristic は false 扱い=inferred） */
  readonly travelKnown: boolean;
  readonly bufferStatus: SlackStatus;
  /** status==="sufficient" のときのみ */
  readonly slackMin: number | null;
  /** status==="insufficient" のときのみ */
  readonly shortfallMin: number | null;
  /** event 間の gap 分（recovery 素材・null=不明） */
  readonly gapMin: number | null;
}
export interface RehearsalStep {
  readonly event: RehearsalEventInput;
  /** 最後の event は null */
  readonly transitionAfter: RehearsalTransitionInput | null;
}
export interface RehearsalInput {
  readonly date: string;
  readonly dayMood: DayMood;
  readonly density: "sparse" | "balanced" | "packed";
  /** InnerWeather.energyLevel（任意・null=未知でも動く degrade） */
  readonly baseEnergyLevel: number | null;
  readonly steps: readonly RehearsalStep[];
}

// ───────────────────────── 出力 ─────────────────────────

export type ConvergenceFactor = "buffer_short" | "strain_high" | "friction_high";
/** 「risk」相当。確率/警告でなく、何が重なったかの仮説。 */
export interface ConvergenceEstimate {
  readonly level: EstimateLevel;
  readonly factors: readonly ConvergenceFactor[];
  readonly evidence: Evidence;
}

export interface RehearsalStepResult {
  readonly stepIndex: number;
  readonly eventId: string;
  /** この event 後の累積 strain（仮説） */
  readonly cumulativeStrain: Estimate;
  /** transitionAfter の friction（最後は null） */
  readonly friction: Estimate | null;
  /** 余白 — feasibility 由来の**観測**（推定でない） */
  readonly bufferStatus: SlackStatus;
  /** slackMin（+）or -shortfallMin（観測・該当なしは null） */
  readonly bufferMin: number | null;
  /** gap の回復（最後は null） */
  readonly recovery: Estimate | null;
  /** buffer/strain/friction の重なり（最後は null） */
  readonly convergence: ConvergenceEstimate | null;
}

export type ViabilityOutlook = "holds" | "tight" | "breaks" | "unknown";
/** 1日成立（仮説）。holds=余裕 / tight=際どい / breaks=このままだと厳しい / unknown=入力不足。 */
export interface ViabilityEstimate {
  readonly outlook: ViabilityOutlook;
  readonly breaksAtStepIndex: number | null;
  readonly evidence: Evidence;
}

/** known/unknown の透明性（過剰主張の防止）。 */
export interface RehearsalCoverage {
  readonly transitionsTotal: number;
  readonly travelKnown: number;
  readonly travelUnknown: number;
  readonly eventsAssumedDuration: number;
}

export interface DayRehearsal {
  readonly date: string;
  /** ★Evidence UI: 予定の密度（観測・input から passthrough）。 */
  readonly density: "sparse" | "balanced" | "packed";
  readonly viability: ViabilityEstimate;
  readonly steps: readonly RehearsalStepResult[];
  readonly peakStrain: Estimate;
  readonly recoveryWindows: readonly number[];
  readonly convergencePoints: readonly number[];
  readonly coverage: RehearsalCoverage;
}

/**
 * ★Evidence「なぜ?」UI: day outlook の根拠を自然な日本語カテゴリに分けたもの（read-only disclosure 用）。
 * 生スコア・内部数値・level 名を出さない。known/unknown/inferred を観測/推定/未確定で分ける。
 */
export interface DayOutlookExplanation {
  readonly observed: readonly string[]; // 観測: この予定の並び / 移動の余白 / 予定の密度
  readonly inferred: readonly string[]; // 推定: 重なりやすさ / 詰まりやすさ / 一息つけそうな区間
  readonly uncertain: readonly string[]; // 未確定: 移動の余白を確認できない区間
}

// ───────────────────────── config（固定値・較正は backlog） ─────────────────────────

export interface DayRehearsalConfig {
  /** strain budget の基準（level 判定の分母素材） */
  readonly baseBudget: number;
  /** energyLevel(0-1) が低いほど budget を下げる重み */
  readonly energyBudgetWeight: number;
  readonly eventStrain: { readonly perHour: number; readonly eveningBump: number; readonly packedBump: number };
  readonly travelStrain: { readonly per30Min: number; readonly byMode: Readonly<Record<TransportMode, number>>; readonly unknownPenalty: number };
  readonly recovery: { readonly per30MinSlack: number; readonly capMin: number };
  readonly friction: { readonly shortfallPer30Min: number };
  /** score → level（low < lowMax ≤ moderate < highMin ≤ high） */
  readonly levelThresholds: { readonly lowMax: number; readonly highMin: number };
}

/** GPT 確定 2026-06-06: 固定初期値。較正は `second-self-map-calibration-backlog.md`（実データ後）。 */
export const DEFAULT_REHEARSAL_CONFIG: DayRehearsalConfig = {
  baseBudget: 3,
  energyBudgetWeight: 1,
  eventStrain: { perHour: 0.3, eveningBump: 0.2, packedBump: 0.3 },
  travelStrain: {
    per30Min: 0.5,
    byMode: { walk: 0.3, bicycle: 0.3, public_transit: 0.4, car: 0.2, taxi: 0.15, unknown: 0.3 },
    unknownPenalty: 0.2,
  },
  recovery: { per30MinSlack: 0.4, capMin: 90 },
  friction: { shortfallPer30Min: 0.6 },
  levelThresholds: { lowMax: 0.34, highMin: 0.67 },
};
