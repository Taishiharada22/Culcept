/**
 * CoAlter Phase B Commit 4: Movie narration snapshot fixation (2026-04-19)
 *
 * 目的:
 *  Commit 4 で ROLE_HEADLINE を theme × role の二重 Record に拡張した結果、
 *  movie 側の出力文言が 1 文字でも変わっていないことを固定する。
 *
 *  - ROLE_HEADLINE_BY_THEME.movie の全 9 role 文言の pinning
 *  - buildOneLiner("movie") default 出力の pinning
 *  - buildSummary の ranked>0 / ranked=0 文言の pinning
 *  - buildPracticalInfo 順序と trailing status の pinning
 */

import { describe, it, expect } from "vitest";

import {
  buildOneLiner,
  buildPracticalInfo,
  buildSummary,
  formatWhenFromBrief,
  __internal,
} from "@/lib/coalter/narrationBuilder";
import type {
  ConversationBrief,
  RankedCandidate,
  RankingRole,
} from "@/lib/coalter/types";

// ─────────────────────────────────────────────
// ROLE_HEADLINE 辞書の固定
// ─────────────────────────────────────────────

describe("ROLE_HEADLINE_BY_THEME.movie — 9 role 文言 pinning", () => {
  const movie = __internal.ROLE_HEADLINE_BY_THEME.movie;

  const expected: Record<RankingRole, string> = {
    balance: "2人の折り合いが取りやすい1本",
    aFocus: "Aさんの好みに寄せた1本",
    bFocus: "Bさんの好みに寄せた1本",
    safety: "外しにくい安心枠",
    adventure: "少し冒険してみる1本",
    discovery: "新しい発見になりそうな1本",
    calm: "落ち着いて楽しめる1本",
    stimulating: "気分を上げてくれる刺激枠",
    nostalgic: "余韻と懐かしさが残る1本",
  };

  it.each(Object.keys(expected) as RankingRole[])(
    "role=%s の movie headline が Commit 3 と同一",
    (role) => {
      expect(movie[role]).toBe(expected[role]);
    },
  );

  it("ROLE_HEADLINE 後方互換 export は movie 辞書と同一", () => {
    expect(__internal.ROLE_HEADLINE).toEqual(movie);
  });

  it("getRoleHeadlineTable(undefined) は movie 辞書を返す（後方互換 fallback）", () => {
    expect(__internal.getRoleHeadlineTable(undefined)).toEqual(movie);
  });

  it("getRoleHeadlineTable('movie') は movie 辞書を返す", () => {
    expect(__internal.getRoleHeadlineTable("movie")).toEqual(movie);
  });

  it("getRoleHeadlineTable('activity') は movie 辞書に fallback（未対応 theme）", () => {
    expect(__internal.getRoleHeadlineTable("activity")).toEqual(movie);
  });
});

// ─────────────────────────────────────────────
// buildOneLiner / buildSummary / buildPracticalInfo の文言固定
// ─────────────────────────────────────────────

function rc(over: Partial<RankedCandidate> = {}): RankedCandidate {
  return {
    candidateKey: "ラストマイル::TOHOシネマズ渋谷::19:00",
    role: "balance",
    title: "ラストマイル",
    theater: "TOHOシネマズ渋谷",
    showtime: "19:00",
    runtimeMinutes: 118,
    releaseStatus: "showing",
    rating: "★4.2",
    sourceUrl: "https://eiga.com/movie/last-mile",
    axisScores: { balance: 0.8 },
    totalScore: 0.8,
    rationale: {
      matchedInterestsA: ["サスペンス"],
      matchedInterestsB: ["ヒューマンドラマ"],
      matchedValuesA: [],
      matchedValuesB: [],
      appealedAxis: ["balance"],
      tradeoff: null,
      contingencyHint: null,
    },
    breakdown: {
      metrics: {
        novelty: 0.5,
        safety: 0.7,
        runtimeFit: 1,
        timeslotFit: 1,
        areaFit: 1,
        genreMatchA: 0.8,
        genreMatchB: 0.7,
        moodMatch: 0.5,
      },
      roleScores: { balance: 0.8 },
      assignedRole: "balance",
    },
    ...over,
  };
}

function brief(over: Partial<ConversationBrief> = {}): ConversationBrief {
  return {
    theme: "movie",
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

describe("buildOneLiner (movie) — 出力文言 pinning", () => {
  it("default (theme 引数なし) は movie 辞書で headline + matched 括弧", () => {
    // theme 引数なし = 後方互換 fallback
    const s = buildOneLiner(rc());
    expect(s).toBe("2人の折り合いが取りやすい1本（サスペンスが響くはず）");
  });

  it("明示的 theme='movie' でも同じ", () => {
    const s = buildOneLiner(rc(), "movie");
    expect(s).toBe("2人の折り合いが取りやすい1本（サスペンスが響くはず）");
  });

  it("matched なし → headline のみ（括弧なし）", () => {
    const s = buildOneLiner(
      rc({
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
    expect(s).toBe("2人の折り合いが取りやすい1本");
  });
});

describe("buildSummary (movie) — 文言 pinning", () => {
  it("ranked=2 の通常文", () => {
    const s = buildSummary(brief(), [rc(), rc()]);
    expect(s).toBe(
      "渋谷・今週末・夜で見る映画を選びたい流れ。2人の好みと公開情報を突き合わせて2本に絞った。",
    );
  });

  it("ranked=0 の clarify 寄り文", () => {
    const s = buildSummary(brief(), []);
    expect(s).toBe(
      "渋谷・今週末・夜で映画を決めたい様子。候補を絞り込むためにもう少し情報が欲しい。",
    );
  });

  it("brief が空に近い → 近いうち fallback（創作しない）", () => {
    const b = brief({
      area: null,
      approximateTime: { date: null, timeSlot: null, preferredStartHour: null },
    });
    const s = buildSummary(b, [rc()]);
    expect(s.startsWith("近いうち")).toBe(true);
  });
});

describe("buildPracticalInfo (movie) — token 順序と status 文言", () => {
  it("theater / showtime / runtime / rating の順（全てあり）", () => {
    const s = buildPracticalInfo(rc());
    expect(s).toBe("TOHOシネマズ渋谷 / 19:00〜 / 118分 / ★4.2");
  });

  it("releaseStatus=upcoming は『公開予定』が末尾に付く", () => {
    const s = buildPracticalInfo(
      rc({
        releaseStatus: "upcoming",
        showtime: null,
        rating: null,
        runtimeMinutes: null,
      }),
    );
    expect(s).toBe("TOHOシネマズ渋谷 / 公開予定");
  });
});

describe("formatWhenFromBrief — 共通挙動の固定", () => {
  it("area + date + timeSlot 全てあり", () => {
    expect(formatWhenFromBrief(brief())).toBe("渋谷・今週末・夜");
  });

  it("全部 null で 近いうち", () => {
    const s = formatWhenFromBrief(
      brief({
        area: null,
        approximateTime: { date: null, timeSlot: null, preferredStartHour: null },
      }),
    );
    expect(s).toBe("近いうち");
  });
});
