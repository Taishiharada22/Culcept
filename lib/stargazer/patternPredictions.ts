// lib/stargazer/patternPredictions.ts
// パターン駆動予測 — テンプレートではなく検出済みパターンから予測を生成する
//
// 設計思想:
// "テンプレート予測は誰にでも当てはまる。パターン予測はあなたにしか当てはまらない"
// "データが裏付けている予測は「怖い」レベルの的中率を生む"

import type {
  DetectedPattern,
  PatternType,
} from "./patternDetectionEngine";
import { TRAIT_AXES } from "./traitAxes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface PatternPrediction {
  id: string;
  /** 予測テキスト */
  prediction: string;
  /** 根拠となるパターン */
  sourcePattern: DetectedPattern;
  /** 具体的なエビデンス */
  evidence: string[];
  /** パターン強度に基づく確信度 (0-1) */
  confidence: number;
  /** ユーザーが今日検証できる行動 */
  testableAction: string;
  /** 予測が外れた場合の意味 */
  alternativeOutcome: string;
  /** 予測カテゴリ */
  category: string;
  /** 生成日時 */
  createdAt: number;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const DAY_NAMES_JA = ["日曜日", "月曜日", "火曜日", "水曜日", "木曜日", "金曜日", "土曜日"];
const TIME_PERIOD_LABELS: Record<string, string> = {
  morning: "朝（5-12時）",
  afternoon: "昼（12-17時）",
  evening: "夕方〜夜（17-22時）",
  late_night: "深夜（22時以降）",
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Axis helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function axisShortLabel(axisId: string): string {
  const def = TRAIT_AXES.find((a) => a.id === axisId);
  if (!def) return axisId;
  return `${def.labelLeft}/${def.labelRight}`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Pattern -> Prediction Generators
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type PatternPredictionGenerator = (
  pattern: DetectedPattern,
  today: Date,
) => PatternPrediction | null;

const GENERATORS: Record<PatternType, PatternPredictionGenerator> = {
  // -- 曜日パターン --
  weekday: (pattern, today) => {
    const meta = pattern.metadata as {
      dayOfWeek: number;
      dayName: string;
      deviation: number;
      daySamples: number;
      totalSamples: number;
    };

    const todayDow = today.getDay();
    // このパターンの曜日が今日でなければ、次のその曜日まで待つ
    const isToday = meta.dayOfWeek === todayDow;
    const daysUntil = isToday ? 0 : ((meta.dayOfWeek - todayDow + 7) % 7);
    const targetDay = DAY_NAMES_JA[meta.dayOfWeek] ?? `曜日${meta.dayOfWeek}`;
    const axisLabel = pattern.axisId ? axisShortLabel(pattern.axisId) : "不明";
    const direction = meta.deviation > 0 ? "上昇" : "低下";
    const absDev = Math.abs(Math.round(meta.deviation * 100));

    if (!isToday && daysUntil > 2) return null; // 今日か2日以内のパターンのみ

    const dayRef = isToday ? "今日" : `${daysUntil}日後の${targetDay}`;

    return {
      id: `ppred_weekday_${pattern.axisId}_${todayDow}_${Date.now()}`,
      prediction: `過去のデータでは、あなたは${targetDay}に「${axisLabel}」のスコアが${absDev}%${direction}する。${dayRef}、この傾向が現れるか観察してみてください`,
      sourcePattern: pattern,
      evidence: [
        `${meta.totalSamples}回の観測から検出`,
        `${targetDay}の${meta.daySamples}回のデータで確認`,
        `全体平均からの偏差: ${meta.deviation > 0 ? "+" : ""}${absDev}%`,
      ],
      confidence: pattern.confidence,
      testableAction: `今日の判断や行動の中で「${axisLabel}」に関わる場面を意識してみてください。夜、振り返って自分の傾向を確認できます`,
      alternativeOutcome: `この予測が外れた場合、あなたの${targetDay}パターンが変化し始めている可能性があります。成長の兆候かもしれません`,
      category: "曜日パターン",
      createdAt: Date.now(),
    };
  },

  // -- 時間帯パターン --
  time_of_day: (pattern, _today) => {
    const meta = pattern.metadata as {
      timePeriod: string;
      deviation?: number;
      ratio?: number;
      meanResponseTime?: number;
      periodSamples?: number;
    };

    const periodLabel = TIME_PERIOD_LABELS[meta.timePeriod] ?? meta.timePeriod;
    const axisLabel = pattern.axisId ? axisShortLabel(pattern.axisId) : null;

    // 応答時間ベースのパターン
    if (meta.ratio && !axisLabel) {
      const isSlow = meta.ratio > 1;
      return {
        id: `ppred_tod_response_${meta.timePeriod}_${Date.now()}`,
        prediction: `${periodLabel}以降、あなたの判断速度が${isSlow ? "落ちる" : "上がる"}傾向がある（過去の観測で確認済み）。今日もこのパターンが出るか確かめてみてください`,
        sourcePattern: pattern,
        evidence: [
          `応答速度が全体平均の${Math.round((meta.ratio ?? 1) * 100)}%`,
          `${meta.periodSamples ?? 0}回の観測データから検出`,
        ],
        confidence: pattern.confidence,
        testableAction: `${periodLabel}に何か決断を迫られたとき、自分の判断スピードを意識してみてください`,
        alternativeOutcome: `パターンが出なければ、最近の生活リズムが変化しているサインです`,
        category: "時間帯パターン",
        createdAt: Date.now(),
      };
    }

    // 軸スコアベースのパターン
    if (axisLabel && meta.deviation !== undefined) {
      const direction = meta.deviation > 0 ? "高まる" : "低下する";
      return {
        id: `ppred_tod_axis_${pattern.axisId}_${meta.timePeriod}_${Date.now()}`,
        prediction: `${periodLabel}になると「${axisLabel}」の傾向が${direction}。今日の${periodLabel}、自分の内面がどう変化するか観察してみてください`,
        sourcePattern: pattern,
        evidence: [
          `${periodLabel}のスコアが全体平均から有意に偏差`,
          `複数回の観測で一貫したパターン`,
        ],
        confidence: pattern.confidence,
        testableAction: `${periodLabel}に意識的に自分の気分や判断の傾向を振り返ってみてください`,
        alternativeOutcome: `パターンが出ない場合、今日の状態が通常とは異なる特別な日であることを意味します`,
        category: "時間帯パターン",
        createdAt: Date.now(),
      };
    }

    return null;
  },

  // -- 回避パターン --
  avoidance: (pattern, _today) => {
    const meta = pattern.metadata as {
      category: string;
      categoryMeanMs?: number;
      overallMedianMs?: number;
      sampleCount: number;
      type: string;
    };

    const category = meta.category;

    if (meta.type === "dismissive" && meta.categoryMeanMs && meta.overallMedianMs) {
      const ratio = meta.overallMedianMs / meta.categoryMeanMs;
      return {
        id: `ppred_avoid_dismissive_${category}_${Date.now()}`,
        prediction: `あなたは「${category}」に関する質問を平均の${ratio.toFixed(1)}倍速く回答する。表面的に処理している可能性がある。今日、この領域で何かが起きるかもしれない`,
        sourcePattern: pattern,
        evidence: [
          `${meta.sampleCount}回の回答データから検出`,
          `平均応答時間: ${Math.round(meta.categoryMeanMs)}ms（全体中央値: ${Math.round(meta.overallMedianMs)}ms）`,
          `速すぎる回答は深く考えていないサインの可能性`,
        ],
        confidence: pattern.confidence,
        testableAction: `今日、「${category}」に関わる場面で、普段より意識的にゆっくり判断してみてください。新しい気づきがあるかもしれません`,
        alternativeOutcome: `普段通りの速さで判断した場合、このカテゴリはあなたにとって本当に直感的な領域なのかもしれません`,
        category: "回避パターン",
        createdAt: Date.now(),
      };
    }

    return {
      id: `ppred_avoid_${category}_${Date.now()}`,
      prediction: `あなたは「${category}」の領域を一貫して避ける傾向がある。今日、この領域と向き合う機会が来るかもしれない`,
      sourcePattern: pattern,
      evidence: [
        `${meta.sampleCount}回のデータから回避パターンを検出`,
        `回避行動が統計的に有意`,
      ],
      confidence: pattern.confidence,
      testableAction: `今日「${category}」に関わることがあれば、避けずに少しだけ踏み込んでみてください`,
      alternativeOutcome: `完全に避けた場合、このカテゴリへの抵抗がまだ強いことを意味します。それ自体が重要な情報です`,
      category: "回避パターン",
      createdAt: Date.now(),
    };
  },

  // -- 周期パターン --
  cycle: (pattern, today) => {
    const meta = pattern.metadata as {
      cycleDays: number;
      autocorrelation: number;
      dataPoints: number;
    };

    const axisLabel = pattern.axisId ? axisShortLabel(pattern.axisId) : "不明";
    const cycleLength = meta.cycleDays;

    // 周期内のどの位置にいるかを推定
    const dayOfYear = Math.floor(
      (today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / 86400000,
    );
    const positionInCycle = dayOfYear % cycleLength;
    const cyclePhase =
      positionInCycle < cycleLength * 0.25
        ? "上昇期"
        : positionInCycle < cycleLength * 0.5
          ? "ピーク付近"
          : positionInCycle < cycleLength * 0.75
            ? "下降期"
            : "谷付近";

    return {
      id: `ppred_cycle_${pattern.axisId}_${Date.now()}`,
      prediction: `あなたの「${axisLabel}」は約${cycleLength}日周期で変動する。今日はその周期の${cyclePhase}にいる`,
      sourcePattern: pattern,
      evidence: [
        `${meta.dataPoints}日分のデータから${cycleLength}日周期を検出`,
        `自己相関: ${meta.autocorrelation}（0.4以上で統計的に有意）`,
        `現在の周期位置: ${positionInCycle + 1}日目 / ${cycleLength}日`,
      ],
      confidence: pattern.confidence,
      testableAction: `今日一日の終わりに、自分の「${axisLabel}」の傾向がこの${cyclePhase}と一致しているか振り返ってみてください`,
      alternativeOutcome: `周期とずれている場合、外部要因（ストレス、イベント等）があなたの自然なリズムを上書きしている可能性があります`,
      category: "周期パターン",
      createdAt: Date.now(),
    };
  },

  // -- 躊躇パターン --
  hesitation: (pattern, _today) => {
    const meta = pattern.metadata as {
      questionId?: string;
      context?: string;
      meanResponseTimeMs: number;
      overallMeanMs: number;
      ratio: number;
      sampleCount: number;
    };

    const axisLabel = pattern.axisId ? axisShortLabel(pattern.axisId) : null;
    const topic = axisLabel ?? meta.context ?? "特定のトピック";
    const ratioStr = meta.ratio.toFixed(1);

    return {
      id: `ppred_hesit_${pattern.axisId ?? meta.context ?? "unknown"}_${Date.now()}`,
      prediction: `「${topic}」に関する判断で、あなたは通常の${ratioStr}倍の時間をかける。今日、この領域で迷いが生じるかもしれない`,
      sourcePattern: pattern,
      evidence: [
        `${meta.sampleCount}回の回答から躊躇パターンを検出`,
        `平均応答時間: ${Math.round(meta.meanResponseTimeMs)}ms（全体平均: ${Math.round(meta.overallMeanMs)}ms）`,
        `この差は統計的に有意`,
      ],
      confidence: pattern.confidence,
      testableAction: `今日「${topic}」に関わる場面があったら、自分の迷いの質（何について迷っているか）を観察してみてください`,
      alternativeOutcome: `迷いなく判断できた場合、このトピックに対する自分の立場が固まりつつあるサインです`,
      category: "躊躇パターン",
      createdAt: Date.now(),
    };
  },

  // -- 矛盾パターン --
  contradiction: (pattern, _today) => {
    const meta = pattern.metadata as {
      contradictionCount: number;
      totalRevisions: number;
      contradictionRate: number;
    };

    const axisLabel = pattern.axisId ? axisShortLabel(pattern.axisId) : "不明";

    return {
      id: `ppred_contra_${pattern.axisId}_${Date.now()}`,
      prediction: `「${axisLabel}」について、あなたの直感と最終判断が矛盾するパターンが${meta.contradictionCount}回繰り返されている。今日も、最初の直感と違う選択をする可能性が高い`,
      sourcePattern: pattern,
      evidence: [
        `${meta.totalRevisions}回の回答修正のうち${meta.contradictionCount}回で矛盾を検出`,
        `矛盾率: ${Math.round(meta.contradictionRate * 100)}%`,
        `直感 vs 理性のせめぎ合いが顕著`,
      ],
      confidence: pattern.confidence,
      testableAction: `今日、何か選択するときに「最初に浮かんだ答え」と「最終的な答え」を意識的に比較してみてください。違いがあれば、それが矛盾パターンの現れです`,
      alternativeOutcome: `直感と最終判断が一致した場合、このテーマに対する内的葛藤が解消に向かっている兆候です`,
      category: "矛盾パターン",
      createdAt: Date.now(),
    };
  },

  // -- 行動的盲点 --
  behavioral_blind: (pattern, _today) => {
    const meta = pattern.metadata as {
      meanResponseTimeMs: number;
      axisScoreMean: number;
      axisScoreStd: number;
    };

    const axisLabel = pattern.axisId ? axisShortLabel(pattern.axisId) : "不明";
    const extremeDirection = meta.axisScoreMean > 0 ? "右極" : "左極";

    return {
      id: `ppred_blind_${pattern.axisId}_${Date.now()}`,
      prediction: `「${axisLabel}」について、あなたは確信的な回答をするが内面では葛藤がある。今日、この領域で「本当にそう思っているか？」と自問する瞬間が訪れるかもしれない`,
      sourcePattern: pattern,
      evidence: [
        `スコアが一貫して${extremeDirection}（平均: ${Math.round(meta.axisScoreMean * 100)}%）`,
        `にもかかわらず応答時間は平均より長い（${Math.round(meta.meanResponseTimeMs)}ms）`,
        `確信度と迷い時間の矛盾は自己欺瞞の可能性を示唆`,
      ],
      confidence: pattern.confidence,
      testableAction: `今日「${axisLabel}」に関わる場面で、自分の「表向きの確信」と「内面の迷い」のギャップを感じ取ってみてください`,
      alternativeOutcome: `ギャップを感じなかった場合、あなたの確信は本物であり、応答時間の長さは慎重さの表れかもしれません`,
      category: "盲点パターン",
      createdAt: Date.now(),
    };
  },
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 検出済みパターンから今日の予測を生成する。
 * テンプレートではなく実データに基づくため、的中率が格段に高い。
 *
 * @param patterns - patternDetectionEngine.runFullPatternDetection() の結果
 * @param maxPredictions - 生成する予測の最大数 (デフォルト: 3)
 */
export function generatePatternPredictions(
  patterns: DetectedPattern[],
  maxPredictions: number = 3,
): PatternPrediction[] {
  const today = new Date();
  const predictions: PatternPrediction[] = [];

  // confidence の高い順に処理
  const sorted = [...patterns].sort((a, b) => b.confidence - a.confidence);

  // カテゴリの重複を避ける
  const usedCategories = new Set<string>();

  for (const pattern of sorted) {
    if (predictions.length >= maxPredictions) break;

    const generator = GENERATORS[pattern.patternType];
    if (!generator) continue;

    const prediction = generator(pattern, today);
    if (!prediction) continue;

    // 同じカテゴリの予測は1つまで
    if (usedCategories.has(prediction.category)) continue;
    usedCategories.add(prediction.category);

    predictions.push(prediction);
  }

  return predictions;
}

/**
 * パターン予測とテンプレート予測を統合する際の優先順位を決定する。
 * パターン予測の confidence がテンプレート予測より高ければ、パターン予測を優先。
 */
export function shouldPreferPatternPrediction(
  patternConfidence: number,
  templateConfidence: number,
  patternDataPoints: number,
): boolean {
  // 十分なデータがあり、信頼度が高い場合はパターン予測を優先
  return patternDataPoints >= 10 && patternConfidence > templateConfidence * 0.8;
}
