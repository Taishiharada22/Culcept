/**
 * CoAlter 2026-04-19 — Soft Theme Continuity unit tests (CEO 採用案 A)
 *
 * 契約:
 *  - previousTheme が null → 補正なし
 *  - previousTheme !== "movie" → 補正なし (movie 限定)
 *  - detectedTheme === "movie" → 補正不要 (no-op)
 *  - detectedTheme が明確な他テーマ (food/travel/etc) → 切り替えを尊重
 *  - detectedTheme === "general" + 直近に movie evidence + 他テーマ evidence なし → sticky
 *  - detectedTheme === "general" + 直近に他テーマ (food/travel/gift) evidence → 切り替えを尊重
 *  - detectedTheme === "general" + 直近に movie evidence なし → 補正なし
 */

import { describe, it, expect } from "vitest";

import {
  applySoftThemeContinuity,
  hasMovieEvidenceInMessages,
} from "@/lib/coalter/themeContinuity";
import type { ConversationTurn } from "@/lib/coalter/types";

const A = "user_a";
const B = "user_b";

function turn(senderId: string, body: string, offsetMin = 0): ConversationTurn {
  return {
    senderId,
    body,
    createdAt: new Date(
      Date.parse("2026-04-19T12:00:00.000Z") + offsetMin * 60_000,
    ).toISOString(),
  };
}

describe("applySoftThemeContinuity — 補正しないケース", () => {
  it("previousTheme=null → no_previous", () => {
    const res = applySoftThemeContinuity({
      detectedTheme: "general",
      previousTheme: null,
      messages: [turn(A, "映画どうする?")],
    });
    expect(res.stickyApplied).toBe(false);
    expect(res.theme).toBe("general");
    expect(res.reason).toBe("no_previous");
  });

  it("previousTheme=food → previous_not_movie (movie 限定)", () => {
    const res = applySoftThemeContinuity({
      detectedTheme: "general",
      previousTheme: "food",
      messages: [turn(A, "映画どうする?")],
    });
    expect(res.stickyApplied).toBe(false);
    expect(res.reason).toBe("previous_not_movie");
  });

  it("detectedTheme=movie → detected_confident (no-op)", () => {
    const res = applySoftThemeContinuity({
      detectedTheme: "movie",
      previousTheme: "movie",
      messages: [turn(A, "映画どうする?")],
    });
    expect(res.stickyApplied).toBe(false);
    expect(res.theme).toBe("movie");
    expect(res.reason).toBe("detected_confident");
  });

  it("detectedTheme=food (明確な他テーマ) → detected_confident (切り替えを尊重)", () => {
    const res = applySoftThemeContinuity({
      detectedTheme: "food",
      previousTheme: "movie",
      messages: [turn(A, "夕飯どうする?")],
    });
    expect(res.stickyApplied).toBe(false);
    expect(res.theme).toBe("food");
    expect(res.reason).toBe("detected_confident");
  });
});

describe("applySoftThemeContinuity — sticky 適用ケース", () => {
  it("前回 movie + 今回 general + 直近に movie evidence → sticky_kept_movie", () => {
    const messages = [
      turn(A, "土曜の映画どうする?"),
      turn(B, "うーん"),
      turn(A, "迷うな"),
      turn(B, "決められない"),
    ];
    const res = applySoftThemeContinuity({
      detectedTheme: "general",
      previousTheme: "movie",
      messages,
    });
    expect(res.stickyApplied).toBe(true);
    expect(res.theme).toBe("movie");
    expect(res.reason).toBe("sticky_kept_movie");
  });

  it("「劇場版」キーワードでも sticky が効く", () => {
    const messages = [
      turn(A, "劇場版コナン見たい"),
      turn(B, "うーん"),
      turn(A, "迷うな"),
    ];
    const res = applySoftThemeContinuity({
      detectedTheme: "general",
      previousTheme: "movie",
      messages,
    });
    expect(res.stickyApplied).toBe(true);
  });

  it("「Netflix」でも sticky evidence として効く", () => {
    const messages = [
      turn(A, "Netflix で何見る?"),
      turn(B, "うーん"),
    ];
    const res = applySoftThemeContinuity({
      detectedTheme: "general",
      previousTheme: "movie",
      messages,
    });
    expect(res.stickyApplied).toBe(true);
  });
});

describe("applySoftThemeContinuity — 他テーマ evidence で切り替え尊重", () => {
  it("直近に food evidence → other_theme_evidence", () => {
    const messages = [
      turn(A, "映画どうする?"),
      turn(B, "うーん"),
      turn(A, "それよりランチにしよう"),
      turn(B, "いいね、レストラン行く?"),
    ];
    const res = applySoftThemeContinuity({
      detectedTheme: "general",
      previousTheme: "movie",
      messages,
    });
    expect(res.stickyApplied).toBe(false);
    expect(res.theme).toBe("general");
    expect(res.reason).toBe("other_theme_evidence");
  });

  it("直近に travel evidence → other_theme_evidence", () => {
    const messages = [
      turn(A, "映画どうする?"),
      turn(B, "今週は旅行行きたい"),
      turn(A, "温泉いいね"),
    ];
    const res = applySoftThemeContinuity({
      detectedTheme: "general",
      previousTheme: "movie",
      messages,
    });
    expect(res.reason).toBe("other_theme_evidence");
  });

  it("直近に gift evidence → other_theme_evidence", () => {
    const messages = [
      turn(A, "映画どうする?"),
      turn(B, "あ、プレゼント買わなきゃ"),
    ];
    const res = applySoftThemeContinuity({
      detectedTheme: "general",
      previousTheme: "movie",
      messages,
    });
    expect(res.reason).toBe("other_theme_evidence");
  });
});

describe("applySoftThemeContinuity — movie evidence なし", () => {
  it("直近に movie keyword が全く無い → no_movie_evidence", () => {
    const messages = [
      turn(A, "うーん"),
      turn(B, "どうしよう"),
      turn(A, "迷うな"),
    ];
    const res = applySoftThemeContinuity({
      detectedTheme: "general",
      previousTheme: "movie",
      messages,
    });
    expect(res.stickyApplied).toBe(false);
    expect(res.reason).toBe("no_movie_evidence");
  });
});

describe("hasMovieEvidenceInMessages", () => {
  it("映画キーワードあり → true", () => {
    expect(
      hasMovieEvidenceInMessages([turn(A, "映画見よう")]),
    ).toBe(true);
  });

  it("キーワード無し → false", () => {
    expect(
      hasMovieEvidenceInMessages([turn(A, "うーん"), turn(B, "どうする?")]),
    ).toBe(false);
  });

  it("window を超えた先は拾わない", () => {
    const messages = [
      turn(A, "映画どうする?", 0),
      ...Array.from({ length: 25 }, (_, i) => turn(B, `何か${i}`, i + 1)),
    ];
    // window=20 のデフォルトでは最初の「映画」は拾えない
    expect(hasMovieEvidenceInMessages(messages, 20)).toBe(false);
    // window=30 なら拾える
    expect(hasMovieEvidenceInMessages(messages, 30)).toBe(true);
  });
});
