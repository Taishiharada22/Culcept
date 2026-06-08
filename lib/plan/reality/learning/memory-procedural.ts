/**
 * Reality Control OS — R1-5 Procedural Memory（**pure・no-DB**・barrel 非 export）
 *
 * 設計: docs/reality-secretary-os-unbuilt-roadmap.md（R1-5）/ memory-model.ts（R1-1）/ CEO 補正（4 signal 分解）
 *
 * 役割: 「うまくいった手順」を **断定しない**。CEO 補正に従い `accept` を成功と短絡せず、4 signal を分離する:
 *   - accepted: その場で採用された（M1 accept・evidence>0）
 *   - completed: 実際に完了した → **PRM レーンに completion data なし＝常に "unknown"（捏造しない）**
 *   - confirmed: 本人が良かったと認めた（R1-3 correction の confirmed と join・R1-5 単体では既定 false）
 *   - stable: 複数回・反証非支配・correction なし＝再利用**仮説**
 *   produce するのは **procedural hypothesis** のみ:「この文脈ではこの進め方が採用されやすいかもしれない」まで。
 *
 * 厳守: 「有効」「うまくいった」「完了」を断定しない・completed は常に unknown・certainty ≤tentative・
 *   adoption/deferral のみ（＝選ばれた“進め方”。non_adoption は不採用ゆえ手順でない）・pure。
 */

import type { SecondSelfTendency } from "./prm-model-entry-read";
import { buildMemoryItem, memoryContextPhrase, type MemoryItem } from "./memory-model";

/** 採用された“進め方”（adoption→adopt / deferral→defer。non_adoption は手順でない）。 */
export type ProceduralApproach = "adopt" | "defer";

/** CEO 補正の 4 signal（completed は PRM レーンで観測不能＝常に unknown）。 */
export interface ProceduralSignals {
  readonly accepted: boolean;
  readonly completed: "unknown"; // **断定しない**: 完了データを持たない
  readonly confirmed: boolean; // 本人 confirm（synthesis で R1-3 correction と join）
  readonly stable: boolean; // 複数回・反証非支配・correction なし＝再利用仮説
}

/** 再利用仮説の最小証拠数（stable 判定）。 */
export const STABLE_MIN_EVIDENCE = 5;

const APPROACH_OF: Record<string, ProceduralApproach | undefined> = { adoption: "adopt", deferral: "defer" };
const APPROACH_PHRASE: Record<ProceduralApproach, string> = { adopt: "提案を取り入れる進め方", defer: "後回しにする進め方" };

/**
 * R1-5: tendency の 4 signal を評価（completed=unknown 固定・confirmed は外から join 可・既定 false）。
 *   stable = evidence≥STABLE_MIN ∧ counter==0 ∧ correction なし（rejected は retracted で read に出ない前提）。
 */
export function assessProceduralSignals(t: SecondSelfTendency, opts: { confirmed?: boolean } = {}): ProceduralSignals {
  const noCorrection = t.userCorrection == null;
  return {
    accepted: t.evidenceCount > 0,
    completed: "unknown",
    confirmed: opts.confirmed ?? false,
    stable: t.evidenceCount >= STABLE_MIN_EVIDENCE && t.counterCount === 0 && noCorrection,
  };
}

/**
 * R1-5: adoption/deferral の tendency → procedural **hypothesis** MemoryItem（null=非該当 direction）。
 *   observation は「採用されやすいかもしれない（手順の仮説）」に抑制（有効/完了を断定しない）。
 *   certainty: stable のとき tendency の certainty を継承（≤tentative）、それ以外は low。
 */
export function tendencyToProceduralMemory(t: SecondSelfTendency, opts: { confirmed?: boolean } = {}): MemoryItem | null {
  const approach = APPROACH_OF[t.tendencyDirection];
  if (!approach) return null; // non_adoption は手順でない
  const signals = assessProceduralSignals(t, opts);
  const ctx = memoryContextPhrase(t.contextDimension, t.contextValue);
  const note = signals.confirmed ? "（本人が確認済みの手順仮説）" : signals.stable ? "（反復のある手順仮説）" : "（手順の仮説）";
  return buildMemoryItem({
    kind: "procedural",
    observation: `${ctx}では、${APPROACH_PHRASE[approach]}が採用されやすいかもしれない${note}`,
    context: { dimension: t.contextDimension, value: t.contextValue },
    evidenceCount: t.evidenceCount,
    counterCount: t.counterCount,
    certainty: signals.stable ? t.certainty : "low", // stable のみ tendency certainty 継承（≤tentative）
    userConfirmed: signals.confirmed,
    userCorrection: t.userCorrection,
    source: "prm_learning_event", // 採用イベントの蓄積由来（M1）
  });
}

/** adoption/deferral のみ procedural 化（non_adoption skip）。confirmedKeys に含む context は confirmed 扱い。 */
export function tendenciesToProceduralMemory(
  tendencies: readonly SecondSelfTendency[],
  confirmedKeys: ReadonlySet<string> = new Set(),
): readonly MemoryItem[] {
  const out: MemoryItem[] = [];
  for (const t of tendencies) {
    const m = tendencyToProceduralMemory(t, { confirmed: confirmedKeys.has(`${t.contextDimension}:${t.contextValue}`) });
    if (m) out.push(m);
  }
  return out;
}
