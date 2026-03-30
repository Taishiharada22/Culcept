/**
 * Micro Stargazer — HOME 内に差し込む深層観測ブリッジ
 *
 * 既存 questionVariants.ts の QuestionVariant をそのまま使い、
 * HOME の会話フロー向けにケイデンス管理・返答生成・進捗追跡を行う。
 *
 * 設計原則:
 *  - 新しい質問プールを作らない（questionVariants.ts を直接利用）
 *  - 1日2問、前日と同じ軸は避ける
 *  - 7日以内に同じバリアントを繰り返さない
 *  - score 範囲で軸ごとのロボ返答を生成
 */

import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";
import {
  getVariantsByLayer,
  CONTINUOUS_OBSERVATION_AXES,
  type QuestionVariant,
} from "@/lib/stargazer/questionVariants";

/* ═══════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════ */

export interface MicroStargazerAnswer {
  variantId: string;
  axisId: TraitAxisKey;
  selectedId: string;
  score: number;
  date: string;
  answeredAt: string;
}

export interface AxisProgress {
  totalObservations: number;
  lastObservedDate: string | null;
  recentVariantIds: string[];   // 直近7日で使用したバリアントID
  answers: MicroStargazerAnswer[];
}

export interface MicroStargazerProgress {
  axes: Partial<Record<TraitAxisKey, AxisProgress>>;
  totalSessions: number;
  lastAxisId: TraitAxisKey | null;
  lastAxisDate: string | null;
}

/* ═══════════════════════════════════════════════
   Storage
   ═══════════════════════════════════════════════ */

const PROGRESS_KEY = "culcept_micro_sg_v1";

export function loadMicroProgress(): MicroStargazerProgress {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { axes: {}, totalSessions: 0, lastAxisId: null, lastAxisDate: null };
}

export function saveMicroProgress(p: MicroStargazerProgress): void {
  const data = JSON.stringify(p);
  try {
    localStorage.setItem(PROGRESS_KEY, data);
  } catch {
    // Quota exceeded — trim answers and retry
    trimMicroProgress(p);
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
    } catch {
      // Last resort: clear all answers, keep metadata only
      for (const axisId of Object.keys(p.axes) as TraitAxisKey[]) {
        const axis = p.axes[axisId];
        if (axis) { axis.answers = []; axis.recentVariantIds = axis.recentVariantIds.slice(0, 3); }
      }
      try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(p)); } catch { /* give up */ }
    }
  }
}

function trimMicroProgress(p: MicroStargazerProgress): void {
  for (const axisId of Object.keys(p.axes) as TraitAxisKey[]) {
    const axis = p.axes[axisId];
    if (axis) {
      if (axis.answers.length > 10) axis.answers = axis.answers.slice(-10);
      if (axis.recentVariantIds.length > 5) axis.recentVariantIds = axis.recentVariantIds.slice(0, 5);
    }
  }
}

export function saveMicroAnswer(
  progress: MicroStargazerProgress,
  answer: MicroStargazerAnswer,
): MicroStargazerProgress {
  const axis = progress.axes[answer.axisId] ?? {
    totalObservations: 0,
    lastObservedDate: null,
    recentVariantIds: [],
    answers: [],
  };

  axis.totalObservations += 1;
  axis.lastObservedDate = answer.date;
  axis.recentVariantIds = [
    answer.variantId,
    ...axis.recentVariantIds.filter((id) => id !== answer.variantId),
  ].slice(0, 7);
  axis.answers = [...axis.answers, answer].slice(-30);

  const updated: MicroStargazerProgress = {
    ...progress,
    axes: { ...progress.axes, [answer.axisId]: axis },
    lastAxisId: answer.axisId,
    lastAxisDate: answer.date,
  };

  saveMicroProgress(updated);
  return updated;
}

/* ═══════════════════════════════════════════════
   Seed-based shuffle
   ═══════════════════════════════════════════════ */

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function seededShuffle<T>(arr: T[], seed: number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = (seed + i * 31) % (i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/* ═══════════════════════════════════════════════
   Question Selection
   ═══════════════════════════════════════════════ */

/**
 * HOME に差し込む Micro Stargazer 質問を2問選出
 *
 * ルール:
 * 1. 前日と同じ軸を避ける
 * 2. 観測回数が少ない軸を優先
 * 3. 同一軸内で過去7日に使っていないバリアントを選ぶ
 * 4. date seed でシャッフル
 */
export function selectMicroQuestions(
  date: string,
  progress: MicroStargazerProgress,
): QuestionVariant[] {
  const seed = hashStr(date);
  const stateVariants = getVariantsByLayer("state");

  // 1. 軸ごとにグルーピング
  const byAxis = new Map<TraitAxisKey, QuestionVariant[]>();
  for (const v of stateVariants) {
    if (!CONTINUOUS_OBSERVATION_AXES.includes(v.axisId)) continue;
    const list = byAxis.get(v.axisId) ?? [];
    list.push(v);
    byAxis.set(v.axisId, list);
  }

  // 2. 前日と同じ軸を除外
  const yesterday = getYesterday(date);
  let eligibleAxes = CONTINUOUS_OBSERVATION_AXES.filter((axisId) => {
    const ap = progress.axes[axisId];
    return !(ap?.lastObservedDate === yesterday || ap?.lastObservedDate === date);
  });

  // フォールバック: 全軸除外されたら全開放
  if (eligibleAxes.length === 0) {
    eligibleAxes = [...CONTINUOUS_OBSERVATION_AXES];
  }

  // 3. 観測回数が少ない順にソート + seed シャッフル
  const sorted = eligibleAxes
    .map((axisId) => ({
      axisId,
      count: progress.axes[axisId]?.totalObservations ?? 0,
    }))
    .sort((a, b) => a.count - b.count);

  // 同じ count のグループ内を seed でシャッフル
  const shuffled = seededShuffle(sorted, seed);
  // count 少ないものを前に
  shuffled.sort((a, b) => a.count - b.count);

  // 4. 2軸を選出 — カテゴリバランスを保証（relationship + emotional から各1つ）
  const RELATIONSHIP_AXES = new Set(["intimacy_pace", "boundary_awareness", "independence_vs_harmony", "public_private_gap"]);
  const relAxes = shuffled.filter((s) => RELATIONSHIP_AXES.has(s.axisId));
  const emoAxes = shuffled.filter((s) => !RELATIONSHIP_AXES.has(s.axisId));

  const selectedAxes: TraitAxisKey[] = [];
  if (relAxes.length > 0 && emoAxes.length > 0) {
    // 各カテゴリから1つずつ
    selectedAxes.push(relAxes[0].axisId, emoAxes[0].axisId);
  } else {
    // フォールバック: 片方が空なら上位2つ
    selectedAxes.push(...shuffled.slice(0, 2).map((s) => s.axisId));
  }

  // 5. 各軸からバリアントを1つ選ぶ（未使用優先）
  const results: QuestionVariant[] = [];
  for (const axisId of selectedAxes) {
    const variants = byAxis.get(axisId) ?? [];
    if (variants.length === 0) continue;

    const ap = progress.axes[axisId];
    const recentIds = new Set(ap?.recentVariantIds ?? []);

    // 未使用バリアントを優先
    const unused = variants.filter((v) => !recentIds.has(v.id));
    const pool = unused.length > 0 ? unused : variants;
    const picked = pool[seed % pool.length];
    if (picked) results.push(picked);
  }

  return results;
}

/**
 * Depth-aware Micro Stargazer 質問選出
 *
 * サーバー側で算出された depthReadiness (1-6) を受け取り、
 * ユーザーの深度に応じたレイヤーの質問のみを候補にする。
 *
 * - depth 1-2: state レイヤーのみ（今日の状態観測）
 * - depth 3-4: state + context_bound（文脈紐づき質問も含む）
 * - depth 5-6: 全レイヤー（delta 含む全質問）
 *
 * maxDepth が未指定の場合は selectMicroQuestions と同じ動作（state のみ）
 */
export function selectMicroQuestionsWithDepth(
  date: string,
  progress: MicroStargazerProgress,
  maxDepth?: number,
): QuestionVariant[] {
  // maxDepth 未指定時は既存関数と同じ挙動
  if (maxDepth == null || maxDepth <= 2) {
    return selectMicroQuestions(date, progress);
  }

  const seed = hashStr(date);

  // Depth に応じて利用可能なレイヤーを決定
  const allowedLayers: Array<"state" | "context_bound" | "delta"> =
    maxDepth <= 4
      ? ["state", "context_bound"]
      : ["state", "context_bound", "delta"];

  // 各レイヤーのバリアントを集約
  const allVariants: QuestionVariant[] = [];
  for (const layer of allowedLayers) {
    allVariants.push(...getVariantsByLayer(layer));
  }

  // 1. 軸ごとにグルーピング（対象軸のみ）
  const byAxis = new Map<TraitAxisKey, QuestionVariant[]>();
  for (const v of allVariants) {
    if (!CONTINUOUS_OBSERVATION_AXES.includes(v.axisId)) continue;
    const list = byAxis.get(v.axisId) ?? [];
    list.push(v);
    byAxis.set(v.axisId, list);
  }

  // 2. 前日と同じ軸を除外
  const yesterday = getYesterday(date);
  let eligibleAxes = CONTINUOUS_OBSERVATION_AXES.filter((axisId) => {
    const ap = progress.axes[axisId];
    return !(ap?.lastObservedDate === yesterday || ap?.lastObservedDate === date);
  });

  // フォールバック: 全軸除外されたら全開放
  if (eligibleAxes.length === 0) {
    eligibleAxes = [...CONTINUOUS_OBSERVATION_AXES];
  }

  // 3. 観測回数が少ない順にソート + seed シャッフル
  const sorted = eligibleAxes
    .map((axisId) => ({
      axisId,
      count: progress.axes[axisId]?.totalObservations ?? 0,
    }))
    .sort((a, b) => a.count - b.count);

  const shuffled = seededShuffle(sorted, seed);
  shuffled.sort((a, b) => a.count - b.count);

  // 4. 2軸を選出 — カテゴリバランスを保証（relationship + emotional から各1つ）
  const RELATIONSHIP_AXES_DEPTH = new Set(["intimacy_pace", "boundary_awareness", "independence_vs_harmony", "public_private_gap"]);
  const relAxesD = shuffled.filter((s) => RELATIONSHIP_AXES_DEPTH.has(s.axisId));
  const emoAxesD = shuffled.filter((s) => !RELATIONSHIP_AXES_DEPTH.has(s.axisId));

  const selectedAxes: TraitAxisKey[] = [];
  if (relAxesD.length > 0 && emoAxesD.length > 0) {
    selectedAxes.push(relAxesD[0].axisId, emoAxesD[0].axisId);
  } else {
    selectedAxes.push(...shuffled.slice(0, 2).map((s) => s.axisId));
  }

  // 5. 各軸からバリアントを1つ選ぶ（未使用優先、深いレイヤー優先）
  const results: QuestionVariant[] = [];
  for (const axisId of selectedAxes) {
    const variants = byAxis.get(axisId) ?? [];
    if (variants.length === 0) continue;

    const ap = progress.axes[axisId];
    const recentIds = new Set(ap?.recentVariantIds ?? []);

    // 未使用バリアントを優先
    const unused = variants.filter((v) => !recentIds.has(v.id));
    const pool = unused.length > 0 ? unused : variants;

    // 深いレイヤーの質問を優先的に選ぶ（depth が高い場合）
    const layerPriority: Record<string, number> = {
      delta: 3,
      context_bound: 2,
      state: 1,
    };
    const sortedPool = [...pool].sort(
      (a, b) => (layerPriority[b.layer] ?? 0) - (layerPriority[a.layer] ?? 0),
    );

    // seed で深いレイヤーを優先しつつもバリエーションを維持
    // 上位半分から seed で選ぶ
    const topHalf = sortedPool.slice(0, Math.max(1, Math.ceil(sortedPool.length / 2)));
    const picked = topHalf[seed % topHalf.length];
    if (picked) results.push(picked);
  }

  return results;
}

function getYesterday(dateStr: string): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* ═══════════════════════════════════════════════
   Robot Reactions (score-range based)
   ═══════════════════════════════════════════════ */

/** 軸ごとのスコア範囲に応じたロボ返答 */
const AXIS_REACTIONS: Record<string, { low: string; mid: string; high: string }> = {
  intimacy_pace: {
    low: "今日は距離を置きたかったんだね。そういう日も記録しておく。",
    mid: "ちょうどいい距離感だったか。その感覚、覚えておくよ。",
    high: "人と近くいたい日だったんだね。その揺れ、面白い。",
  },
  boundary_awareness: {
    low: "境界線が柔らかかった日か。そこも観測のうち。",
    mid: "ほどよく引けてたんだね。バランス取れてる。",
    high: "しっかり守れてた。自分の空間を大事にしてるね。",
  },
  emotional_variability: {
    low: "安定してたんだね。穏やかな一日だったか。",
    mid: "少し揺れがあったか。その波も記録しておくね。",
    high: "けっこう揺れた日だったんだね。感じたまま、残しておく。",
  },
  stress_isolation_vs_social: {
    low: "一人で回復するタイプか。その傾向、見えてきてる。",
    mid: "状況次第って感じだね。その柔軟さも特徴。",
    high: "人と一緒の方が回復するんだね。前回と少し違うかも。",
  },
  reassurance_need: {
    low: "自分の判断で十分だった。自立してるね。",
    mid: "少しだけ確認がほしかったか。その揺れ、残しておく。",
    high: "確認がほしい日だったんだね。その感覚も大事なデータ。",
  },
  independence_vs_harmony: {
    low: "自分のペースで過ごせたんだね。いい日だ。",
    mid: "少し周囲に合わせた部分があったか。そのバランスも見てる。",
    high: "かなり合わせてたんだね。無理してなかった？",
  },
  public_private_gap: {
    low: "素の自分でいられたんだね。それが一番いい。",
    mid: "少し隠してた部分があったか。そこも軌道に載せておく。",
    high: "表と中がだいぶ違った日だったんだね。記録しておく。",
  },
  emotional_regulation: {
    low: "うまくコントロールできてた。安定してるね。",
    mid: "少し難しい場面があったか。でも対処できてる。",
    high: "感情が溢れやすかった日だね。そこも残しておく。",
  },
};

const FALLBACK_REACTION = "…記録した。";

export function getReactionForScore(axisId: string, score: number): string {
  const reactions = AXIS_REACTIONS[axisId];
  if (!reactions) return FALLBACK_REACTION;

  if (score <= -0.3) return reactions.low;
  if (score >= 0.3) return reactions.high;
  return reactions.mid;
}

/* ═══════════════════════════════════════════════
   Context-Aware Reactions
   ═══════════════════════════════════════════════ */

export interface ReactionContext {
  /** 同じ軸の前回スコア */
  previousScore?: number;
  /** 時間帯 */
  timeOfDay?: "morning" | "afternoon" | "night";
  /** これまでの総セッション数 */
  sessionCount?: number;
  /** 観測時のエネルギー状態 */
  energy?: string;
}

/**
 * 文脈を考慮したリアクションを生成する。
 * 基本リアクション（getReactionForScore）を土台に、
 * 変化・時間帯・セッション数・エネルギーで表現を調整する。
 */
export function getContextualReaction(
  axisId: string,
  score: number,
  context: ReactionContext,
): string {
  const base = getReactionForScore(axisId, score);

  const parts: string[] = [];

  // --- エネルギーが低い場合は短く優しく返す ---
  if (context.energy === "low" || context.energy === "very_low") {
    // 変化検知だけ短文で付ける
    if (
      context.previousScore !== undefined &&
      Math.abs(score - context.previousScore) > 0.3
    ) {
      return "少し変化があったね。無理しないで。";
    }
    return "…うん、受け取った。";
  }

  // --- 初めてこの軸を観測した場合 ---
  if (context.previousScore === undefined && context.sessionCount !== undefined && context.sessionCount > 0) {
    parts.push("初めてこの角度から見たね。");
  }

  // --- 前回との差分が大きい場合 ---
  if (context.previousScore !== undefined) {
    const delta = Math.abs(score - context.previousScore);
    if (delta > 0.3) {
      if (score > context.previousScore) {
        parts.push("前回とだいぶ違うね。何か変化があった？");
      } else {
        parts.push("前回から揺れたね。何かあった？");
      }
    }
  }

  // --- セッション数が多く、スコアが安定している場合 ---
  if (
    context.sessionCount !== undefined &&
    context.sessionCount > 10 &&
    context.previousScore !== undefined &&
    Math.abs(score - context.previousScore) <= 0.1
  ) {
    parts.push("この軸はだいぶ安定してきたね。");
  }

  // --- 基本リアクションを追加 ---
  parts.push(base);

  // --- 夜は内省的なトーンを付加 ---
  if (context.timeOfDay === "night") {
    parts.push("夜だから、少し深いところまで届いたかもしれない。");
  }

  return parts.join(" ");
}

/* ═══════════════════════════════════════════════
   Transition Lines
   ═══════════════════════════════════════════════ */

const TRANSITION_LINES = [
  "ちょっとだけ、別の角度から見たい。",
  "少し深いところ、聞いてもいい？",
  "いつもと違う質問、一つだけ。",
  "ここから少し、内側の話。",
  "表面じゃない部分、見てみたい。",
];

export function getTransitionLine(sessionCount: number, date: string): string {
  const seed = hashStr(date);
  return TRANSITION_LINES[(seed + sessionCount) % TRANSITION_LINES.length];
}

/* ═══════════════════════════════════════════════
   Trajectory Closings
   ═══════════════════════════════════════════════ */

const TRAJECTORY_CLOSINGS = [
  "今日の差分を記録した。",
  "前回との揺らぎを更新した。",
  "このテーマの輪郭が少し深くなった。",
  "反応の変化を受け取った。",
  "今日の状態を軌道に追記した。",
];

export function getTrajectoryClosing(sessionCount: number, date: string): string {
  const seed = hashStr(date);
  return TRAJECTORY_CLOSINGS[(seed + sessionCount) % TRAJECTORY_CLOSINGS.length];
}
