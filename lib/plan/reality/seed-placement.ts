/**
 * Reality Control OS — Seed Placement（A1-4-1 配置可能材料への変換・判定のみ）
 *
 * 親設計: docs/aneurasync-reality-candidate-generator-design.md §4h（A1-4-0 mini design）
 *
 * 役割: PlanSeed（揺らぎの希望）を、Complete が将来「予定として置けるか」を判断するための
 *   **構造化・redacted な配置可能材料 `SeedPlacement`** に変換する。
 *   ＝ seed を「いつ・何分・どれだけ確からしいか」の *材料* に落とすだけで、
 *   **候補（CandidateDraft）も add op も一切作らない**（Complete は A1-4-2 以降の別 slice）。
 *
 * 【中核原則（独立分析・A1-4-0 由来）】:
 *   - **Gap-1**: PlanSeed に duration 欄が無い。ゆえに実 seed の durationMin は常に null（durationSource=unknown）。
 *     → **duration 不明 ⇒ not placeable**（第一級の保守・捏造しない。default duration を勝手に置かない）。
 *   - **Gap-2 回避**: SourceTrace（lossy・自由文 reason）でなく **PlanSeed から直接** 構造化フィールドのみ写す。
 *   - **raw text 不持込**: signal / desiredAction（自由文）は読まない・持ち込まない。seedRef(id)・enum・数値・日付のみ。
 *   - **二軸分離**: duration 軸 = placeable（置ける材料か）/ confidence 軸 = grounding（どれだけ確からしいか→tentative 材料）。
 *     「置くべきか/どう置くか」（skip/tentative）は dispositionHint として *材料* で保持し、結合は将来 Complete が行う。
 *
 * 制約: 純関数のみ。I/O・DB・Date.now・LLM・PRM 接続なし。additive / reversible / test-first。
 *       barrel 未追加・runtime 未接続。
 */

import type { PlanSeed, PlanSeedTimeHint } from "../plan-seed";
import type { ActionShape } from "../../stargazer/alterHomeAdapter";

/** desiredTimeHint 由来の **ソフト** 時間帯（hard earliest/latest にしない）。 */
export type TimeBand = "morning" | "afternoon" | "evening";

/**
 * 配置の希望時間帯（ソフト）。clock 数値は持たない（day active window / PRM での分解像は将来）。
 * `window` 不在 = 帯の希望なし（anytime / 未指定）。
 */
export interface TimeWindow {
  readonly band: TimeBand;
}

/**
 * duration の出所（provenance）。durationMin が non-null のときその根拠を示す。
 *   - `seed_explicit`: ユーザーが明示（現状 PlanSeed に duration 欄が無いので発生しない）
 *   - `prm_typical`: PRM 学習由来（将来 A1-4-3）
 *   - `correction`: 修正記憶由来（将来）
 *   - `unknown`: 不明（durationMin = null）
 */
export type DurationSource = "seed_explicit" | "prm_typical" | "correction" | "unknown";

/** actionShape 由来の配置 disposition ヒント（最終決定でなく材料）。 */
export type SeedDispositionHint = "place" | "tentative" | "skip";

/** 配置材料の確からしさ（confidence 由来）。weak は tentative 扱いの材料。 */
export type PlacementGrounding = "strong" | "weak";

/**
 * 配置可能材料。PlanSeed を Complete が判断できる構造化形に落としたもの。
 * **raw text を持たない**（seedRef は id・自由文なし）。**候補ではない**。
 */
export interface SeedPlacement {
  /** 由来 seed の id（= 監査用 traceability。raw text でない） */
  readonly seedRef: string;
  /** 希望日（YYYY-MM-DD / 未指定）。desiredDate をそのまま写す（解釈しない） */
  readonly date?: string;
  /** 希望時間帯（ソフト / 未指定なら帯希望なし） */
  readonly window?: TimeWindow;
  /** 所要時間（分）。**不明は null**（推測しない・第一級値） */
  readonly durationMin: number | null;
  /** durationMin の出所 */
  readonly durationSource: DurationSource;
  /** 配置 disposition ヒント（actionShape 由来・材料） */
  readonly dispositionHint: SeedDispositionHint;
  /** 抽出時の確からしさ（0..1） */
  readonly confidence: number;
  /** 確からしさ区分（confidence 由来・weak は tentative 材料） */
  readonly grounding: PlacementGrounding;
}

/** confidence 弱根拠の閾値（source-trace.isWeaklyGrounded と整合）。confidence < 0.5 → weak。 */
export const WEAK_CONFIDENCE_THRESHOLD = 0.5;

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.min(1, Math.max(0, x));
}

/** desiredTimeHint → TimeWindow（anytime / 未指定 → undefined＝帯希望なし）。 */
function windowFromTimeHint(hint: PlanSeedTimeHint | undefined): TimeWindow | undefined {
  switch (hint) {
    case "morning":
    case "afternoon":
    case "evening":
      return { band: hint };
    case "anytime":
    case undefined:
    default:
      return undefined;
  }
}

/**
 * actionShape → disposition ヒント（**enum→enum の決定的写像**・推測でも自由文 parse でもない）。
 *   - 確定行動 (full_go / bounded_go / prepare_then_go) → place
 *   - 探索・委譲 (trial_then_decide / observe_first / delegate_or_request) → tentative
 *   - 非・今 (defer_with_trigger / skip) → skip（今は置かない材料）
 *   - 未指定 → place（中立 default。soft 化は grounding 軸が別途担う）
 */
function dispositionFromActionShape(shape: ActionShape | undefined): SeedDispositionHint {
  switch (shape) {
    case "skip":
    case "defer_with_trigger":
      return "skip";
    case "trial_then_decide":
    case "observe_first":
    case "delegate_or_request":
      return "tentative";
    case "full_go":
    case "bounded_go":
    case "prepare_then_go":
      return "place";
    case undefined:
    default:
      return "place";
  }
}

/** confidence → grounding（< 閾値 → weak）。 */
function groundingFromConfidence(confidence: number): PlacementGrounding {
  return clamp01(confidence) < WEAK_CONFIDENCE_THRESHOLD ? "weak" : "strong";
}

/**
 * 1 つの active PlanSeed を SeedPlacement に変換（構造化のみ・raw text 不持込・推測なし）。
 * **durationMin は常に null**（PlanSeed に duration 欄が無いため。durationSource=unknown）。
 *   default duration は付与しない（捏造しない）。duration は将来 PRM/correction/explicit が埋める。
 */
function toSeedPlacement(seed: PlanSeed): SeedPlacement {
  return {
    seedRef: seed.id,
    date: seed.desiredDate,
    window: windowFromTimeHint(seed.desiredTimeHint),
    durationMin: null, // PlanSeed に duration 欄なし → 不明。推測しない（第一級の保守）
    durationSource: "unknown",
    dispositionHint: dispositionFromActionShape(seed.actionShape),
    confidence: clamp01(seed.confidence),
    grounding: groundingFromConfidence(seed.confidence),
  };
}

/**
 * PlanSeed[] → SeedPlacement[]（**active のみ**・構造化材料・**候補ではない**）。
 * 非 active（consumed/expired/rejected）は配置候補でないため除外（lifecycle 上の除外）。
 * 入力順を保持。純粋。
 */
export function buildSeedPlacements(seeds: readonly PlanSeed[]): readonly SeedPlacement[] {
  return seeds.filter((s) => s.status === "active").map(toSeedPlacement);
}

/**
 * この材料は配置可能か（**A1-4-1 が所有する判定**）。
 *   = **duration が既知（non-null かつ > 0）**。
 * **duration 不明（null）は placeable でない**（第一級の保守・捏造しない＝CEO 明示ルール）。
 * 注: 「置くべきか/どう置くか」（skip/tentative）は別軸の材料（dispositionHint）。
 *   placeable は「置く *材料* が揃っているか」のみを見る。最終的な配置結合は将来 Complete が行う。
 */
export function isPlaceable(p: SeedPlacement): boolean {
  return p.durationMin !== null && p.durationMin > 0;
}

/**
 * 置く場合に tentative（push せず確認/on-open）扱いの材料か。
 *   = weak grounding（低 confidence）∨ disposition が tentative（探索/委譲）。
 * **判定材料** であり、最終的な push/確認は将来の Receptivity Gate / Complete が決める。
 */
export function isTentative(p: SeedPlacement): boolean {
  return p.grounding === "weak" || p.dispositionHint === "tentative";
}
