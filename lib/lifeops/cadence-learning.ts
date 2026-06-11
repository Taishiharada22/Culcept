/**
 * Life Ops L-9 — 結果→周期更新（cadence 学習・**pure・no-DB・no-外部**・barrel 非 export）
 *
 * 設計: docs/life-ops-l9-cadence-learning-mini-design.md / boundary §2 L-9 / Appendix A.7・A.12 / cadence-model(L-2)
 *
 * 役割: **完了履歴**（注入）から個人の実績間隔を学習して L-2 の default 周期を override し、最新完了日を更新する pure 層。
 *   「観測→提案→許可→実行→**学習**」ループを閉じる。median で外れ値に頑健・サンプル不足は学習しない（捏造しない）。
 *
 * 厳守:
 *   - pure・deterministic・**横エンジン非 import**・no-DB・no-UI・no-外部・**完了履歴は注入**（実収集は CEO ゲート）・barrel 非 export。
 *   - サンプル不足（gap < MIN_LEARN_SAMPLES）→ learnedIntervalDays=null＝default 維持（L-2 unknown 精神）。
 */

import { daysBetween, type BeautyMenu, type CadenceSpec } from "./cadence-model";

/** 完了イベント（注入・実データ源は別）。 */
export interface CompletionEvent {
  readonly categoryId: string;
  readonly menu?: BeautyMenu | null;
  readonly completedAtISO: string;
}

/** 学習結果（個人間隔 + 最新完了日）。 */
export interface CadenceLearning {
  readonly lastCompletedAtISO: string | null;
  readonly learnedIntervalDays: number | null;
  readonly sampleCount: number;
}

/** gap≥2（完了3回以上）で学習。1 回の間隔だけでは捏造しない。 */
export const MIN_LEARN_SAMPLES = 2;

/** 昇順 sorted 配列の median。 */
function median(sortedAsc: readonly number[]): number {
  const n = sortedAsc.length;
  const mid = Math.floor(n / 2);
  return n % 2 === 1 ? sortedAsc[mid] : (sortedAsc[mid - 1] + sortedAsc[mid]) / 2;
}

/**
 * L-9: 完了履歴 → 個人間隔の学習（pure）。
 *   完了を昇順に並べ、連続 gap の median を学習間隔とする。gap < MIN_LEARN_SAMPLES → null（default 維持・捏造しない）。
 */
export function learnCadence(history: readonly CompletionEvent[]): CadenceLearning {
  const dated = history
    .map((e) => ({ e, t: Date.parse(e.completedAtISO) }))
    .filter((x) => !Number.isNaN(x.t)) // 不正 ISO 除外
    .sort((a, b) => a.t - b.t);
  if (dated.length === 0) return { lastCompletedAtISO: null, learnedIntervalDays: null, sampleCount: 0 };

  const lastCompletedAtISO = dated[dated.length - 1].e.completedAtISO;
  const gaps: number[] = [];
  for (let i = 1; i < dated.length; i++) {
    const g = daysBetween(dated[i - 1].e.completedAtISO, dated[i].e.completedAtISO);
    if (g !== null && g > 0) gaps.push(g); // 同日(0)は除外
  }
  const learnedIntervalDays =
    gaps.length >= MIN_LEARN_SAMPLES ? Math.round(median([...gaps].sort((a, b) => a - b))) : null;
  return { lastCompletedAtISO, learnedIntervalDays, sampleCount: gaps.length };
}

/**
 * L-9: 学習間隔で L-2 base spec を personalize（pure）。
 *   learnedIntervalDays が正なら typicalIntervalDays を上書き、なければ base（default）のまま。
 */
export function personalizeCadenceSpec(base: CadenceSpec, learning: CadenceLearning): CadenceSpec {
  return learning.learnedIntervalDays !== null && learning.learnedIntervalDays > 0
    ? { ...base, typicalIntervalDays: learning.learnedIntervalDays }
    : base;
}
