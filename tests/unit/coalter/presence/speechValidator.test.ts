/**
 * Stage 2 L2-m — speechValidator test
 *
 * plan v0.3 §5.13 Gate:
 *   - §2 共通禁止表現の検出
 *   - §1.2.1 6 項目 checker
 *   - LLM 呼び出し実装は Stage 4 に委譲 (本 phase で touch しない)
 */

import { describe, it, expect } from "vitest";

import {
  validateSpeechLexicon,
  validateQuestionCount,
  validateLength,
  validateSpeech,
} from "@/lib/coalter/presence/speechValidator";
import {
  DEFAULT_LENGTH_OVERRIDE,
  LENGTH_OVERRIDE_BY_VARIANT,
} from "@/lib/coalter/presence/speechTypes";
import { buildPresenceSpeech } from "@/lib/coalter/presence/speechBuilder";

// ─────────────────────────────────────────────
// §1.2.1 #1 裁定 (§2.2)
// ─────────────────────────────────────────────

describe("L2-m validateSpeechLexicon — §1.2.1 #1 裁定 (§2.2)", () => {
  it("「正しい」を検出", () => {
    const r = validateSpeechLexicon("Aさんが正しい");
    expect(r.ok).toBe(false);
    expect(r.violations[0].kind).toBe("judgmental");
  });

  it("「すべき」を検出", () => {
    expect(validateSpeechLexicon("こうすべきです").ok).toBe(false);
  });

  it("「普通は」を検出", () => {
    expect(validateSpeechLexicon("普通は〜").ok).toBe(false);
  });

  it("「正解」を検出", () => {
    expect(validateSpeechLexicon("それが正解です").ok).toBe(false);
  });
});

// ─────────────────────────────────────────────
// §1.2.1 #3 代弁 (§2.3)
// ─────────────────────────────────────────────

describe("L2-m validateSpeechLexicon — §1.2.1 #3 代弁 (§2.3)", () => {
  it("「と思っているはず」を検出", () => {
    const r = validateSpeechLexicon("Bさんは怒っていると思っているはず");
    expect(r.ok).toBe(false);
    expect(r.violations[0].kind).toBe("speak_for_other");
  });

  it("「きっと〜だろう」を検出", () => {
    expect(validateSpeechLexicon("きっと疲れているだろう").ok).toBe(false);
  });

  it("「本当は〜と感じ」を検出", () => {
    expect(validateSpeechLexicon("本当はそう感じていますね").ok).toBe(false);
  });
});

// ─────────────────────────────────────────────
// §1.2.1 #2 評定 (§2.4)
// ─────────────────────────────────────────────

describe("L2-m validateSpeechLexicon — §1.2.1 #2 評定 (§2.4)", () => {
  it("「上手 / 下手」を検出", () => {
    expect(validateSpeechLexicon("話し方が上手").ok).toBe(false);
    expect(validateSpeechLexicon("対応が下手").ok).toBe(false);
  });

  it("「素晴らしい」を検出", () => {
    expect(validateSpeechLexicon("素晴らしい関係").ok).toBe(false);
  });

  it("「偉い」「子供っぽい」を検出", () => {
    expect(validateSpeechLexicon("偉いですね").ok).toBe(false);
    expect(validateSpeechLexicon("子供っぽい").ok).toBe(false);
  });
});

// ─────────────────────────────────────────────
// §1.2.1 #5 尋問 (§2.5)
// ─────────────────────────────────────────────

describe("L2-m validateSpeechLexicon — §1.2.1 #5 尋問 (§2.5)", () => {
  it("「なぜ？」単独を検出", () => {
    expect(validateSpeechLexicon("なぜ？").ok).toBe(false);
  });

  it("「本当に？」を検出", () => {
    expect(validateSpeechLexicon("本当に？").ok).toBe(false);
  });

  it("「ちゃんと〜しましたか」を検出", () => {
    expect(validateSpeechLexicon("ちゃんと確認しましたか").ok).toBe(false);
  });
});

// ─────────────────────────────────────────────
// §1.2.1 #6 追い詰め (§2.6)
// ─────────────────────────────────────────────

describe("L2-m validateSpeechLexicon — §1.2.1 #6 追い詰め (§2.6)", () => {
  it("「今決めてください」を検出", () => {
    expect(validateSpeechLexicon("今決めてください").ok).toBe(false);
  });

  it("「他に選択肢はありません」を検出", () => {
    expect(validateSpeechLexicon("他に選択肢はありません").ok).toBe(false);
  });

  it("「やるしかない」を検出", () => {
    expect(validateSpeechLexicon("やるしかない").ok).toBe(false);
  });

  it("「誰のせい」を検出", () => {
    expect(validateSpeechLexicon("誰のせいですか").ok).toBe(false);
  });
});

// ─────────────────────────────────────────────
// §1.3 世界観違反 (§2.9)
// ─────────────────────────────────────────────

describe("L2-m validateSpeechLexicon — §1.3 世界観違反 (絵文字 / 感嘆符 / 一人称)", () => {
  it("「！」感嘆符を検出", () => {
    expect(validateSpeechLexicon("やった！").ok).toBe(false);
  });

  it("ハート ♥ を検出", () => {
    expect(validateSpeechLexicon("いいですね♥").ok).toBe(false);
  });

  it("一人称「僕」を検出", () => {
    expect(validateSpeechLexicon("僕は思います").ok).toBe(false);
  });

  it("一人称「俺」を検出", () => {
    expect(validateSpeechLexicon("俺の意見では").ok).toBe(false);
  });
});

// ─────────────────────────────────────────────
// 適切な文面は通過
// ─────────────────────────────────────────────

describe("L2-m validateSpeechLexicon — 適切な文面は通過", () => {
  it("「今、間に入れそう」(Pattern A 標準) → ok=true", () => {
    expect(validateSpeechLexicon("今、間に入れそう").ok).toBe(true);
  });

  it("「少し整理する時間を入れてみる？」(Pattern C 確認質問形) → ok=true", () => {
    expect(validateSpeechLexicon("少し整理する時間を入れてみる？").ok).toBe(true);
  });
});

// ─────────────────────────────────────────────
// validateQuestionCount (§2.5 連続疑問文)
// ─────────────────────────────────────────────

describe("L2-m validateQuestionCount — §2.5 1 発話 1 問い返し", () => {
  it("? が 1 個 → ok (Pattern C maxQuestions=1)", () => {
    expect(validateQuestionCount("少し聞いてもいいですか", 1).ok).toBe(true);
  });

  it("? が 2 個 → reject (連続疑問文)", () => {
    expect(validateQuestionCount("なぜ？本当に？", 1).ok).toBe(false);
  });

  it("maxQuestions=0 で ? を 1 個でも reject", () => {
    expect(validateQuestionCount("これでいいですか？", 0).ok).toBe(false);
  });
});

// ─────────────────────────────────────────────
// validateLength (LengthOverride)
// ─────────────────────────────────────────────

describe("L2-m validateLength — Pattern 別文長制約", () => {
  it("DEFAULT (3 文以内、14-40 文字) で 1 文 30 文字 → ok", () => {
    expect(
      validateLength("これは標準的な長さの一文として扱える文面です", DEFAULT_LENGTH_OVERRIDE).ok,
    ).toBe(true);
  });

  it("DEFAULT で 1 文 50 文字超 → reject (文字数上限)", () => {
    const long = "あ".repeat(50);
    expect(validateLength(long, DEFAULT_LENGTH_OVERRIDE).ok).toBe(false);
  });

  it("Pattern A は maxSentences=2", () => {
    expect(LENGTH_OVERRIDE_BY_VARIANT.A.maxSentences).toBe(2);
  });

  it("Pattern C は maxSentences=1 / maxQuestions=1", () => {
    expect(LENGTH_OVERRIDE_BY_VARIANT.C.maxSentences).toBe(1);
    expect(LENGTH_OVERRIDE_BY_VARIANT.C.maxQuestions).toBe(1);
  });

  it("Pattern F2 は maxSentences=6 (生活提案、長文許容)", () => {
    expect(LENGTH_OVERRIDE_BY_VARIANT.F2.maxSentences).toBe(6);
  });
});

// ─────────────────────────────────────────────
// validateSpeech 統合 checker
// ─────────────────────────────────────────────

describe("L2-m validateSpeech — 統合 checker", () => {
  it("禁止語彙 + 文長違反を全て収集", () => {
    const r = validateSpeech("正しい！", DEFAULT_LENGTH_OVERRIDE);
    expect(r.ok).toBe(false);
    // 「正しい」(judgmental) + 「！」(worldview) + 文字数不足 (length) で複数違反
    expect(r.violations.length).toBeGreaterThanOrEqual(2);
  });

  it("適切な文面 + 適切な文長 → ok=true", () => {
    // DEFAULT は 1 文 14-40 文字。各文を 14 文字以上にする。
    expect(
      validateSpeech(
        "今、ここに少しだけ入れそうな間があります。少し整理する時間を入れる方がよさそうです",
        DEFAULT_LENGTH_OVERRIDE,
      ).ok,
    ).toBe(true);
  });
});

// ─────────────────────────────────────────────
// buildPresenceSpeech (Stage 2 stub、Stage 4 実装委譲)
// ─────────────────────────────────────────────

describe("L2-m buildPresenceSpeech — Stage 2 stub (Stage 4 委譲)", () => {
  it("Stage 2 では throw (LLM 実装は Stage 4)", async () => {
    await expect(
      buildPresenceSpeech({
        variant: "A",
        state: "S2",
        mode: "normal",
      }),
    ).rejects.toThrow(/Stage 4/);
  });
});
