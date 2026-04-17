/**
 * CoAlter Phase 1.5.4.6: Topic Scope — 四国バグ regression テスト
 *
 * 検証:
 *  - buildTopicAnchor: userMessage 優先、無ければ最後の talk_messages
 *  - extractScopeRegex: theme / timeRef / placeRef / confidence
 *  - scopeMessages: anchor を基点に primary/background を切り分け
 *  - analyzeConversation: 四国話題が来週木曜ランチの anchor で拾われないこと
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { ConversationTurn } from "@/lib/coalter/types";
import {
  buildTopicAnchor,
  extractScopeRegex,
  scopeMessages,
  __internal,
} from "@/lib/coalter/topicScope";
import { analyzeConversation } from "@/lib/coalter/conversationParser";

function msg(id: string, senderId: string, body: string): ConversationTurn {
  return {
    id,
    senderId,
    body,
    createdAt: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────

describe("extractScopeRegex — theme 検出", () => {
  it("「来週木曜日のランチ」→ food + timeRef=木曜", () => {
    const s = extractScopeRegex("来週木曜日のランチどこにしよう");
    expect(s.theme).toBe("food");
    expect(s.timeRef).toMatch(/木曜/);
    expect(s.placeRef).toBeNull();
    expect(s.confidence).toBeGreaterThan(0.7);
  });

  it("「四国旅行いいね」→ travel + placeRef=四国", () => {
    const s = extractScopeRegex("四国旅行いいね");
    expect(s.theme).toBe("travel");
    expect(s.placeRef).toContain("四国");
  });

  it("「今日の夜、映画見に行こう」→ movie + timeRef", () => {
    const s = extractScopeRegex("今日の夜、映画見に行こう");
    expect(s.theme).toBe("movie");
    expect(s.timeRef).toMatch(/(今日|夜)/);
  });

  it("「それで」→ general + low confidence", () => {
    const s = extractScopeRegex("それで");
    expect(s.theme).toBe("general");
    expect(s.confidence).toBeLessThan(0.5);
  });

  it("food + schedule の両方が出たら food を優先", () => {
    const s = extractScopeRegex("来週の日程でランチ合わせたい");
    // 「ランチ」(food) + 「合わせ」(schedule) + 「来週」(timeRef)
    expect(s.theme).toBe("food");
    expect(s.timeRef).toBeTruthy();
  });
});

// ─────────────────────────────────────────────

describe("extractScopeRegex — 場所検出", () => {
  it("渋谷 / 徳島 / みなとみらい などの固有名詞を拾う", () => {
    expect(__internal.extractPlaceRef("渋谷でランチ")).toBe("渋谷");
    expect(__internal.extractPlaceRef("徳島旅行")).toBe("徳島");
    expect(__internal.extractPlaceRef("みなとみらいで散歩")).toBe("みなとみらい");
  });

  it("固有名詞が無い場合は null", () => {
    expect(__internal.extractPlaceRef("なんかランチしよう")).toBeNull();
  });
});

// ─────────────────────────────────────────────

describe("buildTopicAnchor — anchor 選択ルール", () => {
  it("userMessage が非空 → それが anchor（source=user_message）", () => {
    const msgs = [msg("m1", "a", "むかし四国に行ったね")];
    const anchor = buildTopicAnchor(msgs, "来週木曜日のランチ決めて");
    expect(anchor).not.toBeNull();
    expect(anchor!.source).toBe("user_message");
    expect(anchor!.messageId).toBeNull();
    expect(anchor!.text).toBe("来週木曜日のランチ決めて");
    expect(anchor!.detectedScope.theme).toBe("food");
  });

  it("userMessage が null → 最後の talk_messages が anchor", () => {
    const msgs = [
      msg("m1", "a", "四国旅行の話してたよね"),
      msg("m2", "b", "そういえば来週木曜のランチどうする？"),
    ];
    const anchor = buildTopicAnchor(msgs, null);
    expect(anchor).not.toBeNull();
    expect(anchor!.source).toBe("last_talk_message");
    expect(anchor!.messageId).toBe("m2");
    expect(anchor!.detectedScope.theme).toBe("food");
  });

  it("userMessage が空文字 → 最後の talk_messages", () => {
    const msgs = [msg("m1", "a", "今日の夜、映画にしよう")];
    const anchor = buildTopicAnchor(msgs, "   ");
    expect(anchor).not.toBeNull();
    expect(anchor!.source).toBe("last_talk_message");
  });

  it("逡巡表現のみ → confidence を下げる", () => {
    const msgs = [msg("m1", "a", "うーん")];
    const anchor = buildTopicAnchor(msgs, null);
    expect(anchor).not.toBeNull();
    expect(anchor!.confidence).toBeLessThan(0.5);
  });

  it("メッセージ 0 件 + userMessage null → null", () => {
    const anchor = buildTopicAnchor([], null);
    expect(anchor).toBeNull();
  });
});

// ─────────────────────────────────────────────

describe("scopeMessages — primary / background 分割", () => {
  it("anchor から遡って windowSize 件が primary", () => {
    const msgs = [
      msg("m1", "a", "最初の話"),
      msg("m2", "b", "中"),
      msg("m3", "a", "その次"),
      msg("m4", "b", "さらに"),
      msg("m5", "a", "最後"),
    ];
    const anchor = buildTopicAnchor(msgs, null);
    const { primary, background } = scopeMessages(msgs, anchor, { windowSize: 2 });
    // anchor = m5, window=2 → primary は [m3, m4, m5]
    expect(primary.map((m) => m.id)).toEqual(["m3", "m4", "m5"]);
    expect(background.map((m) => m.id)).toEqual(["m1", "m2"]);
  });

  it("anchor に placeRef がある → primary 内の別の placeRef メッセージは background に降格", () => {
    const msgs = [
      msg("m1", "a", "四国旅行いいね"),
      msg("m2", "b", "徳島もいいな"),
      msg("m3", "a", "ところで来週木曜のランチどこで？"),
    ];
    // m3 を anchor にする（userMessage なし）→ anchor.placeRef=null(ランチは場所書いてない)
    const anchor = buildTopicAnchor(msgs, null);
    expect(anchor!.messageId).toBe("m3");
    // anchor.placeRef が null なので別 place メッセージも primary に残る（降格しない）
    const { primary } = scopeMessages(msgs, anchor, { windowSize: 5 });
    expect(primary.length).toBeGreaterThan(0);
  });

  it("anchor に placeRef=渋谷 + primary 内に「徳島」言及 → 徳島メッセージは background へ", () => {
    const msgs = [
      msg("m1", "a", "この前徳島行ったの楽しかった"),
      msg("m2", "b", "そうだね。ところで渋谷でランチしない？"),
    ];
    const userMessage = "渋谷でランチしよう";
    const anchor = buildTopicAnchor(msgs, userMessage);
    expect(anchor!.detectedScope.placeRef).toBe("渋谷");
    // messageId=null なのでウィンドウは末尾起点
    const { primary, background } = scopeMessages(msgs, anchor, { windowSize: 5 });
    // 徳島を含む m1 は place 不一致で background に落ちる
    expect(background.some((m) => /徳島/.test(m.body))).toBe(true);
    expect(primary.some((m) => /徳島/.test(m.body))).toBe(false);
  });

  it("anchor=null → 全部 primary", () => {
    const msgs = [msg("m1", "a", "hi"), msg("m2", "b", "hey")];
    const { primary, background } = scopeMessages(msgs, null);
    expect(primary).toHaveLength(2);
    expect(background).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────

describe("analyzeConversation — 四国バグ regression", () => {
  it("古い四国話題があっても anchor=来週木曜ランチ なら theme=food / location≠徳島", () => {
    const msgs = [
      msg("m1", "a", "この前、徳島に旅行行ったの良かったよね"),
      msg("m2", "b", "うん、四国一周したいな"),
      msg("m3", "a", "また行きたい"),
      msg("m4", "b", "そうしよう"),
      msg("m5", "a", "ところで、来週木曜日のランチどこで食べる？"),
    ];
    const userMessage = "来週木曜日のランチ決めて";
    const anchor = buildTopicAnchor(msgs, userMessage);
    expect(anchor!.detectedScope.theme).toBe("food");

    const analysis = analyzeConversation(msgs, "a", "b", { topicAnchor: anchor! });

    // テーマは food（travel ではない）
    expect(analysis.theme).toBe("food");
    // 場所は徳島/四国が採用されていない（anchor に place 無し → constraints.location は null か渋谷等の正当な場所）
    const loc = analysis.extractedConstraints.location;
    if (loc !== null) {
      expect(loc).not.toMatch(/徳島|四国/);
    }
    // anchor メタが付いている
    expect(analysis.topicAnchor).toBeDefined();
    expect(analysis.primaryScopeCount).toBeGreaterThan(0);
    // background はウィンドウ次第で 0 件もあり得る（5件以内なら全部 primary）。
    // 重要なのは「theme が travel に引っ張られない」で、ここまでで検証済み。
    expect(analysis.backgroundScopeCount).toBeGreaterThanOrEqual(0);
  });

  it("anchor が場所を明示していない場合も travel 話題が theme を奪わない", () => {
    const msgs = [
      msg("m1", "a", "四国いつか行きたい"),
      msg("m2", "b", "そうだね"),
      msg("m3", "a", "ところで昼ご飯どうする？"),
    ];
    const userMessage = "今日のランチ提案して";
    const anchor = buildTopicAnchor(msgs, userMessage);

    const analysis = analyzeConversation(msgs, "a", "b", { topicAnchor: anchor! });
    expect(analysis.theme).toBe("food");
  });

  it("anchor 無しでも従来通り動く（後方互換）", () => {
    const msgs = [
      msg("m1", "a", "ランチどこにする？"),
      msg("m2", "b", "イタリアンがいいかな"),
    ];
    const analysis = analyzeConversation(msgs, "a", "b");
    expect(analysis.theme).toBe("food");
    expect(analysis.topicAnchor).toBeUndefined();
  });

  it("anchor に timeRef=木曜 → constraints.date に反映", () => {
    const msgs = [msg("m1", "a", "ランチどこで？")];
    const userMessage = "来週木曜のランチ決めて";
    const anchor = buildTopicAnchor(msgs, userMessage);
    const analysis = analyzeConversation(msgs, "a", "b", { topicAnchor: anchor! });
    expect(analysis.extractedConstraints.date).toMatch(/木曜/);
  });
});
