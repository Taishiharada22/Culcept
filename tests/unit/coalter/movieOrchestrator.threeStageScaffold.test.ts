/**
 * D-2-e2 movieOrchestrator COALTER_THREE_STAGE grand kill switch 統合テスト
 * + threeStageOrchestratorAdapter 単体テスト。
 *
 * 検証軸 (CEO 採用 D-2-e2 v2 §1 + CEO 補正 6 点):
 *   1. `threeStageEnabled` flag default false (env 未設定 / "false" / 不正値で全て false)
 *   2. flag OFF (default) で `runThreeStageScaffoldPath` が呼ばれない
 *      → 既存 4-layer pipeline が走る (CEO 補正 4)
 *   3. flag ON で `runThreeStageScaffoldPath` が 1 回呼ばれる (CEO 補正 4)
 *   4. flag ON での return 値が `MovieOrchestratorOutput` 5 field shape 互換
 *      (CEO 補正 3: caller inspect 有無に依存しない型上互換性 + test verify)
 *   5. adapter `runThreeStageScaffoldPath` 単体 (5 field shape + null/empty 整合)
 *   6. env を触る test は afterEach で必ず復元 (CEO 補正 4)
 *
 * CEO 注意 (前回 D-1-d 知見):
 *   - snapshot 依存せず、明示的 equality / shape verify
 *   - env restore は absent / set 両方を保存して復元
 *   - module mock (vi.mock) で adapter を spy 化、orchestrator 入口の routing を verify
 *
 * D-2-e2 scope 厳守:
 *   - 実 fetcher / 実 LLM / M0 lens 接続なし
 *   - stub / placeholder は scaffold 限定 (本 test では adapter 単体 + 入口 routing
 *     のみ verify)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

// Layer 3 LLM は本 file 対象外、安定 stub
const runAIMock = vi.fn();
vi.mock("@/lib/ai", () => ({
  runAI: (...args: unknown[]) => runAIMock(...args),
}));

// adapter module mock (spy 化、orchestrator 入口の routing を verify)
const scaffoldMock = vi.fn();
vi.mock("@/lib/coalter/movie/threeStageOrchestratorAdapter", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/coalter/movie/threeStageOrchestratorAdapter")
  >("@/lib/coalter/movie/threeStageOrchestratorAdapter");
  return {
    ...actual,
    runThreeStageScaffoldPath: (...args: unknown[]) => scaffoldMock(...args),
  };
});

import type {
  CoAlterPersonProfile,
  ConversationAnalysis,
  ConversationTurn,
  RelationshipContext,
  SearchCandidate,
} from "@/lib/coalter/types";
import {
  generateMovieProposalV2,
  type MovieOrchestratorInput,
  type MovieOrchestratorOutput,
} from "@/lib/coalter/movieOrchestrator";
import { COALTER_FLAGS } from "@/lib/coalter/flags";
import { runThreeStageScaffoldPath as actualScaffoldPath } from "@/lib/coalter/movie/threeStageOrchestratorAdapter";

const ENV_KEY = "COALTER_THREE_STAGE";

// ═══════════════════════════════════════════════════════════════════════════
// fixtures (movieOrchestratorShadowInvariance.test.ts 慣習踏襲)
// ═══════════════════════════════════════════════════════════════════════════

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
    interests: ["ヒューマンドラマ"],
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
    body: "今週末、渋谷で映画見ない?",
    createdAt: "2026-05-11T10:00:00Z",
  },
];

const searchCandidates: SearchCandidate[] = [
  {
    title: "テスト作品",
    description: "現在上映中。TOHOシネマズ渋谷で19:00〜。118分。",
    externalRating: "4.2",
    practicalInfo: null,
    source: "eiga.com",
    url: "https://example.com/test",
  },
];

function buildInput(): MovieOrchestratorInput {
  return {
    turns,
    analysis: makeAnalysis(),
    searchCandidates,
    profileA,
    profileB,
    relationship,
  };
}

/** scaffold mock の default return: MovieOrchestratorOutput 5 field 互換 placeholder。 */
function makeScaffoldStubOutput(): MovieOrchestratorOutput {
  return {
    card: {
      summary: "",
      priorities: { userA: "", userB: "", common: null },
      candidates: [],
      reasoning: "",
      closing: "",
    },
    telemetry: {
      briefSource: "parser_fallback",
      briefConfidence: 0,
      catalogCount: 0,
      rankedCount: 0,
      rankingAxesPreset: null,
      narrationMode: "logic_template",
      llmSuccessLayer0: false,
      llmSuccessLayer3: false,
      latencyMsTotal: 0,
      latencyMsCatalog: 0,
      latencyMsRank: 0,
      latencyMsNarration: 0,
    },
    ranked: [],
    primaryQuestion: null,
    diagnostics: {
      searchCandidatesCount: 0,
      catalogCount: 0,
      rankedCount: 0,
      missingWhereRejectCount: 0,
      titleWithoutTheaterCount: 0,
      staleReleaseRejectCount: 0,
      endedStatusCount: 0,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// env restore (CEO 補正 4: afterEach で必ず復元)
// ═══════════════════════════════════════════════════════════════════════════

const originalEnv = process.env[ENV_KEY];

beforeEach(() => {
  scaffoldMock.mockReset();
  scaffoldMock.mockResolvedValue(makeScaffoldStubOutput());
  runAIMock.mockReset();
  runAIMock.mockRejectedValue(new Error("layer3-llm-disabled-in-test"));
});

afterEach(() => {
  if (originalEnv === undefined) {
    delete process.env[ENV_KEY];
  } else {
    process.env[ENV_KEY] = originalEnv;
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 1. flag default false 検証 (CEO 補正 4)
// ═══════════════════════════════════════════════════════════════════════════

describe("threeStageEnabled flag default false", () => {
  it("env 未設定で false", () => {
    delete process.env[ENV_KEY];
    expect(COALTER_FLAGS.threeStageEnabled).toBe(false);
  });

  it('env="false" で false', () => {
    process.env[ENV_KEY] = "false";
    expect(COALTER_FLAGS.threeStageEnabled).toBe(false);
  });

  it('env="invalid" (不正値) で false (fallback)', () => {
    process.env[ENV_KEY] = "invalid";
    expect(COALTER_FLAGS.threeStageEnabled).toBe(false);
  });

  it('env="true" で true', () => {
    process.env[ENV_KEY] = "true";
    expect(COALTER_FLAGS.threeStageEnabled).toBe(true);
  });

  it('env="1" で true', () => {
    process.env[ENV_KEY] = "1";
    expect(COALTER_FLAGS.threeStageEnabled).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. flag OFF: scaffold path 不起動 + 4-layer pipeline へ流れる (CEO 補正 4)
// ═══════════════════════════════════════════════════════════════════════════

describe("flag OFF: runThreeStageScaffoldPath 不起動 (4-layer pipeline 経路)", () => {
  it("env 未設定 (default false) で scaffold が一度も呼ばれない", async () => {
    delete process.env[ENV_KEY];
    await generateMovieProposalV2(buildInput());
    expect(scaffoldMock).not.toHaveBeenCalled();
  });

  it('env="false" でも scaffold が呼ばれない', async () => {
    process.env[ENV_KEY] = "false";
    await generateMovieProposalV2(buildInput());
    expect(scaffoldMock).not.toHaveBeenCalled();
  });

  it('env="invalid" (fallback false) でも scaffold が呼ばれない', async () => {
    process.env[ENV_KEY] = "invalid";
    await generateMovieProposalV2(buildInput());
    expect(scaffoldMock).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. flag ON: scaffold path が 1 回呼ばれる (CEO 補正 4)
// ═══════════════════════════════════════════════════════════════════════════

describe("flag ON: runThreeStageScaffoldPath 起動", () => {
  it('env="true" で scaffold が 1 回呼ばれる', async () => {
    process.env[ENV_KEY] = "true";
    await generateMovieProposalV2(buildInput());
    expect(scaffoldMock).toHaveBeenCalledTimes(1);
  });

  it('env="1" でも scaffold が 1 回呼ばれる', async () => {
    process.env[ENV_KEY] = "1";
    await generateMovieProposalV2(buildInput());
    expect(scaffoldMock).toHaveBeenCalledTimes(1);
  });

  it("scaffold は (input, startedTotal: number) で呼ばれる", async () => {
    process.env[ENV_KEY] = "true";
    const input = buildInput();
    await generateMovieProposalV2(input);
    expect(scaffoldMock).toHaveBeenCalledTimes(1);
    const [calledInput, startedTotal] = scaffoldMock.mock.calls[0];
    expect(calledInput).toBe(input);
    expect(typeof startedTotal).toBe("number");
    expect(startedTotal).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. flag ON output shape MovieOrchestratorOutput 互換 (CEO 補正 3)
// ═══════════════════════════════════════════════════════════════════════════

describe("flag ON: return 値が MovieOrchestratorOutput 5 field shape 互換", () => {
  it("5 field 全て present + 型整合", async () => {
    process.env[ENV_KEY] = "true";
    const result = await generateMovieProposalV2(buildInput());
    expect(Object.keys(result).sort()).toEqual([
      "card",
      "diagnostics",
      "primaryQuestion",
      "ranked",
      "telemetry",
    ]);
    expect(typeof result.card).toBe("object");
    expect(typeof result.telemetry).toBe("object");
    expect(Array.isArray(result.ranked)).toBe(true);
    expect(result.primaryQuestion).toBeNull();
    expect(typeof result.diagnostics).toBe("object");
  });

  it("card は ProposalCard 5 必須 field を含む", async () => {
    process.env[ENV_KEY] = "true";
    const result = await generateMovieProposalV2(buildInput());
    expect(result.card).toHaveProperty("summary");
    expect(result.card).toHaveProperty("priorities");
    expect(result.card).toHaveProperty("candidates");
    expect(result.card).toHaveProperty("reasoning");
    expect(result.card).toHaveProperty("closing");
    expect(Array.isArray(result.card.candidates)).toBe(true);
  });

  it("telemetry は ProposalQualityRecord 必須 field (sessionId/userAction 除く) を含む", async () => {
    process.env[ENV_KEY] = "true";
    const result = await generateMovieProposalV2(buildInput());
    const expectedKeys = [
      "briefConfidence",
      "briefSource",
      "catalogCount",
      "latencyMsCatalog",
      "latencyMsNarration",
      "latencyMsRank",
      "latencyMsTotal",
      "llmSuccessLayer0",
      "llmSuccessLayer3",
      "narrationMode",
      "rankedCount",
      "rankingAxesPreset",
    ];
    expect(Object.keys(result.telemetry).sort()).toEqual(expectedKeys);
  });

  it("diagnostics 7 field 整合 (4-layer pipeline 経路と同 shape)", async () => {
    process.env[ENV_KEY] = "true";
    const result = await generateMovieProposalV2(buildInput());
    expect(Object.keys(result.diagnostics).sort()).toEqual([
      "catalogCount",
      "endedStatusCount",
      "missingWhereRejectCount",
      "rankedCount",
      "searchCandidatesCount",
      "staleReleaseRejectCount",
      "titleWithoutTheaterCount",
    ]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. adapter runThreeStageScaffoldPath 単体 (mock を経由しない直接 verify)
// ═══════════════════════════════════════════════════════════════════════════

describe("runThreeStageScaffoldPath 単体: MovieOrchestratorOutput shape 互換", () => {
  it("stub deps + placeholder lens で MovieOrchestratorOutput shape を返す", async () => {
    const startedTotal = Date.now();
    const result = await actualScaffoldPath(buildInput(), startedTotal);
    expect(Object.keys(result).sort()).toEqual([
      "card",
      "diagnostics",
      "primaryQuestion",
      "ranked",
      "telemetry",
    ]);
    expect(result.ranked).toEqual([]);
    expect(result.primaryQuestion).toBeNull();
    expect(result.card.candidates).toEqual([]);
    expect(result.telemetry.narrationMode).toBe("logic_template");
    expect(result.telemetry.briefSource).toBe("parser_fallback");
    expect(result.telemetry.catalogCount).toBe(0);
    expect(result.telemetry.rankedCount).toBe(0);
    expect(result.diagnostics.searchCandidatesCount).toBe(0);
    expect(result.diagnostics.catalogCount).toBe(0);
  });

  it("latencyMsTotal は呼び出し時の startedTotal から算出 (非負)", async () => {
    const startedTotal = Date.now();
    const result = await actualScaffoldPath(buildInput(), startedTotal);
    expect(result.telemetry.latencyMsTotal).toBeGreaterThanOrEqual(0);
    expect(result.telemetry.latencyMsCatalog).toBe(0);
    expect(result.telemetry.latencyMsRank).toBe(0);
    expect(result.telemetry.latencyMsNarration).toBe(0);
  });

  it("実 fetcher / 実 LLM 不接続 (stub 限定): throw せず resolve", async () => {
    // adapter が stub deps で runThreeStagePipeline を呼ぶため、実 API 接続なし
    // → 例外なく完走することを verify
    const startedTotal = Date.now();
    await expect(
      actualScaffoldPath(buildInput(), startedTotal),
    ).resolves.toBeDefined();
  });
});
