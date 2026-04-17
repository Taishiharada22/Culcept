/**
 * CoAlter Movie Orchestrator — Failure Matrix E2E (2026-04-18)
 *
 * 検証:
 *  - Layer 0 LLM 失敗 × Layer 3 LLM 失敗 → logic-only でも候補が返る
 *  - Layer 0 成功 × Layer 3 失敗 → logic narration に落ちる (mode=logic_template)
 *  - Layer 0 失敗 × Layer 3 成功 → parser_fallback brief でも候補は返る
 *  - 両方成功 → mode=llm
 *  - catalog 0 件 → clarify フォールバック
 *  - 旧挙動 (provider 全落ち → 推薦ゼロ) が再発しないことを保証
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const runAIMock = vi.fn();
vi.mock("@/lib/ai", () => ({
  runAI: (...args: unknown[]) => runAIMock(...args),
}));

import type {
  CoAlterPersonProfile,
  ConversationAnalysis,
  ConversationTurn,
  RelationshipContext,
  SearchCandidate,
} from "@/lib/coalter/types";
import { generateMovieProposalV2 } from "@/lib/coalter/movieOrchestrator";

// ── fixtures ──

function makeProfile(id: string, name: string): CoAlterPersonProfile {
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
    interests: ["サスペンス", "ヒューマンドラマ"],
    values: [],
    archetypeCode: null,
    coreFear: null,
    coreDesire: null,
  };
}

const profileA = makeProfile("a", "たいし");
const profileB = makeProfile("b", "あやか");

const relationship: RelationshipContext = {
  commonGround: [],
  frictionPoints: [],
  fairnessLedger: [],
  pastSessionCount: 0,
};

function makeAnalysis(): ConversationAnalysis {
  return {
    theme: "movie",
    recentMessages: [],
    stalemate: null,
    caringIntensityA: 0.5,
    caringIntensityB: 0.5,
    extractedConstraints: {
      date: null,
      location: "渋谷",
      budget: null,
      timeSlot: "夜",
      preferences: [],
    },
    constraintScore: 0.6,
    agreedConstraints: [],
  };
}

const turns: ConversationTurn[] = [
  {
    id: "t1",
    senderId: "a",
    body: "今週末、渋谷で映画見ない？",
    createdAt: "2026-04-18T10:00:00Z",
  },
  {
    id: "t2",
    senderId: "b",
    body: "いいね、夜がいいな",
    createdAt: "2026-04-18T10:01:00Z",
  },
];

/** 実在映画を含む search 結果（movieCatalog がパース可能） */
const searchCandidates: SearchCandidate[] = [
  {
    title: "ラストマイル",
    description: "現在上映中。TOHOシネマズ渋谷で19:00〜、21:30〜。118分。Filmarks 4.2。サスペンス",
    externalRating: "4.2",
    practicalInfo: null,
    source: "eiga.com",
    url: "https://eiga.com/movie/last-mile",
  },
  {
    title: "アナログ",
    description: "現在上映中。TOHOシネマズ渋谷で20:00〜。106分。ヒューマンドラマ。★4.0",
    externalRating: "4.0",
    practicalInfo: null,
    source: "filmarks",
    url: "https://filmarks.com/movies/analog",
  },
  {
    title: "PERFECT DAYS",
    description: "現在上映中。TOHOシネマズ渋谷で18:30〜。124分。ヒューマンドラマ。★4.5",
    externalRating: "4.5",
    practicalInfo: null,
    source: "eiga.com",
    url: "https://eiga.com/movie/perfect-days",
  },
];

// Layer 0 (coalter_brief) の成功レスポンス
function mockBriefSuccess() {
  return Promise.resolve({
    text: "",
    structured: {
      theme: "movie",
      area: "渋谷",
      approximateTime: {
        date: "今週末",
        timeSlot: "night",
        preferredStartHour: 19,
      },
      mood: ["会話が続く", "軽め"],
      rankingAxes: {
        preset: "balance_focus",
        rationale: "2人の好みが近いので折り合い軸で選定",
      },
      primaryUnresolvedQuestion: null,
      confidence: 0.85,
    },
    usage: null,
    metadata: {},
    latencyMs: 10,
  });
}

// Layer 3 (coalter_narration) の成功レスポンス
function mockNarrationSuccess() {
  return Promise.resolve({
    text: "",
    structured: {
      summary: "渋谷・夜で見る映画を選ぶ流れ。2人ともサスペンス系が好みで一致している。",
      reasoning: "どちらも外したくない気持ちなので、評価の安定した作品を中心に並べました。",
      candidateProses: [],
    },
    usage: null,
    metadata: {},
    latencyMs: 10,
  });
}

beforeEach(() => {
  runAIMock.mockReset();
});

// ─────────────────────────────────────────────

describe("movieOrchestrator — failure matrix", () => {
  it("Layer 0 失敗 × Layer 3 失敗 でも候補が返る (logic-only)", async () => {
    runAIMock.mockRejectedValue(new Error("provider timeout"));

    const result = await generateMovieProposalV2({
      turns,
      analysis: makeAnalysis(),
      searchCandidates,
      profileA,
      profileB,
      relationship,
    });

    expect(result.card.candidates.length).toBeGreaterThan(0);
    expect(result.telemetry.briefSource).toBe("parser_fallback");
    expect(result.telemetry.narrationMode).toBe("logic_template");
    expect(result.telemetry.llmSuccessLayer0).toBe(false);
    expect(result.telemetry.llmSuccessLayer3).toBe(false);
    // 事実フィールドがちゃんと存在
    for (const c of result.card.candidates) {
      expect(c.title).toBeTruthy();
      expect(c.oneLiner).toBeTruthy();
    }
  });

  it("Layer 0 成功 × Layer 3 失敗 でも候補は返る (mode=logic_template)", async () => {
    // 1 回目: brief 成功、2 回目: narration 失敗
    runAIMock
      .mockImplementationOnce(() => mockBriefSuccess())
      .mockRejectedValueOnce(new Error("narration timeout"));

    const result = await generateMovieProposalV2({
      turns,
      analysis: makeAnalysis(),
      searchCandidates,
      profileA,
      profileB,
      relationship,
    });

    expect(result.card.candidates.length).toBeGreaterThan(0);
    expect(result.telemetry.briefSource).toBe("llm");
    expect(result.telemetry.llmSuccessLayer0).toBe(true);
    expect(result.telemetry.llmSuccessLayer3).toBe(false);
    expect(result.telemetry.narrationMode).toBe("logic_template");
  });

  it("Layer 0 失敗 × Layer 3 成功 も候補は返る (parser_fallback brief)", async () => {
    runAIMock
      .mockRejectedValueOnce(new Error("brief timeout"))
      .mockImplementationOnce(() => mockNarrationSuccess());

    const result = await generateMovieProposalV2({
      turns,
      analysis: makeAnalysis(),
      searchCandidates,
      profileA,
      profileB,
      relationship,
    });

    expect(result.card.candidates.length).toBeGreaterThan(0);
    expect(result.telemetry.briefSource).toBe("parser_fallback");
    expect(result.telemetry.llmSuccessLayer0).toBe(false);
    expect(result.telemetry.llmSuccessLayer3).toBe(true);
    expect(result.telemetry.narrationMode).toBe("llm");
  });

  it("両方成功 → mode=llm で候補あり", async () => {
    runAIMock
      .mockImplementationOnce(() => mockBriefSuccess())
      .mockImplementationOnce(() => mockNarrationSuccess());

    const result = await generateMovieProposalV2({
      turns,
      analysis: makeAnalysis(),
      searchCandidates,
      profileA,
      profileB,
      relationship,
    });

    expect(result.card.candidates.length).toBeGreaterThan(0);
    expect(result.telemetry.narrationMode).toBe("llm");
    expect(result.telemetry.llmSuccessLayer0).toBe(true);
    expect(result.telemetry.llmSuccessLayer3).toBe(true);
  });

  it("catalog 0 件 (search 結果が映画パース不能) → clarify フォールバック", async () => {
    runAIMock.mockRejectedValue(new Error("provider"));

    const result = await generateMovieProposalV2({
      turns,
      analysis: makeAnalysis(),
      searchCandidates: [], // catalog にならない
      profileA,
      profileB,
      relationship,
    });

    expect(result.card.candidates).toEqual([]);
    expect(result.card.validation?.fallbackToClarify).toBe(true);
    // clarify summary を返している
    expect(result.card.summary).toBeTruthy();
  });

  it("旧挙動の再発防止: provider 全落ち + catalog あり → 0 件ではなく候補が返る", async () => {
    // 全 runAI 呼び出しを reject
    runAIMock.mockRejectedValue(new Error("Gemini 503 / OpenAI timeout"));

    const result = await generateMovieProposalV2({
      turns,
      analysis: makeAnalysis(),
      searchCandidates,
      profileA,
      profileB,
      relationship,
    });

    // 候補ゼロになったら旧バグ再発
    expect(result.card.candidates.length).toBeGreaterThan(0);
    expect(result.card.candidates.length).toBeLessThanOrEqual(3);
  });

  it("avoidKeys に既出候補を渡すと候補から除外される", async () => {
    runAIMock.mockRejectedValue(new Error());

    const first = await generateMovieProposalV2({
      turns,
      analysis: makeAnalysis(),
      searchCandidates,
      profileA,
      profileB,
      relationship,
    });
    expect(first.card.candidates.length).toBeGreaterThan(0);
    const firstKeys = first.ranked.map((r) => r.candidateKey);

    const second = await generateMovieProposalV2({
      turns,
      analysis: makeAnalysis(),
      searchCandidates,
      profileA,
      profileB,
      relationship,
      avoidKeys: firstKeys,
    });
    for (const c of second.ranked) {
      expect(firstKeys).not.toContain(c.candidateKey);
    }
  });
});
