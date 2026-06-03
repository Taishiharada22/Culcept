import { describe, it, expect } from "vitest";

import {
  resolveWornHistoryConflict,
  type WornHistoryEntry,
} from "@/lib/shared/wornHistory";

function entry(p: Partial<WornHistoryEntry> = {}): WornHistoryEntry {
  return {
    date: "2026-05-29",
    wornAt: "2026-05-29T00:00:00.000Z",
    itemIds: ["w1"],
    source: "engine",
    origin: "plan",
    learningEligible: false,
    ...p,
  };
}

describe("resolveWornHistoryConflict — calendar 既存は上書きしない", () => {
  it("calendar 既存が学習可 → use_existing_calendar（incoming に関わらず）", () => {
    const existing = entry({ origin: "calendar", source: "calendar_form", learningEligible: true });
    const incoming = entry({ origin: "plan", source: "engine", learningEligible: true });
    expect(resolveWornHistoryConflict(existing, incoming).action).toBe("use_existing_calendar");
  });

  it("calendar 既存が学習不可 & plan が学習可 → needs_confirmation（黙って捨てない）", () => {
    const existing = entry({ origin: "calendar", source: "calendar_form", learningEligible: false });
    const incoming = entry({ origin: "plan", source: "engine", learningEligible: true });
    expect(resolveWornHistoryConflict(existing, incoming).action).toBe("needs_confirmation");
  });

  it("calendar 既存が学習不可 & plan も学習不可 → skip_learning", () => {
    const existing = entry({ origin: "calendar", source: "calendar_form", learningEligible: false });
    const incoming = entry({ origin: "plan", source: "mock", learningEligible: false });
    expect(resolveWornHistoryConflict(existing, incoming).action).toBe("skip_learning");
  });
});

describe("resolveWornHistoryConflict — calendar 既存なし", () => {
  it("既存なし & plan が学習可 → use_plan_diary", () => {
    const incoming = entry({ origin: "plan", source: "engine", learningEligible: true });
    expect(resolveWornHistoryConflict(null, incoming).action).toBe("use_plan_diary");
  });

  it("既存なし & plan が学習不可 → skip_learning（diary は保持・学習しない）", () => {
    const incoming = entry({ origin: "plan", source: "mock", learningEligible: false });
    expect(resolveWornHistoryConflict(null, incoming).action).toBe("skip_learning");
  });

  it("既存が plan（calendar でない）→ plan で上書き可（use_plan_diary）", () => {
    const existing = entry({ origin: "plan", source: "engine", learningEligible: true });
    const incoming = entry({ origin: "plan", source: "engine", learningEligible: true });
    expect(resolveWornHistoryConflict(existing, incoming).action).toBe("use_plan_diary");
  });
});

describe("resolveWornHistoryConflict — incoming が calendar 由来の稀ケース", () => {
  it("既存なし & incoming が calendar かつ学習可 → use_existing_calendar に倒す", () => {
    const incoming = entry({ origin: "calendar", source: "calendar_form", learningEligible: true });
    expect(resolveWornHistoryConflict(null, incoming).action).toBe("use_existing_calendar");
  });
  it("既存なし & incoming が calendar かつ学習不可 → skip_learning", () => {
    const incoming = entry({ origin: "calendar", source: "calendar_form", learningEligible: false });
    expect(resolveWornHistoryConflict(null, incoming).action).toBe("skip_learning");
  });
});
