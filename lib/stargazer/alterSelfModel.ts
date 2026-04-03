/**
 * v4.2 Phase C: Living Self Model
 *
 * 既存の6データソースから「この人の今の全体像」を統合投影する。
 * 新しい DB テーブルは作らない。全て既存データからの projection。
 *
 * データソース:
 *   1. AlterGrowthState → core_drives, aversion_map, response_style
 *   2. AlterLongTermMemory → repeated_returns, meaning_patterns
 *   3. hypothesisFactEntries → active_hypotheses
 *   4. AlterPersonality → traits, contradictions, blindSpot
 *   5. context entries → recent_context
 *   6. patterns → behavioral_patterns
 *
 * ルールベース。LLM 呼び出しなし。
 */

import type { AlterGrowthState } from "./alterGrowth";
import type { AlterLongTermMemory, RecurringTheme } from "./alterMemory";
import type { HypothesisFactEntry } from "./alterHomeAdapter";
import type { AlterPersonality } from "./alter";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface CoreDrive {
  drive: string;
  confidence: number;
  source: "known_value" | "hypothesis" | "recurring_theme" | "personality";
}

export interface AversionEntry {
  trigger: string;
  intensity: number; // 0-1
  source: "known_fear" | "failed_probe" | "avoided_topic" | "personality";
}

export interface RepeatedReturn {
  theme: string;
  frequency: number;
  last_seen: string;
  user_awareness: "aware" | "partially_aware" | "unaware";
}

export interface MeaningPattern {
  concept: string;
  how_they_define_it: string;
}

export interface ActiveHypothesis {
  content: string;
  hypothesis_type: string;
  confidence: number;
  status: string;
}

export interface LivingSelfModel {
  /** この人の核心的動因（行動の根っこにあるもの） */
  core_drives: CoreDrive[];
  /** この人が嫌うもの・避けるもの */
  aversion_map: AversionEntry[];
  /** 繰り返し戻ってくるテーマ */
  repeated_returns: RepeatedReturn[];
  /** この人が言葉をどう使うか（独自の定義） */
  meaning_patterns: MeaningPattern[];
  /** 現在アクティブな仮説 */
  active_hypotheses: ActiveHypothesis[];
  /** 信頼レベル 0-4 */
  trust_level: number;
  /** 主要な矛盾（内的緊張） */
  dominant_contradictions: string[];
  /** 盲点 */
  blind_spots: string[];
  /** 応答スタイルの特徴 */
  response_style: {
    avg_length: number;
    emotional_richness: number;
    disagreement_tendency: number;
    self_referencing_depth: number;
  };
  /** データの充実度 0-1 */
  model_completeness: number;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Self Model Projection
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * projectSelfModel: 既存データソースから Living Self Model を投影。
 *
 * 全てのデータが揃わなくても動作する（graceful degradation）。
 * 各フィールドが null/undefined の場合はデフォルト値を使用。
 */
export function projectSelfModel(
  growthState: AlterGrowthState | undefined,
  longTermMemory: AlterLongTermMemory | undefined,
  hypotheses: HypothesisFactEntry[] | null,
  personality: AlterPersonality | undefined,
  discreteTrustLevel: number,
): LivingSelfModel {
  // ── core_drives: 価値観 + 仮説 + recurring themes から統合 ──
  const coreDrives: CoreDrive[] = [];

  // knownValues → core_drives
  if (growthState?.knownValues) {
    for (const v of growthState.knownValues) {
      coreDrives.push({ drive: v, confidence: 0.7, source: "known_value" });
    }
  }

  // stable/strengthening hypotheses → core_drives (高 confidence のみ)
  if (hypotheses) {
    for (const h of hypotheses) {
      if ((h.status === "stable" || h.status === "strengthening") && h.confidence >= 0.6) {
        coreDrives.push({ drive: h.content, confidence: h.confidence, source: "hypothesis" });
      }
    }
  }

  // personality traits → core_drives
  if (personality) {
    if (personality.coreDesire) {
      coreDrives.push({ drive: personality.coreDesire, confidence: 0.5, source: "personality" });
    }
  }

  // deduplicate by content similarity
  const uniqueDrives = deduplicateByContent(coreDrives, d => d.drive);

  // ── aversion_map: 恐れ + 失敗プローブ + 回避トピック ──
  const aversionMap: AversionEntry[] = [];

  if (growthState?.knownFears) {
    for (const f of growthState.knownFears) {
      aversionMap.push({ trigger: f, intensity: 0.7, source: "known_fear" });
    }
  }
  if (growthState?.failedProbes) {
    for (const p of growthState.failedProbes) {
      aversionMap.push({ trigger: p, intensity: 0.5, source: "failed_probe" });
    }
  }
  if (growthState?.avoidedTopics) {
    for (const t of growthState.avoidedTopics) {
      aversionMap.push({ trigger: t, intensity: 0.6, source: "avoided_topic" });
    }
  }
  if (personality?.coreFear) {
    aversionMap.push({ trigger: personality.coreFear, intensity: 0.6, source: "personality" });
  }

  // ── repeated_returns: 繰り返し戻るテーマ ──
  const repeatedReturns: RepeatedReturn[] = (longTermMemory?.recurringThemes ?? [])
    .filter((r: RecurringTheme) => r.frequency >= 2)
    .map((r: RecurringTheme) => ({
      theme: r.theme,
      frequency: r.frequency,
      last_seen: r.lastSeen,
      user_awareness: r.userAwareness,
    }));

  // ── meaning_patterns: key revelations から ──
  const meaningPatterns: MeaningPattern[] = (longTermMemory?.keyRevelations ?? [])
    .slice(0, 5)
    .map(rev => ({
      concept: rev.relatedAxis,
      how_they_define_it: rev.insight,
    }));

  // ── active_hypotheses ──
  const activeHypotheses: ActiveHypothesis[] = (hypotheses ?? [])
    .filter(h => h.status !== "disproven")
    .slice(0, 10)
    .map(h => ({
      content: h.content,
      hypothesis_type: h.hypothesis_type,
      confidence: h.confidence,
      status: h.status,
    }));

  // ── dominant_contradictions ──
  const dominantContradictions = personality?.dominantContradictions ?? [];

  // ── blind_spots ──
  const blindSpots: string[] = [];
  if (personality?.blindSpot) blindSpots.push(personality.blindSpot);
  if (personality?.shadowBlindSpot) blindSpots.push(personality.shadowBlindSpot);

  // ── response_style ──
  const responseStyle = {
    avg_length: growthState?.responseStyle?.avgResponseLength ?? 0,
    emotional_richness: growthState?.responseStyle?.emotionalVocabularyRichness ?? 0,
    disagreement_tendency: growthState?.responseStyle?.disagreementTendency ?? 0,
    self_referencing_depth: growthState?.responseStyle?.selfReferencingDepth ?? 0,
  };

  // ── model_completeness ──
  const completeness = estimateCompleteness(
    uniqueDrives.length,
    aversionMap.length,
    repeatedReturns.length,
    activeHypotheses.length,
    !!personality,
    growthState?.sessionsCompleted ?? 0,
  );

  return {
    core_drives: uniqueDrives.slice(0, 10), // 上位10件
    aversion_map: aversionMap.slice(0, 10),
    repeated_returns: repeatedReturns.slice(0, 10),
    meaning_patterns: meaningPatterns,
    active_hypotheses: activeHypotheses,
    trust_level: discreteTrustLevel,
    dominant_contradictions: dominantContradictions,
    blind_spots: blindSpots,
    response_style: responseStyle,
    model_completeness: completeness,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * コンテンツの重複排除。先頭5文字が一致するものを除去。
 */
function deduplicateByContent<T>(items: T[], getText: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter(item => {
    const key = getText(item).slice(0, 20).trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Self Model の充実度を推定。
 * セッション数とデータ量から 0-1 で返す。
 */
function estimateCompleteness(
  drivesCount: number,
  aversionsCount: number,
  returnsCount: number,
  hypothesesCount: number,
  hasPersonality: boolean,
  sessionsCompleted: number,
): number {
  let score = 0;

  // データの有無で加点
  if (drivesCount > 0) score += 0.15;
  if (drivesCount >= 3) score += 0.1;
  if (aversionsCount > 0) score += 0.1;
  if (returnsCount > 0) score += 0.1;
  if (returnsCount >= 3) score += 0.05;
  if (hypothesesCount > 0) score += 0.1;
  if (hypothesesCount >= 3) score += 0.05;
  if (hasPersonality) score += 0.15;

  // セッション数で加点（5セッション以上で満点）
  score += Math.min(sessionsCompleted / 5, 1.0) * 0.2;

  return Math.min(score, 1.0);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Prompt Builder
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * buildSelfModelPromptBlock: Self Model をプロンプトに注入するブロック。
 * trust level に応じて開示量を制御。
 */
export function buildSelfModelPromptBlock(model: LivingSelfModel): string {
  if (model.model_completeness < 0.1) return ""; // データ不足時は注入しない

  const sections: string[] = [
    "",
    "# この人の内的モデル（Living Self Model）",
  ];

  // core_drives
  if (model.core_drives.length > 0) {
    const top = model.core_drives
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 3)
      .map(d => `${d.drive}（確信度: ${(d.confidence * 100).toFixed(0)}%）`)
      .join("、");
    sections.push(`核心的動因: ${top}`);
  }

  // aversion_map
  if (model.aversion_map.length > 0) {
    const top = model.aversion_map
      .sort((a, b) => b.intensity - a.intensity)
      .slice(0, 3)
      .map(a => a.trigger)
      .join("、");
    sections.push(`嫌うもの: ${top}`);
  }

  // repeated_returns
  if (model.repeated_returns.length > 0) {
    const top = model.repeated_returns
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 3)
      .map(r => `${r.theme}（${r.frequency}回）`)
      .join("、");
    sections.push(`繰り返し戻るテーマ: ${top}`);
  }

  // contradictions
  if (model.dominant_contradictions.length > 0) {
    sections.push(`内的矛盾: ${model.dominant_contradictions.slice(0, 2).join("、")}`);
  }

  // blind spots
  if (model.blind_spots.length > 0) {
    sections.push(`盲点: ${model.blind_spots.slice(0, 2).join("、")}`);
  }

  sections.push("");
  sections.push("このモデルを根拠に、この人にしか当てはまらない応答を作れ。一般論を返すな。");

  return sections.join("\n");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Analytics Builder
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function buildSelfModelAnalytics(model: LivingSelfModel): Record<string, unknown> {
  return {
    core_drives_count: model.core_drives.length,
    aversions_count: model.aversion_map.length,
    repeated_returns_count: model.repeated_returns.length,
    hypotheses_count: model.active_hypotheses.length,
    trust_level: model.trust_level,
    completeness: Math.round(model.model_completeness * 100) / 100,
    has_contradictions: model.dominant_contradictions.length > 0,
    has_blind_spots: model.blind_spots.length > 0,
  };
}
