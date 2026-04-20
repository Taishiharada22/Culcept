/**
 * CoAlter proposalGenerator — reject + 1-time retry — Phase 1.5.4.5
 *
 * 検証:
 *  - 1回目で全候補が reject（全て抽象 slot）されたら retry が走る
 *  - retry が OK 候補を返せば採用
 *  - retry も失敗したら clarify フォールバック
 *  - 1回目で accepted が 1つ以上あれば retry は走らない
 *  - validation メタ（rejectedCount, rejectReasons）がカードに付与される
 *  - agreedConstraints が options 経由で渡されたら hard constraint として適用される
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// runAI をモック
const runAIMock = vi.fn();
vi.mock("@/lib/ai", () => ({
  runAI: (...args: unknown[]) => runAIMock(...args),
}));

import type {
  AgreedConstraint,
  CoAlterPersonProfile,
  ConversationAnalysis,
  RelationshipContext,
  SearchCandidate,
} from "@/lib/coalter/types";
import { generateProposal } from "@/lib/coalter/proposalGenerator";

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
      noveltyPreference: null,
      decisionSpeed: null,
      riskTolerance: null,
    },
    interests: [],
    values: [],
    archetypeCode: null,
    coreFear: null,
    coreDesire: null,
  };
}

function makeAnalysis(
  theme: "movie" | "food" | "travel" | "general",
  agreedConstraints: AgreedConstraint[] = [],
): ConversationAnalysis {
  return {
    theme,
    recentMessages: [],
    stalemate: null,
    caringIntensityA: 0.5,
    caringIntensityB: 0.5,
    extractedConstraints: {
      date: null,
      location: null,
      budget: null,
      timeSlot: null,
      preferences: [],
    },
    constraintScore: 0.5,
    agreedConstraints,
  };
}

const profileA = makeProfile("a", "たいし");
const profileB = makeProfile("b", "あやか");
const searchCandidates: SearchCandidate[] = [];

// P0-1: movie テーマは searchCandidates → movieCatalog に構造化され、
// catalog が空だと provider failure として LLM を呼ばず clarify に倒れる。
// retry 挙動を検証するテストでは、catalog を populate するために最小限の search 結果を渡す。
const movieSearchCandidates: SearchCandidate[] = [
  {
    title: "ラストマイル",
    description: "上映中。118分",
    externalRating: null,
    practicalInfo: null,
    source: "eiga.com",
    url: null,
  },
  {
    title: "アナログ",
    description: "上映中。106分",
    externalRating: null,
    practicalInfo: null,
    source: "filmarks",
    url: null,
  },
  {
    title: "PERFECT DAYS",
    description: "上映中。124分",
    externalRating: null,
    practicalInfo: null,
    source: "eiga.com",
    url: null,
  },
];

const relationship: RelationshipContext = {
  commonGround: [],
  frictionPoints: [],
  fairnessLedger: [],
  pastSessionCount: 0,
};

/** runAI の成功レスポンスを作るヘルパ */
function mockAIResponse(structured: Record<string, unknown>) {
  return Promise.resolve({
    text: JSON.stringify(structured),
    structured,
    usage: { input_tokens: 0, output_tokens: 0 },
    metadata: {},
    latencyMs: 10,
  });
}

beforeEach(() => {
  runAIMock.mockReset();
});

// ─────────────────────────────────────────────

describe("proposalGenerator retry — 3件 accepted なら runAI 1回で確定", () => {
  it("3候補すべて accepted → runAI 1回だけ呼ばれる", async () => {
    runAIMock.mockResolvedValueOnce(
      await mockAIResponse({
        summary: "OK",
        priorities: { userA: "A", userB: "B", common: null },
        candidates: [
          {
            rank: 1,
            oneLiner: "二人にぴったり",
            practicalInfo: "★4.2 / 19:00〜 / ¥1800 / 徒歩5分",
            slots: {
              what: { label: "ラストマイル", status: "proposed" },
              where: { label: "渋谷ストリーム", status: "confirmed" },
            },
            axisScores: { price: 1, access: 2, novelty: 1 },
          },
          {
            rank: 2,
            oneLiner: "2本目",
            practicalInfo: "★4.0 / 15:00〜 / ¥1500 / 徒歩2分",
            slots: {
              what: { label: "アナログ", status: "proposed" },
              where: { label: "109シネマズ二子玉川", status: "confirmed" },
            },
            axisScores: { price: 2, access: 1, novelty: 2 },
          },
          {
            rank: 3,
            oneLiner: "3本目",
            practicalInfo: "★4.5 / 21:00〜 / ¥2000 / 徒歩7分",
            slots: {
              what: { label: "PERFECT DAYS", status: "proposed" },
              where: { label: "新宿ピカデリー", status: "confirmed" },
            },
            axisScores: { price: 0, access: 3, novelty: 3 },
          },
        ],
        reasoning: "r",
        closing: "c",
        pairFitScore: 2,
      }),
    );

    const card = await generateProposal(
      profileA,
      profileB,
      makeAnalysis("movie"),
      movieSearchCandidates,
      relationship,
      null,
    );

    expect(runAIMock).toHaveBeenCalledTimes(1);
    expect(card.candidates).toHaveLength(3);
    expect(card.candidates[0].title).toBe("ラストマイル × 渋谷ストリーム");
    // validation meta は rejected が 0 なので undefined
    expect(card.validation).toBeUndefined();
  });

  it("1回目 2件 accepted → retry 試行 → retry で件数が増えなければ 2件返す", async () => {
    // 1回目: 2件 accepted / 1件 reject
    runAIMock.mockResolvedValueOnce(
      await mockAIResponse({
        summary: "OK",
        priorities: { userA: "A", userB: "B", common: null },
        candidates: [
          {
            rank: 1,
            oneLiner: "良い候補",
            practicalInfo: "★4.2 / 19:00〜 / ¥1800",
            slots: {
              what: { label: "ラストマイル", status: "proposed" },
              where: { label: "渋谷ストリーム", status: "confirmed" },
            },
          },
          {
            rank: 2,
            oneLiner: "2本目",
            practicalInfo: "★4.0 / 15:00〜 / ¥1500",
            slots: {
              what: { label: "アナログ", status: "proposed" },
              where: { label: "109シネマズ", status: "confirmed" },
            },
          },
          {
            rank: 3,
            oneLiner: "抽象",
            slots: {
              what: { label: "恋愛映画", status: "proposed" }, // reject
              where: { label: "駅周辺", status: "proposed" },
            },
          },
        ],
        reasoning: "r",
        closing: "c",
      }),
    );
    // 2回目 (retry): 1件のみ accepted（件数増えない）→ 1回目の 2件が優先
    runAIMock.mockResolvedValueOnce(
      await mockAIResponse({
        summary: "retry",
        priorities: { userA: "A", userB: "B", common: null },
        candidates: [
          {
            rank: 1,
            oneLiner: "retry 1",
            slots: {
              what: { label: "PERFECT DAYS", status: "proposed" },
              where: { label: "新宿ピカデリー", status: "confirmed" },
            },
          },
        ],
        reasoning: "r",
        closing: "c",
      }),
    );

    const card = await generateProposal(
      profileA,
      profileB,
      makeAnalysis("movie"),
      movieSearchCandidates,
      relationship,
      null,
    );

    // 3 件未満 → retry が走る
    expect(runAIMock).toHaveBeenCalledTimes(2);
    // retry は accepted=1、1回目は accepted=2 → 1回目優先
    expect(card.candidates).toHaveLength(2);
    expect(card.candidates[0].title).toContain("ラストマイル");
    expect(card.validation?.rejectedCount).toBe(1);
  });
});

// ─────────────────────────────────────────────

describe("proposalGenerator retry — 1回目で全 reject なら retry する", () => {
  it("1回目全 reject → retry で OK 候補 → 採用", async () => {
    // 1回目: 全候補抽象
    runAIMock.mockResolvedValueOnce(
      await mockAIResponse({
        summary: "OK",
        priorities: { userA: "A", userB: "B", common: null },
        candidates: [
          {
            rank: 1,
            oneLiner: "抽象",
            slots: {
              what: { label: "恋愛映画", status: "proposed" },
              where: { label: "駅周辺", status: "proposed" },
            },
          },
          {
            rank: 2,
            oneLiner: "抽象2",
            slots: {
              what: { label: "サスペンス", status: "proposed" },
              where: { label: "人気店", status: "proposed" },
            },
          },
        ],
        reasoning: "r",
        closing: "c",
      }),
    );

    // 2回目: 具体候補
    runAIMock.mockResolvedValueOnce(
      await mockAIResponse({
        summary: "再提案",
        priorities: { userA: "A", userB: "B", common: null },
        candidates: [
          {
            rank: 1,
            oneLiner: "具体的な候補",
            practicalInfo: "★4.2 / 19:00〜 / ¥1800",
            slots: {
              what: { label: "ラストマイル", status: "proposed" },
              where: { label: "渋谷ストリーム", status: "confirmed" },
            },
          },
        ],
        reasoning: "r",
        closing: "c",
      }),
    );

    const card = await generateProposal(
      profileA,
      profileB,
      makeAnalysis("movie"),
      movieSearchCandidates,
      relationship,
      null,
    );

    // 2回呼ばれる
    expect(runAIMock).toHaveBeenCalledTimes(2);
    expect(card.candidates).toHaveLength(1);
    expect(card.candidates[0].title).toBe("ラストマイル × 渋谷ストリーム");
  });

  it("1回目全 reject、2回目も全 reject → clarify フォールバック", async () => {
    const abstractPayload = {
      summary: "OK",
      priorities: { userA: "A", userB: "B", common: null },
      candidates: [
        {
          rank: 1,
          oneLiner: "抽象",
          slots: {
            what: { label: "恋愛映画", status: "proposed" },
            where: { label: "駅周辺", status: "proposed" },
          },
        },
      ],
      reasoning: "r",
      closing: "c",
    };

    runAIMock.mockResolvedValueOnce(await mockAIResponse(abstractPayload));
    runAIMock.mockResolvedValueOnce(await mockAIResponse(abstractPayload));

    const card = await generateProposal(
      profileA,
      profileB,
      makeAnalysis("movie"),
      movieSearchCandidates,
      relationship,
      null,
    );

    expect(runAIMock).toHaveBeenCalledTimes(2);
    // clarify フォールバック
    expect(card.candidates).toHaveLength(1);
    expect(card.candidates[0].title).toBe("もう少し教えて");
    expect(card.validation?.fallbackToClarify).toBe(true);
    expect(card.validation?.rejectedCount).toBeGreaterThan(0);
    expect(card.missingConstraints?.length ?? 0).toBeGreaterThan(0);
  });

  it("retry は最大 1回のみ（合計 2 call を超えない）", async () => {
    const abstractPayload = {
      summary: "OK",
      priorities: { userA: "A", userB: "B", common: null },
      candidates: [
        {
          rank: 1,
          oneLiner: "x",
          slots: {
            what: { label: "恋愛映画", status: "proposed" },
            where: { label: "駅周辺", status: "proposed" },
          },
        },
      ],
      reasoning: "r",
      closing: "c",
    };

    for (let i = 0; i < 5; i++) {
      runAIMock.mockResolvedValueOnce(await mockAIResponse(abstractPayload));
    }

    await generateProposal(
      profileA,
      profileB,
      makeAnalysis("movie"),
      movieSearchCandidates,
      relationship,
      null,
    );

    expect(runAIMock).toHaveBeenCalledTimes(2); // 初回 + retry 1
  });
});

// ─────────────────────────────────────────────

describe("proposalGenerator × agreedConstraints (hard)", () => {
  it("exclude:attached_venue 合意下で併設レストラン候補は reject → retry", async () => {
    // 1回目: 併設レストラン
    runAIMock.mockResolvedValueOnce(
      await mockAIResponse({
        summary: "",
        priorities: { userA: "A", userB: "B", common: null },
        candidates: [
          {
            rank: 1,
            oneLiner: "映画館と同じビル内のレストラン",
            practicalInfo: "同じビル内、便利",
            slots: {
              where: { label: "109シネマズ渋谷併設カフェ", status: "confirmed" },
              what: { label: "イタリアン", status: "proposed" },
            },
          },
        ],
        reasoning: "r",
        closing: "c",
      }),
    );

    // 2回目: 別の店
    runAIMock.mockResolvedValueOnce(
      await mockAIResponse({
        summary: "再提案",
        priorities: { userA: "A", userB: "B", common: null },
        candidates: [
          {
            rank: 1,
            oneLiner: "離れた場所のイタリアン",
            practicalInfo: "★4.0 / 18:00〜23:00 / ¥6000",
            slots: {
              where: { label: "渋谷イタリアーノ", status: "confirmed" },
              what: { label: "イタリアン", status: "proposed" },
            },
          },
        ],
        reasoning: "r",
        closing: "c",
      }),
    );

    const constraints: AgreedConstraint[] = [
      {
        kind: "exclusion",
        normalizedValue: "exclude:attached_venue",
        sourceText: "併設じゃなくて",
        confidence: 0.8,
        strength: "hard",
      },
    ];

    const card = await generateProposal(
      profileA,
      profileB,
      makeAnalysis("food"),
      searchCandidates,
      relationship,
      null,
      { agreedConstraints: constraints },
    );

    expect(runAIMock).toHaveBeenCalledTimes(2);
    expect(card.candidates).toHaveLength(1);
    expect(card.candidates[0].title).toContain("渋谷イタリアーノ");
  });
});

// ─────────────────────────────────────────────

describe("proposalGenerator — 5W1H 対象外テーマは validator をスキップ", () => {
  it("general テーマでは retry しない（themeRule 無し）", async () => {
    runAIMock.mockResolvedValueOnce(
      await mockAIResponse({
        summary: "",
        priorities: { userA: "A", userB: "B", common: null },
        candidates: [
          {
            rank: 1,
            title: "何かよくわからない候補",
            oneLiner: "x",
          },
        ],
        reasoning: "r",
        closing: "c",
      }),
    );

    const card = await generateProposal(
      profileA,
      profileB,
      makeAnalysis("general"),
      searchCandidates,
      relationship,
      null,
    );

    expect(runAIMock).toHaveBeenCalledTimes(1);
    expect(card.candidates).toHaveLength(1);
    expect(card.candidates[0].title).toBe("何かよくわからない候補");
  });
});
