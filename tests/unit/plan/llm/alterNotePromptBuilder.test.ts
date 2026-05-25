/**
 * Phase 3-N Plan P2 Step 1 — alterNote prompt builder contract test
 *
 * 検証範囲 (= pure module 契約固定):
 *   - system prompt が Aneurasync 文体規約を含む
 *   - user prompt が context tag 形式 (= カテゴリ / 時刻帯 / タイトル / 場所) を含む
 *   - title / location undefined 時は該当行 出さない (= prompt token 節約)
 *   - JSON schema は { text: string } only
 *   - pure (= 同 context → 同 prompt、 cache hit 期待)
 *
 * 不変原則:
 *   - LLM 呼び出さない (= mock 不要、 真の pure test)
 *   - 入力 mutate なし
 */

import { describe, it, expect } from "vitest";

import {
  buildSystemPrompt,
  buildUserPrompt,
  buildAlterNotePrompt,
  ALTER_NOTE_JSON_SCHEMA,
} from "@/lib/plan/llm/alterNotePromptBuilder";
import type { AlterNoteContext } from "@/lib/plan/llm/types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// System prompt
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildSystemPrompt (= Aneurasync 文体規約)", () => {
  const systemPrompt = buildSystemPrompt();

  it("8〜22 字 規定を含む", () => {
    expect(systemPrompt).toContain("8〜22");
  });

  it("「観測的な意味文」 を含む (= 観測者視点 framing)", () => {
    expect(systemPrompt).toContain("観測的な意味文");
  });

  it("禁止語規約 (= おすすめ / 推奨 / 警告 / リスク / 最適化) を含む", () => {
    // システムプロンプト内で禁止語を列挙していること
    expect(systemPrompt).toContain("おすすめ");
    expect(systemPrompt).toContain("推奨");
    expect(systemPrompt).toContain("警告");
    expect(systemPrompt).toContain("リスク");
    expect(systemPrompt).toContain("最適化");
  });

  it("強い命令形禁止 (= しなさい / すべき) を含む", () => {
    expect(systemPrompt).toContain("しなさい");
    expect(systemPrompt).toContain("すべき");
  });

  it("JSON 出力形式を含む (= { text: ... })", () => {
    expect(systemPrompt).toContain('"text"');
  });

  it("絵文字禁止を含む", () => {
    expect(systemPrompt).toContain("絵文字");
  });

  it("数値禁止を含む", () => {
    expect(systemPrompt).toContain("数値");
  });

  it("空文字 fallback (= 読めない時) を含む", () => {
    expect(systemPrompt).toContain("空文字");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// User prompt
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildUserPrompt (= context 構造化)", () => {
  it("category, time が必須 tag として含まれる", () => {
    const ctx: AlterNoteContext = {
      category: "cafe",
      startTime: "09:00",
    };
    const prompt = buildUserPrompt(ctx);
    expect(prompt).toContain("カテゴリ:");
    expect(prompt).toContain("カフェ");
    expect(prompt).toContain("時刻帯:");
    expect(prompt).toContain("09:00");
    expect(prompt).toContain("朝");
  });

  it("endTime あれば time tag に含む", () => {
    const ctx: AlterNoteContext = {
      category: "work",
      startTime: "10:00",
      endTime: "12:00",
    };
    const prompt = buildUserPrompt(ctx);
    expect(prompt).toContain("10:00-12:00");
  });

  it("title 指定なら tag に含む", () => {
    const ctx: AlterNoteContext = {
      category: "work",
      startTime: "14:00",
      title: "会議",
    };
    const prompt = buildUserPrompt(ctx);
    expect(prompt).toContain("予定タイトル:");
    expect(prompt).toContain("会議");
  });

  it("title undefined なら tag 行を出さない (= token 節約)", () => {
    const ctx: AlterNoteContext = {
      category: "cafe",
      startTime: "15:00",
    };
    const prompt = buildUserPrompt(ctx);
    expect(prompt).not.toContain("予定タイトル:");
  });

  it("location 指定なら tag に含む", () => {
    const ctx: AlterNoteContext = {
      category: "cafe",
      startTime: "09:00",
      location: "スタバ駅前店",
    };
    const prompt = buildUserPrompt(ctx);
    expect(prompt).toContain("場所:");
    expect(prompt).toContain("スタバ駅前店");
  });

  it("location undefined なら tag 行を出さない", () => {
    const ctx: AlterNoteContext = {
      category: "home",
      startTime: "20:00",
    };
    const prompt = buildUserPrompt(ctx);
    expect(prompt).not.toContain("場所:");
  });

  it("時刻帯 朝/昼/午後/夜/深夜 の境界が正しい", () => {
    expect(buildUserPrompt({ category: "cafe", startTime: "05:00" })).toContain("朝");
    expect(buildUserPrompt({ category: "cafe", startTime: "10:59" })).toContain("朝");
    expect(buildUserPrompt({ category: "meal", startTime: "11:00" })).toContain("昼");
    expect(buildUserPrompt({ category: "meal", startTime: "13:59" })).toContain("昼");
    expect(buildUserPrompt({ category: "work", startTime: "14:00" })).toContain("午後");
    expect(buildUserPrompt({ category: "work", startTime: "17:59" })).toContain("午後");
    expect(buildUserPrompt({ category: "meal", startTime: "18:00" })).toContain("夜");
    expect(buildUserPrompt({ category: "meal", startTime: "22:59" })).toContain("夜");
    expect(buildUserPrompt({ category: "home", startTime: "23:00" })).toContain("深夜");
    expect(buildUserPrompt({ category: "home", startTime: "03:00" })).toContain("深夜");
  });

  it("category 'other' のラベルは 「その他」", () => {
    const ctx: AlterNoteContext = {
      category: "other",
      startTime: "12:00",
    };
    const prompt = buildUserPrompt(ctx);
    expect(prompt).toContain("その他");
  });

  it("出力末尾に 「JSON で返してください」 指示が含まれる", () => {
    const prompt = buildUserPrompt({ category: "cafe", startTime: "09:00" });
    expect(prompt).toContain("JSON");
  });

  it("pure: 同 context → 同 prompt (= cache hit 期待)", () => {
    const ctx: AlterNoteContext = {
      category: "work",
      startTime: "10:00",
      endTime: "12:00",
      title: "会議",
      location: "オフィス",
    };
    expect(buildUserPrompt(ctx)).toBe(buildUserPrompt(ctx));
  });

  it("pure: 入力 mutate なし", () => {
    const ctx: AlterNoteContext = {
      category: "cafe",
      startTime: "09:00",
      title: "Original",
    };
    const snapshot = JSON.stringify(ctx);
    buildUserPrompt(ctx);
    expect(JSON.stringify(ctx)).toBe(snapshot);
  });

  it("Step 1: personalModel field は無視される (= 拡張余地のみ、 Step 2 で実装)", () => {
    const ctxWithoutPM: AlterNoteContext = {
      category: "cafe",
      startTime: "09:00",
    };
    const ctxWithPM: AlterNoteContext = {
      category: "cafe",
      startTime: "09:00",
      personalModel: {
        judgmentMode: "集中型",
        timePreference: "朝強い",
      },
    };
    // Step 1 では personalModel 注入していないので prompt は同一
    expect(buildUserPrompt(ctxWithoutPM)).toBe(buildUserPrompt(ctxWithPM));
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 統合 builder
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildAlterNotePrompt (= 統合 entry)", () => {
  it("system + user prompt を含む", () => {
    const ctx: AlterNoteContext = { category: "cafe", startTime: "09:00" };
    const { systemPrompt, userPrompt } = buildAlterNotePrompt(ctx);
    expect(systemPrompt).toBe(buildSystemPrompt());
    expect(userPrompt).toBe(buildUserPrompt(ctx));
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// JSON schema
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("ALTER_NOTE_JSON_SCHEMA (= runAI requireJson 用)", () => {
  it("object type", () => {
    expect(ALTER_NOTE_JSON_SCHEMA.type).toBe("object");
  });

  it("text field のみ (= additionalProperties false)", () => {
    expect(Object.keys(ALTER_NOTE_JSON_SCHEMA.properties)).toEqual(["text"]);
    expect(ALTER_NOTE_JSON_SCHEMA.additionalProperties).toBe(false);
  });

  it("text は required", () => {
    expect(ALTER_NOTE_JSON_SCHEMA.required).toEqual(["text"]);
  });

  it("text は string、 minLength 0 (= 空文字許可)、 maxLength 60 (= 余裕)", () => {
    expect(ALTER_NOTE_JSON_SCHEMA.properties.text.type).toBe("string");
    expect(ALTER_NOTE_JSON_SCHEMA.properties.text.minLength).toBe(0);
    expect(ALTER_NOTE_JSON_SCHEMA.properties.text.maxLength).toBe(60);
  });
});
