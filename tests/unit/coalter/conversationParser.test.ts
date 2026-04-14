/**
 * CoAlter conversationParser — テーマ検出・制約抽出テスト
 */

import { describe, it, expect } from "vitest";
import { analyzeConversation } from "@/lib/coalter/conversationParser";
import type { ConversationTurn } from "@/lib/coalter/types";

const USER_A = "user-a-id";
const USER_B = "user-b-id";

function turns(...messages: [string, string][]): ConversationTurn[] {
  return messages.map(([senderId, body], i) => ({
    senderId,
    body,
    createdAt: new Date(Date.now() - (messages.length - i) * 60000).toISOString(),
  }));
}

describe("conversationParser", () => {
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // テーマ検出
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe("テーマ検出", () => {
    it("映画の会話 → movie", () => {
      const msgs = turns(
        [USER_A, "今週末映画見に行かない？"],
        [USER_B, "いいね！何見る？"],
      );
      const r = analyzeConversation(msgs, USER_A, USER_B);
      expect(r.theme).toBe("movie");
    });

    it("食事の会話 → food", () => {
      const msgs = turns(
        [USER_A, "お昼何食べる？"],
        [USER_B, "ラーメンとかどう？"],
      );
      const r = analyzeConversation(msgs, USER_A, USER_B);
      expect(r.theme).toBe("food");
    });

    it("旅行の会話 → travel", () => {
      const msgs = turns(
        [USER_A, "GW旅行行きたいね"],
        [USER_B, "温泉いいかも！"],
      );
      const r = analyzeConversation(msgs, USER_A, USER_B);
      expect(r.theme).toBe("travel");
    });

    it("予定調整 → schedule", () => {
      const msgs = turns(
        [USER_A, "いつ会う？"],
        [USER_B, "予定合わせよう"],
      );
      const r = analyzeConversation(msgs, USER_A, USER_B);
      expect(r.theme).toBe("schedule");
    });

    it("雑談 → general", () => {
      const msgs = turns(
        [USER_A, "おはよう"],
        [USER_B, "おはよー！今日も頑張ろ"],
      );
      const r = analyzeConversation(msgs, USER_A, USER_B);
      expect(r.theme).toBe("general");
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 制約抽出
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe("制約抽出", () => {
    it("場所を抽出", () => {
      const msgs = turns([USER_A, "渋谷でご飯行こう"], [USER_B, "いいね"]);
      const r = analyzeConversation(msgs, USER_A, USER_B);
      expect(r.extractedConstraints.location).toBe("渋谷");
    });

    it("日時を抽出", () => {
      const msgs = turns([USER_A, "今週末何する？"], [USER_B, "映画見たい"]);
      const r = analyzeConversation(msgs, USER_A, USER_B);
      expect(r.extractedConstraints.date).toBe("今週末");
    });

    it("好みの傾向を抽出", () => {
      const msgs = turns(
        [USER_A, "静かなところがいいな"],
        [USER_B, "個室あるとこ探そう"],
      );
      const r = analyzeConversation(msgs, USER_A, USER_B);
      expect(r.extractedConstraints.preferences).toContain("静かな雰囲気");
      expect(r.extractedConstraints.preferences).toContain("個室希望");
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Caring Intensity
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe("Caring Intensity", () => {
    it("具体的な候補を出す方が高い", () => {
      const msgs = turns(
        [USER_A, "ミッションインポッシブルはどう？あと、ブレードランナーも気になる"],
        [USER_B, "うーん"],
      );
      const r = analyzeConversation(msgs, USER_A, USER_B);
      expect(r.caringIntensityA).toBeGreaterThan(r.caringIntensityB);
    });

    it("何でもいい → 低い", () => {
      const msgs = turns(
        [USER_A, "映画何見る？"],
        [USER_B, "何でもいいよ"],
      );
      const r = analyzeConversation(msgs, USER_A, USER_B);
      expect(r.caringIntensityB).toBeLessThan(0.5);
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 膠着検出
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe("膠着検出", () => {
    it("決まらない + 迷う → 膠着検出", () => {
      const msgs = turns(
        [USER_A, "何見る？"],
        [USER_B, "うーん、決まらないね"],
        [USER_A, "迷うよね"],
        [USER_B, "どうしよう"],
      );
      const r = analyzeConversation(msgs, USER_A, USER_B);
      expect(r.stalemate).not.toBeNull();
    });

    it("スムーズな会話 → 膠着なし", () => {
      const msgs = turns(
        [USER_A, "渋谷でイタリアン行こう"],
        [USER_B, "いいね！予約する？"],
      );
      const r = analyzeConversation(msgs, USER_A, USER_B);
      expect(r.stalemate).toBeNull();
    });
  });
});
