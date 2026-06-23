/**
 * C6-C — demo TravelObjectState catalog（**preview 専用・demo entity・外部 API なし**）
 *
 * 役割: T11 `evaluateFit` で「性格 → どの場所が合うか」をスコアするための demo entity 群。
 *   一部に **calm ペアには合わない** entity（nightlife/thrill）を混ぜ、性格選別が効くことを実証可能にする。
 *
 * honesty:
 *   - traits は SHARED_TRAIT_AXES（fit bridge と**同一符号規約**）。entity の事実状態は demo。
 *   - placeRefId は opaque（表示名は別途 demo map）。confidence/provenance 付き（editorial=demo）。
 *   - 実運用は Web Search / Places 由来の entity に差し替える前提（本 catalog は demo）。
 */

import type { Observed, TravelObjectState, TraitVector } from "@/lib/shared/travel/fit-types";

const ed = (value: number): Observed<number> => ({ value, confidence: 0.6, provenance: "editorial" });

/** SHARED_TRAIT_AXES の符号規約（bridge と一致）:
 *   quietLively: +lively/-quiet ・ calmStimulating: +stimulating/-calm ・ noveltyFamiliar: +novelty/-familiar
 *   natureUrban: +urban/-nature ・ learningDepth: +深い ・ photogenicStyle: +映え
 */
const traits = (t: TraitVector): TraitVector => t;
const tv = (value: number, confidence = 0.6) => ({ value, confidence });

export const COALTER_DEMO_ENTITIES: TravelObjectState[] = [
  {
    placeRefId: "hakone_onsen_daytrip",
    category: "place",
    traits: traits({ quietLively: tv(-0.6), calmStimulating: tv(-0.7), natureUrban: tv(-0.4), noveltyFamiliar: tv(-0.3) }),
    roleAffinity: { relaxation: ed(0.9), solitude: ed(0.5) },
    burden: { crowdNoise: ed(0.3), physicalLoad: ed(0.2) },
  },
  {
    placeRefId: "hakone_lakeside_walk",
    category: "place",
    traits: traits({ quietLively: tv(-0.5), calmStimulating: tv(-0.4), natureUrban: tv(-0.7) }),
    roleAffinity: { relaxation: ed(0.7), solitude: ed(0.7) },
    burden: { crowdNoise: ed(0.2), physicalLoad: ed(0.4) },
  },
  {
    placeRefId: "hakone_open_air_museum",
    category: "place",
    traits: traits({ quietLively: tv(-0.2), calmStimulating: tv(-0.1), learningDepth: tv(0.6), noveltyFamiliar: tv(0.2), photogenicStyle: tv(0.4) }),
    roleAffinity: { culture_learning: ed(0.8), photo: ed(0.5) },
    burden: { crowdNoise: ed(0.4), physicalLoad: ed(0.3) },
  },
  {
    placeRefId: "hakone_nightlife_bar",
    category: "place",
    traits: traits({ quietLively: tv(0.8), calmStimulating: tv(0.8), natureUrban: tv(0.6), noveltyFamiliar: tv(0.3) }),
    roleAffinity: { social_hangout: ed(0.9) },
    burden: { crowdNoise: ed(0.8), morningBurden: ed(0.6) },
  },
  {
    placeRefId: "hakone_thrill_activity",
    category: "activity",
    traits: traits({ quietLively: tv(0.5), calmStimulating: tv(0.7), noveltyFamiliar: tv(0.6) }),
    roleAffinity: { thrill_experience: ed(0.9) },
    burden: { physicalLoad: ed(0.8), crowdNoise: ed(0.4) },
  },
  {
    placeRefId: "hakone_ryokan_calm",
    category: "lodging",
    traits: traits({ quietLively: tv(-0.5), calmStimulating: tv(-0.5), minimalRich: tv(0.2) }),
    roleAffinity: { base: ed(0.8), recovery: ed(0.7) },
    burden: { crowdNoise: ed(0.2) },
  },
];
