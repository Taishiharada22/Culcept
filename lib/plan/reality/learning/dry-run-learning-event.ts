/**
 * Reality Control OS — A1-7-0 Candidate Action Outcome → PRM Dry-run Learning Event（**pure・local・no-DB・no-persist・no-LLM**・barrel 非 export・未配線）
 *
 * 設計: docs/aneurasync-reality-control-os-connection-design.md §10.0
 *
 * 役割: surfaced candidate への action（accept / dismiss / later）を、単なる status 遷移（A1-6-0 `decideCandidateAction`）で
 *   終わらせず、**将来の Personal Reality Model / correction / 予定生成改善** に使える **structured learning event 候補** に変換する pure transform。
 *   **これは PRM 永続化ではない**。「学習イベント候補」を作るだけで、PRM 本体には保存しない（dry-run・foundation）。
 *
 * 設計思想（Aneurasync・observed > inferred・断定しない）:
 *   - **単一 action は弱く・曖昧な証拠**。accept は「欲しい」とも「まあいい」とも取れる。dismiss は「嫌い」ではなく
 *     「今回は選ばなかった / タイミング / 提示のズレ」かもしれない。later は「先送り / タイミング不確実」。
 *   - ゆえに 1 action を **単一の意味に潰さない**。曖昧性を **複数 hypothesis** として保持し（negative capability）、
 *     **文脈**（confidence / duration / band / date / source）を記録して、**将来の cross-event 相関で disambiguation** できるようにする。
 *   - **選好を断定しない**: `assertsPreference: false`（構造的保証）/ `certainty: "low"`（単一 action は常に弱い）。
 *
 * 厳守:
 *   - **pure・deterministic**: DB / Supabase / network / route / UI / **Date.now なし**（acted timestamp は注入）。**LLM 不使用**（hypothesis は controlled enum）。
 *   - **断定禁止**: rejected≠嫌い / consumed≠選好確定 / deferred≠拒否。hypothesis は controlled code + hypothesis-tone label のみ。
 *   - **raw を持ち込まない**: 入出力は handle(opaque) / enum / number / date(YYYY-MM-DD) / null のみ（seedRef / raw / source_ref を持たない）。
 *   - **未永続化**: `kind="dry_run_learning_event"` marker。PRM への保存 / 集約 / route / Home 接続は **別 slice**。barrel 非 export。
 */

import type { CandidateActionKind } from "../candidate-action";
import type { ConfidenceBand, EvidenceSourceLabel, TimeBandLabel } from "../integration/candidate-surface";

/**
 * 中立な **信号方向**（**評価でない**・descriptive）。
 *   adoption=採用方向 / non_adoption=非採用方向（≠negative）/ deferral=保留方向。
 */
export type LearningSignal = "adoption" | "non_adoption" | "deferral";

/**
 * 単一 action の **learning hypothesis code**（**controlled enum・断定しない**・LLM 不使用）。
 *   - accept: `accepted_for_plan`（予定として採用＝事実に近い）/ `positive_signal`（弱い positive の可能性）
 *   - dismiss: `not_selected`（今回は選ばれず）/ `not_now`（タイミングかも）/ `mismatch_unknown`（提示/中身のズレ・理由不明）
 *   - later: `postpone_signal`（先送り signal）/ `timing_uncertain`（タイミング不確実）
 */
export type LearningHypothesisCode =
  | "accepted_for_plan"
  | "positive_signal"
  | "not_selected"
  | "not_now"
  | "mismatch_unknown"
  | "postpone_signal"
  | "timing_uncertain";

/** action → 中立信号方向（評価でない）。 */
const ACTION_SIGNAL: Record<CandidateActionKind, LearningSignal> = {
  accept: "adoption",
  dismiss: "non_adoption",
  later: "deferral",
};

/**
 * action → **hypothesis の全集合**（曖昧性を潰さない・先頭 = 最も中立な primary）。
 *   dismiss を「嫌い」に潰さず not_selected / not_now / mismatch_unknown を**並置**するのが核心。
 */
const ACTION_HYPOTHESES: Record<CandidateActionKind, readonly LearningHypothesisCode[]> = {
  accept: ["accepted_for_plan", "positive_signal"],
  dismiss: ["not_selected", "not_now", "mismatch_unknown"],
  later: ["postpone_signal", "timing_uncertain"],
};

/** hypothesis code → **hypothesis-tone な日本語 label**（controlled・LLM 不使用・「可能性/かもしれない/不明/不確実」で非断定）。 */
const HYPOTHESIS_LABEL: Record<LearningHypothesisCode, string> = {
  accepted_for_plan: "予定として採用された",
  positive_signal: "弱い positive signal の可能性",
  not_selected: "今回は選ばれなかった",
  not_now: "タイミングの問題かもしれない",
  mismatch_unknown: "提示か中身がズレていた可能性（理由は不明）",
  postpone_signal: "先送りの signal",
  timing_uncertain: "タイミングが不確実",
};

/** evidenceSource → friendly label（controlled・presenter と整合）。 */
const SOURCE_LABEL: Record<EvidenceSourceLabel, string> = {
  seed_explicit: "あなたが話した内容から",
  correction: "これまでの調整から",
};

/**
 * dry-run learning event の **入力文脈**（CandidateSurfaceItem の安全 field の subset・**raw / seedRef を持たない**）。
 *   handle は action に必須ゆえ required（CandidateSurfaceItem.handle は optional だが action 時は付与済）。
 */
export interface CandidateActionContext {
  /** opaque candidate handle（一方向 hash・seedRef でない）。 */
  readonly handle: string;
  /** 希望日（YYYY-MM-DD / 不明 null）。 */
  readonly date: string | null;
  /** 希望時間帯（context・null=帯なし）。 */
  readonly band: TimeBandLabel | null;
  /** 元 candidate の確からしさ band（context・PRM weighting 用）。 */
  readonly confidenceBand: ConfidenceBand;
  /** 所要時間（分 / 不明 null）。 */
  readonly durationMin: number | null;
  /** duration 根拠（seed_explicit / correction）。 */
  readonly evidenceSource: EvidenceSourceLabel;
}

/**
 * **PRM dry-run learning event 候補**（**未永続化**・pure・**断定しない**）。
 *   action（事実）+ 中立信号 + 曖昧性（複数 hypothesis）+ 文脈（将来の相関 disambiguation 用）+ 非断定の構造的保証。
 */
export interface DryRunLearningEvent {
  /** marker（**PRM 未永続化**・候補のみ・保存/集約は別 slice）。 */
  readonly kind: "dry_run_learning_event";
  /** 生の action（事実）。 */
  readonly action: CandidateActionKind;
  /** 中立信号方向（評価でない）。 */
  readonly signal: LearningSignal;
  /** 最も中立な読み（hypotheses[0]）。 */
  readonly primaryHypothesis: LearningHypothesisCode;
  /** 曖昧性の全集合（primary 含む・潰さない）。 */
  readonly hypotheses: readonly LearningHypothesisCode[];
  /** opaque handle。 */
  readonly handle: string;
  /** 希望日。 */
  readonly desiredDate: string | null;
  /** 時間帯（context）。 */
  readonly band: TimeBandLabel | null;
  /** 確からしさ band（context）。 */
  readonly confidenceBand: ConfidenceBand;
  /** 所要時間（context）。 */
  readonly durationMin: number | null;
  /** source kind。 */
  readonly sourceKind: EvidenceSourceLabel;
  /** source friendly label（controlled）。 */
  readonly sourceLabel: string;
  /** acted timestamp（**注入**・Date.now 不使用・無ければ null）。 */
  readonly actedAtISO: string | null;
  /** 単一 action は弱い証拠 → **常に low**（集約後の強化は別 slice）。 */
  readonly certainty: "low";
  /** **構造的保証**: この event は選好を断定しない。 */
  readonly assertsPreference: false;
}

/**
 * A1-7-0: candidate action + 文脈 → **dry-run learning event**（pure・未永続化・断定しない）。
 *   action を単一の意味に潰さず、`ACTION_HYPOTHESES` の全集合を保持し、文脈を記録する。
 *   `actedAtISO` は注入（Date.now 不使用）。**保存しない**（呼び出し側が dry-run で受けるだけ）。
 */
export function toDryRunLearningEvent(
  ctx: CandidateActionContext,
  action: CandidateActionKind,
  actedAtISO?: string | null
): DryRunLearningEvent {
  const hypotheses = ACTION_HYPOTHESES[action];
  return {
    kind: "dry_run_learning_event",
    action,
    signal: ACTION_SIGNAL[action],
    primaryHypothesis: hypotheses[0]!,
    hypotheses,
    handle: ctx.handle,
    desiredDate: ctx.date ?? null,
    band: ctx.band ?? null,
    confidenceBand: ctx.confidenceBand,
    durationMin: ctx.durationMin ?? null,
    sourceKind: ctx.evidenceSource,
    sourceLabel: SOURCE_LABEL[ctx.evidenceSource] ?? "メモから",
    actedAtISO: typeof actedAtISO === "string" ? actedAtISO : null,
    certainty: "low",
    assertsPreference: false,
  };
}

/** A1-7-0: 複数 action → dry-run events（pure・入力順保持・未永続化）。 */
export function toDryRunLearningEvents(
  inputs: readonly { readonly ctx: CandidateActionContext; readonly action: CandidateActionKind; readonly actedAtISO?: string | null }[]
): readonly DryRunLearningEvent[] {
  return inputs.map((i) => toDryRunLearningEvent(i.ctx, i.action, i.actedAtISO));
}

/** hypothesis code → hypothesis-tone label（display/dev-report 用・controlled・LLM 不使用）。 */
export function hypothesisLabel(code: LearningHypothesisCode): string {
  return HYPOTHESIS_LABEL[code];
}
