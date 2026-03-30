// lib/stargazer/footprintCollector.ts
// 足跡（Footprint）収集システム — 行動の無意識的痕跡
//
// ユーザーは何もしなくていい。
// アプリ内の行動そのものが「回答」になる。
//
// 収集する信号:
// 1. 応答パターン: 回答速度、迷い、スキップ率
// 2. 時間パターン: アプリ使用時間帯、頻度、セッション長
// 3. 回避パターン: 見ないカテゴリ、スキップする質問タイプ
// 4. 選択パターン: Rendezvous選択傾向、スワイプパターン
// 5. 探索パターン: ブラウジング深度、戻り率

import type { TraitAxisKey } from "./traitAxes";
import type { MirrorSource } from "./threeMirrors";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Signal Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 行動信号のカテゴリ */
export type FootprintSignalType =
  | "response_speed"       // 回答速度（速い=確信的、遅い=迷い）
  | "hesitation_pattern"   // 選択→変更→再選択のパターン
  | "skip_pattern"         // 質問をスキップした傾向
  | "session_timing"       // 使用時間帯パターン
  | "session_duration"     // セッション長
  | "browse_depth"         // 閲覧の深さ（どこまで掘るか）
  | "return_behavior"      // 戻り率（一度離れて再閲覧）
  | "avoidance_category"   // 避けているカテゴリ
  | "decision_reversal"    // 決定後の取り消し率
  | "engagement_decay"     // 使用継続率の変化
  // パッシブセンサー拡張
  | "feature_view"         // ページ/機能の閲覧（context=feature名）
  | "dwell_time"           // 特定要素への滞在時間（ms）
  | "interaction_speed"    // 機能内の判断速度（ms）
  | "preference_signal";   // 明示的な好み信号（like=1, pass=-1, skip=0）

/** 1つの行動信号イベント */
export interface FootprintSignal {
  type: FootprintSignalType;
  /** 信号の生の値 */
  value: number;
  /** 発生時のコンテキスト */
  context?: string;
  /** タイムスタンプ */
  timestamp: string;
  /** 関連するセッションID */
  sessionId?: string;
}

/** 集計された行動パターン */
export interface FootprintPattern {
  signalType: FootprintSignalType;
  /** 直近30日の平均値 */
  average: number;
  /** 標準偏差（揺れの大きさ） */
  stdDev: number;
  /** サンプル数 */
  sampleCount: number;
  /** 傾向 (上昇/下降/安定) */
  trend: "rising" | "falling" | "stable";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Signal → Axis Mapping
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 行動信号から軸スコアへの変換マッピング
 *
 * 原理: 行動は嘘をつけない
 * - 回答が速い → その領域に確信がある
 * - 特定カテゴリを避ける → その領域に不安や無関心がある
 * - 深夜に一人で長時間使用 → 内向的傾向
 * - 決定後に取り消す率が高い → 慎重/完璧主義
 */

export interface FootprintAxisMapping {
  signalType: FootprintSignalType;
  /** 値がこの範囲の時に寄与する軸 */
  condition: "high" | "low" | "any";
  /** 高い値の閾値 */
  threshold: number;
  /** 寄与する軸 */
  axisId: TraitAxisKey;
  /** スコアへの寄与方向 (-1 ~ +1) */
  direction: number;
  /** 寄与の重み (0-1) */
  weight: number;
  /** 解釈のメモ */
  interpretation: string;
}

export const FOOTPRINT_AXIS_MAPPINGS: FootprintAxisMapping[] = [
  // 回答速度
  {
    signalType: "response_speed",
    condition: "high",
    threshold: 3000, // 3秒以上 = 迷い
    axisId: "cautious_vs_bold",
    direction: -0.3, // 慎重側
    weight: 0.6,
    interpretation: "回答に時間がかかる → 慎重に判断する傾向",
  },
  {
    signalType: "response_speed",
    condition: "low",
    threshold: 1000, // 1秒未満 = 即決
    axisId: "cautious_vs_bold",
    direction: 0.3, // 大胆側
    weight: 0.5,
    interpretation: "即決する → 直感的・大胆な判断傾向",
  },

  // 迷いパターン
  {
    signalType: "hesitation_pattern",
    condition: "high",
    threshold: 0.3, // 30%以上の回答で選び直し
    axisId: "perfectionist_vs_pragmatic",
    direction: -0.4, // 完璧主義側
    weight: 0.7,
    interpretation: "選択を何度も変える → 完璧を求める傾向",
  },

  // スキップパターン
  {
    signalType: "skip_pattern",
    condition: "high",
    threshold: 0.2, // 20%以上スキップ
    axisId: "plan_vs_spontaneous",
    direction: 0.3, // 即興側
    weight: 0.4,
    interpretation: "質問をスキップしがち → 構造的な回答を避ける傾向",
  },

  // セッション時間帯
  {
    signalType: "session_timing",
    condition: "high",
    threshold: 22, // 22時以降
    axisId: "introvert_vs_extrovert",
    direction: -0.2, // 内向側
    weight: 0.4,
    interpretation: "深夜の使用 → 一人の時間に内省する傾向",
  },

  // セッション長
  {
    signalType: "session_duration",
    condition: "high",
    threshold: 600, // 10分以上
    axisId: "quality_vs_quantity",
    direction: -0.3, // 質重視側
    weight: 0.5,
    interpretation: "長時間セッション → 深く向き合う傾向",
  },

  // 閲覧深度
  {
    signalType: "browse_depth",
    condition: "high",
    threshold: 5, // 5ページ以上掘る
    axisId: "analytical_vs_intuitive",
    direction: -0.2, // 分析側
    weight: 0.4,
    interpretation: "深く掘り下げる → 分析的傾向",
  },

  // 戻り行動
  {
    signalType: "return_behavior",
    condition: "high",
    threshold: 0.3, // 30%以上で戻る
    axisId: "perfectionist_vs_pragmatic",
    direction: -0.3, // 完璧主義側
    weight: 0.5,
    interpretation: "何度も戻って確認 → 納得を求める傾向",
  },

  // 決定取り消し
  {
    signalType: "decision_reversal",
    condition: "high",
    threshold: 0.15, // 15%以上
    axisId: "emotional_variability",
    direction: 0.3, // 変動側
    weight: 0.5,
    interpretation: "決定を取り消す率が高い → 感情/判断の揺れが大きい",
  },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Footprint Collection (Client-side)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const STORAGE_KEY = "culcept_sg_footprints_v1";
const MAX_SIGNALS = 100; // ローカルに保持する最大信号数（容量圧迫防止）

/**
 * 行動信号を記録（localStorage）
 */
export function recordFootprint(signal: FootprintSignal): void {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const signals: FootprintSignal[] = raw ? JSON.parse(raw) : [];
    signals.push(signal);
    // 古い信号を削除して上限を維持
    while (signals.length > MAX_SIGNALS) signals.shift();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(signals));
  } catch {
    // Storage full or parse error — silent fail
  }
}

/**
 * 保存された行動信号を取得
 */
export function getStoredFootprints(): FootprintSignal[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * 行動信号を集計してパターンを抽出
 */
export function aggregateFootprints(
  signals: FootprintSignal[],
  daysWindow: number = 30
): FootprintPattern[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysWindow);
  const cutoffStr = cutoff.toISOString();

  // 期間内の信号をフィルタ
  const recent = signals.filter(s => s.timestamp >= cutoffStr);

  // タイプ別にグループ化
  const grouped = new Map<FootprintSignalType, number[]>();
  for (const signal of recent) {
    if (!grouped.has(signal.type)) grouped.set(signal.type, []);
    grouped.get(signal.type)!.push(signal.value);
  }

  const patterns: FootprintPattern[] = [];
  for (const [type, values] of grouped) {
    if (values.length < 3) continue; // 最低3サンプル必要

    const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length;
    const stdDev = Math.sqrt(variance);

    // 傾向検出: 前半 vs 後半の平均
    const half = Math.floor(values.length / 2);
    const firstHalf = values.slice(0, half);
    const secondHalf = values.slice(half);
    const firstAvg = firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length;
    const trendDiff = secondAvg - firstAvg;
    const trend: "rising" | "falling" | "stable" =
      trendDiff > stdDev * 0.3 ? "rising" :
      trendDiff < -stdDev * 0.3 ? "falling" : "stable";

    patterns.push({
      signalType: type,
      average: avg,
      stdDev,
      sampleCount: values.length,
      trend,
    });
  }

  return patterns;
}

/**
 * 行動パターンから軸スコア補正値を算出
 * 既存の軸スコアパイプラインに乗せられる形式で出力
 */
export function footprintPatternsToAxisScores(
  patterns: FootprintPattern[]
): { axisId: TraitAxisKey; score: number; weight: number; source: MirrorSource }[] {
  const results: { axisId: TraitAxisKey; score: number; weight: number; source: MirrorSource }[] = [];

  for (const pattern of patterns) {
    const mappings = FOOTPRINT_AXIS_MAPPINGS.filter(m => m.signalType === pattern.signalType);
    for (const mapping of mappings) {
      let applies = false;
      if (mapping.condition === "high" && pattern.average >= mapping.threshold) applies = true;
      if (mapping.condition === "low" && pattern.average <= mapping.threshold) applies = true;
      if (mapping.condition === "any") applies = true;

      if (applies) {
        // 信頼度: サンプル数が多いほど確信度が上がる (sigmoid-ish curve)
        const sampleConfidence = Math.min(pattern.sampleCount / 20, 1);
        results.push({
          axisId: mapping.axisId,
          score: mapping.direction,
          weight: mapping.weight * sampleConfidence,
          source: "footprint",
        });
      }
    }
  }

  return results;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Observation-time Signal Recording
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 観測回答時に自動記録する行動信号を生成
 * ObserveTabの回答ハンドラから呼ばれる想定
 */
export function captureAnswerFootprints(params: {
  responseTimeMs: number;
  didChange: boolean; // 一度選んで変更したか
  didSkip: boolean;
  questionId: string;
  timestamp?: string;
}): FootprintSignal[] {
  const ts = params.timestamp ?? new Date().toISOString();
  const signals: FootprintSignal[] = [];

  // 回答速度
  signals.push({
    type: "response_speed",
    value: params.responseTimeMs,
    context: params.questionId,
    timestamp: ts,
  });

  // 迷いパターン
  if (params.didChange) {
    signals.push({
      type: "hesitation_pattern",
      value: 1,
      context: params.questionId,
      timestamp: ts,
    });
  }

  // スキップパターン
  if (params.didSkip) {
    signals.push({
      type: "skip_pattern",
      value: 1,
      context: params.questionId,
      timestamp: ts,
    });
  }

  return signals;
}

/**
 * セッション開始時に記録する信号
 */
export function captureSessionFootprints(params: {
  startTime: string;
  durationSeconds?: number;
}): FootprintSignal[] {
  const signals: FootprintSignal[] = [];
  const hour = new Date(params.startTime).getHours();

  signals.push({
    type: "session_timing",
    value: hour,
    timestamp: params.startTime,
  });

  if (params.durationSeconds) {
    signals.push({
      type: "session_duration",
      value: params.durationSeconds,
      timestamp: params.startTime,
    });
  }

  return signals;
}
