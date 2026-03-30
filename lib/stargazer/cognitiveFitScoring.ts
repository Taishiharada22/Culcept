// lib/stargazer/cognitiveFitScoring.ts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Cognitive Fit スコアリングエンジン v1
//
// CEO方針: v1は簡素に。raw score + confidence + ambiguity flag の3つで持つ。
// 表示段階だけ3帯に落とす。最初から凝りすぎない。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type {
  CognitiveAxisKey,
  CfAnswer,
  CfScore,
  CognitiveQuestion,
} from "./cognitiveFitQuestions";
import {
  CF_QUESTIONS,
  CF_BRANCH_POOL,
  getTempoAdjustment,
} from "./cognitiveFitQuestions";

// ── 型定義 ──────────────────────────────────────────

export interface CognitiveFitResult {
  scores: CfScore[];
  /** 6軸の帯ラベル（表示用） */
  bandLabels: Record<CognitiveAxisKey, CognitiveBand>;
  /** 統合コメント */
  environmentFit: string[];
  /** 矛盾がある軸ペアの説明 */
  contradictionInsight?: string;
}

export type CognitiveBand = {
  label: string;
  side: "left" | "center" | "right";
  /** 強みとしての説明文 */
  strengthNote: string;
};

// ── 帯ラベル定義 ──────────────────────────────────────

const BAND_DEFINITIONS: Record<
  CognitiveAxisKey,
  { left: CognitiveBand; center: CognitiveBand; right: CognitiveBand }
> = {
  abstract_structuring: {
    left: { label: "具体寄り", side: "left", strengthNote: "地に足のついた判断ができる。抽象論に流されない実行力" },
    center: { label: "バランス", side: "center", strengthNote: "状況に応じて具体と抽象を行き来できる" },
    right: { label: "抽象寄り", side: "right", strengthNote: "複雑な情報を上位概念で整理できる。全体像を掴む力" },
  },
  decomposition: {
    left: { label: "全体把握型", side: "left", strengthNote: "大きな絵を見失わない。統合的に判断できる" },
    center: { label: "バランス", side: "center", strengthNote: "全体と部分の両方を見渡せる" },
    right: { label: "分解型", side: "right", strengthNote: "複雑な問題を扱いやすい単位に分解できる" },
  },
  cognitive_updating: {
    left: { label: "保持寄り", side: "left", strengthNote: "判断がブレない。信念を持って行動できる" },
    center: { label: "バランス", side: "center", strengthNote: "必要に応じて判断を修正できる柔軟さ" },
    right: { label: "更新柔軟型", side: "right", strengthNote: "新しい情報を素早く取り込み、判断を修正できる" },
  },
  decision_tempo: {
    left: { label: "即断型", side: "left", strengthNote: "限られた情報でも素早く判断を下せる。行動が速い" },
    center: { label: "バランス", side: "center", strengthNote: "状況に応じてテンポを調整できる" },
    right: { label: "熟考型", side: "right", strengthNote: "情報を十分に吟味してから判断する。精度が高い" },
  },
  social_modeling: {
    left: { label: "行動ベース", side: "left", strengthNote: "観察可能な事実から人を理解する。客観的な判断力" },
    center: { label: "バランス", side: "center", strengthNote: "行動と意図の両面から人を理解できる" },
    right: { label: "意図ベース", side: "right", strengthNote: "相手の考えや背景を読み取る。深い人間理解" },
  },
  exploration_closure: {
    left: { label: "探索寄り", side: "left", strengthNote: "多角的に可能性を検討できる。見落としが少ない" },
    center: { label: "バランス", side: "center", strengthNote: "探索と収束のタイミングを見極められる" },
    right: { label: "収束寄り", side: "right", strengthNote: "素早く方向性を定められる。迷いが少ない" },
  },
};

// ── スコアリング ──────────────────────────────────────

/**
 * Cognitive Fit の回答からスコアを計算する（v1: 簡素版）
 */
export function computeCognitiveFitScores(
  answers: CfAnswer[]
): CognitiveFitResult {
  // 全質問データを結合
  const allQuestions = [...CF_QUESTIONS, ...CF_BRANCH_POOL];

  // 各軸の raw score を集計
  const rawScores: Record<CognitiveAxisKey, number> = {
    abstract_structuring: 0,
    decomposition: 0,
    cognitive_updating: 0,
    decision_tempo: 0,
    social_modeling: 0,
    exploration_closure: 0,
  };

  const observationCounts: Record<CognitiveAxisKey, number> = {
    abstract_structuring: 0,
    decomposition: 0,
    cognitive_updating: 0,
    decision_tempo: 0,
    social_modeling: 0,
    exploration_closure: 0,
  };

  for (const answer of answers) {
    const question = allQuestions.find((q) => q.id === answer.questionId);
    if (!question) continue;

    // メイン選択肢のスコア加算
    const selectedOption = question.options.find(
      (o) => o.id === answer.selectedOptionId
    );
    if (selectedOption) {
      for (const w of selectedOption.weights) {
        rawScores[w.axis] += w.weight;
        observationCounts[w.axis]++;
      }
    }

    // dual select の場合、「最も遠い」選択肢は逆方向に加算
    if (question.dualSelect && answer.furthestOptionId) {
      const furthestOption = question.options.find(
        (o) => o.id === answer.furthestOptionId
      );
      if (furthestOption) {
        for (const w of furthestOption.weights) {
          rawScores[w.axis] -= w.weight * 0.5; // 「遠い」は半分の重みで逆方向
          observationCounts[w.axis]++;
        }
      }
    }

    // 反応時間の補助シグナル
    const tempoAdj = getTempoAdjustment(
      answer.responseTimeMs,
      answer.selectionChanges
    );
    rawScores.decision_tempo += tempoAdj.decision_tempo;
    rawScores.cognitive_updating += tempoAdj.cognitive_updating;
  }

  // スコア正規化（v1: 単純clamp）
  const axes: CognitiveAxisKey[] = [
    "abstract_structuring",
    "decomposition",
    "cognitive_updating",
    "decision_tempo",
    "social_modeling",
    "exploration_closure",
  ];

  const scores: CfScore[] = axes.map((axis) => {
    const raw = rawScores[axis];
    const obsCount = observationCounts[axis];

    // v1: 単純にclampして正規化
    const normalized = Math.max(-1, Math.min(1, raw));

    // 確信度: 観測数ベース（v1は簡素に）
    const confidence = Math.min(0.6, obsCount * 0.1);

    return {
      axis,
      rawScore: normalized,
      confidence,
      ambiguityFlag: Math.abs(normalized) < 0.15, // 判定が曖昧
    };
  });

  // 帯ラベル
  const bandLabels: Record<CognitiveAxisKey, CognitiveBand> = {} as Record<CognitiveAxisKey, CognitiveBand>;
  for (const score of scores) {
    const defs = BAND_DEFINITIONS[score.axis];
    if (score.rawScore < -0.3) {
      bandLabels[score.axis] = defs.left;
    } else if (score.rawScore > 0.3) {
      bandLabels[score.axis] = defs.right;
    } else {
      bandLabels[score.axis] = defs.center;
    }
  }

  // 環境適性コメント生成
  const environmentFit = deriveEnvironmentFit(rawScores);

  // 矛盾検出
  const contradictionInsight = detectContradiction(scores);

  return {
    scores,
    bandLabels,
    environmentFit,
    contradictionInsight,
  };
}

// ── 環境適性コメント ──────────────────────────────────

function deriveEnvironmentFit(
  scores: Record<CognitiveAxisKey, number>
): string[] {
  const fits: string[] = [];

  if (scores.abstract_structuring > 0.3 && scores.decomposition > 0.3) {
    fits.push("複雑な問題を構造化して解決する環境（企画、リサーチ、設計）");
  }
  if (scores.decision_tempo < -0.3 && scores.cognitive_updating > 0.3) {
    fits.push("変化が速く、判断の修正が頻繁な環境（スタートアップ、プロジェクト推進）");
  }
  if (scores.social_modeling > 0.3 && scores.exploration_closure < -0.3) {
    fits.push("多様な人と対話しながら可能性を探る環境（マネジメント、カウンセリング）");
  }
  if (scores.decision_tempo > 0.3 && scores.abstract_structuring > 0.3) {
    fits.push("じっくり考えて深い分析を求められる環境（研究、戦略企画、専門職）");
  }
  if (scores.decomposition > 0.3 && scores.exploration_closure > 0.3) {
    fits.push("タスクを整理して効率的に進める環境（オペレーション、プロジェクト管理）");
  }
  if (scores.social_modeling > 0.3 && scores.cognitive_updating > 0.3) {
    fits.push("チームの中で柔軟に役割を変えられる環境（クリエイティブチーム、共同開発）");
  }
  if (scores.abstract_structuring < -0.3 && scores.decision_tempo < -0.3) {
    fits.push("手を動かしながら形にしていく環境（実装、制作、ものづくり）");
  }

  // デフォルト（何も当てはまらない場合）
  if (fits.length === 0) {
    fits.push("状況に応じて柔軟に認知スタイルを切り替えられる — 幅広い環境に適応可能");
  }

  return fits.slice(0, 3);
}

// ── 矛盾検出 ──────────────────────────────────

function detectContradiction(scores: CfScore[]): string | undefined {
  const getScore = (axis: CognitiveAxisKey) =>
    scores.find((s) => s.axis === axis)?.rawScore ?? 0;

  // decomposition が高い（分解型）のに decision_tempo が低い（即断型）
  if (getScore("decomposition") > 0.3 && getScore("decision_tempo") < -0.3) {
    return "問題を分解して考える力が高いのに、判断テンポは即断型です。分解した瞬間に最善手が見えるタイプかもしれません。";
  }

  // abstract_structuring が高い（抽象型）のに exploration_closure が高い（収束型）
  if (getScore("abstract_structuring") > 0.3 && getScore("exploration_closure") > 0.3) {
    return "抽象的に構造を掴む力がありつつ、素早く絞り込む傾向もあります。「全体を一瞬で掴んで即決する」タイプかもしれません。";
  }

  // cognitive_updating が高い（柔軟）のに decision_tempo が低い（即断）
  if (getScore("cognitive_updating") > 0.3 && getScore("decision_tempo") < -0.3) {
    return "判断は素早いのに、新しい情報が入ると柔軟に変えられる。「決断は速いが、固執はしない」という稀なバランスです。";
  }

  return undefined;
}

// ── スコアからUI表示データを生成 ──────────────

/**
 * CF 6軸のスコアから表示用データ（bandLabels + environmentFit + contradictionInsight）を生成。
 * computeCognitiveFitScores() と違い CfAnswer[] が不要。スコアだけで動く。
 */
export function deriveCognitiveFitDisplay(
  scores: Record<string, number>,
): {
  bandLabels: Record<string, CognitiveBand>;
  environmentFit: string[];
  contradictionInsight?: string;
} {
  const axes: CognitiveAxisKey[] = [
    "abstract_structuring", "decomposition", "cognitive_updating",
    "decision_tempo", "social_modeling", "exploration_closure",
  ];

  const bandLabels: Record<string, CognitiveBand> = {};
  const cfScores: { axis: CognitiveAxisKey; rawScore: number; confidence: number; ambiguityFlag: boolean }[] = [];

  for (const axis of axes) {
    const score = scores[axis] ?? 0;
    const defs = BAND_DEFINITIONS[axis];
    if (!defs) continue;

    if (score < -0.3) bandLabels[axis] = defs.left;
    else if (score > 0.3) bandLabels[axis] = defs.right;
    else bandLabels[axis] = defs.center;

    cfScores.push({ axis, rawScore: score, confidence: 0.3, ambiguityFlag: Math.abs(score) < 0.15 });
  }

  const rawScores = Object.fromEntries(axes.map((a) => [a, scores[a] ?? 0])) as Record<CognitiveAxisKey, number>;
  const environmentFit = deriveEnvironmentFit(rawScores);
  const contradictionInsight = detectContradiction(cfScores);

  return { bandLabels, environmentFit, contradictionInsight };
}

// ── 認知特性サマリー生成（適職セクション向け） ──────────────

const CF_AXIS_SHORT_LABELS: Record<CognitiveAxisKey, { left: string; right: string }> = {
  abstract_structuring: { left: "具体的に考える", right: "抽象的に構造化する" },
  decomposition: { left: "全体を俯瞰する", right: "細かく分解する" },
  cognitive_updating: { left: "判断を貫く", right: "柔軟に判断を更新する" },
  decision_tempo: { left: "素早く決める", right: "じっくり考えて決める" },
  social_modeling: { left: "行動から人を読む", right: "意図から人を読む" },
  exploration_closure: { left: "広く可能性を探る", right: "素早く絞り込む" },
};

/**
 * 認知特性のうち、はっきり傾向が出ている上位2-3軸を自然文で返す。
 * 適職セクションのヘッダー下に表示する用途。
 */
export function summarizeCognitiveProfile(
  scores: Partial<Record<string, number>>,
): string | null {
  const axes: CognitiveAxisKey[] = [
    "abstract_structuring", "decomposition", "cognitive_updating",
    "decision_tempo", "social_modeling", "exploration_closure",
  ];

  const ranked = axes
    .filter((a) => scores[a] !== undefined && Math.abs(scores[a]!) > 0.2)
    .sort((a, b) => Math.abs(scores[b]!) - Math.abs(scores[a]!))
    .slice(0, 3);

  if (ranked.length === 0) return null;

  const parts = ranked.map((axis) => {
    const val = scores[axis]!;
    const labels = CF_AXIS_SHORT_LABELS[axis];
    return val < 0 ? labels.left : labels.right;
  });

  if (parts.length === 1) return `「${parts[0]}」タイプ`;
  if (parts.length === 2) return `「${parts[0]}」＋「${parts[1]}」タイプ`;
  return `「${parts[0]}」「${parts[1]}」「${parts[2]}」の組み合わせ`;
}

/**
 * 職種の cfWeights から、この職種で認知的にどう合っているかの説明を返す。
 */
export function describeCfFitForJob(
  cfScores: Partial<Record<string, number>>,
  cfWeights: Partial<Record<CognitiveAxisKey, number>>,
): string | null {
  const fits: { axis: CognitiveAxisKey; label: string }[] = [];

  for (const [axis, weight] of Object.entries(cfWeights) as [CognitiveAxisKey, number][]) {
    const val = cfScores[axis];
    if (val === undefined) continue;
    const alignment = val * weight;
    if (alignment > 0.1) {
      const labels = CF_AXIS_SHORT_LABELS[axis];
      fits.push({ axis, label: val < 0 ? labels.left : labels.right });
    }
  }

  if (fits.length === 0) return null;
  const top = fits.slice(0, 2).map((f) => f.label);
  return `認知的にも「${top.join("」「")}」力がこの仕事と噛み合っている`;
}

// ── 既存traitAxesとの推定マッピング ──────────────

/**
 * Cognitive Fit 未回答時のフォールバック推定
 * 既存の性格軸スコアから、認知スタイルの初期推定を行う
 */
export function estimateCognitiveFromTraits(
  traits: Partial<Record<string, number>>
): Partial<Record<CognitiveAxisKey, number>> {
  return {
    abstract_structuring: (traits.analytical_vs_intuitive ?? 0) * 0.4,
    decomposition: (traits.plan_vs_spontaneous ?? 0) * 0.3,
    cognitive_updating: -(traits.change_embrace_vs_resist ?? 0) * 0.3,
    decision_tempo: (traits.cautious_vs_bold ?? 0) * 0.3,
    social_modeling: (traits.direct_vs_diplomatic ?? 0) * 0.2,
    exploration_closure: (traits.quality_vs_quantity ?? 0) * 0.2,
  };
}
