/**
 * S3-2 — CoAlter 当日 Moment surface（**pure・決定論・捏造なし**）
 *
 * 役割: 当日タイムライン（fixture）+ 現在時刻 + 2 人の demo 軸から、**次に来る負荷 moment**で
 *   どちらが消耗しそうかを先回りし、その場に効く**ケアの一言**を出す。
 *   CoAlter の「当日のサポート」専用。
 *
 * S3-1 forecast との時間軸の違い（補完関係）:
 *   - forecast（S3-1）= **出発前**の意思決定の摩擦（行き先/予算/段取り…）を橋渡し。
 *   - moment（S3-2）= **当日進行中**の状態ケア（そろそろ疲れる頃・休憩を）。
 *   → 同じ特性シグナルを「決定」でなく「時刻」に適用する。摩擦の交渉でなく、相手の状態の予期。
 *
 * 設計（第二の自己）:
 *   - 「次の負荷 moment」に対し、その負荷に**弱い側**（低耐性が confident に観測される人）を守る。
 *   - 損失回避と同じ精神: 消耗しやすい側の限界が先に来る。だから先回りして小さな逃げ道を置く。
 *
 * 厳守（honesty）:
 *   - **derived ∧ confidence≥floor ∧ non-neutral** な低耐性シグナルがある人だけを「弱い側」とする。
 *     誰も confident に弱くない → nudge を出さない（null）。状態を捏造しない。
 *   - 次に来る負荷 moment が無い（全部 null / now 以降に負荷なし）→ null。
 *   - raw axis score は出さない（時刻・場面・対象名・一言のみ）。
 *   - 入力の demo/実データ区別は caller 管理。出自は VM/UI が `demo` で明示。
 *   - nowMin は caller 注入（Date.now を取らない決定論）。
 */

import { derivePlanParams, deriveTravelTraits } from "@/lib/shared/personalization/derive";
import type { DerivedValue, PersonalizationSnapshot } from "@/lib/shared/personalization/types";
import type { CoAlterDayMoment, MomentStressor } from "./coalterMomentTimeline";

export interface CoAlterMomentSurface {
  /** 対象 moment の時刻（例「14:00」）。 */
  timeLabel: string;
  /** 場面ラベル（例「はじめての路地裏散策」）。 */
  momentLabel: string;
  /** 一言（例「そろそろ Mio は慣れない場所が続く頃。馴染みのある場所で落ち着く?」）。 */
  nudge: string;
}

const CONFIDENCE_FLOOR = 0.3;
const NEUTRAL_DEADZONE = 0.2;

/** derived ∧ conf≥floor ∧ non-neutral → 符号のみ（raw 値は出さない）。 */
function usableSign(d: DerivedValue<number>): 1 | -1 | null {
  if (d.source !== "derived" || d.confidence < CONFIDENCE_FLOOR) return null;
  if (Math.abs(d.value) <= NEUTRAL_DEADZONE) return null;
  return d.value > 0 ? 1 : -1;
}

/** 各 stressor の「低耐性＝消耗しやすい」符号（すべて負＝内向/ゆっくり/定番）。 */
interface StressorSpec {
  /** その人が stressor に弱いか（low-tolerance sign に一致するか）。null = 観測不足。 */
  vulnerable: (self: PlanTraitBundle) => boolean | null;
  /** 単独対象の一言（who = 「あなた」or 相手名）。 */
  single: (who: string) => string;
  /** 両者対象の一言。 */
  both: () => string;
}

interface PlanTraitBundle {
  /** +外向 / -内向 */
  social: 1 | -1 | null;
  /** +詰め込み / -ゆっくり */
  pace: 1 | -1 | null;
  /** +新奇 / -定番 */
  novelty: 1 | -1 | null;
}

function bundleOf(snapshot: PersonalizationSnapshot): PlanTraitBundle {
  const plan = derivePlanParams(snapshot);
  const traits = deriveTravelTraits(snapshot);
  return {
    social: usableSign(traits.traits.socialOrientation),
    pace: usableSign(traits.traits.pacePreference),
    novelty: usableSign(plan.noveltyBias),
  };
}

// nudge は **その場の即時アクション**（register を forecast の戦略助言と分離）:
//   forecast = 旅程レベルの方針（「静かな時間を組み込む」「定番を軸に」「余白を残す」）。
//   moment   = 今この瞬間の具体策（「席を確保」「先に確認」「5分座る」）。両者の語が被らないようにする。
const STRESSOR_SPECS: Record<MomentStressor, StressorSpec> = {
  social: {
    vulnerable: (b) => (b.social === null ? null : b.social < 0), // 内向 = 人混みで消耗しやすい
    single: (who) => `${who}は人混みが続くと消耗しがち。先に席を確保するか、ピークを 30 分ずらすと楽になります`,
    both: () => "お二人とも人混みが続くと消耗しがち。先に席を確保するか、時間を少しずらすと楽です",
  },
  pace: {
    vulnerable: (b) => (b.pace === null ? null : b.pace < 0), // ゆっくり = 駆け足で消耗
    single: (who) => `この先は駆け足になりがち。${who}のために、今のうちに 5 分だけ座って休んでおく?`,
    both: () => "この先は駆け足になりがち。お二人とも、今のうちに 5 分だけ座って休んでおく?",
  },
  novelty: {
    vulnerable: (b) => (b.novelty === null ? null : b.novelty < 0), // 定番 = 不慣れで消耗
    single: (who) => `次は不慣れな場所。${who}が戸惑う前に、先にルートと雰囲気を一緒に確認しておく?`,
    both: () => "次は不慣れな場所。お二人で先にルートと雰囲気を確認しておくと安心です",
  },
};

/** 分 → "HH:MM"（決定論）。 */
function minToHHMM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

/**
 * timeline + 現在時刻 + 2 人 → 次の負荷 moment のケア一言（無ければ null）。決定論・副作用なし。
 *   @param nowMin 現在時刻（分・caller 注入）。
 *   @param partnerName 相手の表示名（既定「お相手」）。
 */
export function buildCoAlterMomentSurface(
  moments: CoAlterDayMoment[],
  nowMin: number,
  self: PersonalizationSnapshot,
  partner: PersonalizationSnapshot,
  partnerName = "お相手",
): CoAlterMomentSurface | null {
  // now 以降で最初の「負荷あり」moment（時刻昇順前提・自衛で sort）。
  const upcoming = [...moments]
    .sort((a, b) => a.atMin - b.atMin)
    .find((m) => m.atMin >= nowMin && m.stressor !== null);
  if (!upcoming || upcoming.stressor === null) return null;

  const spec = STRESSOR_SPECS[upcoming.stressor];
  const selfBundle = bundleOf(self);
  const partnerBundle = bundleOf(partner);

  const selfVuln = spec.vulnerable(selfBundle); // true / false / null(観測不足)
  const partnerVuln = spec.vulnerable(partnerBundle);

  // confident に弱い人がいなければ nudge を出さない（状態を捏造しない）。
  let nudge: string | null = null;
  if (selfVuln === true && partnerVuln === true) nudge = spec.both();
  else if (selfVuln === true) nudge = spec.single("あなた");
  else if (partnerVuln === true) nudge = spec.single(partnerName);
  if (!nudge) return null;

  return {
    timeLabel: minToHHMM(upcoming.atMin),
    momentLabel: upcoming.label,
    nudge,
  };
}
