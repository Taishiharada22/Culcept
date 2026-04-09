/**
 * v4.2 FULL Pipeline: ユニットテスト
 *
 * Phase 0: Role Contract + Semantic Bans
 * Phase A: Signal Reader
 * Phase B: Interpretation Arena
 * Phase C: Living Self Model
 * Phase E: Strategy Compliance + Rally Critic
 */
import { describe, it, expect } from "vitest";

import {
  selectAlterRole,
  checkSemanticBans,
  buildRoleContractBlock,
  buildBurdenTransferBlock,
  buildSemanticBansBlock,
} from "@/lib/stargazer/alterContracts";

import {
  readTurnSignal,
  type TurnSignal,
} from "@/lib/stargazer/alterSignalReader";

import {
  projectSelfModel,
  buildSelfModelPromptBlock,
  type LivingSelfModel,
} from "@/lib/stargazer/alterSelfModel";

import {
  runInterpretationArena,
  buildArenaPromptBlock,
  type WinningInterpretation,
} from "@/lib/stargazer/alterInterpretationArena";

import {
  checkStrategyCompliance,
  assessRally,
  buildRallyCriticBlock,
} from "@/lib/stargazer/alterStrategyCompliance";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase 0: Role Contract + Semantic Bans
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Phase 0: selectAlterRole", () => {
  it("repair mode → repair role", () => {
    const role = selectAlterRole("repair", "judgment", null, 1);
    expect(role.role).toBe("repair");
  });

  it("strong disagree → repair role", () => {
    const role = selectAlterRole("conclude", "judgment", {
      type: "disagree", disagree_strength: "strong", confidence: 0.9,
    }, 1);
    expect(role.role).toBe("repair");
  });

  it("emotional → mirror", () => {
    const role = selectAlterRole("conclude", "emotional", null, 1);
    expect(role.role).toBe("mirror");
  });

  it("knowledge → operator", () => {
    const role = selectAlterRole("conclude", "knowledge", null, 1);
    expect(role.role).toBe("operator");
  });

  it("strategy → operator", () => {
    const role = selectAlterRole("conclude", "strategy", null, 1);
    expect(role.role).toBe("operator");
  });

  it("self_understanding → co_thinker", () => {
    const role = selectAlterRole("conclude", "self_understanding", null, 1);
    expect(role.role).toBe("co_thinker");
  });

  it("deep judgment (3+ turns) → co_thinker", () => {
    const role = selectAlterRole("conclude", "judgment", null, 3);
    expect(role.role).toBe("co_thinker");
  });

  it("shallow judgment → operator", () => {
    const role = selectAlterRole("conclude", "judgment", null, 1);
    expect(role.role).toBe("operator");
  });

  it("role has allowed and forbidden actions", () => {
    const role = selectAlterRole("conclude", "emotional", null, 1);
    expect(role.allowed.length).toBeGreaterThan(0);
    expect(role.forbidden.length).toBeGreaterThan(0);
  });
});

describe("Phase 0: checkSemanticBans", () => {
  it("clean response passes", () => {
    const result = checkSemanticBans("転職って、結局自分が何を大事にしてるかで決まる話だよね。");
    expect(result.passed).toBe(true);
  });

  it("delegation: 考えてみて → fail", () => {
    const result = checkSemanticBans("まずは自分で考えてみて。");
    expect(result.passed).toBe(false);
    expect(result.violations[0]?.category).toBe("delegation");
  });

  it("delegation: 書き出してみて → fail", () => {
    const result = checkSemanticBans("優先順位を書き出してみて");
    expect(result.passed).toBe(false);
  });

  it("evasion: 状況によるから → fail", () => {
    const result = checkSemanticBans("うーん、これは状況によるからね");
    expect(result.passed).toBe(false);
    expect(result.violations[0]?.category).toBe("evasion");
  });

  it("evasion: 一概には言えない → fail", () => {
    const result = checkSemanticBans("一概には言えないけど");
    expect(result.passed).toBe(false);
  });

  it("通常の文に誤爆しない: 考え中", () => {
    const result = checkSemanticBans("ちょっと考えてるんだけど、転職するなら今かもしれない。");
    expect(result.passed).toBe(true);
  });
});

describe("Phase 0: Prompt Builders", () => {
  it("buildRoleContractBlock generates valid prompt", () => {
    const role = selectAlterRole("conclude", "emotional", null, 1);
    const block = buildRoleContractBlock(role);
    expect(block).toContain("Mirror");
    expect(block).toContain("許可される行動");
    expect(block).toContain("禁止される行動");
  });

  it("buildBurdenTransferBlock generates valid prompt", () => {
    const block = buildBurdenTransferBlock("co_thinker");
    expect(block).toContain("責任分担");
    expect(block).toContain("Alter");
    expect(block).toContain("User");
  });

  it("buildSemanticBansBlock generates valid prompt", () => {
    const block = buildSemanticBansBlock();
    expect(block).toContain("禁止表現");
    expect(block).toContain("考えてみて");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase A: Signal Reader
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Phase A: readTurnSignal", () => {
  function signal(msg: string, overrides: Partial<Parameters<typeof readTurnSignal>> = [] as any): TurnSignal {
    return readTurnSignal(
      msg,
      (overrides as any)[1] ?? "judgment",
      (overrides as any)[2] ?? "conclude",
      (overrides as any)[3] ?? null,
      (overrides as any)[4] ?? null,
      (overrides as any)[5] ?? 1,
    );
  }

  it("vent message → vent intent", () => {
    const s = readTurnSignal("もう疲れた、限界かも", "emotional", "conclude", null, null, 1);
    expect(s.intent).toBe("vent");
    expect(s.emotional_temperature).toBeGreaterThan(0.3);
  });

  it("co-think request → co_think_request intent", () => {
    const s = readTurnSignal("一緒に考えてほしい", "judgment", "conclude", null, null, 1);
    expect(s.intent).toBe("co_think_request");
  });

  it("challenge message → challenge_alter intent", () => {
    const s = readTurnSignal("それは違うよ、ずれてる", "judgment", "conclude", null, null, 1);
    expect(s.intent).toBe("challenge_alter");
  });

  it("confirm message → confirm intent", () => {
    const s = readTurnSignal("そうそう、まさにそれ", "judgment", "conclude", null, null, 1);
    expect(s.intent).toBe("confirm");
  });

  it("action demand → demand_action intent", () => {
    const s = readTurnSignal("具体的にどうすればいい？", "strategy", "conclude", null, null, 1);
    expect(s.intent).toBe("demand_action");
  });

  it("existential → existential intent", () => {
    const s = readTurnSignal("人生で本当に大事なものって何だろう", "judgment", "conclude", null, null, 1);
    expect(s.intent).toBe("existential");
  });

  it("emotional_temperature: high for vent with exclamations", () => {
    const s = readTurnSignal("もう嫌だ！！限界！！", "emotional", "conclude", null, null, 1);
    expect(s.emotional_temperature).toBeGreaterThan(0.5);
  });

  it("urgency: high for urgent action request", () => {
    const s = readTurnSignal("今すぐどうすればいいか教えて", "strategy", "conclude", null, null, 1);
    expect(s.urgency).toBeGreaterThan(0.5);
  });

  it("feedback: building_on from agree reaction", () => {
    const s = readTurnSignal("確かにそうだね、で、もう一つ", "judgment", "conclude",
      { type: "agree", confidence: 0.8 }, null, 2);
    expect(s.feedback_on_last_turn).toBe("building_on");
  });

  it("feedback: correction from disagree reaction", () => {
    const s = readTurnSignal("うーん", "judgment", "conclude",
      { type: "disagree", disagree_strength: "weak", confidence: 0.6 }, null, 2);
    expect(s.feedback_on_last_turn).toBe("correction");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase C: Living Self Model
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Phase C: projectSelfModel", () => {
  it("empty data → low completeness", () => {
    const model = projectSelfModel(undefined, undefined, null, undefined, 0);
    expect(model.model_completeness).toBeLessThan(0.2);
    expect(model.core_drives).toHaveLength(0);
  });

  it("rich growth state → populated core_drives + aversions", () => {
    const model = projectSelfModel(
      {
        userId: "test", sessionsCompleted: 5, trustLevel: 0.7,
        knownFears: ["裏切り", "無力感"], knownValues: ["自由", "誠実さ"],
        avoidedTopics: ["家族"], successfulProbes: [], failedProbes: ["過去の恋愛"],
        coreWoundConfidence: 0.6, coreWoundEvidence: [],
        lastBreakthrough: "",
        emotionalPatterns: { openingMood: [], triggerTopics: [], safeTopics: [] },
        responseStyle: { avgResponseLength: 50, emotionalVocabularyRichness: 0.5, disagreementTendency: 0.3, selfReferencingDepth: 0.5 },
        unfinishedThreads: [],
        updatedAt: "",
      },
      {
        keyRevelations: [],
        recurringThemes: [{ theme: "転職", frequency: 3, firstSeen: "", lastSeen: "", userAwareness: "aware" }],
        crossSessionContradictions: [],
        emotionalArc: [],
        avoidedTopics: [],
        deepestInsight: null,
        sessionCount: 5,
        trustLevel: 0.7,
      },
      null, undefined, 2,
    );
    expect(model.core_drives.length).toBeGreaterThan(0);
    expect(model.aversion_map.length).toBeGreaterThan(0);
    expect(model.repeated_returns.length).toBeGreaterThan(0);
    expect(model.model_completeness).toBeGreaterThan(0.3);
  });

  it("prompt block is non-empty for rich model", () => {
    const model = projectSelfModel(
      {
        userId: "test", sessionsCompleted: 5, trustLevel: 0.7,
        knownFears: ["裏切り"], knownValues: ["自由"],
        avoidedTopics: [], successfulProbes: [], failedProbes: [],
        coreWoundConfidence: 0, coreWoundEvidence: [],
        lastBreakthrough: "",
        emotionalPatterns: { openingMood: [], triggerTopics: [], safeTopics: [] },
        responseStyle: { avgResponseLength: 0, emotionalVocabularyRichness: 0, disagreementTendency: 0, selfReferencingDepth: 0 },
        unfinishedThreads: [],
        updatedAt: "",
      },
      undefined, null, undefined, 2,
    );
    const block = buildSelfModelPromptBlock(model);
    expect(block).toContain("自由");
  });

  it("prompt block is empty for very low completeness", () => {
    const model = projectSelfModel(undefined, undefined, null, undefined, 0);
    const block = buildSelfModelPromptBlock(model);
    expect(block).toBe("");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase B: Interpretation Arena
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Phase B: runInterpretationArena", () => {
  const emptyModel: LivingSelfModel = {
    core_drives: [], aversion_map: [], repeated_returns: [],
    meaning_patterns: [], active_hypotheses: [],
    trust_level: 0, dominant_contradictions: [], blind_spots: [],
    response_style: { avg_length: 0, emotional_richness: 0, disagreement_tendency: 0, self_referencing_depth: 0 },
    model_completeness: 0,
  };
  const emptyState = { last_bet: null, last_bet_outcome: null, rejected_bets: [], accepted_bets: [], bet_history: [], consecutive_misses: 0, consecutive_same_bet_count: 0 };

  function arena(msg: string, intent: string = "ask_judgment"): WinningInterpretation {
    const signal: TurnSignal = {
      intent: intent as any,
      explicit: [], implicit: [],
      feedback_on_last_turn: null,
      emotional_temperature: 0.3,
      urgency: 0.3,
      question_type: "judgment",
      response_mode: "conclude",
      reaction: null,
    };
    return runInterpretationArena(msg, signal, emptyModel, emptyState, []);
  }

  it("fatigue message → fatigue_support wins", () => {
    const result = arena("もう疲れた、限界かも", "vent");
    expect(result.primary.lens).toBe("fatigue_support");
  });

  it("co-think request → co_think wins", () => {
    const result = arena("一緒に考えてほしい", "co_think_request");
    expect(result.primary.lens).toBe("co_think");
  });

  it("protest → repair_demand wins", () => {
    const result = arena("押し付けないで、決めつけてる", "challenge_alter");
    expect(result.primary.lens).toBe("repair_demand");
  });

  it("value exploration → core_drive_check wins", () => {
    const result = arena("自分にとって本当に大事なものって何だろう", "seek_understanding");
    expect(result.primary.lens).toBe("core_drive_check");
  });

  it("identity question → identity_quest wins", () => {
    const result = arena("自分って何者なんだろう", "existential");
    expect(result.primary.lens).toBe("identity_quest");
  });

  it("execution request → execution_ask wins", () => {
    const result = arena("具体的にどうすればいい？ステップ教えて", "demand_action");
    expect(result.primary.lens).toBe("execution_ask");
  });

  it("relationship issue → relationship_probe wins", () => {
    const result = arena("上司との距離感がわからない", "ask_judgment");
    expect(result.primary.lens).toBe("relationship_probe");
  });

  it("has primary and secondary", () => {
    const result = arena("もう疲れた、限界かも", "vent");
    expect(result.primary).toBeDefined();
    expect(result.all_readings.length).toBe(11);
  });

  it("anti-attractor triggers after 3 consecutive same lens wins", () => {
    const signal: TurnSignal = {
      intent: "vent", explicit: [], implicit: [],
      feedback_on_last_turn: null, emotional_temperature: 0.3, urgency: 0.3,
      question_type: "judgment", response_mode: "conclude", reaction: null,
    };
    // Simulate 3 consecutive fatigue_support wins
    const history: any[] = ["fatigue_support", "fatigue_support", "fatigue_support"];
    const result = runInterpretationArena(
      "また疲れたかも", signal, emptyModel, emptyState, history,
    );
    // Anti-attractor may swap primary/secondary if secondary has enough confidence
    expect(result.attractor.consecutive_wins).toBe(3);
  });

  it("prompt block contains primary lens info", () => {
    const result = arena("もう疲れた", "vent");
    const block = buildArenaPromptBlock(result);
    expect(block).toContain("fatigue_support");
    expect(block).toContain("Interpretation Arena");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase E: Strategy Compliance
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Phase E: checkStrategyCompliance", () => {
  it("clean response passes", () => {
    const result = checkStrategyCompliance(
      "転職って、結局自分が何を大事にしてるかで決まる話だよね。",
      null, null, null, null,
    );
    expect(result.passed).toBe(true);
  });

  it("empty response → critical violation", () => {
    const result = checkStrategyCompliance("", null, null, null, null);
    expect(result.passed).toBe(false);
    expect(result.violations.some(v => v.type === "empty_response")).toBe(true);
  });

  it("mirror role + directive → role_mismatch", () => {
    const role = selectAlterRole("conclude", "emotional", null, 1);
    const result = checkStrategyCompliance(
      "まず転職サイトに登録すべきだよ",
      role, null, null, null,
    );
    expect(result.violations.some(v => v.type === "role_mismatch")).toBe(true);
  });

  it("long response → too_long warning", () => {
    const longResponse = "a".repeat(900);
    const result = checkStrategyCompliance(longResponse, null, null, null, null);
    expect(result.violations.some(v => v.type === "too_long")).toBe(true);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase F: Rally Critic
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Phase F: assessRally", () => {
  it("first turn → advancing", () => {
    const result = assessRally(
      [{ role: "user", content: "転職すべきかな" }],
      [], null,
    );
    expect(result.status).toBe("advancing");
  });

  it("repeated similar messages → looping", () => {
    const result = assessRally(
      [
        { role: "user", content: "転職 迷う 判断 決断" },
        { role: "alter", content: "..." },
        { role: "user", content: "転職 迷う 判断 決断 どうしよう" },
        { role: "alter", content: "..." },
        { role: "user", content: "転職 迷う 判断 決断 わからない" },
      ],
      [], null,
    );
    expect(result.loop_detected).toBe(true);
    expect(result.status).toBe("looping");
  });

  it("short disengaged responses → user_disengaging (4ターン以上 + コンテンツフィルター)", () => {
    const result = assessRally(
      [
        { role: "user", content: "長い最初のメッセージで転職について相談したい" },
        { role: "alter", content: "..." },
        { role: "user", content: "そうかもね" },
        { role: "alter", content: "..." },
        { role: "user", content: "うーん" },
        { role: "alter", content: "..." },
        { role: "user", content: "はい" },
      ],
      [], null,
    );
    expect(result.status).toBe("user_disengaging");
  });

  it("short but engaged responses → NOT user_disengaging (質問・意思表明は離脱ではない)", () => {
    const result = assessRally(
      [
        { role: "user", content: "長い最初のメッセージで転職について相談したい" },
        { role: "alter", content: "..." },
        { role: "user", content: "起業したい" },
        { role: "alter", content: "..." },
        { role: "user", content: "何がいいかな？" },
        { role: "alter", content: "..." },
        { role: "user", content: "どう思う？" },
      ],
      [], null,
    );
    expect(result.status).not.toBe("user_disengaging");
  });

  it("stalling block is empty for advancing", () => {
    const result = assessRally(
      [{ role: "user", content: "転職すべきかな" }],
      [], null,
    );
    const block = buildRallyCriticBlock(result);
    expect(block).toBe("");
  });

  it("looping → non-empty critic block", () => {
    const result = assessRally(
      [
        { role: "user", content: "転職 迷う 判断 決断" },
        { role: "alter", content: "..." },
        { role: "user", content: "転職 迷う 判断 決断 どうしよう" },
        { role: "alter", content: "..." },
        { role: "user", content: "転職 迷う 判断 決断 わからない" },
      ],
      [], null,
    );
    const block = buildRallyCriticBlock(result);
    expect(block).toContain("堂々巡り");
  });
});
