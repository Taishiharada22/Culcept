// lib/stargazer/typeResolver.ts
// Stargazer 軸スコアリング + 確信度計算
// 質問回答 → 45軸スコア（constellation タイプ依存を除去）

import {
  type TraitAxisKey,
  TRAIT_AXIS_KEYS,
  createEmptyAxisScores,
} from "./traitAxes";
import { QUESTIONS } from "./questions";
import {
  resolveReactionType,
  type ReactionTypeCode,
} from "./reactionTypes";
import {
  computeAxisConfidence,
  computeVolumeOnlyConfidence,
  buildAxisConfidenceInputs,
  type AxisSnapshot as ConfidenceSnapshot,
  type AxisConfidenceResult,
} from "./confidenceEngine";
import type { ContextFaces } from "@/types/stargazer";
import {
  initializeFromOnboarding,
  type BayesianScoringResult,
  type BeliefSet,
  beliefsToConfidences,
} from "./bayesianAxisUpdater";
import type { ContradictionMap } from "./contradictionEngine";

// ── 回答データ ──

export interface QuestionAnswer {
  questionId: string;
  /** 1〜5 の5段階回答 */
  value: number;
  /** 回答時間(ms) */
  responseTimeMs?: number;
}

// ── 解決結果 ──

/**
 * @deprecated constellation タイプ除去に伴い不要。
 * confidenceEngine.ts に同名 interface が存在するため、
 * 旧コードからの import 互換のために残す。次のメジャーで削除予定。
 */
export interface TypeMatch {
  code: string;
  label: string;
  emoji: string;
  score: number;
}

/**
 * 軸スコア + 確信度のみを返す解決結果。
 * constellation タイプ依存（resolvedType / combinedIdentity / topMatches / summary）を除去。
 */
export interface ResolvedResult {
  /** 反応タイプ (Core/Drive/Defence/Sync/Quest) */
  reactionType: ReactionTypeCode;
  /** 信頼度 0〜1 */
  confidence: number;
  /** 45軸スコア (-1〜1) */
  axisScores: Record<TraitAxisKey, number>;
  /** 各軸のconfidence (0〜1) */
  axisConfidences: Record<TraitAxisKey, number>;
}

// ── スコアリング ──

/**
 * 回答値 (1-5) を -1.0 〜 +1.0 に正規化
 */
function normalizeAnswer(value: number): number {
  // 1 = -1.0, 2 = -0.5, 3 = 0.0, 4 = 0.5, 5 = 1.0
  return (value - 3) / 2;
}

/**
 * 回答から15軸スコアを算出
 */
export function calculateAxisScores(
  answers: QuestionAnswer[]
): Record<TraitAxisKey, number> {
  const scores = createEmptyAxisScores();
  const weights = createEmptyAxisScores(); // 累積weight

  for (const answer of answers) {
    const question = QUESTIONS.find((q) => q.id === answer.questionId);
    if (!question) continue;

    let normalized = normalizeAnswer(answer.value);

    for (const axis of question.axes) {
      // invert の場合、スコアを反転
      const effectiveScore = axis.invert ? -normalized : normalized;

      // weight が負の場合は逆方向に加算（Q22のperfectionist_vs_pragmatic: -0.2 など）
      scores[axis.key] += effectiveScore * axis.weight;
      weights[axis.key] += Math.abs(axis.weight);
    }
  }

  // 重み付き平均化 + clamp
  for (const key of TRAIT_AXIS_KEYS) {
    if (weights[key] > 0) {
      scores[key] = Math.max(-1, Math.min(1, scores[key] / weights[key]));
    }
  }

  return scores;
}

/**
 * 各軸の confidence を算出（Horizon Function）
 *
 * snapshots が提供された場合: 時間分散・再観測一致性を含む完全な確信度
 * snapshots がない場合: 観測量のみの簡易確信度（上限0.5）
 */
export function calculateAxisConfidences(
  answers: QuestionAnswer[],
  snapshots?: ConfidenceSnapshot[]
): Record<TraitAxisKey, number> {
  const confidences = createEmptyAxisScores();

  if (snapshots && snapshots.length > 0) {
    // 完全版: スナップショットから時間分散・再観測一致性を計算
    const inputs = buildAxisConfidenceInputs(snapshots, TRAIT_AXIS_KEYS);

    for (const key of TRAIT_AXIS_KEYS) {
      const input = inputs[key];
      if (input && input.observationCount > 0) {
        const result = computeAxisConfidence(input);
        confidences[key] = result.confidence;
      }
    }
  } else {
    // 簡易版: 回答数からのみ推定（オンボーディング時）
    const answerCount: Record<string, number> = {};
    for (const key of TRAIT_AXIS_KEYS) answerCount[key] = 0;

    for (const answer of answers) {
      const question = QUESTIONS.find((q) => q.id === answer.questionId);
      if (!question) continue;
      for (const axis of question.axes) {
        answerCount[axis.key] += 1;
      }
    }

    for (const key of TRAIT_AXIS_KEYS) {
      confidences[key] = computeVolumeOnlyConfidence(answerCount[key] || 0);
    }
  }

  return confidences;
}

/** スナップショットから軸別AxisConfidenceResultの詳細を返す（profile APIで使用） */
export function calculateAxisConfidenceDetails(
  snapshots: ConfidenceSnapshot[]
): Record<string, AxisConfidenceResult> {
  const inputs = buildAxisConfidenceInputs(snapshots, TRAIT_AXIS_KEYS);
  const results: Record<string, AxisConfidenceResult> = {};

  for (const key of TRAIT_AXIS_KEYS) {
    const input = inputs[key];
    if (input) {
      results[key] = computeAxisConfidence(input);
    }
  }

  return results;
}

// ── タイプ解決 ──

/**
 * 回答から45軸スコア + 確信度 + 反応タイプを算出
 *
 * constellation タイプマッチングは除去済み。
 * 軸スコアからのアーキタイプ判定は archetypeResolver.resolveArchetype() を使用すること。
 */
export function resolveType(
  answers: QuestionAnswer[]
): ResolvedResult {
  const axisScores = calculateAxisScores(answers);
  const axisConfidences = calculateAxisConfidences(answers);

  // 全体 confidence — 軸別確信度の平均
  const confidenceValues = Object.values(axisConfidences);
  const confidence = confidenceValues.length > 0
    ? confidenceValues.reduce((sum, v) => sum + v, 0) / confidenceValues.length
    : 0;

  const reactionType = resolveReactionType(axisScores);

  return {
    reactionType,
    confidence,
    axisScores,
    axisConfidences,
  };
}

// ── ベイズ版タイプ解決 ──

export interface BayesianResolvedResult extends ResolvedResult {
  /** ベイズ信念セット（保存用） */
  beliefs: BeliefSet;
  /** 矛盾マップ（二面性検出結果） */
  contradictionMap: ContradictionMap;
  /** 回答時間統計 */
  responseTimeStats: BayesianScoringResult["responseTimeStats"];
}

/**
 * ベイズ版: 回答から45軸スコア + 信念 + 矛盾を算出
 *
 * constellation タイプマッチングは除去済み。
 * アーキタイプ判定は archetypeResolver.resolveArchetype() を使用すること。
 */
export function resolveTypeWithBayesian(
  answers: QuestionAnswer[],
  userBaselineMs?: number,
): BayesianResolvedResult {
  // ベイズスコアリング
  const bayesian = initializeFromOnboarding(answers, userBaselineMs);

  const axisScores = bayesian.axisScores;
  const axisConfidences = beliefsToConfidences(bayesian.beliefs);

  // confidence — ベイズ確信度の平均
  const confidenceValues = Object.values(axisConfidences);
  const confidence = confidenceValues.length > 0
    ? confidenceValues.reduce((sum, v) => sum + v, 0) / confidenceValues.length
    : 0;

  const reactionType = resolveReactionType(axisScores);

  return {
    reactionType,
    confidence,
    axisScores,
    axisConfidences,
    beliefs: bayesian.beliefs,
    contradictionMap: bayesian.contradictionMap,
    responseTimeStats: bayesian.responseTimeStats,
  };
}

// ── Context Faces 生成 ──

/**
 * 軸スコアから文脈別の顔（romance / work / friends）を導出
 * 各文脈で最も「顔が変わる」2〜3軸を選択し、文脈バイアスを加える
 */
export function generateContextFaces(
  axisScores: Record<TraitAxisKey, number>
): ContextFaces {
  const clamp = (v: number) => Math.max(-1, Math.min(1, v));

  return {
    romance: {
      stress_isolation_vs_social: clamp(
        (axisScores.stress_isolation_vs_social ?? 0) + 0.1
      ),
      direct_vs_diplomatic: clamp(
        (axisScores.direct_vs_diplomatic ?? 0) + 0.15
      ),
      function_vs_expression: clamp(
        (axisScores.function_vs_expression ?? 0) + 0.1
      ),
    },
    work: {
      analytical_vs_intuitive: clamp(
        (axisScores.analytical_vs_intuitive ?? 0) - 0.1
      ),
      perfectionist_vs_pragmatic: clamp(
        (axisScores.perfectionist_vs_pragmatic ?? 0) - 0.1
      ),
      plan_vs_spontaneous: clamp(
        (axisScores.plan_vs_spontaneous ?? 0) - 0.15
      ),
    },
    friends: {
      independence_vs_harmony: clamp(
        (axisScores.independence_vs_harmony ?? 0) + 0.15
      ),
      individual_vs_social: clamp(
        (axisScores.individual_vs_social ?? 0) + 0.1
      ),
      introvert_vs_extrovert: clamp(
        (axisScores.introvert_vs_extrovert ?? 0) + 0.1
      ),
    },
  };
}

// ── Summary 生成 ──

/**
 * @deprecated constellation タイプ除去に伴い非推奨。
 * 軸スコアベースのナラティブ生成は profileContentGenerator.ts に移行予定。
 * 旧コードからの import 互換のために残す。次のメジャーで削除予定。
 */
export function generateSummary(
  axisScores: Record<TraitAxisKey, number>,
  _resolvedTypeCode?: string
): { core: string; relation: string; context: string; expression: string } {
  const s = axisScores;

  // Core Signal
  const coreParts: string[] = [];
  if (s.introvert_vs_extrovert < -0.3) {
    coreParts.push("内側で思考を深めることを好む");
  } else if (s.introvert_vs_extrovert > 0.3) {
    coreParts.push("外に向かってエネルギーを発する傾向がある");
  }
  if (s.cautious_vs_bold < -0.3) {
    coreParts.push("慎重に見極めてから動く");
  } else if (s.cautious_vs_bold > 0.3) {
    coreParts.push("まず動いてから考える大胆さがある");
  }
  if (s.analytical_vs_intuitive < -0.3) {
    coreParts.push("構造や論理から物事を理解する");
  } else if (s.analytical_vs_intuitive > 0.3) {
    coreParts.push("直感や空気感で状況を掴む");
  }

  // Relational Distance
  const relationParts: string[] = [];
  if (s.independence_vs_harmony < -0.3) {
    relationParts.push("自分の軸を先に保つ傾向がある");
  } else if (s.independence_vs_harmony > 0.3) {
    relationParts.push("相手との調和を大切にする");
  }
  if (s.direct_vs_diplomatic < -0.3) {
    relationParts.push("率直な言葉で伝える");
  } else if (s.direct_vs_diplomatic > 0.3) {
    relationParts.push("言い方の調整も誠実さの一部と捉える");
  }
  if (s.stress_isolation_vs_social < -0.3) {
    relationParts.push("ストレス時は一人で整理する");
  } else if (s.stress_isolation_vs_social > 0.3) {
    relationParts.push("人とつながることで回復する");
  }

  // Context
  const contextParts: string[] = [];
  if (s.perfectionist_vs_pragmatic < -0.3) {
    contextParts.push("仕事では精度と完成度を重視する");
  } else if (s.perfectionist_vs_pragmatic > 0.3) {
    contextParts.push("仕事では勢いと前進を優先する");
  }
  if (
    Math.abs(s.introvert_vs_extrovert) > 0.3 &&
    Math.abs(s.stress_isolation_vs_social) > 0.3 &&
    Math.sign(s.introvert_vs_extrovert) !==
      Math.sign(s.stress_isolation_vs_social)
  ) {
    contextParts.push("場面によって異なる顔を見せる傾向がある");
  }

  // Expression
  const expressionParts: string[] = [];
  if (s.function_vs_expression < -0.3) {
    expressionParts.push("機能や合理性を重視する");
  } else if (s.function_vs_expression > 0.3) {
    expressionParts.push("表現や情緒を大切にする");
  }
  if (s.tradition_vs_novelty < -0.3) {
    expressionParts.push("確かな定番に価値を見出す");
  } else if (s.tradition_vs_novelty > 0.3) {
    expressionParts.push("新しいものへの感度が高い");
  }
  if (s.classic_vs_trendy < -0.3) {
    expressionParts.push("時代を超えるものに惹かれる");
  } else if (s.classic_vs_trendy > 0.3) {
    expressionParts.push("今の空気をまとうことを好む");
  }

  const join = (parts: string[]) =>
    parts.length > 0 ? parts.join("。") + "。" : "";

  return {
    core:
      join(coreParts) ||
      "安定した核を持つ。",
    relation:
      join(relationParts) ||
      "他者との距離感はバランスが取れている。",
    context:
      join(contextParts) ||
      "文脈による顔の違いは小さく、一貫性がある。",
    expression:
      join(expressionParts) ||
      "表現と美意識に独自のバランスを持つ。",
  };
}

/**
 * 初回 Aha インサイト生成
 *
 * ユーザーの最も際立つ軸から、自己認識を揺さぶる洞察テキストを生成する。
 * 設計原理: 「行動 → 無意識の動機 → それが意味するアイデンティティ」の3層構造で、
 * 「言われてみれば確かにそうだ」と感じる驚きを保証する。
 *
 * 参考: Nisbett & Wilson (1977) — 人は自分の判断の真の理由を正確に報告できない
 */
export function generateFirstAhaInsight(
  axisScores: Record<TraitAxisKey, number>
): string {
  // 矛盾パターン（最も驚きを生む）を優先チェック
  const contradictions = detectInitialContradictions(axisScores);
  if (contradictions) return contradictions;

  // 最も極端な軸を見つける
  const entries = Object.entries(axisScores) as [TraitAxisKey, number][];
  entries.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  const top = entries[0];
  if (!top) return "あなたの内面は、まだ言葉にされていない複雑さを持っている。";

  const [axis, score] = top;
  const insight = AHA_INSIGHT_MAP[axis];
  if (!insight) return "あなたの判断パターンには、自分でも気づいていない法則が隠れている。";

  return score < 0 ? insight.negative : insight.positive;
}

/** 初回回答から検出できる「無自覚な矛盾」パターン */
function detectInitialContradictions(
  s: Record<TraitAxisKey, number>
): string | null {
  // 内向的 × ストレス時に人を求める → 隠れた接続欲求
  if (s.introvert_vs_extrovert < -0.2 && s.stress_isolation_vs_social > 0.2) {
    return "あなたは普段一人の時間を好むのに、追い詰められると人を求める。これは弱さではなく、あなたの安全基地が「信頼できる他者」にあるということ。自分でも気づいていないかもしれないが、あなたの孤独は選択であり、つながりは生存本能。";
  }
  // 慎重 × 新しもの好き → 慎重な冒険者
  if (s.cautious_vs_bold < -0.2 && s.tradition_vs_novelty > 0.2) {
    return "あなたは慎重に見極める人でありながら、新しいものに惹かれ続ける。これは矛盾ではない — あなたは「安全に冒険する方法」を無意識に探している。リスクを取らないのではなく、リスクの取り方に独自のルールがある。";
  }
  // 協調的 × 率直 → 本音の調和者
  if (s.independence_vs_harmony > 0.2 && s.direct_vs_diplomatic < -0.2) {
    return "あなたは調和を大切にしながらも、言葉は率直。これは「優しい人」ではなく「誠実な人」の特徴。相手に合わせるのではなく、本当のことを言っても壊れない関係だけを選んでいる。";
  }
  // 完璧主義 × 大胆 → 高基準の突破者
  if (s.perfectionist_vs_pragmatic < -0.2 && s.cautious_vs_bold > 0.2) {
    return "あなたは完璧を求めながらも、迷わず飛び込む。矛盾に見えるが、これは「高い基準を持ったまま前に進める」という稀有な特性。止まることより、動きながら磨くことを本能的に選んでいる。";
  }
  return null;
}

/** 軸ごとのAhaインサイト（行動→無意識の動機→アイデンティティの3層） */
const AHA_INSIGHT_MAP: Partial<Record<TraitAxisKey, { positive: string; negative: string }>> = {
  introvert_vs_extrovert: {
    negative: "あなたの「一人でいたい」は、社交が嫌いなのではなく、内側の世界が外側より豊かだから。頭の中の対話は、実際の会話より情報量が多い。これはあなたの処理速度が速すぎるために起きている。",
    positive: "あなたが人と関わりたがるのは、寂しさではなく「共鳴」への渇望。一人では生まれない化学反応を無意識に求めている。あなたのエネルギーは他者との接触で増幅する稀有なタイプ。",
  },
  cautious_vs_bold: {
    negative: "あなたの慎重さは「臆病」ではなく「高速シミュレーション」。決断が遅いのではなく、他の人が見えていないリスクまで計算している。あなたの「まだ早い」は、実は最適なタイミング。",
    positive: "あなたの大胆さの正体は「失敗の定義が違う」こと。多くの人が恐れる失敗を、あなたは「データ収集」として処理している。だから動ける。怖くないのではなく、怖さの意味が違う。",
  },
  analytical_vs_intuitive: {
    negative: "あなたは「なぜ？」と問い続ける人。しかしその分析の奥には、世界を予測可能にしたいという深い欲求がある。不確実性への不安ではなく、理解すること自体があなたの安心の源。",
    positive: "あなたの直感は「なんとなく」ではない。膨大な無意識の経験データが瞬時に統合された結果。あなたが「感じた」ことは、論理的に説明できなくても、統計的にはかなり正確。",
  },
  independence_vs_harmony: {
    negative: "あなたが自分の軸を優先するのは、他者を軽んじているからではない。「自分を裏切った関係は長続きしない」という経験則を、無意識に学んでいるから。あなたの独立性は、実は長期的な信頼構築の戦略。",
    positive: "あなたの調和志向は「自分がない」のではなく「場全体を自分の一部として感じている」こと。個の境界が柔らかいのは弱さではなく、関係性の中でしか発揮できない知性がある証拠。",
  },
  stress_isolation_vs_social: {
    negative: "ストレス時に一人を選ぶあなたは、回復に「ノイズの排除」が必要なタイプ。人が嫌いなのではなく、感情の処理に高い集中力を使うため、他者の存在が処理速度を落とす。あなたの孤独は回復の最適化。",
    positive: "追い詰められた時に人を求めるあなたは、他者の存在を「安全信号」として使っている。一人で抱え込めないのではなく、関係性のなかで感情を外在化し整理する高度な処理方法。",
  },
  function_vs_expression: {
    negative: "あなたが機能を優先するのは「美意識がない」のではなく、美の定義が違うから。無駄を削ぎ落とした先の機能美こそが、あなたにとっての最高の表現。",
    positive: "あなたが表現を大切にするのは、言葉にできないものを形にする能力があるから。論理では伝わらない真実を、感覚で伝えられる人は少ない。それがあなたの希少性。",
  },
  tradition_vs_novelty: {
    negative: "定番を選ぶあなたは「保守的」ではなく「本質が見えている」。流行は表層の変化にすぎず、本当に価値あるものは時間に耐えるとあなたは知っている。あなたの選択は、未来からの逆算。",
    positive: "新しいものに惹かれるあなたの本質は「飽き」ではなく「進化欲求」。現状に満足できないのは、あなたの脳がより良い可能性を常にスキャンしているから。それは生存戦略として最適化された好奇心。",
  },
  direct_vs_diplomatic: {
    negative: "あなたの率直さは「空気が読めない」のではなく「嘘のコストを正確に計算できる」こと。婉曲な表現が生む曖昧さより、一瞬の摩擦を選ぶ。あなたの言葉は、長期的には最も誠実。",
    positive: "あなたの外交的な言葉選びは「本音を隠す」のではなく「相手が受け取れる形に翻訳する」能力。同じ真実を、相手の文脈に合わせて再構成できる。それは高度な共感知性。",
  },
};

/**
 * 直接 axis scores から解決（Horizon Function 対応）
 * snapshots があれば完全な確信度計算、なければ簡易版
 *
 * constellation タイプマッチングは除去済み。
 */
export function resolveTypeFromScores(
  axisScores: Record<TraitAxisKey, number>,
  snapshots?: ConfidenceSnapshot[]
): ResolvedResult {
  // Horizon Function で確信度計算
  const axisConfidences = calculateAxisConfidences([], snapshots);

  // スナップショットがある場合は詳細な確信度を計算
  if (snapshots && snapshots.length > 0) {
    const details = calculateAxisConfidenceDetails(snapshots);
    for (const [key, detail] of Object.entries(details)) {
      axisConfidences[key as TraitAxisKey] = detail.confidence;
    }
  }

  // confidence — 軸別確信度の平均
  const confidenceValues = Object.values(axisConfidences);
  const confidence = confidenceValues.length > 0
    ? confidenceValues.reduce((sum, v) => sum + v, 0) / confidenceValues.length
    : 0;

  const reactionType = resolveReactionType(axisScores);

  return {
    reactionType,
    confidence,
    axisScores,
    axisConfidences,
  };
}
