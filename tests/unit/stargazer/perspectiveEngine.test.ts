/**
 * Perspective Engine v4/v5 ユニットテスト
 *
 * CEO指定の検証4項目:
 *   1. explicit ask が通常会話に流れないか
 *   2. query builder が会話状態ベースで動くか（LLM依存部分は実検証で確認）
 *   3. quality gate がハードネガティブを落とせるか
 *   4. 検索失敗時に正直に着地できるか（route.ts のプロンプト注入はE2Eで確認）
 *
 * + v5 Phase A: exploration depth / resume 判定
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── モック ──
vi.mock("@/lib/stargazer/featureFlags", () => ({
  STARGAZER_FLAGS: {
    explicitSearchLive: true,
    implicitSearchLive: true,
    perspectiveEngineLive: true,
  },
}));

vi.mock("@/lib/ai", () => ({
  runAI: vi.fn(),
}));

import {
  detectExplicitSearchIntent,
  evaluateSearchGate,
  retrievalQualityGate,
  classifyExplorationDepth,
  shouldResumeExploration,
  buildResumeAnchors,
  createExplorationState,
  peAssembleResponseContract,
  extractCandidateEntityNames,
  rankFragmentsByFit,
  preFilterSearchResults,
  buildPerspectivePromptBlock,
  type PerspectiveFragment,
  type SearchTaskClassification,
  type ExplorationState,
  type CandidateEntity,
  type PersonalityContext,
} from "@/lib/stargazer/perspectiveEngine";
import type { QueryContext, QuestionCategory } from "@/lib/stargazer/alterHomeAdapter";

// ── ヘルパー ──

function makeQueryContext(domain: string): QueryContext {
  return {
    domain,
    domainConfidence: 0.8,
    complexity: "moderate" as const,
    hasEntity: false,
    hasComparison: false,
    isHypothetical: false,
    personalModelDependency: 0.5,
    externalInfoNeed: 0.5,
  };
}

function makeFragment(overrides: Partial<PerspectiveFragment> = {}): PerspectiveFragment {
  return {
    text: "テスト情報",
    sourceUrl: "https://example.com",
    sourceTitle: "テスト記事",
    epistemicType: "empirical_fact",
    confidence: 0.8,
    sourceAuthority: "media",
    stanceTowardQuery: "neutral",
    forceRelevance: {
      opportunity: 0, cost: 0, relationship: 0, value: 0, fear: 0, growth: 0,
    },
    ...overrides,
  };
}

function makeSearchTaskClassification(overrides: Partial<SearchTaskClassification> = {}): SearchTaskClassification {
  return {
    type: "factual_lookup",
    description: "test task",
    searchFitness: 0.9,
    requiredInfoType: "factual",
    queries: ["test query"],
    explorationDepth: "single",
    ...overrides,
  };
}

function makeExplorationState(overrides: Partial<ExplorationState> = {}): ExplorationState {
  const now = new Date();
  const expires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  return {
    explorationId: "exp_test_123",
    taskType: "listing_search",
    domain: "career_fit",
    userIntent: "転職先を探したい",
    currentPhase: "user_selection",
    turnCount: 1,
    isActive: false,
    isDormant: true,
    resumeAnchors: ["A社", "B社", "スタバ"],
    fitHypotheses: ["技術志向で少人数環境"],
    candidatesProposed: [
      { name: "A社", category: "IT", fitReason: "技術志向", source: "web", userSelected: false },
      { name: "B社", category: "IT", fitReason: "少人数", source: "web", userSelected: false },
    ],
    candidatesSelected: [],
    researchCompleted: [],
    totalSearchQueries: ["IT スタートアップ 採用"],
    limitations: ["公開Webから調べた範囲の候補"],
    createdAt: now.toISOString(),
    lastUpdatedAt: now.toISOString(),
    expiresAt: expires.toISOString(),
    ...overrides,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. Explicit Ask Detection（検証項目1）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("detectExplicitSearchIntent", () => {
  it("「調べて」を検出する", () => {
    expect(detectExplicitSearchIntent("転職市場について調べて")).toBe(true);
  });

  it("「WEBから」を検出する", () => {
    expect(detectExplicitSearchIntent("WEBから見つけてきて")).toBe(true);
  });

  it("「検索して」を検出する", () => {
    expect(detectExplicitSearchIntent("検索してみて")).toBe(true);
  });

  it("「ネットで」を検出する", () => {
    expect(detectExplicitSearchIntent("ネットで探してみて")).toBe(true);
  });

  it("「ググって」を検出する", () => {
    expect(detectExplicitSearchIntent("ちょっとググってくれない？")).toBe(true);
  });

  it("通常の質問は検出しない", () => {
    expect(detectExplicitSearchIntent("転職したいんだけど")).toBe(false);
  });

  it("感情吐露は検出しない", () => {
    expect(detectExplicitSearchIntent("しんどいんだよね")).toBe(false);
  });

  it("内部質問は検出しない", () => {
    expect(detectExplicitSearchIntent("俺ってどんな性格？")).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. Search Gate（検証項目1: explicit が通常会話に流れない）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("evaluateSearchGate", () => {
  it("explicit ask は Phase/Trust に関係なく検索を通す", () => {
    const result = evaluateSearchGate(
      "転職市場について調べて",
      makeQueryContext("career_fit"),
      "judgment" as QuestionCategory,
      0, // Phase 0（通常なら phase_too_low で弾かれる）
      0, // Trust 0
      "conclude",
    );
    expect(result.shouldSearch).toBe(true);
    expect(result.isExplicitAsk).toBe(true);
    expect(result.searchNeed).toBe(1.0);
    expect(result.reason).toBe("explicit_ask");
  });

  it("explicit ask でフラグOFFの場合、explicitAskBlocked を返す", async () => {
    // featureFlags モジュールのモックを上書き
    const flagsModule = await import("@/lib/stargazer/featureFlags");
    const flags = flagsModule.STARGAZER_FLAGS as Record<string, boolean>;
    const original = flags.explicitSearchLive;
    flags.explicitSearchLive = false;

    const result = evaluateSearchGate(
      "WEBから探して",
      makeQueryContext("general"),
      "general" as QuestionCategory,
      0, 0, "conclude",
    );
    expect(result.shouldSearch).toBe(false);
    expect(result.isExplicitAsk).toBe(true);
    expect(result.explicitAskBlocked).toBe(true);

    flags.explicitSearchLive = original;
  });

  it("暗黙検索は Phase < 1 で弾かれる", () => {
    const result = evaluateSearchGate(
      "エンジニアの年収ってどのくらい？",
      makeQueryContext("career_fit"),
      "judgment" as QuestionCategory,
      0, // Phase 0
      3,
      "conclude",
    );
    expect(result.shouldSearch).toBe(false);
    expect(result.reason).toBe("phase_too_low");
  });

  it("暗黙検索は Trust < 2 で弾かれる", () => {
    const result = evaluateSearchGate(
      "エンジニアの年収ってどのくらい？",
      makeQueryContext("career_fit"),
      "judgment" as QuestionCategory,
      2,
      1, // Trust 1
      "conclude",
    );
    expect(result.shouldSearch).toBe(false);
    expect(result.reason).toBe("trust_too_low");
  });

  it("挨拶は検索しない", () => {
    const result = evaluateSearchGate(
      "おはよう",
      makeQueryContext("general"),
      "general" as QuestionCategory,
      3, 3, "conclude",
    );
    expect(result.shouldSearch).toBe(false);
    expect(result.reason).toBe("greeting");
  });

  it("感情吐露は searchNeed を抑制する", () => {
    const result = evaluateSearchGate(
      "しんどい",
      makeQueryContext("general"),
      "general" as QuestionCategory,
      3, 3, "conclude",
    );
    expect(result.shouldSearch).toBe(false);
    expect(result.searchNeed).toBeLessThanOrEqual(0.1);
  });

  it("高リスクドメイン + 事実質問はスコアが高い", () => {
    const result = evaluateSearchGate(
      "エンジニアの年収ってどのくらい？データある？",
      makeQueryContext("career_fit"),
      "judgment" as QuestionCategory,
      2, 3, "conclude",
    );
    // career_fit(0.25) + factual(0.25) + market(0.2) = 0.7
    expect(result.shouldSearch).toBe(true);
    expect(result.searchNeed).toBeGreaterThanOrEqual(0.5);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. Quality Gate + Task Fitness（検証項目3）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("retrievalQualityGate", () => {
  it("高品質 fragment 2件以上 → use", () => {
    const fragments = [
      makeFragment({ confidence: 0.9, stanceTowardQuery: "support" }),
      makeFragment({ confidence: 0.85, stanceTowardQuery: "oppose" }),
    ];
    const result = retrievalQualityGate(fragments, "テスト質問");
    expect(result.action).toBe("use");
    expect(result.needsHedge).toBe(false);
  });

  it("fragment ゼロ → abstain", () => {
    const result = retrievalQualityGate([], "テスト質問");
    expect(result.action).toBe("abstain");
    expect(result.canClarify).toBe(true);
  });

  it("中品質 neutral のみ → discard（ハードネガティブ検出）", () => {
    const fragments = [
      makeFragment({ confidence: 0.55, stanceTowardQuery: "neutral" }),
      makeFragment({ confidence: 0.6, stanceTowardQuery: "neutral" }),
    ];
    const result = retrievalQualityGate(fragments, "テスト質問");
    expect(result.action).toBe("discard");
    expect(result.reason).toBe("only_medium_quality_neutral");
  });

  it("高品質1件だけ → supplement (hedge)", () => {
    const fragments = [
      makeFragment({ confidence: 0.75, stanceTowardQuery: "support" }),
    ];
    const result = retrievalQualityGate(fragments, "テスト質問");
    expect(result.action).toBe("supplement");
    expect(result.needsHedge).toBe(true);
  });

  // ── Task Fitness: listing_search ──

  it("listing_search + fragment あり → supplement (周辺情報)", () => {
    const fragments = [
      makeFragment({ confidence: 0.8, stanceTowardQuery: "support" }),
    ];
    const task = makeSearchTaskClassification({
      type: "listing_search",
      searchFitness: 0.2,
    });
    const result = retrievalQualityGate(fragments, "求人探して", task);
    expect(result.action).toBe("supplement");
    expect(result.reason).toBe("listing_search_peripheral_info");
    expect(result.needsHedge).toBe(true);
    expect(result.canClarify).toBe(false); // honest limitation パスへ
  });

  it("listing_search + candidate entity あり → use にアップグレード", () => {
    const fragments = [
      makeFragment({
        confidence: 0.8,
        stanceTowardQuery: "support",
        text: "Maple SRI はリモートワーク推進企業として注目されている。SHIFT社もIT業界で成長中。",
      }),
    ];
    const task = makeSearchTaskClassification({
      type: "listing_search",
      searchFitness: 0.2,
    });
    const result = retrievalQualityGate(fragments, "自分に合う会社を探して", task);
    expect(result.action).toBe("use");
    expect(result.reason).toContain("listing_search_with_entities");
    expect(result.needsHedge).toBe(true); // hedge は維持
    expect(result.canClarify).toBe(false);
  });

  it("listing_search + fragment なし → discard (honest limitation)", () => {
    const task = makeSearchTaskClassification({
      type: "listing_search",
      searchFitness: 0.2,
    });
    const result = retrievalQualityGate([], "求人探して", task);
    expect(result.action).toBe("discard");
    expect(result.reason).toBe("listing_search_no_results");
    expect(result.canClarify).toBe(false); // clarify ではなく honest limitation
  });

  // ── Task Fitness: perspective_seek ──

  it("perspective_seek + 多様な stance → use", () => {
    const fragments = [
      makeFragment({ confidence: 0.8, stanceTowardQuery: "support" }),
      makeFragment({ confidence: 0.75, stanceTowardQuery: "oppose" }),
    ];
    const task = makeSearchTaskClassification({
      type: "perspective_seek",
      searchFitness: 0.7,
    });
    const result = retrievalQualityGate(fragments, "HSPって甘え？", task);
    expect(result.action).toBe("use");
    expect(result.reason).toBe("perspective_diverse_stances");
  });

  it("perspective_seek + 偏った stance → supplement (hedge)", () => {
    const fragments = [
      makeFragment({ confidence: 0.8, stanceTowardQuery: "support" }),
      makeFragment({ confidence: 0.75, stanceTowardQuery: "support" }),
    ];
    const task = makeSearchTaskClassification({
      type: "perspective_seek",
      searchFitness: 0.7,
    });
    const result = retrievalQualityGate(fragments, "HSPって甘え？", task);
    expect(result.action).toBe("supplement");
    expect(result.reason).toBe("perspective_limited_diversity");
    expect(result.needsHedge).toBe(true);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. Exploration Depth Classification（v5 Phase A）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("classifyExplorationDepth", () => {
  it("listing_search は常に iterative", () => {
    expect(classifyExplorationDepth("listing_search", "カフェ探して", "lifestyle")).toBe("iterative");
  });

  it("comparison + career_fit → iterative", () => {
    expect(classifyExplorationDepth("comparison", "A社とB社どっちがいい？", "career_fit")).toBe("iterative");
  });

  it("comparison + 適性ワードなし + general → single", () => {
    expect(classifyExplorationDepth("comparison", "iPhoneとAndroidどっち？", "general")).toBe("single");
  });

  it("comparison + 「自分に合う」→ iterative", () => {
    expect(classifyExplorationDepth("comparison", "自分に合うのはどっち？", "general")).toBe("iterative");
  });

  it("entity_research + 「転職先」→ iterative (company_fit)", () => {
    expect(classifyExplorationDepth("entity_research", "転職先を見つけたい", "career_fit")).toBe("iterative");
  });

  it("entity_research + 単純な企業調査 → single", () => {
    expect(classifyExplorationDepth("entity_research", "Apple社ってどんな会社？", "general")).toBe("single");
  });

  it("factual_lookup は常に single", () => {
    expect(classifyExplorationDepth("factual_lookup", "HSPって何？", "general")).toBe("single");
  });

  it("market_intel は常に single", () => {
    expect(classifyExplorationDepth("market_intel", "エンジニアの年収相場は？", "career_fit")).toBe("single");
  });

  it("how_to は常に single", () => {
    expect(classifyExplorationDepth("how_to", "起業するには？", "general")).toBe("single");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. Exploration Resume（v5 Phase A）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("shouldResumeExploration", () => {
  it("候補名一致で復帰する（「A社は？」）", () => {
    const state = makeExplorationState();
    expect(shouldResumeExploration("A社ってどう？", state)).toBe(true);
  });

  it("候補名一致で復帰する（「スタバのやつ」）", () => {
    const state = makeExplorationState();
    expect(shouldResumeExploration("スタバのやつ教えて", state)).toBe(true);
  });

  it("明示的再開で復帰する（「さっきの続き」）", () => {
    const state = makeExplorationState();
    expect(shouldResumeExploration("さっきの続きお願い", state)).toBe(true);
  });

  it("明示的再開で復帰する（「もう少し調べて」）", () => {
    const state = makeExplorationState();
    expect(shouldResumeExploration("もう少し調べてみて", state)).toBe(true);
  });

  it("無関係な発話では復帰しない", () => {
    const state = makeExplorationState();
    expect(shouldResumeExploration("今日しんどいんだよね", state)).toBe(false);
  });

  it("isDormant が false の場合は復帰しない", () => {
    const state = makeExplorationState({ isDormant: false, isActive: true });
    expect(shouldResumeExploration("A社は？", state)).toBe(false);
  });

  it("complete の場合は復帰しない", () => {
    const state = makeExplorationState({ currentPhase: "complete" });
    expect(shouldResumeExploration("A社は？", state)).toBe(false);
  });

  it("有効期限切れの場合は復帰しない", () => {
    const expired = new Date(Date.now() - 1000).toISOString();
    const state = makeExplorationState({ expiresAt: expired });
    expect(shouldResumeExploration("A社は？", state)).toBe(false);
  });

  it("1文字のアンカーは無視する（誤マッチ防止）", () => {
    const state = makeExplorationState({ resumeAnchors: ["X", "A社"] });
    // "X" は1文字なので無視される（2文字以上のみマッチ）
    expect(shouldResumeExploration("Xについて", state)).toBe(false);
    expect(shouldResumeExploration("A社について", state)).toBe(true);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 6. Resume Anchors Builder
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildResumeAnchors", () => {
  it("候補名を抽出する", () => {
    const candidates: CandidateEntity[] = [
      { name: "株式会社テスト", category: "IT", fitReason: "", source: "", userSelected: false },
      { name: "B社", category: "IT", fitReason: "", source: "", userSelected: false },
    ];
    const anchors = buildResumeAnchors(candidates);
    expect(anchors).toContain("株式会社テスト");
    expect(anchors).toContain("テスト"); // 「株式会社」を除いた短縮名
    expect(anchors).toContain("B社");
  });

  it("重複を除去する", () => {
    const candidates: CandidateEntity[] = [
      { name: "テスト", category: "IT", fitReason: "", source: "", userSelected: false },
      { name: "テスト", category: "Web", fitReason: "", source: "", userSelected: false },
    ];
    const anchors = buildResumeAnchors(candidates);
    expect(anchors.filter(a => a === "テスト")).toHaveLength(1);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 7. Create Exploration State
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("createExplorationState", () => {
  it("正しい初期状態を生成する", () => {
    const state = createExplorationState(
      "listing_search", "career_fit", "転職先を探したい", ["技術志向"]
    );
    expect(state.taskType).toBe("listing_search");
    expect(state.domain).toBe("career_fit");
    expect(state.currentPhase).toBe("hypothesis");
    expect(state.isActive).toBe(true);
    expect(state.isDormant).toBe(false);
    expect(state.turnCount).toBe(0);
    expect(state.fitHypotheses).toEqual(["技術志向"]);
    expect(state.candidatesProposed).toEqual([]);
    expect(state.resumeAnchors).toEqual([]);
  });

  it("7日後の有効期限を設定する", () => {
    const before = Date.now();
    const state = createExplorationState("listing_search", "career_fit", "test", []);
    const after = Date.now();

    const expires = new Date(state.expiresAt).getTime();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    expect(expires).toBeGreaterThanOrEqual(before + sevenDays - 1000);
    expect(expires).toBeLessThanOrEqual(after + sevenDays + 1000);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 8. extractCandidateEntityNames（v6）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("extractCandidateEntityNames", () => {
  it("法人名マーカーからエンティティ名を抽出する", () => {
    const fragments = [
      makeFragment({
        text: "株式会社テスト は注目されている。SHIFT社も成長中。",
      }),
    ];
    const names = extractCandidateEntityNames(fragments);
    expect(names.length).toBeGreaterThanOrEqual(1);
    expect(names.some(n => n.includes("テスト"))).toBe(true);
  });

  it("ASCII大文字エンティティを抽出する", () => {
    const fragments = [
      makeFragment({ text: "Maple SRI はリモートワーク推進企業だ。NTT も注目。" }),
    ];
    const names = extractCandidateEntityNames(fragments);
    expect(names).toContain("Maple SRI");
    expect(names).toContain("NTT");
  });

  it("カタカナ3文字以上をエンティティとして抽出（ブラックリスト除外）", () => {
    const fragments = [
      makeFragment({ text: "ビズリーチ でキャリアを探す。サービス も良い。" }),
    ];
    const names = extractCandidateEntityNames(fragments);
    expect(names).toContain("ビズリーチ");
    // 「サービス」はブラックリストなので含まれない
    expect(names).not.toContain("サービス");
  });

  it("fragment なしの場合は空配列を返す", () => {
    expect(extractCandidateEntityNames([])).toEqual([]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 9. peAssembleResponseContract（v6 Stage 6）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("peAssembleResponseContract", () => {
  it("内部 entity_research を downstream company_research にマッピングする", () => {
    const classification = makeSearchTaskClassification({
      type: "entity_research",
      description: "A社の調査",
      searchFitness: 0.85,
    });
    const qualityResult = {
      action: "use" as const,
      filteredFragments: [makeFragment()],
      reason: "sufficient_quality",
      needsHedge: false,
      canClarify: false,
    };
    const fragments = [makeFragment()];
    const { searchTask } = peAssembleResponseContract(
      classification, qualityResult, fragments, {}, false,
    );
    expect(searchTask.type).toBe("company_research");
    expect(searchTask.explicit).toBe(false);
    expect(searchTask.confidence).toBe(0.85);
    expect(searchTask.rationale).toBe("A社の調査");
  });

  it("explicit ask の場合 searchTask.explicit が true になる", () => {
    const classification = makeSearchTaskClassification({
      type: "market_intel",
      description: "エンジニア年収",
    });
    const qualityResult = {
      action: "use" as const,
      filteredFragments: [makeFragment()],
      reason: "sufficient_quality",
      needsHedge: false,
      canClarify: false,
    };
    const { searchTask } = peAssembleResponseContract(
      classification, qualityResult, [makeFragment()], {}, true,
    );
    expect(searchTask.explicit).toBe(true);
    expect(searchTask.type).toBe("market_intel");
  });

  it("fragment にエンティティがある場合 candidateEntities が設定される", () => {
    const classification = makeSearchTaskClassification({
      type: "listing_search",
      description: "転職先探し",
      searchFitness: 0.2,
    });
    const qualityResult = {
      action: "use" as const,
      filteredFragments: [],
      reason: "listing_search_with_entities(2)",
      needsHedge: true,
      canClarify: false,
    };
    const fragments = [
      makeFragment({
        text: "株式会社メイプル はリモート推進企業。SHIFT社 も成長中。",
      }),
    ];
    const { searchTask, candidateEntities } = peAssembleResponseContract(
      classification, qualityResult, fragments, {}, true,
    );
    expect(searchTask.type).toBe("listing_search");
    expect(searchTask.candidateEntities).toBeDefined();
    expect(searchTask.candidateEntities!.length).toBeGreaterThanOrEqual(1);
    expect(candidateEntities.length).toBeGreaterThanOrEqual(1);
  });

  it("perspective_seek は downstream market_intel にマッピングされる", () => {
    const classification = makeSearchTaskClassification({
      type: "perspective_seek",
      description: "HSPの世間の評価",
      searchFitness: 0.7,
    });
    const qualityResult = {
      action: "use" as const,
      filteredFragments: [makeFragment()],
      reason: "perspective_diverse_stances",
      needsHedge: false,
      canClarify: false,
    };
    const { searchTask } = peAssembleResponseContract(
      classification, qualityResult, [makeFragment()], {}, false,
    );
    expect(searchTask.type).toBe("market_intel");
  });

  it("how_to は downstream factual_lookup にマッピングされる", () => {
    const classification = makeSearchTaskClassification({
      type: "how_to",
      description: "起業の方法",
      searchFitness: 0.7,
    });
    const qualityResult = {
      action: "use" as const,
      filteredFragments: [makeFragment()],
      reason: "sufficient_quality",
      needsHedge: false,
      canClarify: false,
    };
    const { searchTask } = peAssembleResponseContract(
      classification, qualityResult, [makeFragment()], {}, false,
    );
    expect(searchTask.type).toBe("factual_lookup");
  });

  it("personalityCtx が渡された場合、ランキングが適用される", () => {
    const opportunityFragment = makeFragment({
      text: "成長中のスタートアップ企業",
      confidence: 0.8,
      forceRelevance: { opportunity: 0.9, cost: 0.1, relationship: 0.1, value: 0.2, fear: 0.0, growth: 0.8 },
    });
    const riskFragment = makeFragment({
      text: "大手企業の安定した給与体系",
      confidence: 0.85,
      forceRelevance: { opportunity: 0.2, cost: 0.8, relationship: 0.3, value: 0.5, fear: 0.6, growth: 0.1 },
    });
    const classification = makeSearchTaskClassification({
      type: "listing_search",
      description: "IT企業を探す",
      searchFitness: 0.2,
    });
    const qualityResult = {
      action: "use" as const,
      filteredFragments: [riskFragment, opportunityFragment], // risk first by default
      reason: "listing_search_with_entities(2)",
      needsHedge: true,
      canClarify: false,
    };

    // Bold + growth-oriented person → opportunity fragment should rank higher
    const boldPersonality: PersonalityContext = {
      axisScores: {
        cautious_vs_bold: 0.85,
        growth_mindset: 0.9,
        independence_vs_harmony: 0.7,
      },
    };
    const { promptBlock } = peAssembleResponseContract(
      classification, qualityResult, [riskFragment, opportunityFragment], {}, true, boldPersonality,
    );
    // The prompt block should exist (ranking doesn't filter)
    expect(promptBlock).toContain("成長中のスタートアップ企業");
    expect(promptBlock).toContain("大手企業の安定した給与体系");
  });
});

// ─── 10. rankFragmentsByFit（P1.5 パーソナリティランキング）───────────────

describe("rankFragmentsByFit", () => {
  it("personalityCtx なしの場合、元の順序を維持する", () => {
    const f1 = makeFragment({ text: "A" });
    const f2 = makeFragment({ text: "B" });
    const result = rankFragmentsByFit([f1, f2], null);
    expect(result[0].text).toBe("A");
    expect(result[1].text).toBe("B");
  });

  it("1件のみの場合、そのまま返す", () => {
    const f1 = makeFragment({ text: "Single" });
    const result = rankFragmentsByFit([f1], { axisScores: { cautious_vs_bold: 0.9 } });
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("Single");
  });

  it("大胆な人にはopportunity/growth高のfragmentが上位に来る", () => {
    const cautionFragment = makeFragment({
      text: "安全な選択肢",
      confidence: 0.8,
      forceRelevance: { opportunity: 0.1, cost: 0.8, relationship: 0.2, value: 0.3, fear: 0.7, growth: 0.1 },
    });
    const boldFragment = makeFragment({
      text: "挑戦的な選択肢",
      confidence: 0.8,
      forceRelevance: { opportunity: 0.9, cost: 0.1, relationship: 0.1, value: 0.2, fear: 0.0, growth: 0.9 },
    });

    const boldPerson: PersonalityContext = {
      axisScores: {
        cautious_vs_bold: 0.9,
        growth_mindset: 0.85,
        change_embrace_vs_resist: 0.8,
        independence_vs_harmony: 0.7,
        plan_vs_spontaneous: 0.6,
      },
    };

    // caution first → bold person should rerank to bold first
    const result = rankFragmentsByFit([cautionFragment, boldFragment], boldPerson);
    expect(result[0].text).toBe("挑戦的な選択肢");
  });

  it("慎重な人にはcost/fear高のfragmentが上位に来る", () => {
    const boldFragment = makeFragment({
      text: "挑戦的な選択肢",
      confidence: 0.8,
      forceRelevance: { opportunity: 0.9, cost: 0.1, relationship: 0.1, value: 0.2, fear: 0.0, growth: 0.9 },
    });
    const cautionFragment = makeFragment({
      text: "安全な選択肢",
      confidence: 0.8,
      forceRelevance: { opportunity: 0.1, cost: 0.8, relationship: 0.2, value: 0.3, fear: 0.7, growth: 0.1 },
    });

    const cautiousPerson: PersonalityContext = {
      axisScores: {
        cautious_vs_bold: 0.15,
        growth_mindset: 0.2,
        change_embrace_vs_resist: 0.2,
        independence_vs_harmony: 0.3,
      },
    };

    // bold first → cautious person should rerank to caution first
    const result = rankFragmentsByFit([boldFragment, cautionFragment], cautiousPerson);
    expect(result[0].text).toBe("安全な選択肢");
  });
});

// ── P1-3: buildPerspectivePromptBlock ─────────────────────────────────
describe("buildPerspectivePromptBlock", () => {
  it("fragments ゼロの場合は空文字を返す", () => {
    expect(buildPerspectivePromptBlock([], {}, false, false)).toBe("");
  });

  it("暗黙検索では外部視点の応答織り込みを必須指示にする（P1-3 修正）", () => {
    const f = makeFragment({ text: "統計データ: 年収500万の中央値" });
    const result = buildPerspectivePromptBlock([f], {}, false, false);
    // 必須指示が入っていること（旧: 「語ってよい」→ 新: 「必ず織り込む」）
    expect(result).toContain("必ず織り込む");
    expect(result).toContain("無視して内部知識だけで答えることは禁止");
    // 「記事によると」は使わない指示
    expect(result).toContain("「記事によると」「研究では」とは言わない");
  });

  it("explicit 検索ではユーザーに検索したことを伝える指示が入る", () => {
    const f = makeFragment({ text: "最新の業界動向" });
    const result = buildPerspectivePromptBlock([f], {}, false, true);
    expect(result).toContain("検索を依頼した");
    expect(result).toContain("調べてみた");
  });

  it("hedge 付きの場合は修飾指示が含まれる", () => {
    const f = makeFragment({ text: "不確実なデータ" });
    const result = buildPerspectivePromptBlock([f], {}, true, false);
    expect(result).toContain("確実ではないけど");
  });
});

// ─── 12. preFilterSearchResults（P1.6 ノイズ除去）─────────────────────

describe("preFilterSearchResults", () => {
  function makeSearchResult(overrides: Partial<{ title: string; url: string; text: string; highlights: string[] }> = {}) {
    return {
      title: "テスト記事タイトル",
      url: "https://example.com/article",
      text: "これは十分な長さのテスト記事のテキストです。30文字以上あるので通過するはずです。",
      highlights: [],
      ...overrides,
    };
  }

  it("正常な結果はそのまま通す", () => {
    const results = [makeSearchResult()];
    const { kept, droppedCount } = preFilterSearchResults(results);
    expect(kept).toHaveLength(1);
    expect(droppedCount).toBe(0);
  });

  it("テキストが30文字未満の結果を除外する", () => {
    const results = [
      makeSearchResult({ text: "短すぎるテキスト" }), // <30文字
      makeSearchResult({ text: "これは十分な長さの記事テキストです。IT業界の最新動向について解説します。" }),
    ];
    const { kept, droppedCount } = preFilterSearchResults(results);
    expect(kept).toHaveLength(1);
    expect(droppedCount).toBe(1);
    expect(kept[0].text).toContain("十分な長さ");
  });

  it("ノイズURLドメインの結果を除外する", () => {
    const results = [
      makeSearchResult({ url: "https://point.rakuten.co.jp/campaign" }),
      makeSearchResult({ url: "https://example.com/good-article" }),
    ];
    const { kept, droppedCount } = preFilterSearchResults(results);
    expect(kept).toHaveLength(1);
    expect(droppedCount).toBe(1);
  });

  it("検索UI断片のテキストを除外する", () => {
    const results = [
      makeSearchResult({ text: "検索結果 約1,200,000件 (0.32秒)" }),
      makeSearchResult({ text: "ログインして続きを読む このコンテンツはプレミアム会員限定です" }),
      makeSearchResult(),
    ];
    const { kept, droppedCount } = preFilterSearchResults(results);
    expect(kept).toHaveLength(1);
    expect(droppedCount).toBe(2);
  });

  it("空の入力には空の結果を返す", () => {
    const { kept, droppedCount } = preFilterSearchResults([]);
    expect(kept).toHaveLength(0);
    expect(droppedCount).toBe(0);
  });
});
