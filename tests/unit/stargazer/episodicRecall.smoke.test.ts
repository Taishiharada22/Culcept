/**
 * Episodic Recall — スモークテスト
 *
 * CEO 指定の3会話パターン + 安全性検証:
 *   S1. 「昨日何話したっけ？」→ 要約想起
 *   S2. 「昨日の田中さんの話なんだけど」→ 人物ヒント付き想起
 *   S3. 「前に俺なんて言ってた？」→ specific想起 or 正直に曖昧返答
 *
 * 確認事項:
 *   ✓ 通常会話で不要な想起が走らない
 *   ✓ 想起失敗時に捏造しない
 *   ✓ 具体引用が長すぎない
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── server-only / supabase モック ──
vi.mock("server-only", () => ({}));

// ── Supabase チェーンモック ──
// 各テストが .from → .select → .eq → ... → result を制御できるようにする
let mockQueryResult: { data: unknown[] | null; error: unknown } = { data: null, error: null };
let mockDialogueResult: { data: unknown[] | null; error: unknown } = { data: null, error: null };
let lastTableName = "";

const chainMock = () => {
  const chain: Record<string, unknown> = {};
  const methods = ["select", "eq", "gte", "lte", "order", "limit"];
  for (const m of methods) {
    chain[m] = vi.fn(() => chain);
  }
  // 終端: Promise-like に解決
  chain["then"] = (resolve: (v: unknown) => unknown) => {
    const result = lastTableName === "stargazer_alter_dialogues"
      ? mockDialogueResult
      : mockQueryResult;
    return Promise.resolve(result).then(resolve);
  };
  return chain;
};

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      lastTableName = table;
      return chainMock();
    }),
  },
}));

import {
  runEpisodicRecall,
  detectEpisodicRecallSignal,
  buildRecallBlock,
  type SessionMatch,
  type CoreExchange,
} from "@/lib/stargazer/episodicRecall";

// ── テストデータ ──

/** 昨日のセッション: 転職相談 */
const YESTERDAY_SESSION = {
  session_id: "sess-20260415-001",
  user_id: "user-test",
  summary_date: "2026-04-15",
  key_themes: ["転職", "キャリア", "田中さんとの関係"],
  contradictions_discovered: [],
  user_admissions: ["本当はAI系に行きたい"],
  resistance_points: [],
  emotional_arc: "慎重 → 打ち明け → 安堵",
  deepest_moment: "田中さんに相談できないと告白",
  follow_up_hooks: ["年収の相場を調べる", "田中さんに正直に話す"],
  raw_message_count: 12,
};

/** 昨日の生ログ（6ターン = 3往復） */
const YESTERDAY_DIALOGUES = [
  { role: "user", message: "最近転職考えてるんだよね", turn_number: 1 },
  { role: "alter", message: "おっ、何かきっかけあった？", turn_number: 2 },
  { role: "user", message: "田中さんに相談したいけどできなくて", turn_number: 3 },
  { role: "alter", message: "田中さんには言いづらい理由があるんだね", turn_number: 4 },
  { role: "user", message: "本当はAI系の会社に行きたいんだよね", turn_number: 5 },
  { role: "alter", message: "なるほど、それは大きな決断だね", turn_number: 6 },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// S1: 「昨日何話したっけ？」→ 要約想起
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("S1: 昨日何話したっけ？ → 要約想起", () => {
  beforeEach(() => {
    mockQueryResult = { data: [YESTERDAY_SESSION], error: null };
    mockDialogueResult = { data: null, error: null };
  });

  it("シグナル検出: topic_ref, timeHint=yesterday", async () => {
    const signal = await detectEpisodicRecallSignal("昨日何話したっけ？");
    expect(signal.detected).toBe(true);
    expect(signal.type).toBe("topic_ref");
    expect(signal.timeHint).toBe("yesterday");
    expect(signal.needsSpecificQuote).toBe(false);
  });

  it("runEpisodicRecall → mode=summary, テーマ含む", async () => {
    const result = await runEpisodicRecall("昨日何話したっけ？", "user-test");
    expect(result).not.toBeNull();
    expect(result!.mode).toBe("summary");
    expect(result!.matches.length).toBeGreaterThan(0);
    expect(result!.coreExchanges).toHaveLength(0); // 具体想起は不要
    // プロンプトにテーマが含まれる
    expect(result!.promptBlock).toContain("転職");
    expect(result!.promptBlock).toContain("キャリア");
    // follow_up_hooks が含まれる
    expect(result!.promptBlock).toContain("年収の相場を調べる");
  });

  it("プロンプトに捏造防止ガイダンスが含まれる", async () => {
    const result = await runEpisodicRecall("昨日何話したっけ？", "user-test");
    expect(result!.promptBlock).toContain("データベース");
    expect(result!.promptBlock).toContain("絶対に言わない");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// S2: 「昨日の田中さんの話なんだけど」→ 人物ヒント付き想起
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("S2: 昨日の田中さんの話なんだけど → 人物ヒント想起", () => {
  beforeEach(() => {
    mockQueryResult = { data: [YESTERDAY_SESSION], error: null };
    mockDialogueResult = { data: null, error: null };
  });

  it("シグナル検出: personHint=田中, timeHint=yesterday", async () => {
    const signal = await detectEpisodicRecallSignal("昨日の田中さんの話なんだけど");
    expect(signal.detected).toBe(true);
    expect(signal.personHint).toBe("田中");
    expect(signal.timeHint).toBe("yesterday");
  });

  it("人物名がランキングに影響 → 田中含むセッションが上位", async () => {
    const result = await runEpisodicRecall("昨日の田中さんの話なんだけど", "user-test");
    expect(result).not.toBeNull();
    expect(result!.matches.length).toBeGreaterThan(0);
    // 田中さんがセッションの deepest_moment に含まれるのでスコア加算される
    expect(result!.matches[0].relevanceScore).toBeGreaterThan(0.3); // 基礎0.3+人物0.9
    expect(result!.promptBlock).toContain("田中");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// S3: 「前に俺なんて言ってた？」→ specific想起
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("S3: 前に俺なんて言ってた？ → specific想起", () => {
  it("シグナル: needsSpecificQuote=true", async () => {
    const signal = await detectEpisodicRecallSignal("前に俺なんて言ってた？");
    expect(signal.detected).toBe(true);
    expect(signal.needsSpecificQuote).toBe(true);
  });

  it("セッション+生ログあり → mode=specific, 生ログ引用含む", async () => {
    mockQueryResult = { data: [YESTERDAY_SESSION], error: null };
    mockDialogueResult = { data: [...YESTERDAY_DIALOGUES].reverse(), error: null }; // DESC order

    const result = await runEpisodicRecall("前に俺なんて言ってた？", "user-test");
    expect(result).not.toBeNull();
    expect(result!.mode).toBe("specific");
    expect(result!.coreExchanges.length).toBeGreaterThan(0);
    expect(result!.coreExchanges.length).toBeLessThanOrEqual(6); // maxCoreTurns制約
    // 生ログブロックが含まれる
    expect(result!.promptBlock).toContain("具体的なやりとり");
    expect(result!.promptBlock).toContain("大意を自分の言葉で語る");
  });

  it("セッションあるが生ログなし → mode=summary（フォールバック）", async () => {
    mockQueryResult = { data: [YESTERDAY_SESSION], error: null };
    mockDialogueResult = { data: [], error: null };

    const result = await runEpisodicRecall("前に俺なんて言ってた？", "user-test");
    expect(result).not.toBeNull();
    // 生ログがないので summary にフォールバック
    expect(result!.mode).toBe("summary");
    expect(result!.coreExchanges).toHaveLength(0);
  });

  it("セッションも生ログもなし → mode=not_found, 正直に曖昧返答", async () => {
    mockQueryResult = { data: [], error: null };
    mockDialogueResult = { data: [], error: null };

    const result = await runEpisodicRecall("前に俺なんて言ってた？", "user-test");
    expect(result).not.toBeNull();
    expect(result!.mode).toBe("not_found");
    expect(result!.promptBlock).toContain("思い出せない");
    expect(result!.promptBlock).toContain("捏造は絶対にしない");
    expect(result!.promptBlock).toContain("いつ頃");
  });

  it("具体引用のメッセージは150文字以内に切り詰め", async () => {
    const longDialogues = [
      { role: "user", message: "あ".repeat(300), turn_number: 1 },
      { role: "alter", message: "い".repeat(300), turn_number: 2 },
    ];
    mockQueryResult = { data: [YESTERDAY_SESSION], error: null };
    mockDialogueResult = { data: longDialogues.reverse(), error: null };

    const result = await runEpisodicRecall("前に俺なんて言ってた？", "user-test");
    expect(result).not.toBeNull();
    for (const ex of result!.coreExchanges) {
      expect(ex.message.length).toBeLessThanOrEqual(150);
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 安全性: 通常会話で想起が走らない
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("通常会話で不要な想起が走らない", () => {
  it.each([
    "今日の天気は？",
    "なんかもう疲れた",
    "転職すべきかな",
    "おはよう",
    "うん",
    "NISAってどうやるの？",
    "最近調子どう？",
    "明日の予定教えて",
    "それは違うと思う",
    "ありがとう、助かった",
    "もう少し詳しく教えて",
    "つまりどういうこと？",
  ])("「%s」→ null（想起不発火）", async (msg) => {
    const result = await runEpisodicRecall(msg, "user-test");
    expect(result).toBeNull();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 安全性: プロンプトブロック長の上限
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("プロンプトブロックのサイズ安全性", () => {
  it("要約想起: 2000文字以内", async () => {
    const match: SessionMatch = {
      sessionId: "test",
      date: "2026-04-15",
      keyThemes: ["転職", "キャリア", "年収", "AI業界", "副業"],
      emotionalArc: "慎重 → 打ち明け → 安堵 → 決意",
      deepestMoment: "本当は今の会社が嫌いなわけじゃなく、成長が止まった気がすると告白",
      followUpHooks: ["年収の相場を調べる", "ポートフォリオを作る", "田中さんに相談する"],
      rawMessageCount: 20,
      relevanceScore: 1.0,
    };
    const { block } = await buildRecallBlock([match], []);
    expect(block.length).toBeLessThan(2000);
  });

  it("具体想起（6ターン×150文字上限）: 3000文字以内", async () => {
    const match: SessionMatch = {
      sessionId: "test",
      date: "2026-04-15",
      keyThemes: ["転職"],
      emotionalArc: "慎重 → 安堵",
      deepestMoment: "告白",
      followUpHooks: ["調べる"],
      rawMessageCount: 12,
      relevanceScore: 1.0,
    };
    const exchanges: CoreExchange[] = Array.from({ length: 6 }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "alter") as "user" | "alter",
      message: "あ".repeat(150), // 上限いっぱい
      turnNumber: i + 1,
    }));
    const { block } = await buildRecallBlock([match], exchanges);
    expect(block.length).toBeLessThan(3000);
  });

  it("not_found: 500文字以内", async () => {
    const { block } = await buildRecallBlock([], []);
    expect(block.length).toBeLessThan(500);
  });
});
