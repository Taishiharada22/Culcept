/**
 * T5B — 決定論 decision core（**pure・未配線**）
 *
 * 設計: decision-types.ts + GPT logic-side note 2026-06-12
 *
 * 入力: T4 `ProposalComparison`（+ 任意 `FairnessHistoryInput`・純 input）
 * 出力: `DecisionResult`
 *
 * 厳守（純・決定論）:
 *   - 場所/経路検索・LLM・外部データ・I/O・DB・永続化なし。import は travel core/comparison/decision のみ。
 *   - **gates first → tilt last**: hard blocker / required missing は fairness history で覆らない。
 *   - opaque scoring なし。tilt は「pareto 同点の中の決定論タイブレーク」のみ。
 *   - ★ private（制約 / 履歴）は決定に影響してよいが、**shared rationale / shared view に漏らさない**。
 */

import type { ViewerScopedRationale } from "./core-types";
import type {
  ProposalComparison,
  ProposalComparisonEntry,
  ProposalFairness,
} from "./proposal-comparison-types";
import type {
  ConsensusReadiness,
  DecisionQuestion,
  DecisionResult,
  FairnessHistoryInput,
} from "./decision-types";

export interface DecideInput {
  comparison: ProposalComparison;
  fairnessHistory?: FairnessHistoryInput;
}

const ROLE_JA: Record<string, string> = { protect: "守り", easy: "楽", push: "攻め" };
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

const fairnessOf = (c: ProposalComparison, id: string): ProposalFairness | undefined =>
  c.fairness.find((f) => f.candidateId === id);
const entryOf = (c: ProposalComparison, id: string): ProposalComparisonEntry | undefined =>
  c.entries.find((e) => e.candidateId === id);

/** 履歴の偏りの逆方向（前回譲った側）= 今回優先したい participant。均衡 / 無効は null。 */
function tiltTarget(h: FairnessHistoryInput): string | null {
  const b = clamp(h.priorBias, -1, 1);
  if (b < 0) return h.participantB; // A が優遇されていた → B を優先
  if (b > 0) return h.participantA;
  return null;
}

/** shared 文 + comparison の forParticipant（private 注記）を継承した rationale を作る */
function rationale(c: ProposalComparison, sharedParts: string[]): ViewerScopedRationale {
  return { shared: sharedParts.join("。") + "。", forParticipant: { ...c.summary.forParticipant } };
}

function readiness(entry: ProposalComparisonEntry | undefined, fair: ProposalFairness | undefined, tilted: boolean): ConsensusReadiness {
  if (!entry) return "not_ready";
  const balancedOrJustified = !fair || fair.leanShared === "balanced" || tilted;
  return entry.uncertainty === "low" && balancedOrJustified ? "ready" : "tentative";
}

// ─────────────────────────────────────────────────────────────────────────────
// public: decide
// ─────────────────────────────────────────────────────────────────────────────

export function decide(input: DecideInput): DecisionResult {
  const c = input.comparison;
  const history = input.fairnessHistory;

  const blocked = (parts: string[]): DecisionResult => ({
    state: "blocked",
    recommendedProposalId: null,
    tiedProposalIds: [],
    followUpQuestion: null,
    blockers: c.blockers,
    consensusReadiness: "not_ready",
    impact: [],
    tiltedByHistory: false,
    tiltVisibility: null,
    rationale: rationale(c, parts),
    inputError: c.inputError,
  });

  // 1. blocked（hard gate）
  if (c.inputError !== null) {
    return blocked(c.inputError === "contradictory_red_lines" ? ["条件に矛盾があり提案できません"] : ["参加者の指定が不正です"]);
  }
  if (c.entries.length === 0) return blocked(["条件が揃わないため提案できません"]);

  // 2. needs_question（required missing / all high uncertainty）— history で覆らない
  if (c.blockers.includes("required_inputs_missing") || c.blockers.includes("all_high_uncertainty")) {
    const q0 = c.prioritizedQuestions[0];
    const followUpQuestion: DecisionQuestion | null = q0
      ? { about: "missing_slot", intent: q0.questionIntent, priority: q0.priority, slotKey: q0.slotKey }
      : null;
    return {
      state: "needs_question",
      recommendedProposalId: null,
      tiedProposalIds: [],
      followUpQuestion,
      blockers: c.blockers,
      consensusReadiness: "not_ready",
      impact: [],
      tiltedByHistory: false,
      tiltVisibility: null,
      rationale: rationale(c, ["決めるにはもう少し情報が必要です"]),
      inputError: null,
    };
  }

  // 3. pareto pool から選定
  const pool = c.paretoOptimalIds;
  if (pool.length === 0) return blocked(["有効な候補がありません"]);

  const recommend = (id: string, tilted: boolean): DecisionResult => {
    const entry = entryOf(c, id);
    const fair = fairnessOf(c, id);
    const role = entry ? ROLE_JA[entry.role] : "";
    const parts = [`「${role}」の案をおすすめします`];
    // tilt 根拠: shared 履歴のみ shared 文へ。private 履歴は forParticipant へ。
    const rat = rationale(c, parts);
    let tiltVisibility: DecisionResult["tiltVisibility"] = null;
    if (tilted && history) {
      tiltVisibility = history.visibility;
      const favored = tiltTarget(history);
      if (history.visibility === "shared") {
        rat.shared = [...parts, "これまでの偏りを考慮して調整しました"].join("。") + "。";
      } else if (favored) {
        rat.forParticipant = { ...rat.forParticipant, [favored]: [rat.forParticipant[favored], "今回はあなたを優先しました"].filter(Boolean).join("・") };
      }
    }
    return {
      state: "recommend",
      recommendedProposalId: id,
      tiedProposalIds: [],
      followUpQuestion: null,
      blockers: c.blockers,
      consensusReadiness: readiness(entry, fair, tilted),
      impact: fair ? fair.perParticipant : [],
      tiltedByHistory: tilted,
      tiltVisibility,
      rationale: rat,
    inputError: null,
    };
  };

  if (pool.length === 1) return recommend(pool[0], false);

  // pool > 1: fairness history で gently tilt（pareto 同点のタイブレークのみ）
  if (history) {
    const favored = tiltTarget(history);
    if (favored) {
      const leaning = pool.filter((id) => fairnessOf(c, id)?.leanFull === favored);
      if (leaning.length === 1) return recommend(leaning[0], true);
    }
  }

  // tie（タイブレーク不能）→ 好み質問
  return {
    state: "tie",
    recommendedProposalId: null,
    tiedProposalIds: pool,
    followUpQuestion: { about: "tie_preference", intent: "ask_preference_between_options", priority: "recommended", optionIds: pool },
    blockers: c.blockers,
    consensusReadiness: "not_ready",
    impact: [],
    tiltedByHistory: false,
    tiltVisibility: null,
    rationale: rationale(c, ["どちらも甲乙つけがたいです。好みを教えてください"]),
    inputError: null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// public: shared 射影（M5・private を漏らさない）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * shared ビュー: 相手にも見せてよい形。
 *   - rationale.forParticipant 全削除（shared 文のみ）。
 *   - impact: private counts を 0 化。
 *   - **private 履歴 tilt は隠す**（tiltVisibility==="private" なら tiltedByHistory=false / tiltVisibility=null）。
 */
export function toSharedDecisionView(r: DecisionResult): DecisionResult {
  const hidePrivateTilt = r.tiltVisibility === "private";
  return {
    ...r,
    impact: r.impact.map((e) => ({ ...e, satisfiedPrivate: 0, stretchedPrivate: 0 })),
    tiltedByHistory: hidePrivateTilt ? false : r.tiltedByHistory,
    tiltVisibility: hidePrivateTilt ? null : r.tiltVisibility,
    rationale: { shared: r.rationale.shared, forParticipant: {} },
  };
}
