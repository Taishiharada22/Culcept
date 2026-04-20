/**
 * §7 Step B (2026-04-20): U3 exclusion gate abolition（flag 下の新挙動）テスト。
 *
 * 方針:
 *   - flag=OFF 時は Step A の挙動と完全同一（回帰防止）
 *   - flag=ON 時:
 *       - U3 hit + actionable=true  → skip せず通常検索（shouldSearch:true）
 *       - U3 hit + actionable=false → 別 reason で skip（noise 防止）
 *   - telemetry の u3_gate_applied / abolition_active は実挙動の直交 2 bool
 *   - 4 theme（food/movie/travel/activity）すべてで matrix 検証
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/stargazer/perspectiveEngine", () => ({
  executeSearch: vi.fn(async () => []),
}));

import { decideSearch } from "@/lib/coalter/webConnector";
import {
  __setU3AbolitionOverride,
  isU3AbolitionActive,
} from "@/lib/coalter/flags";
import type {
  ConversationAnalysis,
  ConversationTheme,
  ConversationTurn,
  ExtractedConstraints,
} from "@/lib/coalter/types";

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
  reason_for_skip: string | null;
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

describe("flags: isU3AbolitionActive", () => {
  afterEach(() => {
    __setU3AbolitionOverride(null);
  });

  it("default（override なし）は全 theme false", () => {
    expect(isU3AbolitionActive("food")).toBe(false);
    expect(isU3AbolitionActive("movie")).toBe(false);
    expect(isU3AbolitionActive("travel")).toBe(false);
    expect(isU3AbolitionActive("activity")).toBe(false);
  });

  it("abolishable でない theme は override しても常に false", () => {
    __setU3AbolitionOverride({
      food: true,
      movie: true,
      travel: true,
      activity: true,
    });
    expect(isU3AbolitionActive("schedule")).toBe(false);
    expect(isU3AbolitionActive("gift")).toBe(false);
    expect(isU3AbolitionActive("general")).toBe(false);
    expect(isU3AbolitionActive("unknown")).toBe(false);
  });

  it("override は theme 単位で独立", () => {
    __setU3AbolitionOverride({ food: true });
    expect(isU3AbolitionActive("food")).toBe(true);
    expect(isU3AbolitionActive("movie")).toBe(false);
  });

  it("override=null で env fallback に戻る（default false）", () => {
    __setU3AbolitionOverride({ food: true });
    expect(isU3AbolitionActive("food")).toBe(true);
    __setU3AbolitionOverride(null);
    expect(isU3AbolitionActive("food")).toBe(false);
  });
});

describe("§7 Step B: flag=ON 時の U3 撤廃挙動", () => {
  let infoSpy: InfoSpy;

  beforeEach(() => {
    infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
  });
  afterEach(() => {
    infoSpy.mockRestore();
    __setU3AbolitionOverride(null);
  });

  describe("flag=ON + actionable=true → gate 解除 / 通常検索", () => {
    const cases: Array<{
      theme: ConversationTheme;
      body: string;
      constraints: PartialConstraints;
    }> = [
      {
        theme: "food",
        body: "新宿でラーメン食べたい気分",
        constraints: { location: "新宿", preferences: ["ラーメン"] },
      },
      {
        theme: "movie",
        body: "土曜の夜にアニメ映画見たい気持ち",
        constraints: {
          location: "渋谷",
          date: "土曜",
          timeSlot: "夜",
          preferences: ["アニメ"],
        },
      },
      {
        theme: "travel",
        body: "京都で温泉行きたい気分",
        constraints: { location: "京都" },
      },
      {
        theme: "activity",
        body: "美術館行きたい気分",
        constraints: { location: "上野", preferences: ["美術館"] },
      },
    ];

    for (const c of cases) {
      it(`[${c.theme}] shouldSearch=true / u3_gate_applied=false / abolition_active=true`, () => {
        __setU3AbolitionOverride({ [c.theme]: true } as Record<
          "food" | "movie" | "travel" | "activity",
          boolean
        >);

        const d = decideSearch(
          makeAnalysis({
            theme: c.theme,
            body: c.body,
            constraints: c.constraints,
          }),
        );

        // behavior: 通常検索に進む
        expect(d.shouldSearch).toBe(true);
        expect(d.queries.length).toBeGreaterThan(0);
        expect(d.reason).toContain(c.theme);

        // telemetry: u3_gate は emit される（U3 hit 事実は記録）
        const payload = captureU3Gate(infoSpy);
        expect(payload).not.toBeNull();
        expect(payload!.theme).toBe(c.theme);
        expect(payload!.has_actionable_constraints).toBe(true);
        expect(payload!.u3_gate_applied).toBe(false); // ← 撤廃された
        expect(payload!.abolition_active).toBe(true);
        expect(payload!.reason_for_skip).toBeNull();

        // decision log も emit される（通常 path と同形）
        expect(hasDecisionLog(infoSpy)).toBe(true);
      });
    }
  });

  describe("flag=ON + actionable=false → 別 reason で skip（noise 防止）", () => {
    const cases: Array<{ theme: ConversationTheme; body: string }> = [
      { theme: "food", body: "なんかモヤモヤする気分" },
      { theme: "movie", body: "二人の距離感がよく分からない" },
      { theme: "travel", body: "気持ちが落ち着かない" },
      { theme: "activity", body: "すれ違いが多い気がする" },
    ];

    for (const c of cases) {
      it(`[${c.theme}] shouldSearch=false / u3_gate_applied=true / abolition_active=true`, () => {
        __setU3AbolitionOverride({ [c.theme]: true } as Record<
          "food" | "movie" | "travel" | "activity",
          boolean
        >);

        const d = decideSearch(makeAnalysis({ theme: c.theme, body: c.body }));

        // behavior: actionable=0 は skip（fallback noise 防止）
        expect(d.shouldSearch).toBe(false);
        expect(d.queries).toEqual([]);
        expect(d.reason).toBe("撤廃下でも actionable 制約ゼロのため skip");

        const payload = captureU3Gate(infoSpy);
        expect(payload).not.toBeNull();
        expect(payload!.has_actionable_constraints).toBe(false);
        expect(payload!.u3_gate_applied).toBe(true); // ← skip された
        expect(payload!.abolition_active).toBe(true);
        expect(payload!.reason_for_skip).toBe(
          "撤廃下でも actionable 制約ゼロのため skip",
        );
      });
    }
  });

  describe("flag=OFF の回帰（Step A 挙動維持）", () => {
    const cases: Array<{
      theme: ConversationTheme;
      body: string;
      constraints?: PartialConstraints;
    }> = [
      {
        theme: "food",
        body: "新宿でラーメン食べたい気分",
        constraints: { location: "新宿", preferences: ["ラーメン"] },
      },
      { theme: "movie", body: "モヤモヤする気分" },
    ];

    for (const c of cases) {
      it(`[${c.theme}] flag=OFF では U3 hit → 常に skip`, () => {
        // override は設定しない（default OFF）
        const d = decideSearch(
          makeAnalysis({
            theme: c.theme,
            body: c.body,
            constraints: c.constraints,
          }),
        );
        expect(d.shouldSearch).toBe(false);
        expect(d.queries).toEqual([]);
        expect(d.reason).toBe("感情・関係性の話題のため検索不要");

        const payload = captureU3Gate(infoSpy);
        expect(payload).not.toBeNull();
        expect(payload!.u3_gate_applied).toBe(true);
        expect(payload!.abolition_active).toBe(false);
      });
    }
  });

  describe("直交性（u3_gate_applied × abolition_active 4 象限）", () => {
    it("(true, false): flag=OFF + U3 hit → skip", () => {
      const d = decideSearch(
        makeAnalysis({
          theme: "food",
          body: "新宿でラーメン食べたい気分",
          constraints: { location: "新宿" },
        }),
      );
      expect(d.shouldSearch).toBe(false);
      const p = captureU3Gate(infoSpy)!;
      expect(p.u3_gate_applied).toBe(true);
      expect(p.abolition_active).toBe(false);
    });

    it("(true, true): flag=ON + actionable=0 → skip with abolition_active", () => {
      __setU3AbolitionOverride({ food: true });
      const d = decideSearch(
        makeAnalysis({ theme: "food", body: "気分が乗らない" }),
      );
      expect(d.shouldSearch).toBe(false);
      const p = captureU3Gate(infoSpy)!;
      expect(p.u3_gate_applied).toBe(true);
      expect(p.abolition_active).toBe(true);
    });

    it("(false, true): flag=ON + actionable=1 → 検索継続", () => {
      __setU3AbolitionOverride({ food: true });
      const d = decideSearch(
        makeAnalysis({
          theme: "food",
          body: "新宿でラーメン食べたい気分",
          constraints: { location: "新宿", preferences: ["ラーメン"] },
        }),
      );
      expect(d.shouldSearch).toBe(true);
      const p = captureU3Gate(infoSpy)!;
      expect(p.u3_gate_applied).toBe(false);
      expect(p.abolition_active).toBe(true);
    });

    // (false, false) = flag=OFF かつ gate 非適用 は定義上存在しない
    //   （flag=OFF なら U3 hit 時は必ず gate_applied=true）。
    //   この不達が直交表の「片側塞ぎ」で、hard invariant として別テスト化する。
    it("(false, false) は構造上発生しない: flag=OFF では常に gate_applied=true", () => {
      // flag=OFF で actionable=true/false の両方を試して gate_applied が false に
      // ならないことを確認
      const withActionable = decideSearch(
        makeAnalysis({
          theme: "food",
          body: "新宿でラーメン食べたい気分",
          constraints: { location: "新宿" },
        }),
      );
      expect(withActionable.shouldSearch).toBe(false);
      const p1 = captureU3Gate(infoSpy)!;
      expect(p1.u3_gate_applied).toBe(true);
      expect(p1.abolition_active).toBe(false);

      infoSpy.mockClear();

      const withoutActionable = decideSearch(
        makeAnalysis({ theme: "food", body: "気分が乗らない" }),
      );
      expect(withoutActionable.shouldSearch).toBe(false);
      const p2 = captureU3Gate(infoSpy)!;
      expect(p2.u3_gate_applied).toBe(true);
      expect(p2.abolition_active).toBe(false);
    });
  });

  describe("flag=ON でも非 U3 path は無影響（gate 対象外）", () => {
    it("U3 hit しない会話では u3_gate emit なし / 通常 decision", () => {
      __setU3AbolitionOverride({ food: true });
      const d = decideSearch(
        makeAnalysis({
          theme: "food",
          body: "新宿でラーメン食べたい",
          constraints: { location: "新宿", preferences: ["ラーメン"] },
        }),
      );
      expect(d.shouldSearch).toBe(true);
      expect(captureU3Gate(infoSpy)).toBeNull();
      expect(hasDecisionLog(infoSpy)).toBe(true);
    });
  });
});
