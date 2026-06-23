/**
 * P4 — CoAlter personalization 源の resolver（**pure・実読み swap 点**）
 *
 * 役割: CoAlter の personalization（self/partner の `PersonalizationSnapshot` ペア）を **1 点で解決**する。
 *   現状は demo 軸。実データ接続時はここに viewer の実 self を注入するだけで全 downstream
 *   （readout / forecast / rhythm / moment / fit 選別 / solver intent）が実軸で動く。
 *
 * なぜ resolver か（swap 準備）:
 *   - これまで route は `COALTER_DEMO_PERSONALIZATION[mode]` を直読みしていた（demo 直結）。
 *   - 本 resolver で源を集約し、**実データ接続を 1 点 swap**にする（downstream は実 snapshot 対応済み・
 *     C6-B/C/D が pure で証明）。
 *
 * 厳守（honesty・境界）:
 *   - **本関数は DB/fetch をしない**（pure）。実 self は caller が `realSelf` で注入する
 *     （実 fetch = auth client + getPersonalizationSnapshot の配線は #9/本番接続）。
 *   - `realSelf` が null（既定・staging に軸なし）→ demo にフォールバック（挙動不変）。
 *   - **partner は常に demo**（相手の実 snapshot は RLS で読めない＝M2-B 設計凍結）。
 *   - 出自（demo/実）は VM の `demo` フラグが担保する（本 resolver は値を返すだけ）。
 */

import type { PersonalizationSnapshot } from "@/lib/shared/personalization/types";
import { COALTER_DEMO_PERSONALIZATION, type CoAlterDemoPersonalization } from "./coalterPersonalizationFixture";
import type { CoAlterPlanMode } from "./coalterPlanSessionFixture";

export interface ResolveCoAlterPersonalizationOpts {
  /**
   * viewer の **実** self snapshot（#9 で auth+reader 経由に供給）。
   *   null/未指定 → demo へフォールバック（既定・staging）。
   */
  realSelf?: PersonalizationSnapshot | null;
}

/**
 * mode + （任意の実 self）→ { self, partner } ペア。決定論・副作用なし。
 *   - realSelf あり → self = 実データ / partner = demo（M2-B: 相手は RLS で読めない）。
 *   - realSelf なし → self/partner とも demo（挙動不変）。
 */
export function resolveCoAlterPersonalizationPair(
  mode: CoAlterPlanMode,
  opts?: ResolveCoAlterPersonalizationOpts,
): CoAlterDemoPersonalization {
  const demo = COALTER_DEMO_PERSONALIZATION[mode];
  const realSelf = opts?.realSelf;
  if (realSelf) {
    return { self: realSelf, partner: demo.partner };
  }
  return demo;
}
