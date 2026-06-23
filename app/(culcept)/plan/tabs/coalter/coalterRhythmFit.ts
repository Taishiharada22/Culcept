/**
 * S3-3 — CoAlter 一日のリズム（Temporal/Rhythm Fit）（**pure・決定論・捏造なし**）
 *
 * 役割: 2 人の `energy_rhythm`（静かに充電する ↔ 活発に消費する）から、二人に噛み合う
 *   一日の**かたち**を構成的に提案する。CoAlter の「一日のリズム」専用。
 *
 * ★ 前提の是正（2026-06-23・原則①）:
 *   元案は「energy_rhythm から **午前型/午後型** のズレ」だったが、これは **構築不可能**:
 *     - traitAxes に chronotype（朝型/午前/午後）軸が**存在しない**。
 *     - `energy_rhythm` のラベルは「静かに充電↔活発に消費」＝**エネルギーの使い方**であり時間帯ではない
 *       （derive.ts も「朝型度ではない」と明記）。`morningness` は源泉軸なしの恒久 default。
 *   → energy_rhythm を時間帯に読み替えるのは **捏造**。よって本モジュールは energy_rhythm を
 *     **本来の意味（充電↔消費のリズム）**で使い、「時間相性」の意図を honest に達成する。
 *
 * forecast / moment との register 差（重複回避）:
 *   - forecast（S3-1）= 出発前の**相違の橋渡し**（行き先/予算/段取り…）。
 *   - moment（S3-2）  = 当日その場の**状態ケア**。
 *   - rhythm（S3-3）  = 二人に合う一日の**構成的なかたち**（正の提案・どう組み立てると噛み合うか）。
 *
 * 厳守（honesty）:
 *   - 両者とも energy_rhythm が **observed ∧ confidence≥floor ∧ non-neutral** な時だけ語る。
 *     片側でも材料不足 → null（リズムを捏造しない・カード非表示）。
 *   - raw axis score は出さない（向き＝充電/消費 と、かたちの一言のみ）。
 *   - 入力の demo/実データ区別は caller 管理。出自は VM/UI が `demo` で明示。
 */

import type { PersonalizationSnapshot } from "@/lib/shared/personalization/types";

export type RhythmFitKind = "calm" | "active" | "interleave";

export interface CoAlterRhythmFit {
  /** リズムの噛み合わせ種別（UI の微差・任意利用）。 */
  kind: RhythmFitKind;
  /** 二人に合う一日のかたちの一言（raw 値なし）。 */
  shape: string;
}

const CONFIDENCE_FLOOR = 0.3;
const NEUTRAL_DEADZONE = 0.2;

/**
 * energy_rhythm を**直接**読む（derive の density blend ではなく、リズムそのものの符号）。
 *   +1 = 活発に消費する / -1 = 静かに充電する / null = 観測不足・低信頼・中立。
 *   raw score は外へ出さない（符号のみ）。
 */
function energyStyle(snapshot: PersonalizationSnapshot): 1 | -1 | null {
  const ax = snapshot.axes.energy_rhythm;
  if (!ax) return null;
  if (ax.confidence < CONFIDENCE_FLOOR) return null;
  if (Math.abs(ax.score) <= NEUTRAL_DEADZONE) return null;
  return ax.score > 0 ? 1 : -1;
}

/**
 * self / partner snapshot → 一日のリズム提案（材料不足は null）。決定論・副作用なし。
 *   @param partnerName interleave で相手を呼ぶ表示名（既定「お相手」）。
 */
export function buildCoAlterRhythmFit(
  self: PersonalizationSnapshot,
  partner: PersonalizationSnapshot,
  partnerName = "お相手",
): CoAlterRhythmFit | null {
  const s = energyStyle(self);
  const p = energyStyle(partner);

  // 両者 confident に観測できなければリズムを語らない（捏造しない）。
  if (s === null || p === null) return null;

  if (s < 0 && p < 0) {
    return {
      kind: "calm",
      // 「静かに充電」は energy_rhythm の軸ラベルそのもの。pace readout の「ゆっくり過ごす方向」と
      // 語が被らないよう、リズム側は充電の語彙で言う（同じ「ゆっくり」を二度言わない）。
      shape:
        "お二人とも静かに充電する方。詰め込まず、長居できる場所を 1 つ核に据えて、前後に余白をとる一日が噛み合います。",
    };
  }

  if (s > 0 && p > 0) {
    return {
      kind: "active",
      shape:
        "お二人とも動いて充電する方。テンポよく回って大丈夫。休憩は短めにして流れを切らさないと乗ってきます。",
    };
  }

  // ズレ（一方が活発消費・他方が静か充電）→ **順序設計に集中**（人物像の再掲は forecast の役割なので外す）。
  //   rhythm の固有価値は「山と谷を交互に組む」緩急。誰が活発/静かの restate はしない（重複回避）。
  const active = s > 0 ? "あなた" : partnerName;
  const quiet = s > 0 ? partnerName : "あなた";
  return {
    kind: "interleave",
    shape: `活動の山と静かな谷を交互に組むのが合います。山でしっかり動き、谷で${quiet}が休む間に${active}が軽めに動くと、緩急で二人とも息切れしません。`,
  };
}
