/**
 * CoAlter Bug-1 Phase 3 — NO_SEARCH_PATTERNS deprecated alias の契約テスト
 *
 * 正本: docs/coalter-bug1-emotion-retrieval-design.md §6.3 / §9 Phase 1
 * Plan: docs/coalter-implementation-plan-mainstream.md §2.3
 *
 * 契約（§6.3 段階的廃止 Phase 1）:
 *   - `NO_SEARCH_PATTERNS` symbol は存続する（物理削除は Phase 2）
 *   - 新 `decideSearch` からは参照されない（死コード化）
 *   - 旧 U3 感情 gate の挙動は撤去済み
 *
 * 検証方針（CEO 合意 2026-04-25）:
 *   reason 文字列チェック / runtime spy は使わず、behavioral + alias existence のみ。
 *
 *   Point 1: `NO_SEARCH_PATTERNS` export が存在し Array である（symbol 保持）
 *   Point 2: emotion + actionable → shouldSearch=true
 *            （旧 U3 path なら emotion で必ず false を返した — 背理法で非到達を証明）
 *   Point 3: emotion + !actionable → shouldSearch=false
 *            （actionable-only gate が正しく skip 判定を出す補強）
 *
 *   Point 2 が主証（単独で旧 path 非到達を証明）、Point 3 は補強。
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/stargazer/perspectiveEngine", () => ({
  executeSearch: vi.fn(async () => []),
}));

import {
  NO_SEARCH_PATTERNS,
  decideSearch,
} from "@/lib/coalter/webConnector";
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
      createdAt: "2026-04-24T10:00:00Z",
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

describe("NO_SEARCH_PATTERNS deprecated alias（§6.3 Phase 1）", () => {
  it("Point 1: symbol が export されており Array である（物理削除は Phase 2）", () => {
    expect(NO_SEARCH_PATTERNS).toBeDefined();
    expect(Array.isArray(NO_SEARCH_PATTERNS)).toBe(true);
    expect(NO_SEARCH_PATTERNS.length).toBeGreaterThan(0);
    // 全要素が RegExp（後方互換）
    for (const p of NO_SEARCH_PATTERNS) {
      expect(p).toBeInstanceOf(RegExp);
    }
  });

  it("Point 2（主証）: emotion + actionable → shouldSearch=true（旧 U3 path 非到達）", () => {
    // 旧 U3 感情 gate が active なら、NO_SEARCH_PATTERNS[0] = /気持ち|感情|気分/ に
    // hit する本 body は必ず skip された。shouldSearch=true が観測される事実は、
    // decideSearch が NO_SEARCH_PATTERNS を参照していない（= 死コード化済み）ことの
    // 背理法的証明となる。
    const d = decideSearch(
      makeAnalysis({
        theme: "food",
        body: "新宿でラーメン食べたい気分",
        constraints: { location: "新宿", preferences: ["ラーメン"] },
      }),
    );
    expect(d.shouldSearch).toBe(true);
    expect(d.queries.length).toBeGreaterThan(0);
  });

  it("Point 3（補強）: emotion + !actionable → shouldSearch=false（actionable-only gate）", () => {
    // actionable=false のときは skip。Point 2 と組み合わせて「新 gate は
    // actionable のみを見ている」契約を両面から固定する。
    const d = decideSearch(
      makeAnalysis({ theme: "food", body: "気分が乗らない" }),
    );
    expect(d.shouldSearch).toBe(false);
    expect(d.queries).toEqual([]);
  });

  it("Point 2 追補: 他 theme でも NO_SEARCH_PATTERNS hit ワード + actionable → 発火", () => {
    // 複数 theme で同じ契約が成立することを確認（regex 非依存の actionable-only gate）
    const movie = decideSearch(
      makeAnalysis({
        theme: "movie",
        body: "アニメ映画見たい気持ち",
        constraints: { preferences: ["アニメ"] },
      }),
    );
    expect(movie.shouldSearch).toBe(true);

    const travel = decideSearch(
      makeAnalysis({
        theme: "travel",
        body: "京都に行きたい、関係を深めたい",
        constraints: { location: "京都" },
      }),
    );
    expect(travel.shouldSearch).toBe(true);

    const activity = decideSearch(
      makeAnalysis({
        theme: "activity",
        body: "美術館行きたい、すれ違いも整理したい",
        constraints: { preferences: ["美術館"] },
      }),
    );
    expect(activity.shouldSearch).toBe(true);
  });
});
