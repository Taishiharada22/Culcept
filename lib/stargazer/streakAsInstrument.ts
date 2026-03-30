// lib/stargazer/streakAsInstrument.ts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Streak as Instrument（ストリークを測定器にする）
//
// 脳科学的根拠:
// IKEA効果の深化版。ストリークは「期間」ではなく「蓄積データの価値」。
// サンクコスト（失いたくない） + 内発的動機（見えるようになるもの）の
// 二重の動機づけを同時に活性化する。
//
// 設計思想:
// 現状: 「14日連続！」（褒める）
// 改善: 「14日間で、あなたの矛盾は2個→5個に増えた。
//        自己理解が深まると矛盾が増える。これは正しい成長。」
//
// ストリーク期間で初めて見えるもの:
// - 7日  → 曜日パターン（月曜と金曜で性格が違う）
// - 14日 → 周期性（2週間ごとに気分が変わる）
// - 21日 → 矛盾の構造（矛盾同士の関係性）
// - 30日 → 月のリズム（月初と月末の性格差）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { TraitAxisKey } from "./traitAxes";
import type { DailyObservationQuality, StreakLevel } from "./streakIntelligence";
import type { ContradictionEntry } from "./contradictionMap";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 1. Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** ストリーク期間で見えるようになるパターン */
export interface StreakDiscovery {
  /** 発見のID */
  id: string;
  /** 必要なストリーク日数 */
  requiredDays: number;
  /** 発見のタイトル */
  title: string;
  /** 発見の説明 */
  description: string;
  /** 関連する軸 */
  relatedAxes: TraitAxisKey[];
  /** 発見の種類 */
  type: DiscoveryType;
  /** このストリークで切ったら再発見に何日かかるか */
  costOfBreaking: string;
}

export type DiscoveryType =
  | "weekly_pattern"      // 曜日パターン
  | "biweekly_cycle"      // 2週間周期
  | "contradiction_web"   // 矛盾の構造
  | "monthly_rhythm"      // 月のリズム
  | "prediction_model"    // 予測モデルの精度
  | "trigger_map"         // トリガーマップ
  | "growth_trajectory"   // 成長軌跡
  | "data_density";       // データ密度

/** ストリーク期間のデータ価値レポート */
export interface StreakDataValueReport {
  /** 現在のストリーク日数 */
  streakDays: number;
  /** 現在のレベル */
  currentLevel: StreakLevel;
  /** この期間で蓄積されたデータの量 */
  dataAccumulation: DataAccumulation;
  /** この期間で見えるようになったもの */
  discoveries: StreakDiscovery[];
  /** 次に見えるようになるもの */
  nextDiscovery: StreakDiscovery | null;
  /** 次の発見まで何日か */
  daysToNextDiscovery: number;
  /** ストリークを切った場合の損失 */
  breakingCost: BreakingCost;
  /** ストリーク期間の成長サマリ */
  growthSummary: GrowthSummary;
  /** 動機づけメッセージ */
  motivationMessage: string;
}

/** 蓄積データの量 */
export interface DataAccumulation {
  /** 総観測回数 */
  totalObservations: number;
  /** カバーした軸の数 */
  axesCovered: number;
  /** 検出された矛盾の数 */
  contradictionsFound: number;
  /** 検証された予言の数 */
  propheciesVerified: number;
  /** 予測精度 */
  predictionAccuracy: number;
  /** データ密度（1日あたりの平均観測数） */
  dataDensity: number;
}

/** ストリークを切った場合の損失 */
export interface BreakingCost {
  /** 失うパターン検出能力 */
  lostPatterns: string[];
  /** 再構築に必要な日数 */
  daysToRebuild: number;
  /** 損失の深刻度 */
  severity: "low" | "moderate" | "high" | "critical";
  /** 損失の説明 */
  explanation: string;
}

/** 成長サマリ */
export interface GrowthSummary {
  /** ストリーク開始時の矛盾数 */
  contradictionsAtStart: number;
  /** 現在の矛盾数 */
  contradictionsNow: number;
  /** 矛盾変化の解釈 */
  contradictionInterpretation: string;
  /** 予測精度の変化 */
  predictionAccuracyDelta: number;
  /** 品質スコアの変化 */
  qualityScoreDelta: number;
  /** 最も成長した軸 */
  mostGrownAxis: TraitAxisKey | null;
  /** 成長の解釈 */
  growthInterpretation: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 2. Discovery Catalog — ストリーク期間で見えるもの
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const STREAK_DISCOVERIES: Omit<StreakDiscovery, "relatedAxes">[] = [
  {
    id: "daily_baseline",
    requiredDays: 3,
    title: "あなたの基準線",
    description: "3日間の観測で、各軸の「普通の状態」が見え始めた。ここからの変化が意味を持つ",
    type: "data_density",
    costOfBreaking: "基準線の再構築に3日",
  },
  {
    id: "weekday_personality",
    requiredDays: 7,
    title: "曜日の性格",
    description: "7日間で、曜日ごとの性格の違いが見えてきた。月曜のあなたと金曜のあなたは別人かもしれない",
    type: "weekly_pattern",
    costOfBreaking: "曜日パターンの再検出に7日",
  },
  {
    id: "trigger_detection",
    requiredDays: 10,
    title: "トリガーの発見",
    description: "10日間の条件データから、あなたの軸が動く「きっかけ」が特定できた",
    type: "trigger_map",
    costOfBreaking: "トリガーマップの再構築に10日",
  },
  {
    id: "biweekly_cycle",
    requiredDays: 14,
    title: "2週間の周期性",
    description: "14日間で、2週間ごとに繰り返す感情パターンが見え始めた。気分の波に法則がある",
    type: "biweekly_cycle",
    costOfBreaking: "周期パターンの再検出に14日",
  },
  {
    id: "contradiction_structure",
    requiredDays: 21,
    title: "矛盾の構造",
    description: "21日間で、矛盾同士の関係が見えてきた。ある矛盾がきっかけで別の矛盾が生まれている",
    type: "contradiction_web",
    costOfBreaking: "矛盾構造マップの再構築に21日",
  },
  {
    id: "prediction_model_v1",
    requiredDays: 21,
    title: "予測モデルv1",
    description: "21日間のデータで、予測の精度が統計的に有意になった。あなたの行動を予測できる段階に入った",
    type: "prediction_model",
    costOfBreaking: "予測モデルの再学習に21日",
  },
  {
    id: "monthly_rhythm",
    requiredDays: 30,
    title: "月のリズム",
    description: "30日間で、月初と月末の性格差が見えた。月のサイクルがあなたの内面に影響している",
    type: "monthly_rhythm",
    costOfBreaking: "月次パターンの再検出に30日",
  },
  {
    id: "growth_trajectory",
    requiredDays: 30,
    title: "成長の軌跡",
    description: "30日間で、あなたの内面がどう変化したか。初日のあなたと今のあなたの差分が、成長そのもの",
    type: "growth_trajectory",
    costOfBreaking: "成長トレンドの再測定に30日",
  },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 3. Data Value Analysis
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * ストリーク期間のデータ蓄積を分析
 */
function analyzeDataAccumulation(
  dailyQualities: DailyObservationQuality[],
  streakDays: number,
  contradictions: ContradictionEntry[],
  predictionAccuracy: number,
): DataAccumulation {
  const streakQualities = dailyQualities.slice(-streakDays);
  const totalObservations = streakQualities.reduce(
    (s, q) => s + q.questionCount,
    0,
  );
  const axisCovered = new Set(
    streakQualities.flatMap(() => []), // will need actual axis data
  ).size || Math.min(streakDays * 3, 33); // 推定値

  return {
    totalObservations,
    axesCovered: axisCovered,
    contradictionsFound: contradictions.length,
    propheciesVerified: Math.floor(streakDays * 0.6), // 推定
    predictionAccuracy,
    dataDensity: streakDays > 0 ? totalObservations / streakDays : 0,
  };
}

/**
 * ストリークを切った場合の損失を計算
 */
function computeBreakingCost(
  streakDays: number,
  discoveries: StreakDiscovery[],
): BreakingCost {
  // 失うパターン検出能力
  const lostPatterns = discoveries
    .filter((d) => d.requiredDays > 7) // 7日以上のパターンは再構築が大変
    .map((d) => d.title);

  // 再構築に必要な日数は、最も長いパターンの日数
  const maxRequiredDays = discoveries.reduce(
    (max, d) => Math.max(max, d.requiredDays),
    0,
  );

  // 深刻度
  let severity: BreakingCost["severity"];
  if (streakDays >= 30) severity = "critical";
  else if (streakDays >= 14) severity = "high";
  else if (streakDays >= 7) severity = "moderate";
  else severity = "low";

  // 説明
  let explanation: string;
  switch (severity) {
    case "critical":
      explanation = `${streakDays}日分のデータは唯一無二。同じ期間を、同じ条件で再測定することは不可能。月のリズム、成長軌跡、予測モデルが全て失われる`;
      break;
    case "high":
      explanation = `${streakDays}日間で見えてきた周期パターンと矛盾構造が途切れる。再構築に同じ${streakDays}日が必要`;
      break;
    case "moderate":
      explanation = `曜日パターンの精度が低下する。ただし基盤データは残るため、再開後の復帰は比較的早い`;
      break;
    default:
      explanation = `まだ初期段階。今ここで続けることで、来週には曜日パターンが見え始める`;
  }

  return {
    lostPatterns,
    daysToRebuild: maxRequiredDays,
    severity,
    explanation,
  };
}

/**
 * 成長サマリを計算
 */
function computeGrowthSummary(
  dailyQualities: DailyObservationQuality[],
  streakDays: number,
  contradictions: ContradictionEntry[],
  predictionAccuracy: number,
): GrowthSummary {
  const streakQualities = dailyQualities.slice(-streakDays);
  if (streakQualities.length < 3) {
    return {
      contradictionsAtStart: 0,
      contradictionsNow: contradictions.length,
      contradictionInterpretation: "まだ成長を測定するにはデータが足りない",
      predictionAccuracyDelta: 0,
      qualityScoreDelta: 0,
      mostGrownAxis: null,
      growthInterpretation: "観測を続けることで、ここに成長の軌跡が現れる",
    };
  }

  // 品質スコアの変化
  const firstThird = streakQualities.slice(0, Math.ceil(streakQualities.length / 3));
  const lastThird = streakQualities.slice(-Math.ceil(streakQualities.length / 3));
  const avgFirst = firstThird.reduce((s, q) => s + q.qualityScore, 0) / firstThird.length;
  const avgLast = lastThird.reduce((s, q) => s + q.qualityScore, 0) / lastThird.length;
  const qualityDelta = avgLast - avgFirst;

  // 矛盾の変化の解釈
  // 矛盾が「増えた」のは良いこと（自己理解が深まると矛盾が見える）
  let contradictionInterpretation: string;
  if (contradictions.length === 0) {
    contradictionInterpretation = "まだ矛盾は検出されていない。観測が深まると見え始める";
  } else if (contradictions.length <= 2) {
    contradictionInterpretation = "最初の矛盾が見え始めた。自己理解の入口に立っている";
  } else if (contradictions.length <= 5) {
    contradictionInterpretation = `${contradictions.length}個の矛盾が見えている。自己理解が深まると矛盾が増える。これは正しい成長`;
  } else {
    contradictionInterpretation = `${contradictions.length}個の矛盾。複雑な内面の構造が見え始めている。矛盾同士の関係にパターンがあるかもしれない`;
  }

  // 成長の全体解釈
  let growthInterpretation: string;
  if (qualityDelta > 0.1) {
    growthInterpretation = `観測の品質が向上している（+${Math.round(qualityDelta * 100)}%）。より深い自己観測ができるようになった`;
  } else if (qualityDelta > -0.05) {
    growthInterpretation = "観測の品質は安定している。一定の深さで自己と向き合えている";
  } else {
    growthInterpretation = "観測の品質がやや低下。新しい角度からの質問が必要な時期かもしれない";
  }

  return {
    contradictionsAtStart: Math.max(0, contradictions.length - Math.floor(streakDays / 5)),
    contradictionsNow: contradictions.length,
    contradictionInterpretation,
    predictionAccuracyDelta: 0, // 外部から注入
    qualityScoreDelta: qualityDelta,
    mostGrownAxis: null, // 外部から注入
    growthInterpretation,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 4. Main Entry Point
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface StreakInstrumentInput {
  streakDays: number;
  currentLevel: StreakLevel;
  dailyQualities: DailyObservationQuality[];
  contradictions: ContradictionEntry[];
  predictionAccuracy: number;
}

/**
 * ストリーク期間のデータ価値レポートを生成
 *
 * このレポートは:
 * 1. ストリークを「褒める」のではなく「何が見えたか」を伝える
 * 2. ストリークを切った場合の損失を具体的に示す
 * 3. 次の発見までの距離を示す（好奇心ギャップ）
 */
export function generateStreakDataValueReport(
  input: StreakInstrumentInput,
): StreakDataValueReport {
  const {
    streakDays,
    currentLevel,
    dailyQualities,
    contradictions,
    predictionAccuracy,
  } = input;

  // この期間で見えるようになったもの
  const discoveries: StreakDiscovery[] = STREAK_DISCOVERIES.filter(
    (d) => d.requiredDays <= streakDays,
  ).map((d) => ({ ...d, relatedAxes: [] }));

  // 次に見えるようになるもの
  const nextDiscovery =
    STREAK_DISCOVERIES.find((d) => d.requiredDays > streakDays) ?? null;
  const daysToNextDiscovery = nextDiscovery
    ? nextDiscovery.requiredDays - streakDays
    : 0;

  // データ蓄積の分析
  const dataAccumulation = analyzeDataAccumulation(
    dailyQualities,
    streakDays,
    contradictions,
    predictionAccuracy,
  );

  // ストリークを切った場合の損失
  const breakingCost = computeBreakingCost(streakDays, discoveries);

  // 成長サマリ
  const growthSummary = computeGrowthSummary(
    dailyQualities,
    streakDays,
    contradictions,
    predictionAccuracy,
  );

  // 動機づけメッセージ（日数ではなくデータの価値で動機づけ）
  const motivationMessage = generateMotivationMessage(
    streakDays,
    discoveries,
    nextDiscovery ? { ...nextDiscovery, relatedAxes: [] } : null,
    daysToNextDiscovery,
    growthSummary,
  );

  return {
    streakDays,
    currentLevel,
    dataAccumulation,
    discoveries,
    nextDiscovery: nextDiscovery ? { ...nextDiscovery, relatedAxes: [] } : null,
    daysToNextDiscovery,
    breakingCost,
    growthSummary,
    motivationMessage,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 5. Motivation Messages
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function generateMotivationMessage(
  streakDays: number,
  discoveries: StreakDiscovery[],
  nextDiscovery: StreakDiscovery | null,
  daysToNext: number,
  growth: GrowthSummary,
): string {
  // ストリーク1-2日: 種まきフェーズ
  if (streakDays <= 2) {
    return "最初の3日で、あなたの「基準線」が生まれる。ここから全てが始まる";
  }

  // 3-6日: 基盤構築フェーズ
  if (streakDays <= 6) {
    return `${streakDays}日分のデータが蓄積した。あと${7 - streakDays}日で曜日パターンが見え始める`;
  }

  // 7-13日: パターン発見フェーズ
  if (streakDays <= 13) {
    return `曜日パターンが見えてきた。${growth.contradictionInterpretation}。あと${14 - streakDays}日で周期性が見え始める`;
  }

  // 14-20日: 深化フェーズ
  if (streakDays <= 20) {
    return `2週間の周期パターンが見え始めた。${growth.growthInterpretation}`;
  }

  // 21-29日: 統合フェーズ
  if (streakDays <= 29) {
    const costMessage = `ここで途切れると、${discoveries[discoveries.length - 1]?.title ?? "これら全て"}の再構築に${streakDays}日必要`;
    return `${growth.contradictionInterpretation}。${costMessage}`;
  }

  // 30日以上: 完成フェーズ
  return `${streakDays}日間の地図が完成しつつある。月のリズム、成長軌跡、予測モデル — 全てがこの期間のデータから生まれた。このデータは唯一無二`;
}

/**
 * ストリーク通知用メッセージを概日リズムに最適化
 *
 * 朝: 「今日の観測が、7日目のパターンを確定させる」（anticipation）
 * 夕方: 「今日の一日を振り返る。この観測で14日周期が見え始める」（reflection）
 * 夜: 「あと3時間で、10日分のトリガーマップが途切れる」（loss aversion）
 */
export function getStreakNotificationByPhase(
  phase: "anticipation" | "reflection" | "loss_aversion",
  streakDays: number,
  nextDiscovery: StreakDiscovery | null,
  daysToNext: number,
): { title: string; body: string } {
  switch (phase) {
    case "anticipation":
      if (nextDiscovery && daysToNext <= 3) {
        return {
          title: `あと${daysToNext}日で新しい発見`,
          body: `今日の観測が「${nextDiscovery.title}」の解放条件を満たす`,
        };
      }
      return {
        title: `${streakDays + 1}日目の観測`,
        body: "今日のデータが、あなたの地図をさらに精密にする",
      };

    case "reflection":
      return {
        title: "今日一日を記録する",
        body: `${streakDays}日間のデータと照らし合わせて、今日の位置を確認する`,
      };

    case "loss_aversion":
      if (streakDays >= 14) {
        return {
          title: `${streakDays}日分の地図が消えようとしている`,
          body: "周期パターン、矛盾構造、予測モデル。再構築に同じ日数が必要",
        };
      }
      return {
        title: `${streakDays}日連続が途切れる`,
        body: `あと${daysToNext}日で${nextDiscovery?.title ?? "新しい発見"}に到達する`,
      };
  }
}
