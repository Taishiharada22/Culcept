/**
 * CoAlter AOO Phase B B-5b — postSpeakVerification invariant test
 *
 * 正本: lib/coalter/mirror/postSpeakVerification.ts
 */

import { describe, it, expect } from "vitest";
import {
  verifyMirrorText,
  __getMaxTextLengthForTest,
  __getAllFailReasonsForTest,
} from "@/lib/coalter/mirror/postSpeakVerification";
import type {
  PostSpeakVerificationInput,
  VisibleMirrorTemplateId,
} from "@/lib/coalter/mirror/visibleMirrorTypes";

function baseInput(
  overrides: Partial<PostSpeakVerificationInput> = {},
): PostSpeakVerificationInput {
  return {
    text: "なにかを抱えているような、そんな気がしました",
    templateId: "state_mirror_holding",
    recentlyEmittedTemplateIds: [],
    ...overrides,
  };
}

describe("B-5b postSpeakVerification — ok (safe template)", () => {
  it("hedged form template → ok: true", () => {
    const r = verifyMirrorText(baseInput());
    expect(r.ok).toBe(true);
  });

  it("全 5 種の State Mirror template が verify pass", () => {
    const safeTemplates: Array<[VisibleMirrorTemplateId, string]> = [
      ["state_mirror_pause", "少し、間がほしいような…そんな雰囲気でした"],
      ["state_mirror_unsettled", "なにかが揺れている、そんな印象でした"],
      ["state_mirror_preverbal", "まだ言葉になっていない感じが、ありました"],
      ["state_mirror_holding", "なにかを抱えているような、そんな気がしました"],
      ["state_mirror_threshold", "少し、立ち止まっているような感覚があります"],
    ];
    for (const [id, text] of safeTemplates) {
      const r = verifyMirrorText({
        text,
        templateId: id,
        recentlyEmittedTemplateIds: [],
      });
      expect(r.ok).toBe(true);
    }
  });
});

describe("B-5b postSpeakVerification — PII detection (1st layer)", () => {
  it("email pattern → pii_detected", () => {
    const r = verifyMirrorText(baseInput({ text: "leak@example.com です" }));
    expect(r).toEqual({ ok: false, reason: "pii_detected" });
  });

  it("URL pattern (http://) → pii_detected", () => {
    const r = verifyMirrorText(baseInput({ text: "http://example.com 参照" }));
    expect(r).toEqual({ ok: false, reason: "pii_detected" });
  });

  it("URL pattern (https://) → pii_detected", () => {
    const r = verifyMirrorText(baseInput({ text: "https://x.io" }));
    expect(r).toEqual({ ok: false, reason: "pii_detected" });
  });

  it("URL pattern (www.) → pii_detected", () => {
    const r = verifyMirrorText(baseInput({ text: "www.example.com" }));
    expect(r).toEqual({ ok: false, reason: "pii_detected" });
  });

  it("連続数字 4 桁 (phone-like) → pii_detected", () => {
    const r = verifyMirrorText(baseInput({ text: "番号 1234" }));
    expect(r).toEqual({ ok: false, reason: "pii_detected" });
  });

  it("id-like 連続英数 12 文字以上 → pii_detected", () => {
    const r = verifyMirrorText(baseInput({ text: "AbCd1234EfGh" }));
    expect(r).toEqual({ ok: false, reason: "pii_detected" });
  });
});

describe("B-5b postSpeakVerification — imperative detection (2nd layer)", () => {
  it("命令形「してください」 → imperative_grammar", () => {
    const r = verifyMirrorText(baseInput({ text: "深呼吸してください" }));
    expect(r).toEqual({ ok: false, reason: "imperative_grammar" });
  });

  it("命令形「なさい」 → imperative_grammar", () => {
    const r = verifyMirrorText(baseInput({ text: "落ち着きなさい" }));
    expect(r).toEqual({ ok: false, reason: "imperative_grammar" });
  });

  it("命令形「ましょう」 → imperative_grammar", () => {
    const r = verifyMirrorText(baseInput({ text: "一緒に考えましょう" }));
    expect(r).toEqual({ ok: false, reason: "imperative_grammar" });
  });
});

describe("B-5b postSpeakVerification — question detection (3rd layer)", () => {
  it("疑問符「?」 → question_grammar", () => {
    const r = verifyMirrorText(baseInput({ text: "どうですか?" }));
    expect(r).toEqual({ ok: false, reason: "question_grammar" });
  });

  it("疑問符「？」 → question_grammar", () => {
    const r = verifyMirrorText(baseInput({ text: "今、何を感じている？" }));
    expect(r).toEqual({ ok: false, reason: "question_grammar" });
  });

  it("「でしょうか」 → question_grammar", () => {
    const r = verifyMirrorText(baseInput({ text: "そう感じるのでしょうか" }));
    expect(r).toEqual({ ok: false, reason: "question_grammar" });
  });
});

describe("B-5b postSpeakVerification — suggestion detection (4th layer)", () => {
  it("「みては」 → suggestion_grammar", () => {
    const r = verifyMirrorText(baseInput({ text: "少し休んでみては" }));
    expect(r).toEqual({ ok: false, reason: "suggestion_grammar" });
  });

  it("「みたら」 → suggestion_grammar", () => {
    const r = verifyMirrorText(baseInput({ text: "深呼吸してみたら" }));
    expect(r).toEqual({ ok: false, reason: "suggestion_grammar" });
  });

  it("「するといい」 → suggestion_grammar", () => {
    const r = verifyMirrorText(baseInput({ text: "話してみるといい" }));
    expect(r).toEqual({ ok: false, reason: "suggestion_grammar" });
  });
});

describe("B-5b postSpeakVerification — empathy theater detection (5th layer)", () => {
  it("「わかります」 → empathy_theater", () => {
    const r = verifyMirrorText(baseInput({ text: "気持ちわかります" }));
    expect(r).toEqual({ ok: false, reason: "empathy_theater" });
  });

  it("「気持ちわかる」 → empathy_theater", () => {
    const r = verifyMirrorText(baseInput({ text: "その気持ちわかるよ" }));
    expect(r).toEqual({ ok: false, reason: "empathy_theater" });
  });

  it("「私も」 → empathy_theater", () => {
    const r = verifyMirrorText(baseInput({ text: "私もそう思う" }));
    expect(r).toEqual({ ok: false, reason: "empathy_theater" });
  });
});

describe("B-5b postSpeakVerification — length check (6th layer)", () => {
  it("60 文字超 → text_too_long", () => {
    const longText = "あ".repeat(61);
    const r = verifyMirrorText(baseInput({ text: longText }));
    expect(r).toEqual({ ok: false, reason: "text_too_long" });
  });

  it("ちょうど 60 文字 → 通過 (length check は >60 で fail)", () => {
    const text = "あ".repeat(60);
    const r = verifyMirrorText(baseInput({ text }));
    // 60 文字に PII / 命令 / 疑問 / 提案 / 共感を含まないので OK
    expect(r.ok).toBe(true);
  });

  it("MAX_TEXT_LENGTH は 60", () => {
    expect(__getMaxTextLengthForTest()).toBe(60);
  });
});

describe("B-5b postSpeakVerification — duplicate check (7th layer)", () => {
  it("同 templateId が既出 → duplicate_in_session", () => {
    const r = verifyMirrorText(
      baseInput({
        templateId: "state_mirror_holding",
        recentlyEmittedTemplateIds: ["state_mirror_holding"],
      }),
    );
    expect(r).toEqual({ ok: false, reason: "duplicate_in_session" });
  });

  it("別 templateId が既出 → ok", () => {
    const r = verifyMirrorText(
      baseInput({
        templateId: "state_mirror_holding",
        recentlyEmittedTemplateIds: ["state_mirror_pause"],
      }),
    );
    expect(r.ok).toBe(true);
  });
});

describe("B-5b postSpeakVerification — fail-fast 順序", () => {
  it("PII と imperative 両方含むなら PII が先 (1st が優先)", () => {
    const r = verifyMirrorText(
      baseInput({ text: "leak@example.com してください" }),
    );
    expect(r).toEqual({ ok: false, reason: "pii_detected" });
  });

  it("imperative と question 両方なら imperative が先 (2nd が優先)", () => {
    const r = verifyMirrorText(
      baseInput({ text: "深呼吸してください?" }),
    );
    expect(r).toEqual({ ok: false, reason: "imperative_grammar" });
  });

  it("question と suggestion 両方なら question が先 (3rd が優先)", () => {
    const r = verifyMirrorText(
      baseInput({ text: "休んでみては?" }),
    );
    expect(r).toEqual({ ok: false, reason: "question_grammar" });
  });
});

describe("B-5b postSpeakVerification — invariants", () => {
  it("fail reason は 7 種 (enum exhaustive)", () => {
    const reasons = __getAllFailReasonsForTest();
    expect(reasons.length).toBe(7);
    expect(new Set(reasons).size).toBe(7);
  });

  it("input mutation なし", () => {
    const input: PostSpeakVerificationInput = {
      text: "なにかを抱えているような、そんな気がしました",
      templateId: "state_mirror_holding",
      recentlyEmittedTemplateIds: ["state_mirror_pause"],
    };
    const snapshot = JSON.stringify(input);
    verifyMirrorText(input);
    verifyMirrorText(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it("deterministic: 同入力で常に同 result", () => {
    const input = baseInput();
    const r1 = verifyMirrorText(input);
    const r2 = verifyMirrorText(input);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });
});
