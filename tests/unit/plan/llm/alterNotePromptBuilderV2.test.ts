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
