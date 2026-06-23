/**
 * C6-C — PersonalizationSnapshot → T11 FitUserState 橋（**pure・決定論・捏造ゼロ**）
 *
 * 役割: ペアの観測軸（PersonalizationSnapshot）を、既存 T11 fit model（lib/shared/travel/fit-core
 *   の `evaluateFit`）が entity を性格でスコアするための `FitUserState` / `FitSubject` に写す。
 *   これにより「性格 → どの場所/体験が合うか」を**既存の entity スコアラ**（無改修）で計算できる。
 *
 * なぜ橋か（重複回避・C6 の流儀）:
 *   - entity×性格の fit は T11 `evaluateFit` が既に持つ（rebuild しない）。
 *   - 足りないのは「観測軸 → FitUserState」の写像だけ。これを最小・honest に作る。
 *
 * 厳守（honesty）:
 *   - **derived ∧ confidence≥floor の軸のみ**を写す。非観測/低信頼は **省略（Partial）**＝
 *     fit 側が confidence 減算で扱う（捏造して埋めない）。
 *   - SHARED_TRAIT_AXES の符号は **user/entity で同一規約**にすれば fit は距離で成立する
 *     （本橋と entity catalog で規約を揃える）。
 *   - raw axis score は外へ出さない（FitUserState は solver/fit への内部入力で UI に出さない）。
 *   - DB / fetch / Date.now なし。demo/実データ区別は caller 管理。
 */

import { derivePlanParams, deriveTravelTraits } from "@/lib/shared/personalization/derive";
import type { DerivedValue, PersonalizationSnapshot } from "@/lib/shared/personalization/types";
import type {
  FitSubject,
  FitUserState,
  IntendedRole,
  RelationshipKind,
  SharedTraitAxis,
  TraitValue,
  UserToleranceAxis,
} from "@/lib/shared/travel/fit-types";

const CONFIDENCE_FLOOR = 0.3;

/** derived ∧ conf≥floor の符号付き値 → TraitValue（規約: 渡された value 方向のまま）。null=省略。 */
function traitOf(d: DerivedValue<number>): TraitValue | null {
  if (d.source !== "derived" || d.confidence < CONFIDENCE_FLOOR) return null;
  return { value: clamp(d.value, -1, 1), confidence: clamp(d.confidence, 0, 1) };
}

/** derived ∧ conf≥floor の 0..1 値（tolerance 用）。null=省略。 */
function unitOf(d: DerivedValue<number>): number | null {
  if (d.source !== "derived" || d.confidence < CONFIDENCE_FLOOR) return null;
  return clamp(d.value, 0, 1);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * energy_rhythm（静か充電↔活発消費）から intendedRole を推論。
 *   calm（静か）→ relaxation/recovery/solitude ・ active（活発）→ active/thrill/social。
 *   confidence は軸 confidence（推論ゆえ控えめ）。不明瞭（deadzone 内/低信頼/未観測）→ [] = roleFit 中立。
 */
function inferIntendedRoles(energy: { score: number; confidence: number } | undefined): IntendedRole[] {
  if (!energy || energy.confidence < CONFIDENCE_FLOOR || Math.abs(energy.score) <= 0.2) return [];
  const conf = clamp(energy.confidence, 0, 1);
  if (energy.score < 0) {
    return [
      { category: "place", role: "relaxation", weight: 0.8, confidence: conf },
      { category: "lodging", role: "recovery", weight: 0.7, confidence: conf },
      { category: "place", role: "solitude", weight: 0.5, confidence: conf },
    ];
  }
  return [
    { category: "place", role: "active", weight: 0.8, confidence: conf },
    { category: "activity", role: "thrill_experience", weight: 0.7, confidence: conf },
    { category: "place", role: "social_hangout", weight: 0.6, confidence: conf },
  ];
}

/** 観測軸 → FitUserState（写せる軸のみ・非観測は省略）。 */
export function buildFitUserStateFromSnapshot(snapshot: PersonalizationSnapshot): FitUserState {
  const plan = derivePlanParams(snapshot);
  const traitsV0 = deriveTravelTraits(snapshot).traits;

  // ── traits（SHARED_TRAIT_AXES・user/entity 共通規約）──
  const traits: Partial<Record<SharedTraitAxis, TraitValue>> = {};
  // quietLively: +lively（外向）/ -quiet（内向）← socialOrientation
  const social = traitOf(traitsV0.socialOrientation);
  if (social) traits.quietLively = social;
  // noveltyFamiliar: +novelty / -familiar ← noveltyBias
  const novelty = traitOf(plan.noveltyBias);
  if (novelty) traits.noveltyFamiliar = novelty;
  // calmStimulating: +stimulating / -calm ← energy_rhythm（活発=刺激 / 静か=穏やか）生軸
  const energy = snapshot.axes.energy_rhythm;
  if (energy && energy.confidence >= CONFIDENCE_FLOOR) {
    traits.calmStimulating = { value: clamp(energy.score, -1, 1), confidence: clamp(energy.confidence, 0, 1) };
  }

  // ── tolerances（0..1・高=強い）──
  const tolerances: Partial<Record<UserToleranceAxis, number>> = {};
  const crowd = unitOf(plan.socialLoadTolerance);
  if (crowd !== null) tolerances.crowdTolerance = crowd;
  // pacePreference(-1..1 +詰め込み) → 0..1（高=速いペースに耐える）
  const pace = traitOf(traitsV0.pacePreference);
  if (pace) {
    const paceTol = (pace.value + 1) / 2;
    tolerances.paceTolerance = paceTol;
    tolerances.fatigueSensitivity = paceTol; // 活発ほど疲労に強い（高=tolerant）
  }

  // ── intendedRoles（何として扱いたいか）を disposition から推論 ──
  //   roleFit は fit の最大重み(0.4)。calmStimulating が明確なら relaxation↔active 系の役割希望を
  //   confidence 付きで推論し、性格が場所選択に強く効くようにする（不明瞭なら設定せず＝roleFit 中立）。
  const intendedRoles = inferIntendedRoles(snapshot.axes.energy_rhythm);

  // ── budgetSensitivity（save=高敏感）──
  const out: FitUserState = { tolerances, traits };
  if (intendedRoles.length > 0) out.intendedRoles = intendedRoles;
  if (plan.budgetPosture.source === "derived" && plan.budgetPosture.confidence >= CONFIDENCE_FLOOR) {
    out.budgetSensitivity =
      plan.budgetPosture.value === "save" ? 0.8 : plan.budgetPosture.value === "quality" ? 0.2 : 0.5;
  }

  return out;
}

/**
 * self / partner → group FitSubject（relationship は観測外のため neutral "friends"）。
 *   solo 利用は self 単独で buildFitUserStateFromSnapshot を使う想定。
 */
export function buildFitSubjectFromPair(
  self: PersonalizationSnapshot,
  partner: PersonalizationSnapshot,
  relationship: RelationshipKind = "friends",
): FitSubject {
  return {
    kind: "group",
    participants: [
      { participantId: "self", state: buildFitUserStateFromSnapshot(self) },
      { participantId: "partner", state: buildFitUserStateFromSnapshot(partner) },
    ],
    relationship,
  };
}
