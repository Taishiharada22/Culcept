/**
 * §7 Step A (2026-04-20): U3 exclusion gate telemetry の観測テスト。
 *
 * 方針:
 *   - behavior 非変更（U3 hit 時は既存どおり shouldSearch:false を返す）
 *   - telemetry emit の payload shape を固定し、Step B の集計キー不変を保証
 *   - theme-aware helper が food 以外でも動くことを最低 1 件で検証
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/stargazer/perspectiveEngine", () => ({
  executeSearch: vi.fn(async () => []),
}));

import { decideSearch } from "@/lib/coalter/webConnector";
import type {
  ConversationAnalysis,
  ConversationTheme,
  ConversationTurn,
  ExtractedConstraints,
} from "@/lib/coalter/types";
import {
  extractMatchedTerms,
  hasActionableConstraintsByTheme,
  maskSensitiveText,
} from "@/lib/coalter/u3Telemetry";

type PartialConstraints = Partial<ExtractedConstraints>;

function makeAnalysis(opts: {
  theme: ConversationTheme;
  body: string;
  constraints?: PartialConstraints;
}): ConversationAnalysis {
  const turns: ConversationTurn[] = [
    {
      senderId: "a",
      body: opts.body,
      createdAt: "2026-04-20T10:00:00Z",
    },
  ];
  return {
    theme: opts.theme,
    stalemate: null,
    recentMessages: turns,
    caringIntensityA: 0.5,
    caringIntensityB: 0.5,
    extractedConstraints: {
      date: null,
      location: null,
      budget: null,
      timeSlot: null,
      preferences: [],
      ...(opts.constraints ?? {}),
    },
    constraintScore: 0.3,
    agreedConstraints: [],
  };
}

interface U3GatePayload {
  theme: string;
  matched_pattern: string;
  matched_terms: string[];
  matched_text_sample: string;
  would_have_searched_without_u3: boolean;
  counterfactual_queries_count: number;
  has_actionable_constraints: boolean;
  actionable_breakdown: {
    has_location: boolean;
    has_time: boolean;
    has_target: boolean;
    has_preference: boolean;
  };
  u3_gate_applied: boolean;
  abolition_active: boolean;
  reason_for_skip: string;
}

type InfoSpy = ReturnType<typeof vi.spyOn>;

function captureU3Gate(spy: InfoSpy): U3GatePayload | null {
  const call = spy.mock.calls.find(
    (args: unknown[]) => args[0] === "[CoAlter] webConnector.u3_gate",
  );
  if (!call) return null;
  return JSON.parse(call[1] as string) as U3GatePayload;
}

function hasDecisionLog(spy: InfoSpy): boolean {
  return spy.mock.calls.some(
    (args: unknown[]) => args[0] === "[CoAlter] webConnector.decision",
  );
}

describe("webConnector §7 Step A: U3 telemetry (behavior 非変更)", () => {
  let infoSpy: InfoSpy;

  beforeEach(() => {
    infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
  });
  afterEach(() => {
    infoSpy.mockRestore();
  });

  describe("emit 条件 / payload shape", () => {
    it("emotion only（food, 制約なし）→ u3_gate emit / actionable=false", () => {
      const d = decideSearch(
        makeAnalysis({ theme: "food", body: "なんかモヤモヤする気分" }),
      );
      // behavior 非変更
      expect(d.shouldSearch).toBe(false);
      expect(d.queries).toEqual([]);

      const payload = captureU3Gate(infoSpy);
      expect(payload).not.toBeNull();
      expect(payload!.theme).toBe("food");
      expect(payload!.matched_pattern).toBe("気持ち|感情|気分");
      expect(payload!.matched_terms).toEqual(["気分"]);
      expect(payload!.has_actionable_constraints).toBe(false);
      // NOTE: food theme は制約ゼロでも fallback クエリ（"おすすめ レストラン デート"）
      //   を生成するため、counterfactual は wouldSearch=true になる。
      //   これは「U3 が無ければ noise クエリも発火する」を Step B の判断で
      //   actionable 有無と組み合わせて評価するための signal。
      expect(payload!.would_have_searched_without_u3).toBe(true);
      expect(payload!.counterfactual_queries_count).toBeGreaterThan(0);
      expect(payload!.u3_gate_applied).toBe(true);
      expect(payload!.abolition_active).toBe(false);
      expect(payload!.reason_for_skip).toBe("感情・関係性の話題のため検索不要");
    });

    it("emotion + location（food, 新宿）→ actionable=true / would=true（over-blocking 証拠）", () => {
      const d = decideSearch(
        makeAnalysis({
          theme: "food",
          body: "新宿でラーメン食べたい気分なんだよね",
          constraints: { location: "新宿", preferences: ["ラーメン"] },
        }),
      );
      expect(d.shouldSearch).toBe(false);
      expect(d.queries).toEqual([]);

      const payload = captureU3Gate(infoSpy);
      expect(payload).not.toBeNull();
      expect(payload!.has_actionable_constraints).toBe(true);
      expect(payload!.actionable_breakdown.has_location).toBe(true);
      expect(payload!.actionable_breakdown.has_target).toBe(true);
      expect(payload!.would_have_searched_without_u3).toBe(true);
      expect(payload!.counterfactual_queries_count).toBeGreaterThan(0);
      expect(payload!.u3_gate_applied).toBe(true);
      expect(payload!.abolition_active).toBe(false);
    });

    it("emotion + time（food, timeSlot=夜）→ actionable_breakdown.has_time=true", () => {
      const d = decideSearch(
        makeAnalysis({
          theme: "food",
          body: "疲れたから何か食べたい気分",
          constraints: { timeSlot: "夜" },
        }),
      );
      expect(d.shouldSearch).toBe(false);

      const payload = captureU3Gate(infoSpy);
      expect(payload).not.toBeNull();
      expect(payload!.actionable_breakdown.has_time).toBe(true);
      expect(payload!.has_actionable_constraints).toBe(true);
    });

    it("non-U3 path（food, 感情語なし）→ u3_gate 非 emit / decision log のみ", () => {
      const d = decideSearch(
        makeAnalysis({
          theme: "food",
          body: "新宿でラーメン食べたい",
          constraints: { location: "新宿", preferences: ["ラーメン"] },
        }),
      );
      expect(d.shouldSearch).toBe(true);
      expect(d.queries.length).toBeGreaterThan(0);

      expect(captureU3Gate(infoSpy)).toBeNull();
      expect(hasDecisionLog(infoSpy)).toBe(true);
    });
  });

  describe("behavior 非変更の契約", () => {
    const emotionSamples: Array<{ theme: ConversationTheme; body: string }> = [
      { theme: "food", body: "モヤモヤするし、気分じゃない" },
      { theme: "movie", body: "最近すれ違いが多くて喧嘩した" },
      { theme: "travel", body: "二人の距離感が気になる" },
      { theme: "activity", body: "感情が追いつかない" },
    ];

    for (const s of emotionSamples) {
      it(`[${s.theme}] U3 hit 時は常に shouldSearch:false / queries:[]`, () => {
        const d = decideSearch(makeAnalysis({ theme: s.theme, body: s.body }));
        expect(d.shouldSearch).toBe(false);
        expect(d.queries).toEqual([]);
        expect(d.reason).toBe("感情・関係性の話題のため検索不要");
      });
    }
  });

  describe("pure refactor 不変（buildSearchDecisionCore 抽出）", () => {
    it("non-U3 path の return 値が従来と同形: shouldSearch / reason / queries", () => {
      const d = decideSearch(
        makeAnalysis({
          theme: "food",
          body: "新宿でラーメン食べたい",
          constraints: { location: "新宿", preferences: ["ラーメン"] },
        }),
      );
      expect(d.shouldSearch).toBe(true);
      expect(d.reason).toContain("food");
      expect(Array.isArray(d.queries)).toBe(true);
      expect(d.queries.length).toBeGreaterThan(0);
    });
  });

  describe("theme-aware helper（non-food 1 ケース: travel）", () => {
    it("travel + location あり → actionable=true（has_location ルート）", () => {
      const d = decideSearch(
        makeAnalysis({
          theme: "travel",
          body: "京都で温泉行きたい気分",
          constraints: { location: "京都" },
        }),
      );
      expect(d.shouldSearch).toBe(false);

      const payload = captureU3Gate(infoSpy);
      expect(payload).not.toBeNull();
      expect(payload!.theme).toBe("travel");
      expect(payload!.actionable_breakdown.has_location).toBe(true);
      expect(payload!.actionable_breakdown.has_target).toBe(true); // 「温泉」
      expect(payload!.has_actionable_constraints).toBe(true);
    });

    it("travel + 何もなし（目的地も時期も target も無し）→ actionable=false", () => {
      // travel は location / (target + time) ルールなので、
      // location=null かつ target は検出されるが time=null の場合 actionable=false
      const d = decideSearch(
        makeAnalysis({ theme: "travel", body: "なんか気分が乗らないな" }),
      );
      expect(d.shouldSearch).toBe(false);

      const payload = captureU3Gate(infoSpy);
      expect(payload).not.toBeNull();
      expect(payload!.theme).toBe("travel");
      expect(payload!.has_actionable_constraints).toBe(false);
    });
  });
});

describe("u3Telemetry: hasActionableConstraintsByTheme", () => {
  function mkAnalysis(
    body: string,
    c: PartialConstraints = {},
  ): ConversationAnalysis {
    return {
      theme: "food",
      stalemate: null,
      recentMessages: [
        { senderId: "a", body, createdAt: "2026-04-20T10:00:00Z" },
      ],
      caringIntensityA: 0.5,
      caringIntensityB: 0.5,
      extractedConstraints: {
        date: null,
        location: null,
        budget: null,
        timeSlot: null,
        preferences: [],
        ...c,
      },
      constraintScore: 0,
    };
  }

  it("food: location / time / target いずれかで actionable=true", () => {
    expect(
      hasActionableConstraintsByTheme(
        mkAnalysis("", { location: "新宿" }),
        "food",
      ).hasActionable,
    ).toBe(true);
    expect(
      hasActionableConstraintsByTheme(
        mkAnalysis("", { timeSlot: "夜" }),
        "food",
      ).hasActionable,
    ).toBe(true);
    expect(
      hasActionableConstraintsByTheme(mkAnalysis("ラーメン食べたい"), "food")
        .hasActionable,
    ).toBe(true);
    expect(
      hasActionableConstraintsByTheme(mkAnalysis("気分が乗らない"), "food")
        .hasActionable,
    ).toBe(false);
  });

  it("movie: target 単独で actionable=true, location 単独は false", () => {
    expect(
      hasActionableConstraintsByTheme(
        mkAnalysis("アニメ映画見たい"),
        "movie",
      ).hasActionable,
    ).toBe(true);
    expect(
      hasActionableConstraintsByTheme(
        mkAnalysis("", { location: "渋谷" }),
        "movie",
      ).hasActionable,
    ).toBe(false); // location + time が必要
    expect(
      hasActionableConstraintsByTheme(
        mkAnalysis("", { location: "渋谷", date: "土曜" }),
        "movie",
      ).hasActionable,
    ).toBe(true);
  });

  it("travel: location 単独で true, target 単独は false（time と組で true）", () => {
    expect(
      hasActionableConstraintsByTheme(
        mkAnalysis("", { location: "京都" }),
        "travel",
      ).hasActionable,
    ).toBe(true);
    expect(
      hasActionableConstraintsByTheme(mkAnalysis("温泉行きたい"), "travel")
        .hasActionable,
    ).toBe(false); // target のみ, time なし
    expect(
      hasActionableConstraintsByTheme(
        mkAnalysis("温泉行きたい", { date: "来週" }),
        "travel",
      ).hasActionable,
    ).toBe(true);
  });

  it("activity: location または target で true", () => {
    expect(
      hasActionableConstraintsByTheme(
        mkAnalysis("美術館行きたい"),
        "activity",
      ).hasActionable,
    ).toBe(true);
    expect(
      hasActionableConstraintsByTheme(
        mkAnalysis("", { location: "上野" }),
        "activity",
      ).hasActionable,
    ).toBe(true);
    expect(
      hasActionableConstraintsByTheme(mkAnalysis("何しよう"), "activity")
        .hasActionable,
    ).toBe(false);
  });
});

describe("u3Telemetry: extractMatchedTerms", () => {
  it("単純 alternation から hit 語のみ返す", () => {
    const pattern = /気持ち|感情|気分/;
    expect(extractMatchedTerms(pattern, "なんか気分が乗らない")).toEqual([
      "気分",
    ]);
    expect(extractMatchedTerms(pattern, "感情も気分もばらばら")).toEqual([
      "感情",
      "気分",
    ]);
    expect(extractMatchedTerms(pattern, "特に問題ない")).toEqual([]);
  });

  it("複雑な正規表現構造は安全側で空配列", () => {
    expect(extractMatchedTerms(/(.{2,10})(はどう)/, "これはどう")).toEqual([]);
    expect(extractMatchedTerms(/\d+円/, "3000円")).toEqual([]);
  });
});

describe("u3Telemetry: maskSensitiveText", () => {
  it("32 字で truncate", () => {
    const text = "あ".repeat(50);
    expect(maskSensitiveText(text, 32).length).toBe(32);
  });

  it("email をマスク", () => {
    expect(maskSensitiveText("連絡先 test@example.com だよ", 64)).toBe(
      "連絡先 [EMAIL] だよ",
    );
  });

  it("URL をマスク", () => {
    expect(
      maskSensitiveText("見て https://example.com/path これ", 64),
    ).toContain("[URL]");
  });

  it("長い数字列をマスク", () => {
    expect(maskSensitiveText("code 123456 です", 64)).toBe("code [NUM] です");
  });

  it("短い数字はそのまま（3桁以下）", () => {
    expect(maskSensitiveText("3時に会おう", 64)).toBe("3時に会おう");
  });
});
