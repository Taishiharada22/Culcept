/**
 * Reality Control OS — A1-7-1 Dry-run Event Aggregation + Hypothesis Disambiguation（**pure・local・no-persist・no-DB・no-LLM・no-route・no-Home**・barrel 非 export・未配線）
 *
 * 設計: docs/aneurasync-reality-control-os-connection-design.md §10.1
 *
 * 役割: A1-7-0 の dry-run learning events（個別・曖昧・非断定）を **in-memory で集約**し、**文脈との相関で hypothesis を
 *   disambiguate** して **tentative pattern report** を出す pure layer。「学習に変える入口」（reaction → tentative pattern）。
 *   **PRM 本体に保存しない / DB write しない**（dry-run・dev-report 観測用）。
 *
 * 設計思想（断定しない・counter-evidence・bounded certainty）:
 *   - 1 件の action では断定しない。**パターン（文脈グループ内の一貫性）** で初めて弱い tentative 信号にする。
 *   - **context が hypothesis を disambiguate する**: dismiss が時間帯に紐づく → タイミング（not_now）/ dismiss が確信度・根拠に
 *     紐づく → 提示のズレ（mismatch_unknown）。文脈が「なぜ」を絞る。但し他 hypothesis も `stillPossible` で残す（潰さない）。
 *   - **counter-evidence を必ず保持**（`counterCount`）。一貫性が低ければ certainty を上げない。
 *   - **certainty は最大 "tentative"**。`high` / fixed preference / personality trait は **構造的に禁止**（型に "high" が無い）。
 *   - **性格・嗜好を断定しない**（`assertsPreference: false` / `assertsPersonality: false`）。
 *
 * 厳守:
 *   - **pure・deterministic**: DB / network / route / UI / Date.now / LLM なし。出力は value 順 sort で deterministic。
 *   - **未永続化**: `kind="tentative_pattern_report"` marker。PRM 保存 / 集約結果の persist は **別 slice**。barrel 非 export。
 *   - **raw を持ち込まない**: event は既に redacted（handle opaque / enum / number / date）。本 module は更に集約するだけ。
 */

import type { CandidateActionKind } from "../candidate-action";
import type { DryRunLearningEvent, LearningSignal, LearningHypothesisCode } from "./dry-run-learning-event";
import { hypothesisLabel } from "./dry-run-learning-event";

/** 集約する文脈次元（**univariate**・各次元を独立に見る・多変量は将来）。 */
export type ContextDimension = "band" | "durationBucket" | "confidence" | "source";

/** 所要時間の coarse bucket（raw 分を pattern に出さない）。 */
export type DurationBucket = "short" | "medium" | "long" | "unknown";

/** 一貫性 band（**coarse・numeric を出さない**）。 */
export type ConsistencyBand = "mixed" | "leaning" | "consistent";

/** pattern の certainty（**"low" | "tentative" のみ**＝high/fixed preference/personality は構造的に不可）。 */
export type PatternCertainty = "low" | "tentative";

/** action の安定 tie-break 順（dominant 決定の determinism 用）。 */
const ACTION_ORDER: readonly CandidateActionKind[] = ["accept", "dismiss", "later"];

/** 一貫性閾値（consistent=tentative 昇格条件 / leaning）。 */
const CONSISTENT = 0.75;
const LEANING = 0.6;
/** tentative pattern に必要な最小 event 数（少数では断定しない）。 */
const DEFAULT_MIN_EVENTS = 3;

/** durationMin → bucket（null/非正 → unknown）。 */
function durationBucket(min: number | null): DurationBucket {
  if (min === null || !Number.isFinite(min) || min <= 0) return "unknown";
  if (min <= 30) return "short";
  if (min <= 90) return "medium";
  return "long";
}

/**
 * **disambiguation rule（controlled）**: (dominantAction, dimension) → **favored hypothesis**。
 *   時間帯/所要時間 = timing 系 → not_now / timing_uncertain（活動の拒否でなく「いつ/どれだけ」の問題）。
 *   確信度/根拠 = system framing 系 → mismatch_unknown（system は確信したのに不採用＝提示のズレ）/ accepted_for_plan。
 *   favored は必ず該当 action の hypothesis 集合内（stillPossible に残りを保持）。
 */
const FAVORED: Record<CandidateActionKind, Record<ContextDimension, LearningHypothesisCode>> = {
  accept: { band: "positive_signal", durationBucket: "positive_signal", confidence: "accepted_for_plan", source: "positive_signal" },
  dismiss: { band: "not_now", durationBucket: "not_now", confidence: "mismatch_unknown", source: "mismatch_unknown" },
  later: { band: "timing_uncertain", durationBucket: "timing_uncertain", confidence: "postpone_signal", source: "postpone_signal" },
};

/** context 次元ラベル（note 用・controlled）。 */
const DIM_LABEL: Record<ContextDimension, string> = { band: "時間帯", durationBucket: "所要時間", confidence: "確信度", source: "根拠" };
/** context 値ラベル（note 用・controlled・全次元の値を網羅）。 */
const VAL_LABEL: Record<string, string> = {
  morning: "午前", afternoon: "午後", evening: "夜", none: "帯なし",
  short: "短い", medium: "中", long: "長い", unknown: "不明",
  high: "高", low: "低",
  seed_explicit: "発話由来", correction: "調整由来",
};
/** action ラベル（note 用・controlled）。 */
const ACTION_LABEL: Record<CandidateActionKind, string> = { accept: "採用", dismiss: "見送り", later: "あとで" };

/** dry-run event の集約 **tentative pattern**（文脈ごと・**断定しない**・counter-evidence 保持）。 */
export interface TentativePattern {
  /** 文脈次元。 */
  readonly dimension: ContextDimension;
  /** 文脈値（band/bucket/confidence/source の値）。 */
  readonly value: string;
  /** group 内で最頻の action。 */
  readonly dominantAction: CandidateActionKind;
  /** 中立信号（dominant action の signal）。 */
  readonly signal: LearningSignal;
  /** group の総 event 数。 */
  readonly eventCount: number;
  /** dominant action の数。 */
  readonly dominantCount: number;
  /** **counter-evidence**（dominant 以外の数）。 */
  readonly counterCount: number;
  /** 一貫性 band（coarse）。 */
  readonly consistency: ConsistencyBand;
  /** context で **disambiguate された** favored hypothesis。 */
  readonly favoredHypothesis: LearningHypothesisCode;
  /** **非断定**: 他の可能性も残す（潰さない）。 */
  readonly stillPossible: readonly LearningHypothesisCode[];
  /** **最大 "tentative"**（high なし）。 */
  readonly certainty: PatternCertainty;
  /** **構造的保証**: 選好を断定しない。 */
  readonly assertsPreference: false;
  /** controlled hypothesis-tone note（LLM 不使用・dev-report 用）。 */
  readonly note: string;
}

/** tentative pattern report（**未永続化・PRM でない**・dev-report 観測用）。 */
export interface TentativePatternReport {
  /** marker（**PRM 未保存**・persist は別 slice）。 */
  readonly kind: "tentative_pattern_report";
  /** 入力 event 総数。 */
  readonly totalEvents: number;
  /** 文脈ごとの tentative pattern（value 順 sort で deterministic）。 */
  readonly patterns: readonly TentativePattern[];
  /** **構造的保証**: 性格を断定しない。 */
  readonly assertsPersonality: false;
}

/** 集約オプション（最小 event 数の上書き＝test 用）。 */
export interface AggregationOptions {
  readonly minEvents?: number;
}

/** event → 指定次元の文脈値（null band は "none"）。 */
function dimensionValue(e: DryRunLearningEvent, dim: ContextDimension): string {
  switch (dim) {
    case "band":
      return e.band ?? "none";
    case "durationBucket":
      return durationBucket(e.durationMin);
    case "confidence":
      return e.confidenceBand;
    case "source":
      return e.sourceKind;
  }
}

/** controlled note 組み立て（mixed は傾向なしを明示・LLM 不使用）。 */
function buildNote(dim: ContextDimension, value: string, action: CandidateActionKind, consistency: ConsistencyBand, favored: LearningHypothesisCode): string {
  const ctx = `${DIM_LABEL[dim]}「${VAL_LABEL[value] ?? value}」`;
  if (consistency === "mixed") return `${ctx}では action が割れている（明確な傾向なし・断定不可）`;
  const freq = consistency === "consistent" ? "多い" : "やや多い";
  return `${ctx}の候補で${ACTION_LABEL[action]}が${freq}（${hypothesisLabel(favored)}・断定不可の仮説）`;
}

/** group（同一文脈値の events）→ tentative pattern。 */
function buildPattern(dim: ContextDimension, value: string, groupEvents: readonly DryRunLearningEvent[]): TentativePattern {
  const counts: Record<CandidateActionKind, number> = { accept: 0, dismiss: 0, later: 0 };
  for (const e of groupEvents) counts[e.action] += 1;
  // dominant（ties は ACTION_ORDER で安定）。
  const dominantAction = ACTION_ORDER.reduce((best, a) => (counts[a] > counts[best] ? a : best), ACTION_ORDER[0]!);
  const eventCount = groupEvents.length;
  const dominantCount = counts[dominantAction];
  const counterCount = eventCount - dominantCount;
  const ratio = dominantCount / eventCount;
  const consistency: ConsistencyBand = ratio >= CONSISTENT ? "consistent" : ratio >= LEANING ? "leaning" : "mixed";
  const certainty: PatternCertainty = ratio >= CONSISTENT ? "tentative" : "low"; // ★ 上限 tentative
  const favoredHypothesis = FAVORED[dominantAction][dim];
  const domEvent = groupEvents.find((e) => e.action === dominantAction)!;
  const stillPossible = domEvent.hypotheses.filter((h) => h !== favoredHypothesis);
  return {
    dimension: dim,
    value,
    dominantAction,
    signal: domEvent.signal,
    eventCount,
    dominantCount,
    counterCount,
    consistency,
    favoredHypothesis,
    stillPossible,
    certainty,
    assertsPreference: false,
    note: buildNote(dim, value, dominantAction, consistency, favoredHypothesis),
  };
}

/**
 * A1-7-1: dry-run events → **tentative pattern report**（pure・未永続化・断定しない）。
 *   各 context 次元で文脈値ごとに group 化し、`minEvents` 以上の group のみ pattern 化（少数では断定しない）。
 *   出力 pattern は (次元 order, value 昇順) で sort＝deterministic。**PRM 保存しない**。
 */
export function aggregateDryRunEvents(
  events: readonly DryRunLearningEvent[],
  opts?: AggregationOptions
): TentativePatternReport {
  const minEvents = opts?.minEvents ?? DEFAULT_MIN_EVENTS;
  const dimensions: readonly ContextDimension[] = ["band", "durationBucket", "confidence", "source"];
  const patterns: TentativePattern[] = [];
  for (const dim of dimensions) {
    const groups = new Map<string, DryRunLearningEvent[]>();
    for (const e of events) {
      const v = dimensionValue(e, dim);
      const arr = groups.get(v);
      if (arr) arr.push(e);
      else groups.set(v, [e]);
    }
    // value 昇順で deterministic に。
    const sorted = Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    for (const [value, groupEvents] of sorted) {
      if (groupEvents.length < minEvents) continue; // 少数 group は断定しない
      patterns.push(buildPattern(dim, value, groupEvents));
    }
  }
  return {
    kind: "tentative_pattern_report",
    totalEvents: events.length,
    patterns,
    assertsPersonality: false,
  };
}
