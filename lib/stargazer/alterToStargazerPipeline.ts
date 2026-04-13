"use server";

// lib/stargazer/alterToStargazerPipeline.ts
// Alter → Stargazer 信号パイプライン
//
// Alter との対話から得られた信号を Stargazer の軸スコアに反映する。
// Alter = ユーザー本人 という前提に基づき、会話から観測された特性を
// Stargazer の axis_snapshots に弱い証拠として蓄積する。
//
// 設計原則:
// - Alter 側には一切変更を加えない（パイプラインのみ）
// - 既存の AlterGrowthState から信号を読み取る
// - 弱い証拠（precision 低め）として扱い、直接観測を上書きしない
// - 観測レイヤー "alter_signal" で識別可能にする

import type { AlterGrowthState } from "./alterGrowth";
import type { AlterSessionSummary } from "./alterMemory";
import type { TraitAxisKey } from "./traitAxes";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Alter から抽出された軸信号 */
export interface AlterAxisSignal {
  axis: TraitAxisKey;
  /** 推定値 -1 ~ +1 */
  value: number;
  /** 信号の確信度 0 ~ 1（低めに設定: Alter推論は直接観測より弱い） */
  confidence: number;
  /** 信号の根拠 */
  source:
    | "fear_pattern"      // 恐れの検出から推定
    | "value_pattern"     // 価値観の検出から推定
    | "emotional_pattern" // 感情パターンから推定
    | "response_style"    // 応答スタイルから推定
    | "session_theme"     // セッションテーマから推定
    | "contradiction";    // 矛盾検出から推定
}

/** パイプライン実行結果 */
export interface PipelineResult {
  signalsExtracted: number;
  snapshotsWritten: number;
  errors: string[];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Signal Extraction — 恐れ → 軸マッピング
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const FEAR_TO_AXIS: Record<string, Array<{ axis: TraitAxisKey; value: number }>> = {
  "見捨てられることへの恐怖": [
    { axis: "reassurance_need", value: 0.6 },
    { axis: "attachment_style", value: 0.4 },
    { axis: "stress_isolation_vs_social", value: 0.5 },
  ],
  "自分に価値がないことへの恐怖": [
    { axis: "shame_vs_guilt", value: -0.5 },
    { axis: "locus_of_control", value: -0.3 },
    { axis: "self_disclosure_depth", value: -0.4 },
  ],
  "コントロールを失うことへの恐怖": [
    { axis: "control_tendency", value: 0.6 },
    { axis: "plan_vs_spontaneous", value: -0.5 },
    { axis: "emotional_regulation", value: -0.3 },
  ],
  "本当の自分を見せることへの恐怖": [
    { axis: "public_private_gap", value: 0.5 },
    { axis: "self_disclosure_depth", value: -0.5 },
    { axis: "direct_vs_diplomatic", value: 0.4 },
  ],
  "失敗することへの恐怖": [
    { axis: "perfectionist_vs_pragmatic", value: -0.5 },
    { axis: "cautious_vs_bold", value: -0.5 },
    { axis: "decision_regret", value: 0.5 },
  ],
  "孤独になることへの恐怖": [
    { axis: "individual_vs_social", value: 0.5 },
    { axis: "stress_isolation_vs_social", value: 0.6 },
    { axis: "relational_investment", value: 0.5 },
  ],
  "変われないことへの恐怖": [
    { axis: "growth_mindset", value: -0.3 },
    { axis: "change_embrace_vs_resist", value: -0.4 },
    { axis: "rumination_tendency", value: 0.4 },
  ],
  "依存してしまうことへの恐怖": [
    { axis: "independence_vs_harmony", value: -0.5 },
    { axis: "reassurance_need", value: 0.3 },
    { axis: "boundary_awareness", value: -0.3 },
  ],
  "期待を裏切ることへの恐怖": [
    { axis: "fairness_sensitivity", value: 0.4 },
    { axis: "perfectionist_vs_pragmatic", value: -0.4 },
    { axis: "shame_vs_guilt", value: 0.4 },
  ],
  "不完全であることへの恐怖": [
    { axis: "perfectionist_vs_pragmatic", value: -0.6 },
    { axis: "shame_vs_guilt", value: -0.4 },
    { axis: "quality_vs_quantity", value: -0.4 },
  ],
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Signal Extraction — 価値観 → 軸マッピング
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const VALUE_TO_AXIS: Record<string, Array<{ axis: TraitAxisKey; value: number }>> = {
  "自由": [
    { axis: "independence_vs_harmony", value: -0.6 },
    { axis: "plan_vs_spontaneous", value: 0.4 },
    { axis: "change_embrace_vs_resist", value: 0.4 },
  ],
  "正直さ": [
    { axis: "direct_vs_diplomatic", value: -0.5 },
    { axis: "public_private_gap", value: -0.4 },
    { axis: "consent_maturity", value: 0.3 },
  ],
  "人とのつながり": [
    { axis: "individual_vs_social", value: 0.5 },
    { axis: "relational_investment", value: 0.5 },
    { axis: "social_initiative", value: 0.3 },
  ],
  "成長": [
    { axis: "growth_mindset", value: 0.6 },
    { axis: "change_embrace_vs_resist", value: 0.5 },
    { axis: "exploration_closure", value: 0.3 },
  ],
  "安定": [
    { axis: "cautious_vs_bold", value: -0.4 },
    { axis: "change_embrace_vs_resist", value: -0.4 },
    { axis: "plan_vs_spontaneous", value: -0.4 },
  ],
  "自立": [
    { axis: "independence_vs_harmony", value: -0.6 },
    { axis: "individual_vs_social", value: -0.4 },
    { axis: "locus_of_control", value: 0.4 },
  ],
  "創造性": [
    { axis: "tradition_vs_novelty", value: 0.5 },
    { axis: "function_vs_expression", value: 0.5 },
    { axis: "exploration_closure", value: 0.4 },
  ],
  "公平さ": [
    { axis: "fairness_sensitivity", value: 0.6 },
    { axis: "analytical_vs_intuitive", value: -0.3 },
  ],
  "美": [
    { axis: "function_vs_expression", value: 0.5 },
    { axis: "quality_vs_quantity", value: -0.4 },
    { axis: "classic_vs_trendy", value: 0 }, // 美の方向性は中立
  ],
  "知識・理解": [
    { axis: "analytical_vs_intuitive", value: -0.5 },
    { axis: "abstract_structuring", value: 0.4 },
    { axis: "exploration_closure", value: 0.4 },
  ],
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Signal Extraction — 応答スタイル → 軸マッピング
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function extractResponseStyleSignals(
  style: AlterGrowthState["responseStyle"],
): AlterAxisSignal[] {
  const signals: AlterAxisSignal[] = [];

  // 感情語彙の豊富さ → emotional_variability
  if (style.emotionalVocabularyRichness > 0.1) {
    signals.push({
      axis: "emotional_variability",
      value: style.emotionalVocabularyRichness * 0.8 - 0.2, // 0.1→-0.12, 0.5→0.2, 1.0→0.6
      confidence: 0.2,
      source: "response_style",
    });
  }

  // 反論傾向 → direct_vs_diplomatic, independence_vs_harmony
  if (style.disagreementTendency > 0.05) {
    signals.push({
      axis: "direct_vs_diplomatic",
      value: -(style.disagreementTendency * 1.2), // 高い反論 → direct側
      confidence: 0.15,
      source: "response_style",
    });
    signals.push({
      axis: "independence_vs_harmony",
      value: -(style.disagreementTendency * 0.8), // 高い反論 → independence側
      confidence: 0.1,
      source: "response_style",
    });
  }

  // 自己参照の深さ → self_disclosure_depth
  if (style.selfReferencingDepth > 0.1) {
    signals.push({
      axis: "self_disclosure_depth",
      value: style.selfReferencingDepth * 1.2 - 0.3,
      confidence: 0.2,
      source: "response_style",
    });
  }

  // 平均応答長 — 長文 → analytical/introvert傾向
  if (style.avgResponseLength > 0) {
    const lengthSignal = Math.min(1, (style.avgResponseLength - 50) / 200); // 50文字以下→-1寄り、250+→1
    if (Math.abs(lengthSignal) > 0.1) {
      signals.push({
        axis: "analytical_vs_intuitive",
        value: -lengthSignal * 0.3, // 長文 → analytical寄り
        confidence: 0.1,
        source: "response_style",
      });
    }
  }

  return signals;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Signal Extraction — セッションテーマ → 軸マッピング
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** セッションテーマのキーワード → 軸信号 */
const THEME_KEYWORDS: Array<{
  pattern: RegExp;
  signals: Array<{ axis: TraitAxisKey; value: number }>;
}> = [
  {
    pattern: /孤独|一人|寂し/,
    signals: [
      { axis: "stress_isolation_vs_social", value: -0.3 },
      { axis: "introvert_vs_extrovert", value: -0.2 },
    ],
  },
  {
    pattern: /挑戦|チャレンジ|新しい/,
    signals: [
      { axis: "cautious_vs_bold", value: 0.3 },
      { axis: "change_embrace_vs_resist", value: 0.3 },
    ],
  },
  {
    pattern: /人間関係|友達|友人|恋人/,
    signals: [
      { axis: "individual_vs_social", value: 0.2 },
      { axis: "relational_investment", value: 0.3 },
    ],
  },
  {
    pattern: /仕事|キャリア|転職/,
    signals: [
      { axis: "efficiency_vs_process", value: 0.2 },
      { axis: "decision_tempo", value: 0.1 },
    ],
  },
  {
    pattern: /不安|心配|怖い/,
    signals: [
      { axis: "emotional_regulation", value: -0.2 },
      { axis: "rumination_tendency", value: 0.3 },
    ],
  },
  {
    pattern: /自分らしさ|アイデンティティ|本当の自分/,
    signals: [
      { axis: "public_private_gap", value: 0.3 },
      { axis: "self_disclosure_depth", value: 0.2 },
    ],
  },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Core Pipeline
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * AlterGrowthState + SessionSummary から Stargazer 軸信号を抽出する
 */
export function extractSignals(
  growth: AlterGrowthState,
  summary: AlterSessionSummary,
): AlterAxisSignal[] {
  const signals: AlterAxisSignal[] = [];

  // 1. 恐れ → 軸信号
  for (const fear of growth.knownFears) {
    const mapping = FEAR_TO_AXIS[fear];
    if (mapping) {
      for (const { axis, value } of mapping) {
        signals.push({
          axis,
          value,
          confidence: 0.15, // 恐れからの推定は弱い証拠
          source: "fear_pattern",
        });
      }
    }
  }

  // 2. 価値観 → 軸信号
  for (const val of growth.knownValues) {
    const mapping = VALUE_TO_AXIS[val];
    if (mapping) {
      for (const { axis, value } of mapping) {
        if (value === 0) continue; // 中立は信号なし
        signals.push({
          axis,
          value,
          confidence: 0.15,
          source: "value_pattern",
        });
      }
    }
  }

  // 3. 応答スタイル → 軸信号
  signals.push(...extractResponseStyleSignals(growth.responseStyle));

  // 4. セッションテーマ → 軸信号
  const allThemes = summary.keyThemes.join(" ");
  for (const { pattern, signals: themeSignals } of THEME_KEYWORDS) {
    if (pattern.test(allThemes)) {
      for (const { axis, value } of themeSignals) {
        signals.push({
          axis,
          value,
          confidence: 0.1, // テーマからの推定は最も弱い
          source: "session_theme",
        });
      }
    }
  }

  // 5. 矛盾検出 → 信号
  if (summary.contradictionsDiscovered.length > 0) {
    // 矛盾が多い = emotional_variability / relationship_mode_split が高い
    signals.push({
      axis: "emotional_variability",
      value: Math.min(0.5, summary.contradictionsDiscovered.length * 0.15),
      confidence: 0.15,
      source: "contradiction",
    });
    signals.push({
      axis: "relationship_mode_split",
      value: Math.min(0.4, summary.contradictionsDiscovered.length * 0.1),
      confidence: 0.1,
      source: "contradiction",
    });
  }

  return signals;
}

/**
 * 同じ軸に対する複数の信号を統合する（加重平均）
 */
function consolidateSignals(
  signals: AlterAxisSignal[],
): Array<{ axis: TraitAxisKey; value: number; confidence: number }> {
  const grouped = new Map<TraitAxisKey, AlterAxisSignal[]>();
  for (const signal of signals) {
    const existing = grouped.get(signal.axis) ?? [];
    existing.push(signal);
    grouped.set(signal.axis, existing);
  }

  const consolidated: Array<{ axis: TraitAxisKey; value: number; confidence: number }> = [];
  for (const [axis, axisSignals] of grouped) {
    // 加重平均: confidence を重みとして使う
    let weightedSum = 0;
    let totalWeight = 0;
    let maxConfidence = 0;
    for (const s of axisSignals) {
      weightedSum += s.value * s.confidence;
      totalWeight += s.confidence;
      maxConfidence = Math.max(maxConfidence, s.confidence);
    }
    if (totalWeight > 0) {
      consolidated.push({
        axis,
        value: Math.max(-1, Math.min(1, weightedSum / totalWeight)),
        // 複数信号が一致 → confidence 少し上昇（ただし上限 0.3）
        confidence: Math.min(0.3, maxConfidence + (axisSignals.length - 1) * 0.03),
      });
    }
  }

  return consolidated;
}

/**
 * Alter セッション完了後に Stargazer の軸スナップショットを更新する
 *
 * Alter route の updateAlterGrowth() 完了後に呼ばれる想定。
 * Alter 側には一切変更を加えない。
 */
export async function syncAlterSignalsToStargazer(
  userId: string,
  growth: AlterGrowthState,
  summary: AlterSessionSummary,
): Promise<PipelineResult> {
  const result: PipelineResult = {
    signalsExtracted: 0,
    snapshotsWritten: 0,
    errors: [],
  };

  try {
    // 1. 信号抽出
    const rawSignals = extractSignals(growth, summary);
    result.signalsExtracted = rawSignals.length;

    if (rawSignals.length === 0) {
      return result;
    }

    // 2. 信号統合（同じ軸の複数信号を加重平均）
    const consolidated = consolidateSignals(rawSignals);

    // 3. axis_snapshots に書き込み
    const now = new Date().toISOString();
    const sessionDate = now.slice(0, 10);
    const snapshotRows = consolidated.map((s) => ({
      id: crypto.randomUUID(),
      user_id: userId,
      axis_id: s.axis,
      score: s.value,
      confidence: s.confidence,
      context: null,
      observation_layer: "alter_signal",
      variant_id: summary.sessionId,
      session_date: sessionDate,
      created_at: now,
    }));

    const { error } = await supabaseAdmin
      .from("stargazer_axis_snapshots")
      .insert(snapshotRows);

    if (error) {
      result.errors.push(`snapshot insert failed: ${error.message}`);
      console.error("[alter→stargazer] Snapshot insert error:", error);
    } else {
      result.snapshotsWritten = snapshotRows.length;
    }

    console.info(
      `[alter→stargazer] userId=${userId} signals=${rawSignals.length} consolidated=${consolidated.length} written=${result.snapshotsWritten}`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(msg);
    console.error("[alter→stargazer] Pipeline error:", err);
  }

  return result;
}
