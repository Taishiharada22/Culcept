/**
 * CoAlter Phase B Commit 4: Food narration builder (2026-04-19)
 *
 * 検証:
 *  - buildSlotsFood / buildPracticalInfoFood / buildSummaryFood / buildOneLinerFood
 *    / buildCandidateDetailFood が事実のみから決定論的に組み上がる
 *  - 事実改変禁止契約:
 *      stationOrArea / priceBand / openingHours / rating の 4 フィールドを
 *      独立に null にしたとき、出力にその項目の「痕跡」も「推測補完」も残らない
 *  - fallback 創作検査:
 *      buildWhy2PeopleFood / buildSummaryFood の fallback 文に
 *      駅名・時刻・価格・数字の紛れ込みが無い
 *  - composeStationOrArea の 4 パターン真理値表
 */

import { describe, it, expect } from "vitest";

import {
  buildCandidateDetailFood,
  buildOneLinerFood,
  buildPracticalInfoFood,
  buildSummaryFood,
  formatWhenFromBrief,
  __internal,
} from "@/lib/coalter/narrationBuilder";
import type {
  ConversationBrief,
  FoodVenue,
  RankedFoodAlternative,
  RankedFoodCandidate,
  SearchCandidate,
} from "@/lib/coalter/types";

// ─────────────────────────────────────────────
// Fixture factories
// ─────────────────────────────────────────────

function venue(over: Partial<FoodVenue> = {}): FoodVenue {
  return {
    name: "酒と肴 いぶり",
    station: "渋谷駅",
    area: "道玄坂",
    priceBand: "¥3,000〜¥3,999",
    openingHours: "17:00-24:00",
    rating: "3.52",
    snippet: "渋谷駅から徒歩 5 分。落ち着いた居酒屋。",
    ...over,
  };
}

function frc(over: Partial<RankedFoodCandidate> = {}): RankedFoodCandidate {
  return {
    candidateKey: "food:tabelog.com:いぶり:渋谷",
    role: "balance",
    venue: venue(),
    sourceUrl: "https://tabelog.com/tokyo/123/",
    sourceDomain: "tabelog.com",
    confidence: 0.8,
    axisScores: { balance: 0.8 },
    totalScore: 0.8,
    rationale: {
      matchedInterestsA: ["日本酒"],
      matchedInterestsB: ["和食"],
      matchedValuesA: [],
      matchedValuesB: [],
      appealedAxis: ["balance"],
      tradeoff: null,
      contingencyHint: null,
    },
    breakdown: {
      metrics: {
        budgetFit: 0.8,
        areaFit: 1,
        quietnessFit: 0.7,
        novelty: 0.5,
        cuisineMatchA: 0.8,
        cuisineMatchB: 0.7,
        moodMatch: 0.5,
        ratingFit: 0.7,
        compromiseQuality: 0,
      },
      roleScores: { balance: 0.8 },
      assignedRole: "balance",
    },
    ...over,
  };
}

function foodBrief(over: Partial<ConversationBrief> = {}): ConversationBrief {
  return {
    theme: "food",
    area: "渋谷",
    approximateTime: { date: "今週末", timeSlot: "night", preferredStartHour: 19 },
    mood: [],
    hardConstraints: [],
    rankingAxes: {
      preset: "balance_focus",
      roles: ["balance", "aFocus", "bFocus"],
      rationale: "折り合い優先",
    },
    primaryUnresolvedQuestion: null,
    confidence: 0.8,
    source: "llm",
    ...over,
  };
}

function searchCandidatesSample(): SearchCandidate[] {
  return [
    {
      title: "酒と肴 いぶり",
      description: "渋谷駅から徒歩 5 分。日本酒が豊富。17:00-24:00 営業。",
      externalRating: "3.52",
      practicalInfo: null,
      source: "tabelog",
      url: "https://tabelog.com/tokyo/123/",
    },
  ];
}

// ─────────────────────────────────────────────
// composeStationOrArea 真理値表
// ─────────────────────────────────────────────

describe("composeStationOrArea", () => {
  const compose = __internal.composeStationOrArea;

  it("両方あれば area（station）", () => {
    expect(compose("渋谷駅", "道玄坂")).toBe("道玄坂（渋谷駅）");
  });
  it("area のみ", () => {
    expect(compose(null, "道玄坂")).toBe("道玄坂");
  });
  it("station のみ", () => {
    expect(compose("渋谷駅", null)).toBe("渋谷駅");
  });
  it("両方 null なら null（エリア不明を作らない）", () => {
    expect(compose(null, null)).toBeNull();
  });
});

// ─────────────────────────────────────────────
// buildPracticalInfoFood / buildSlotsFood (happy path)
// ─────────────────────────────────────────────

describe("buildPracticalInfoFood", () => {
  it("4 token 全部そろっていれば stationOrArea / priceBand / openingHours / rating を順に並べる", () => {
    const s = buildPracticalInfoFood(frc());
    expect(s).toBe("道玄坂（渋谷駅） / ¥3,000〜¥3,999 / 17:00-24:00 / 3.52");
  });
});

describe("buildSlotsFood", () => {
  it("what=venue.name + priceBand detail / where=loc / when=openingHours", () => {
    const slots = __internal.buildSlotsFood(frc());
    expect(slots.what?.label).toBe("酒と肴 いぶり");
    expect(slots.what?.detail).toBe("¥3,000〜¥3,999");
    expect(slots.where?.label).toBe("道玄坂（渋谷駅）");
    expect(slots.when?.label).toBe("17:00-24:00");
  });
});

// ─────────────────────────────────────────────
// 事実改変禁止: 4 フィールド独立 null 検査
// ─────────────────────────────────────────────

describe("buildPracticalInfoFood — 4 フィールド独立 null 検査", () => {
  it("stationOrArea だけ null でも他 3 token は出る（駅/エリア 行だけ落ちる）", () => {
    const s = buildPracticalInfoFood(
      frc({ venue: venue({ station: null, area: null }) }),
    );
    expect(s).toBe("¥3,000〜¥3,999 / 17:00-24:00 / 3.52");
    expect(s).not.toMatch(/駅|道玄坂|エリア|不明/);
  });

  it("priceBand だけ null でも他 3 token は出る（価格 token だけ落ちる）", () => {
    const s = buildPracticalInfoFood(
      frc({ venue: venue({ priceBand: null }) }),
    );
    expect(s).toBe("道玄坂（渋谷駅） / 17:00-24:00 / 3.52");
    expect(s).not.toMatch(/¥|円|価格|不明/);
  });

  it("openingHours だけ null でも他 3 token は出る（時間 token だけ落ちる）", () => {
    const s = buildPracticalInfoFood(
      frc({ venue: venue({ openingHours: null }) }),
    );
    expect(s).toBe("道玄坂（渋谷駅） / ¥3,000〜¥3,999 / 3.52");
    expect(s).not.toMatch(/\d+:\d+|営業時間|時間不明/);
  });

  it("rating だけ null でも他 3 token は出る（評価 token だけ落ちる）", () => {
    const s = buildPracticalInfoFood(
      frc({ venue: venue({ rating: null }) }),
    );
    expect(s).toBe("道玄坂（渋谷駅） / ¥3,000〜¥3,999 / 17:00-24:00");
    expect(s).not.toMatch(/★|評価|3\.|4\./);
  });

  it("全 4 token null なら空文字（呼び出し側が null に正規化する前提）", () => {
    const s = buildPracticalInfoFood(
      frc({
        venue: venue({
          station: null,
          area: null,
          priceBand: null,
          openingHours: null,
          rating: null,
        }),
      }),
    );
    expect(s).toBe("");
  });
});

describe("buildCandidateDetailFood — 4 フィールド独立 null 検査", () => {
  it("stationOrArea 両方 null → address null / priceBand・openingHours は残る", () => {
    const d = buildCandidateDetailFood({
      candidate: frc({ venue: venue({ station: null, area: null }) }),
      alternatives: [],
      searchCandidates: [],
      brief: foodBrief(),
    });
    expect(d.address).toBeNull();
    expect(d.priceBand).toBe("¥3,000〜¥3,999");
    expect(d.operatingHours).toBe("17:00-24:00");
  });

  it("priceBand null → detail.priceBand null / 他は残る", () => {
    const d = buildCandidateDetailFood({
      candidate: frc({ venue: venue({ priceBand: null }) }),
      alternatives: [],
      searchCandidates: [],
      brief: foodBrief(),
    });
    expect(d.priceBand).toBeNull();
    expect(d.address).toBe("道玄坂（渋谷駅）");
    expect(d.operatingHours).toBe("17:00-24:00");
  });

  it("openingHours null → detail.operatingHours null / 他は残る", () => {
    const d = buildCandidateDetailFood({
      candidate: frc({ venue: venue({ openingHours: null }) }),
      alternatives: [],
      searchCandidates: [],
      brief: foodBrief(),
    });
    expect(d.operatingHours).toBeNull();
    expect(d.address).toBe("道玄坂（渋谷駅）");
    expect(d.priceBand).toBe("¥3,000〜¥3,999");
  });

  it("rating null → detail は rating 項目を持たないので practicalInfo 側のみ落ちる", () => {
    const d = buildCandidateDetailFood({
      candidate: frc({ venue: venue({ rating: null }) }),
      alternatives: [],
      searchCandidates: [],
      brief: foodBrief(),
    });
    expect(d.address).toBe("道玄坂（渋谷駅）");
    expect(d.priceBand).toBe("¥3,000〜¥3,999");
    expect(d.operatingHours).toBe("17:00-24:00");
    // detail には rating フィールドが無い。ここでは address 等が埋まることだけ確認
  });
});

// ─────────────────────────────────────────────
// buildCandidateDetailFood happy path + alternatives 上限
// ─────────────────────────────────────────────

describe("buildCandidateDetailFood — happy path", () => {
  it("why2People / address / priceBand / operatingHours / booking / sources を埋める", () => {
    const d = buildCandidateDetailFood({
      candidate: frc(),
      alternatives: [
        {
          candidateKey: "food:tabelog.com:ほかの店:渋谷",
          venue: venue({ name: "居酒屋 あおい", station: "渋谷駅", area: null }),
          sourceUrl: "https://tabelog.com/tokyo/aoi/",
          reason: "安心枠としても成立",
          topRole: "safety",
          topRoleScore: 0.6,
        } as RankedFoodAlternative,
      ],
      searchCandidates: searchCandidatesSample(),
      brief: foodBrief(),
    });
    expect(d.why2People).toBeTruthy();
    expect(d.address).toBe("道玄坂（渋谷駅）");
    expect(d.priceBand).toBe("¥3,000〜¥3,999");
    expect(d.operatingHours).toBe("17:00-24:00");
    // access は searchCandidate の description から「渋谷駅 徒歩 5 分」を抽出
    expect(d.access).toMatch(/徒歩/);
    expect(d.booking).not.toBeNull();
    expect(d.sources.length).toBeGreaterThan(0);
    // catalog sourceUrl の label は「お店情報」
    expect(d.sources[0].label).toBe("お店情報");
    expect(d.alternatives.length).toBe(1);
    expect(d.alternatives[0].title).toBe("居酒屋 あおい");
  });

  it("alternatives は上限 2", () => {
    const alt = (name: string): RankedFoodAlternative => ({
      candidateKey: `k:${name}`,
      venue: venue({ name }),
      sourceUrl: `https://x/${name}`,
      reason: "r",
      topRole: "safety",
      topRoleScore: 0.5,
    });
    const d = buildCandidateDetailFood({
      candidate: frc(),
      alternatives: [alt("A"), alt("B"), alt("C")],
      searchCandidates: [],
      brief: foodBrief(),
    });
    expect(d.alternatives.length).toBe(2);
  });

  it("自分と同名の alternative は除外される", () => {
    const d = buildCandidateDetailFood({
      candidate: frc(),
      alternatives: [
        {
          candidateKey: "self-dup",
          venue: venue(), // 同じ name
          sourceUrl: "x",
          reason: "dup",
          topRole: "balance",
          topRoleScore: 0.5,
        },
      ],
      searchCandidates: [],
      brief: foodBrief(),
    });
    expect(d.alternatives.length).toBe(0);
  });
});

// ─────────────────────────────────────────────
// buildSummaryFood / buildOneLinerFood
// ─────────────────────────────────────────────

describe("buildSummaryFood", () => {
  it("ranked>0: 軒数・日時エリアを含む", () => {
    const s = buildSummaryFood(foodBrief(), [frc(), frc()]);
    expect(s).toContain("渋谷");
    expect(s).toContain("今週末");
    expect(s).toContain("2軒");
    expect(s).toContain("ご飯");
  });

  it("ranked=0: clarify 寄りの文（「もう少し情報」）", () => {
    const s = buildSummaryFood(foodBrief(), []);
    expect(s).toContain("もう少し情報");
    expect(s).not.toContain("2軒");
  });

  it("area/date/timeSlot 全 null → 「近いうち」に落ちる（創作しない）", () => {
    const b = foodBrief({
      area: null,
      approximateTime: { date: null, timeSlot: null, preferredStartHour: null },
    });
    const s = buildSummaryFood(b, [frc()]);
    expect(s.startsWith("近いうち")).toBe(true);
    // 勝手に「渋谷」「夜」等を作らない
    expect(s).not.toMatch(/渋谷|新宿|夜|昼|朝|夕方/);
  });
});

describe("buildOneLinerFood", () => {
  it("role=balance + matched あり → headline + 括弧内に matched 1 つ", () => {
    const s = buildOneLinerFood(frc());
    expect(s).toContain("2人の折り合いが取りやすい1軒");
    expect(s).toContain("日本酒"); // matchedInterestsA[0]
  });

  it("matched なし → headline のみ（括弧なし）", () => {
    const s = buildOneLinerFood(
      frc({
        rationale: {
          matchedInterestsA: [],
          matchedInterestsB: [],
          matchedValuesA: [],
          matchedValuesB: [],
          appealedAxis: ["balance"],
          tradeoff: null,
          contingencyHint: null,
        },
      }),
    );
    expect(s).toBe("2人の折り合いが取りやすい1軒");
    expect(s).not.toContain("（");
  });

  it("role=aFocus → A さん 寄り 1軒", () => {
    const s = buildOneLinerFood(frc({ role: "aFocus" }));
    expect(s).toContain("Aさんの好みに寄せた1軒");
  });

  it("food の headline には「1本」ではなく「1軒」が使われる", () => {
    const s = buildOneLinerFood(frc({ role: "safety" }));
    expect(s).toContain("1軒");
    expect(s).not.toContain("1本");
  });
});

// ─────────────────────────────────────────────
// fallback 創作検査: buildWhy2PeopleFood
// ─────────────────────────────────────────────

describe("buildWhy2PeopleFood — 事実改変禁止 fallback 検査", () => {
  const why = __internal.buildWhy2PeopleFood;

  const factsProbe = /駅|徒歩|円|¥|時|分|\d+:\d+|営業/;

  it("matchedInterests 両側空 → 抽象 fallback 文。数字や時刻・価格は含まない", () => {
    const s = why(
      frc({
        rationale: {
          matchedInterestsA: [],
          matchedInterestsB: [],
          matchedValuesA: [],
          matchedValuesB: [],
          appealedAxis: ["balance"],
          tradeoff: null,
          contingencyHint: null,
        },
      }),
    );
    expect(s).toContain("1軒");
    expect(s).not.toMatch(factsProbe);
  });

  it("片側のみ matched → 片側寄り 1軒文（事実語を含まない）", () => {
    const s = why(
      frc({
        rationale: {
          matchedInterestsA: ["日本酒"],
          matchedInterestsB: [],
          matchedValuesA: [],
          matchedValuesB: [],
          appealedAxis: ["aFocus"],
          tradeoff: null,
          contingencyHint: null,
        },
      }),
    );
    expect(s).toContain("日本酒");
    expect(s).toContain("1軒");
    expect(s).not.toMatch(factsProbe);
  });

  it("両側異なる matched → 「Aには…、Bには…」（venue 事実語を含まない）", () => {
    const s = why(
      frc({
        rationale: {
          matchedInterestsA: ["日本酒"],
          matchedInterestsB: ["和食"],
          matchedValuesA: [],
          matchedValuesB: [],
          appealedAxis: ["balance"],
          tradeoff: null,
          contingencyHint: null,
        },
      }),
    );
    expect(s).toContain("日本酒");
    expect(s).toContain("和食");
    expect(s).not.toMatch(factsProbe);
  });

  it("両側共通 matched → 「2人ともに響く…の軸で中間が取れる1軒」", () => {
    const s = why(
      frc({
        rationale: {
          matchedInterestsA: ["和食"],
          matchedInterestsB: ["和食"],
          matchedValuesA: [],
          matchedValuesB: [],
          appealedAxis: ["balance"],
          tradeoff: null,
          contingencyHint: null,
        },
      }),
    );
    expect(s).toContain("和食");
    expect(s).toContain("1軒");
    expect(s).not.toMatch(factsProbe);
  });
});

// ─────────────────────────────────────────────
// formatWhenFromBrief — 共通側の「近いうち」fallback
// ─────────────────────────────────────────────

describe("formatWhenFromBrief — food 経由でも共通挙動", () => {
  it("area/date/timeSlot 全 null で「近いうち」", () => {
    const s = formatWhenFromBrief(
      foodBrief({
        area: null,
        approximateTime: { date: null, timeSlot: null, preferredStartHour: null },
      }),
    );
    expect(s).toBe("近いうち");
  });

  it("timeSlot=night の日本語表示", () => {
    const s = formatWhenFromBrief(foodBrief());
    expect(s).toContain("夜");
  });
});
