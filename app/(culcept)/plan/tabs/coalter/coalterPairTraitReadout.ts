/**
 * S2 — CoAlter 2 人の噛み合わせ readout（**pure・決定論・捏造なし**）
 *
 * 役割: self / partner の `PersonalizationSnapshot` を M2 PersonalizationPort の pure derive に通し、
 *   **2 人の傾向の一致 / 差**を短い日本語で読み上げる。CoAlter の「お二人の噛み合わせ」説明レイヤ専用。
 *
 * 設計判断（なぜ engine でなく説明レイヤか）:
 *   - travel engine の proposal comparator は **angle/fit ベースで trait ベースではない**（調査確認）。
 *     partner の trait を順位計算へ深く統合するのは comparator 大改造＝S4 Conflict Pre-detection の領域。
 *   - S2 は外科的に：self 軸のみ engine scoring（adapter が owner=self に限定）、
 *     **partner との噛み合わせは順位を変えず説明だけ**に留める。
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

  // ── 2 人の噛み合わせ（両者とも語れる軸だけ）──
  const pairReadout: string[] = [];

  if (s.pace && p.pace) {
    if (s.pace === p.pace) pairReadout.push(`お二人とも${PACE_JA[s.pace]}方向`);
    else pairReadout.push(`ペースに差（あなた=${PACE_JA[s.pace]}・${partnerName}=${PACE_JA[p.pace]}）`);
  }

  if (s.novelty && p.novelty) {
    if (s.novelty === p.novelty) {
      pairReadout.push(s.novelty > 0 ? "お二人とも新しい場所に前向き" : "お二人とも定番に安心");
    } else {
      const forward = s.novelty > 0 ? "あなた" : partnerName;
      const classic = s.novelty > 0 ? partnerName : "あなた";
      pairReadout.push(`新しさは${forward}が前向き・${classic}は定番に安心 → 定番を軸に少し新しさを混ぜる`);
    }
  }

  if (s.social && p.social && s.social !== p.social) {
    const outgoing = s.social > 0 ? "あなた" : partnerName;
    const quiet = s.social > 0 ? partnerName : "あなた";
    pairReadout.push(`対人は${outgoing}が人と動くと回復・${quiet}は静かめ → 人混みは控えめに`);
  }

  return { selfReadout, pairReadout };
}
