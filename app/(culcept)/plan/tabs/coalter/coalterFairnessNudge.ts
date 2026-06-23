/**
 * S4-1 — CoAlter 公平性 nudge（これまでの釣り合い）（**pure・決定論・捏造なし・読み取りのみ**）
 *
 * 役割: 公平性台帳（`FairnessLedgerEntry[]`）の直近の偏りから、「今回はどちらの希望を
 *   立てると長い目で釣り合うか」の一言を出す。CoAlter の「これまでの釣り合い」専用。
 *
 * 位置づけ（他カードとの差・セッション横断の唯一の軸）:
 *   - 現行カード（観測/forecast/rhythm/moment）は全て **今回の旅** の分析。
 *   - 本モジュールは **セッション横断＝関係の時間軸**（前回はどちらが折れたか）。
 *     第二の自己＝「順番」を覚えている公平な仲介者。
 *
 * 厳守（honesty・安全）:
 *   - **読み取り表示のみ**。台帳への書込（勝敗記録）は一切しない（DB write 禁止＝既存 lib/coalter は流用しない）。
 *   - 偏りが **deadzone 内（おおむね均衡）/ 履歴なし → null**（無理に「どちらの番」と言わない）。
 *   - **raw な bias 数値は出さない**（方向＝どちら寄り、と一言のみ）。
 *   - 入力台帳が demo か実データかは caller 管理。出自は VM/UI が `demo` で明示。
 *
 * 規約: biasScore -1（A＝あなた寄り）..+1（B＝相手寄り）。A=participantIds[0]=viewer に対応。
 */

import type { FairnessLedgerEntry } from "@/lib/shared/personalization/types";

export type FairnessLeaning = "self" | "partner";

export interface CoAlterFairnessNudge {
  /** 直近どちら寄りだったか（self=あなた寄り / partner=相手寄り）。 */
  leaning: FairnessLeaning;
  /** 釣り合いの一言（raw な bias 値は含まない）。 */
  message: string;
}

/** これ以内の平均偏りは「おおむね均衡」とみなし、どちらの番とも言わない。 */
const BALANCE_DEADZONE = 0.2;
/** currentBias の算出窓（M2 規約: 直近 10 行）。 */
const RECENT_WINDOW = 10;

/**
 * 公平性台帳 → 釣り合い nudge（均衡 / 履歴なしは null）。決定論・副作用なし・読み取りのみ。
 *   @param rows decidedAt 昇順の台帳行（demo か実データかは caller 管理）。
 *   @param partnerName 相手の表示名（既定「お相手」）。
 */
export function buildCoAlterFairnessNudge(
  rows: FairnessLedgerEntry[],
  partnerName = "お相手",
): CoAlterFairnessNudge | null {
  if (rows.length === 0) return null;

  // 直近 RECENT_WINDOW 行の平均（M2 currentBias 規約）。
  const recent = rows.slice(-RECENT_WINDOW);
  const currentBias = recent.reduce((sum, e) => sum + clamp(e.biasScore, -1, 1), 0) / recent.length;

  // おおむね均衡 → どちらの番とも言わない（捏造しない）。
  if (Math.abs(currentBias) <= BALANCE_DEADZONE) return null;

  if (currentBias < 0) {
    // A（あなた）寄りが続いている → 今回は相手を立てる番。
    return {
      leaning: "self",
      message: `ここ数回はあなたの希望が通りがち。今回は${partnerName}の希望を 1 つ立てると、長い目で釣り合います。`,
    };
  }
  // B（相手）寄りが続いている → 今回はあなたの希望を多めでも釣り合う。
  return {
    leaning: "partner",
    message: `ここ数回は${partnerName}の希望が通りがち。今回はあなたの希望を 1 つ多めでも、釣り合いが取れます。`,
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
