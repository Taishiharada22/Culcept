/**
 * Session Diff — Wall 5 「セッション間変化の気づき」
 *
 * Phase 2+（differenceAccess: true）で、前セッションとの軸変化を
 * Alter の内部参照として prompt に注入する。
 *
 * 設計原則:
 * - 数値ではなく体感言語（P0 存在論転換に準拠）
 * - 表出禁止（ユーザーに直接見せない）
 * - 変化が小さすぎる場合は注入しない（ノイズ防止）
 * - 最大3軸まで（プロンプト肥大化防止）
 */
import "server-only";

import type { TraitAxisKey, TraitAxisDef } from "./traitAxes";
import { TRAIT_AXES } from "./traitAxes";

/** 軸キーから定義を引く */
function findAxis(key: TraitAxisKey): TraitAxisDef | undefined {
  return TRAIT_AXES.find(a => a.id === key);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface AxisDelta {
  axis: TraitAxisKey;
  label: string;
  previous: number;
  current: number;
  delta: number;
  direction: "up" | "down";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 変化量がこの閾値未満の軸は無視する */
const MIN_DELTA_THRESHOLD = 0.1;
/** 注入する最大軸数 */
const MAX_DIFF_AXES = 3;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Core
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 前セッションと今セッションの軸スコアを比較し、
 * 有意な変化を抽出する。
 */
export function computeSessionDiff(
  previousScores: Partial<Record<TraitAxisKey, number>>,
  currentScores: Partial<Record<TraitAxisKey, number>>,
): AxisDelta[] {
  const deltas: AxisDelta[] = [];

  for (const [key, currentScore] of Object.entries(currentScores)) {
    const axisKey = key as TraitAxisKey;
    const previousScore = previousScores[axisKey];
    if (previousScore === undefined || currentScore === undefined) continue;

    const delta = currentScore - previousScore;
    if (Math.abs(delta) < MIN_DELTA_THRESHOLD) continue;

    const axisMeta = findAxis(axisKey);
    if (!axisMeta) continue;

    deltas.push({
      axis: axisKey,
      label: `${axisMeta.labelLeft}⇄${axisMeta.labelRight}`,
      previous: previousScore,
      current: currentScore,
      delta,
      direction: delta > 0 ? "up" : "down",
    });
  }

  // 変化量の大きい順にソート
  deltas.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  return deltas.slice(0, MAX_DIFF_AXES);
}

/**
 * 軸変化を体感言語に変換する。
 *
 * 例: independence_vs_harmony が -0.2 → "前より、周りとの調和を大事にしている感じがする"
 *
 * 変換ルール:
 * - 軸の左極・右極のラベルを使って方向を表現
 * - delta の大きさで強度を表現（0.1-0.2: 少し、0.2+: はっきり）
 */
function describeAxisChange(d: AxisDelta): string {
  const axisMeta = findAxis(d.axis);
  if (!axisMeta) return "";

  const intensity = Math.abs(d.delta) >= 0.2 ? "はっきりと" : "少しだけ";
  // up = 右極寄り、down = 左極寄り
  const toward = d.direction === "up" ? axisMeta.labelRight : axisMeta.labelLeft;
  return `前回より${intensity}、「${toward}」寄りに動いている気がする。`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Prompt Block
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * セッション間の変化をプロンプトブロックとして生成する。
 *
 * @returns null: 有意な変化がない場合
 */
export function buildSessionDiffPromptBlock(
  previousScores: Partial<Record<TraitAxisKey, number>>,
  currentScores: Partial<Record<TraitAxisKey, number>>,
): string | null {
  const deltas = computeSessionDiff(previousScores, currentScores);
  if (deltas.length === 0) return null;

  const lines: string[] = [];
  lines.push("# 前回からの変化（内部参照 — 表出禁止）");
  lines.push("");

  for (const d of deltas) {
    const description = describeAxisChange(d);
    if (description) {
      lines.push(`- ${description}`);
    }
  }

  lines.push("");
  lines.push("この変化を直接指摘しない。ただし応答の仮説や問いかけの方向に反映させる。");
  lines.push("変化の理由をユーザーに聞かない。自然に観測する。");

  return lines.join("\n");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Analytics
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface SessionDiffAnalytics {
  session_diff_injected: boolean;
  session_diff_axes_count: number;
  session_diff_max_delta: number;
  session_diff_axes: string[];
}

export function buildSessionDiffAnalytics(
  deltas: AxisDelta[],
  injected: boolean,
): SessionDiffAnalytics {
  return {
    session_diff_injected: injected,
    session_diff_axes_count: deltas.length,
    session_diff_max_delta: deltas.length > 0 ? Math.abs(deltas[0].delta) : 0,
    session_diff_axes: deltas.map(d => d.axis),
  };
}
