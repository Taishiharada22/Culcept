// lib/stargazer/temporalSelfMirror.ts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Temporal Self-Mirror（時間軸の自己鏡）
//
// 脳科学的根拠:
// mPFCは「過去の自分」と「現在の自分」の比較時に最も強く活性化する
// （D'Argembeau et al., 2005）。
// 静的なスコアより「変化量」の方が自己参照処理を強く刺激する。
//
// 設計思想:
// - Spotifyの年次Wrappedを「週次」で実行する
// - 「1週間前のあなた」と「今のあなた」の差分を見せる
// - 差分そのものが最も強いinsightになる
//
// 保存: localStorage（クライアントサイド）
// Key: `aneurasync_weekly_snapshots_v1`
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { TraitAxisKey } from "./traitAxes";
import { getAxisLabels } from "./traitAxes";
import type { ContradictionEntry } from "./contradictionMap";
import type { AxisDistribution } from "./fluctuationEngine";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 1. Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 週次自己スナップショット */
export interface WeeklySelfSnapshot {
  /** ISO week identifier (e.g., "2026-W12") */
  weekId: string;
  /** スナップショット生成日 */
  createdAt: string;

  // ── 矛盾の状態 ──
  /** その週で最も大きかった矛盾 */
  dominantContradiction: {
    axisId: TraitAxisKey;
    axisLabel: string;
    magnitude: number;
    meaning: string;
  } | null;
  /** 矛盾の総数 */
  totalContradictions: number;

  // ── 心の天気 ──
  /** その週で最も多かった内なる天気 */
  dominantWeather: string;

  // ── 揺らぎの状態 ──
  /** 最も揺らいでいた軸 */
  topFluctuatingAxis: {
    axisId: TraitAxisKey;
    axisLabel: string;
    stability: number;
    range: [number, number];
  } | null;
  /** 最も安定していた軸 */
  mostStableAxis: {
    axisId: TraitAxisKey;
    axisLabel: string;
    stability: number;
    center: number;
  } | null;

  // ── 予測精度 ──
  /** 予測分身の精度（0-1） */
  predictionAccuracy: number;
  /** 予測が外れた回数 */
  predictionMisses: number;

  // ── 観測データ ──
  /** 観測回数（その週） */
  observationCount: number;
  /** ストリーク日数（その週末時点） */
  streakDays: number;
  /** 観測品質の平均 */
  avgQuality: number;

  // ── 軸スコアのスナップショット ──
  /** その週の中心スコア（分布の center） */
  axisCenters: Partial<Record<TraitAxisKey, number>>;

  // ── AI生成ナラティブ ──
  /** その週を一言で表す物語的タイトル（AI生成または規則ベース） */
  narrativeArc: string;
}

/** 2つのスナップショットの比較結果 */
export interface TemporalDelta {
  /** 比較元（過去） */
  previousWeek: string;
  /** 比較先（現在） */
  currentWeek: string;
  /** 期間（週数） */
  weekSpan: number;

  // ── 差分ハイライト ──
  /** 最も大きく変化した軸 */
  biggestShift: {
    axisId: TraitAxisKey;
    axisLabel: string;
    previousCenter: number;
    currentCenter: number;
    delta: number;
    direction: string; // "外向的に変化" etc.
  } | null;

  /** 矛盾の変化 */
  contradictionChange: {
    previousCount: number;
    currentCount: number;
    delta: number;
    /** 増加 = 自己理解が深化中 / 減少 = 統合が進行中 */
    interpretation: string;
  };

  /** 予測精度の変化 */
  predictionAccuracyChange: {
    previousAccuracy: number;
    currentAccuracy: number;
    delta: number;
    interpretation: string;
  };

  /** 揺らぎの変化 */
  stabilityChange: {
    moreStable: TraitAxisKey[];
    lessStable: TraitAxisKey[];
    interpretation: string;
  };

  /** 天気の変化 */
  weatherChange: {
    previous: string;
    current: string;
    changed: boolean;
  };

  /** 総合的な変化ナラティブ（日本語） */
  deltaNarrative: string;

  /** 変化の深さスコア（0-1、高いほど大きな変化） */
  changeDepth: number;
}

/** ストレージに保存される全スナップショット */
interface SnapshotStore {
  version: 1;
  snapshots: WeeklySelfSnapshot[];
  lastUpdated: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 2. Snapshot Creation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const STORAGE_KEY = "aneurasync_weekly_snapshots_v1";
const MAX_SNAPSHOTS = 52; // 1年分

/** 現在のISO week を取得 */
export function getCurrentWeekId(date: Date = new Date()): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  const weekNum =
    1 +
    Math.round(
      ((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7
    );
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

export interface SnapshotInput {
  contradictions: ContradictionEntry[];
  totalContradictions: number;
  distributions: AxisDistribution[];
  innerWeather: string;
  predictionAccuracy: number;
  predictionMisses: number;
  observationCount: number;
  streakDays: number;
  avgQuality: number;
}

/**
 * 現在のエンジン出力から週次スナップショットを生成
 */
export function createWeeklySnapshot(
  input: SnapshotInput,
  weekId?: string
): WeeklySelfSnapshot {
  const wid = weekId ?? getCurrentWeekId();

  // 最も大きな矛盾
  const topContradiction = input.contradictions
    .slice()
    .sort((a, b) => b.magnitude - a.magnitude)[0];

  // 最も揺らいでいる軸（stability が最低）
  const sortedByStability = input.distributions
    .filter((d) => d.observationCount >= 3)
    .sort((a, b) => a.stability - b.stability);
  const topFluctuating = sortedByStability[0];

  // 最も安定している軸
  const mostStable = sortedByStability[sortedByStability.length - 1];

  // 軸スコアのスナップショット
  const axisCenters: Partial<Record<TraitAxisKey, number>> = {};
  for (const dist of input.distributions) {
    axisCenters[dist.axis] = dist.center;
  }

  // ナラティブ生成（規則ベース）
  const narrativeArc = generateWeeklyNarrative(input, topContradiction, topFluctuating);

  return {
    weekId: wid,
    createdAt: new Date().toISOString(),
    dominantContradiction: topContradiction
      ? {
          axisId: topContradiction.axisId,
          axisLabel: topContradiction.axisLabel,
          magnitude: topContradiction.magnitude,
          meaning: topContradiction.insight,
        }
      : null,
    totalContradictions: input.totalContradictions,
    dominantWeather: input.innerWeather,
    topFluctuatingAxis: topFluctuating
      ? {
          axisId: topFluctuating.axis,
          axisLabel: getAxisLabels(topFluctuating.axis)?.left ?? topFluctuating.axis,
          stability: topFluctuating.stability,
          range: topFluctuating.range,
        }
      : null,
    mostStableAxis: mostStable
      ? {
          axisId: mostStable.axis,
          axisLabel: getAxisLabels(mostStable.axis)?.left ?? mostStable.axis,
          stability: mostStable.stability,
          center: mostStable.center,
        }
      : null,
    predictionAccuracy: input.predictionAccuracy,
    predictionMisses: input.predictionMisses,
    observationCount: input.observationCount,
    streakDays: input.streakDays,
    avgQuality: input.avgQuality,
    axisCenters,
    narrativeArc,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 3. Temporal Delta Computation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 2つのスナップショットを比較し、差分insightを生成
 *
 * これが「時間軸の自己鏡」の核心。
 * 脳の自己参照処理（mPFC）を最大限に刺激する差分表示。
 */
export function computeTemporalDelta(
  previous: WeeklySelfSnapshot,
  current: WeeklySelfSnapshot
): TemporalDelta {
  const weekSpan = weekIdToNumber(current.weekId) - weekIdToNumber(previous.weekId);

  // ── 最大軸シフト ──
  let biggestShift: TemporalDelta["biggestShift"] = null;
  let maxDelta = 0;

  for (const [axisId, currentCenter] of Object.entries(current.axisCenters)) {
    const previousCenter = previous.axisCenters[axisId as TraitAxisKey];
    if (previousCenter === undefined || currentCenter === undefined) continue;

    const delta = currentCenter - previousCenter;
    if (Math.abs(delta) > Math.abs(maxDelta)) {
      maxDelta = delta;
      const labels = getAxisLabels(axisId as TraitAxisKey);
      const direction =
        delta > 0
          ? `${labels?.right ?? "右極"}寄りに変化`
          : `${labels?.left ?? "左極"}寄りに変化`;
      biggestShift = {
        axisId: axisId as TraitAxisKey,
        axisLabel: labels
          ? `${labels.left} ⇔ ${labels.right}`
          : axisId,
        previousCenter,
        currentCenter,
        delta,
        direction,
      };
    }
  }

  // ── 矛盾の変化 ──
  const contradictionDelta = current.totalContradictions - previous.totalContradictions;
  const contradictionChange = {
    previousCount: previous.totalContradictions,
    currentCount: current.totalContradictions,
    delta: contradictionDelta,
    interpretation:
      contradictionDelta > 0
        ? "矛盾が増えている。自己理解の解像度が上がり、新しい層が見え始めた証拠"
        : contradictionDelta < 0
          ? "矛盾が減っている。内面の統合が進み、一貫した自己像が形成されつつある"
          : "矛盾数は変わらず。同じ構造の中で深掘りが進行中",
  };

  // ── 予測精度の変化 ──
  const accDelta = current.predictionAccuracy - previous.predictionAccuracy;
  const predictionAccuracyChange = {
    previousAccuracy: previous.predictionAccuracy,
    currentAccuracy: current.predictionAccuracy,
    delta: accDelta,
    interpretation:
      accDelta > 0.05
        ? "分身があなたをより正確に理解し始めた。行動パターンが安定している"
        : accDelta < -0.05
          ? "予測が外れ始めた。あなたの中で何かが変化している可能性がある"
          : "予測精度は安定。分身はあなたの現状をよく捉えている",
  };

  // ── 安定度の変化 ──
  const moreStable: TraitAxisKey[] = [];
  const lessStable: TraitAxisKey[] = [];

  for (const [axisId, currentCenter] of Object.entries(current.axisCenters)) {
    // Note: axisCentersしか比較材料がないので、スコア変動を安定度の代理指標にする
    const prevCenter = previous.axisCenters[axisId as TraitAxisKey];
    if (prevCenter === undefined || currentCenter === undefined) continue;
    const movement = Math.abs(currentCenter - prevCenter);
    if (movement > 0.2) {
      lessStable.push(axisId as TraitAxisKey);
    } else if (movement < 0.05) {
      moreStable.push(axisId as TraitAxisKey);
    }
  }

  const stabilityChange = {
    moreStable,
    lessStable,
    interpretation:
      lessStable.length > moreStable.length
        ? "多くの軸が動いている。変化の渦中にいる"
        : moreStable.length > lessStable.length
          ? "ほとんどの軸が安定。内面が落ち着いている時期"
          : "安定と変動が混在。一部の領域で変化が起きている",
  };

  // ── 天気の変化 ──
  const weatherChange = {
    previous: previous.dominantWeather,
    current: current.dominantWeather,
    changed: previous.dominantWeather !== current.dominantWeather,
  };

  // ── 変化の深さスコア ──
  const changeDepth = computeChangeDepth(
    Math.abs(maxDelta),
    Math.abs(contradictionDelta),
    Math.abs(accDelta),
    lessStable.length
  );

  // ── 総合ナラティブ ──
  const deltaNarrative = generateDeltaNarrative(
    weekSpan,
    biggestShift,
    contradictionChange,
    predictionAccuracyChange,
    weatherChange,
    changeDepth
  );

  return {
    previousWeek: previous.weekId,
    currentWeek: current.weekId,
    weekSpan,
    biggestShift,
    contradictionChange,
    predictionAccuracyChange,
    stabilityChange,
    weatherChange,
    deltaNarrative,
    changeDepth,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 4. Storage (localStorage)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 保存されている全スナップショットを取得 */
export function loadSnapshots(): WeeklySelfSnapshot[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const store: SnapshotStore = JSON.parse(raw);
    if (store.version !== 1) return [];
    return store.snapshots;
  } catch {
    return [];
  }
}

/** スナップショットを保存（同じweekIdがあれば上書き） */
export function saveSnapshot(snapshot: WeeklySelfSnapshot): void {
  if (typeof window === "undefined") return;
  try {
    const existing = loadSnapshots();
    const idx = existing.findIndex((s) => s.weekId === snapshot.weekId);
    if (idx >= 0) {
      existing[idx] = snapshot;
    } else {
      existing.push(snapshot);
    }

    // 古いスナップショットを削除（最大52週分）
    const trimmed = existing
      .sort((a, b) => b.weekId.localeCompare(a.weekId))
      .slice(0, MAX_SNAPSHOTS);

    const store: SnapshotStore = {
      version: 1,
      snapshots: trimmed,
      lastUpdated: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Storage full or quota exceeded — silent fail
  }
}

/** 直前のスナップショットを取得 */
export function getPreviousSnapshot(): WeeklySelfSnapshot | null {
  const snapshots = loadSnapshots();
  const currentWeekId = getCurrentWeekId();
  // 現在の週より前のスナップショットを時系列降順で取得
  const previous = snapshots
    .filter((s) => s.weekId < currentWeekId)
    .sort((a, b) => b.weekId.localeCompare(a.weekId));
  return previous[0] ?? null;
}

/** N週前のスナップショットを取得 */
export function getSnapshotByWeeksAgo(weeksAgo: number): WeeklySelfSnapshot | null {
  const snapshots = loadSnapshots();
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() - weeksAgo * 7);
  const targetWeekId = getCurrentWeekId(targetDate);
  return snapshots.find((s) => s.weekId === targetWeekId) ?? null;
}

/** 今週のスナップショットが既にあるか */
export function hasCurrentWeekSnapshot(): boolean {
  const snapshots = loadSnapshots();
  const currentWeekId = getCurrentWeekId();
  return snapshots.some((s) => s.weekId === currentWeekId);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 5. Convenience: Get Full Mirror (Current vs Previous)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface TemporalMirrorResult {
  /** 現在のスナップショット */
  current: WeeklySelfSnapshot;
  /** 比較対象のスナップショット（なければnull） */
  previous: WeeklySelfSnapshot | null;
  /** 差分（previousがあれば計算） */
  delta: TemporalDelta | null;
  /** 利用可能なスナップショット数 */
  totalSnapshots: number;
  /** 比較可能かどうか */
  canCompare: boolean;
}

/**
 * 時間軸の自己鏡を一度に計算
 *
 * 使用例:
 * ```
 * const mirror = getTemporalMirror(currentInput);
 * if (mirror.canCompare) {
 *   // mirror.delta に差分がある → UIに表示
 * }
 * ```
 */
export function getTemporalMirror(input: SnapshotInput): TemporalMirrorResult {
  const current = createWeeklySnapshot(input);

  // 今週分を保存
  saveSnapshot(current);

  const previous = getPreviousSnapshot();
  const allSnapshots = loadSnapshots();

  if (!previous) {
    return {
      current,
      previous: null,
      delta: null,
      totalSnapshots: allSnapshots.length,
      canCompare: false,
    };
  }

  const delta = computeTemporalDelta(previous, current);

  return {
    current,
    previous,
    delta,
    totalSnapshots: allSnapshots.length,
    canCompare: true,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 6. Internal Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function weekIdToNumber(weekId: string): number {
  const match = weekId.match(/^(\d{4})-W(\d{2})$/);
  if (!match) return 0;
  return parseInt(match[1]) * 52 + parseInt(match[2]);
}

function computeChangeDepth(
  maxAxisDelta: number,
  contradictionDelta: number,
  accuracyDelta: number,
  unstableAxesCount: number
): number {
  // 各要素を0-1に正規化して合成
  const axisDepth = Math.min(1, maxAxisDelta / 0.5); // 0.5以上の変化で最大
  const contradictionDepth = Math.min(1, contradictionDelta / 3); // 3個以上の変化で最大
  const accuracyDepth = Math.min(1, accuracyDelta / 0.2); // 20%以上の変化で最大
  const instabilityDepth = Math.min(1, unstableAxesCount / 5); // 5軸以上が不安定で最大

  return (
    axisDepth * 0.3 +
    contradictionDepth * 0.25 +
    accuracyDepth * 0.25 +
    instabilityDepth * 0.2
  );
}

function generateWeeklyNarrative(
  input: SnapshotInput,
  topContradiction: ContradictionEntry | undefined,
  topFluctuating: AxisDistribution | undefined
): string {
  const parts: string[] = [];

  // 観測状態
  if (input.observationCount >= 7) {
    parts.push("毎日観測を続けた週");
  } else if (input.observationCount >= 4) {
    parts.push("断続的に自己を見つめた週");
  } else if (input.observationCount >= 1) {
    parts.push("静かに内面と向き合い始めた週");
  } else {
    parts.push("沈黙の週");
  }

  // 矛盾
  if (topContradiction && topContradiction.magnitude >= 0.5) {
    parts.push(`${topContradiction.axisLabel}に大きな矛盾を抱えた`);
  }

  // 揺らぎ
  if (topFluctuating && topFluctuating.stability < 0.3) {
    const labels = getAxisLabels(topFluctuating.axis);
    if (labels) {
      parts.push(`${labels.left}と${labels.right}の間で揺れた`);
    }
  }

  // 予測精度
  if (input.predictionAccuracy >= 0.8) {
    parts.push("分身の精度が高く、安定していた");
  } else if (input.predictionAccuracy < 0.5 && input.predictionMisses > 0) {
    parts.push("予測が外れた — 変化の兆し");
  }

  return parts.join("。");
}

function generateDeltaNarrative(
  weekSpan: number,
  biggestShift: TemporalDelta["biggestShift"],
  contradictionChange: TemporalDelta["contradictionChange"],
  predictionAccuracyChange: TemporalDelta["predictionAccuracyChange"],
  weatherChange: TemporalDelta["weatherChange"],
  changeDepth: number
): string {
  const timeLabel = weekSpan === 1 ? "先週" : `${weekSpan}週前`;
  const parts: string[] = [];

  // 変化の深さに応じた導入
  if (changeDepth >= 0.7) {
    parts.push(`${timeLabel}から大きな変化が起きている`);
  } else if (changeDepth >= 0.3) {
    parts.push(`${timeLabel}からいくつかの変化が見える`);
  } else {
    parts.push(`${timeLabel}と比べて、大きな変化はない`);
  }

  // 最大シフト
  if (biggestShift && Math.abs(biggestShift.delta) >= 0.15) {
    parts.push(
      `最も動いたのは${biggestShift.axisLabel}（${biggestShift.direction}）`
    );
  }

  // 矛盾
  if (contradictionChange.delta !== 0) {
    parts.push(contradictionChange.interpretation);
  }

  // 天気
  if (weatherChange.changed) {
    parts.push(
      `内なる天気が「${weatherChange.previous}」から「${weatherChange.current}」に変わった`
    );
  }

  return parts.join("。") + "。";
}
