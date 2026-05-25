/**
 * Phase 3-N Plan P2 Step 2 v3.1 — alterNote prompt builder V2 contract test
 *
 * 検証範囲 (= readiness v3.1 §3 + §4 + GPT 「層を分けたまま」 補正):
 *   - buildSystemPromptV2: base + PM 3 層 + framing + Output Contract V2 統合
 *   - 各 layer (= Stable / Recent / Contextual) を **別 section** に注入
 *   - undefined field は出力しない (= token 節約 + safe degrade)
 *   - PM 未注入時 (= pm undefined) は V1 base 文体規約 + Output Contract のみ
 *   - Phase framing hint を勘案
 *
 * 不変原則:
 *   - pure (= LLM 呼ばない、 入力 mutate なし)
 */

import { describe, it, expect } from "vitest";

import {
  buildSystemPromptV2,
  buildUserPromptV2,
  buildAlterNotePromptV2,
  ALTER_NOTE_JSON_SCHEMA_V2,
} from "@/lib/plan/llm/alterNotePromptBuilderV2";
import type { AlterNoteContext, PersonalModelV2 } from "@/lib/plan/llm/types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Sample PM V2 + ctx
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const FULL_PM: PersonalModelV2 = {
  stable: {
    judgmentMode: "集中型",
    timePreference: "朝強い",
    traitTone: "ひとり静か",
    archetype: "賢者型",
  },
  recent: {
    innerWeather: "穏やか",
    recentRhythm: "深い集中続き",
    stressLoad: "中",
  },
  contextual: {
    similarDayRecall: "先週金曜と類似",
    pastSelfDelta: "1 ヶ月前と差なし",
  },
  meta: {
    hdmPhase: 4,
    trustLevel: 4,
    observationCompleteness: 1.0,
  },
};

const STABLE_ONLY_PM: PersonalModelV2 = {
  stable: {
    judgmentMode: "中庸型",
    timePreference: "朝強い",
  },
  meta: { hdmPhase: 2, trustLevel: 3, observationCompleteness: 0.8 },
};

const META_ONLY_PM: PersonalModelV2 = {
  meta: { hdmPhase: 0, trustLevel: 0, observationCompleteness: 0 },
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// buildSystemPromptV2: base 文体規約
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildSystemPromptV2: base 文体規約 (= PM 未指定でも含む)", () => {
  it("「観測的な意味文」 を含む", () => {
    const sys = buildSystemPromptV2();
    expect(sys).toContain("観測的な意味文");
  });

  it("8〜30 字規定を含む (= Output Contract V2 promptInstruction 経由)", () => {
    const sys = buildSystemPromptV2();
    expect(sys).toContain("8〜30");
  });

  it("禁止語 (= 最適化 / 推奨 / 警告 等) を含む", () => {
    const sys = buildSystemPromptV2();
    expect(sys).toContain("おすすめ");
    expect(sys).toContain("最適化");
  });

  it("JSON 出力指示を含む", () => {
    const sys = buildSystemPromptV2();
    expect(sys).toContain("JSON");
  });

  // v3.2 Patch A: profile vs anchor 衝突優先 rule
  it("v3.2 Patch A: profile vs anchor 衝突優先 rule を含む", () => {
    const sys = buildSystemPromptV2();
    expect(sys).toContain("衝突優先 rule");
    expect(sys).toContain("profile を優先");
    expect(sys).toContain("reframe");
  });

  // v3.2 Patch C: few-shot examples (= profile 差のみ、 文体バラけ)
  it("v3.2 Patch C: 4 profile 差 few-shot examples を含む", () => {
    const sys = buildSystemPromptV2();
    expect(sys).toContain("Profile 差を立てる例");
    expect(sys).toContain("P1");
    expect(sys).toContain("P2");
    expect(sys).toContain("P3");
    expect(sys).toContain("P4");
    expect(sys).toContain("文体見本集ではありません");
  });

  it("v3.2 Patch C: 文体寄せすぎ禁止指示を含む", () => {
    const sys = buildSystemPromptV2();
    expect(sys).toContain("句読点・長さ・韻律・言い回し");
    expect(sys).toContain("テンプレ感");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// buildSystemPromptV2: PM 層を分けたまま注入 (= GPT 「雑に混ぜない」)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildSystemPromptV2: 層を分けたまま注入", () => {
  it("FULL_PM (= Phase 4) → 3 section 別々に含む", () => {
    const sys = buildSystemPromptV2(FULL_PM, "deep_personal_framing");
    expect(sys).toContain("Stable layer");
    expect(sys).toContain("Recent layer");
    expect(sys).toContain("Contextual layer");
  });

  it("Stable section に judgmentMode / timePreference 含む", () => {
    const sys = buildSystemPromptV2(FULL_PM, "deep_personal_framing");
    expect(sys).toContain("集中型");
    expect(sys).toContain("朝強い");
    expect(sys).toContain("ひとり静か");
    expect(sys).toContain("賢者型");
  });

  it("Recent section に直近状態含む", () => {
    const sys = buildSystemPromptV2(FULL_PM, "deep_personal_framing");
    expect(sys).toContain("穏やか");
    expect(sys).toContain("深い集中続き");
  });

  it("Contextual section に similarDayRecall 含む", () => {
    const sys = buildSystemPromptV2(FULL_PM, "deep_personal_framing");
    expect(sys).toContain("先週金曜と類似");
  });

  it("STABLE_ONLY_PM (= Phase 2 想定) → stable のみ含む", () => {
    const sys = buildSystemPromptV2(STABLE_ONLY_PM, "soft_personal_with_hedge");
    expect(sys).toContain("Stable layer");
    expect(sys).toContain("中庸型");
    expect(sys).not.toContain("Recent layer");
    expect(sys).not.toContain("Contextual layer");
  });

  it("META_ONLY_PM → 3 section いずれも含まない (= 個別化 skip)", () => {
    const sys = buildSystemPromptV2(META_ONLY_PM, "no_personal_framing");
    expect(sys).not.toContain("Stable layer");
    expect(sys).not.toContain("Recent layer");
    expect(sys).not.toContain("Contextual layer");
  });

  it("PM undefined → V1 等価動作 (= safe degrade)", () => {
    const sysNoPM = buildSystemPromptV2();
    const sysMetaOnly = buildSystemPromptV2(META_ONLY_PM);
    // どちらも 3 section の string 不在
    expect(sysNoPM).not.toContain("Stable layer");
    expect(sysMetaOnly).not.toContain("Stable layer");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// buildSystemPromptV2: Phase 別 framing
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildSystemPromptV2: Phase 別 framing", () => {
  it("no_personal_framing → 「あなた」 主語禁止 指示", () => {
    const sys = buildSystemPromptV2(FULL_PM, "no_personal_framing");
    expect(sys).toContain("Phase 0-1");
    expect(sys).toContain("主語を使わない");
  });

  it("soft_personal_with_hedge → hedging 強指示", () => {
    const sys = buildSystemPromptV2(FULL_PM, "soft_personal_with_hedge");
    expect(sys).toContain("Phase 2");
    expect(sys).toContain("hedging 強");
  });

  it("moderate_personal → hedging 弱化指示", () => {
    const sys = buildSystemPromptV2(FULL_PM, "moderate_personal");
    expect(sys).toContain("Phase 3");
  });

  it("deep_personal_framing → 「あなたの軸では」 解禁", () => {
    const sys = buildSystemPromptV2(FULL_PM, "deep_personal_framing");
    expect(sys).toContain("Phase 4-5");
    expect(sys).toContain("あなたの軸では");
  });

  // v3.2 Patch B: 内部指示強化、 表層テンプレ化禁止
  it("v3.2 Patch B: moderate_personal で profile 内容反映の重要指示を含む", () => {
    const sys = buildSystemPromptV2(FULL_PM, "moderate_personal");
    expect(sys).toContain("文の内容そのもの");
    expect(sys).toContain("profile らしさが滲む表現");
  });

  it("v3.2 Patch B: deep_personal_framing で表層語句固定禁止指示を含む", () => {
    const sys = buildSystemPromptV2(FULL_PM, "deep_personal_framing");
    expect(sys).toContain("毎回使う必要はない");
    expect(sys).toContain("テンプレ感を生む");
  });

  // v3.2 Patch D: 中庸 profile 状態語ヒント (= 詩的化注意)
  it("v3.2 Patch D: 中庸 profile 状態語ヒントを Stable layer に含む", () => {
    const sys = buildSystemPromptV2(STABLE_ONLY_PM, "soft_personal_with_hedge");
    expect(sys).toContain("中庸 profile 対策");
    expect(sys).toContain("リズム");
    expect(sys).toContain("整え");
    expect(sys).toContain("ペース");
  });

  it("v3.2 Patch D: 詩的化注意 (= 「リズムの調べ」 等の比喩禁止) を含む", () => {
    const sys = buildSystemPromptV2(STABLE_ONLY_PM, "soft_personal_with_hedge");
    expect(sys).toContain("詩的にしすぎない");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// v3.4: prompt 強化 (= judgmentMode 解釈動詞 / anchor 焼き直し抑制 / 中庸 補助)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildSystemPromptV2: v3.4 prompt 強化", () => {
  // Patch I: judgmentMode 別 解釈動詞 vocabulary mapping
  it("v3.4 Patch I: judgmentMode=集中型 → 解釈動詞 「深める / 沈む / 没頭」 を含む", () => {
    const pm: PersonalModelV2 = {
      stable: { judgmentMode: "集中型", timePreference: "中庸" },
      meta: { hdmPhase: 2, trustLevel: 2, observationCompleteness: 0.5 },
    };
    const sys = buildSystemPromptV2(pm, "soft_personal_with_hedge");
    expect(sys).toContain("解釈の向き hint");
    expect(sys).toContain("深める");
    expect(sys).toContain("沈む");
    expect(sys).toContain("没頭");
    expect(sys).toContain("潜らせる");
  });

  it("v3.4 Patch I: judgmentMode=分散型 → 「広げる / 触れる / つなぐ」 を含む", () => {
    const pm: PersonalModelV2 = {
      stable: { judgmentMode: "分散型" },
      meta: { hdmPhase: 2, trustLevel: 2, observationCompleteness: 0.5 },
    };
    const sys = buildSystemPromptV2(pm, "soft_personal_with_hedge");
    expect(sys).toContain("広げる");
    expect(sys).toContain("触れる");
    expect(sys).toContain("つなぐ");
  });

  it("v3.4 Patch I: judgmentMode=関係エネルギー型 → 「対話 / 交わる / 響き合う」 を含む", () => {
    const pm: PersonalModelV2 = {
      stable: { judgmentMode: "関係エネルギー型" },
      meta: { hdmPhase: 2, trustLevel: 2, observationCompleteness: 0.5 },
    };
    const sys = buildSystemPromptV2(pm, "soft_personal_with_hedge");
    expect(sys).toContain("対話");
    expect(sys).toContain("交わる");
    expect(sys).toContain("響き合う");
  });

  it("v3.4 Patch I: 「使え」 ではなく 「例」 framing (= テンプレ化禁止)", () => {
    const pm: PersonalModelV2 = {
      stable: { judgmentMode: "集中型" },
      meta: { hdmPhase: 2, trustLevel: 2, observationCompleteness: 0.5 },
    };
    const sys = buildSystemPromptV2(pm, "soft_personal_with_hedge");
    expect(sys).toContain("テンプレ化禁止");
    expect(sys).toContain("anchor 文脈に応じて選択 / 派生");
  });

  it("v3.4 Patch I: 「静か」 等の雰囲気語のみで終わらせない注意", () => {
    const pm: PersonalModelV2 = {
      stable: { judgmentMode: "集中型" },
      meta: { hdmPhase: 2, trustLevel: 2, observationCompleteness: 0.5 },
    };
    const sys = buildSystemPromptV2(pm, "soft_personal_with_hedge");
    expect(sys).toContain("「静か」 等の雰囲気語のみで終わらせない");
  });

  // Patch II: anchor 事実焼き直し禁止
  it("v3.4 Patch II: anchor 事実の焼き直し禁止指示を含む", () => {
    const sys = buildSystemPromptV2();
    expect(sys).toContain("anchor 事実の焼き直し禁止");
    expect(sys).toContain("連続して");
  });

  it("v3.4 Patch II: 禁止例 「読書 19:00 カフェ → 夜のカフェで静かに読書する時間」 を含む", () => {
    const sys = buildSystemPromptV2();
    // 実 Phase 6 smoke で観測した failure pattern を明示
    expect(sys).toContain("夜のカフェで静かに読書する時間");
  });

  it("v3.4 Patch II: anchor 要素 3 語以上連続並列の禁止指示を含む", () => {
    const sys = buildSystemPromptV2();
    expect(sys).toContain("anchor 要素 3 語以上の連続並列");
  });

  // Patch III: timePreference=中庸 補助化
  it("v3.4 Patch III: timePreference=中庸 → 「時間帯に左右されない、 偏向押し付け禁止、 主役にしない」 framing", () => {
    const pm: PersonalModelV2 = {
      stable: { judgmentMode: "集中型", timePreference: "中庸" },
      meta: { hdmPhase: 2, trustLevel: 2, observationCompleteness: 0.5 },
    };
    const sys = buildSystemPromptV2(pm, "soft_personal_with_hedge");
    expect(sys).toContain("時刻偏好: 中庸");
    expect(sys).toContain("時間帯に左右されない");
    expect(sys).toContain("主役にしない");
  });

  it("v3.4 Patch III: timePreference=朝強い はそのまま (= 中庸 のみ補助化)", () => {
    const pm: PersonalModelV2 = {
      stable: { judgmentMode: "集中型", timePreference: "朝強い" },
      meta: { hdmPhase: 2, trustLevel: 2, observationCompleteness: 0.5 },
    };
    const sys = buildSystemPromptV2(pm, "soft_personal_with_hedge");
    expect(sys).toContain("時刻偏好: 朝強い");
    expect(sys).not.toContain("時刻偏好: 朝強い (= 時間帯");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// v3.4.1 micro patch: 自然な日本語に寄せる (= CEO + GPT 2026-05-25 spot check 後)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildSystemPromptV2: v3.4.1 自然な日本語 micro patch", () => {
  // Patch 1: 説明的名詞句終わり 禁止
  it("v3.4.1 Patch 1: 「〜の時間 / 〜する時間 / 〜ための準備」 禁止指示を含む", () => {
    const sys = buildSystemPromptV2();
    expect(sys).toContain("説明的な名詞句終わりは原則禁止");
    expect(sys).toContain("〜の時間");
    expect(sys).toContain("〜する時間");
    expect(sys).toContain("〜ための準備");
  });

  it("v3.4.1 Patch 1: 悪い例に Phase 6 で観測した failure pattern を明示", () => {
    const sys = buildSystemPromptV2();
    expect(sys).toContain("夜のカフェ、 思考を潜らせる時間");
    expect(sys).toContain("朝の自宅、 思考を潜らせるための準備");
    expect(sys).toContain("午前のオフィス、 思考を深める会議の時間");
  });

  // Patch 2: 自然な hedging
  it("v3.4.1 Patch 2: 自然 hedging (= 〜そう / 〜やすそう / 〜られそう) を推奨", () => {
    const sys = buildSystemPromptV2();
    expect(sys).toContain("自然な hedging で終える");
    expect(sys).toContain("〜そうです");
    expect(sys).toContain("〜やすそう");
    expect(sys).toContain("〜られそう");
  });

  it("v3.4.1 Patch 2: 良い例に 自然 hedging 文を含む", () => {
    const sys = buildSystemPromptV2();
    expect(sys).toContain("夕方のカフェなら、 学びに静かに沈めそうです");
    expect(sys).toContain("夜のカフェだと、 ひとりで没頭しやすそう");
  });

  // Patch 3: 同名詞反復禁止
  it("v3.4.1 Patch 3: 同じ名詞 (= 「思考」 等) 多用しない指示を含む", () => {
    const sys = buildSystemPromptV2();
    expect(sys).toContain("同じ名詞");
    expect(sys).toContain("「思考」");
    expect(sys).toContain("多用しない");
  });

  it("v3.4.1 Patch 3: 別名詞 (= 自分 / 内側 / 場面 / ひととき / 静けさ) との組合せ余地を示す", () => {
    const sys = buildSystemPromptV2();
    expect(sys).toContain("自分");
    expect(sys).toContain("内側");
    expect(sys).toContain("ひととき");
  });

  // Profile 別 few-shot 更新確認 (= 「〜時間」 消去)
  it("v3.4.1: P1 few-shot 例が 「〜時間」 を含まず 「〜られそう」 になっている", () => {
    const sys = buildSystemPromptV2();
    expect(sys).toContain("朝のスタバなら、 静かに一日を始められそう");
    expect(sys).not.toContain("朝のスタバで、 静かに一日を始める");
  });

  it("v3.4.1: P2 few-shot 例が 「〜時間」 を含まず 「〜そうです」 になっている", () => {
    const sys = buildSystemPromptV2();
    expect(sys).toContain("朝のカフェなら、 対話から活力を受け取れそうです");
    expect(sys).not.toContain("活力を得る時間");
  });

  it("v3.4.1: P4 few-shot 例から 「〜時間」 ではなく 「〜そう」 hedging を含む", () => {
    const sys = buildSystemPromptV2();
    expect(sys).toContain("朝の自宅で、 リズムが整っていきそう");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// buildUserPromptV2
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildUserPromptV2", () => {
  it("category / time tag を含む (= V1 と等価)", () => {
    const ctx: AlterNoteContext = { category: "cafe", startTime: "09:00" };
    const u = buildUserPromptV2(ctx);
    expect(u).toContain("カテゴリ:");
    expect(u).toContain("カフェ");
    expect(u).toContain("時刻帯:");
    expect(u).toContain("朝");
  });

  it("title / location undefined なら tag 出さない", () => {
    const ctx: AlterNoteContext = { category: "home", startTime: "20:00" };
    const u = buildUserPromptV2(ctx);
    expect(u).not.toContain("予定タイトル:");
    expect(u).not.toContain("場所:");
  });

  it("末尾に Output Contract 言及あり (= V2 では PM 踏まえる指示)", () => {
    const ctx: AlterNoteContext = { category: "cafe", startTime: "09:00" };
    const u = buildUserPromptV2(ctx);
    expect(u).toContain("Personal Model");
    expect(u).toContain("出力契約");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 統合 builder
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildAlterNotePromptV2 (= 統合 entry)", () => {
  it("system + user prompt 統合", () => {
    const ctx: AlterNoteContext = {
      category: "cafe",
      startTime: "09:00",
      personalModelV2: FULL_PM,
    };
    const { systemPrompt, userPrompt } = buildAlterNotePromptV2(ctx, "deep_personal_framing");
    expect(systemPrompt).toContain("Stable layer");
    expect(userPrompt).toContain("カテゴリ:");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// JSON schema
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("ALTER_NOTE_JSON_SCHEMA_V2", () => {
  it("text field のみ + required + additionalProperties false", () => {
    expect(ALTER_NOTE_JSON_SCHEMA_V2.type).toBe("object");
    expect(ALTER_NOTE_JSON_SCHEMA_V2.required).toEqual(["text"]);
    expect(ALTER_NOTE_JSON_SCHEMA_V2.additionalProperties).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 純粋性
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildSystemPromptV2: pure", () => {
  it("同入力 → 同出力", () => {
    expect(buildSystemPromptV2(FULL_PM, "deep_personal_framing")).toBe(
      buildSystemPromptV2(FULL_PM, "deep_personal_framing"),
    );
  });

  it("入力 mutate なし", () => {
    const snapshot = JSON.stringify(FULL_PM);
    buildSystemPromptV2(FULL_PM, "deep_personal_framing");
    expect(JSON.stringify(FULL_PM)).toBe(snapshot);
  });
});
