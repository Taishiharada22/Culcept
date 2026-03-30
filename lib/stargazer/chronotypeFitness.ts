// lib/stargazer/chronotypeFitness.ts
// 時間帯適性 — 1日の力の流れとタイムブロック提案
// 根拠: Horne & Östberg (朝型夜型質問紙), Pink (When: The Scientific Secrets of Perfect Timing)

import type { TraitAxisKey } from "./traitAxes";

// ── Types ──

export interface TimeBlock {
  /** 時間帯ラベル */
  period: string;
  /** 時間範囲 */
  timeRange: string;
  /** この時間帯に最適な作業タイプ */
  bestFor: string;
  /** 避けた方がいい作業 */
  avoidFor: string;
  /** エネルギーレベル (0-1) */
  energy: number;
}

export interface ChronotypeResult {
  /** クロノタイプ */
  type: "morning" | "evening" | "balanced";
  typeLabel: string;
  /** タイプの説明 */
  description: string;
  /** 1日のタイムブロック提案 */
  timeBlocks: TimeBlock[];
  /** 力が最も出る時間帯 */
  peakHour: string;
  /** 注意が必要な時間帯 */
  lowHour: string;
  /** 具体的なアドバイス */
  advice: string[];
}

// ── Analysis ──

export function analyzeChronotype(
  axisScores: Partial<Record<TraitAxisKey, number>>,
): ChronotypeResult | null {
  const entries = Object.keys(axisScores);
  if (entries.length < 5) return null;

  // 朝型/夜型の推定
  // - 計画的な人は朝型傾向
  // - 即興的・大胆な人は夜型傾向
  // - 感情変動が大きい人は夜型傾向
  const plan = axisScores.plan_vs_spontaneous ?? 0;
  const bold = axisScores.cautious_vs_bold ?? 0;
  const emotional = axisScores.emotional_variability ?? 0;
  const regulation = axisScores.emotional_regulation ?? 0;
  const analytical = axisScores.analytical_vs_intuitive ?? 0;

  // negative plan = 計画的 → 朝型, positive bold/emotional → 夜型
  const chronoScore = plan * 0.3 + bold * 0.2 + emotional * 0.2 - regulation * 0.15 + analytical * 0.15;

  const type: ChronotypeResult["type"] =
    chronoScore < -0.15 ? "morning" :
    chronoScore > 0.15 ? "evening" : "balanced";

  // 集中力タイプの推定
  const introvert = axisScores.introvert_vs_extrovert ?? 0;
  const perfectionist = axisScores.perfectionist_vs_pragmatic ?? 0;
  const deepFocus = introvert < -0.2 || perfectionist < -0.2;
  const socialEnergy = introvert > 0.2;

  if (type === "morning") {
    return {
      type,
      typeLabel: "朝型クリエイター",
      description: "脳が最もクリアな朝に最重要タスクをこなすと、1日の生産性が劇的に上がる。午後は人との時間に使うのが理想。",
      peakHour: "朝 6:00-10:00",
      lowHour: "午後 14:00-16:00",
      timeBlocks: [
        {
          period: "ゴールデンタイム",
          timeRange: "6:00 - 10:00",
          bestFor: "最も重要な意思決定、創造的な作業、戦略的思考",
          avoidFor: "メール処理、定例会議、ルーティン作業",
          energy: 0.95,
        },
        {
          period: "コラボタイム",
          timeRange: "10:00 - 12:00",
          bestFor: "ミーティング、チーム作業、ディスカッション",
          avoidFor: "深い分析作業、一人で没頭する必要がある仕事",
          energy: 0.75,
        },
        {
          period: "回復タイム",
          timeRange: "13:00 - 15:00",
          bestFor: "軽めのタスク、メール整理、インプット（読書・学習）",
          avoidFor: "重要な判断、新規の企画立案",
          energy: 0.45,
        },
        {
          period: "仕上げタイム",
          timeRange: "15:00 - 17:00",
          bestFor: "レビュー、明日の準備、フォローアップ",
          avoidFor: "新しいプロジェクトの立ち上げ",
          energy: 0.6,
        },
      ],
      advice: [
        "朝の最初の1時間を「聖域」にする。通知OFF、メール見ない、最重要タスクだけ",
        "午後の低エネルギー時間は「インプット時間」に——記事を読む、動画を見る、など",
        "夜は意思決定を避ける。「明日の朝考える」が正解",
        deepFocus
          ? "集中力が高い朝に2-3時間の「ディープワーク」を確保すると、午後の倍の成果が出る"
          : "朝のエネルギーを活用して、対面の重要な会話を午前中に集中させる",
      ],
    };
  }

  if (type === "evening") {
    return {
      type,
      typeLabel: "夜型イノベーター",
      description: "午後から夜にかけてエンジンがかかるタイプ。午前中はウォームアップに使い、午後〜夕方に本気を出す。",
      peakHour: "午後 15:00-21:00",
      lowHour: "午前 7:00-10:00",
      timeBlocks: [
        {
          period: "ウォームアップ",
          timeRange: "9:00 - 11:00",
          bestFor: "メール処理、スケジュール確認、軽いタスク",
          avoidFor: "重要な意思決定、クリエイティブな作業",
          energy: 0.4,
        },
        {
          period: "エンジン始動",
          timeRange: "11:00 - 13:00",
          bestFor: "ミーティング、コラボレーション、情報収集",
          avoidFor: "一人で深く集中する必要がある作業",
          energy: 0.65,
        },
        {
          period: "ゴールデンタイム",
          timeRange: "14:00 - 18:00",
          bestFor: "最重要タスク、創造的な作業、深い分析",
          avoidFor: "ルーティンワーク、単純作業",
          energy: 0.9,
        },
        {
          period: "フロータイム",
          timeRange: "19:00 - 22:00",
          bestFor: "自由な発想、実験的なプロジェクト、学習",
          avoidFor: "対外的なコミュニケーション",
          energy: 0.8,
        },
      ],
      advice: [
        "午前中に無理に重要タスクを入れない。午前はウォームアップだと割り切る",
        "午後3時以降を「本番」と捉え、最重要タスクをここに配置する",
        "朝の会議は避けられるなら避ける。代わりに午後のミーティングを提案する",
        socialEnergy
          ? "午後の高エネルギー時間を活用して、重要な対話やプレゼンを入れる"
          : "夕方以降の集中力が高い時間を一人の深い作業に充てると、独創的なアウトプットが生まれる",
      ],
    };
  }

  // balanced
  return {
    type,
    typeLabel: "バランス型アダプター",
    description: "特定の時間帯への偏りが少なく、環境やタスクに応じて柔軟に調整できる。自分で最適なリズムを設計する余地がある。",
    peakHour: "午前 10:00-12:00 / 午後 15:00-17:00",
    lowHour: "午後 13:00-14:30",
    timeBlocks: [
      {
        period: "集中タイム①",
        timeRange: "9:00 - 11:30",
        bestFor: "分析的な作業、計画立案、重要なメール",
        avoidFor: "雑多な打ち合わせ",
        energy: 0.8,
      },
      {
        period: "コラボタイム",
        timeRange: "11:30 - 13:00",
        bestFor: "ミーティング、チーム作業、レビュー",
        avoidFor: "深い集中が必要な作業",
        energy: 0.7,
      },
      {
        period: "リチャージ",
        timeRange: "13:00 - 14:30",
        bestFor: "軽いタスク、散歩、インプット",
        avoidFor: "重要な判断",
        energy: 0.4,
      },
      {
        period: "集中タイム②",
        timeRange: "14:30 - 17:00",
        bestFor: "クリエイティブ作業、問題解決、仕上げ",
        avoidFor: "新規の大きなタスク開始",
        energy: 0.75,
      },
    ],
    advice: [
      "午前と午後に1回ずつ「集中ブロック」を確保する。合計3-4時間が理想",
      "昼食後の低エネルギー帯は割り切って軽いタスクに使う",
      "自分の「今日の調子」に合わせて、重要タスクの配置を柔軟に変える",
      deepFocus
        ? "午前か午後、集中力が高い方を見極めてディープワークを配置する"
        : "午前に対外的な仕事、午後に内部的な仕事と分けるとリズムが作りやすい",
    ],
  };
}
