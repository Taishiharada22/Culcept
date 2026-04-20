/**
 * Episodic Recall Phase 1 ユニットテスト
 *
 * テスト対象:
 *   1. Signal Detection — 想起シグナル検出（regex）
 *   2. Prompt Block — 想起ブロック構築（要約 / 具体 / 失敗）
 *   3. Ranking — セッションランキング（テーマ / 人物 / hooks）
 */

import { describe, it, expect, vi } from "vitest";

// ── server-only モック ──
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: { from: vi.fn() },
}));

import {
  detectEpisodicRecallSignal,
  buildRecallBlock,
  type SessionMatch,
  type CoreExchange,
} from "@/lib/stargazer/episodicRecall";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. Signal Detection
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("detectEpisodicRecallSignal", () => {
  // ── 検出すべきケース ──

  it.each([
    ["temporal: 昨日",        "昨日の話なんだけどさ",       "temporal",     "yesterday"],
    ["temporal: 一昨日",      "一昨日の話なんだけど",       "temporal",     "day_before"],
    ["temporal: 先週",        "先週話してた件",             "temporal",     "last_week"],
    ["temporal: この前",      "この前話した件で",           "temporal",     "recent"],
    ["temporal: 前回",        "前回聞いた話だけど",         "temporal",     "recent"],
    ["temporal: 前に話した",  "前に話した仕事の件",         "temporal",     "unspecified"],
    ["topic_ref: あの話",     "あの話の続きなんだけど",     "topic_ref",    "unspecified"],
    ["topic_ref: 何話した",   "何話したっけ昨日",           "topic_ref",    "yesterday"],
    ["topic_ref: 覚えてる",   "あれ覚えてる？",             "topic_ref",    "unspecified"],
    ["continuation: 続き",    "続きは何だっけ",             "continuation", "unspecified"],
    ["continuation: どうなった", "あれからどうなった？",     "continuation", "unspecified"],
    // 優先順位テスト: 複合シグナルでは topic_ref > continuation > temporal
    ["priority: 何話した+昨日→topic_ref",    "昨日何話したっけ？",       "topic_ref",    "yesterday"],
    ["priority: どうなった+この前→continuation", "この前のあれどうなった？", "continuation", "recent"],
    ["priority: 続き+前回→continuation",     "前回の続きだけど",         "continuation", "recent"],
  ] as const)("%s", async (_label, msg, expectedType, expectedTime) => {
    const result = await detectEpisodicRecallSignal(msg);
    expect(result.detected).toBe(true);
    expect(result.type).toBe(expectedType);
    expect(result.timeHint).toBe(expectedTime);
  });

  // ── 検出しないべきケース ──

  it.each([
    ["通常質問",   "今日の天気は？"],
    ["感情吐露",   "なんかもう疲れた"],
    ["判断相談",   "転職すべき？"],
    ["挨拶",       "おはよう"],
    ["短い返事",   "うん"],
    ["外部知識",   "NISAってどうやるの？"],
  ] as const)("検出しない: %s", async (_label, msg) => {
    const result = await detectEpisodicRecallSignal(msg);
    expect(result.detected).toBe(false);
  });

  // ── topicHint 抽出 ──

  it("topicHint: 「あの仕事の話」→ '仕事'", async () => {
    const r = await detectEpisodicRecallSignal("あの仕事の話なんだけど");
    expect(r.detected).toBe(true);
    expect(r.topicHint).toBe("仕事");
  });

  it("topicHint: 「その転職の件」→ '転職'", async () => {
    const r = await detectEpisodicRecallSignal("その転職の件って");
    expect(r.detected).toBe(true);
    expect(r.topicHint).toBe("転職");
  });

  // ── personHint 抽出 ──

  it("personHint: 「田中さんの話」→ '田中'", async () => {
    const r = await detectEpisodicRecallSignal("昨日の田中さんの話なんだけど");
    expect(r.detected).toBe(true);
    expect(r.personHint).toBe("田中");
  });

  it("personHint: 「上司の件」→ '上司'", async () => {
    const r = await detectEpisodicRecallSignal("前に話した上司の件");
    expect(r.detected).toBe(true);
    expect(r.personHint).toBe("上司");
  });

  // ── needsSpecificQuote ──

  it("具体想起: 「何て言ったっけ」→ needsSpecificQuote=true", async () => {
    const r = await detectEpisodicRecallSignal("昨日俺なんて言ったっけ？");
    expect(r.detected).toBe(true);
    expect(r.needsSpecificQuote).toBe(true);
  });

  it("要約想起: 「何話した？」→ needsSpecificQuote=false", async () => {
    const r = await detectEpisodicRecallSignal("昨日何話したっけ？");
    expect(r.detected).toBe(true);
    expect(r.needsSpecificQuote).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. Prompt Block Builder
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildRecallBlock", () => {
  const makeMatch = (overrides: Partial<SessionMatch> = {}): SessionMatch => ({
    sessionId: "test-session",
    date: "2026-04-15",
    keyThemes: ["転職", "キャリア"],
    emotionalArc: "guarded → open → reflective",
    deepestMoment: "本当はAI系に行きたいと告白",
    followUpHooks: ["年収の相場を調べる"],
    rawMessageCount: 8,
    relevanceScore: 1.0,
    ...overrides,
  });

  it("要約想起: マッチあり + 生ログなし → summary モード", async () => {
    const { block, mode } = await buildRecallBlock([makeMatch()], []);
    expect(mode).toBe("summary");
    expect(block).toContain("転職");
    expect(block).toContain("年収の相場を調べる");
    expect(block).toContain("データベース");
    expect(block).toContain("絶対に言わない");
  });

  it("具体想起: マッチあり + 生ログあり → specific モード", async () => {
    const exchanges: CoreExchange[] = [
      { role: "user", message: "AI系の会社に行きたいんだよね", turnNumber: 3 },
      { role: "alter", message: "なるほど、それはいい選択かもね", turnNumber: 4 },
    ];
    const { block, mode } = await buildRecallBlock([makeMatch()], exchanges);
    expect(mode).toBe("specific");
    expect(block).toContain("AI系の会社");
    expect(block).toContain("具体的なやりとり");
    expect(block).toContain("大意を自分の言葉で語る");
  });

  it("想起失敗: マッチなし → not_found モード（捏造禁止ガイダンス）", async () => {
    const { block, mode } = await buildRecallBlock([], []);
    expect(mode).toBe("not_found");
    expect(block).toContain("思い出せない");
    expect(block).toContain("捏造は絶対にしない");
    expect(block).toContain("いつ頃");
  });

  it("要約想起: follow_up_hooks が空でも動く", async () => {
    const match = makeMatch({ followUpHooks: [], deepestMoment: "" });
    const { block, mode } = await buildRecallBlock([match], []);
    expect(mode).toBe("summary");
    expect(block).toContain("転職");
  });

  it("具体想起: メッセージは150文字以内に切り詰め済み前提", async () => {
    const longMsg = "あ".repeat(200);
    const exchanges: CoreExchange[] = [
      { role: "user", message: longMsg.slice(0, 150), turnNumber: 1 },
    ];
    const { block } = await buildRecallBlock([makeMatch()], exchanges);
    // loadCoreExchanges で既に切り詰められる前提だが、block内にも収まるか確認
    expect(block.length).toBeLessThan(2000);
  });

  it("複数セッションマッチ時、全て含まれる", async () => {
    const matches = [
      makeMatch({ date: "2026-04-15", keyThemes: ["転職"] }),
      makeMatch({ date: "2026-04-14", keyThemes: ["副業"] }),
    ];
    const { block } = await buildRecallBlock(matches, []);
    expect(block).toContain("2026-04-15");
    expect(block).toContain("2026-04-14");
    expect(block).toContain("転職");
    expect(block).toContain("副業");
  });
});
