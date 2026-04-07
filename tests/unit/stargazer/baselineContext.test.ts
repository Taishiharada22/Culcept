import { describe, it, expect } from "vitest";
import {
  deriveBaselineContext,
  deriveLifeStageDetailed,
  deriveSocialPhase,
  deriveLegalStage,
  deriveGenderMode,
  deriveAreaType,
  deriveMobilityContext,
  deriveEnvironmentTags,
  scoreBaselineRelevance,
  buildBaselinePromptSection,
  buildTeenSafeguardLines,
  shouldInjectBaseline,
  computeAge,
  type BaselineContext,
  type BaselineInput,
  type LifeStage,
  type QueryDomainForBaseline,
} from "@/lib/stargazer/baselineContext";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. 年齢→ライフステージ変換
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("deriveLifeStageDetailed", () => {
  const cases: Array<[number, LifeStage]> = [
    [13, "junior_high"],
    [14, "junior_high"],
    [15, "junior_high"],
    [16, "high_school"],
    [17, "high_school"],
    [18, "high_school"],
    [19, "university"],
    [20, "university"],
    [22, "university"],
    [23, "new_grad"],
    [25, "new_grad"],
    [26, "working_adult"],
    [30, "working_adult"],
    [34, "working_adult"],
    [35, "established"],
    [44, "established"],
    [45, "mature"],
    [54, "mature"],
    [55, "senior"],
    [70, "senior"],
  ];

  it.each(cases)("age %i → %s", (age, expected) => {
    expect(deriveLifeStageDetailed(age)).toBe(expected);
  });

  it("null age → null", () => {
    expect(deriveLifeStageDetailed(null)).toBeNull();
  });

  it("明示的自己申告は年齢推定より優先", () => {
    // 19歳でも working と申告すれば working_adult
    expect(deriveLifeStageDetailed(19, "working")).toBe("working_adult");
    // 25歳でも university と申告すれば university
    expect(deriveLifeStageDetailed(25, "university")).toBe("university");
    // 30歳でも high_school と申告すれば high_school
    expect(deriveLifeStageDetailed(30, "high_school")).toBe("high_school");
  });

  it("vocational → university にマップ", () => {
    expect(deriveLifeStageDetailed(20, "vocational")).toBe("university");
  });
});

describe("deriveSocialPhase", () => {
  it("junior_high / high_school → school_centered", () => {
    expect(deriveSocialPhase("junior_high")).toBe("school_centered");
    expect(deriveSocialPhase("high_school")).toBe("school_centered");
  });

  it("university / new_grad → transition_phase", () => {
    expect(deriveSocialPhase("university")).toBe("transition_phase");
    expect(deriveSocialPhase("new_grad")).toBe("transition_phase");
  });

  it("working_adult / established / mature / senior → work_centered", () => {
    expect(deriveSocialPhase("working_adult")).toBe("work_centered");
    expect(deriveSocialPhase("established")).toBe("work_centered");
    expect(deriveSocialPhase("mature")).toBe("work_centered");
    expect(deriveSocialPhase("senior")).toBe("work_centered");
  });
});

describe("deriveLegalStage", () => {
  it("17歳以下 → minor", () => {
    expect(deriveLegalStage(13)).toBe("minor");
    expect(deriveLegalStage(17)).toBe("minor");
  });
  it("18歳以上 → adult", () => {
    expect(deriveLegalStage(18)).toBe("adult");
    expect(deriveLegalStage(30)).toBe("adult");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. teenセーフガード
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("teen safeguard", () => {
  function makeMinorCtx(): BaselineContext {
    return deriveBaselineContext({
      gender: "female",
      dateOfBirth: new Date(new Date().getFullYear() - 15, 6, 1).toISOString(),
      prefecture: "東京都",
    });
  }

  function makeAdultCtx(): BaselineContext {
    return deriveBaselineContext({
      gender: "male",
      dateOfBirth: new Date(new Date().getFullYear() - 28, 3, 15).toISOString(),
      prefecture: "大阪府",
    });
  }

  it("15歳は isMinor = true", () => {
    const ctx = makeMinorCtx();
    expect(ctx.isMinor).toBe(true);
    expect(ctx.legalStage).toBe("minor");
    expect(ctx.socialPhase).toBe("school_centered");
  });

  it("28歳は isMinor = false", () => {
    const ctx = makeAdultCtx();
    expect(ctx.isMinor).toBe(false);
    expect(ctx.legalStage).toBe("adult");
  });

  it("未成年の場合、buildTeenSafeguardLines がガードレール行を返す", () => {
    const ctx = makeMinorCtx();
    const lines = buildTeenSafeguardLines(ctx, "relationship");
    expect(lines.length).toBeGreaterThan(0);
    const joined = lines.join("\n");
    expect(joined).toContain("未成年保護ガードレール");
    expect(joined).toContain("性的な文脈");
    expect(joined).toContain("境界線の引き方");
  });

  it("未成年 + career ドメインで進路ガードが入る", () => {
    const ctx = makeMinorCtx();
    const lines = buildTeenSafeguardLines(ctx, "career");
    const joined = lines.join("\n");
    expect(joined).toContain("試行の幅");
  });

  it("成人の場合、buildTeenSafeguardLines は空を返す", () => {
    const ctx = makeAdultCtx();
    const lines = buildTeenSafeguardLines(ctx, "relationship");
    expect(lines).toHaveLength(0);
  });

  it("shouldInjectBaseline は成人には常にtrue", () => {
    const ctx = makeAdultCtx();
    expect(shouldInjectBaseline(ctx, "relationship")).toBe(true);
    expect(shouldInjectBaseline(ctx, "career")).toBe(true);
    expect(shouldInjectBaseline(ctx, "general")).toBe(true);
  });

  it("shouldInjectBaseline は未成年にもtrue（ガードレールで制御）", () => {
    const ctx = makeMinorCtx();
    expect(shouldInjectBaseline(ctx, "relationship")).toBe(true);
    expect(shouldInjectBaseline(ctx, "general")).toBe(true);
  });

  it("buildBaselinePromptSection に teen ガードレールが含まれる（未成年 + relationship）", () => {
    const ctx = makeMinorCtx();
    const relevance = scoreBaselineRelevance(ctx, "relationship");
    const lines = buildBaselinePromptSection(ctx, relevance, "relationship");
    const joined = lines.join("\n");
    expect(joined).toContain("未成年保護ガードレール");
  });

  it("buildBaselinePromptSection に teen ガードレールが含まれない（成人）", () => {
    const ctx = makeAdultCtx();
    const relevance = scoreBaselineRelevance(ctx, "relationship");
    const lines = buildBaselinePromptSection(ctx, relevance, "relationship");
    const joined = lines.join("\n");
    expect(joined).not.toContain("未成年保護ガードレール");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. 性別ガードレール
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("gender guardrails", () => {
  it("prefer_not_to_say → undisclosed（注入されない）", () => {
    const ctx = deriveBaselineContext({ gender: "prefer_not_to_say" });
    expect(ctx.genderMode).toBe("undisclosed");
  });

  it("null gender → undisclosed", () => {
    const ctx = deriveBaselineContext({});
    expect(ctx.genderMode).toBe("undisclosed");
  });

  it("undisclosed の場合、gender relevance は常に none", () => {
    const ctx = deriveBaselineContext({});
    const domains: QueryDomainForBaseline[] = ["career", "relationship", "lifestyle", "health", "self_understanding", "general"];
    for (const domain of domains) {
      const rel = scoreBaselineRelevance(ctx, domain);
      expect(rel.gender).toBe("none");
    }
  });

  it("gender が設定されていてもプロンプトにステレオタイプ禁止が入る", () => {
    const ctx = deriveBaselineContext({
      gender: "female",
      dateOfBirth: new Date(new Date().getFullYear() - 30, 0, 1).toISOString(),
      prefecture: "東京都",
    });
    const relevance = scoreBaselineRelevance(ctx, "relationship");
    const lines = buildBaselinePromptSection(ctx, relevance);
    const joined = lines.join("\n");
    expect(joined).toContain("ステレオタイプ的な提案は禁止");
    expect(joined).toContain("「男だから〜」「女性なら〜」は絶対不可");
  });

  it("正しい gender mode 変換", () => {
    expect(deriveGenderMode("male")).toBe("masculine_typical");
    expect(deriveGenderMode("female")).toBe("feminine_typical");
    expect(deriveGenderMode("non_binary")).toBe("non_binary_fluid");
    expect(deriveGenderMode("prefer_not_to_say")).toBe("undisclosed");
    expect(deriveGenderMode(null)).toBe("undisclosed");
    expect(deriveGenderMode(undefined)).toBe("undisclosed");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. 地域ガードレール
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("area & mobility guardrails", () => {
  it("東京都 → metro / walk_train", () => {
    expect(deriveAreaType("東京都")).toBe("metro");
    expect(deriveMobilityContext("metro")).toBe("walk_train");
  });

  it("大阪府 → urban / walk_train", () => {
    expect(deriveAreaType("大阪府")).toBe("urban");
    expect(deriveMobilityContext("urban")).toBe("walk_train");
  });

  it("埼玉県 → suburban / mixed", () => {
    expect(deriveAreaType("埼玉県")).toBe("suburban");
    expect(deriveMobilityContext("suburban")).toBe("mixed");
  });

  it("鳥取県 → regional / car_dependent", () => {
    expect(deriveAreaType("鳥取県")).toBe("regional");
    expect(deriveMobilityContext("regional")).toBe("car_dependent");
  });

  it("null → unknown / unknown", () => {
    expect(deriveAreaType(null)).toBe("unknown");
    expect(deriveMobilityContext("unknown")).toBe("unknown");
  });

  it("environment tags: metro は choice_abundance + commute_heavy", () => {
    const tags = deriveEnvironmentTags("metro", "東京都");
    expect(tags).toContain("choice_abundance");
    expect(tags).toContain("commute_heavy");
  });

  it("environment tags: regional は local_visibility_high + late_night_constraint", () => {
    const tags = deriveEnvironmentTags("regional", "鳥取県");
    expect(tags).toContain("local_visibility_high");
    expect(tags).toContain("late_night_constraint");
    expect(tags).toContain("community_density_high");
  });

  it("environment tags: 降雪県に weather_constraint が付く", () => {
    const tags = deriveEnvironmentTags("regional", "新潟県");
    expect(tags).toContain("weather_constraint");
  });

  it("environment tags: 非降雪県に weather_constraint が付かない", () => {
    const tags = deriveEnvironmentTags("regional", "鳥取県");
    expect(tags).not.toContain("weather_constraint");
  });

  it("プロンプトに地域バイアス禁止ガードレールが入る", () => {
    const ctx = deriveBaselineContext({
      gender: "male",
      dateOfBirth: new Date(new Date().getFullYear() - 25, 0, 1).toISOString(),
      prefecture: "鳥取県",
    });
    const relevance = scoreBaselineRelevance(ctx, "lifestyle");
    const lines = buildBaselinePromptSection(ctx, relevance);
    const joined = lines.join("\n");
    expect(joined).toContain("地域に基づく価値判断は禁止");
    expect(joined).toContain("思想・政治性・保守/進歩を推定しない");
  });

  it("プロンプトに mobility / environment 情報が含まれる（high relevance）", () => {
    const ctx = deriveBaselineContext({
      dateOfBirth: new Date(new Date().getFullYear() - 25, 0, 1).toISOString(),
      prefecture: "鳥取県",
    });
    const relevance = scoreBaselineRelevance(ctx, "lifestyle");
    const lines = buildBaselinePromptSection(ctx, relevance, "lifestyle");
    const joined = lines.join("\n");
    expect(joined).toContain("移動手段");
    expect(joined).toContain("環境特性");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. relevance 判定
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("scoreBaselineRelevance", () => {
  function makeFullCtx(): BaselineContext {
    return deriveBaselineContext({
      gender: "female",
      dateOfBirth: new Date(new Date().getFullYear() - 28, 0, 1).toISOString(),
      prefecture: "東京都",
    });
  }

  it("career: lifeStage=high, gender=low, area=medium", () => {
    const rel = scoreBaselineRelevance(makeFullCtx(), "career");
    expect(rel.lifeStage).toBe("high");
    expect(rel.gender).toBe("low");
    expect(rel.area).toBe("medium");
  });

  it("relationship: lifeStage=high, gender=high, area=low", () => {
    const rel = scoreBaselineRelevance(makeFullCtx(), "relationship");
    expect(rel.lifeStage).toBe("high");
    expect(rel.gender).toBe("high");
    expect(rel.area).toBe("low"); // relationship では地域タグ過剰のため low に抑制（実装コメント参照）
  });

  it("lifestyle: lifeStage=medium, gender=low, area=high", () => {
    const rel = scoreBaselineRelevance(makeFullCtx(), "lifestyle");
    expect(rel.lifeStage).toBe("medium");
    expect(rel.gender).toBe("low");
    expect(rel.area).toBe("high");
  });

  it("self_understanding: 全部 low", () => {
    const rel = scoreBaselineRelevance(makeFullCtx(), "self_understanding");
    expect(rel.lifeStage).toBe("low");
    expect(rel.gender).toBe("low");
    expect(rel.area).toBe("low");
  });

  it("general: 全部 low", () => {
    const rel = scoreBaselineRelevance(makeFullCtx(), "general");
    expect(rel.lifeStage).toBe("low");
    expect(rel.gender).toBe("low");
    expect(rel.area).toBe("low");
  });

  it("データなしの場合は none を返す", () => {
    const ctx = deriveBaselineContext({});
    const rel = scoreBaselineRelevance(ctx, "career");
    expect(rel.lifeStage).toBe("none");
    expect(rel.gender).toBe("none");
    expect(rel.area).toBe("none");
  });

  it("self_understanding で全部 low の場合、buildBaselinePromptSection は空を返す", () => {
    const ctx = makeFullCtx();
    const rel = scoreBaselineRelevance(ctx, "self_understanding");
    const lines = buildBaselinePromptSection(ctx, rel);
    expect(lines).toHaveLength(0);
  });

  it("career で lifeStage=high → プロンプトにライフステージが含まれる", () => {
    const ctx = makeFullCtx();
    const rel = scoreBaselineRelevance(ctx, "career");
    const lines = buildBaselinePromptSection(ctx, rel);
    const joined = lines.join("\n");
    expect(joined).toContain("ライフステージ");
    expect(joined).toContain("キャリア形成期");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 6. 統合テスト: deriveBaselineContext
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("deriveBaselineContext integration", () => {
  it("全フィールド指定で完全なコンテキストを返す", () => {
    const ctx = deriveBaselineContext({
      gender: "female",
      dateOfBirth: new Date(new Date().getFullYear() - 20, 0, 15).toISOString(),
      prefecture: "新潟県",
    });
    expect(ctx.lifeStage).toBe("university");
    expect(ctx.socialPhase).toBe("transition_phase");
    expect(ctx.legalStage).toBe("adult");
    expect(ctx.age).toBe(20);
    expect(ctx.genderMode).toBe("feminine_typical");
    expect(ctx.areaType).toBe("regional");
    expect(ctx.mobilityContext).toBe("car_dependent");
    expect(ctx.environmentTags).toContain("weather_constraint");
    expect(ctx.isMinor).toBe(false);
  });

  it("空入力でも安全にフォールバック", () => {
    const ctx = deriveBaselineContext({});
    expect(ctx.lifeStage).toBeNull();
    expect(ctx.socialPhase).toBeNull();
    expect(ctx.legalStage).toBeNull();
    expect(ctx.age).toBeNull();
    expect(ctx.genderMode).toBe("undisclosed");
    expect(ctx.areaType).toBe("unknown");
    expect(ctx.mobilityContext).toBe("unknown");
    expect(ctx.environmentTags).toHaveLength(0);
    expect(ctx.isMinor).toBe(false);
  });

  it("16歳 + school_centered → isMinor = true", () => {
    const ctx = deriveBaselineContext({
      dateOfBirth: new Date(new Date().getFullYear() - 16, 0, 1).toISOString(),
    });
    expect(ctx.lifeStage).toBe("high_school");
    expect(ctx.isMinor).toBe(true);
  });

  it("18歳 university → legalStage=adult, socialPhase=transition_phase, isMinor=false", () => {
    const ctx = deriveBaselineContext({
      dateOfBirth: new Date(new Date().getFullYear() - 19, 0, 1).toISOString(),
      schoolOrWorkStatus: "university",
    });
    expect(ctx.lifeStage).toBe("university");
    expect(ctx.legalStage).toBe("adult");
    expect(ctx.socialPhase).toBe("transition_phase");
    expect(ctx.isMinor).toBe(false);
  });
});
