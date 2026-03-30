// lib/stargazer/predictionEngine.ts
// Stargazer Prediction Engine — 予測生成 + 精度追跡 + localStorage永続化
//
// 設計思想:
// "予言が当たった瞬間、ユーザーはこのアプリを「すごい」ではなく「怖い」と感じる。
//  「怖い」は「すごい」の100倍強い感情"
//
// 日付シードによる決定論的予測 + 軸データ参照で個人化

import { TRAIT_AXES, type TraitAxisKey } from "./traitAxes";
import { safeSetItem } from "./localStorageHelper";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type PredictionType =
  | "daily_forecast"
  | "weekly_pattern"
  | "behavioral"
  | "emotional";

export type PredictionFeedback = "correct" | "partially" | "wrong";

export interface Prediction {
  id: string;
  type: PredictionType;
  /** 予測テキスト */
  prediction: string;
  /** システムの確信度 (0-1) */
  confidence: number;
  /** 作成日時 (ms epoch) */
  createdAt: number;
  /** 検証期限 (ms epoch) */
  expiresAt: number;
  /** 検証済みか */
  verified: boolean;
  /** 正確さ — null = 未検証 */
  accurate: boolean | null;
  /** ユーザーフィードバック */
  userFeedback: PredictionFeedback | null;
  /** どの観測データに基づくか */
  basedOn: string;
  /** パーソナリティのどの側面か */
  category: string;
}

export interface PredictionAccuracy {
  totalPredictions: number;
  verified: number;
  correct: number;
  partial: number;
  wrong: number;
  /** 的中率 (0-1) */
  accuracyRate: number;
  trend: "improving" | "stable" | "declining";
  /** 最も精度の高いカテゴリ */
  bestCategory: string;
  /** 最も精度の低いカテゴリ */
  worstCategory: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const STORAGE_KEY = "stargazer_predictions_v1";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_WEEK_MS = 7 * ONE_DAY_MS;

const DAY_LABELS = ["日曜", "月曜", "火曜", "水曜", "木曜", "金曜", "土曜"] as const;

const CATEGORIES = [
  "判断パターン",
  "感情の動き",
  "対人行動",
  "エネルギー配分",
  "回避傾向",
  "衝動の質",
] as const;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Seeded random helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

function seededPick<T>(arr: readonly T[], seed: number): T {
  return arr[Math.floor(seededRandom(seed) * arr.length)];
}

function todayDateStr(): string {
  return new Date().toISOString().split("T")[0];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Axis helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function axisVal(scores: Record<string, number>, key: TraitAxisKey): number {
  return scores[key] ?? 0;
}

function axisLabel(key: TraitAxisKey, score: number): string {
  const def = TRAIT_AXES.find((a) => a.id === key);
  if (!def) return key;
  return score < 0 ? def.labelLeft : def.labelRight;
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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Prediction templates (20+)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface TemplateContext {
  dayOfWeek: number;
  dayLabel: string;
  topAxis: { key: TraitAxisKey; score: number; label: string };
  secondAxis: { key: TraitAxisKey; score: number; label: string };
  observationCount: number;
  confidence: number;
}

type TemplateGenerator = (ctx: TemplateContext) => {
  prediction: string;
  category: string;
  basedOn: string;
};

const DAILY_TEMPLATES: TemplateGenerator[] = [
  // 1. 判断力低下予測
  (ctx) => ({
    prediction: `今日の午後、判断力が落ちる可能性あり（あなたは${ctx.dayLabel}に${ctx.topAxis.label}傾向が強まるパターンがある）`,
    category: "判断パターン",
    basedOn: `${ctx.topAxis.key}軸の曜日パターン`,
  }),
  // 2. 本音を飲み込む
  (ctx) => ({
    prediction: `今日、誰かに本音を言いたくなるタイミングがある。でもあなたは${ctx.topAxis.label}だから、飲み込む確率が高い`,
    category: "対人行動",
    basedOn: `${ctx.topAxis.key}軸のスコア`,
  }),
  // 3. 安全な選択
  (ctx) => ({
    prediction: `今日は「安全な選択」をしたくなる日。でもあなたの成長は${ctx.secondAxis.label}にある`,
    category: "判断パターン",
    basedOn: `${ctx.secondAxis.key}軸が成長領域`,
  }),
  // 4. 言葉に引っかかる
  (ctx) => ({
    prediction: `誰かの言葉にいつもより引っかかる日。それは${ctx.topAxis.label}の感度が上がっているから`,
    category: "感情の動き",
    basedOn: `${ctx.topAxis.key}軸の感度変動`,
  }),
  // 5. モードの偏り
  (ctx) => ({
    prediction: `今日のあなたは${ctx.topAxis.label}モードが強い。${ctx.secondAxis.label}を意識すると新しい自分に出会える`,
    category: "エネルギー配分",
    basedOn: `${ctx.topAxis.key}軸と${ctx.secondAxis.key}軸のバランス`,
  }),
  // 6. 先送り予測
  (ctx) => ({
    prediction: `今日、やるべきことを1つ先送りにする。あなたの${ctx.topAxis.label}傾向が「今じゃなくていい」と囁く`,
    category: "回避傾向",
    basedOn: `${ctx.topAxis.key}軸の回避パターン`,
  }),
  // 7. 衝動的な買い物
  (ctx) => ({
    prediction: `夕方以降に衝動的な判断をしやすい。${ctx.topAxis.label}なあなたは疲労時にブレーキが緩む`,
    category: "衝動の質",
    basedOn: `${ctx.topAxis.key}軸と疲労パターン`,
  }),
  // 8. 社交エネルギー
  (ctx) => ({
    prediction: `今日の社交エネルギーは${ctx.topAxis.score > 0 ? "高め" : "低め"}。${ctx.dayLabel}のあなたは${ctx.topAxis.label}が顕著になる`,
    category: "エネルギー配分",
    basedOn: `${ctx.topAxis.key}軸の曜日変動`,
  }),
  // 9. 比較の罠
  (ctx) => ({
    prediction: `誰かと自分を比較して落ち込む瞬間がある。それは${ctx.topAxis.label}であるあなたの逆面が反応するから`,
    category: "感情の動き",
    basedOn: `${ctx.topAxis.key}軸の裏面反応`,
  }),
  // 10. 計画変更
  (ctx) => ({
    prediction: `今日の計画が変わる。あなたは${ctx.topAxis.label}だけど、${ctx.dayLabel}だけはそれが揺らぐ`,
    category: "判断パターン",
    basedOn: `${ctx.topAxis.key}軸の曜日例外パターン`,
  }),
  // 11. 内省モード
  (ctx) => ({
    prediction: `夜、ふと「自分は本当にこれでいいのか」と考える。${ctx.observationCount}回の観測が示す通り、あなたは${ctx.topAxis.label}の裏で常にそれを問い続けている`,
    category: "感情の動き",
    basedOn: `${ctx.observationCount}回の観測データからのパターン`,
  }),
  // 12. 断る勇気
  (ctx) => ({
    prediction: `今日、何かを断りたいのに断れない場面がある。あなたの${ctx.topAxis.label}が「相手を傷つけたくない」と判断する`,
    category: "対人行動",
    basedOn: `${ctx.topAxis.key}軸の対人傾向`,
  }),
  // 13. 新しい発見
  (ctx) => ({
    prediction: `今日、自分の意外な一面に気づく。${ctx.secondAxis.label}が普段より表に出る時間帯がある`,
    category: "エネルギー配分",
    basedOn: `${ctx.secondAxis.key}軸の潜在パターン`,
  }),
  // 14. 疲れの質
  (ctx) => ({
    prediction: `今日の疲れは身体より精神的なもの。${ctx.topAxis.label}なあなたは${ctx.dayLabel}に頭を使いすぎる傾向がある`,
    category: "エネルギー配分",
    basedOn: `${ctx.topAxis.key}軸とエネルギー消費パターン`,
  }),
  // 15. 完璧主義の発動
  (ctx) => ({
    prediction: `今日、「もう少しだけ良くしたい」が止まらなくなる瞬間がある。あなたの${ctx.topAxis.label}が発動するトリガーは${ctx.dayLabel}に多い`,
    category: "衝動の質",
    basedOn: `${ctx.topAxis.key}軸と完璧主義トリガー`,
  }),
  // 16. 返事の遅さ
  (ctx) => ({
    prediction: `メッセージの返信が遅くなる。あなたは${ctx.topAxis.label}だから、言葉を選びすぎて時間がかかる`,
    category: "対人行動",
    basedOn: `${ctx.topAxis.key}軸のコミュニケーション傾向`,
  }),
  // 17. 予想外の感情
  (ctx) => ({
    prediction: `予想外のタイミングで感情が動く。${ctx.secondAxis.label}の感度が${ctx.dayLabel}に上がるパターンがある`,
    category: "感情の動き",
    basedOn: `${ctx.secondAxis.key}軸の曜日感度`,
  }),
  // 18. 独りの時間
  (ctx) => ({
    prediction: `今日、一人の時間が必要になる。${ctx.topAxis.label}モードが${ctx.dayLabel}に飽和点を迎えやすい`,
    category: "エネルギー配分",
    basedOn: `${ctx.topAxis.key}軸の飽和パターン`,
  }),
  // 19. 直感の勝利
  (ctx) => ({
    prediction: `今日、論理より直感で正解を選ぶ場面がある。あなたの${ctx.topAxis.label}は表面的なロジックの下で常に動いている`,
    category: "判断パターン",
    basedOn: `${ctx.topAxis.key}軸の無意識的判断`,
  }),
  // 20. 過去への引力
  (ctx) => ({
    prediction: `ふとした瞬間、過去の選択を思い出す。それは${ctx.topAxis.label}であるあなたが「別の道」を無意識に計算しているから`,
    category: "感情の動き",
    basedOn: `${ctx.topAxis.key}軸の後悔パターン`,
  }),
  // 21. 優先順位の崩壊
  (ctx) => ({
    prediction: `今日、本当に大事なことを後回しにして、どうでもいいことに時間を使う。${ctx.topAxis.label}が「緊急なもの」に弱い`,
    category: "回避傾向",
    basedOn: `${ctx.topAxis.key}軸の優先順位傾向`,
  }),
  // 22. 同意の仮面
  (ctx) => ({
    prediction: `今日、心の中で反対なのに同意する場面がある。あなたの${ctx.topAxis.label}は波風を立てることのコストを高く見積もる`,
    category: "対人行動",
    basedOn: `${ctx.topAxis.key}軸の対立回避`,
  }),
  // 23. 創造性の波
  (ctx) => ({
    prediction: `${ctx.dayLabel}のあなたは創造性が${ctx.topAxis.score > 0 ? "高まる" : "落ち着く"}。${ctx.topAxis.label}モードが${ctx.secondAxis.label}と共鳴するから`,
    category: "エネルギー配分",
    basedOn: `${ctx.topAxis.key}と${ctx.secondAxis.key}の共鳴パターン`,
  }),
  // 24. 自己批判のループ
  (ctx) => ({
    prediction: `今日、自分を責めるループに入りかける。でも${ctx.observationCount}回の観測が示す通り、それは${ctx.topAxis.label}の裏返しに過ぎない`,
    category: "感情の動き",
    basedOn: `${ctx.topAxis.key}軸の自己評価パターン`,
  }),
];

const WEEKLY_TEMPLATES: TemplateGenerator[] = [
  (ctx) => ({
    prediction: `今週、あなたの${ctx.topAxis.label}傾向が試される場面が来る。${ctx.secondAxis.label}を意識して臨むと突破口になる`,
    category: "判断パターン",
    basedOn: `${ctx.topAxis.key}と${ctx.secondAxis.key}の週間パターン`,
  }),
  (ctx) => ({
    prediction: `今週の後半、対人関係でモヤモヤが溜まる。${ctx.topAxis.label}なあなたは週の後半にストレスを溜め込みやすい`,
    category: "対人行動",
    basedOn: `${ctx.topAxis.key}軸の週間ストレスパターン`,
  }),
  (ctx) => ({
    prediction: `今週、「自分の本当の気持ち」に気づく瞬間がある。${ctx.topAxis.label}の奥にある${ctx.secondAxis.label}が表出する`,
    category: "感情の動き",
    basedOn: `${ctx.topAxis.key}と${ctx.secondAxis.key}の深層パターン`,
  }),
  (ctx) => ({
    prediction: `今週のエネルギーは前半が高く後半が下がる。${ctx.topAxis.label}モードは持続力に限界がある`,
    category: "エネルギー配分",
    basedOn: `${ctx.topAxis.key}軸のエネルギー消費曲線`,
  }),
  (ctx) => ({
    prediction: `今週中に大きな決断を迫られる場面がある。あなたの${ctx.topAxis.label}が最も発揮される瞬間になる`,
    category: "判断パターン",
    basedOn: `${ctx.topAxis.key}軸の決断力パターン`,
  }),
  (ctx) => ({
    prediction: `今週、避けていたことと向き合うタイミングが来る。${ctx.topAxis.label}は回避の正当化が上手いが、今週はそれが通用しない`,
    category: "回避傾向",
    basedOn: `${ctx.topAxis.key}軸の回避限界パターン`,
  }),
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Core Generation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface DailyPredictionParams {
  axisScores: Record<string, number>;
  observationCount: number;
  dayOfWeek: number;
  recentPatterns?: string[];
  previousPredictions?: Prediction[];
}

/** 今日の予測を生成する（日付シードで決定論的） */
export function generateDailyPrediction(
  params: DailyPredictionParams,
): Prediction {
  const { axisScores, observationCount, dayOfWeek, previousPredictions } =
    params;

  const dateStr = todayDateStr();
  const seed = hashStr(`daily_${dateStr}`);

  // 直近の予測カテゴリと重複しないテンプレートを選ぶ
  const recentCategories = new Set(
    (previousPredictions ?? []).slice(-3).map((p) => p.category),
  );

  const axes = topAxes(axisScores, 5);
  const topAxis = axes[0] ?? {
    key: "introvert_vs_extrovert" as TraitAxisKey,
    score: 0,
    label: "内向的",
  };
  const secondAxis = axes[1] ?? topAxis;

  const ctx: TemplateContext = {
    dayOfWeek,
    dayLabel: DAY_LABELS[dayOfWeek] ?? "今日",
    topAxis,
    secondAxis,
    observationCount,
    confidence: computeConfidence(observationCount, axisScores),
  };

  // テンプレート選択 — 重複回避 + シード
  let selectedIdx = Math.floor(seededRandom(seed) * DAILY_TEMPLATES.length);
  let attempts = 0;
  while (attempts < DAILY_TEMPLATES.length) {
    const candidate = DAILY_TEMPLATES[selectedIdx](ctx);
    if (!recentCategories.has(candidate.category) || attempts >= 5) {
      break;
    }
    selectedIdx = (selectedIdx + 1) % DAILY_TEMPLATES.length;
    attempts++;
  }

  const template = DAILY_TEMPLATES[selectedIdx];
  const result = template(ctx);

  // 予測学習ループからの信頼度調整を反映
  const adjustedConfidence = applyLearningAdjustment(ctx.confidence, result.category);

  return {
    id: `pred_daily_${dateStr}`,
    type: "daily_forecast",
    prediction: result.prediction,
    confidence: adjustedConfidence,
    createdAt: Date.now(),
    expiresAt: Date.now() + ONE_DAY_MS,
    verified: false,
    accurate: null,
    userFeedback: null,
    basedOn: result.basedOn,
    category: result.category,
  };
}

export interface WeeklyPredictionParams {
  axisScores: Record<string, number>;
  weeklyPatterns: Record<string, number[]>;
  observationCount: number;
}

/** 週間予測を生成する */
export function generateWeeklyPrediction(
  params: WeeklyPredictionParams,
): Prediction {
  const { axisScores, observationCount } = params;

  const now = new Date();
  const weekNum = Math.floor(now.getTime() / ONE_WEEK_MS);
  const seed = hashStr(`weekly_${weekNum}`);

  const axes = topAxes(axisScores, 5);
  const topAxis = axes[0] ?? {
    key: "introvert_vs_extrovert" as TraitAxisKey,
    score: 0,
    label: "内向的",
  };
  const secondAxis = axes[1] ?? topAxis;

  const ctx: TemplateContext = {
    dayOfWeek: now.getDay(),
    dayLabel: DAY_LABELS[now.getDay()] ?? "今日",
    topAxis,
    secondAxis,
    observationCount,
    confidence: computeConfidence(observationCount, axisScores),
  };

  const template = seededPick(WEEKLY_TEMPLATES, seed);
  const result = template(ctx);

  return {
    id: `pred_weekly_${weekNum}`,
    type: "weekly_pattern",
    prediction: result.prediction,
    confidence: ctx.confidence,
    createdAt: Date.now(),
    expiresAt: Date.now() + ONE_WEEK_MS,
    verified: false,
    accurate: null,
    userFeedback: null,
    basedOn: result.basedOn,
    category: result.category,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Accuracy calculation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 全予測から精度統計を算出する */
export function calculateAccuracy(
  predictions: Prediction[],
): PredictionAccuracy {
  const verified = predictions.filter((p) => p.verified);
  const correct = verified.filter((p) => p.userFeedback === "correct");
  const partial = verified.filter((p) => p.userFeedback === "partially");
  const wrong = verified.filter((p) => p.userFeedback === "wrong");

  const accuracyRate =
    verified.length > 0
      ? (correct.length + partial.length * 0.5) / verified.length
      : 0;

  // トレンド: 直近半分 vs 前半分
  let trend: "improving" | "stable" | "declining" = "stable";
  if (verified.length >= 6) {
    const sorted = [...verified].sort((a, b) => a.createdAt - b.createdAt);
    const mid = Math.floor(sorted.length / 2);
    const recentHalf = sorted.slice(mid);
    const earlierHalf = sorted.slice(0, mid);
    const recentRate = computeSubsetRate(recentHalf);
    const earlierRate = computeSubsetRate(earlierHalf);
    const diff = recentRate - earlierRate;
    if (diff > 0.1) trend = "improving";
    else if (diff < -0.1) trend = "declining";
  }

  // カテゴリ別精度
  const categoryStats: Record<string, { correct: number; total: number }> = {};
  for (const p of verified) {
    if (!categoryStats[p.category]) {
      categoryStats[p.category] = { correct: 0, total: 0 };
    }
    categoryStats[p.category].total++;
    if (p.userFeedback === "correct") categoryStats[p.category].correct++;
    if (p.userFeedback === "partially")
      categoryStats[p.category].correct += 0.5;
  }

  let bestCategory = "";
  let bestRate = -1;
  let worstCategory = "";
  let worstRate = 2;
  for (const [cat, stats] of Object.entries(categoryStats)) {
    const rate = stats.total > 0 ? stats.correct / stats.total : 0;
    if (rate > bestRate) {
      bestRate = rate;
      bestCategory = cat;
    }
    if (rate < worstRate) {
      worstRate = rate;
      worstCategory = cat;
    }
  }

  return {
    totalPredictions: predictions.length,
    verified: verified.length,
    correct: correct.length,
    partial: partial.length,
    wrong: wrong.length,
    accuracyRate,
    trend,
    bestCategory: bestCategory || "N/A",
    worstCategory: worstCategory || "N/A",
  };
}

function computeSubsetRate(predictions: Prediction[]): number {
  if (predictions.length === 0) return 0;
  let score = 0;
  for (const p of predictions) {
    if (p.userFeedback === "correct") score += 1;
    else if (p.userFeedback === "partially") score += 0.5;
  }
  return score / predictions.length;
}

/** 観測回数と軸データから予測確信度を算出（対数曲線）
 *
 * 設計思想: 予測の確信度は理解度より更に厳しくあるべき。
 * 「理解している」と「予測できる」は別のレベル。
 *
 * 到達目安:
 *   10問 → ~0.18  |  40問 → ~0.28  |  100問 → ~0.38
 *  200問 → ~0.48  | 500問 → ~0.58  | 1000問 → ~0.68
 *
 * 上限0.75 — 人間の行動を75%以上の確信で予測できるとは言えない
 */
function computeConfidence(
  observationCount: number,
  axisScores: Record<string, number>,
): number {
  // 観測深度: 対数曲線 (最大 0.35)
  const depthFactor = Math.min(0.35, Math.log(1 + observationCount) * 0.05);

  // 軸明瞭度: 非ゼロ軸の数と分散の組み合わせ (最大 0.25)
  const values = Object.values(axisScores);
  const nonZeroAxes = values.filter((v) => Math.abs(v) > 0.1).length;
  const totalAxes = Math.max(1, values.length);
  const axisCoverage = nonZeroAxes / totalAxes;

  const variance =
    values.length > 0
      ? values.reduce((sum, v) => sum + v * v, 0) / values.length
      : 0;
  const clarityFactor = Math.min(
    0.25,
    axisCoverage * 0.12 + Math.min(0.13, variance * 0.15)
  );

  // ベースライン（初回から最低限の予測は出す）
  const base = 0.1;

  return Math.min(0.75, base + depthFactor + clarityFactor);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Persistence (localStorage)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 予測を保存する */
export function savePrediction(prediction: Prediction): void {
  if (typeof window === "undefined") return;
  const all = loadPredictions();
  // 同じIDがあれば上書き
  const idx = all.findIndex((p) => p.id === prediction.id);
  if (idx >= 0) {
    all[idx] = prediction;
  } else {
    all.push(prediction);
  }
  // 最大100件に制限
  const trimmed = all.slice(-100);
  safeSetItem(STORAGE_KEY, JSON.stringify(trimmed));
}

/** 予測を読み込む */
export function loadPredictions(limit?: number): Prediction[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const all: Prediction[] = JSON.parse(raw);
    if (limit && limit > 0) {
      return all.slice(-limit);
    }
    return all;
  } catch {
    return [];
  }
}

/** 予測の検証結果を更新する */
export function updatePredictionVerification(
  id: string,
  feedback: PredictionFeedback,
): void {
  if (typeof window === "undefined") return;
  const all = loadPredictions();
  const target = all.find((p) => p.id === id);
  if (!target) return;

  target.verified = true;
  target.userFeedback = feedback;
  target.accurate = feedback === "correct" ? true : feedback === "wrong" ? false : null;

  safeSetItem(STORAGE_KEY, JSON.stringify(all));

  // 予測学習ループにフィードバックを送信 (循環依存回避のため動的インポート)
  import("./predictionLearningLoop")
    .then((mod) => mod.updateLearningFromFeedback(id, feedback))
    .catch(() => { /* 非クリティカル */ });

  // DB にも検証結果を永続化（prophecy APIへ送信）
  syncVerificationToServer(id, feedback).catch(() => { /* 非クリティカル */ });
}

/** 検証結果をサーバーDBに永続化する */
async function syncVerificationToServer(
  predictionId: string,
  feedback: PredictionFeedback,
): Promise<void> {
  try {
    const feedbackMap: Record<string, string> = {
      correct: "的中",
      partial: "部分的",
      wrong: "外れ",
    };
    await fetch("/api/stargazer/prophecy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prophecyId: predictionId,
        verificationAnswer: feedbackMap[feedback] ?? feedback,
      }),
    });
  } catch {
    // ネットワークエラーは無視（localStorageに残っているので次回リトライ可能）
  }
}

/** 検証待ちの予測を取得する */
export function getPendingVerifications(): Prediction[] {
  const all = loadPredictions();
  const now = Date.now();
  return all.filter((p) => !p.verified && p.expiresAt < now);
}

/** 今日の予測が既に存在するか */
export function hasTodayPrediction(): boolean {
  const dateStr = todayDateStr();
  const all = loadPredictions();
  return all.some((p) => p.id === `pred_daily_${dateStr}`);
}

/**
 * 予測学習ループの信頼度調整を適用する。
 * 循環依存を避けるため、localStorage を直接読み取る。
 */
function applyLearningAdjustment(baseConfidence: number, category: string): number {
  if (typeof window === "undefined") return baseConfidence;
  try {
    const raw = localStorage.getItem("stargazer_prediction_learning_v1");
    if (!raw) return baseConfidence;
    const state = JSON.parse(raw);
    const adjustment = state?.confidenceAdjustments?.[category];
    if (typeof adjustment !== "number") return baseConfidence;
    return Math.min(1, Math.max(0, baseConfidence * adjustment));
  } catch {
    return baseConfidence;
  }
}
