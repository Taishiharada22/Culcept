/**
 * Derived Fact Generator — 全軸スコアから5-8文の派生事実を生成
 *
 * 旧top8ラベル列挙に代わり、LLMプロンプトに「この人の判断と行動の特徴」として注入する。
 * 各事実はsourceAxesを持ち、全経路でトレーサビリティを保証する。
 *
 * @see docs/design/stargazer-alter-axis-architecture.md §6
 */

import { type TraitAxisKey } from "./traitAxes";
import {
  AXIS_REGISTRY,
  type AxisDomain,
  getActiveAxisKeys,
  getAxesByDomain,
  resolveAxisScore,
} from "./axisRegistry";

// ─── Types ─────────────────────────────────────────────────

export type DerivedFactType =
  | "contradiction"  // 矛盾事実: 2軸以上の対立パターン
  | "blindspot"      // 盲点事実: 本人が気づいていない傾向
  | "personality"    // 人格事実: ドメイン横断パターン
  | "context";       // 文脈事実: 質問domainに関連する軸パターン

export interface DerivedFact {
  /** LLMに渡す派生事実文（日本語） */
  text: string;
  /** 事実の種類 */
  sourceType: DerivedFactType;
  /** この事実を生成した軸群 */
  sourceAxes: TraitAxisKey[];
  /** 事実の確信度 (0-1) */
  confidence: number;
  /** どのルールから生成されたか（トレーサビリティ用） */
  generationRule: string;
}

export interface DerivedFactSet {
  /** 最終的にLLMに渡す派生事実群（5-8文） */
  facts: DerivedFact[];
  /** selectFacts前の全候補（フィルタ率計測用） */
  allCandidates: DerivedFact[];
  /** 寄与した軸の総数 */
  totalAxesUsed: number;
  /** 生成日時 */
  generatedAt: string;
  /** 生成に使った全軸スコアのスナップショット（デバッグ用） */
  inputScoresSnapshot: Partial<Record<TraitAxisKey, number>>;
}

// ─── Input Types ───────────────────────────────────────────

export interface ContradictionInput {
  axisA: TraitAxisKey;
  axisB: TraitAxisKey;
  insight: string;
  tension: number; // 0-1
}

export interface BlindSpotInput {
  axes: TraitAxisKey[];
  description: string;
  confidence: number; // 0-1
}

export interface DerivedFactGeneratorInput {
  /** 全軸スコア（frozen軸含む。resolveAxisScoreで自動転送） */
  axisScores: Partial<Record<TraitAxisKey, number>>;
  /** 検出済み矛盾リスト（contradictionDetector.tsの出力） */
  contradictions: ContradictionInput[];
  /** 検出済み盲点リスト（blindSpotDrop.tsの出力、なければ空配列） */
  blindSpots: BlindSpotInput[];
  /** 質問のドメイン（文脈事実生成用、nullable） */
  queryDomain?: AxisDomain | null;
}

// ─── Constants ─────────────────────────────────────────────

const MAX_CONTRADICTION_FACTS = 2;
const MAX_BLINDSPOT_FACTS = 2;
const MAX_PERSONALITY_FACTS = 2;
const MAX_CONTEXT_FACTS = 2;
const MIN_TOTAL_FACTS = 5;
const MAX_TOTAL_FACTS = 8;
const CONFIDENCE_THRESHOLD = 0.3;
const MAX_AXIS_APPEARANCES = 3; // 同一軸が寄与できる事実数の上限

// ─── Core Generator ────────────────────────────────────────

/**
 * 全軸スコアから5-8文の派生事実を生成する
 */
export function generateDerivedFacts(
  input: DerivedFactGeneratorInput,
): DerivedFactSet {
  const { axisScores, contradictions, blindSpots, queryDomain } = input;

  // frozen軸のスコアを解決済みスコアに変換
  const resolvedScores: Partial<Record<TraitAxisKey, number>> = {};
  for (const key of getActiveAxisKeys()) {
    const val = resolveAxisScore(key, axisScores);
    if (val !== undefined && val !== null) {
      resolvedScores[key] = val;
    }
  }

  const allFacts: DerivedFact[] = [];
  const axisUsageCount = new Map<TraitAxisKey, number>();

  // ── Step 1: 矛盾事実の生成 (最大2文) ──
  const contradictionFacts = generateContradictionFacts(contradictions);
  allFacts.push(...contradictionFacts);

  // ── Step 2: 盲点事実の生成 (最大2文) ──
  const blindspotFacts = generateBlindspotFacts(blindSpots);
  allFacts.push(...blindspotFacts);

  // ── Step 3: 人格事実の生成 (最大2文) ──
  const personalityFacts = generatePersonalityFacts(resolvedScores);
  allFacts.push(...personalityFacts);

  // ── Step 4: 文脈事実の生成 (最大2文, queryDomainがある場合のみ) ──
  if (queryDomain) {
    const contextFacts = generateContextFacts(resolvedScores, queryDomain);
    allFacts.push(...contextFacts);
  }

  // ── Step 5: 選出 (5-8文に収める) ──
  const selectedFacts = selectFacts(allFacts, resolvedScores, axisUsageCount);

  // 寄与軸の集計
  const allSourceAxes = new Set<TraitAxisKey>();
  for (const fact of selectedFacts) {
    for (const axis of fact.sourceAxes) {
      allSourceAxes.add(axis);
    }
  }

  return {
    facts: selectedFacts,
    allCandidates: allFacts,
    totalAxesUsed: allSourceAxes.size,
    generatedAt: new Date().toISOString(),
    inputScoresSnapshot: { ...resolvedScores },
  };
}

// ─── Step 1: Contradiction Facts ───────────────────────────

function generateContradictionFacts(
  contradictions: ContradictionInput[],
): DerivedFact[] {
  return contradictions
    .sort((a, b) => b.tension - a.tension)
    .slice(0, MAX_CONTRADICTION_FACTS)
    .map((c) => ({
      text: c.insight,
      sourceType: "contradiction" as const,
      sourceAxes: [c.axisA, c.axisB],
      confidence: Math.min(1, c.tension + 0.2), // tensionが高いほど確信度UP
      generationRule: `contradiction:${c.axisA}×${c.axisB}`,
    }));
}

// ─── Step 2: Blindspot Facts ───────────────────────────────

function generateBlindspotFacts(
  blindSpots: BlindSpotInput[],
): DerivedFact[] {
  return blindSpots
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, MAX_BLINDSPOT_FACTS)
    .map((b) => ({
      text: b.description,
      sourceType: "blindspot" as const,
      sourceAxes: b.axes,
      confidence: b.confidence,
      generationRule: `blindspot:${b.axes.join("+")}`,
    }));
}

// ─── Step 3: Personality Facts ─────────────────────────────

function generatePersonalityFacts(
  scores: Partial<Record<TraitAxisKey, number>>,
): DerivedFact[] {
  const facts: DerivedFact[] = [];

  // 全軸のdeviationを計算（0.5基準）
  const deviations: Array<{ key: TraitAxisKey; deviation: number; score: number }> = [];
  for (const [key, score] of Object.entries(scores)) {
    if (score === undefined || score === null) continue;
    deviations.push({
      key: key as TraitAxisKey,
      deviation: Math.abs(score - 0.5),
      score,
    });
  }
  deviations.sort((a, b) => b.deviation - a.deviation);

  // 同一ドメイン内でdeviation上位2軸以上が極端な場合、パターンを文章化
  const domainGroups = new Map<AxisDomain, typeof deviations>();
  for (const d of deviations) {
    const entry = AXIS_REGISTRY.get(d.key);
    if (!entry || entry.tier === "frozen") continue;
    const domain = entry.domain;
    if (!domainGroups.has(domain)) domainGroups.set(domain, []);
    domainGroups.get(domain)!.push(d);
  }

  for (const [domain, axes] of domainGroups) {
    // deviation > 0.2 の軸が2本以上あるドメインのみ
    const extremeAxes = axes.filter((a) => a.deviation > 0.2);
    if (extremeAxes.length < 2) continue;

    const top2 = extremeAxes.slice(0, 2);
    const sourceAxes = top2.map((a) => a.key);
    const text = buildPersonalityText(top2, domain);

    if (text) {
      facts.push({
        text,
        sourceType: "personality",
        sourceAxes,
        confidence: Math.min(1, (top2[0].deviation + top2[1].deviation) / 1.2),
        generationRule: `personality:domain_${domain}:${sourceAxes.join("+")}`,
      });
    }
  }

  // confidenceでソートして上位2つを返す
  return facts
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, MAX_PERSONALITY_FACTS);
}

function buildPersonalityText(
  axes: Array<{ key: TraitAxisKey; deviation: number; score: number }>,
  _domain: AxisDomain,
): string | null {
  const descriptions: string[] = [];

  for (const axis of axes) {
    const entry = AXIS_REGISTRY.get(axis.key);
    if (!entry) continue;
    const side = axis.score >= 0.5 ? "right" : "left";
    const insight = side === "left" ? entry.fallbackInsightLeft : entry.fallbackInsightRight;
    if (insight) descriptions.push(insight);
  }

  if (descriptions.length < 2) return null;

  // 2つの特徴を1文に結合
  return `${descriptions[0]}。さらに、${descriptions[1].charAt(0).toLowerCase()}${descriptions[1].slice(1)}`;
}

// ─── Step 4: Context Facts ─────────────────────────────────

function generateContextFacts(
  scores: Partial<Record<TraitAxisKey, number>>,
  queryDomain: AxisDomain,
): DerivedFact[] {
  const domainAxes = getAxesByDomain(queryDomain);
  if (domainAxes.length === 0) return [];

  const extremeAxes: Array<{ key: TraitAxisKey; deviation: number; score: number }> = [];
  for (const entry of domainAxes) {
    const score = scores[entry.id];
    if (score === undefined || score === null) continue;
    const deviation = Math.abs(score - 0.5);
    if (deviation > 0.15) {
      extremeAxes.push({ key: entry.id, deviation, score });
    }
  }

  extremeAxes.sort((a, b) => b.deviation - a.deviation);

  const facts: DerivedFact[] = [];
  for (const axis of extremeAxes.slice(0, MAX_CONTEXT_FACTS)) {
    const entry = AXIS_REGISTRY.get(axis.key);
    if (!entry) continue;
    const side = axis.score >= 0.5 ? "right" : "left";
    const insight = side === "left" ? entry.fallbackInsightLeft : entry.fallbackInsightRight;
    if (!insight) continue;

    facts.push({
      text: insight,
      sourceType: "context",
      sourceAxes: [axis.key],
      confidence: Math.min(1, axis.deviation * 2),
      generationRule: `context:${queryDomain}:${axis.key}`,
    });
  }

  return facts;
}

// ─── Step 5: Selection ─────────────────────────────────────

function selectFacts(
  allFacts: DerivedFact[],
  resolvedScores: Partial<Record<TraitAxisKey, number>>,
  axisUsageCount: Map<TraitAxisKey, number>,
): DerivedFact[] {
  // confidence閾値でフィルタ
  let candidates = allFacts.filter((f) => f.confidence >= CONFIDENCE_THRESHOLD);

  // confidenceでソート
  candidates.sort((a, b) => b.confidence - a.confidence);

  // theme dedup: 同じsourceAxesペアの重複を排除
  const seen = new Set<string>();
  candidates = candidates.filter((f) => {
    const key = [...f.sourceAxes].sort().join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // 軸の多様性チェック: 同一軸が3文以上に寄与しないよう制限
  const selected: DerivedFact[] = [];
  for (const fact of candidates) {
    if (selected.length >= MAX_TOTAL_FACTS) break;

    // 軸使用回数チェック
    const wouldExceed = fact.sourceAxes.some(
      (axis) => (axisUsageCount.get(axis) ?? 0) >= MAX_AXIS_APPEARANCES,
    );
    if (wouldExceed) continue;

    selected.push(fact);
    for (const axis of fact.sourceAxes) {
      axisUsageCount.set(axis, (axisUsageCount.get(axis) ?? 0) + 1);
    }
  }

  // 最低5文保証: 不足時はfallbackInsightから補充
  if (selected.length < MIN_TOTAL_FACTS) {
    const usedAxes = new Set(selected.flatMap((f) => f.sourceAxes));
    const fallbacks = generateFallbackFacts(resolvedScores, usedAxes);
    for (const fb of fallbacks) {
      if (selected.length >= MIN_TOTAL_FACTS) break;
      selected.push(fb);
    }
  }

  return selected;
}

/**
 * 事実が足りない場合のfallback生成
 * deviationが大きい軸のfallbackInsightから補充
 */
function generateFallbackFacts(
  scores: Partial<Record<TraitAxisKey, number>>,
  usedAxes: Set<TraitAxisKey>,
): DerivedFact[] {
  const fallbacks: DerivedFact[] = [];

  const axisDeviations: Array<{ key: TraitAxisKey; score: number; deviation: number }> = [];
  for (const [key, score] of Object.entries(scores)) {
    if (usedAxes.has(key as TraitAxisKey)) continue;
    if (score === undefined || score === null) continue;
    axisDeviations.push({
      key: key as TraitAxisKey,
      score,
      deviation: Math.abs(score - 0.5),
    });
  }
  axisDeviations.sort((a, b) => b.deviation - a.deviation);

  for (const axis of axisDeviations.slice(0, 5)) {
    const entry = AXIS_REGISTRY.get(axis.key);
    if (!entry || entry.tier === "frozen") continue;
    const side = axis.score >= 0.5 ? "right" : "left";
    const insight = side === "left" ? entry.fallbackInsightLeft : entry.fallbackInsightRight;
    if (!insight) continue;

    fallbacks.push({
      text: insight,
      sourceType: "personality",
      sourceAxes: [axis.key],
      confidence: Math.min(1, axis.deviation * 1.5),
      generationRule: `fallback:${axis.key}`,
    });
  }

  return fallbacks;
}

// ─── Prompt Formatting ─────────────────────────────────────

/**
 * DerivedFactSetをLLMプロンプト用の文字列に変換
 */
export function formatDerivedFactsForPrompt(
  factSet: DerivedFactSet,
  topExtremeAxes?: Array<{ key: TraitAxisKey; score: number }>,
): string {
  const lines: string[] = [
    "### この人の判断と行動の特徴",
    "",
  ];

  for (const fact of factSet.facts) {
    lines.push(`- ${fact.text}`);
  }

  // 生データ参照（確認用、3軸に縮小）
  if (topExtremeAxes && topExtremeAxes.length > 0) {
    lines.push("");
    lines.push("### 生データ参照（確認用）");
    for (const axis of topExtremeAxes.slice(0, 3)) {
      const entry = AXIS_REGISTRY.get(axis.key);
      if (!entry) continue;
      lines.push(`- ${entry.labelLeft}/${entry.labelRight}: ${axis.score.toFixed(2)}`);
    }
  }

  return lines.join("\n");
}

// ─── Analytics Serialization ───────────────────────────────

/**
 * analytics記録用にDerivedFactSetをシリアライズ
 */
export function serializeDerivedFactsForAnalytics(factSet: DerivedFactSet): {
  derived_facts: Array<{
    sourceType: DerivedFactType;
    sourceAxes: TraitAxisKey[];
    confidence: number;
    generationRule: string;
    includedInPrompt: boolean;
  }>;
  derived_facts_summary: {
    totalGenerated: number;
    totalIncluded: number;
    uniqueAxesUsed: number;
  };
} {
  const includedRules = new Set(factSet.facts.map((f) => f.generationRule));
  const candidates = factSet.allCandidates ?? factSet.facts;

  return {
    derived_facts: candidates.map((f) => ({
      sourceType: f.sourceType,
      sourceAxes: f.sourceAxes,
      confidence: f.confidence,
      generationRule: f.generationRule,
      includedInPrompt: includedRules.has(f.generationRule),
    })),
    derived_facts_summary: {
      totalGenerated: candidates.length,
      totalIncluded: factSet.facts.length,
      uniqueAxesUsed: factSet.totalAxesUsed,
    },
  };
}
