import { runAI } from "@/lib/ai";
import { makeStargazerRunMetadata } from "./studentTrack";
import { TRAIT_AXES, type TraitAxisKey } from "./traitAxes";
import type {
  DetectedPattern,
  PatternType,
} from "./patternDetectionEngine";

// Re-export for consumers
export type { DetectedPattern } from "./patternDetectionEngine";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Target-specific Aha Insight types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type AhaTarget = "prophecy" | "blind_spot" | "alter" | "weather";

export interface TargetedAhaInsight {
  type:
    | "prophecy_boost"
    | "blind_spot_evidence"
    | "alter_reference"
    | "weather_context";
  patternType: PatternType;
  descriptionJa: string;
  confidence: number;
  axisId?: string;
  formattedForTarget: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Target priority and formatting
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const TARGET_PRIORITY: Record<AhaTarget, PatternType[]> = {
  prophecy: ["weekday", "time_of_day", "cycle"],
  blind_spot: ["avoidance", "contradiction", "behavioral_blind"],
  alter: ["contradiction", "hesitation", "behavioral_blind"],
  weather: ["cycle", "weekday", "time_of_day"],
};

function formatForTarget(pattern: DetectedPattern, target: AhaTarget): string {
  const conf = Math.round(pattern.confidence * 100);
  switch (target) {
    case "prophecy":
      return formatForProphecy(pattern, conf);
    case "blind_spot":
      return formatForBlindSpot(pattern);
    case "alter":
      return formatForAlter(pattern);
    case "weather":
      return formatForWeather(pattern);
  }
}

function formatForProphecy(pattern: DetectedPattern, confidencePercent: number): string {
  switch (pattern.patternType) {
    case "weekday": {
      const dayName = (pattern.metadata.dayName as string) ?? "この曜日";
      return `データによると、${dayName}に${pattern.descriptionJa}。同じパターンが出る確率は${confidencePercent}%`;
    }
    case "time_of_day":
      return `データによると、${pattern.descriptionJa}。明日も同じパターンが出る確率は${confidencePercent}%`;
    case "cycle": {
      const days = (pattern.metadata.cycleDays as number) ?? 7;
      return `約${days}日周期のパターンが検出されています。${pattern.descriptionJa}（確率${confidencePercent}%）`;
    }
    default:
      return `パターン検出: ${pattern.descriptionJa}（信頼度${confidencePercent}%）`;
  }
}

function formatForBlindSpot(pattern: DetectedPattern): string {
  switch (pattern.patternType) {
    case "avoidance":
      return `あなたは無意識にこの領域を避けている可能性があります——${pattern.descriptionJa}`;
    case "contradiction":
      return `行動データが示す矛盾: ${pattern.descriptionJa}。自覚していない内面の葛藤かもしれません`;
    case "behavioral_blind":
      return `行動的盲点の痕跡: ${pattern.descriptionJa}`;
    case "hesitation": {
      const ratio = (pattern.metadata.ratio as number) ?? 2;
      return `あなたはこの質問で回答時間が平均の${Math.round(ratio)}倍。無意識に避けている可能性`;
    }
    default:
      return `行動パターンからの証拠: ${pattern.descriptionJa}`;
  }
}

function formatForAlter(pattern: DetectedPattern): string {
  switch (pattern.patternType) {
    case "contradiction":
      return `データが示している——${pattern.descriptionJa}。これについて、どう思う？`;
    case "hesitation":
      return `面白いデータがある。${pattern.descriptionJa}。なぜだと思う？`;
    case "behavioral_blind":
      return `気づいてる？ ${pattern.descriptionJa}。本当にそれでいいの？`;
    case "avoidance":
      return `避けてるの、バレてるよ。${pattern.descriptionJa}`;
    default:
      return `データが語ってる——${pattern.descriptionJa}`;
  }
}

function formatForWeather(pattern: DetectedPattern): string {
  switch (pattern.patternType) {
    case "cycle": {
      const days = (pattern.metadata.cycleDays as number) ?? 7;
      return `過去のパターンから、約${days}日周期の変動が検出されています。今日はその影響を受けやすい日かもしれません`;
    }
    case "weekday": {
      const dayName = (pattern.metadata.dayName as string) ?? "この曜日";
      return `過去のパターンから、${dayName}は特有の傾向があります。${pattern.descriptionJa}`;
    }
    case "time_of_day":
      return `過去のパターンから、時間帯による変動が見られます。${pattern.descriptionJa}`;
    default:
      return `パターンコンテキスト: ${pattern.descriptionJa}`;
  }
}

const MIN_CONFIDENCE = 0.5;
const DEFAULT_LIMIT = 3;

/**
 * パターンをターゲットシステムに最適化して選択・フォーマットする。
 *
 * 選択ロジック:
 * 1. confidence > 0.5 のパターンのみ対象
 * 2. ターゲットが優先するパターンタイプを高スコアに
 * 3. confidence * priority_boost でソートし上位を返す
 */
export async function selectAhaInsights(
  patterns: DetectedPattern[],
  target: AhaTarget,
  limit: number = DEFAULT_LIMIT,
): Promise<TargetedAhaInsight[]> {
  const priority = TARGET_PRIORITY[target];

  const eligible = patterns.filter((p) => p.confidence > MIN_CONFIDENCE);
  if (eligible.length === 0) return [];

  const scored = eligible.map((pattern) => {
    const priorityIndex = priority.indexOf(pattern.patternType);
    const boost = priorityIndex >= 0 ? 1.5 - priorityIndex * 0.2 : 0.5;
    return { pattern, score: pattern.confidence * boost };
  });

  scored.sort((a, b) => b.score - a.score);

  const typeMap: Record<AhaTarget, TargetedAhaInsight["type"]> = {
    prophecy: "prophecy_boost",
    blind_spot: "blind_spot_evidence",
    alter: "alter_reference",
    weather: "weather_context",
  };

  return scored.slice(0, limit).map(({ pattern }) => ({
    type: typeMap[target],
    patternType: pattern.patternType,
    descriptionJa: pattern.descriptionJa,
    confidence: pattern.confidence,
    axisId: pattern.axisId ?? undefined,
    formattedForTarget: formatForTarget(pattern, target),
  }));
}

export interface AllTargetedAhaInsights {
  prophecy: TargetedAhaInsight[];
  blindSpot: TargetedAhaInsight[];
  alter: TargetedAhaInsight[];
  weather: TargetedAhaInsight[];
}

/**
 * 全ターゲット分の TargetedAhaInsight を一括生成する。
 */
export async function selectAllAhaInsights(
  patterns: DetectedPattern[],
  limitPerTarget: number = DEFAULT_LIMIT,
): Promise<AllTargetedAhaInsights> {
  const [prophecy, blindSpot, alter, weather] = await Promise.all([
    selectAhaInsights(patterns, "prophecy", limitPerTarget),
    selectAhaInsights(patterns, "blind_spot", limitPerTarget),
    selectAhaInsights(patterns, "alter", limitPerTarget),
    selectAhaInsights(patterns, "weather", limitPerTarget),
  ]);
  return { prophecy, blindSpot, alter, weather };
}

export interface AhaInsight {
  text: string; // The insight in Japanese, 1-3 sentences
  sourcePatterns: string[]; // pattern types that contributed
  noveltyScore: number; // 0-1, how novel this is
  category: "discovery" | "warning" | "affirmation" | "contradiction";
}

/**
 * Cross-reference multiple detected patterns to find non-obvious connections
 * Pure logic, no AI needed
 */
function crossReferencePatterns(
  patterns: DetectedPattern[],
): Array<{
  patterns: DetectedPattern[];
  connectionType: string;
  rawInsight: string;
}> {
  const crossRefs: Array<{
    patterns: DetectedPattern[];
    connectionType: string;
    rawInsight: string;
  }> = [];

  // Strategy 1: Same axis, different signal types
  // e.g., weekday pattern + hesitation on same axis = deeper pattern
  const byAxis = new Map<string, DetectedPattern[]>();
  for (const p of patterns) {
    if (p.axisId) {
      const existing = byAxis.get(p.axisId) || [];
      existing.push(p);
      byAxis.set(p.axisId, existing);
    }
  }
  for (const [axisId, axisPatterns] of byAxis) {
    if (axisPatterns.length >= 2) {
      const axisLabel = TRAIT_AXES.find((a) => a.id === axisId);
      const label = axisLabel
        ? `${axisLabel.labelLeft}/${axisLabel.labelRight}`
        : axisId;
      crossRefs.push({
        patterns: axisPatterns,
        connectionType: "multi_signal_axis",
        rawInsight: `「${label}」について、${axisPatterns.map((p) => p.descriptionJa).join("。さらに、")}`,
      });
    }
  }

  // Strategy 2: Weekday + avoidance (temporal avoidance)
  const weekdayPatterns = patterns.filter((p) => p.patternType === "weekday");
  const avoidancePatterns = patterns.filter(
    (p) => p.patternType === "avoidance",
  );
  for (const wp of weekdayPatterns) {
    for (const ap of avoidancePatterns) {
      crossRefs.push({
        patterns: [wp, ap],
        connectionType: "temporal_avoidance",
        rawInsight: `${wp.descriptionJa}。同時に、${ap.descriptionJa}。この2つは関連している可能性がある`,
      });
    }
  }

  // Strategy 3: Contradiction + hesitation (self-deception)
  const contradictions = patterns.filter(
    (p) => p.patternType === "contradiction",
  );
  const hesitations = patterns.filter((p) => p.patternType === "hesitation");
  for (const cp of contradictions) {
    for (const hp of hesitations) {
      if (cp.axisId === hp.axisId) {
        crossRefs.push({
          patterns: [cp, hp],
          connectionType: "self_deception",
          rawInsight: `${cp.descriptionJa}。しかも${hp.descriptionJa}。無意識の自己欺瞞の可能性がある`,
        });
      }
    }
  }

  // Strategy 4: Time-of-day + contradiction (situational persona)
  const todPatterns = patterns.filter((p) => p.patternType === "time_of_day");
  for (const tp of todPatterns) {
    for (const cp of contradictions) {
      crossRefs.push({
        patterns: [tp, cp],
        connectionType: "situational_persona",
        rawInsight: `${tp.descriptionJa}。一方で${cp.descriptionJa}。時間帯によって異なる自分を演じている`,
      });
    }
  }

  return crossRefs;
}

/**
 * Generate a polished Aha insight from cross-referenced patterns using AI
 */
export async function generateAhaInsight(
  crossRef: {
    patterns: DetectedPattern[];
    connectionType: string;
    rawInsight: string;
  },
  archetypeCode: string,
  userId: string,
): Promise<AhaInsight | null> {
  const systemPrompt = `あなたは深層観測の洞察エンジンです。ユーザーの行動パターンデータから、本人が気づいていない内面の法則性を発見し、洞察として提示します。

## ルール
- 「自分って、そういう人間だったのか」とユーザーが感じる洞察を目指す
- 「占い」ではなく「観測データに基づく発見」として提示する
- アドバイスではなく「発見」として提示する
- 1-3文で簡潔に
- 断定的すぎず、「〜かもしれない」「〜の傾向がある」のトーン
- カウンセラー口調ではなく、知的な観察者の視点
- 具体的なパターン名や数値を根拠として引用する
- 高校生〜40代の日本人に刺さる、地に足のついた表現を使う
- 日本語で出力`;

  const prompt = `以下のパターンデータから、ユーザーが自分では気づいていない洞察を1つ生成してください。

アーキタイプ: ${archetypeCode}
パターン接続タイプ: ${crossRef.connectionType}
検出されたパターン:
${crossRef.rawInsight}

パターンの信頼度: ${crossRef.patterns.map((p) => `${p.descriptionJa} (${Math.round(p.confidence * 100)}%)`).join("\n")}

この複数のパターンが組み合わさることで見えてくる、本人が無自覚な深層の傾向を1-3文で述べてください。`;

  try {
    const result = await runAI({
      taskType: "stargazer_aha_insight",
      prompt,
      systemPrompt,
      requireJson: false,
      temperature: 0.7,
      maxOutputTokens: 200,
      userId,
      metadata: makeStargazerRunMetadata({
        feature: "aha_engine",
        connectionType: crossRef.connectionType,
      }),
    });

    if (result.success && result.text?.trim()) {
      const category =
        crossRef.connectionType === "self_deception"
          ? "contradiction"
          : crossRef.connectionType === "temporal_avoidance"
            ? "warning"
            : crossRef.connectionType === "multi_signal_axis"
              ? "discovery"
              : "discovery";

      return {
        text: result.text.trim().slice(0, 300),
        sourcePatterns: crossRef.patterns.map((p) => p.patternType),
        noveltyScore: Math.min(
          1,
          crossRef.patterns.reduce((sum, p) => sum + p.confidence, 0) /
            crossRef.patterns.length,
        ),
        category: category as AhaInsight["category"],
      };
    }
  } catch (e) {
    console.warn("[ahaEngine] AI generation failed:", e);
  }

  // Fallback: use raw insight directly
  return {
    text: crossRef.rawInsight,
    sourcePatterns: crossRef.patterns.map((p) => p.patternType),
    noveltyScore: 0.5,
    category: "discovery",
  };
}

/**
 * Rank insights by novelty to avoid repetition
 */
function rankInsightNovelty(
  insights: AhaInsight[],
  previouslyShownDescriptions: string[],
): AhaInsight[] {
  const prevKeywords = new Set(
    previouslyShownDescriptions.flatMap((d) =>
      d.split(/[。、\s]+/).filter((w) => w.length > 2),
    ),
  );

  return insights
    .map((insight) => {
      const words = insight.text.split(/[。、\s]+/).filter((w) => w.length > 2);
      const overlap = words.filter((w) => prevKeywords.has(w)).length;
      const overlapRatio = words.length > 0 ? overlap / words.length : 0;
      return {
        ...insight,
        noveltyScore: insight.noveltyScore * (1 - overlapRatio * 0.5),
      };
    })
    .sort((a, b) => b.noveltyScore - a.noveltyScore);
}

/**
 * Main orchestrator: generate top N Aha insights from patterns
 */
export async function generateTopInsights(
  patterns: DetectedPattern[],
  archetypeCode: string,
  userId: string,
  previousDescriptions: string[] = [],
  maxInsights: number = 3,
): Promise<AhaInsight[]> {
  if (patterns.length < 2) return [];

  const crossRefs = crossReferencePatterns(patterns);
  if (crossRefs.length === 0) return [];

  // Sort cross-refs by combined confidence
  const sorted = crossRefs.sort((a, b) => {
    const aConf =
      a.patterns.reduce((s, p) => s + p.confidence, 0) / a.patterns.length;
    const bConf =
      b.patterns.reduce((s, p) => s + p.confidence, 0) / b.patterns.length;
    return bConf - aConf;
  });

  // Generate insights for top candidates
  const insights: AhaInsight[] = [];
  for (const ref of sorted.slice(0, maxInsights + 2)) {
    const insight = await generateAhaInsight(ref, archetypeCode, userId);
    if (insight) insights.push(insight);
    if (insights.length >= maxInsights + 2) break;
  }

  // Rank by novelty and return top N
  return rankInsightNovelty(insights, previousDescriptions).slice(
    0,
    maxInsights,
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Supabase helper: fetch + detect patterns for a user
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  runFullPatternDetection,
  type BehavioralSignal,
  type AxisSnapshot,
} from "./patternDetectionEngine";

/**
 * Supabase から直近30日のシグナル・スナップショットを取得し、
 * パターン検出を実行して TargetedAhaInsight[] を返す。
 *
 * 失敗時は空配列を返す（呼び出し元を壊さない）。
 */
export async function fetchPatternsForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<DetectedPattern[]> {
  const thirtyDaysAgo = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const [{ data: rawSignals }, { data: rawStates }] = await Promise.all([
    supabase
      .from("stargazer_behavioral_signals")
      .select("signal_type, value, context, question_id, session_date, recorded_at")
      .eq("user_id", userId)
      .gte("recorded_at", thirtyDaysAgo)
      .order("recorded_at", { ascending: false })
      .limit(500),
    supabase
      .from("stargazer_daily_states")
      .select("state_date, axis_id, score, day_of_week, hour")
      .eq("user_id", userId)
      .gte("state_date", thirtyDaysAgo.slice(0, 10))
      .order("state_date", { ascending: false })
      .limit(500),
  ]);

  const signals: BehavioralSignal[] = (rawSignals ?? []).map(
    (r: Record<string, unknown>) => ({
      signal_type: String(r.signal_type ?? ""),
      value: Number(r.value) || 0,
      context: r.context ? String(r.context) : null,
      question_id: r.question_id ? String(r.question_id) : null,
      session_date: String(r.session_date ?? ""),
      recorded_at: String(r.recorded_at ?? ""),
    }),
  );

  const snapshots: AxisSnapshot[] = (rawStates ?? []).map(
    (r: Record<string, unknown>) => ({
      date: String(r.state_date ?? ""),
      axisId: String(r.axis_id ?? ""),
      score: Number(r.score) || 0,
      dayOfWeek: Number(r.day_of_week) || 0,
      hour: Number(r.hour) || 12,
    }),
  );

  if (signals.length === 0 && snapshots.length === 0) return [];

  return runFullPatternDetection(signals, snapshots);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Surprise Score Calculator
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * インサイトの「驚き度」を計算する。
 *
 * 主要因子:
 * 1. 自己申告 vs 行動指標の乖離（大きいほど驚き）
 * 2. 矛盾要因（一見矛盾するデータの組み合わせ）
 * 3. 既出インサイトとの類似度（高いほど減点）
 */
export function calculateSurpriseScore(
  insight: string,
  userSelfReport: Record<string, number>,
  behavioralIndicators: Record<string, number>,
  previousInsights: string[],
): number {
  // ── 1. Self-report vs behavioral divergence ──
  let totalDivergence = 0;
  let axisCount = 0;

  for (const axisId of Object.keys(userSelfReport)) {
    const selfScore = userSelfReport[axisId];
    const behavioralScore = behavioralIndicators[axisId];
    if (selfScore !== undefined && behavioralScore !== undefined) {
      totalDivergence += Math.abs(selfScore - behavioralScore);
      axisCount++;
    }
  }

  const avgDivergence = axisCount > 0 ? totalDivergence / axisCount : 0;
  // Normalize: divergence of 0.5 on a -1..+1 scale is meaningful
  const divergenceScore = Math.min(1, avgDivergence / 1.0);

  // ── 2. Paradox factor ──
  // Detect axes where self-report and behavior point in opposite directions
  let paradoxCount = 0;
  for (const axisId of Object.keys(userSelfReport)) {
    const self = userSelfReport[axisId];
    const behavioral = behavioralIndicators[axisId];
    if (
      self !== undefined &&
      behavioral !== undefined &&
      Math.abs(self) > 0.2 &&
      Math.abs(behavioral) > 0.2 &&
      Math.sign(self) !== Math.sign(behavioral)
    ) {
      paradoxCount++;
    }
  }
  const paradoxScore = Math.min(1, paradoxCount * 0.3);

  // ── 3. Novelty penalty ──
  const insightWords = new Set(
    insight
      .split(/[。、\s「」]+/)
      .filter((w) => w.length > 2),
  );
  let maxOverlap = 0;

  for (const prev of previousInsights) {
    const prevWords = prev
      .split(/[。、\s「」]+/)
      .filter((w) => w.length > 2);
    let overlap = 0;
    for (const w of prevWords) {
      if (insightWords.has(w)) overlap++;
    }
    const overlapRatio =
      prevWords.length > 0 ? overlap / prevWords.length : 0;
    maxOverlap = Math.max(maxOverlap, overlapRatio);
  }
  const noveltyMultiplier = 1 - maxOverlap * 0.6;

  // ── Combine ──
  const raw =
    divergenceScore * 0.4 +
    paradoxScore * 0.35 +
    0.25; // base novelty for any new insight

  return Math.max(0, Math.min(1, raw * noveltyMultiplier));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Blind Spot Discovery Engine
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type BlindSpotType =
  | "unknown_pattern"
  | "projection"
  | "compensatory_behavior"
  | "temporal_blind"
  | "relational_mirror";

export type BlindSpotCategory =
  | "self_image_gap"
  | "behavioral_autopilot"
  | "emotional_defense"
  | "growth_edge";

export interface BlindSpotDiscovery {
  type: BlindSpotType;
  title: string;
  description: string;
  evidence: string[];
  surpriseScore: number;
  category: BlindSpotCategory;
}

/** 軸ラベル取得ヘルパー */
function _axisLabel(axisId: string): string {
  const def = TRAIT_AXES.find((a) => a.id === axisId);
  return def ? `${def.labelLeft}↔${def.labelRight}` : axisId;
}

function _axisSideLabel(axisId: string, score: number): string {
  const def = TRAIT_AXES.find((a) => a.id === axisId);
  if (!def) return axisId;
  return score < 0 ? def.labelLeft : def.labelRight;
}

/**
 * パターンと軸スコアからブラインドスポットを発見する。
 * 純粋ロジック、AI不要。
 */
export function discoverBlindSpots(
  patterns: DetectedPattern[],
  axisScores: Record<string, number>,
  userSelfReport?: Record<string, number>,
): BlindSpotDiscovery[] {
  const discoveries: BlindSpotDiscovery[] = [];

  // ── 1. Unknown Pattern: 曜日・時間帯による判断変動 ──
  const weekdayPatterns = patterns.filter(
    (p) => p.patternType === "weekday" && p.confidence >= 0.6,
  );
  const todPatterns = patterns.filter(
    (p) => p.patternType === "time_of_day" && p.confidence >= 0.6,
  );

  for (const wp of weekdayPatterns) {
    if (!wp.axisId) continue;
    const dayName = (wp.metadata.dayName as string) ?? "特定の曜日";
    const label = _axisLabel(wp.axisId);
    const deviation = wp.metadata.deviation as number;
    const direction = deviation > 0 ? "右" : "左";

    discoveries.push({
      type: "unknown_pattern",
      title: `${dayName}の判断は、普段のあなたと違う`,
      description: `${dayName}、「${label}」の判断基準が${direction}に偏る。他の曜日では現れないパターンだ。自分では一貫した判断をしていると思っているが、データはそう言っていない。`,
      evidence: [
        wp.descriptionJa,
        `信頼度: ${Math.round(wp.confidence * 100)}%`,
        `偏差: ${Math.round(Math.abs(deviation) * 100)}%`,
      ],
      surpriseScore: Math.min(1, wp.confidence * 1.2),
      category: "behavioral_autopilot",
    });
  }

  for (const tp of todPatterns) {
    if (!tp.axisId) continue;
    const period = tp.metadata.timePeriod as string;
    if (period !== "late_night") continue; // 深夜のみ特別扱い

    const label = _axisLabel(tp.axisId);
    const deviation = tp.metadata.deviation as number;
    const direction = deviation > 0 ? "右" : "左";

    discoveries.push({
      type: "temporal_blind",
      title: "夜のあなたは、昼のあなたとは別人格で判断している",
      description: `22時以降、「${label}」が${direction}方向に振れる。朝のあなたが選ばないものを、夜のあなたは自然に選ぶ。しかし本人は一貫していると思っている。`,
      evidence: [
        tp.descriptionJa,
        `信頼度: ${Math.round(tp.confidence * 100)}%`,
      ],
      surpriseScore: Math.min(1, tp.confidence * 1.3),
      category: "self_image_gap",
    });
  }

  // ── 2. Projection: 批判的になる領域 = 自分にもある特徴 ──
  const contradictions = patterns.filter(
    (p) => p.patternType === "contradiction" && p.confidence >= 0.5,
  );
  const hesitations = patterns.filter(
    (p) => p.patternType === "hesitation" && p.confidence >= 0.5,
  );

  for (const cp of contradictions) {
    if (!cp.axisId) continue;
    const label = _axisLabel(cp.axisId);
    const score = axisScores[cp.axisId as TraitAxisKey];
    if (score === undefined) continue;

    const selfLabel = _axisSideLabel(cp.axisId, score);
    const rate = (cp.metadata.contradictionRate as number) ?? 0.5;

    discoveries.push({
      type: "projection",
      title: `「${selfLabel}」——その確信の裏に、別の自分がいる`,
      description: `「${label}」で、直感と最終回答が${Math.round(rate * 100)}%の確率で矛盾する。あなたが「こうありたい」と思う自分と、最初に反応する自分が別の方向を向いている。他人のこの特徴を批判する時、自分の死角を映し出している可能性がある。`,
      evidence: [
        cp.descriptionJa,
        `矛盾率: ${Math.round(rate * 100)}%`,
        `信頼度: ${Math.round(cp.confidence * 100)}%`,
      ],
      surpriseScore: Math.min(1, cp.confidence * rate * 2),
      category: "self_image_gap",
    });
  }

  // ── 3. Compensatory Behavior: 躊躇 + 回避 = 補償行動 ──
  const avoidancePatterns = patterns.filter(
    (p) => p.patternType === "avoidance" && p.confidence >= 0.5,
  );

  for (const ap of avoidancePatterns) {
    const category = (ap.metadata.category as string) ?? "特定の領域";
    const type = ap.metadata.type as string;

    // Look for corresponding hesitation in related areas
    const relatedHesitation = hesitations.find(
      (h) => h.axisId === ap.axisId || h.confidence >= 0.6,
    );

    if (relatedHesitation) {
      const ratio = (relatedHesitation.metadata.ratio as number) ?? 2;

      discoveries.push({
        type: "compensatory_behavior",
        title: `回避と過剰準備——2つは同じ根から生えている`,
        description: `「${category}」を避ける一方で、関連する質問に平均の${Math.round(ratio)}倍の時間をかける。苦手意識を補うために過剰に考え込むパターンが見える。これは弱さではなく、あなたなりの適応戦略だ。`,
        evidence: [
          ap.descriptionJa,
          relatedHesitation.descriptionJa,
          `回避信頼度: ${Math.round(ap.confidence * 100)}%`,
        ],
        surpriseScore: Math.min(
          1,
          (ap.confidence + relatedHesitation.confidence) * 0.7,
        ),
        category: "emotional_defense",
      });
    } else if (type === "dismissive") {
      discoveries.push({
        type: "compensatory_behavior",
        title: `速すぎる回答は「考えたくない」のサイン`,
        description: `「${category}」に関する質問への回答が異常に速い。確信しているのではなく、向き合うことを回避している。この領域にはあなたがまだ整理できていない何かがある。`,
        evidence: [
          ap.descriptionJa,
          `信頼度: ${Math.round(ap.confidence * 100)}%`,
        ],
        surpriseScore: Math.min(1, ap.confidence * 1.1),
        category: "emotional_defense",
      });
    }
  }

  // ── 4. Temporal Blind Spot: 周期パターン ──
  const cycles = patterns.filter(
    (p) => p.patternType === "cycle" && p.confidence >= 0.5,
  );

  for (const cycle of cycles) {
    if (!cycle.axisId) continue;
    const days = (cycle.metadata.cycleDays as number) ?? 7;
    const ac = (cycle.metadata.autocorrelation as number) ?? 0.5;
    const label = _axisLabel(cycle.axisId);

    discoveries.push({
      type: "temporal_blind",
      title: `${days}日周期のリズムが、あなたの判断を動かしている`,
      description: `「${label}」が約${days}日周期で波打っている。再現性${Math.round(ac * 100)}%。自分では「気分の問題」と思っていることに、実は予測可能な法則がある。`,
      evidence: [
        cycle.descriptionJa,
        `周期: ${days}日`,
        `再現性: ${Math.round(ac * 100)}%`,
      ],
      surpriseScore: Math.min(1, ac * 1.2),
      category: "behavioral_autopilot",
    });
  }

  // ── 5. Relational Mirror: 行動的盲点 ──
  const blinds = patterns.filter(
    (p) => p.patternType === "behavioral_blind" && p.confidence >= 0.5,
  );

  for (const bp of blinds) {
    if (!bp.axisId) continue;
    const label = _axisLabel(bp.axisId);
    const score = axisScores[bp.axisId as TraitAxisKey];
    if (score === undefined) continue;

    const selfLabel = _axisSideLabel(bp.axisId, score);
    const axisMean = (bp.metadata.axisScoreMean as number) ?? score;

    discoveries.push({
      type: "relational_mirror",
      title: `「${selfLabel}」——確信の裏にある迷い`,
      description: `「${label}」で一貫して「${selfLabel}」を選んでいるが、回答時間のデータに迷いが刻まれている。この確信は本物か、それとも「こうあるべき」という自己イメージの防衛か。他者の判断を批判する時、ここが映し出されている可能性がある。`,
      evidence: [
        bp.descriptionJa,
        `軸スコア平均: ${Math.round(axisMean * 100) / 100}`,
        `信頼度: ${Math.round(bp.confidence * 100)}%`,
      ],
      surpriseScore: Math.min(1, bp.confidence * 1.2),
      category: "growth_edge",
    });
  }

  // ── Self-report vs behavior gaps (if self-report provided) ──
  if (userSelfReport) {
    for (const axisId of Object.keys(axisScores)) {
      const behavioral = axisScores[axisId];
      const selfReport = userSelfReport[axisId];
      if (behavioral === undefined || selfReport === undefined) continue;

      const gap = Math.abs(behavioral - selfReport);
      if (gap < 0.4) continue; // Only significant gaps

      const label = _axisLabel(axisId);
      const selfSide = _axisSideLabel(axisId, selfReport);
      const behavioralSide = _axisSideLabel(axisId, behavioral);

      if (selfSide === behavioralSide) continue; // Same direction, different intensity

      discoveries.push({
        type: "unknown_pattern",
        title: `自己認識と行動データの間にギャップがある`,
        description: `自分を「${selfSide}」だと認識しているが、行動データは「${behavioralSide}」の方向を指している。この乖離は、あなたが「こうありたい自分」と「実際の判断パターン」の間にまだ橋を架けていないことを意味する。`,
        evidence: [
          `「${label}」のギャップ: ${Math.round(gap * 100)}%`,
          `自己認識: ${selfSide}（${Math.round(selfReport * 100) / 100}）`,
          `行動データ: ${behavioralSide}（${Math.round(behavioral * 100) / 100}）`,
        ],
        surpriseScore: Math.min(1, gap * 1.5),
        category: "self_image_gap",
      });
    }
  }

  // Sort by surprise score descending
  discoveries.sort((a, b) => b.surpriseScore - a.surpriseScore);

  return discoveries;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Pattern Narrative Generator (AI-powered)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 検出パターンから物語的なインサイトを生成する。
 * AI を使用して、テンプレートに見えない独自の文章を生成する。
 */
export async function generatePatternNarrative(
  patterns: DetectedPattern[],
  archetypeCode: string,
  axisScores: Record<string, number>,
  userId?: string,
): Promise<string> {
  if (patterns.length === 0) return "";

  // Build a rich context for the AI
  const patternSummary = patterns
    .slice(0, 5)
    .map(
      (p) =>
        `[${p.patternType}] ${p.descriptionJa}（信頼度${Math.round(p.confidence * 100)}%）`,
    )
    .join("\n");

  // Find most extreme axes
  const extremeAxes = Object.entries(axisScores)
    .filter(([, v]) => Math.abs(v) > 0.3)
    .sort(([, a], [, b]) => Math.abs(b) - Math.abs(a))
    .slice(0, 5)
    .map(([id, score]) => {
      const def = TRAIT_AXES.find((a) => a.id === id);
      if (!def) return `${id}: ${score}`;
      const side = score < 0 ? def.labelLeft : def.labelRight;
      return `${side}（${Math.round(Math.abs(score) * 100)}%の強度）`;
    })
    .join("、");

  const systemPrompt = `あなたは深層観測の洞察ナレーターです。行動パターンの観測データから、ユーザー本人が気づいていない発見を物語的に伝えます。

## 絶対ルール
- 「自分って、そういう人間だったのか」と感じさせる
- カウンセラーのような優しい口調は禁止。鋭い、少しミステリアスな観察者の視点
- 「占い」的な表現は禁止。「観測データが示している」「パターンから検出された」等、観測に基づく発見として表現する
- 「〜かもしれません」は1回まで。残りは「データはこう語っている」「〜の痕跡がある」等の断定的表現を混ぜる
- 具体的な数値（曜日、時間、倍率）を織り込む
- 2-4文で完結
- 汎用的な性格診断のような文は禁止。このユーザー固有のデータに基づく発見のみ
- 高校生〜40代の日本人に刺さる、地に足のついた表現を使う。ポエティックすぎない
- 日本語で出力`;

  const prompt = `以下のデータから、このユーザーだけに当てはまる深層の発見を2-4文の物語として書いてください。

アーキタイプコード: ${archetypeCode}

検出パターン:
${patternSummary}

主要な特性:
${extremeAxes}

注意: 「内向的です」「慎重です」のような単純なラベリングは禁止。パターンの組み合わせから見える、本人が自覚していない法則性や矛盾を描いてください。`;

  try {
    const result = await runAI({
      taskType: "stargazer_pattern_narrative",
      prompt,
      systemPrompt,
      requireJson: false,
      temperature: 0.8,
      maxOutputTokens: 300,
      userId,
      metadata: makeStargazerRunMetadata({
        feature: "aha_engine",
        subFeature: "pattern_narrative",
        patternCount: patterns.length,
      }),
    });

    if (result.success && result.text?.trim()) {
      return result.text.trim().slice(0, 500);
    }
  } catch (e) {
    console.warn("[ahaEngine] Pattern narrative generation failed:", e);
  }

  // Fallback: combine top patterns into a simple narrative
  const topPatterns = patterns.slice(0, 3);
  return topPatterns.map((p) => p.descriptionJa).join("。") + "。";
}
