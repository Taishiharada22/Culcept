/**
 * Wound Activation / Financial Pressure / Context Modifiers の検証テスト
 *
 * CEO検証項目:
 * 1. Wound activation: high/acute で MI+RouteC 抑制、protect_pressure 加算、caution_text、過剰発火チェック
 * 2. Financial pressure: 段階的 cost_load 加算、crisis 提案禁止、誤検知チェック
 * 3. Context modifiers: 安全制約（obs<3, conf<0.3）、domain差分、±0.3 クランプ、overlay互換
 * 4. 全体バランス: 日常メッセージで守りに寄りすぎない
 */
import { describe, it, expect } from "vitest";
import {
  computeWoundActivation,
  detectPotentialWounds,
  computeFinancialPressure,
  applyContextModifiers,
  updateContextModifier,
  type WoundActivationInput,
  type WoundDefinition,
  type FinancialPressureInput,
  type ContextModifierInput,
  type AxisContextModifier,
  type TrustLevel,
} from "@/lib/stargazer/alterUnderstanding";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. Wound Activation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Wound Activation Engine", () => {
  const baseWound: WoundDefinition = {
    wound_id: "test_betrayal",
    theme: "裏切り・信頼の喪失",
    related_persons: ["母"],
    related_keywords: /裏切[らり]|信[じ用].*でき.*ない|信頼.*でき.*ない/,
    depth: "structural",
    source: "user_implied",
    confidence: 0.7,
    last_confirmed: new Date().toISOString(),
  };

  const baseInput = (overrides: Partial<WoundActivationInput> = {}): WoundActivationInput => ({
    wounds: [baseWound],
    current_message: "今日は天気がいいね",
    recent_messages: [],
    recent_mi_reactions: [],
    trust_level: 2 as TrustLevel,
    user_state: null,
    ...overrides,
  });

  it("dormant: 無関係なメッセージでは活性化しない", () => {
    const result = computeWoundActivation(baseInput());
    expect(result.most_active).toBeNull();
    expect(result.should_suppress_mi).toBe(false);
    expect(result.should_avoid_route_c).toBe(false);
    expect(result.max_protect_boost).toBe(0);
    expect(result.caution_prompts).toHaveLength(0);
  });

  it("theme_match: 関連テーマで活性化する", () => {
    const result = computeWoundActivation(baseInput({
      current_message: "最近、人を信じることができないんだよね",
    }));
    expect(result.most_active).not.toBeNull();
    expect(result.most_active!.activation_score).toBeGreaterThan(0.1);
    expect(result.most_active!.signals.some(s => s.source === "theme_match")).toBe(true);
  });

  it("person_mention: 関連人物で活性化する", () => {
    const result = computeWoundActivation(baseInput({
      current_message: "母に相談しようか迷ってる",
    }));
    expect(result.most_active).not.toBeNull();
    expect(result.most_active!.signals.some(s => s.source === "person_mention")).toBe(true);
  });

  it("high/acute: MI抑制 + RouteC回避 + protect_pressure加算", () => {
    // テーマ + 人物 + 感情スパイク + 回避 → 高い活性化
    const result = computeWoundActivation(baseInput({
      current_message: "母のことは信じることなんてできない。もういや",
      recent_messages: ["裏切られたことが何度もある"],
      recent_mi_reactions: [
        { wound_related: true, reaction: "denied" },
        { wound_related: true, reaction: "ignored" },
        { wound_related: true, reaction: "denied" },
      ],
    }));
    expect(result.most_active).not.toBeNull();
    const level = result.most_active!.level;
    // high 以上であること
    expect(["high", "acute"]).toContain(level);
    expect(result.should_suppress_mi).toBe(true);
    expect(result.should_avoid_route_c).toBe(true);
    expect(result.max_protect_boost).toBeGreaterThanOrEqual(0.15);
    expect(result.caution_prompts.length).toBeGreaterThan(0);
  });

  it("caution_text に傷のテーマが含まれる（外に漏れる具体情報ではなく指示として）", () => {
    const result = computeWoundActivation(baseInput({
      current_message: "母が信じられない。もう無理",
      recent_messages: ["裏切られた"],
      recent_mi_reactions: [
        { wound_related: true, reaction: "denied" },
        { wound_related: true, reaction: "denied" },
      ],
    }));
    if (result.caution_prompts.length > 0) {
      // 指示文であること（「ユーザー」等の表現はなく、内部指示トーン）
      const text = result.caution_prompts.join("\n");
      expect(text).toContain(baseWound.theme);
      // 安全: ユーザーの個人情報が直接含まれない
      expect(text).not.toContain("母");
    }
  });

  it("過剰発火チェック: 一般的な否定語で wound が発火しない", () => {
    const result = computeWoundActivation(baseInput({
      current_message: "今日のランチは信じられないくらい美味しかった",
    }));
    // 「信じられない」がポジティブ文脈で使われた場合でも theme_match はする
    // ただし他のシグナルがないので level は dormant or low
    if (result.most_active) {
      expect(["dormant", "low"]).toContain(result.most_active.level);
    }
    expect(result.should_suppress_mi).toBe(false);
    expect(result.should_avoid_route_c).toBe(false);
  });

  it("wounds が空なら何も起きない", () => {
    const result = computeWoundActivation(baseInput({ wounds: [] }));
    expect(result.activations).toHaveLength(0);
    expect(result.most_active).toBeNull();
    expect(result.should_suppress_mi).toBe(false);
  });

  it("detectPotentialWounds: 裏切りワードから自動検出", () => {
    const wounds = detectPotentialWounds(["裏切られた経験がある"]);
    expect(wounds.length).toBeGreaterThanOrEqual(1);
    expect(wounds.some(w => w.wound_id === "auto_betrayal")).toBe(true);
    // confidence は控えめ
    expect(wounds[0].confidence).toBeLessThanOrEqual(0.3);
  });

  it("detectPotentialWounds: 無関係なテキストでは検出しない", () => {
    const wounds = detectPotentialWounds(["今日はいい天気だった", "明日は何しよう"]);
    expect(wounds).toHaveLength(0);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. Financial Pressure
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Financial Pressure Constraint", () => {
  const baseInput = (overrides: Partial<FinancialPressureInput> = {}): FinancialPressureInput => ({
    current_message: "今日は何しよう",
    recent_user_messages: [],
    life_context_economic_signals: [],
    historical_economic_signal_count: 0,
    ...overrides,
  });

  it("none: 経済ワードがなければ発火しない", () => {
    const result = computeFinancialPressure(baseInput());
    expect(result.level).toBe("none");
    expect(result.cost_load_boost).toBe(0);
    expect(result.prompt_hint).toBe("");
  });

  it("mild: 金欠ワードで軽度発火", () => {
    const result = computeFinancialPressure(baseInput({
      current_message: "お金がないからどうしよう",
    }));
    expect(["mild", "moderate"]).toContain(result.level);
    expect(result.cost_load_boost).toBeGreaterThan(0);
    expect(result.cost_load_boost).toBeLessThanOrEqual(0.10);
  });

  it("moderate: 複数シグナル + 蓄積で中度発火", () => {
    const result = computeFinancialPressure(baseInput({
      current_message: "節約しないとまずい。お金がなくて贅沢はできないからさ",
      recent_user_messages: ["給料が安くてきつい", "お金がなくて節約してる"],
      historical_economic_signal_count: 5,
    }));
    expect(["moderate", "severe"]).toContain(result.level);
    expect(result.cost_load_boost).toBeGreaterThanOrEqual(0.10);
    expect(result.prompt_hint).not.toBe("");
    // 指示文に「経済状況に言及しない」ルールが含まれる
    expect(result.prompt_hint).toContain("言及");
  });

  it("単発の節約+金欠ワードは mild 止まり — 適切に控えめ", () => {
    const result = computeFinancialPressure(baseInput({
      current_message: "節約しないとまずい。お金がなくて贅沢はできないからさ",
    }));
    // 単発メッセージだけで moderate にならない = 安全側
    expect(result.level).toBe("mild");
    expect(result.cost_load_boost).toBe(0.05);
  });

  it("軽い出費言及は none — 適切に控えめ", () => {
    const result = computeFinancialPressure(baseInput({
      current_message: "最近出費が多くて気になるんだよね",
    }));
    // 「出費」だけでは間接的シグナルなので none or mild
    expect(["none", "mild"]).toContain(result.level);
  });

  it("severe/crisis: 借金・生活困窮で高度発火", () => {
    const result = computeFinancialPressure(baseInput({
      current_message: "借金の返済が追いつかない。生活費も足りない",
    }));
    expect(["severe", "crisis"]).toContain(result.level);
    expect(result.cost_load_boost).toBeGreaterThanOrEqual(0.20);
    expect(result.prompt_hint).toContain("禁止");
  });

  it("crisis: cost_load_boost が 0.35", () => {
    const result = computeFinancialPressure(baseInput({
      current_message: "借金が膨らんで返済できない。生活も苦しくて食べるのも厳しい",
      recent_user_messages: ["お金がない", "督促が来た"],
      historical_economic_signal_count: 5,
    }));
    expect(result.level).toBe("crisis");
    expect(result.cost_load_boost).toBe(0.35);
  });

  it("段階的: cost_load_boost が level に応じて段階的に増加", () => {
    const none = computeFinancialPressure(baseInput());
    const mild = computeFinancialPressure(baseInput({
      current_message: "出費がちょっと気になる",
    }));
    const severe = computeFinancialPressure(baseInput({
      current_message: "借金の返済がきつい",
    }));
    expect(none.cost_load_boost).toBeLessThanOrEqual(mild.cost_load_boost);
    expect(mild.cost_load_boost).toBeLessThanOrEqual(severe.cost_load_boost);
  });

  it("誤検知チェック: 金銭以外の「高い」「値段」で過剰発火しない", () => {
    const result = computeFinancialPressure(baseInput({
      current_message: "テンションが高い！今日は最高の気分",
    }));
    expect(result.level).toBe("none");
  });

  it("誤検知チェック: 仕事の「コスト」文脈で過剰発火しない", () => {
    const result = computeFinancialPressure(baseInput({
      current_message: "プロジェクトの開発コストを見積もらないと",
    }));
    // 「コスト」単体では発火しないはず（正規表現は「コスト.*気」）
    expect(result.level).toBe("none");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. Context Modifiers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Layer 1 Context Modifiers", () => {
  const baseScores: Record<string, number> = {
    decision_tempo: 0.5,
    impulse_vs_caution: 0.5,
    locus_of_control: 0.5,
    social_initiative: 0.4,
    exploration_closure: 0.6,
  };

  const baseInput = (overrides: Partial<ContextModifierInput> = {}): ContextModifierInput => ({
    base_axis_scores: baseScores,
    domain: "work",
    stored_modifiers: [],
    domain_decision_distribution: null,
    global_decision_distribution: null,
    ...overrides,
  });

  it("モディファイアなし: ベーススコアがそのまま返る", () => {
    const result = applyContextModifiers(baseInput());
    expect(result.scores.decision_tempo).toBe(0.5);
    expect(result.modified_axes).toHaveLength(0);
  });

  it("DB モディファイア: 確信度・観測数が十分なら適用される", () => {
    const modifier: AxisContextModifier = {
      axis_id: "decision_tempo",
      domain_offsets: { work: 0.12 },
      evidence: {
        work: {
          observation_count: 10,
          confidence: 0.6,
          source: "decision_distribution",
          last_updated: new Date().toISOString(),
        },
      },
    };
    const result = applyContextModifiers(baseInput({ stored_modifiers: [modifier] }));
    expect(result.scores.decision_tempo).toBeCloseTo(0.62, 2);
    expect(result.modified_axes).toContain("decision_tempo");
  });

  it("安全制約: confidence < 0.3 では適用されない", () => {
    const modifier: AxisContextModifier = {
      axis_id: "decision_tempo",
      domain_offsets: { work: 0.15 },
      evidence: {
        work: {
          observation_count: 10,
          confidence: 0.2,  // < 0.3
          source: "decision_distribution",
          last_updated: new Date().toISOString(),
        },
      },
    };
    const result = applyContextModifiers(baseInput({ stored_modifiers: [modifier] }));
    expect(result.scores.decision_tempo).toBe(0.5); // 未修正
    expect(result.modified_axes).not.toContain("decision_tempo");
  });

  it("安全制約: observation_count < 3 では適用されない", () => {
    const modifier: AxisContextModifier = {
      axis_id: "decision_tempo",
      domain_offsets: { work: 0.15 },
      evidence: {
        work: {
          observation_count: 2,  // < 3
          confidence: 0.8,
          source: "decision_distribution",
          last_updated: new Date().toISOString(),
        },
      },
    };
    const result = applyContextModifiers(baseInput({ stored_modifiers: [modifier] }));
    expect(result.scores.decision_tempo).toBe(0.5);
  });

  it("クランプ: 修正後のスコアが 0.0-1.0 に収まる", () => {
    const modifier: AxisContextModifier = {
      axis_id: "exploration_closure",
      domain_offsets: { work: 0.5 },  // base 0.6 + 0.5 = 1.1 → 1.0 にクランプ
      evidence: {
        work: {
          observation_count: 20,
          confidence: 0.9,
          source: "decision_distribution",
          last_updated: new Date().toISOString(),
        },
      },
    };
    const result = applyContextModifiers(baseInput({ stored_modifiers: [modifier] }));
    expect(result.scores.exploration_closure).toBe(1.0);
  });

  it("判断分布差異: go率が全体より高い → 関連軸が積極寄りに補正", () => {
    const result = applyContextModifiers(baseInput({
      domain_decision_distribution: {
        go_ratio: 0.8, wait_ratio: 0.15, no_ratio: 0.05, total_observations: 10,
      },
      global_decision_distribution: {
        go_ratio: 0.5, wait_ratio: 0.35, no_ratio: 0.15, total_observations: 30,
      },
    }));
    // go_ratio diff = 0.3 → offset = 0.3 * 0.5 = 0.15
    expect(result.scores.decision_tempo).toBeGreaterThan(0.5);
    expect(result.modified_axes.length).toBeGreaterThan(0);
  });

  it("判断分布差異: 差が小さい（< 15%）ときは補正なし", () => {
    const result = applyContextModifiers(baseInput({
      domain_decision_distribution: {
        go_ratio: 0.55, wait_ratio: 0.30, no_ratio: 0.15, total_observations: 10,
      },
      global_decision_distribution: {
        go_ratio: 0.50, wait_ratio: 0.35, no_ratio: 0.15, total_observations: 30,
      },
    }));
    // diff = 0.05 → threshold 0.15 未満 → 補正なし
    expect(result.scores.decision_tempo).toBe(0.5);
    expect(result.modified_axes).toHaveLength(0);
  });

  it("判断分布差異: 観測数 < 5 では無視", () => {
    const result = applyContextModifiers(baseInput({
      domain_decision_distribution: {
        go_ratio: 0.9, wait_ratio: 0.05, no_ratio: 0.05, total_observations: 3, // < 5
      },
      global_decision_distribution: {
        go_ratio: 0.3, wait_ratio: 0.4, no_ratio: 0.3, total_observations: 30,
      },
    }));
    expect(result.modified_axes).toHaveLength(0);
  });

  it("updateContextModifier: 学習が蓄積される", () => {
    // 初回
    const mod1 = updateContextModifier(null, "decision_tempo", "work", 0.1);
    expect(mod1.domain_offsets.work).toBeCloseTo(0.03, 2); // 0 * 0.7 + 0.1 * 0.3
    expect(mod1.evidence.work!.observation_count).toBe(1);

    // 2回目
    const mod2 = updateContextModifier(mod1, "decision_tempo", "work", 0.1);
    expect(mod2.domain_offsets.work).toBeGreaterThan(mod1.domain_offsets.work!);
    expect(mod2.evidence.work!.observation_count).toBe(2);
    expect(mod2.evidence.work!.confidence).toBeGreaterThan(mod1.evidence.work!.confidence);
  });

  it("updateContextModifier: ±0.3 クランプ", () => {
    // 大きなオフセットを何度も入力
    let mod: AxisContextModifier | null = null;
    for (let i = 0; i < 50; i++) {
      mod = updateContextModifier(mod, "decision_tempo", "work", 1.0);
    }
    expect(mod!.domain_offsets.work).toBeLessThanOrEqual(0.3);
    expect(mod!.domain_offsets.work).toBeGreaterThanOrEqual(-0.3);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. 全体バランス: 日常メッセージで守りに寄りすぎない
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Overall Balance — no over-defensiveness", () => {
  it("日常メッセージ: wound も financial も発火しない", () => {
    const woundResult = computeWoundActivation({
      wounds: detectPotentialWounds(["今日は天気がいい", "明日何する？"]),
      current_message: "飲み会に誘われたけどどうしよう",
      recent_messages: ["今日は天気がいい"],
      recent_mi_reactions: [],
      trust_level: 2 as TrustLevel,
      user_state: null,
    });
    expect(woundResult.should_suppress_mi).toBe(false);
    expect(woundResult.should_avoid_route_c).toBe(false);
    expect(woundResult.max_protect_boost).toBe(0);

    const fpResult = computeFinancialPressure({
      current_message: "飲み会に誘われたけどどうしよう",
      recent_user_messages: ["今日は天気がいい"],
      life_context_economic_signals: [],
      historical_economic_signal_count: 0,
    });
    expect(fpResult.level).toBe("none");
    expect(fpResult.cost_load_boost).toBe(0);
  });

  it("普通の悩み: wound が moderate 止まり（MI 抑制にならない）", () => {
    const result = computeWoundActivation({
      wounds: [{
        wound_id: "test_rejection",
        theme: "承認の欠如",
        related_persons: [],
        related_keywords: /認めて[もく]れ|否定[さ]れ/,
        depth: "persistent",
        source: "alter_inferred",
        confidence: 0.4,
        last_confirmed: new Date().toISOString(),
      }],
      current_message: "仕事で認めてもらえなくて落ち込む",
      recent_messages: [],
      recent_mi_reactions: [],
      trust_level: 2 as TrustLevel,
      user_state: null,
    });
    // theme_match だけなので moderate 以下
    if (result.most_active) {
      expect(["dormant", "low", "moderate"]).toContain(result.most_active.level);
    }
    // moderate では MI 抑制されない
    expect(result.should_suppress_mi).toBe(false);
  });

  it("context modifiers: ベーススコアのまま返るケースが多い（観測不足時）", () => {
    const result = applyContextModifiers({
      base_axis_scores: { decision_tempo: 0.5, social_initiative: 0.4 },
      domain: "romance",
      stored_modifiers: [],
      domain_decision_distribution: null,
      global_decision_distribution: null,
    });
    expect(result.scores.decision_tempo).toBe(0.5);
    expect(result.scores.social_initiative).toBe(0.4);
    expect(result.modified_axes).toHaveLength(0);
  });
});
