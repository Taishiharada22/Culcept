/**
 * Life Ops — Habit Engine（成長/仕事/学習・**pure・no-DB・no-外部**・barrel 非 export）
 *
 * 設計: docs/life-ops-habit-growth-mini-design.md / boundary §2 / Appendix A.6 群6 / cadence-model（対比）/ candidate-types
 *
 * 役割: cadence（前回→経過）と**別の時間構造**。「**今週の目標に対するペース・連続性**」で判定し、
 *   遅れ/中断でも**低圧（責めない）に「軽く戻す」候補**を出す habit engine。met/on_track は出さない（良い流れを邪魔しない）。
 *
 * 厳守:
 *   - pure・deterministic・**横エンジン非 import**・no-DB・no-UI・no-外部・状態は注入（実績収集=CEO ゲート）・barrel 非 export。
 *   - **責めない**: 文言は presenter が低圧化。やるべき/遅れ/未達/サボ を出さない（候補は ease_in/restart/gentle_restart のみ）。
 *   - cadence candidate と混同しない（dueReason.kind="habit"）。
 */

import { getCategorySpec } from "./category-model";
import { buildHabitNeuronContext, type NeuronSelection } from "./growth-neuron";
import type { LifeOpsCandidate } from "./candidate-types";

/** 習慣の注入状態。 */
export interface HabitObservation {
  readonly categoryId: string;
  readonly weeklyTarget: number; // 今週やりたい回数
  readonly doneThisWeek: number; // 今週の実績
  readonly daysSinceLast: number | null; // 前回からの日数（null=記録なし）
  readonly weekElapsedRatio: number; // 0..1（週の経過: 月曜0→日曜1）
  /** neuron 枝の構造化選択（valueId 参照のみ・taxonomy 外は drop）。判定に影響しない（文言文脈のみ）。 */
  readonly neuronSelections?: readonly NeuronSelection[];
}

export type HabitPhase = "met" | "on_track" | "ease_in" | "restart" | "gentle_restart";

export interface HabitStatus {
  readonly phase: HabitPhase;
  readonly remaining: number;
}

const RESTART_GAP_DAYS = 7; // 1週空いた
const GENTLE_RESTART_GAP_DAYS = 14; // 大きく空いた（連続中断的）

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/**
 * 週目標に対するペース・連続性で habit phase を判定（pure）。
 *   met（達成）/ on_track（ペース内）は出さない。gap で restart、週後半のペース遅れで ease_in。
 */
export function assessHabit(obs: HabitObservation): HabitStatus {
  const remaining = Math.max(0, obs.weeklyTarget - obs.doneThisWeek);
  if (!(obs.weeklyTarget > 0) || remaining === 0) return { phase: "met", remaining };
  const g = obs.daysSinceLast;
  if (g !== null && g >= GENTLE_RESTART_GAP_DAYS) return { phase: "gentle_restart", remaining };
  if (g !== null && g >= RESTART_GAP_DAYS) return { phase: "restart", remaining };
  const w = clamp01(obs.weekElapsedRatio);
  const behind = obs.doneThisWeek < obs.weeklyTarget * w;
  if (behind && w >= 0.5) return { phase: "ease_in", remaining };
  return { phase: "on_track", remaining };
}

/**
 * habit observation[] → LifeOpsCandidate[]（pure）。
 *   ease_in/restart/gentle_restart のみ候補化（met/on_track は skip＝良い流れを邪魔しない）。順序は入力安定（低圧）。
 */
export function generateHabitCandidates(observations: readonly HabitObservation[]): readonly LifeOpsCandidate[] {
  const out: LifeOpsCandidate[] = [];
  for (const obs of observations) {
    const status = assessHabit(obs);
    if (status.phase === "met" || status.phase === "on_track") continue; // 出さない（narrowing）
    const cat = getCategorySpec(obs.categoryId);
    if (!cat) continue; // L-1 未定義
    const neuron = buildHabitNeuronContext(obs.categoryId, obs.neuronSelections ?? []); // taxonomy 検証済のみ
    out.push({
      category: cat.id,
      menu: null,
      dueReason: {
        kind: "habit",
        phase: status.phase, // ease_in | restart | gentle_restart（narrowed）
        weeklyTarget: obs.weeklyTarget,
        doneThisWeek: obs.doneThisWeek,
        remaining: status.remaining,
        ...(neuron ? { neuron } : {}), // 無ければ省略＝従来文言（後方互換）
      },
      suggestedWindow: null,
      placeQuery: cat.placeQueryHint,
      permissionLevelHint: cat.defaultMaxLevelHint,
      riskFlags: cat.typicalRiskFlags,
    });
  }
  return out;
}
