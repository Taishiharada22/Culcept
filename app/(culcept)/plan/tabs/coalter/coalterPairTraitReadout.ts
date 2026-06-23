/**
 * S2 — CoAlter 2 人の噛み合わせ readout（**pure・決定論・捏造なし**）
 *
 * 役割: self / partner の `PersonalizationSnapshot` を M2 PersonalizationPort の pure derive に通し、
 *   **本人の傾向**と**2 人の一致点（共有する強み）**を短い日本語で読み上げる。
 *
 * S3-1 forecast との責務分離（**重複ゼロ**・2026-06-22 外科縮小）:
 *   - 本モジュール（readout）= **一致点のみ**（「お二人とも〜方向」）＋ 本人の selfReadout。
 *   - `coalterConflictForecast`（S3-1）= **相違点**を、決定にひも付け・ランク・橋渡し付きで出す。
 *   → 一致は readout・差分は forecast。各カードが 1 つの問いに答える（フラットな混在リストを解消）。
 *   - **旧 pairReadout の opposed（差）ブランチ + 焼き込み橋渡しは forecast へ移管した**（ここからは除去）。
 *
 * 厳守（honesty）:
 *   - **source !== "derived" / confidence < floor / neutral(deadzone 内) は語らない**（不確実を断定しない）。
 *   - 入力 snapshot は **caller が demo か実データかを管理**（この関数は純写像のみ・DB/runtime を読まない）。
 *   - 出自は VM/UI 側が `demo` フラグで明示する（この関数は値を作るだけ）。
 */

import { derivePlanParams, deriveTravelTraits } from "@/lib/shared/personalization/derive";
import type { DerivedValue, PersonalizationSnapshot } from "@/lib/shared/personalization/types";

export interface CoAlterPairTraitReadout {
  /** viewer 本人の傾向（confidence 十分な軸のみ）。 */
  selfReadout: string[];
  /** 2 人の一致 / 差（両者とも confidence 十分な軸のみ）。 */
  pairReadout: string[];
}

/** derive と整合: これ未満は中立として語らない。 */
const CONFIDENCE_FLOOR = 0.3;
/** |value| がこの範囲は neutral とみなし語らない。 */
const NEUTRAL_DEADZONE = 0.2;

type Pace = "slow" | "normal" | "intense";

/** derived ∧ confidence 十分な enum のみ通す。 */
function usableEnum<T extends string>(d: DerivedValue<T>): T | null {
  return d.source === "derived" && d.confidence >= CONFIDENCE_FLOOR ? d.value : null;
}

/** derived ∧ confidence 十分 ∧ non-neutral な符号付き数値 → 符号のみ（raw 値は出さない）。 */
function usableSign(d: DerivedValue<number>): 1 | -1 | null {
  if (d.source !== "derived" || d.confidence < CONFIDENCE_FLOOR) return null;
  if (Math.abs(d.value) <= NEUTRAL_DEADZONE) return null;
  return d.value > 0 ? 1 : -1;
}

const PACE_JA: Record<Pace, string> = { slow: "ゆっくり過ごす", normal: "ほどよいペース", intense: "活動的に動く" };

interface Signals {
  pace: Pace | null;
  /** +1 = 新奇 / -1 = 定番 */
  novelty: 1 | -1 | null;
  /** +1 = 外向（人と動く）/ -1 = 内向（静かめ） */
  social: 1 | -1 | null;
}

function signalsOf(snapshot: PersonalizationSnapshot): Signals {
  const plan = derivePlanParams(snapshot);
  const traits = deriveTravelTraits(snapshot);
  return {
    pace: usableEnum<Pace>(plan.paceDefault),
    novelty: usableSign(plan.noveltyBias) ?? usableSign(traits.traits.noveltySeeking),
    social: usableSign(traits.traits.socialOrientation),
  };
}

/**
 * self / partner snapshot → 噛み合わせ readout。決定論・副作用なし。
 *   @param partnerName pair readout で相手を呼ぶ表示名（既定「お相手」）。
 */
export function buildCoAlterPairTraitReadout(
  self: PersonalizationSnapshot,
  partner: PersonalizationSnapshot,
  partnerName = "お相手",
): CoAlterPairTraitReadout {
  const s = signalsOf(self);
  const p = signalsOf(partner);

  // ── self 本人の傾向（語れる軸だけ）──
  const selfReadout: string[] = [];
  if (s.pace) selfReadout.push(`${PACE_JA[s.pace]}派`);
  if (s.novelty) selfReadout.push(s.novelty > 0 ? "新しい場所に前向き" : "定番に安心する方");
  if (s.social) selfReadout.push(s.social > 0 ? "人と動くと回復する方" : "静かめが落ち着く方");

  // ── 2 人の一致点のみ（共有する強み）。相違点は forecast の領域＝ここでは出さない ──
  //   両者とも語れる軸 ∧ 同方向のときだけ「お二人とも〜」。差は coalterConflictForecast へ移管。
  const pairReadout: string[] = [];

  if (s.pace && p.pace && s.pace === p.pace) {
    pairReadout.push(`お二人とも${PACE_JA[s.pace]}方向`);
  }

  if (s.novelty && p.novelty && s.novelty === p.novelty) {
    pairReadout.push(s.novelty > 0 ? "お二人とも新しい場所に前向き" : "お二人とも定番に安心");
  }

  if (s.social && p.social && s.social === p.social) {
    pairReadout.push(s.social > 0 ? "お二人とも人と動くと回復する方" : "お二人とも静かめが落ち着く方");
  }

  return { selfReadout, pairReadout };
}
