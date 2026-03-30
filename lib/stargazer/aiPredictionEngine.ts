import "server-only";

// lib/stargazer/aiPredictionEngine.ts
// AI-Powered Prediction Engine — テンプレートではなく AI が個人データに基づいて予測を生成する
//
// 設計思想:
// "予言が当たった瞬間、ユーザーはこのアプリを「すごい」ではなく「怖い」と感じる。
//  テンプレートでは「怖い」は生まれない。データに基づく具体性だけが「怖い」を生む。"
//
// Anti-Barnum 防御:
// - 各予測は最低2つの具体的データポイントを参照する
// - 「誰にでも当てはまる」予測を排除するため specificity score を算出
// - 検証可能な具体的トリガーシナリオを含める

import { runAI } from "@/lib/ai";
import { makeStargazerRunMetadata } from "./studentTrack";
import { TRAIT_AXES, type TraitAxisKey } from "./traitAxes";
import type { ContradictionResult } from "./contradictionDetector";
import type { DetectedPattern } from "./patternDetectionEngine";
import type {
  Prediction,
  PredictionType,
  PredictionFeedback,
  DailyPredictionParams,
} from "./predictionEngine";
import { generateDailyPrediction } from "./predictionEngine";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface AIPrediction extends Prediction {
  /** トリガーシナリオ: ユーザーが「この瞬間」に注目すべきポイント */
  triggerScenario: string;
  /** 代替結末: 予測と異なる行動をした場合の自己洞察 */
  alternativeOutcome: string;
  /** 具体性スコア (0-1): この予測がどれだけ個人化されているか */
  specificityScore: number;
  /** 参照したデータポイント */
  dataPointsUsed: string[];
  /** AI 生成か否か */
  aiGenerated: true;
}

export interface AIPredictionParams {
  userId: string;
  /** 軸スコア (TraitAxisKey -> score) */
  axisScores: Record<string, number>;
  /** 観測回数 */
  observationCount: number;
  /** 曜日 (0=日, 6=土) */
  dayOfWeek: number;
  /** 現在時刻の時 (0-23) */
  currentHour: number;
  /** 検出済み矛盾 (上位5件まで) */
  contradictions: ContradictionResult[];
  /** 検出済みパターン (上位10件まで) */
  detectedPatterns: DetectedPattern[];
  /** 軸のトレンド情報: 最近変動が大きい軸 */
  axisTrends: AxisTrend[];
  /** 過去の予測精度 (カテゴリ別) */
  accuracyByCategory: Record<string, { correct: number; wrong: number; total: number }>;
  /** 直近の予測 (重複回避用) */
  previousPredictions?: Prediction[];
}

export interface AxisTrend {
  axisId: TraitAxisKey;
  /** 最近3日の変化方向 (-1 ~ +1) */
  direction: number;
  /** 変化の大きさ (0-1) */
  magnitude: number;
  /** 何日間のデータか */
  daySpan: number;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const DAY_LABELS = ["日曜", "月曜", "火曜", "水曜", "木曜", "金曜", "土曜"] as const;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const TIME_PERIOD_LABELS: Record<string, string> = {
  morning: "朝（5-12時）",
  afternoon: "昼（12-17時）",
  evening: "夕方〜夜（17-22時）",
  late_night: "深夜（22-5時）",
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getTimePeriod(hour: number): string {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "late_night";
}

function axisLabel(key: TraitAxisKey, score: number): string {
  const def = TRAIT_AXES.find((a) => a.id === key);
  if (!def) return key;
  return score < 0 ? def.labelLeft : def.labelRight;
}

function axisFullLabel(key: TraitAxisKey): string {
  const def = TRAIT_AXES.find((a) => a.id === key);
  if (!def) return key;
  return `${def.labelLeft}↔${def.labelRight}`;
}

/** 上位 N 軸を取得 (|score| が大きい順) */
function topAxes(
  scores: Record<string, number>,
  n: number,
): { key: TraitAxisKey; score: number; label: string }[] {
  return Object.entries(scores)
    .filter(([k]) => TRAIT_AXES.some((a) => a.id === k))
    .sort(([, a], [, b]) => Math.abs(b) - Math.abs(a))
    .slice(0, n)
    .map(([k, v]) => ({
      key: k as TraitAxisKey,
      score: v,
      label: axisLabel(k as TraitAxisKey, v),
    }));
}

function todayDateStr(): string {
  return new Date().toISOString().split("T")[0];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Prompt Builder
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function buildUserDataSummary(params: AIPredictionParams): string {
  const sections: string[] = [];

  // 1. 上位5軸のスコアとラベル
  const top5 = topAxes(params.axisScores, 5);
  if (top5.length > 0) {
    sections.push("【特徴的な性格軸（上位5軸）】");
    for (const axis of top5) {
      const fullLabel = axisFullLabel(axis.key);
      const direction = axis.score > 0 ? "右寄り" : "左寄り";
      const strength = Math.abs(axis.score);
      const strengthLabel =
        strength > 0.7 ? "非常に強い" :
        strength > 0.4 ? "明確" :
        "やや";
      sections.push(
        `- ${fullLabel}: スコア${Math.round(axis.score * 100) / 100}（${strengthLabel}${axis.label}傾向）`
      );
    }
  }

  // 2. 検出済み矛盾
  if (params.contradictions.length > 0) {
    sections.push("\n【検出された内面の矛盾】");
    for (const c of params.contradictions.slice(0, 3)) {
      sections.push(`- [${c.type}] ${c.description}（深刻度: ${Math.round(c.severity * 100)}%）`);
    }
  }

  // 3. 行動パターン
  if (params.detectedPatterns.length > 0) {
    sections.push("\n【検出された行動パターン】");
    for (const p of params.detectedPatterns.slice(0, 5)) {
      sections.push(`- [${p.patternType}] ${p.descriptionJa}（信頼度: ${Math.round(p.confidence * 100)}%）`);
    }
  }

  // 4. 軸のトレンド
  if (params.axisTrends.length > 0) {
    sections.push("\n【最近の変動トレンド】");
    for (const trend of params.axisTrends.slice(0, 3)) {
      const fullLabel = axisFullLabel(trend.axisId);
      const dir = trend.direction > 0 ? "右方向（+）" : "左方向（-）";
      sections.push(
        `- ${fullLabel}: ${trend.daySpan}日間で${dir}に${Math.round(trend.magnitude * 100)}%変動`
      );
    }
  }

  // 5. 予測精度の履歴
  const accuracyEntries = Object.entries(params.accuracyByCategory);
  if (accuracyEntries.length > 0) {
    sections.push("\n【過去の予測精度（カテゴリ別）】");
    for (const [cat, stats] of accuracyEntries) {
      if (stats.total === 0) continue;
      const rate = Math.round((stats.correct / stats.total) * 100);
      sections.push(`- ${cat}: 的中${rate}%（${stats.correct}/${stats.total}件）`);
    }
  }

  // 6. 時間的コンテキスト
  const dayLabel = DAY_LABELS[params.dayOfWeek] ?? "不明";
  const timePeriod = getTimePeriod(params.currentHour);
  const timeLabel = TIME_PERIOD_LABELS[timePeriod] ?? timePeriod;
  sections.push(`\n【現在のコンテキスト】`);
  sections.push(`- 曜日: ${dayLabel}`);
  sections.push(`- 時間帯: ${timeLabel}`);
  sections.push(`- 累計観測回数: ${params.observationCount}回`);

  return sections.join("\n");
}

function buildSystemPrompt(): string {
  return `あなたは深層観測エンジン — 人間の内面パターンを観測データに基づいて分析し、行動を予測するAIです。

## あなたの役割
ユーザーの性格軸データ、矛盾パターン、行動パターン、トレンドデータに基づいて、
「今日このユーザーに起こりそうなこと」を予測してください。

## 絶対ルール（Anti-Barnum 防御）

### 禁止事項
- 「誰にでも当てはまる」曖昧な予測は禁止
- 「今日は良いことがあるかも」レベルの占い的表現は禁止
- データに基づかない推測は禁止
- ポジティブに偏った予測は禁止（現実的であること）
- 「占い」「運勢」「星座」等のスピリチュアル的な表現は禁止
- 「〜でしょう」「〜かもしれません」の曖昧な語尾の連発は禁止

### 必須要件
- 予測文の中に、必ず2つ以上の具体的データポイント（軸名+方向、パターン名+曜日など）を含めること
- 「この瞬間に注目」というトリガーシナリオを具体的に記述すること
- 予測と異なる行動をした場合の解釈（代替結末）を記述すること
- ユーザーが「はい、それ起きた」「いいえ、起きなかった」と検証できる具体性を持つこと
- 「観測データが示す傾向」「検出されたパターンに基づく予測」のように、観測に基づく発見であることを明示すること

## 出力トーン
- 「占い師」ではなく「行動科学の観測者」の口調
- 断定的すぎず、しかし曖昧すぎない
- 冷静で知的、しかし冷たくはない
- 具体的な軸名やスコアを引用して根拠を示す
- 高校生〜40代の日本人に刺さる、地に足のついた表現を使う
- 日本語で出力

## 出力形式（厳密に守ること）
以下の JSON を返してください:

{
  "prediction": "予測の本文（2-3文。具体的なデータポイントを含む）",
  "triggerScenario": "注目すべき具体的な場面（1文）",
  "alternativeOutcome": "もし予測と異なる行動をした場合の解釈（1文）",
  "category": "判断パターン|感情の動き|対人行動|エネルギー配分|回避傾向|衝動の質 のいずれか1つ",
  "basedOn": "この予測の根拠となったデータの要約（1文）",
  "confidence": 0.1から0.75の数値,
  "specificityScore": 0.0から1.0の数値（この予測がランダムな人にも当てはまる確率の逆数。0.7以上が望ましい）,
  "dataPointsUsed": ["参照したデータポイント1", "参照したデータポイント2", ...]
}`;
}

function buildUserPrompt(params: AIPredictionParams): string {
  const dataSummary = buildUserDataSummary(params);

  // 直近の予測カテゴリを重複回避として渡す
  const recentCategories = (params.previousPredictions ?? [])
    .slice(-3)
    .map((p) => p.category);

  const avoidStr =
    recentCategories.length > 0
      ? `\n直近の予測カテゴリ: ${recentCategories.join(", ")}（これらと異なるカテゴリを選んでください）`
      : "";

  // 精度の高いカテゴリに注力するよう指示
  const accuracyEntries = Object.entries(params.accuracyByCategory);
  const bestCategory = accuracyEntries
    .filter(([, s]) => s.total >= 3)
    .sort(([, a], [, b]) => {
      const rateA = a.total > 0 ? a.correct / a.total : 0;
      const rateB = b.total > 0 ? b.correct / b.total : 0;
      return rateB - rateA;
    })[0];

  const worstCategory = accuracyEntries
    .filter(([, s]) => s.total >= 3)
    .sort(([, a], [, b]) => {
      const rateA = a.total > 0 ? a.correct / a.total : 0;
      const rateB = b.total > 0 ? b.correct / b.total : 0;
      return rateA - rateB;
    })[0];

  let accuracyHint = "";
  if (bestCategory) {
    accuracyHint += `\n精度が高いカテゴリ「${bestCategory[0]}」での予測は信頼性が高い。`;
  }
  if (worstCategory && worstCategory[0] !== bestCategory?.[0]) {
    accuracyHint += `\n精度が低いカテゴリ「${worstCategory[0]}」は慎重に、より具体的なデータに基づいて。`;
  }

  return `以下のユーザーデータに基づいて、今日の予測を1つ生成してください。

${dataSummary}
${avoidStr}
${accuracyHint}

重要: 必ず上記のデータに含まれる具体的な軸名・スコア・パターンを予測文に含めてください。
「〜かもしれない」ではなく「〜する確率が高い」「〜に注目」のような表現を使ってください。`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// JSON Schema for AI response
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const PREDICTION_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    prediction: { type: "string", description: "予測の本文（2-3文）" },
    triggerScenario: { type: "string", description: "注目すべき具体的な場面" },
    alternativeOutcome: { type: "string", description: "予測と異なる行動をした場合の解釈" },
    category: {
      type: "string",
      enum: ["判断パターン", "感情の動き", "対人行動", "エネルギー配分", "回避傾向", "衝動の質"],
    },
    basedOn: { type: "string", description: "根拠データの要約" },
    confidence: { type: "number", minimum: 0.1, maximum: 0.75 },
    specificityScore: { type: "number", minimum: 0, maximum: 1 },
    dataPointsUsed: {
      type: "array",
      items: { type: "string" },
      minItems: 2,
    },
  },
  required: [
    "prediction",
    "triggerScenario",
    "alternativeOutcome",
    "category",
    "basedOn",
    "confidence",
    "specificityScore",
    "dataPointsUsed",
  ],
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Validation & Post-processing
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const VALID_CATEGORIES = new Set([
  "判断パターン",
  "感情の動き",
  "対人行動",
  "エネルギー配分",
  "回避傾向",
  "衝動の質",
]);

interface RawAIPredictionResponse {
  prediction?: string;
  triggerScenario?: string;
  alternativeOutcome?: string;
  category?: string;
  basedOn?: string;
  confidence?: number;
  specificityScore?: number;
  dataPointsUsed?: string[];
}

function validateAndNormalize(
  raw: RawAIPredictionResponse,
): RawAIPredictionResponse | null {
  if (!raw.prediction || typeof raw.prediction !== "string" || raw.prediction.length < 10) {
    return null;
  }
  if (!raw.triggerScenario || typeof raw.triggerScenario !== "string") {
    return null;
  }
  if (!raw.alternativeOutcome || typeof raw.alternativeOutcome !== "string") {
    return null;
  }

  // category のバリデーション
  if (!raw.category || !VALID_CATEGORIES.has(raw.category)) {
    raw.category = "判断パターン"; // fallback
  }

  // confidence の範囲制限
  if (typeof raw.confidence !== "number" || isNaN(raw.confidence)) {
    raw.confidence = 0.3;
  }
  raw.confidence = Math.max(0.1, Math.min(0.75, raw.confidence));

  // specificityScore の範囲制限
  if (typeof raw.specificityScore !== "number" || isNaN(raw.specificityScore)) {
    raw.specificityScore = 0.5;
  }
  raw.specificityScore = Math.max(0, Math.min(1, raw.specificityScore));

  // dataPointsUsed のバリデーション
  if (!Array.isArray(raw.dataPointsUsed) || raw.dataPointsUsed.length < 2) {
    // Anti-Barnum 違反: 具体的データポイントが不足
    raw.specificityScore = Math.min(raw.specificityScore, 0.3);
    raw.dataPointsUsed = raw.dataPointsUsed ?? [];
  }

  if (!raw.basedOn || typeof raw.basedOn !== "string") {
    raw.basedOn = "観測データに基づく予測";
  }

  return raw;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main Export
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * AI によるパーソナライズ予測を生成する。
 *
 * - ユーザーの軸データ・矛盾・行動パターン・トレンドを AI に渡し、
 *   テンプレートでは到達できない具体的な予測を生成する
 * - AI 生成が失敗した場合は既存のテンプレートベースにフォールバック
 * - Anti-Barnum 防御: specificityScore で予測の個人化度を測定
 *
 * @param params ユーザーの全観測データ
 * @returns AIPrediction (aiGenerated: true) またはフォールバック時の Prediction
 */
export async function generateAIPrediction(
  params: AIPredictionParams,
): Promise<AIPrediction | Prediction> {
  try {
    const result = await runAI({
      taskType: "stargazer_ai_prediction",
      prompt: buildUserPrompt(params),
      systemPrompt: buildSystemPrompt(),
      jsonSchema: PREDICTION_JSON_SCHEMA,
      requireJson: true,
      temperature: 0.7,
      maxOutputTokens: 1024,
      timeoutMs: 15_000,
      userId: params.userId,
      metadata: makeStargazerRunMetadata({
        observationCount: params.observationCount,
        axisCount: Object.keys(params.axisScores).length,
        contradictionCount: params.contradictions.length,
        patternCount: params.detectedPatterns.length,
        trendCount: params.axisTrends.length,
      }),
    });

    if (!result.success || !result.structured) {
      console.warn(
        "[aiPredictionEngine] AI generation failed, falling back to template",
        { error: result.errorMessage },
      );
      return fallbackToTemplate(params);
    }

    const raw = result.structured as unknown as RawAIPredictionResponse;
    const validated = validateAndNormalize(raw);

    if (!validated) {
      console.warn(
        "[aiPredictionEngine] AI output validation failed, falling back to template",
      );
      return fallbackToTemplate(params);
    }

    const dateStr = todayDateStr();

    const aiPrediction: AIPrediction = {
      id: `pred_ai_daily_${dateStr}`,
      type: "daily_forecast" as PredictionType,
      prediction: validated.prediction!,
      confidence: validated.confidence!,
      createdAt: Date.now(),
      expiresAt: Date.now() + ONE_DAY_MS,
      verified: false,
      accurate: null,
      userFeedback: null as PredictionFeedback | null,
      basedOn: validated.basedOn!,
      category: validated.category!,
      triggerScenario: validated.triggerScenario!,
      alternativeOutcome: validated.alternativeOutcome!,
      specificityScore: validated.specificityScore!,
      dataPointsUsed: validated.dataPointsUsed!,
      aiGenerated: true,
    };

    console.info("[aiPredictionEngine] AI prediction generated", {
      category: aiPrediction.category,
      confidence: aiPrediction.confidence,
      specificityScore: aiPrediction.specificityScore,
      dataPointsCount: aiPrediction.dataPointsUsed.length,
      provider: result.provider,
      model: result.model,
      latencyMs: result.latencyMs,
    });

    return aiPrediction;
  } catch (error) {
    console.error(
      "[aiPredictionEngine] Unexpected error, falling back to template",
      error,
    );
    return fallbackToTemplate(params);
  }
}

/**
 * 既存テンプレートベースの予測にフォールバックする。
 */
function fallbackToTemplate(params: AIPredictionParams): Prediction {
  const templateParams: DailyPredictionParams = {
    axisScores: params.axisScores,
    observationCount: params.observationCount,
    dayOfWeek: params.dayOfWeek,
    previousPredictions: params.previousPredictions,
  };
  return generateDailyPrediction(templateParams);
}

/**
 * AIPrediction かどうかを型ガードする。
 */
export function isAIPrediction(p: Prediction): p is AIPrediction {
  return "aiGenerated" in p && (p as AIPrediction).aiGenerated === true;
}
