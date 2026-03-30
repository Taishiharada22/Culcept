import "server-only";

// lib/stargazer/adaptiveQ2.ts
// 適応的Q2生成エンジン — Q1の回答・行動シグナルに基づきQ2を動的に生成する
//
// 設計原則:
// - Q2はQ1の「自然な深掘り」でなければならない。唐突な質問はNG
// - Q1で極端な回答 → 逆極を探る（「本当にそうか？」を検証）
// - Q1で躊躇 → その迷いの核心に具体シナリオで迫る
// - Q1で素早い中庸回答 → 関連軸にクロス探索（回避の可能性）
// - Q1で矛盾 → 矛盾を直接提示し、その理由を問う
//
// フォールバック: AI失敗時は質問プールから軸重み付き選択

import { runAI } from "@/lib/ai";
import { makeStargazerRunMetadata } from "./studentTrack";
import {
  TRAIT_AXES,
  getAxisLabels,
  type TraitAxisKey,
} from "./traitAxes";
import {
  buildGeneratedQuestionSchema,
  coerceGeneratedQuestion,
  parseGeneratedQuestionPayload,
  validateGeneratedQuestion,
} from "./questionGenerator";
import type { GeneratedQuestion } from "./questionPoolTypes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Q1の回答とそれに伴う行動シグナルの全文脈 */
export interface Q1Context {
  /** Q1の質問文 */
  questionText: string;
  /** Q1の対象軸 */
  axisId: TraitAxisKey;
  /** Q1で選択されたオプションのラベル */
  selectedOptionLabel: string;
  /** Q1のスコア (-1 ~ +1) */
  score: number;
  /** Q1の選択肢一覧 (label + score) */
  options: { label: string; score: number }[];

  // 行動シグナル
  /** Q1の応答時間 (ms) */
  responseTimeMs: number;
  /** セッション平均応答時間 (ms) */
  averageResponseTimeMs: number;
  /** 回答を変更したか */
  answerChanged: boolean;
  /** 変更前の回答ラベル (answerChanged=true の場合) */
  previousAnswerLabel?: string;
  /** ホバーしたが選ばなかった選択肢のラベルと滞留時間 */
  unchosenHoverDurations?: Record<string, number>;

  // ユーザーの既存軸スコア (観測済みの軸のみ)
  existingAxisScores?: Partial<Record<TraitAxisKey, number>>;
  /** この軸の過去スコア */
  previousScoresOnAxis?: number[];
  /** セッション内の回答数 */
  sessionDepth?: number;
}

/** Q2適応戦略の種別 */
export type AdaptationStrategy =
  | "opposite_extreme"     // 逆極探索 — 極端な回答の反証
  | "hesitation_concrete"  // 躊躇具体化 — 迷いを具体シナリオで掘る
  | "cross_axis"           // クロス軸探索 — 関連軸への横展開
  | "contradiction_probe"  // 矛盾プローブ — 過去データとの矛盾を問う
  | "answer_change_probe"; // 回答変更プローブ — 変心の理由を掘る

/** 生成されたQ2 */
export interface AdaptiveQuestion {
  /** 質問文 (日本語) */
  prompt: string;
  /** 4つの選択肢 */
  options: { label: string; score: number }[];
  /** 対象軸 */
  targetAxisId: TraitAxisKey;
  /** 採用された適応戦略 */
  strategy: AdaptationStrategy;
  /** AI生成の理由 (デバッグ用) */
  reasoning?: string;
  /** 永続化済みの安定質問キー */
  questionKey?: string;
  /** 生成元 ai_runs.id */
  sourceAiRunId?: string | null;
  /** フォールバックで生成されたか */
  isFallback: boolean;
  /** 品質スコア (0-1, フォールバック時は低め) */
  qualityScore: number;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Strategy Selection
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Q1の回答パターンから最適な適応戦略を決定する。
 * 優先度: 回答変更 > 矛盾 > 極端な回答 > 躊躇 > クロス軸
 */
export function selectStrategy(ctx: Q1Context): AdaptationStrategy {
  const responseRatio =
    ctx.averageResponseTimeMs > 0
      ? ctx.responseTimeMs / ctx.averageResponseTimeMs
      : 1.0;

  // 回答変更: 一度選んでから変えた場合、変心の理由は最も深い観測ポイント
  if (ctx.answerChanged && ctx.previousAnswerLabel) {
    return "answer_change_probe";
  }

  // 矛盾検出: 過去スコアと大きく異なる場合
  if (ctx.previousScoresOnAxis && ctx.previousScoresOnAxis.length > 0) {
    const recentScores = ctx.previousScoresOnAxis.slice(-3);
    const recentAvg =
      recentScores.reduce((s, v) => s + v, 0) / recentScores.length;
    const scoreDiff = Math.abs(ctx.score - recentAvg);
    if (scoreDiff > 0.8) {
      return "contradiction_probe";
    }
  }

  // 極端な回答: スコアが強く偏っている場合、逆極を探る
  if (Math.abs(ctx.score) > 0.7) {
    return "opposite_extreme";
  }

  // 躊躇: 応答時間が平均の1.5倍以上
  if (responseRatio > 1.5) {
    return "hesitation_concrete";
  }

  // 素早い中庸回答: 関連軸にクロス探索
  return "cross_axis";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Related Axis Resolution
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 同カテゴリ内で異なる軸を探す。なければ近隣カテゴリから選ぶ。
 */
function findRelatedAxis(currentAxisId: TraitAxisKey): TraitAxisKey | null {
  const current = TRAIT_AXES.find((a) => a.id === currentAxisId);
  if (!current) return null;

  // 同カテゴリの別軸
  const sameCategory = TRAIT_AXES.filter(
    (a) => a.category === current.category && a.id !== currentAxisId
  );
  if (sameCategory.length > 0) {
    // ランダムに1つ選択 (セッション内での多様性のため)
    return sameCategory[Math.floor(Math.random() * sameCategory.length)].id;
  }

  // 近隣カテゴリ定義
  const CATEGORY_NEIGHBORS: Record<string, string[]> = {
    core: ["emotional", "motion"],
    relational: ["relational_deep", "emotional"],
    motion: ["aesthetic", "core"],
    aesthetic: ["motion", "core"],
    emotional: ["core", "relational"],
    safety: ["relational_deep", "relational"],
    relational_deep: ["relational", "safety"],
  };

  const neighbors = CATEGORY_NEIGHBORS[current.category] ?? [];
  for (const neighborCat of neighbors) {
    const neighborAxes = TRAIT_AXES.filter((a) => a.category === neighborCat);
    if (neighborAxes.length > 0) {
      return neighborAxes[Math.floor(Math.random() * neighborAxes.length)].id;
    }
  }

  return null;
}

export function resolveAdaptiveTargetAxis(
  ctx: Q1Context,
  strategy: AdaptationStrategy,
): TraitAxisKey {
  if (strategy === "cross_axis") {
    const related = findRelatedAxis(ctx.axisId);
    if (related) return related;
  }
  return ctx.axisId;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AI Prompt Building
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const Q2_SYSTEM_PROMPT = `あなたはStargazerの適応型質問設計者です。
ユーザーがQ1（最初の質問）に回答した直後に表示する「Q2（深掘り質問）」を生成します。

Q2の絶対原則:
1. Q2はQ1の回答を受けた「自然な会話の流れ」でなければならない
2. Q1とは異なる角度・シナリオで、同じ（または関連する）軸を掘り下げる
3. Q1の回答を受けて「ユーザーが自分でも気づいていないこと」を引き出す
4. 選択肢は4つ。各選択肢にスコア(-1.0〜+1.0)を付与
5. 選択肢は価値判断を含まない中立的な表現
6. 質問文は日本語で30-80文字。選択肢は10-25文字

出力: 以下のJSON形式（厳密に守ること）
{
  "prompt": "Q2の質問文",
  "options": [
    { "label": "選択肢1", "score": -0.7 },
    { "label": "選択肢2", "score": -0.2 },
    { "label": "選択肢3", "score": 0.3 },
    { "label": "選択肢4", "score": 0.7 }
  ]
}

重要:
- 追加キーは禁止
- reasoning などの自由記述は禁止
- 出力はJSONオブジェクト本体のみ。コードフェンス・前置き・後書きは禁止
- prompt と options[].label は必ず1行のプレーンテキストにする
- prompt と options[].label の中に改行、タブ、バッククォート、ASCIIダブルクォートを入れない`;

function buildStrategyInstruction(
  strategy: AdaptationStrategy,
  ctx: Q1Context,
): string {
  const labels = getAxisLabels(ctx.axisId);
  const left = labels?.left ?? ctx.axisId;
  const right = labels?.right ?? ctx.axisId;

  switch (strategy) {
    case "opposite_extreme": {
      const chosenSide = ctx.score > 0 ? right : left;
      const oppositeSide = ctx.score > 0 ? left : right;
      return `【戦略: 逆極探索】
ユーザーは「${chosenSide}」に強く偏った回答をしました。
Q2では「${oppositeSide}」が自然に出る状況・シナリオを提示し、
「本当に常に${chosenSide}か？ ${oppositeSide}が出る条件はないか？」を検証してください。
例: 「もし〜な状況だったら、${oppositeSide}に傾くことはある？」のような問い。`;
    }

    case "hesitation_concrete": {
      const ratio = ctx.averageResponseTimeMs > 0
        ? (ctx.responseTimeMs / ctx.averageResponseTimeMs).toFixed(1)
        : "不明";
      return `【戦略: 躊躇の具体化】
ユーザーはこの質問に通常の${ratio}倍の時間をかけて回答しました。
「${left}」と「${right}」の間で迷いがあります。
Q2では、日常の具体的な場面を1つ提示し、
その場面でどう振る舞うかを問うことで、迷いの核心に迫ってください。
抽象的な問いではなく、「昨日こんなことがあったとしたら」レベルの具体性で。`;
    }

    case "cross_axis": {
      const relatedAxisId = findRelatedAxis(ctx.axisId);
      const relatedLabels = relatedAxisId
        ? getAxisLabels(relatedAxisId)
        : null;
      const targetDesc = relatedLabels
        ? `「${relatedLabels.left} ⇔ ${relatedLabels.right}」`
        : `関連する別の観点`;
      return `【戦略: クロス軸探索】
ユーザーはQ1に素早く回答しました（深く考えなかった可能性）。
Q2では${targetDesc}の方向に展開してください。
Q1の回答内容と自然に繋がりつつも、新しい切り口で内面に迫ります。
${relatedAxisId ? `Q2の対象軸: ${relatedAxisId}` : ""}`;
    }

    case "contradiction_probe": {
      const prevScores = ctx.previousScoresOnAxis ?? [];
      const recentAvg = prevScores.length > 0
        ? (prevScores.slice(-3).reduce((s, v) => s + v, 0) /
            Math.min(prevScores.length, 3)).toFixed(2)
        : "不明";
      const currentDir = ctx.score > 0 ? right : left;
      const prevDir = Number(recentAvg) > 0 ? right : left;
      return `【戦略: 矛盾プローブ】
ユーザーの今の回答(${currentDir}寄り, スコア${ctx.score.toFixed(2)})は、
過去の傾向(${prevDir}寄り, 平均${recentAvg})と矛盾しています。
Q2では「状況が変わるとあなたの判断は変わるか？」「以前と今で何が違うか？」
といった角度で、この矛盾が単なる揺れなのか、変化なのか、多面性なのかを見極める質問を作ってください。`;
    }

    case "answer_change_probe": {
      return `【戦略: 回答変更プローブ】
ユーザーは一度「${ctx.previousAnswerLabel}」を選んだ後、
「${ctx.selectedOptionLabel}」に変更しました。
この変心は最も深い観測ポイントです。
Q2では「最初に惹かれたものと、最終的に選んだものが違う」という体験を
日常の場面に置き換えた質問を作ってください。
例: 「直感と熟慮で答えが変わるとき、どちらを信じる？」のような角度。`;
    }
  }
}

export function buildQ2UserPrompt(
  strategy: AdaptationStrategy,
  ctx: Q1Context,
): string {
  const labels = getAxisLabels(ctx.axisId);
  const left = labels?.left ?? ctx.axisId;
  const right = labels?.right ?? ctx.axisId;

  const strategyInstruction = buildStrategyInstruction(strategy, ctx);

  // 既存軸スコアのサマリ (上位5軸)
  let axisScoreSummary = "";
  if (ctx.existingAxisScores) {
    const entries = Object.entries(ctx.existingAxisScores)
      .filter(([, v]) => v !== 0 && v != null)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .slice(0, 5);

    if (entries.length > 0) {
      axisScoreSummary = `\n\n【ユーザーの既知の傾向(上位5軸)】\n${entries
        .map(([axisId, score]) => {
          const l = getAxisLabels(axisId as TraitAxisKey);
          return l
            ? `  ${l.left}⇔${l.right}: ${score > 0 ? l.right : l.left}寄り(${score.toFixed(2)})`
            : `  ${axisId}: ${score.toFixed(2)}`;
        })
        .join("\n")}`;
    }
  }

  // ホバー分析
  let hoverNote = "";
  if (ctx.unchosenHoverDurations) {
    const longHovers = Object.entries(ctx.unchosenHoverDurations)
      .filter(([, dur]) => dur > 1000)
      .sort((a, b) => b[1] - a[1]);
    if (longHovers.length > 0) {
      hoverNote = `\n\n【選ばなかったが気になった選択肢】\n${longHovers
        .map(([label, dur]) => `  「${label}」に${(dur / 1000).toFixed(1)}秒滞留`)
        .join("\n")}`;
    }
  }

  // Q2の対象軸を決定
  let targetAxisNote = "";
  if (strategy === "cross_axis") {
    const relatedAxisId = findRelatedAxis(ctx.axisId);
    if (relatedAxisId) {
      const relatedLabels = getAxisLabels(relatedAxisId);
      targetAxisNote = `\n\n【Q2の対象軸】${relatedAxisId}
  左極: ${relatedLabels?.left ?? ""}
  右極: ${relatedLabels?.right ?? ""}`;
    }
  }

  return `以下のQ1回答を踏まえて、Q2を1問生成してください。

【Q1の質問】${ctx.questionText}
【Q1の対象軸】${ctx.axisId} (${left} ⇔ ${right})
【ユーザーの回答】${ctx.selectedOptionLabel} (スコア: ${ctx.score.toFixed(2)})
【応答時間】${(ctx.responseTimeMs / 1000).toFixed(1)}秒 (セッション平均: ${(ctx.averageResponseTimeMs / 1000).toFixed(1)}秒)
${ctx.answerChanged ? `【回答変更あり】${ctx.previousAnswerLabel} → ${ctx.selectedOptionLabel}` : ""}
${axisScoreSummary}${hoverNote}${targetAxisNote}

${strategyInstruction}

Q2の選択肢スコア設計:
- 選択肢1: -0.8 〜 -0.5 (強く左極寄り)
- 選択肢2: -0.3 〜 -0.1 (やや左極寄り)
- 選択肢3: +0.1 〜 +0.4 (やや右極寄り)
- 選択肢4: +0.5 〜 +0.8 (強く右極寄り)

出力制約:
- JSONオブジェクト1件のみを返す
- コードフェンス・説明文・箇条書きは禁止
- prompt と各 label は1行のプレーンテキストのみ
- prompt と各 label に改行、タブ、バッククォート、ASCIIダブルクォートを入れない`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fallback — 質問プールからの軸重み付き選択
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * AI失敗時のフォールバック質問を生成する。
 * 同カテゴリの別軸、または同軸の反対方向の定型質問を返す。
 */
function generateFallbackQuestion(
  strategy: AdaptationStrategy,
  ctx: Q1Context,
): AdaptiveQuestion {
  const labels = getAxisLabels(ctx.axisId);
  const left = labels?.left ?? "左極";
  const right = labels?.right ?? "右極";

  // 戦略に応じた定型フォールバック質問
  let prompt: string;
  let targetAxisId: TraitAxisKey = ctx.axisId;
  let options: { label: string; score: number }[];

  switch (strategy) {
    case "opposite_extreme": {
      const oppositeSide = ctx.score > 0 ? left : right;
      prompt = `もし「${oppositeSide}」であることが求められる状況になったら、どう感じる？`;
      options = [
        { label: "強い抵抗を感じる", score: ctx.score > 0 ? 0.7 : -0.7 },
        { label: "少し居心地が悪い", score: ctx.score > 0 ? 0.3 : -0.3 },
        { label: "意外とやれるかも", score: ctx.score > 0 ? -0.2 : 0.2 },
        { label: `実は${oppositeSide}な面もある`, score: ctx.score > 0 ? -0.6 : 0.6 },
      ];
      break;
    }

    case "hesitation_concrete":
      prompt = `「${left}」と「${right}」で迷うとき、最終的に何が決め手になる？`;
      options = [
        { label: "過去の経験に頼る", score: -0.5 },
        { label: "周囲の反応を想像する", score: -0.2 },
        { label: "その時の直感で決める", score: 0.3 },
        { label: "先の結果をシミュレーションする", score: 0.6 },
      ];
      break;

    case "cross_axis": {
      const relatedAxisId = findRelatedAxis(ctx.axisId);
      if (relatedAxisId) {
        targetAxisId = relatedAxisId;
        const relatedLabels = getAxisLabels(relatedAxisId);
        const rl = relatedLabels?.left ?? "左極";
        const rr = relatedLabels?.right ?? "右極";
        prompt = `先ほどの回答を踏まえると、「${rl}」と「${rr}」の間ではどちら寄り？`;
        options = [
          { label: `明らかに${rl}寄り`, score: -0.7 },
          { label: `どちらかと言えば${rl}`, score: -0.2 },
          { label: `どちらかと言えば${rr}`, score: 0.3 },
          { label: `明らかに${rr}寄り`, score: 0.7 },
        ];
      } else {
        prompt = `この傾向は、ストレスを感じている時でも同じ？`;
        options = [
          { label: "全く変わらない", score: -0.6 },
          { label: "少し揺れるかも", score: -0.2 },
          { label: "結構変わると思う", score: 0.3 },
          { label: "真逆になることもある", score: 0.7 },
        ];
      }
      break;
    }

    case "contradiction_probe":
      prompt = `この領域の自分の判断は、最近変わってきた実感がある？`;
      options = [
        { label: "全く変わっていない", score: -0.6 },
        { label: "少しだけ変化を感じる", score: -0.2 },
        { label: "かなり変わった気がする", score: 0.4 },
        { label: "以前とは別人のよう", score: 0.7 },
      ];
      break;

    case "answer_change_probe":
      prompt = `直感で選ぶものと、考えた末に選ぶものが違うことはよくある？`;
      options = [
        { label: "ほぼ同じ結果になる", score: -0.6 },
        { label: "たまに違うことがある", score: -0.2 },
        { label: "結構違うことが多い", score: 0.3 },
        { label: "いつも違う結果になる", score: 0.7 },
      ];
      break;
  }

  return {
    prompt,
    options,
    targetAxisId,
    strategy,
    reasoning: "AI生成失敗によるフォールバック質問",
    isFallback: true,
    qualityScore: 0.35,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Quality Scoring
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Q2の品質を評価する。
 *
 * 品質基準:
 * 1. Q1からの自然な流れか (戦略との整合性)
 * 2. Q1が扱わなかった新しい角度があるか
 * 3. 選択肢のスコアが適切に分散しているか
 */
function scoreQ2Quality(
  q: GeneratedQuestion,
  strategy: AdaptationStrategy,
  ctx: Q1Context,
): number {
  let score = 0.5; // 基本スコア

  // 1. 選択肢スコアの分散 — 偏りすぎは低品質
  const scores = q.options.map((o) => o.score);
  const hasNeg = scores.some((s) => s < -0.1);
  const hasPos = scores.some((s) => s > 0.1);
  if (hasNeg && hasPos) score += 0.15;

  const spread = Math.max(...scores) - Math.min(...scores);
  if (spread >= 1.0) score += 0.1;
  if (spread >= 1.2) score += 0.05;

  // 2. 質問長の適正 — 30-80文字が理想
  const promptLen = q.prompt.length;
  if (promptLen >= 30 && promptLen <= 80) score += 0.1;
  else if (promptLen >= 20 && promptLen <= 100) score += 0.05;

  // 3. 選択肢長の適正 — 10-25文字が理想
  const avgLabelLen =
    q.options.reduce((sum, o) => sum + o.label.length, 0) / q.options.length;
  if (avgLabelLen >= 8 && avgLabelLen <= 28) score += 0.1;

  return Math.min(1.0, Math.max(0, score));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main Function
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Q1の回答と行動シグナルに基づいて、適応的なQ2を生成する。
 *
 * 使い方:
 * 1. ユーザーがQ1に回答した直後にサーバーサイドで呼ぶ
 * 2. 返されたAdaptiveQuestionをクライアントに送信し、Q2として表示
 * 3. Q2の回答は通常のスコアリングパイプラインに流す
 *
 * @param q1Context - Q1の回答と行動シグナルの全文脈
 * @returns Q2として表示する適応的質問
 */
export async function generateAdaptiveQ2(
  q1Context: Q1Context,
): Promise<AdaptiveQuestion> {
  const strategy = selectStrategy(q1Context);

  // Q2の対象軸を決定
  const targetAxisId = resolveAdaptiveTargetAxis(q1Context, strategy);

  // AI呼び出し
  try {
    const userPrompt = buildQ2UserPrompt(strategy, q1Context);

    const result = await runAI({
      taskType: "stargazer_adaptive_q2",
      prompt: userPrompt,
      systemPrompt: Q2_SYSTEM_PROMPT,
      jsonSchema: buildGeneratedQuestionSchema(),
      requireJson: true,
      temperature: 0.25,
      maxOutputTokens: 1024,
      preferredProvider: "gemini",
      metadata: makeStargazerRunMetadata({
        q1AxisId: q1Context.axisId,
        q2TargetAxisId: targetAxisId,
        strategy,
        q1Score: q1Context.score,
        responseTimeRatio:
          q1Context.averageResponseTimeMs > 0
            ? q1Context.responseTimeMs / q1Context.averageResponseTimeMs
            : 1.0,
        answerChanged: q1Context.answerChanged,
        sessionDepth: q1Context.sessionDepth ?? 0,
      }),
    });

    let parsed: unknown[];

    if (!result.success) {
      if (result.text.trim()) {
        try {
          parsed = parseGeneratedQuestionPayload(result);
        } catch (e) {
          console.warn("[adaptiveQ2] Provider failed and raw recovery also failed:", {
            errorMessage: result.errorMessage,
            parseError: e instanceof Error ? e.message : "parse_failed",
            rawTextSample: result.text.slice(0, 500),
            aiRunId: result.aiRunId,
          });
          return generateFallbackQuestion(strategy, q1Context);
        }
      } else {
        console.warn(
          "[adaptiveQ2] AI generation failed, using fallback:",
          result.errorMessage,
        );
        return generateFallbackQuestion(strategy, q1Context);
      }
    } else {
      try {
        parsed = parseGeneratedQuestionPayload(result);
      } catch (e) {
        console.warn("[adaptiveQ2] Parse failed, using fallback:", e);
        return generateFallbackQuestion(strategy, q1Context);
      }
    }

    if (parsed.length === 0) {
      console.warn("[adaptiveQ2] Empty parsed result, using fallback");
      return generateFallbackQuestion(strategy, q1Context);
    }

    // 最初の質問を取得・バリデーション
    const raw = parsed[0];
    const generatedQ: GeneratedQuestion = coerceGeneratedQuestion(raw);

    const validation = validateGeneratedQuestion(generatedQ, targetAxisId);
    if (!validation.valid) {
      console.warn(
        "[adaptiveQ2] Validation failed, using fallback:",
        validation.reason,
      );
      return generateFallbackQuestion(strategy, q1Context);
    }

    const qualityScore = scoreQ2Quality(generatedQ, strategy, q1Context);

    return {
      prompt: generatedQ.prompt,
      options: generatedQ.options,
      targetAxisId,
      strategy,
      reasoning: generatedQ.reasoning,
      sourceAiRunId: result.aiRunId,
      isFallback: false,
      qualityScore,
    };
  } catch (error) {
    console.error("[adaptiveQ2] Unexpected error, using fallback:", error);
    return generateFallbackQuestion(strategy, q1Context);
  }
}
