/**
 * CoAlter conversationParser.extractAgreedConstraints — Phase 1.5.4.5
 *
 * 検証:
 *  - exclusion (hard): 「併設じゃない」「X 避けて」「X 以外で」
 *  - budget (hard/soft): 「5000円前後」「3000-5000円」「5000円以下」「1人5000円」
 *  - style (hard/soft): 「フレンチかイタリアン」「フレンチで」
 *  - preference (soft): 「落ち着いた」「2人で楽しめる」「テラス」
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { ConversationTurn } from "@/lib/coalter/types";
import { __internal } from "@/lib/coalter/conversationParser";

const { extractAgreedConstraints } = __internal;

function msg(senderId: string, body: string): ConversationTurn {
  return { senderId, body, createdAt: new Date().toISOString() };
}

describe("extractAgreedConstraints — exclusion", () => {
  it("併設じゃなくて → exclude:attached_venue", () => {
    const turns = [msg("a", "映画館の併設じゃなくてどこか行きたいな")];
    const result = extractAgreedConstraints(turns);
    const ex = result.find((c) => c.kind === "exclusion");
    expect(ex).toBeDefined();
    expect(ex!.normalizedValue).toBe("exclude:attached_venue");
    expect(ex!.strength).toBe("hard");
    expect(ex!.sourceText).toContain("併設");
  });

  it("X 以外で → exclude:X", () => {
    const turns = [msg("a", "和食以外でいきたい")];
    const result = extractAgreedConstraints(turns);
    const ex = result.find((c) => c.kind === "exclusion");
    expect(ex).toBeDefined();
    expect(ex!.normalizedValue).toMatch(/^exclude:/);
    expect(ex!.strength).toBe("hard");
  });

  it("X 避けたい → exclude", () => {
    const turns = [msg("a", "チェーン店は避けたい")];
    const result = extractAgreedConstraints(turns);
    const ex = result.find((c) => c.kind === "exclusion");
    expect(ex).toBeDefined();
    expect(ex!.strength).toBe("hard");
  });
});

describe("extractAgreedConstraints — budget", () => {
  it("5000円前後 → budget_around (hard)", () => {
    const turns = [msg("a", "5000円前後がいいな")];
    const result = extractAgreedConstraints(turns);
    const b = result.find((c) => c.kind === "budget");
    expect(b).toBeDefined();
    expect(b!.normalizedValue).toBe("budget_around:5000");
    expect(b!.strength).toBe("hard");
  });

  it("3000-5000円 → budget_range (hard)", () => {
    const turns = [msg("a", "3000-5000円くらいの予算で")];
    const result = extractAgreedConstraints(turns);
    const b = result.find((c) => c.kind === "budget");
    expect(b).toBeDefined();
    expect(b!.normalizedValue).toMatch(/^budget_range:3000-5000/);
  });

  it("5000円以下 → budget_max (hard)", () => {
    const turns = [msg("a", "5000円以下で抑えたい")];
    const result = extractAgreedConstraints(turns);
    const b = result.find((c) => c.kind === "budget");
    expect(b).toBeDefined();
    expect(b!.normalizedValue).toBe("budget_max:5000");
    expect(b!.strength).toBe("hard");
  });

  it("1人5000円 → budget_per_person (hard)", () => {
    const turns = [msg("a", "1人5000円くらいにしない？")];
    const result = extractAgreedConstraints(turns);
    const b = result.find((c) => c.kind === "budget");
    expect(b).toBeDefined();
    expect(b!.normalizedValue).toBe("budget_per_person:5000");
  });
});

describe("extractAgreedConstraints — style", () => {
  it("フレンチかイタリアン → style_or (hard)", () => {
    const turns = [msg("a", "フレンチかイタリアンにしようか")];
    const result = extractAgreedConstraints(turns);
    const s = result.find((c) => c.kind === "style");
    expect(s).toBeDefined();
    expect(s!.normalizedValue).toBe("style_or:フレンチ|イタリアン");
    expect(s!.strength).toBe("hard");
  });

  it("「ラーメンにしよう」→ style (soft)", () => {
    const turns = [msg("a", "今日はラーメンにしよう")];
    const result = extractAgreedConstraints(turns);
    const s = result.find((c) => c.kind === "style");
    expect(s).toBeDefined();
    expect(s!.normalizedValue).toBe("style:ラーメン");
  });
});

describe("extractAgreedConstraints — preference", () => {
  it("落ち着いた → pref:calm (soft)", () => {
    const turns = [msg("a", "落ち着いた雰囲気のお店がいい")];
    const result = extractAgreedConstraints(turns);
    const p = result.find((c) => c.kind === "preference");
    expect(p).toBeDefined();
    expect(p!.normalizedValue).toBe("pref:calm");
    expect(p!.strength).toBe("soft");
  });

  it("2人で楽しめる → pref:two_person_friendly", () => {
    const turns = [msg("a", "2人で楽しめる場所がいい")];
    const result = extractAgreedConstraints(turns);
    const p = result.find((c) => c.kind === "preference");
    expect(p).toBeDefined();
    expect(p!.normalizedValue).toBe("pref:two_person_friendly");
  });

  it("テラス → pref:outdoor", () => {
    const turns = [msg("a", "テラス席が良さそう")];
    const result = extractAgreedConstraints(turns);
    const p = result.find((c) => c.kind === "preference");
    expect(p).toBeDefined();
    expect(p!.normalizedValue).toBe("pref:outdoor");
  });
});

describe("extractAgreedConstraints — 重複除去", () => {
  it("同じ normalizedValue は1つにまとまる", () => {
    const turns = [
      msg("a", "5000円前後がいい"),
      msg("b", "そうだね、5000円前後で"),
    ];
    const result = extractAgreedConstraints(turns);
    const budgets = result.filter((c) => c.kind === "budget");
    expect(budgets).toHaveLength(1);
  });

  it("sourceText に元発話が保持される（監査用）", () => {
    const turns = [msg("a", "映画館の併設じゃなくて")];
    const result = extractAgreedConstraints(turns);
    const ex = result.find((c) => c.kind === "exclusion");
    expect(ex!.sourceText).toMatch(/併設/);
  });

  it("agreedBy に senderId がセットされる", () => {
    const turns = [msg("user-alice", "5000円前後がいい")];
    const result = extractAgreedConstraints(turns);
    const b = result.find((c) => c.kind === "budget");
    expect(b!.agreedBy).toBe("user-alice");
  });
});

describe("extractAgreedConstraints — 合成ケース", () => {
  it("映画 × ランチ併設拒否 × ジャンル合意（CEO 3 criticism ケース）", () => {
    const turns = [
      msg("a", "○日に映画見たい"),
      msg("b", "いいね。ランチも一緒にする？"),
      msg("a", "映画館の併設じゃなくて、別でランチしたい"),
      msg("b", "OK！フレンチかイタリアンにしようか"),
      msg("a", "1人5000円くらいで"),
    ];
    const result = extractAgreedConstraints(turns);

    // 全 kind が取れていること
    const kinds = [...new Set(result.map((c) => c.kind))];
    expect(kinds).toContain("exclusion");
    expect(kinds).toContain("style");
    expect(kinds).toContain("budget");

    // hard が少なくとも 3 つ
    const hard = result.filter((c) => c.strength === "hard");
    expect(hard.length).toBeGreaterThanOrEqual(3);

    // 併設排除
    expect(
      result.some((c) => c.normalizedValue === "exclude:attached_venue"),
    ).toBe(true);
  });
});
