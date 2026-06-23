/**
 * S4-1 — CoAlter 公平性台帳 demo fixture（**preview 専用・demo データ・DB read/write なし**）
 *
 * 役割: 「これまでの釣り合い」を preview で見せるための **demo な公平性台帳**
 *   （`FairnessLedgerEntry[]`）。直近の意思決定がどちらの希望に寄ってきたかの履歴。
 *
 * なぜ fixture か（honesty）:
 *   - 実台帳 `coalter_fairness_ledger` は DB（read/write）＝ S-series（fixture only・**書込禁止**）では触らない。
 *     既存の DB 結合ロジック（lib/coalter/engine.ts の insert）は流用しない。
 *   - 「履歴が入った世界」を preview で見せるため demo 台帳を用意する（S2 の demo 軸と同じ流儀）。
 *   - VM/UI は必ず `demo: true` を伴って表示する。
 *
 * 規約（M2 FairnessLedgerEntry）:
 *   - biasScore: **-1（完全に A＝あなた寄り）.. +1（完全に B＝相手寄り）**。
 *   - 行は decidedAt 昇順。currentBias は読み取り側で直近の平均として算出する。
 *   - decidedAt は固定 ISO（決定論・Date.now を取らない）。
 *
 * demo の意図: ここ数回は **あなた寄り**（負の偏り）。→ 「今回は相手の希望を立てる番」を示せる。
 */

import type { FairnessLedgerEntry } from "@/lib/shared/personalization/types";

export const COALTER_DEMO_FAIRNESS_LEDGER: FairnessLedgerEntry[] = [
  { biasScore: -0.3, decidedAt: "2026-05-18T00:00:00.000Z" }, // やや あなた寄り
  { biasScore: -0.5, decidedAt: "2026-05-30T00:00:00.000Z" }, // あなた寄り
  { biasScore: -0.4, decidedAt: "2026-06-12T00:00:00.000Z" }, // あなた寄り
];
