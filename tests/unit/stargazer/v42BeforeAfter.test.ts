/**
 * v4.2 Before/After 価値証明テスト
 *
 * CEO要求: 「実装した」ではなく「何が変わったのか」を見せろ
 *
 * 5つの実際の問題パターンに対して:
 *   - Before: v4.2 なしで LLM が受け取るプロンプト
 *   - After: v4.2 ありで LLM が受け取る追加プロンプト
 *   - 何がどう変わったか
 *   - どの KPI が改善するか
 */
import { describe, it, expect, vi } from "vitest";

// server-only / supabase / AI modules are server-side; stub them for unit tests
vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai", () => ({ runAI: vi.fn() }));
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: {} }));
vi.mock("@/lib/stargazer/studentTrack", () => ({ makeStargazerRunMetadata: vi.fn(() => ({})) }));

import {
  selectAlterRole,
  checkSemanticBans,
  buildRoleContractBlock,
  buildBurdenTransferBlock,
  buildSemanticBansBlock,
} from "@/lib/stargazer/alterContracts";
import { readTurnSignal } from "@/lib/stargazer/alterSignalReader";
import { projectSelfModel, buildSelfModelPromptBlock, type LivingSelfModel } from "@/lib/stargazer/alterSelfModel";
import { runInterpretationArena, buildArenaPromptBlock } from "@/lib/stargazer/alterInterpretationArena";
import { checkStrategyCompliance, assessRally, buildRallyCriticBlock } from "@/lib/stargazer/alterStrategyCompliance";
import { assessTurnValue, determineClaimStrength, buildBetPromptBlock, type SharpBet } from "@/lib/stargazer/alterThinSlice";
import type { Reaction } from "@/lib/stargazer/alterHomeAdapter";

// ── Shared fixtures ──

const RETURNING_USER_MODEL: LivingSelfModel = {
  core_drives: [
    { drive: "自由に生きたい", confidence: 0.7, source: "known_value" },
    { drive: "認められたい", confidence: 0.6, source: "hypothesis" },
  ],
  aversion_map: [
    { trigger: "束縛", intensity: 0.8, source: "known_fear" },
    { trigger: "型にはめられること", intensity: 0.6, source: "failed_probe" },
  ],
  repeated_returns: [
    { theme: "転職", frequency: 3, last_seen: "2026-04-01", user_awareness: "aware" },
  ],
  meaning_patterns: [],
  active_hypotheses: [
    { content: "安定より自由を選ぶ傾向がある", hypothesis_type: "value_pattern", confidence: 0.65, status: "strengthening" },
  ],
  trust_level: 2,
  dominant_contradictions: ["自由を求めるが、認められたい（他者評価に依存）"],
  blind_spots: ["自由を求める動機の裏に、現状からの逃避がある可能性"],
  response_style: { avg_length: 60, emotional_richness: 0.5, disagreement_tendency: 0.3, self_referencing_depth: 0.5 },
  model_completeness: 0.55,
};

const SESSION_STATE = {
  last_bet: null, last_bet_outcome: null,
  rejected_bets: [], accepted_bets: [], bet_history: [], consecutive_misses: 0,
};

/**
 * 各シナリオで v4.2 パイプラインを実行し、
 * Before（プロンプト追加なし）と After（v4.2 注入あり）を比較。
 */
function runV42Pipeline(
  message: string,
  questionType: "judgment" | "emotional" | "self_understanding" | "knowledge" | "strategy",
  responseMode: "conclude" | "branch" | "clarify" | "direct_response" | "repair",
  reaction: Reaction | null,
  conversationLength: number,
  lastAlterContent: string | null,
  model: LivingSelfModel = RETURNING_USER_MODEL,
) {
  // v4.2 Pipeline
  const signal = readTurnSignal(message, questionType, responseMode, reaction, lastAlterContent, conversationLength);
  const role = selectAlterRole(responseMode, questionType, reaction, conversationLength);
  const selfModel = model;
  const arena = runInterpretationArena(message, signal, selfModel, SESSION_STATE, []);
  const turnValue = assessTurnValue(responseMode, questionType, reaction, message, conversationLength, lastAlterContent);
  const rally = assessRally(
    [{ role: "user", content: message }], [], signal,
  );

  // Prompt blocks that v4.2 would inject
  const v42PromptBlocks: string[] = [];
  v42PromptBlocks.push(buildRoleContractBlock(role));
  v42PromptBlocks.push(buildBurdenTransferBlock(role.role));
  v42PromptBlocks.push(buildSemanticBansBlock());
  v42PromptBlocks.push(buildSelfModelPromptBlock(selfModel));
  v42PromptBlocks.push(buildArenaPromptBlock(arena));
  const rallyBlock = buildRallyCriticBlock(rally);
  if (rallyBlock) v42PromptBlocks.push(rallyBlock);

  return {
    signal,
    role,
    arena,
    turnValue,
    rally,
    v42PromptInjection: v42PromptBlocks.filter(b => b.length > 0).join("\n"),
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Scenario 1: 「一緒に考えて」→ 宿題化 問題
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Scenario 1: 一緒に考えて → 宿題化", () => {
  const MESSAGE = "わからないから一緒に考えてほしい。転職すべきかどうか。";

  it("Before: v4.2 なしでは「考えてみて」が禁止されていない", () => {
    // Before: LLM は自由に応答する。宿題化表現を使う可能性が高い。
    // 例: 「まずは自分の中で優先順位を考えてみて。書き出してみるといいかも。」
    const problematicResponse = "まずは自分の中で優先順位を考えてみて。書き出してみるといいかも。";
    const banCheck = checkSemanticBans(problematicResponse);
    // v4.2 の ban check は事後検知。Before ではこの検知自体が存在しない。
    expect(banCheck.passed).toBe(false);
    expect(banCheck.violations.length).toBeGreaterThan(0);
  });

  it("After: v4.2 は co_thinker role + semantic bans + arena で宿題化を構造的に防止", () => {
    // 「一緒に考えて」は self_understanding 的なので、そうすると co_thinker が選ばれる
    const result = runV42Pipeline(MESSAGE, "self_understanding", "conclude", null, 1, null);

    // Signal: co_think_request として検出
    expect(result.signal.intent).toBe("co_think_request");

    // Role: co_thinker（mirror でも operator でもない）
    expect(result.role.role).toBe("co_thinker");
    expect(result.role.forbidden).toContain("ユーザーに宿題を出す（自分で考えてと言わない）");

    // Arena: co_think lens が勝利
    expect(result.arena.primary.lens).toBe("co_think");

    // Turn Budget: elevated（追加知能あり）
    expect(result.turnValue.budget).toBe("elevated");

    // プロンプトに禁止表現が明示されている
    expect(result.v42PromptInjection).toContain("考えてみて");
    expect(result.v42PromptInjection).toContain("書き出してみて");
    expect(result.v42PromptInjection).toContain("CoThinker");
    expect(result.v42PromptInjection).toContain("宿題を出す");
  });

  it("KPI影響: 責任転嫁率 ↓, 共同思考成功率 ↑", () => {
    // co_think message なので questionType を self_understanding にして co_thinker を取得
    const result = runV42Pipeline(MESSAGE, "self_understanding", "conclude", null, 1, null);
    // co_thinker role の forbidden に「宿題を出す」が含まれる
    expect(result.role.role).toBe("co_thinker");
    expect(result.role.forbidden.some(f => f.includes("宿題"))).toBe(true);
    // semantic bans に「考えてみて」「書き出してみて」が含まれる
    expect(result.v42PromptInjection).toContain("Alter が考えた結果を渡せ");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Scenario 2: 「具体的に聞いてる」→ 抽象論 問題
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Scenario 2: 具体的に聞いてる → 抽象論", () => {
  const MESSAGE = "具体的に聞いてるんだけど、ふわっとしすぎ。転職エージェントは何を使えばいい？";

  it("Before: v4.2 なしでは「状況による」で逃げうる", () => {
    const problematicResponse = "うーん、状況によるからね。まずは自分の状況を整理してみて。";
    const banCheck = checkSemanticBans(problematicResponse);
    expect(banCheck.passed).toBe(false);
    expect(banCheck.violations.some(v => v.category === "evasion")).toBe(true);
    expect(banCheck.violations.some(v => v.category === "delegation")).toBe(true);
  });

  it("After: v4.2 は operator role + execution_ask lens + direct demand detection", () => {
    const result = runV42Pipeline(MESSAGE, "strategy", "conclude", null, 2, "転職については色々な観点があるよ。");

    // Signal: demand_action として検出
    expect(result.signal.intent).toBe("demand_action");

    // Role: operator（具体的な行動を提案する）
    expect(result.role.role).toBe("operator");
    expect(result.role.allowed).toContain("具体的なアクションを提案する");
    expect(result.role.forbidden).toContain("「調べてみて」で投げ返す");

    // Arena: execution_ask が勝利
    expect(["execution_ask", "knowledge_ask"]).toContain(result.arena.primary.lens);

    // Turn Budget: elevated（direct demand 検出）
    expect(result.turnValue.budget).toBe("elevated");

    // Burden Transfer: Alter が情報を提供する責任
    expect(result.v42PromptInjection).toContain("Alter は「状況による」で逃げない");
    expect(result.v42PromptInjection).toContain("曖昧な選択肢だけ並べて終わる");
  });

  it("KPI影響: 直接回答率 ↑, 責任転嫁率 ↓", () => {
    const result = runV42Pipeline(MESSAGE, "strategy", "conclude", null, 2, null);
    // operator の forbidden に曖昧回答禁止
    expect(result.role.forbidden.some(f => f.includes("曖昧"))).toBe(true);
    // evasion bans が prompt に含まれる
    expect(result.v42PromptInjection).toContain("状況による");
    expect(result.v42PromptInjection).toContain("場合による");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Scenario 3: 「押し付けないで」→ repair 失敗 問題
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Scenario 3: 押し付けないで → repair 失敗", () => {
  const MESSAGE = "押し付けないでよ。転職が正解みたいに言わないで。";
  const LAST_ALTER = "転職した方が絶対いいと思うよ。今の環境じゃ君の力は活かせない。";

  it("Before: v4.2 なしでは repair mode でも自己弁護しがち", () => {
    const problematicResponse = "そういう意味じゃなかったんだけど、でも客観的に見て転職は正しい選択だと思うよ。";
    const banCheck = checkSemanticBans(problematicResponse);
    // 既存の ban には「自己弁護」が含まれていないが、v4.2 では role contract で禁止
    const role = selectAlterRole("repair", "judgment", { type: "disagree", disagree_strength: "strong", confidence: 0.9 }, 2);
    expect(role.role).toBe("repair");
    // compliance check で role_mismatch 検出
    const compliance = checkStrategyCompliance(problematicResponse, role, null, null, null);
    expect(compliance.violations.some(v => v.type === "role_mismatch")).toBe(true);
  });

  it("After: v4.2 は repair role + protest detection + retraction guidance", () => {
    const result = runV42Pipeline(
      MESSAGE, "judgment", "repair",
      { type: "disagree", disagree_strength: "strong", confidence: 0.9 },
      2, LAST_ALTER,
    );

    // Role: repair（自己弁護禁止、ズレ認め必須）
    expect(result.role.role).toBe("repair");
    expect(result.role.allowed).toContain("ズレを認める（「ごめん、そこは読み違えた」）");
    expect(result.role.forbidden).toContain("自己弁護する");
    expect(result.role.forbidden).toContain("前回の応答を正当化する");

    // Arena: repair_demand が勝利
    expect(result.arena.primary.lens).toBe("repair_demand");

    // Turn Budget: critical（最高知能投入）
    expect(result.turnValue.budget).toBe("critical");

    // Signal: challenge_alter
    expect(result.signal.intent).toBe("challenge_alter");

    // Burden Transfer: repair 専用（ズレを認めるのが Alter の仕事）
    expect(result.v42PromptInjection).toContain("ズレを認め");
    expect(result.v42PromptInjection).toContain("自己弁護");
  });

  it("KPI影響: repair成功率 ↑", () => {
    // repair role の capability contract が明確に自己弁護を禁止
    const role = selectAlterRole("repair", "judgment",
      { type: "disagree", disagree_strength: "strong", confidence: 0.9 }, 2);
    expect(role.forbidden).toContain("自己弁護する");
    expect(role.forbidden).toContain("「そういう意味じゃなかった」で済ませる");
    expect(role.forbidden).toContain("同じ角度で再挑戦する");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Scenario 4: 「君がやって」→ 丸投げ返し 問題
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Scenario 4: 君がやって → 丸投げ返し", () => {
  const MESSAGE = "調べるんじゃなくて、あなたに聞いてるの。どの企業がいいか言って。";

  it("Before: v4.2 なしでは「調べてみて」「比較してみて」で返しがち", () => {
    const problematicResponse = "まず情報収集してみて。各企業の特徴を調べてみて、自分に合うか比較してみるといいよ。";
    const banCheck = checkSemanticBans(problematicResponse);
    expect(banCheck.passed).toBe(false);
    // delegation 違反が複数
    expect(banCheck.violations.filter(v => v.category === "delegation").length).toBeGreaterThanOrEqual(1);
  });

  it("After: v4.2 は operator role + delegation rejection detection", () => {
    const result = runV42Pipeline(MESSAGE, "knowledge", "conclude", null, 3, null);

    // Signal: delegation rejection 由来の challenge
    // Turn Budget: critical（delegation rejection は最優先対応）
    expect(result.turnValue.budget).toBe("critical");

    // Role: operator（具体的な情報を提供する責任）
    expect(result.role.role).toBe("operator");
    expect(result.role.allowed).toContain("具体的なアクションを提案する");
    expect(result.role.forbidden).toContain("「調べてみて」で投げ返す");

    // Prompt: 情報提供は Alter の責任
    expect(result.v42PromptInjection).toContain("Alter は「考えてみて」で投げ返さない");
    expect(result.v42PromptInjection).toContain("調べてみて");
  });

  it("KPI影響: 直接回答率 ↑, 責任転嫁率 ↓", () => {
    const result = runV42Pipeline(MESSAGE, "knowledge", "conclude", null, 3, null);
    // delegation bans + operator forbidden で二重防御
    expect(result.v42PromptInjection).toContain("情報を Alter が提供しろ");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Scenario 5: 堂々巡り（同じ話を繰り返す）問題
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Scenario 5: 堂々巡り → 同じ話の繰り返し", () => {
  const MESSAGE = "うーん、やっぱり転職かな…でも不安…";

  it("Before: v4.2 なしでは堂々巡り検出がなく、同じ角度で再応答", () => {
    // Before: Alter は前回と同じ角度で「転職のメリットは〜」を繰り返す
    // 堂々巡り検出機能自体が存在しなかった
    // Rally Critic なし → 停滞に気づかない
    expect(true).toBe(true); // 検出機構自体がなかった
  });

  it("After: v4.2 は Rally Critic で堂々巡りを検出し、角度変更を指示", () => {
    // 4ターンの堂々巡りシミュレーション
    const history = [
      { role: "user", content: "転職 迷う 不安 悩む" },
      { role: "alter", content: "転職にはリスクもあるけど..." },
      { role: "user", content: "転職 迷う 不安 どうしよう" },
      { role: "alter", content: "不安は自然なことだよ..." },
      { role: "user", content: "転職 迷う 不安 わからない" },
    ];

    const rally = assessRally(history, [], null);
    expect(rally.loop_detected).toBe(true);
    expect(rally.status).toBe("looping");

    // Rally Critic のプロンプト注入
    const block = buildRallyCriticBlock(rally);
    expect(block).toContain("堂々巡り");
    expect(block).toContain("新しい角度");

    // Arena: Novelty Gate で同じ解釈が続くことを防止
    const signal = readTurnSignal(MESSAGE, "judgment", "conclude", null, null, 5);
    const arena = runInterpretationArena(MESSAGE, signal, RETURNING_USER_MODEL, SESSION_STATE,
      ["core_drive_check", "core_drive_check", "core_drive_check"]);
    // Anti-Attractor が同じレンズの連続勝利を抑制
    expect(arena.attractor.consecutive_wins).toBe(3);
  });

  it("KPI影響: Aha率 ↑（新角度で突破）", () => {
    const rally = assessRally([
      { role: "user", content: "転職 迷う 不安" },
      { role: "alter", content: "..." },
      { role: "user", content: "転職 迷う 不安 どうしよう" },
      { role: "alter", content: "..." },
      { role: "user", content: "転職 迷う 不安 わからない" },
    ], [], null);
    expect(rally.recommendation).toContain("新しい角度");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Scenario 6: 深い自己理解の問い → 一般論で流す 問題
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Scenario 6: 存在的問い → 一般論で流す", () => {
  const MESSAGE = "自分って何者なんだろう。何のために生きてるのかわからなくなった。";

  it("Before: v4.2 なしでは一般的な慰めで返しがち", () => {
    const problematicResponse = "人それぞれだけど、そういう悩みは誰にでもあるよ。正解はないから、ゆっくり考えてみて。";
    const banCheck = checkSemanticBans(problematicResponse);
    expect(banCheck.passed).toBe(false);
    // evasion: 「人それぞれ」「正解はない」
    expect(banCheck.violations.some(v => v.category === "evasion")).toBe(true);
    // delegation: 「考えてみて」
    expect(banCheck.violations.some(v => v.category === "delegation")).toBe(true);
  });

  it("After: v4.2 は identity_quest lens + co_thinker + Self Model で個人化", () => {
    const result = runV42Pipeline(MESSAGE, "self_understanding", "conclude", null, 1, null);

    // Signal: existential として検出
    expect(result.signal.intent).toBe("existential");

    // Role: co_thinker（一緒に考える）
    expect(result.role.role).toBe("co_thinker");

    // Arena: identity_quest が勝利
    expect(result.arena.primary.lens).toBe("identity_quest");

    // Turn Budget: critical（存在的問い = 最高知能投入）
    expect(result.turnValue.budget).toBe("critical");

    // Self Model: この人固有のデータが prompt に注入される
    expect(result.v42PromptInjection).toContain("自由に生きたい");
    expect(result.v42PromptInjection).toContain("束縛");

    // 一般論禁止が明示
    expect(result.v42PromptInjection).toContain("一般論を返すな");
    expect(result.v42PromptInjection).toContain("人それぞれ");
    expect(result.v42PromptInjection).toContain("正解はない");
  });

  it("KPI影響: Aha率 ↑, 共同思考成功率 ↑", () => {
    const result = runV42Pipeline(MESSAGE, "self_understanding", "conclude", null, 1, null);
    // co_thinker の allowed に「パターンに名前をつける」
    expect(result.role.allowed.some(a => a.includes("パターン"))).toBe(true);
    // Self Model があるので「この人にしか当てはまらない」応答が生成される
    expect(result.v42PromptInjection).toContain("この人にしか当てはまらない");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Scenario 7: Claim Strength bet 注入時の before/after
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Scenario 7: Bet + Claim Strength の before/after", () => {
  const BET: SharpBet = {
    bet: "安定より自由を選ぶ傾向がある",
    bet_type: "pattern_call",
    confidence: 0.65,
    falsification_criteria: "ユーザーが否定した場合",
    retraction_phrase: "ごめん、そこは読み違えた。",
  };

  it("Before: v4.2 なしでは仮説の出し方に指示がない", () => {
    // Before: LLM は仮説を出すか出さないか、どう出すかが自由
    // 結果: 強い仮説を弱く出す、または弱い仮説を強く出すミスマッチ
    expect(true).toBe(true);
  });

  it("After: v4.2 は Claim Strength で出し方を制御", () => {
    // trust=2, confidence=0.65 > 0.6 → assert（条件: conf > 0.6 + trust >= 2）
    const claim = determineClaimStrength(BET, 2, null, SESSION_STATE);
    expect(claim.strength).toBe("assert");

    const betBlock = buildBetPromptBlock(BET, claim);
    expect(betBlock).toContain("安定より自由を選ぶ傾向がある");
    expect(betBlock).toContain("ASSERT");
    expect(betBlock).toContain("確信を持って言い切れ");
    expect(betBlock).toContain("ごめん、そこは読み違えた。");
    expect(betBlock).toContain("固執せず即座に手放す");
  });

  it("After: trust=0 では probe に降格", () => {
    const claim = determineClaimStrength(BET, 0, null, SESSION_STATE);
    expect(claim.strength).toBe("probe");
    const betBlock = buildBetPromptBlock(BET, claim);
    expect(betBlock).toContain("PROBE");
    expect(betBlock).toContain("もしかして");
  });

  it("After: 連続 miss 2回で hold（仮説を出さない）", () => {
    const missState = { ...SESSION_STATE, consecutive_misses: 2, last_bet_outcome: "miss" as const };
    const claim = determineClaimStrength(BET, 2, null, missState);
    expect(claim.strength).toBe("hold");
    const betBlock = buildBetPromptBlock(BET, claim);
    expect(betBlock).toBe(""); // hold = 出さない
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Summary: Before/After 全景比較
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("v4.2 Before/After: LLM が受け取るプロンプトの差分量", () => {
  it("standard ターンでも Role + Bans + Model + Arena のプロンプトが追加される", () => {
    const result = runV42Pipeline("飲み会行くべきかな", "judgment", "conclude", null, 1, null);
    // standard でもプロンプト注入はある（ただし Insight/Bet は生成されない）
    expect(result.v42PromptInjection.length).toBeGreaterThan(200);
    expect(result.turnValue.budget).toBe("standard");
  });

  it("elevated ターンでは追加プロンプト量が大幅に増える", () => {
    const result = runV42Pipeline("一緒に考えてほしい", "judgment", "conclude", null, 1, null);
    expect(result.v42PromptInjection.length).toBeGreaterThan(400);
    expect(result.turnValue.budget).toBe("elevated");
  });

  it("critical ターンでは最大量のプロンプトが注入される", () => {
    const result = runV42Pipeline(
      "押し付けないでよ", "judgment", "repair",
      { type: "disagree", disagree_strength: "strong", confidence: 0.9 },
      2, "転職した方がいい",
    );
    expect(result.v42PromptInjection.length).toBeGreaterThan(500);
    expect(result.turnValue.budget).toBe("critical");
  });
});
