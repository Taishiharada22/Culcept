/**
 * webConnector / u3Telemetry helper — Phase 3 契約テスト。
 *
 * Bug-1 Phase 3（§4.4 actionable-only gate）移行に伴い、旧 §7 Step A U3 telemetry
 * の emit 検証（`[CoAlter] webConnector.u3_gate` log / `U3GatePayload`）は
 * dead code path となり本ファイルから削除済み。
 *
 * 現役責務:
 *   1. decideSearch Phase 3 最小 smoke（3 gate 組合せを 1 件ずつ）
 *      — 詳細挙動は decideSearchSystemA/B/C.test.ts
 *   2. u3Telemetry.ts の helper 3 本の API 契約
 *      — hasActionableConstraintsByTheme / extractMatchedTerms / maskSensitiveText
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

type InfoSpy = ReturnType<typeof vi.spyOn>;

function hasDecisionLog(spy: InfoSpy): boolean {
  return spy.mock.calls.some(
    (args: unknown[]) => args[0] === "[CoAlter] webConnector.decision",
  );
}

function hasU3GateLog(spy: InfoSpy): boolean {
  return spy.mock.calls.some(
    (args: unknown[]) => args[0] === "[CoAlter] webConnector.u3_gate",
  );
}

describe("webConnector.decideSearch — Phase 3 最小 smoke", () => {
  let infoSpy: InfoSpy;

  beforeEach(() => {
    infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
  });
  afterEach(() => {
    infoSpy.mockRestore();
  });

  it("Gate 1: 非検索 theme は skip（reason に theme 名）", () => {
    const d = decideSearch(
      makeAnalysis({
        theme: "schedule" as ConversationTheme,
        body: "土曜の夜どうしよう",
        constraints: { date: "土曜", timeSlot: "夜" },
      }),
    );
    expect(d.shouldSearch).toBe(false);
    expect(d.queries).toEqual([]);
    expect(d.reason).toContain("schedule");
    expect(d.reason).toContain("検索不要");
  });

  it("Gate 2: 検索 theme でも actionable=false なら skip", () => {
    const d = decideSearch(
      makeAnalysis({ theme: "food", body: "気分が乗らない" }),
    );
    expect(d.shouldSearch).toBe(false);
    expect(d.queries).toEqual([]);
    expect(d.reason).toContain("actionable");
  });

  it("両 gate 通過: 通常検索 + decision log emit", () => {
    const d = decideSearch(
      makeAnalysis({
        theme: "food",
        body: "新宿でラーメン食べたい",
        constraints: { location: "新宿", preferences: ["ラーメン"] },
      }),
    );
    expect(d.shouldSearch).toBe(true);
    expect(d.queries.length).toBeGreaterThan(0);
    expect(d.reason).toContain("food");
    expect(hasDecisionLog(infoSpy)).toBe(true);
  });

  it("旧 u3_gate telemetry は Phase 3 で完全撤去（skip/pass どちらでも emit されない）", () => {
    decideSearch(makeAnalysis({ theme: "food", body: "気分が乗らない" }));
    decideSearch(
      makeAnalysis({
        theme: "food",
        body: "新宿でラーメン食べたい気分",
        constraints: { location: "新宿" },
      }),
    );
    expect(hasU3GateLog(infoSpy)).toBe(false);
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
