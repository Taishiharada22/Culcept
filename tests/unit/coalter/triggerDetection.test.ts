/**
 * CoAlter triggerDetection — Phase 1 境界固定テスト
 *
 * 確認:
 * - 映画・食事・予定で strong/soft が正しく発火
 * - 普通の雑談で none
 * - 除外条件で soft が抑制される
 */

import { describe, it, expect } from "vitest";
import {
  detectCoAlterTrigger,
  createButtonTrigger,
  type TriggerContext,
} from "@/lib/coalter/triggerDetection";

// ── デフォルトコンテキスト（全条件クリア） ──
const ENABLED_CTX: TriggerContext = {
  isEnabled: true,
  recentProposalWithin5Min: false,
  conversationTurnCount: 6,
  bothParticipated: true,
};

const DISABLED_CTX: TriggerContext = {
  isEnabled: false,
  recentProposalWithin5Min: false,
  conversationTurnCount: 6,
  bothParticipated: true,
};

describe("CoAlter triggerDetection", () => {
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Strong triggers
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe("strong: 明示メンション", () => {
    it("CoAlterを含むメッセージ → strong", () => {
      const r = detectCoAlterTrigger("CoAlter、映画決めて", ENABLED_CTX);
      expect(r.confidence).toBe("strong");
      expect(r.matchedPattern).toContain("coalter");
    });

    it("日本語メンション → strong", () => {
      const r = detectCoAlterTrigger("コオルター呼んで", ENABLED_CTX);
      expect(r.confidence).toBe("strong");
    });

    it("strong はコンテキスト無視（disabledでも発火）", () => {
      const r = detectCoAlterTrigger("CoAlter", DISABLED_CTX);
      expect(r.confidence).toBe("strong");
    });
  });

  describe("strong: ボタンタップ", () => {
    it("createButtonTrigger → strong", () => {
      const r = createButtonTrigger("映画決めて");
      expect(r.confidence).toBe("strong");
      expect(r.matchedPattern).toBe("button_tap");
    });

    it("メッセージなしでもstrong", () => {
      const r = createButtonTrigger(null);
      expect(r.confidence).toBe("strong");
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Soft triggers — 映画・食事・予定
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe("soft: 決定膠着パターン", () => {
    const softCases: [string, string][] = [
      ["何見る？", "what_to_do"],
      ["何食べよう", "what_to_do"],
      ["どこ行く？", "where_to_go"],
      ["どこにしよう", "where_to_go"],
      ["決まらないね", "cant_decide"],
      ["迷うなぁ", "hesitating"],
      ["候補ある？", "want_candidates"],
      ["おすすめ教えて", "want_recommendation"],
      ["何がいい？", "whats_good"],
      ["どうする？", "what_do_we_do"],
      ["どうしよう", "what_should_we_do"],
    ];

    it.each(softCases)("「%s」→ soft (%s)", (msg, expectedPattern) => {
      const r = detectCoAlterTrigger(msg, ENABLED_CTX);
      expect(r.confidence).toBe("soft");
      expect(r.matchedPattern).toBe(expectedPattern);
    });
  });

  describe("soft: 助け要求パターン", () => {
    it("誰か決めて → soft", () => {
      const r = detectCoAlterTrigger("誰か決めてよ", ENABLED_CTX);
      expect(r.confidence).toBe("soft");
    });

    it("もう任せる → soft", () => {
      const r = detectCoAlterTrigger("もう任せるわ", ENABLED_CTX);
      expect(r.confidence).toBe("soft");
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // None — 普通の雑談
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe("none: 雑談・日常会話", () => {
    const noneCases = [
      "おはよう",
      "今日は天気いいね",
      "仕事終わった！",
      "お疲れ〜",
      "了解、ありがとう",
      "笑",
      "ウケる",
      "明日早いんだよね",
      "最近忙しくて",
      "そうなんだ〜",
      "写真送るね",
    ];

    it.each(noneCases)("「%s」→ none", (msg) => {
      const r = detectCoAlterTrigger(msg, ENABLED_CTX);
      expect(r.confidence).toBe("none");
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 除外条件
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe("除外: soft が抑制される条件", () => {
    it("CoAlter未有効化 → none", () => {
      const r = detectCoAlterTrigger("何見る？", DISABLED_CTX);
      expect(r.confidence).toBe("none");
    });

    it("5分以内に提案済み → none", () => {
      const ctx: TriggerContext = {
        ...ENABLED_CTX,
        recentProposalWithin5Min: true,
      };
      const r = detectCoAlterTrigger("何見る？", ctx);
      expect(r.confidence).toBe("none");
    });

    it("片方しか発言していない → none", () => {
      const ctx: TriggerContext = {
        ...ENABLED_CTX,
        bothParticipated: false,
      };
      const r = detectCoAlterTrigger("何食べる？", ctx);
      expect(r.confidence).toBe("none");
    });

    it("会話が2ターン未満 → none", () => {
      const ctx: TriggerContext = {
        ...ENABLED_CTX,
        conversationTurnCount: 1,
      };
      const r = detectCoAlterTrigger("どこ行こう", ctx);
      expect(r.confidence).toBe("none");
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 拡散パターン（2ターン連続）
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe("soft: 拡散パターン（連続検出）", () => {
    it("うーん × 2ターン → soft", () => {
      const r = detectCoAlterTrigger("うーん", ENABLED_CTX, "うーん");
      expect(r.confidence).toBe("soft");
      expect(r.matchedPattern).toContain("consecutive");
    });

    it("うーん × 1ターンのみ → none", () => {
      const r = detectCoAlterTrigger("うーん", ENABLED_CTX);
      expect(r.confidence).toBe("none");
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 片側Alterとの非干渉
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe("片側Alter非干渉: Intent Translation用途に侵入しない", () => {
    const alterOnlyCases = [
      "この文章、強く見えるかな？",
      "これ送っていい？",
      "伝わるかな",
      "ちょっと冷たい？",
      "言い方キツい？",
    ];

    it.each(alterOnlyCases)("「%s」→ none（片側Alterの領域）", (msg) => {
      const r = detectCoAlterTrigger(msg, ENABLED_CTX);
      expect(r.confidence).toBe("none");
    });
  });
});
