/**
 * 横 R2 — Feedback → Cadence Merge（**pure・cap pipeline 最上流**・barrel 非 export）
 *
 * 設計: docs/life-ops-feedback-cadence-merge-a4-c14-mini-design.md
 *
 * 役割: done feedback 由来の `CadenceObservation[]`（c13 `feedbackToCadence` 出力）を、
 *   候補生成入力 `LifeOpsInputs.cadenceObservations` へ **key（categoryId:menu）単位で合流**させる pure helper。
 *
 * 厳守:
 *   - **同 key は lastCompletedAtISO の新しい方が勝つ**（done=事実が宣言より新しければ更新・古ければ宣言維持・
 *     null(unknown) は日付に必ず負ける）。union（片側のみの key は残す）。
 *   - **0 件は同一参照で no-op**（静かに・決定論）。入力を mutation しない。
 *   - 出力は CadenceObservation（enum+ISO）のみ＝raw/PII の経路なし。**cap（raw input cap）より前に置く**（c7 順序）。
 */

import type { CadenceObservation } from "../../../lifeops/candidate-types";
import type { LifeOpsInputs } from "../../../lifeops/candidate-collector";

function keyOf(c: CadenceObservation): string {
  return `${c.categoryId}:${c.menu ?? ""}`;
}

function newer(a: string | null, b: string | null): string | null {
  if (a === null) return b;
  if (b === null) return a;
  return Date.parse(b) > Date.parse(a) ? b : a;
}

/**
 * A-4-c14: feedback 由来 cadence を inputs.cadenceObservations へ合流（pure・no-op は同一参照）。
 */
export function mergeCadenceIntoLifeOpsInputs(inputs: LifeOpsInputs, feedbackCadence: readonly CadenceObservation[]): LifeOpsInputs {
  if (feedbackCadence.length === 0) return inputs; // 0 件は静かに（同一参照）

  const merged = new Map<string, CadenceObservation>();
  for (const c of inputs.cadenceObservations ?? []) merged.set(keyOf(c), c);
  for (const f of feedbackCadence) {
    const k = keyOf(f);
    const prev = merged.get(k);
    if (!prev) {
      merged.set(k, f);
      continue;
    }
    const winner = newer(prev.lastCompletedAtISO, f.lastCompletedAtISO);
    merged.set(k, winner === prev.lastCompletedAtISO ? prev : { ...prev, ...f, lastCompletedAtISO: winner });
  }
  return { ...inputs, cadenceObservations: [...merged.values()] };
}
