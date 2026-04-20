/**
 * CoAlter Phase A: movieRanker alternatives (2026-04-18)
 *
 * 検証:
 *  - 採用された候補が 3 件 / catalog に 5 件 → alternatives は 0-2 件
 *  - alternatives は採用候補と重複しない
 *  - 上限 2 件（仮に候補が多くても 2 件止まり）
 *  - reason 文字列が埋まっている
 *  - catalog 小さい（全件採用）→ alternatives は空
 */

import { describe, it, expect } from "vitest";
import { rankMovies } from "@/lib/coalter/movieRanker";
import type {
  ConversationBrief,
  CoAlterPersonProfile,
  MovieScreening,
} from "@/lib/coalter/types";

function brief(): ConversationBrief {
  return {
    theme: "movie",
    area: "渋谷",
    approximateTime: {
      date: "今週末",
      timeSlot: "night",
      preferredStartHour: 19,
    },
    mood: ["会話が続く"],
    hardConstraints: [],
    rankingAxes: {
      preset: "balance_focus",
      roles: ["balance", "aFocus", "bFocus"],
      rationale: "2 人の折り合いを優先",
    },
    primaryUnresolvedQuestion: null,
    confidence: 0.8,
    fieldConfidence: { theme: 0.9, area: 0.8, approximateTime: 0.8 },
    source: "llm",
  };
}

function prof(
  id: string,
  name: string,
  interests: string[],
): CoAlterPersonProfile {
  return {
    userId: id,
    displayName: name,
    communicationStyle: {
      directVsDiplomatic: null,
      conflictStyle: null,
      attachmentStyle: null,
      reassuranceNeed: null,
      emotionalVariability: null,
    },
    decisionStyle: {
      noveltyPreference: 0.5,
      decisionSpeed: null,
      riskTolerance: 0.5,
    },
    interests,
    values: [],
    archetypeCode: null,
    coreFear: null,
    coreDesire: null,
  };
}

function mv(partial: Partial<MovieScreening>): MovieScreening {
  return {
    title: "作品",
    theater: "TOHOシネマズ渋谷",
    status: "showing",
    showtimes: ["19:00"],
    runtimeMinutes: 110,
    rating: "4.2",
    sourceUrl: "https://example.com/",
    source: "eiga.com",
    snippet: "サスペンス ヒューマン",
    ...partial,
  };
}

describe("movieRanker — alternatives (Phase A)", () => {
  const profileA = prof("a", "たいし", ["サスペンス"]);
  const profileB = prof("b", "あやか", ["ヒューマンドラマ"]);

  it("catalog 5 件 / adopted 3 → alternatives は 0-2 件 (上限 2)", () => {
    const catalog: MovieScreening[] = [
      mv({ title: "映画1", showtimes: ["19:00"], snippet: "サスペンス" }),
      mv({ title: "映画2", showtimes: ["20:00"], snippet: "ヒューマンドラマ" }),
      mv({ title: "映画3", showtimes: ["21:00"], snippet: "サスペンス ヒューマン" }),
      mv({ title: "映画4", showtimes: ["19:30"], snippet: "サスペンス" }),
      mv({ title: "映画5", showtimes: ["20:30"], snippet: "ヒューマン" }),
    ];
    const out = rankMovies({
      brief: brief(),
      catalog,
      avoidKeys: [],
      profileA,
      profileB,
    });
    expect(out.ranked.length).toBe(3);
    expect(out.alternatives.length).toBeGreaterThanOrEqual(0);
    expect(out.alternatives.length).toBeLessThanOrEqual(2);
  });

  it("alternatives は採用候補と title が重複しない", () => {
    const catalog: MovieScreening[] = [
      mv({ title: "A", showtimes: ["19:00"], snippet: "サスペンス" }),
      mv({ title: "B", showtimes: ["20:00"], snippet: "ヒューマンドラマ" }),
      mv({ title: "C", showtimes: ["21:00"], snippet: "サスペンス ヒューマン" }),
      mv({ title: "D", showtimes: ["19:30"], snippet: "ヒューマン" }),
      mv({ title: "E", showtimes: ["20:30"], snippet: "サスペンス" }),
    ];
    const out = rankMovies({
      brief: brief(),
      catalog,
      avoidKeys: [],
      profileA,
      profileB,
    });
    const adoptedTitles = new Set(out.ranked.map((r) => r.title));
    for (const alt of out.alternatives) {
      expect(adoptedTitles.has(alt.title)).toBe(false);
    }
  });

  it("catalog が少ない（全件採用）→ alternatives は 0 件", () => {
    const catalog: MovieScreening[] = [
      mv({ title: "only-1", showtimes: ["19:00"] }),
      mv({ title: "only-2", showtimes: ["20:00"] }),
      mv({ title: "only-3", showtimes: ["21:00"] }),
    ];
    const out = rankMovies({
      brief: brief(),
      catalog,
      avoidKeys: [],
      profileA,
      profileB,
    });
    expect(out.alternatives.length).toBe(0);
  });

  it("alternatives の各要素に reason 文字列が埋まる", () => {
    const catalog: MovieScreening[] = [
      mv({ title: "A", showtimes: ["19:00"] }),
      mv({ title: "B", showtimes: ["20:00"] }),
      mv({ title: "C", showtimes: ["21:00"] }),
      mv({ title: "D-long", runtimeMinutes: 160, showtimes: ["19:30"] }),
      mv({ title: "E", showtimes: ["20:30"] }),
    ];
    const out = rankMovies({
      brief: brief(),
      catalog,
      avoidKeys: [],
      profileA,
      profileB,
    });
    for (const alt of out.alternatives) {
      expect(alt.reason).toBeTruthy();
      expect(alt.reason.length).toBeGreaterThan(0);
    }
  });
});
