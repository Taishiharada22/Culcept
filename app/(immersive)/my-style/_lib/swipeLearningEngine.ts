// app/my-style/_lib/swipeLearningEngine.ts
// スワイプ学習エンジン: 属性ベクトル学習 + フェーズ遷移 + スタイルレーン導出

import { SWIPE_LEARNING_KEY } from "./constants";
import {
  AXIS_DEFINITIONS,
  getAxesForPhase,
  type AxisState,
  type LearningPhase,
  type SwipeHistoryEntry,
  type SwipeLearningState,
} from "./swipeLearningAxes";
import { getCardAxisDeltas } from "./cardAttributeMap";
import type { SavedState } from "./types";

// ── 定数 ─────────────────────────────────
const LEARNING_RATE = 0.15;
const MAX_HISTORY = 50;
const PHASE1_CONFIDENCE_THRESHOLD = 0.5;
const PHASE1_UNLOCK_RATIO = 0.6; // Phase1の60%が閾値超えでPhase2へ
const PHASE2_UNLOCK_RATIO = 0.5; // Phase2の50%が閾値超えでPhase3へ
const PHASE3_UNLOCK_RATIO = 0.5; // Phase3の50%が閾値超えでPhase4へ

// ── スタイルレーンの軸重みマップ ──────────
// 各スタイルレーンを軸の組み合わせで表現
const LANE_AXIS_WEIGHTS: Record<string, Record<string, number>> = {
  minimal: {
    simple_decorative: -0.9,
    minimal_maximal: -0.9,
    achromatic_chromatic: -0.4,
    clean_distressed: -0.4,
  },
  street: {
    kirei_street: 0.8,
    casual_mode: -0.6,
    tight_oversized: 0.4,
  },
  vintage: {
    classic_trend: -0.5,
    clean_distressed: 0.4,
    natural_synthetic: -0.3,
  },
  sporty: {
    casual_mode: -0.6,
    light_heavy: -0.4,
    natural_synthetic: 0.3,
  },
  luxury: {
    kirei_street: -0.5,
    casual_mode: 0.5,
    mature_youthful: -0.5,
  },
  daily: {
    casual_mode: -0.5,
    simple_decorative: -0.4,
    classic_trend: -0.3,
  },
  elegant: {
    kirei_street: -0.7,
    feminine_sharp: -0.3,
    mature_youthful: -0.4,
  },
  workwear: {
    structured_drapey: -0.5,
    light_heavy: 0.4,
    casual_mode: -0.2,
  },
  outdoor: {
    casual_mode: -0.5,
    natural_synthetic: 0.3,
    light_heavy: 0.3,
  },
  office_casual: {
    casual_mode: 0.2,
    kirei_street: -0.4,
    simple_decorative: -0.3,
  },
  conservative: {
    classic_trend: -0.6,
    simple_decorative: -0.4,
    mature_youthful: -0.3,
  },
  feminine: {
    feminine_sharp: -0.8,
    sweet_spicy: -0.4,
    simple_decorative: 0.2,
  },
  clean_casual: {
    kirei_street: -0.4,
    casual_mode: -0.3,
    simple_decorative: -0.3,
  },
  mannish: {
    feminine_sharp: 0.8,
    structured_drapey: -0.4,
    mature_youthful: -0.3,
  },
  amekaji: {
    casual_mode: -0.6,
    classic_trend: -0.2,
    natural_synthetic: -0.3,
  },
  korean_fashion: {
    classic_trend: 0.4,
    slim_wide: -0.3,
    pale_vivid: -0.3,
  },
  trad: {
    classic_trend: -0.7,
    structured_drapey: -0.4,
    simple_decorative: -0.2,
  },
  pale_tone: {
    pale_vivid: -0.7,
    warm_cool: -0.2,
    sweet_spicy: -0.3,
  },
  west_coast: {
    casual_mode: -0.5,
    season_ss_aw: -0.4,
    nukenkan: -0.4,
  },
  french_casual: {
    kirei_street: -0.3,
    nukenkan: -0.5,
    simple_decorative: -0.3,
  },
  preppy: {
    classic_trend: -0.5,
    kirei_street: -0.3,
    mature_youthful: 0.3,
  },
  rock: {
    feminine_sharp: 0.5,
    light_heavy: 0.3,
    clean_distressed: 0.3,
  },
};

// ── 初期化 ────────────────────────────────

function createEmptyAxisState(): AxisState {
  return { value: 0, confidence: 0, sampleCount: 0 };
}

export function initLearningState(): SwipeLearningState {
  const axes: Record<string, AxisState> = {};
  for (const axis of AXIS_DEFINITIONS) {
    axes[axis.key] = createEmptyAxisState();
  }
  return {
    version: 1,
    axes,
    currentPhase: 1,
    totalSwipes: 0,
    swipeHistory: [],
    tagLikes: {},
    tagDislikes: {},
    styleLaneScores: {},
    lastSwipedAt: new Date().toISOString(),
  };
}

// ── 永続化 ────────────────────────────────

export function loadLearningState(): SwipeLearningState {
  if (typeof window === "undefined") return initLearningState();
  try {
    const raw = localStorage.getItem(SWIPE_LEARNING_KEY);
    if (!raw) return initLearningState();
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1) return initLearningState();
    // 新しい軸が追加されていたら補完
    const state = parsed as SwipeLearningState;
    for (const axis of AXIS_DEFINITIONS) {
      if (!state.axes[axis.key]) {
        state.axes[axis.key] = createEmptyAxisState();
      }
    }
    return state;
  } catch {
    return initLearningState();
  }
}

export function saveLearningState(state: SwipeLearningState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SWIPE_LEARNING_KEY, JSON.stringify(state));
  } catch {
    // localStorage full — silent fail
  }
}

// ── 軸の更新 ──────────────────────────────

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function updateAxis(current: AxisState, delta: number, weight: number): AxisState {
  const effectiveDelta = delta * weight;
  const newValue = clamp(
    current.value + LEARNING_RATE * (effectiveDelta - current.value * 0.05),
    -1,
    1
  );
  const newSampleCount = current.sampleCount + 1;
  // confidence: 0.63 at 8 samples, 0.86 at 16, 0.95 at 24
  const newConfidence = Math.min(1.0, 1 - Math.exp(-newSampleCount / 8));

  return {
    value: newValue,
    confidence: newConfidence,
    sampleCount: newSampleCount,
  };
}

// ── スワイプ処理 ─────────────────────────

export function processSwipe(
  state: SwipeLearningState,
  cardId: string,
  tags: string[],
  direction: "left" | "right" | "up"
): SwipeLearningState {
  // 方向による重み
  const directionWeight = direction === "right" ? 1.0 : direction === "left" ? -1.0 : 1.5;

  // タグから軸deltaを取得
  const deltas = getCardAxisDeltas(tags);

  // 軸ごとにdeltaを集約
  const axisDeltaMap: Record<string, number[]> = {};
  for (const d of deltas) {
    if (!axisDeltaMap[d.axis]) axisDeltaMap[d.axis] = [];
    axisDeltaMap[d.axis].push(d.delta);
  }

  // 各軸を更新
  const newAxes = { ...state.axes };
  for (const [axisKey, deltasForAxis] of Object.entries(axisDeltaMap)) {
    if (!newAxes[axisKey]) continue;
    // 同じ軸に複数のdeltaがあれば平均
    const avgDelta = deltasForAxis.reduce((a, b) => a + b, 0) / deltasForAxis.length;
    newAxes[axisKey] = updateAxis(newAxes[axisKey], avgDelta, directionWeight);
  }

  // タグ頻度を更新
  const newTagLikes = { ...state.tagLikes };
  const newTagDislikes = { ...state.tagDislikes };
  for (const tag of tags) {
    const normalized = tag.toLowerCase().replace(/[\s-]/g, "_");
    if (direction === "right" || direction === "up") {
      newTagLikes[normalized] = (newTagLikes[normalized] ?? 0) + 1;
    } else {
      newTagDislikes[normalized] = (newTagDislikes[normalized] ?? 0) + 1;
    }
  }

  // 履歴を更新 (直近50件)
  const entry: SwipeHistoryEntry = {
    cardId,
    tags,
    direction,
    timestamp: new Date().toISOString(),
  };
  const newHistory = [...state.swipeHistory, entry].slice(-MAX_HISTORY);

  // フェーズ判定
  const newPhase = determinePhase(newAxes);

  // スタイルレーンスコア導出
  const newLaneScores = deriveStyleLaneScores(newAxes);

  return {
    ...state,
    axes: newAxes,
    currentPhase: newPhase,
    totalSwipes: state.totalSwipes + 1,
    swipeHistory: newHistory,
    tagLikes: newTagLikes,
    tagDislikes: newTagDislikes,
    styleLaneScores: newLaneScores,
    lastSwipedAt: new Date().toISOString(),
  };
}

// ── フェーズ遷移 ─────────────────────────

export function determinePhase(axes: Record<string, AxisState>): LearningPhase {
  const phase1Axes = getAxesForPhase(1);
  const phase1Ready = phase1Axes.filter(
    (a) => (axes[a.key]?.confidence ?? 0) >= PHASE1_CONFIDENCE_THRESHOLD
  );

  if (phase1Ready.length < Math.ceil(phase1Axes.length * PHASE1_UNLOCK_RATIO)) {
    return 1;
  }

  const phase2Axes = getAxesForPhase(2);
  const phase2Ready = phase2Axes.filter(
    (a) => (axes[a.key]?.confidence ?? 0) >= PHASE1_CONFIDENCE_THRESHOLD
  );

  if (phase2Ready.length < Math.ceil(phase2Axes.length * PHASE2_UNLOCK_RATIO)) {
    return 2;
  }

  const phase3Axes = getAxesForPhase(3);
  const phase3Ready = phase3Axes.filter(
    (a) => (axes[a.key]?.confidence ?? 0) >= PHASE1_CONFIDENCE_THRESHOLD
  );

  if (phase3Ready.length < Math.ceil(phase3Axes.length * PHASE3_UNLOCK_RATIO)) {
    return 3;
  }

  return 4;
}

// ── スタイルレーン適合度 ──────────────────

export function deriveStyleLaneScores(
  axes: Record<string, AxisState>
): Record<string, number> {
  const scores: Record<string, number> = {};

  for (const [laneId, weights] of Object.entries(LANE_AXIS_WEIGHTS)) {
    let score = 0;
    let totalWeight = 0;

    for (const [axisKey, weight] of Object.entries(weights)) {
      const axis = axes[axisKey];
      if (!axis) continue;
      score += axis.value * weight * axis.confidence;
      totalWeight += Math.abs(weight);
    }

    // 0-100 に正規化 (50が中立)
    scores[laneId] = totalWeight > 0
      ? Math.round(((score / totalWeight + 1) / 2) * 100)
      : 50;
  }

  return scores;
}

// ── SavedState への同期 ──────────────────

export function syncToSavedState(
  learningState: SwipeLearningState
): Partial<SavedState> {
  const laneScores = learningState.styleLaneScores;

  // スタイルレーン適合度 → stylePrefs (55以上のみ)
  const stylePrefs: Record<string, number> = {};
  for (const [laneId, score] of Object.entries(laneScores)) {
    if (score > 55) {
      stylePrefs[laneId] = score;
    }
  }

  // 軸からmoodKeywordsを導出
  const moodKeywords: string[] = [];
  const axes = learningState.axes;

  if ((axes.casual_mode?.confidence ?? 0) > 0.3) {
    moodKeywords.push(axes.casual_mode.value < 0 ? "casual" : "mode");
  }
  if ((axes.kirei_street?.confidence ?? 0) > 0.3) {
    moodKeywords.push(axes.kirei_street.value < 0 ? "kirei" : "street");
  }
  if ((axes.feminine_sharp?.confidence ?? 0) > 0.3) {
    moodKeywords.push(axes.feminine_sharp.value < 0 ? "feminine" : "sharp");
  }
  if ((axes.simple_decorative?.confidence ?? 0) > 0.3) {
    moodKeywords.push(axes.simple_decorative.value < 0 ? "simple" : "decorative");
  }
  if ((axes.warm_cool?.confidence ?? 0) > 0.3) {
    moodKeywords.push(axes.warm_cool.value < 0 ? "warm" : "cool");
  }

  // 軸からsilhouettePrefsを導出
  const silhouettePrefs: string[] = [];
  if ((axes.tight_oversized?.confidence ?? 0) > 0.3) {
    if (axes.tight_oversized.value < -0.3) silhouettePrefs.push("slim");
    else if (axes.tight_oversized.value > 0.3) silhouettePrefs.push("oversized");
    else silhouettePrefs.push("regular");
  }
  if ((axes.slim_wide?.confidence ?? 0) > 0.3) {
    if (axes.slim_wide.value > 0.3) silhouettePrefs.push("loose");
  }

  return {
    stylePrefs,
    moodKeywords: moodKeywords.length > 0 ? moodKeywords : undefined,
    silhouettePrefs: silhouettePrefs.length > 0 ? silhouettePrefs : undefined,
  };
}

// ── A/B 比較スワイプ処理 (Phase 4) ──────────

export function processABSwipe(
  state: SwipeLearningState,
  chosenTags: string[],
  rejectedTags: string[],
): SwipeLearningState {
  // 選ばれた方を positive、選ばれなかった方を negative として両方から学習
  const chosenDeltas = getCardAxisDeltas(chosenTags);
  const rejectedDeltas = getCardAxisDeltas(rejectedTags);

  const axisDeltaMap: Record<string, number[]> = {};

  for (const d of chosenDeltas) {
    if (!axisDeltaMap[d.axis]) axisDeltaMap[d.axis] = [];
    axisDeltaMap[d.axis].push(d.delta * 0.5); // positive direction
  }
  for (const d of rejectedDeltas) {
    if (!axisDeltaMap[d.axis]) axisDeltaMap[d.axis] = [];
    axisDeltaMap[d.axis].push(-d.delta * 0.3); // weaker negative
  }

  const newAxes = { ...state.axes };
  for (const [axisKey, deltas] of Object.entries(axisDeltaMap)) {
    if (!newAxes[axisKey]) continue;
    const avg = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    newAxes[axisKey] = updateAxis(newAxes[axisKey], avg, 1.0);
  }

  return {
    ...state,
    axes: newAxes,
    totalSwipes: state.totalSwipes + 1,
    styleLaneScores: deriveStyleLaneScores(newAxes),
    lastSwipedAt: new Date().toISOString(),
  };
}

// ── コンテクスト付きスワイプ ─────────────

export type SwipeContext = "daily" | "date" | "work" | "play";

export const SWIPE_CONTEXT_OPTIONS: { id: SwipeContext; label: string }[] = [
  { id: "daily", label: "日常" },
  { id: "date", label: "デート時" },
  { id: "work", label: "仕事時" },
  { id: "play", label: "遊び時" },
];

export function processSwipeWithContext(
  state: SwipeLearningState,
  cardId: string,
  tags: string[],
  direction: "left" | "right" | "up",
  context: SwipeContext,
): SwipeLearningState {
  // Process normal swipe
  const updated = processSwipe(state, cardId, tags, direction);

  // Also update context-specific axes
  const contextAxes = { ...(updated.contextAxes ?? {}) };
  const ctxState = contextAxes[context] ?? {};

  const directionWeight = direction === "right" ? 1.0 : direction === "left" ? -1.0 : 1.5;
  const deltas = getCardAxisDeltas(tags);
  const axisDeltaMap: Record<string, number[]> = {};
  for (const d of deltas) {
    if (!axisDeltaMap[d.axis]) axisDeltaMap[d.axis] = [];
    axisDeltaMap[d.axis].push(d.delta);
  }

  for (const [axisKey, deltasForAxis] of Object.entries(axisDeltaMap)) {
    const current = ctxState[axisKey] ?? { value: 0, confidence: 0, sampleCount: 0 };
    const avg = deltasForAxis.reduce((a, b) => a + b, 0) / deltasForAxis.length;
    ctxState[axisKey] = updateAxis(current, avg, directionWeight);
  }

  contextAxes[context] = ctxState;

  return {
    ...updated,
    currentContext: context,
    contextAxes,
  };
}

// ── フェーズ進捗率 ───────────────────────

export function getPhaseProgress(
  phase: LearningPhase,
  axes: Record<string, AxisState>
): { ready: number; total: number; ratio: number } {
  const phaseAxes = getAxesForPhase(phase);
  const ready = phaseAxes.filter(
    (a) => (axes[a.key]?.confidence ?? 0) >= PHASE1_CONFIDENCE_THRESHOLD
  ).length;
  return {
    ready,
    total: phaseAxes.length,
    ratio: phaseAxes.length > 0 ? ready / phaseAxes.length : 0,
  };
}

// ── 上位スタイルレーン取得 ────────────────

export function getTopStyleLanes(
  scores: Record<string, number>,
  limit = 3
): { id: string; score: number }[] {
  return Object.entries(scores)
    .filter(([, score]) => score > 50)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id, score]) => ({ id, score }));
}
