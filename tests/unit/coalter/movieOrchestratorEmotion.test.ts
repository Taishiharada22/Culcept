/**
 * CoAlter Bug-1 Phase 3B Layer 2-C — movieOrchestrator emotion propagation 契約テスト
 *
 * 正本: docs/coalter-bug1-emotion-retrieval-design.md §9 / §10
 *
 * 契約:
 *   - generateMovieProposalV2 は input.analysis.emotionTags を enrichNarration に渡す
 *   - enrichNarration 経由で Layer 3 LLM prompt に emotion_signals block が届く
 *   - emotionTags 未指定 / 空 → prompt に emotion_signals block 入らない (既存挙動と同等)
 *   - source_lexeme / 具体語は prompt に出ない (CEO Q-L2-2 α 方針)
 *
 * 確認方法:
 *   runAI を vi.mock し、Layer 3 (taskType: "coalter_narration") の call から
 *   prompt 引数を直接 capture して contract を assert する (spy 不要)。
 *   既存 movieOrchestrator.test.ts の failure matrix とは意味分離するため新規 file。
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
import type { EmotionTag } from "@/lib/coalter/emotion/types";
import { generateMovieProposalV2 } from "@/lib/coalter/movieOrchestrator";

// ─────────────────────────────────────────────
// Minimal fixtures (movieOrchestrator.test.ts から copy + emotion 注入用拡張)
// ─────────────────────────────────────────────

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

function makeAnalysis(emotionTags?: EmotionTag[]): ConversationAnalysis {
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
    ...(emotionTags !== undefined ? { emotionTags } : {}),
  };
}

const turns: ConversationTurn[] = [
  {
    id: "t1",
    senderId: "a",
    body: "今週末、渋谷で映画見ない？",
    createdAt: "2026-04-26T10:00:00Z",
  },
  {
    id: "t2",
    senderId: "b",
    body: "いいね、夜がいいな",
    createdAt: "2026-04-26T10:01:00Z",
  },
];

const searchCandidates: SearchCandidate[] = [
  {
    title: "ラストマイル",
    description:
      "現在上映中。TOHOシネマズ渋谷で19:00〜、21:30〜。118分。Filmarks 4.2。サスペンス",
    externalRating: "4.2",
    practicalInfo: null,
    source: "eiga.com",
    url: "https://eiga.com/movie/last-mile",
  },
  {
    title: "アナログ",
    description:
      "現在上映中。TOHOシネマズ渋谷で20:00〜。106分。ヒューマンドラマ。★4.0",
    externalRating: "4.0",
    practicalInfo: null,
    source: "filmarks",
    url: "https://filmarks.com/movies/analog",
  },
];

// Layer 3 (coalter_narration) の成功レスポンス
function mockNarrationSuccess() {
  return Promise.resolve({
    text: "",
    structured: {
      summary:
        "渋谷・夜で見る映画を選ぶ流れ。2人ともサスペンス系が好みで一致している。",
      reasoning:
        "どちらも外したくない気持ちなので、評価の安定した作品を中心に並べました。",
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
// Layer 3 prompt capture helper
// ─────────────────────────────────────────────

/**
 * runAIMock の呼び出し履歴から Layer 3 (coalter_narration) call の prompt を取得。
 * Layer 0 (coalter_brief) と区別するため taskType で識別。
 */
function captureLayer3Prompt(): string | null {
  const call = runAIMock.mock.calls.find(
    (c) => (c[0] as { taskType?: string }).taskType === "coalter_narration",
  );
  if (!call) return null;
  return (call[0] as { prompt: string }).prompt;
}

// ─────────────────────────────────────────────
// 契約テスト
// ─────────────────────────────────────────────

describe("movieOrchestrator Layer 2-C: analysis.emotionTags propagation", () => {
  it("emotionTags あり → Layer 3 prompt に emotion_signals block が届く", async () => {
    // Layer 0 brief は parser fallback (Reject)、Layer 3 narration は成功
    runAIMock
      .mockRejectedValueOnce(new Error("brief timeout"))
      .mockImplementationOnce(() => mockNarrationSuccess());

    const emotionTags: EmotionTag[] = [
      { tag: "mood", source_lexeme: "気分", speaker: "user_a" },
      { tag: "friction", source_lexeme: "すれ違い", speaker: "both" },
    ];

    await generateMovieProposalV2({
      turns,
      analysis: makeAnalysis(emotionTags),
      searchCandidates,
      profileA,
      profileB,
      relationship,
    });

    const prompt = captureLayer3Prompt();
    expect(prompt).not.toBeNull();

    // emotion_signals block が prompt に届いている
    expect(prompt!).toContain("emotion_signals:");
    expect(prompt!).toContain("speaker: user_a");
    expect(prompt!).toContain("category: mood");
    expect(prompt!).toContain("speaker: both");
    expect(prompt!).toContain("category: friction");

    // CEO α 方針: source_lexeme / 具体語は prompt に出ない
    expect(prompt!).not.toContain("気分");
    expect(prompt!).not.toContain("すれ違い");
    expect(prompt!).not.toContain("source_lexeme");
  });

  it("emotionTags 未指定 (analysis に field 無し) → Layer 3 prompt に emotion_signals 入らない", async () => {
    runAIMock
      .mockRejectedValueOnce(new Error("brief timeout"))
      .mockImplementationOnce(() => mockNarrationSuccess());

    await generateMovieProposalV2({
      turns,
      analysis: makeAnalysis(), // emotionTags 未渡し → field 自体が無い
      searchCandidates,
      profileA,
      profileB,
      relationship,
    });

    const prompt = captureLayer3Prompt();
    expect(prompt).not.toBeNull();
    expect(prompt!).not.toContain("emotion_signals:");
    expect(prompt!).not.toContain("補助信号");
  });

  it("emotionTags === [] (空配列) → Layer 3 prompt に emotion_signals 入らない", async () => {
    runAIMock
      .mockRejectedValueOnce(new Error("brief timeout"))
      .mockImplementationOnce(() => mockNarrationSuccess());

    await generateMovieProposalV2({
      turns,
      analysis: makeAnalysis([]),
      searchCandidates,
      profileA,
      profileB,
      relationship,
    });

    const prompt = captureLayer3Prompt();
    expect(prompt).not.toBeNull();
    expect(prompt!).not.toContain("emotion_signals:");
    expect(prompt!).not.toContain("補助信号");
  });

  it("Layer 3 LLM が呼ばれた事実そのもの (rank > 0 経路の存在確認、回帰防止)", async () => {
    runAIMock
      .mockRejectedValueOnce(new Error("brief timeout"))
      .mockImplementationOnce(() => mockNarrationSuccess());

    await generateMovieProposalV2({
      turns,
      analysis: makeAnalysis(),
      searchCandidates,
      profileA,
      profileB,
      relationship,
    });

    const narrationCalls = runAIMock.mock.calls.filter(
      (c) => (c[0] as { taskType?: string }).taskType === "coalter_narration",
    );
    expect(narrationCalls.length).toBe(1);
  });
});
