/**
 * CoAlter Stage 1d — foodLensAdapter unit tests
 *
 * F-1 (2026-04-20) scope:
 *   - 4 軸派生: hungerLevel / timeWindow / atmosphereDesire / moodTags
 *   - 由来: derivationSource が生テキストを含まず source-ref 文字列のみ
 *   - logic のみ: LLM / 外部 I/O 無し、純関数
 */

import { describe, expect, it } from "vitest";

import {
  buildFoodLensToday,
  __internal,
  type BuildFoodLensTodayInput,
  type FoodLensToday,
} from "@/lib/coalter/understanding/foodLensAdapter";
import type {
  ConversationTurn,
  EnvironmentalObservation,
  TwoPersonLensToday,
  UserId,
} from "@/lib/coalter/understanding/types";

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

const UID_A = "u_a" as UserId;
const UID_B = "u_b" as UserId;

function turn(senderId: UserId, body: string): ConversationTurn {
  return { senderId, body, createdAt: "2026-04-20T12:00:00Z" };
}

function buildEnv(
  overrides: Partial<EnvironmentalObservation> = {},
): EnvironmentalObservation {
  return {
    timestamp: "2026-04-20T12:00:00+09:00",
    weather: null,
    seasonality: "spring",
    dayType: "weekday",
    timeOfDay: "afternoon",
    ...overrides,
  };
}

function buildLens(
  overrides: {
    mode?: TwoPersonLensToday["todayReading"]["mode"];
    temperature?: TwoPersonLensToday["relationalLens"]["temperature"];
    latentNeeds?: string[];
    careAxes?: string[];
  } = {},
): TwoPersonLensToday {
  return {
    personalLenses: {
      a: {
        userId: UID_A,
        displayName: "A",
        coreDecisionPrinciples: [],
        currentEmotionalHue: "静か",
        todaySensitivities: [],
        comfortPathways: [],
        sourcedFrom: { stargazer: [], alter: [], behavioral: [] },
      },
      b: {
        userId: UID_B,
        displayName: "B",
        coreDecisionPrinciples: [],
        currentEmotionalHue: "穏やか",
        todaySensitivities: [],
        comfortPathways: [],
        sourcedFrom: { stargazer: [], alter: [], behavioral: [] },
      },
    },
    relationalLens: {
      temperature: overrides.temperature ?? "warm",
      dominantDynamic: "",
      careAxes: overrides.careAxes ?? [],
      avoidElements: [],
      interactionPace: "steady",
    },
    todayReading: {
      mode: overrides.mode ?? "maintain",
      energyBudget: "mid",
      timeBudget: "ample",
      implicitIntent: "",
      latentNeeds: overrides.latentNeeds ?? [],
      confidence: 0.5,
    },
    fairnessAdjustment: {
      favorSide: null,
      rationale: null,
      strength: 0,
      basedOnSessionCount: 0,
    },
    understanding_confidence: 0.5,
    dataGaps: [],
    computedAt: "2026-04-20T12:00:00Z",
    lensVersion: "1.0.0",
  };
}

function build(
  args: Partial<BuildFoodLensTodayInput> & {
    lens: TwoPersonLensToday;
    environmental?: EnvironmentalObservation;
    turns?: ConversationTurn[];
  },
): FoodLensToday {
  return buildFoodLensToday({
    lens: args.lens,
    environmental: args.environmental ?? buildEnv(),
    turns: args.turns ?? [],
  });
}

// ═════════════════════════════════════════════════════════════════════════
// hungerLevel
// ═════════════════════════════════════════════════════════════════════════

describe("buildFoodLensToday — hungerLevel", () => {
  it("満腹系表現は satisfied に倒す", () => {
    const r = build({
      lens: buildLens(),
      turns: [turn(UID_A, "さっき食べたばっかりで満腹")],
    });
    expect(r.foodContext.hungerLevel).toBe("satisfied");
    expect(r.derivationSource.hungerLevel).toContain(
      "turn.regex:hunger_satisfied",
    );
  });

  it("「お腹空いた」は very_hungry", () => {
    const r = build({
      lens: buildLens(),
      turns: [turn(UID_A, "お腹空いたね、がっつり食べたい")],
    });
    expect(r.foodContext.hungerLevel).toBe("very_hungry");
  });

  it("「軽く」は peckish", () => {
    const r = build({
      lens: buildLens(),
      turns: [turn(UID_A, "軽くつまめるところがいいな")],
    });
    expect(r.foodContext.hungerLevel).toBe("peckish");
  });

  it("signal 無し + afternoon は unknown（食事帯フォールバックの対象外）", () => {
    const r = build({
      lens: buildLens(),
      environmental: buildEnv({ timeOfDay: "afternoon" }),
      turns: [],
    });
    expect(r.foodContext.hungerLevel).toBe("unknown");
  });

  it("signal 無し + evening は hungry にフォールバック", () => {
    const r = build({
      lens: buildLens(),
      environmental: buildEnv({ timeOfDay: "evening" }),
      turns: [],
    });
    expect(r.foodContext.hungerLevel).toBe("hungry");
    expect(r.derivationSource.hungerLevel).toContain(
      "environmental.timeOfDay=evening",
    );
  });

  it("satisfied が very/peckish より優先される（食べ終わり優先）", () => {
    const r = build({
      lens: buildLens(),
      turns: [turn(UID_A, "さっき食べたけど、まだお腹空いたかも")],
    });
    expect(r.foodContext.hungerLevel).toBe("satisfied");
  });
});

// ═════════════════════════════════════════════════════════════════════════
// timeWindow
// ═════════════════════════════════════════════════════════════════════════

describe("buildFoodLensToday — timeWindow", () => {
  it("「ランチ」は lunch", () => {
    const r = build({
      lens: buildLens(),
      turns: [turn(UID_A, "ランチしに行きたい")],
    });
    expect(r.foodContext.timeWindow).toBe("lunch");
  });

  it("「ディナー」は dinner", () => {
    const r = build({
      lens: buildLens(),
      turns: [turn(UID_A, "今夜ディナーどう？")],
    });
    expect(r.foodContext.timeWindow).toBe("dinner");
  });

  it("「締めの一杯」は late_night（dinner より優先）", () => {
    const r = build({
      lens: buildLens(),
      turns: [turn(UID_A, "夜ご飯のあと、締めの一杯寄りたい")],
    });
    expect(r.foodContext.timeWindow).toBe("late_night");
  });

  it("signal 無し + morning は breakfast", () => {
    const r = build({
      lens: buildLens(),
      environmental: buildEnv({ timeOfDay: "morning" }),
      turns: [],
    });
    expect(r.foodContext.timeWindow).toBe("breakfast");
    expect(r.derivationSource.timeWindow).toContain(
      "environmental.timeOfDay=morning",
    );
  });

  it("signal 無し + night は late_night", () => {
    const r = build({
      lens: buildLens(),
      environmental: buildEnv({ timeOfDay: "night" }),
      turns: [],
    });
    expect(r.foodContext.timeWindow).toBe("late_night");
  });

  it("「遅めのランチ」は late_lunch（lunch より優先）", () => {
    const r = build({
      lens: buildLens(),
      turns: [turn(UID_A, "遅めのランチで合流したい")],
    });
    expect(r.foodContext.timeWindow).toBe("late_lunch");
  });
});

// ═════════════════════════════════════════════════════════════════════════
// atmosphereDesire
// ═════════════════════════════════════════════════════════════════════════

describe("buildFoodLensToday — atmosphereDesire", () => {
  it("recover + warm → quiet / private / warm_low", () => {
    const r = build({
      lens: buildLens({ mode: "recover", temperature: "warm" }),
    });
    expect(r.foodContext.atmosphereDesire).toEqual({
      quietness: "quiet",
      density: "private",
      lighting: "warm_low",
    });
    expect(r.derivationSource.atmosphereDesire).toEqual(
      expect.arrayContaining([
        "relationalLens.temperature=warm",
        "todayReading.mode=recover",
      ]),
    );
  });

  it("celebrate → lively / spacious / bright", () => {
    const r = build({
      lens: buildLens({ mode: "celebrate", temperature: "warm" }),
    });
    expect(r.foodContext.atmosphereDesire).toEqual({
      quietness: "lively",
      density: "spacious",
      lighting: "bright",
    });
  });

  it("connect + warm → quiet / intimate / warm_low", () => {
    const r = build({
      lens: buildLens({ mode: "connect", temperature: "warm" }),
    });
    expect(r.foodContext.atmosphereDesire).toEqual({
      quietness: "quiet",
      density: "intimate",
      lighting: "warm_low",
    });
  });

  it("connect + cool → moderate / private（冷却時の防御）", () => {
    const r = build({
      lens: buildLens({ mode: "connect", temperature: "cool" }),
    });
    expect(r.foodContext.atmosphereDesire.quietness).toBe("moderate");
    expect(r.foodContext.atmosphereDesire.density).toBe("private");
  });

  it("maintain + neutral → either に倒す（押し付けない）", () => {
    const r = build({
      lens: buildLens({ mode: "maintain", temperature: "neutral" }),
    });
    expect(r.foodContext.atmosphereDesire.quietness).toBe("either");
    expect(r.foodContext.atmosphereDesire.density).toBe("either");
    expect(r.foodContext.atmosphereDesire.lighting).toBe("either");
  });
});

// ═════════════════════════════════════════════════════════════════════════
// moodTags
// ═════════════════════════════════════════════════════════════════════════

describe("buildFoodLensToday — moodTags", () => {
  it("recover mode は「疲労回復」を含む", () => {
    const r = build({ lens: buildLens({ mode: "recover" }) });
    expect(r.foodContext.moodTags).toContain("疲労回復");
  });

  it("celebrate mode は「祝祭」", () => {
    const r = build({ lens: buildLens({ mode: "celebrate" }) });
    expect(r.foodContext.moodTags).toContain("祝祭");
  });

  it("latentNeeds / careAxes を吸収して重複排除", () => {
    const r = build({
      lens: buildLens({
        mode: "recover",
        latentNeeds: ["静かに整える", "疲労回復"],
        careAxes: ["B の疲労"],
      }),
    });
    expect(r.foodContext.moodTags).toEqual(
      expect.arrayContaining(["疲労回復", "静かに整える", "B の疲労"]),
    );
    // 「疲労回復」は mode 由来と latentNeeds 由来の両方から来るが 1 件に圧縮
    const occurrences = r.foodContext.moodTags.filter((t) => t === "疲労回復");
    expect(occurrences).toHaveLength(1);
  });

  it("長すぎる tag（>16 文字）はドロップされる", () => {
    const longTag = "とても長い需要を表すタグで十六文字を越えてしまう";
    const r = build({
      lens: buildLens({ mode: "maintain", latentNeeds: [longTag] }),
    });
    expect(r.foodContext.moodTags).not.toContain(longTag);
  });

  it("出力 tag 数は 5 件までに制限される", () => {
    const r = build({
      lens: buildLens({
        mode: "recover",
        latentNeeds: ["A", "B", "C", "D", "E", "F", "G"],
        careAxes: ["X", "Y", "Z"],
      }),
    });
    expect(r.foodContext.moodTags.length).toBeLessThanOrEqual(5);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// derivationSource — PII 配慮
// ═════════════════════════════════════════════════════════════════════════

describe("buildFoodLensToday — derivationSource", () => {
  it("derivationSource に原文ユーザー発話は混ざらない（source-ref のみ）", () => {
    const rawUtterance = "今夜ディナーしたい！お腹空いた";
    const r = build({
      lens: buildLens({ mode: "connect", latentNeeds: ["近くで会いたい"] }),
      turns: [turn(UID_A, rawUtterance)],
    });

    const allSources = [
      ...r.derivationSource.hungerLevel,
      ...r.derivationSource.timeWindow,
      ...r.derivationSource.atmosphereDesire,
      ...r.derivationSource.moodTags,
    ];
    for (const s of allSources) {
      expect(s).not.toContain(rawUtterance);
      expect(s).not.toContain("今夜ディナー");
      expect(s).not.toContain("お腹空いた");
    }
  });

  it("lens 本体は素通し保持される（narration 側で sourcedFrom を引ける）", () => {
    const lens = buildLens({ mode: "recover" });
    const r = build({ lens });
    expect(r.lens).toBe(lens);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// 純関数 / 決定論
// ═════════════════════════════════════════════════════════════════════════

describe("buildFoodLensToday — purity", () => {
  it("同一入力で同一出力（決定論）", () => {
    const input: BuildFoodLensTodayInput = {
      lens: buildLens({ mode: "connect", temperature: "warm" }),
      environmental: buildEnv({ timeOfDay: "evening" }),
      turns: [turn(UID_A, "今夜ディナーどう？")],
    };
    const a = buildFoodLensToday(input);
    const b = buildFoodLensToday(input);
    expect(a).toEqual(b);
  });

  it("100 呼び出しでも十分高速（≤100ms 予算の sanity）", () => {
    const input: BuildFoodLensTodayInput = {
      lens: buildLens({ mode: "celebrate", temperature: "warm" }),
      environmental: buildEnv({ timeOfDay: "evening" }),
      turns: [turn(UID_A, "ディナーしよう")],
    };
    const start = Date.now();
    for (let i = 0; i < 100; i++) {
      buildFoodLensToday(input);
    }
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(100);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// Internal regex（sanity）
// ═════════════════════════════════════════════════════════════════════════

describe("foodLensAdapter — internal regex sanity", () => {
  it("HUNGER_VERY は代表語をすべて拾う", () => {
    expect(__internal.HUNGER_VERY.test("お腹空いた")).toBe(true);
    expect(__internal.HUNGER_VERY.test("腹減った")).toBe(true);
    expect(__internal.HUNGER_VERY.test("がっつり")).toBe(true);
  });

  it("TIME_LUNCH は late_lunch 表現には反応するが late_lunch regex が先に勝つ契約", () => {
    expect(__internal.TIME_LUNCH.test("ランチ")).toBe(true);
    // 本体の deriveTimeWindow は late_lunch を先に判定する。
    expect(__internal.TIME_LATE_LUNCH.test("遅めのランチ")).toBe(true);
  });
});
