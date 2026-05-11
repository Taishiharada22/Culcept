/**
 * D-1-a Query Derivation 単体テスト。
 *
 * 検証軸 (mainstream plan §3.2 元 D-2-a):
 *   1. lens → query の決定論性 (同 lens 2 回 → deep-equal)
 *   2. veto_guard 反映 (relationalLens.avoidElements → exclude)
 *   3. mode → mood マッピング (5 mode 全部)
 *   4. 例外規則: challenge × cool → thought-provoking
 *   5. energyBudget → weight (3 段階)
 *   6. timeBudget → length_minutes_max (3 段階、ample で null)
 *   7. era 既定 "now-showing"
 *   8. genres: mode から既定取得
 *   9. couple_fit_hints: mode × temperature 表
 *  10. avoidElements 空 → exclude 空配列
 *  11. immutability: 入力 lens / 内部 table の mutate なし
 *
 * 凍結線 (handover §4.2): import は understanding/types のみ、queryDerivation 自身。
 */

import { describe, it, expect } from "vitest";
import {
  deriveMovieQuery,
  type MoodTag,
  type MovieQuery,
} from "@/lib/coalter/movie/queryDerivation";
import type {
  PersonalLens,
  RelationalTemperature,
  TodayMode,
  TwoPersonLensToday,
  UserId,
} from "@/lib/coalter/understanding/types";

// ═══════════════════════════════════════════════════════════════════════════
// fixture builder — queryDerivation が参照する 5 フィールドのみ override
// ═══════════════════════════════════════════════════════════════════════════

type LensOverrides = {
  mode?: TodayMode;
  energyBudget?: "high" | "mid" | "low";
  timeBudget?: "ample" | "limited" | "tight";
  temperature?: RelationalTemperature;
  avoidElements?: string[];
};

function buildLens(opts: LensOverrides = {}): TwoPersonLensToday {
  // queryDerivation は personalLenses / fairnessAdjustment / dataGaps 等を参照しないため
  // 最小骨格を `as PersonalLens` で埋める (deriveMovieQuery 内で touch 不要)。
  const minimalPerson = {} as PersonalLens;
  return {
    personalLenses: { a: minimalPerson, b: minimalPerson },
    relationalLens: {
      temperature: opts.temperature ?? "neutral",
      dominantDynamic: "",
      careAxes: [],
      avoidElements: opts.avoidElements ?? [],
      interactionPace: "steady",
    },
    todayReading: {
      mode: opts.mode ?? "maintain",
      energyBudget: opts.energyBudget ?? "mid",
      timeBudget: opts.timeBudget ?? "limited",
      implicitIntent: "",
      latentNeeds: [],
      confidence: 0.7,
    },
    fairnessAdjustment: {
      favorSide: null,
      rationale: null,
      strength: 0,
      basedOnSessionCount: 0,
    },
    understanding_confidence: 0.7,
    dataGaps: [],
    computedAt: "2026-05-11T00:00:00Z",
    lensVersion: "1.0.0",
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. 決定論性 (mainstream plan §3.2: lens → query の決定性)
// ═══════════════════════════════════════════════════════════════════════════

describe("deriveMovieQuery — 決定論性", () => {
  it("同じ lens を 2 回渡すと deep-equal な MovieQuery が返る", () => {
    const lens = buildLens({
      mode: "recover",
      temperature: "warm",
      energyBudget: "low",
      timeBudget: "limited",
      avoidElements: ["重い暴力描写", "悲しすぎる結末"],
    });
    const q1 = deriveMovieQuery(lens);
    const q2 = deriveMovieQuery(lens);
    expect(q1).toEqual(q2);
  });

  it("三段式 §2.3.1 の例: recover + warm + low → comforting / light / 120", () => {
    const lens = buildLens({
      mode: "recover",
      temperature: "warm",
      energyBudget: "low",
      timeBudget: "limited",
    });
    const q = deriveMovieQuery(lens);
    expect(q.mood).toBe<MoodTag>("comforting");
    expect(q.weight).toBe("light");
    expect(q.length_minutes_max).toBe(120);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. veto_guard 反映 (mainstream plan §3.2: veto_guard 反映)
// ═══════════════════════════════════════════════════════════════════════════

describe("deriveMovieQuery — veto_guard (relationalLens.avoidElements → exclude)", () => {
  it("avoidElements の全要素が exclude に同順で反映される", () => {
    const avoid = ["暴力", "ホラー要素", "鬱展開"];
    const lens = buildLens({ avoidElements: avoid });
    const q = deriveMovieQuery(lens);
    expect(q.exclude).toEqual(avoid);
  });

  it("avoidElements が空 → exclude も空配列", () => {
    const lens = buildLens({ avoidElements: [] });
    const q = deriveMovieQuery(lens);
    expect(q.exclude).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. mode → mood マッピング (5 mode)
// ═══════════════════════════════════════════════════════════════════════════

describe("deriveMovieQuery — mode → mood (5 mode 全網羅)", () => {
  const cases: Array<[TodayMode, MoodTag]> = [
    ["recover", "comforting"],
    ["celebrate", "upbeat"],
    ["connect", "mellow"],
    ["challenge", "thrilling"],
    ["maintain", "mellow"],
  ];
  it.each(cases)(
    "mode=%s + temperature=neutral → mood=%s",
    (mode, expectedMood) => {
      const lens = buildLens({ mode, temperature: "neutral" });
      expect(deriveMovieQuery(lens).mood).toBe(expectedMood);
    },
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. 例外規則: challenge × cool → thought-provoking
// ═══════════════════════════════════════════════════════════════════════════

describe("deriveMovieQuery — 例外規則 (challenge × cool)", () => {
  it("challenge + cool → mood=thought-provoking (内省的解釈)", () => {
    const lens = buildLens({ mode: "challenge", temperature: "cool" });
    expect(deriveMovieQuery(lens).mood).toBe<MoodTag>("thought-provoking");
  });

  it("challenge + warm → 既定の thrilling (例外発火しない)", () => {
    const lens = buildLens({ mode: "challenge", temperature: "warm" });
    expect(deriveMovieQuery(lens).mood).toBe<MoodTag>("thrilling");
  });

  it("challenge + neutral → 既定の thrilling (例外発火しない)", () => {
    const lens = buildLens({ mode: "challenge", temperature: "neutral" });
    expect(deriveMovieQuery(lens).mood).toBe<MoodTag>("thrilling");
  });

  it("recover + cool → mood=comforting (例外規則は challenge 限定)", () => {
    const lens = buildLens({ mode: "recover", temperature: "cool" });
    expect(deriveMovieQuery(lens).mood).toBe<MoodTag>("comforting");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. energyBudget → weight (3 段階)
// ═══════════════════════════════════════════════════════════════════════════

describe("deriveMovieQuery — energyBudget → weight", () => {
  const cases: Array<["high" | "mid" | "low", "light" | "medium" | "heavy"]> = [
    ["low", "light"],
    ["mid", "medium"],
    ["high", "heavy"],
  ];
  it.each(cases)("energyBudget=%s → weight=%s", (energyBudget, expected) => {
    const lens = buildLens({ energyBudget });
    expect(deriveMovieQuery(lens).weight).toBe(expected);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. timeBudget → length_minutes_max (3 段階、ample で null)
// ═══════════════════════════════════════════════════════════════════════════

describe("deriveMovieQuery — timeBudget → length_minutes_max", () => {
  it("timeBudget=tight → length_minutes_max=100", () => {
    expect(deriveMovieQuery(buildLens({ timeBudget: "tight" })).length_minutes_max).toBe(100);
  });

  it("timeBudget=limited → length_minutes_max=120", () => {
    expect(deriveMovieQuery(buildLens({ timeBudget: "limited" })).length_minutes_max).toBe(120);
  });

  it("timeBudget=ample → length_minutes_max=null (制限なし)", () => {
    expect(deriveMovieQuery(buildLens({ timeBudget: "ample" })).length_minutes_max).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. era 既定
// ═══════════════════════════════════════════════════════════════════════════

describe("deriveMovieQuery — era 既定", () => {
  it("常に 'now-showing' を返す (Tier 0/1/2 が現上映劇場前提)", () => {
    const lens = buildLens();
    expect(deriveMovieQuery(lens).era).toBe("now-showing");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. genres: mode から既定 (string[] で返る)
// ═══════════════════════════════════════════════════════════════════════════

describe("deriveMovieQuery — genres (mode から既定取得)", () => {
  it("recover → ['ヒューマンドラマ', 'ファンタジー']", () => {
    const q = deriveMovieQuery(buildLens({ mode: "recover" }));
    expect(q.genres).toEqual(["ヒューマンドラマ", "ファンタジー"]);
  });

  it("celebrate → ['コメディ', 'ミュージカル']", () => {
    const q = deriveMovieQuery(buildLens({ mode: "celebrate" }));
    expect(q.genres).toEqual(["コメディ", "ミュージカル"]);
  });

  it("connect → ['ロマンス', 'ヒューマンドラマ']", () => {
    const q = deriveMovieQuery(buildLens({ mode: "connect" }));
    expect(q.genres).toEqual(["ロマンス", "ヒューマンドラマ"]);
  });

  it("challenge → ['サスペンス', 'アクション']", () => {
    const q = deriveMovieQuery(buildLens({ mode: "challenge" }));
    expect(q.genres).toEqual(["サスペンス", "アクション"]);
  });

  it("maintain → ['ヒューマンドラマ']", () => {
    const q = deriveMovieQuery(buildLens({ mode: "maintain" }));
    expect(q.genres).toEqual(["ヒューマンドラマ"]);
  });

  it("genres は array で、すべて非空 string", () => {
    for (const mode of ["recover", "celebrate", "connect", "challenge", "maintain"] as const) {
      const q = deriveMovieQuery(buildLens({ mode }));
      expect(Array.isArray(q.genres)).toBe(true);
      expect(q.genres.length).toBeGreaterThan(0);
      for (const g of q.genres) expect(g.length).toBeGreaterThan(0);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. couple_fit_hints: mode × temperature 表
// ═══════════════════════════════════════════════════════════════════════════

describe("deriveMovieQuery — couple_fit_hints (mode × temperature)", () => {
  it("recover + warm → '静かに寄り添える' を含む 2 件", () => {
    const q = deriveMovieQuery(buildLens({ mode: "recover", temperature: "warm" }));
    expect(q.couple_fit_hints).toEqual(["静かに寄り添える", "落ち着いて見られる"]);
  });

  it("celebrate + cool → '明るすぎない楽しさ' 1 件", () => {
    const q = deriveMovieQuery(buildLens({ mode: "celebrate", temperature: "cool" }));
    expect(q.couple_fit_hints).toEqual(["明るすぎない楽しさ"]);
  });

  it("connect + warm → '会話のきっかけ + 共感' 2 件", () => {
    const q = deriveMovieQuery(buildLens({ mode: "connect", temperature: "warm" }));
    expect(q.couple_fit_hints).toEqual(["会話のきっかけになる", "共感しやすい"]);
  });

  it("どの組合せでも couple_fit_hints は非空 string array", () => {
    for (const mode of ["recover", "celebrate", "connect", "challenge", "maintain"] as const) {
      for (const temperature of ["warm", "neutral", "cool"] as const) {
        const q = deriveMovieQuery(buildLens({ mode, temperature }));
        expect(q.couple_fit_hints.length).toBeGreaterThan(0);
        for (const h of q.couple_fit_hints) expect(h.length).toBeGreaterThan(0);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 10. immutability — 入力 lens を mutate しない / 出力配列の独立性
// ═══════════════════════════════════════════════════════════════════════════

describe("deriveMovieQuery — immutability", () => {
  it("出力 exclude を mutate しても入力 avoidElements は不変 (shallow copy verify)", () => {
    const original = ["暴力", "ホラー"];
    const avoid: string[] = [...original];
    const lens = buildLens({ avoidElements: avoid });
    const q = deriveMovieQuery(lens);
    q.exclude.push("追加要素");
    expect(avoid).toEqual(original);
    expect(lens.relationalLens.avoidElements).toEqual(original);
  });

  it("出力 genres を mutate しても次回呼び出しに影響しない (内部 table の独立性)", () => {
    const lens1 = buildLens({ mode: "recover" });
    const q1 = deriveMovieQuery(lens1);
    q1.genres.push("汚染要素");
    const lens2 = buildLens({ mode: "recover" });
    const q2 = deriveMovieQuery(lens2);
    expect(q2.genres).toEqual(["ヒューマンドラマ", "ファンタジー"]);
  });

  it("出力 couple_fit_hints を mutate しても次回呼び出しに影響しない", () => {
    const lens1 = buildLens({ mode: "celebrate", temperature: "warm" });
    const q1 = deriveMovieQuery(lens1);
    q1.couple_fit_hints.push("汚染");
    const lens2 = buildLens({ mode: "celebrate", temperature: "warm" });
    const q2 = deriveMovieQuery(lens2);
    expect(q2.couple_fit_hints).toEqual(["話題を作れる", "笑える"]);
  });

  it("入力 lens を deriveMovieQuery 呼び出し前後で deep-equal verify", () => {
    const lens = buildLens({
      mode: "challenge",
      temperature: "cool",
      avoidElements: ["重い暴力", "ホラー"],
    });
    const snapshot = JSON.parse(JSON.stringify(lens));
    deriveMovieQuery(lens);
    expect(lens).toEqual(snapshot);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 11. shape verify — MovieQuery 7 fields 全充足
// ═══════════════════════════════════════════════════════════════════════════

describe("deriveMovieQuery — MovieQuery shape", () => {
  it("返り値は 7 fields すべて存在 (genres / mood / weight / length_minutes_max / era / couple_fit_hints / exclude)", () => {
    const q = deriveMovieQuery(buildLens());
    const expectedKeys: Array<keyof MovieQuery> = [
      "genres",
      "mood",
      "weight",
      "length_minutes_max",
      "era",
      "couple_fit_hints",
      "exclude",
    ];
    for (const key of expectedKeys) {
      expect(q).toHaveProperty(key);
    }
    expect(Object.keys(q).sort()).toEqual([...expectedKeys].sort());
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// (helper) UserId branded type の型整合チェック (tsc 段階で担保、test 内では noop)
// ═══════════════════════════════════════════════════════════════════════════

it.skip("placeholder for UserId brand check (tsc compile time)", () => {
  const _u: UserId = "anything" as UserId;
  void _u;
});
