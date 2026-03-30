// lib/origin/adaptiveLayerEngine.ts
// 適応的レイヤー表示エンジン
// コア層（Tasks + 感情系1つ）は固定、変動は1-2層のみ
// 選定基準: 変化確率 × Stargazer矛盾スコア × 未入力期間

import type { DailyOrbitStore, DailyOrbitEntry } from "./dailyOrbit/types";
import type { StargazerOriginContext } from "./stargazerPipeline";
import type { JudgmentCategory } from "./entryContract";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** DailyOrbit の層ID */
export type OrbitLayerId =
  | "tasks"             // Layer 1: タスク（常に固定表示）
  | "bodyEcho"          // Layer 3: 身体の声
  | "dayState"          // Layer 4: Stargazer状態
  | "shadowIntention"   // Layer 5: 内在する意図
  | "temporalDialogue"  // Layer 6: 昨日の自分との対話
  | "timeTexture"       // Layer 7: 時間の体感
  | "reflection"        // Layer 8: 夜の1問
  | "selfForecast";     // Layer 9: 自分予報

export type LayerRecommendation = {
  /** 推奨する層のID */
  layerId: OrbitLayerId;
  /** 推奨理由（UIに表示可能） */
  reason: string;
  /** 推奨スコア（内部用、高いほど優先） */
  score: number;
  /** 固定表示かどうか */
  isFixed: boolean;
};

export type AdaptiveLayerResult = {
  /** 主表示する層（固定 + 変動） */
  primary: LayerRecommendation[];
  /** 折りたたみ表示する層 */
  collapsed: LayerRecommendation[];
  /** 週1の盲点提案（あれば） */
  blindSpot: LayerRecommendation | null;
};

// ---------------------------------------------------------------------------
// Layer metadata
// ---------------------------------------------------------------------------

const LAYER_META: Record<OrbitLayerId, { label: string; emoji: string; category: "core" | "emotion" | "cognitive" | "temporal" }> = {
  tasks:             { label: "タスク",           emoji: "✅", category: "core" },
  bodyEcho:          { label: "身体の声",         emoji: "🫀", category: "emotion" },
  dayState:          { label: "今の状態",         emoji: "🌤", category: "emotion" },
  shadowIntention:   { label: "内なる意図",       emoji: "🌑", category: "cognitive" },
  temporalDialogue:  { label: "昨日の自分との対話", emoji: "🔄", category: "temporal" },
  timeTexture:       { label: "時間の体感",       emoji: "⏳", category: "temporal" },
  reflection:        { label: "夜の1問",          emoji: "🌙", category: "cognitive" },
  selfForecast:      { label: "自分予報",         emoji: "🔮", category: "cognitive" },
};

const ALL_VARIABLE_LAYERS: OrbitLayerId[] = [
  "bodyEcho", "dayState", "shadowIntention", "temporalDialogue",
  "timeTexture", "reflection", "selfForecast",
];

// ---------------------------------------------------------------------------
// Core logic
// ---------------------------------------------------------------------------

/**
 * 適応的レイヤー推薦を生成する。
 *
 * 設計原則:
 * 1. tasks は常に固定
 * 2. 感情系1層（bodyEcho or dayState）を固定（コア層の安定性確保）
 * 3. 変動1-2層を選定（変化確率ベース）
 * 4. 残りは折りたたみ
 * 5. 週1で盲点層を提案
 */
export function selectAdaptiveLayers(
  store: DailyOrbitStore | null,
  stargazerCtx: StargazerOriginContext | null,
  todayJudgment: JudgmentCategory | null,
  options?: { forceShowAll?: boolean },
): AdaptiveLayerResult {
  if (options?.forceShowAll) {
    return {
      primary: Object.entries(LAYER_META).map(([id, meta]) => ({
        layerId: id as OrbitLayerId,
        reason: "",
        score: 1,
        isFixed: id === "tasks",
      })),
      collapsed: [],
      blindSpot: null,
    };
  }

  const scores = scoreAllLayers(store, stargazerCtx, todayJudgment);

  // --- 固定層 ---
  const fixed: LayerRecommendation[] = [
    { layerId: "tasks", reason: "コア層", score: 100, isFixed: true },
  ];

  // 感情系固定層: bodyEcho と dayState のうちスコアが高い方
  const emotionLayers = scores.filter(
    (s) => LAYER_META[s.layerId].category === "emotion"
  );
  emotionLayers.sort((a, b) => b.score - a.score);
  if (emotionLayers.length > 0) {
    fixed.push({ ...emotionLayers[0], isFixed: true, reason: "感情観測の基盤" });
  }

  const fixedIds = new Set(fixed.map((f) => f.layerId));

  // --- 変動層: 残りからスコア上位1-2層 ---
  const variable = scores
    .filter((s) => !fixedIds.has(s.layerId))
    .sort((a, b) => b.score - a.score);

  const variableCount = variable.length >= 3 ? 2 : 1;
  const primaryVariable = variable.slice(0, variableCount).map((s) => ({
    ...s,
    isFixed: false,
  }));
  const collapsed = variable.slice(variableCount).map((s) => ({
    ...s,
    isFixed: false,
  }));

  // --- 盲点提案（週1） ---
  const blindSpot = detectBlindSpot(store, fixedIds);

  return {
    primary: [...fixed, ...primaryVariable],
    collapsed,
    blindSpot,
  };
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

type LayerScore = {
  layerId: OrbitLayerId;
  reason: string;
  score: number;
};

function scoreAllLayers(
  store: DailyOrbitStore | null,
  stargazerCtx: StargazerOriginContext | null,
  todayJudgment: JudgmentCategory | null,
): LayerScore[] {
  return ALL_VARIABLE_LAYERS.map((layerId) => {
    let score = 0;
    const reasons: string[] = [];

    // 1. 変化確率: 最近の入力パターンからスコアリング
    const changeProbability = estimateChangeProbability(store, layerId);
    score += changeProbability * 40;
    if (changeProbability > 0.6) reasons.push("変化の兆し");

    // 2. Stargazer 矛盾スコアとの関連
    if (stargazerCtx) {
      const contradictionBoost = getContradictionBoost(layerId, stargazerCtx);
      score += contradictionBoost * 30;
      if (contradictionBoost > 0.5) reasons.push("性格の二面性に関連");
    }

    // 3. 未入力期間（長いほどスコアが上がる）
    const daysSinceInput = getDaysSinceLastInput(store, layerId);
    const gapBoost = Math.min(daysSinceInput / 7, 1);
    score += gapBoost * 20;
    if (daysSinceInput >= 5) reasons.push(`${daysSinceInput}日間未記録`);

    // 4. Entry の判断カテゴリとの関連
    if (todayJudgment) {
      const categoryBoost = getCategoryRelevance(layerId, todayJudgment);
      score += categoryBoost * 10;
      if (categoryBoost > 0.5) reasons.push("今日の判断に関連");
    }

    // 5. 時間帯ボーナス
    const hour = new Date().getHours();
    const timeBonus = getTimeBonus(layerId, hour);
    score += timeBonus * 5;

    return {
      layerId,
      reason: reasons[0] ?? LAYER_META[layerId].label,
      score: Math.round(score),
    };
  });
}

// ---------------------------------------------------------------------------
// Sub-scoring functions
// ---------------------------------------------------------------------------

function estimateChangeProbability(
  store: DailyOrbitStore | null,
  layerId: OrbitLayerId,
): number {
  if (!store) return 0.5; // データなし → 中立

  const entries = Object.values(store.entries);
  if (entries.length < 3) return 0.5;

  // 直近7日のデータを見て、この層の入力パターンを確認
  const recent = entries
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 7);

  const filled = recent.filter((e) => isLayerFilled(e, layerId)).length;
  const fillRate = filled / recent.length;

  // 入力率が中程度（40-60%）の時が最も変化確率が高い
  // 常に入力 or 常に未入力 → 変化が少ない
  return 1 - Math.abs(fillRate - 0.5) * 2;
}

function getContradictionBoost(
  layerId: OrbitLayerId,
  ctx: StargazerOriginContext,
): number {
  if (ctx.contradictions.length === 0) return 0;

  // 層と関連するStargazer軸の矛盾をチェック
  const relatedAxes: Record<OrbitLayerId, string[]> = {
    tasks: [],
    bodyEcho: ["emotional_variability", "emotional_regulation"],
    dayState: ["emotional_variability", "stress_isolation_vs_social"],
    shadowIntention: ["public_private_gap", "rumination_tendency"],
    temporalDialogue: ["change_embrace_vs_resist", "growth_mindset"],
    timeTexture: ["plan_vs_spontaneous", "decision_tempo"],
    reflection: ["analytical_vs_intuitive", "rumination_tendency"],
    selfForecast: ["locus_of_control", "perfectionist_vs_pragmatic"],
  };

  const axes = relatedAxes[layerId] ?? [];
  const matchingContradictions = ctx.contradictions.filter(
    (c) => axes.includes(c.key)
  );

  if (matchingContradictions.length === 0) return 0;

  // 最も強い矛盾のstrengthを返す
  return Math.max(...matchingContradictions.map((c) => c.strength));
}

function getDaysSinceLastInput(
  store: DailyOrbitStore | null,
  layerId: OrbitLayerId,
): number {
  if (!store) return 7;

  const entries = Object.values(store.entries)
    .sort((a, b) => b.date.localeCompare(a.date));

  for (let i = 0; i < entries.length && i < 30; i++) {
    if (isLayerFilled(entries[i], layerId)) return i;
  }

  return 30;
}

function getCategoryRelevance(
  layerId: OrbitLayerId,
  category: JudgmentCategory,
): number {
  // entryContract.ts の suggestOrbitLayers と整合
  const relevanceMap: Record<JudgmentCategory, OrbitLayerId[]> = {
    work_decision: ["shadowIntention", "selfForecast"],
    relationship: ["bodyEcho", "reflection"],
    time_allocation: ["timeTexture", "selfForecast"],
    self_care: ["bodyEcho", "dayState", "reflection"],
    money: ["shadowIntention", "timeTexture"],
    nothing_special: ["bodyEcho", "temporalDialogue", "reflection"],
  };

  return relevanceMap[category]?.includes(layerId) ? 1 : 0;
}

function getTimeBonus(layerId: OrbitLayerId, hour: number): number {
  // 朝は temporal/body、夜は reflection/timeTexture
  if (hour < 12) {
    if (layerId === "temporalDialogue" || layerId === "bodyEcho") return 1;
    if (layerId === "selfForecast") return 0.8;
  } else if (hour >= 18) {
    if (layerId === "reflection" || layerId === "timeTexture") return 1;
    if (layerId === "shadowIntention") return 0.8;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Blind spot detection
// ---------------------------------------------------------------------------

function detectBlindSpot(
  store: DailyOrbitStore | null,
  fixedIds: Set<OrbitLayerId>,
): LayerRecommendation | null {
  if (!store) return null;

  // 週1回だけ提案（日曜 or 使用開始から7の倍数日目）
  const dayOfWeek = new Date().getDay();
  if (dayOfWeek !== 0) return null; // 日曜のみ

  // 直近14日で最も入力が少ない層を検出
  const entries = Object.values(store.entries)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 14);

  if (entries.length < 7) return null;

  let leastUsed: { layerId: OrbitLayerId; count: number } | null = null;

  for (const layerId of ALL_VARIABLE_LAYERS) {
    if (fixedIds.has(layerId)) continue;
    const count = entries.filter((e) => isLayerFilled(e, layerId)).length;
    if (!leastUsed || count < leastUsed.count) {
      leastUsed = { layerId, count };
    }
  }

  if (!leastUsed || leastUsed.count > entries.length * 0.3) return null;

  const meta = LAYER_META[leastUsed.layerId];
  return {
    layerId: leastUsed.layerId,
    reason: `「${meta.label}」は最近あまり使われていません。新しい発見があるかもしれません`,
    score: 80,
    isFixed: false,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isLayerFilled(entry: DailyOrbitEntry, layerId: OrbitLayerId): boolean {
  switch (layerId) {
    case "tasks": return entry.tasks.length > 0;
    case "bodyEcho": return entry.bodyEcho != null;
    case "dayState": return entry.dayState != null;
    case "shadowIntention": return entry.shadowIntention != null;
    case "temporalDialogue": return entry.temporalDialogue?.response != null;
    case "timeTexture": return entry.timeTexture != null;
    case "reflection": return entry.reflection != null;
    case "selfForecast": return entry.selfForecast != null;
  }
}

/**
 * 層の表示名とアイコンを取得
 */
export function getLayerMeta(layerId: OrbitLayerId) {
  return LAYER_META[layerId];
}
