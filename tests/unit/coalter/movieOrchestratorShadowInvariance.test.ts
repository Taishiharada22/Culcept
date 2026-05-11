/**
 * D-1-d movieOrchestrator shadow invariance テスト。
 *
 * 検証軸 (handover §5 / mainstream plan §3.2 元 D-2-d / 設計レビュー §11):
 *   - flag OFF (default) で generateMovieProposalV2 の挙動が D-1-d 接続前と完全同一
 *     (curate が一度も呼ばれない、return 値が変わらない)
 *   - flag ON で curate が **shadow 並走** で呼ばれる (fire-and-forget)
 *   - flag OFF / ON で本流 return 値が **完全一致** (shadow が結果に影響しない、
 *     CEO 必須条件 3)
 *   - flag ON + shadow 内 throw → 本流 return に影響なし (CEO 必須条件 4: fail-open)
 *
 * CEO 注意 (本セッション 2026-05-11):
 *   - snapshot だけに依存せず、flag OFF/ON の return equality を **明示的に assert**
 *   - env を触る test は afterEach で必ず復元
 *   - internal helper の test は無理な spy 設計せず、**module mock (vi.mock)** で
 *     `curate` を mock して call 検出
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

// 既存 LLM (Layer 3 enrichNarration が使う) を mock — 本 file の verify 対象外
const runAIMock = vi.fn();
vi.mock("@/lib/ai", () => ({
  runAI: (...args: unknown[]) => runAIMock(...args),
}));

// CEO 採用 (内部 helper 検出): curate を module mock で置換、shadow 起動を検出
const curateMock = vi.fn();
vi.mock("@/lib/coalter/movie/curator", async () => {
  const actual = await vi.importActual<typeof import("@/lib/coalter/movie/curator")>(
    "@/lib/coalter/movie/curator",
  );
  return {
    ...actual,
    curate: (...args: unknown[]) => curateMock(...args),
  };
});

import type {
  CoAlterPersonProfile,
  ConversationAnalysis,
  ConversationTurn,
  RelationshipContext,
  SearchCandidate,
} from "@/lib/coalter/types";
import { generateMovieProposalV2 } from "@/lib/coalter/movieOrchestrator";

const ENV_KEY = "COALTER_MOVIE_CURATOR_LIVE";

// ─────────────────────────────────────────────
// Minimal fixtures (movieOrchestratorEmotion.test.ts 慣習踏襲)
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
  {
    id: "t2",
    senderId: "b",
    body: "いいね、夜がいいな",
    createdAt: "2026-05-11T10:01:00Z",
  },
];

const searchCandidates: SearchCandidate[] = [
  {
    title: "テスト作品",
    description:
      "現在上映中。TOHOシネマズ渋谷で19:00〜、21:30〜。118分。Filmarks 4.2。サスペンス",
    externalRating: "4.2",
    practicalInfo: null,
    source: "eiga.com",
    url: "https://example.com/test",
  },
];

function buildInput() {
  return {
    turns,
    analysis: makeAnalysis(),
    searchCandidates,
    profileA,
    profileB,
    relationship,
  };
}

/**
 * fire-and-forget の microtask を flush する。
 *   `void runMovieCuratorShadow().catch(...)` は同期 return 後に async 関数体が
 *   microtask queue で実行される。test では明示的に flush しないと curate mock の
 *   call カウントが反映されない。
 */
async function flushMicrotasks(): Promise<void> {
  // setImmediate 1 tick で curate await + その後の処理が完了する
  await new Promise<void>((resolve) => setImmediate(resolve));
}

// ═══════════════════════════════════════════════════════════════════════════
// env restore (CEO 注意: afterEach で復元)
// ═══════════════════════════════════════════════════════════════════════════

const originalEnv = process.env[ENV_KEY];

beforeEach(() => {
  curateMock.mockReset();
  runAIMock.mockReset();
  // Layer 3 LLM は本 file の対象外、安定 stub (失敗 = logic_template fallback)
  runAIMock.mockRejectedValue(new Error("layer3-llm-disabled-in-test"));
  // curate mock の default: 何もしない resolve (shadow 経路 verify のみ)
  curateMock.mockResolvedValue({
    topPick: {
      title: "(stub)",
      confidence: 0,
      reasoning: {
        personA_lens: "stub",
        personB_lens: "stub",
        relational_fit: "stub",
        today_hook: "stub",
        veto_guard: "stub",
      },
      narrative: "stub",
      fairnessNote: null,
    },
    alternates: [],
    diagnostics: {
      llmCallSucceeded: false,
      totalPicks: 0,
      validPicks: 0,
      rejectedPicks: 0,
      rejectionReasons: [],
      fallbackUsed: true,
    },
  });
});

afterEach(() => {
  if (originalEnv === undefined) {
    delete process.env[ENV_KEY];
  } else {
    process.env[ENV_KEY] = originalEnv;
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 1. flag OFF: curate が呼ばれない
// ═══════════════════════════════════════════════════════════════════════════

describe("flag OFF: shadow 不起動", () => {
  it("env 未設定 (default false) で curate が一度も呼ばれない", async () => {
    delete process.env[ENV_KEY];
    await generateMovieProposalV2(buildInput());
    await flushMicrotasks();
    expect(curateMock).not.toHaveBeenCalled();
  });

  it('env="false" でも curate が呼ばれない', async () => {
    process.env[ENV_KEY] = "false";
    await generateMovieProposalV2(buildInput());
    await flushMicrotasks();
    expect(curateMock).not.toHaveBeenCalled();
  });

  it('env="invalid" (fallback false) でも curate が呼ばれない', async () => {
    process.env[ENV_KEY] = "invalid";
    await generateMovieProposalV2(buildInput());
    await flushMicrotasks();
    expect(curateMock).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. flag ON: curate が 1 回呼ばれる (shadow、fire-and-forget)
// ═══════════════════════════════════════════════════════════════════════════

describe("flag ON: shadow 起動 (fire-and-forget)", () => {
  it('env="true" で curate が 1 回呼ばれる (microtask flush 後)', async () => {
    process.env[ENV_KEY] = "true";
    await generateMovieProposalV2(buildInput());
    await flushMicrotasks();
    expect(curateMock).toHaveBeenCalledTimes(1);
  });

  it('env="1" でも curate が 1 回呼ばれる', async () => {
    process.env[ENV_KEY] = "1";
    await generateMovieProposalV2(buildInput());
    await flushMicrotasks();
    expect(curateMock).toHaveBeenCalledTimes(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. flag OFF / ON で return 値が完全一致 (CEO 必須条件 3)
//    CEO 注意: snapshot だけに依存せず明示的 equality
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 独立 2 回実行の `Date.now()` 揺らぎを除外する helper。
 * telemetry.latencyMs* は実行時間依存で常に flaky になるため equality 対象から外す。
 * 真の意図 (shadow が結果に影響しない) は他 stable field の deep equality で担保。
 */
function withoutTimingNoise(
  result: Awaited<ReturnType<typeof generateMovieProposalV2>>,
) {
  const {
    latencyMsTotal: _t,
    latencyMsCatalog: _c,
    latencyMsRank: _r,
    latencyMsNarration: _n,
    ...stableTelemetry
  } = result.telemetry;
  return { ...result, telemetry: stableTelemetry };
}

describe("flag OFF / ON で本流 return 完全一致 (shadow 結果は本流に影響しない)", () => {
  it("toEqual で result 全体の deep equality (latency 揺らぎ除外、snapshot 依存なし)", async () => {
    delete process.env[ENV_KEY];
    const off = await generateMovieProposalV2(buildInput());
    await flushMicrotasks();

    process.env[ENV_KEY] = "true";
    const on = await generateMovieProposalV2(buildInput());
    await flushMicrotasks();

    // CEO 注意: snapshot だけに依存せず明示的 equality。latency 系は実行ごとの
    // Date.now() 揺らぎで本来 flaky なので除外 (shadow 起因の差ではない)。
    expect(withoutTimingNoise(on)).toEqual(withoutTimingNoise(off));
  });

  it("各 field 個別に deep equality (card / telemetry stable / ranked / primaryQuestion / diagnostics)", async () => {
    delete process.env[ENV_KEY];
    const off = await generateMovieProposalV2(buildInput());
    await flushMicrotasks();

    process.env[ENV_KEY] = "true";
    const on = await generateMovieProposalV2(buildInput());
    await flushMicrotasks();

    expect(on.card).toEqual(off.card);
    // telemetry は latency 揺らぎを除外して比較
    expect(withoutTimingNoise(on).telemetry).toEqual(
      withoutTimingNoise(off).telemetry,
    );
    expect(on.ranked).toEqual(off.ranked);
    expect(on.primaryQuestion).toEqual(off.primaryQuestion);
    expect(on.diagnostics).toEqual(off.diagnostics);
  });

  it("telemetry の latency field は **shape のみ verify** (実行時間依存、toEqual 対象外)", async () => {
    delete process.env[ENV_KEY];
    const off = await generateMovieProposalV2(buildInput());
    process.env[ENV_KEY] = "true";
    const on = await generateMovieProposalV2(buildInput());
    // 両 result で latency field が number として存在 (shadow 起因の差は問わない)
    expect(typeof off.telemetry.latencyMsTotal).toBe("number");
    expect(typeof on.telemetry.latencyMsTotal).toBe("number");
    expect(typeof off.telemetry.latencyMsCatalog).toBe("number");
    expect(typeof on.telemetry.latencyMsCatalog).toBe("number");
    expect(typeof off.telemetry.latencyMsRank).toBe("number");
    expect(typeof on.telemetry.latencyMsRank).toBe("number");
    expect(typeof off.telemetry.latencyMsNarration).toBe("number");
    expect(typeof on.telemetry.latencyMsNarration).toBe("number");
  });

  it("flag 切替で diagnostics.searchCandidatesCount が変わらない (shadow が pipeline に介入しない)", async () => {
    delete process.env[ENV_KEY];
    const off = await generateMovieProposalV2(buildInput());

    process.env[ENV_KEY] = "true";
    const on = await generateMovieProposalV2(buildInput());

    expect(on.diagnostics.searchCandidatesCount).toBe(
      off.diagnostics.searchCandidatesCount,
    );
    expect(on.diagnostics.catalogCount).toBe(off.diagnostics.catalogCount);
    expect(on.diagnostics.rankedCount).toBe(off.diagnostics.rankedCount);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. flag ON + shadow 内 throw → 本流 return に影響なし (CEO 必須条件 4)
// ═══════════════════════════════════════════════════════════════════════════

describe("flag ON + shadow 失敗: 本流不変 (CEO 必須条件 4 fail-open)", () => {
  it("curate が throw しても本流 return が完全 (二重防御)", async () => {
    process.env[ENV_KEY] = "true";
    curateMock.mockRejectedValueOnce(new Error("shadow internal error"));
    const result = await generateMovieProposalV2(buildInput());
    await flushMicrotasks();
    // 本流 return は完全 (shadow 失敗が伝播しない)
    expect(result.card).toBeDefined();
    expect(result.ranked).toBeDefined();
    expect(result.diagnostics).toBeDefined();
    expect(result.telemetry).toBeDefined();
  });

  it("curate throw 後でも次の generateMovieProposalV2 呼び出しが正常動作", async () => {
    process.env[ENV_KEY] = "true";
    curateMock.mockRejectedValueOnce(new Error("transient shadow error"));
    await generateMovieProposalV2(buildInput());
    await flushMicrotasks();

    // 2 回目: mock は default (resolve) に戻る → curate 1 回呼ばれる
    curateMock.mockClear();
    curateMock.mockResolvedValue({
      topPick: {
        title: "(stub)",
        confidence: 0,
        reasoning: {
          personA_lens: "stub",
          personB_lens: "stub",
          relational_fit: "stub",
          today_hook: "stub",
          veto_guard: "stub",
        },
        narrative: "stub",
        fairnessNote: null,
      },
      alternates: [],
      diagnostics: {
        llmCallSucceeded: false,
        totalPicks: 0,
        validPicks: 0,
        rejectedPicks: 0,
        rejectionReasons: [],
        fallbackUsed: true,
      },
    });
    const result = await generateMovieProposalV2(buildInput());
    await flushMicrotasks();
    expect(result.card).toBeDefined();
    expect(curateMock).toHaveBeenCalledTimes(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. shadow 引数 (curate に渡される input shape を verify)
// ═══════════════════════════════════════════════════════════════════════════

describe("flag ON: shadow が D-1-a/b/c chain を正しく接続する", () => {
  it("curate に渡される input は { lens, query, candidatePool } を持つ", async () => {
    process.env[ENV_KEY] = "true";
    await generateMovieProposalV2(buildInput());
    await flushMicrotasks();

    expect(curateMock).toHaveBeenCalledTimes(1);
    const callArg = curateMock.mock.calls[0][0];
    expect(callArg).toHaveProperty("lens");
    expect(callArg).toHaveProperty("query");
    expect(callArg).toHaveProperty("candidatePool");
    // CEO 採用 X1: 3 source 全空配列 → candidatePool 空
    expect(callArg.candidatePool).toEqual([]);
  });

  it("curate に渡される deps.llmClient は CEO 採用 Y1 (空 stub、async 関数で空文字返す)", async () => {
    process.env[ENV_KEY] = "true";
    await generateMovieProposalV2(buildInput());
    await flushMicrotasks();

    const callDeps = curateMock.mock.calls[0][1];
    expect(callDeps).toHaveProperty("llmClient");
    expect(typeof callDeps.llmClient).toBe("function");
    // 空 stub: 呼ぶと "" を resolve
    const llmResult = await callDeps.llmClient({
      systemPrompt: "x",
      userPrompt: "y",
    });
    expect(llmResult).toBe("");
  });
});
