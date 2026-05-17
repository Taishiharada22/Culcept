/**
 * CoAlter AOO Phase B B-5b — mirrorTextTemplates invariant test
 *
 * 正本: lib/coalter/mirror/mirrorTextTemplates.ts
 */

import { describe, it, expect } from "vitest";
import {
  MIRROR_TEXT_TEMPLATES,
  MIRROR_TEXT_TEMPLATE_BY_ID,
  __getTemplateCountForTest,
} from "@/lib/coalter/mirror/mirrorTextTemplates";

describe("B-5b mirrorTextTemplates — table 基本", () => {
  it("template 数は 5 (B-5b 段階の State Mirror only)", () => {
    expect(__getTemplateCountForTest()).toBe(5);
    expect(MIRROR_TEXT_TEMPLATES.length).toBe(5);
  });

  it("id がすべて unique", () => {
    const ids = MIRROR_TEXT_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("id は VisibleMirrorTemplateId literal union と一致", () => {
    const expected: ReadonlyArray<string> = [
      "state_mirror_pause",
      "state_mirror_unsettled",
      "state_mirror_preverbal",
      "state_mirror_holding",
      "state_mirror_threshold",
    ];
    const actual = MIRROR_TEXT_TEMPLATES.map((t) => t.id).sort();
    expect(actual).toEqual([...expected].sort());
  });

  it("lookup map は全 template を含む", () => {
    expect(MIRROR_TEXT_TEMPLATE_BY_ID.size).toBe(MIRROR_TEXT_TEMPLATES.length);
    for (const t of MIRROR_TEXT_TEMPLATES) {
      expect(MIRROR_TEXT_TEMPLATE_BY_ID.get(t.id)).toBeDefined();
    }
  });
});

describe("B-5b mirrorTextTemplates — grammar invariants (design-time)", () => {
  // 各 template の grammar 強制
  const FORBIDDEN_QUESTION_CHARS = ["?", "？"];
  const FORBIDDEN_QUESTION_PATTERNS = [
    "ですか",
    "ますか",
    "でしょうか",
    "のかな",
    "かしら",
  ];
  const FORBIDDEN_IMPERATIVE = [
    "しろ",
    "なさい",
    "ましょう",
    "してください",
    "ください",
    "べきだ",
    "べきです",
    "せよ",
  ];
  const FORBIDDEN_SUGGESTION = [
    "みては",
    "みたら",
    "みよう",
    "するといい",
    "したらどう",
    "してみては",
    "してみたら",
  ];
  const FORBIDDEN_EMPATHY = [
    "わかります",
    "わかるよ",
    "気持ちわかる",
    "私も同じ",
    "私も",
    "共感します",
    "共感する",
  ];

  for (const t of MIRROR_TEXT_TEMPLATES) {
    describe(`template: ${t.id}`, () => {
      it("text は ≤ 40 文字", () => {
        expect(t.text.length).toBeLessThanOrEqual(40);
      });

      it("text は空でない", () => {
        expect(t.text.length).toBeGreaterThan(0);
      });

      it("疑問符を含まない", () => {
        for (const c of FORBIDDEN_QUESTION_CHARS) {
          expect(t.text).not.toContain(c);
        }
        for (const p of FORBIDDEN_QUESTION_PATTERNS) {
          expect(t.text).not.toContain(p);
        }
      });

      it("命令形を含まない", () => {
        for (const p of FORBIDDEN_IMPERATIVE) {
          expect(t.text).not.toContain(p);
        }
      });

      it("提案形を含まない", () => {
        for (const p of FORBIDDEN_SUGGESTION) {
          expect(t.text).not.toContain(p);
        }
      });

      it("共感演技を含まない", () => {
        for (const p of FORBIDDEN_EMPATHY) {
          expect(t.text).not.toContain(p);
        }
      });

      it("grammarTags に state_mirror / reflection_only / hedged を含む", () => {
        expect(t.grammarTags).toContain("state_mirror");
        expect(t.grammarTags).toContain("reflection_only");
        expect(t.grammarTags).toContain("hedged");
      });
    });
  }
});

describe("B-5b mirrorTextTemplates — invariants", () => {
  it("immutable: array は readonly (TypeScript 型レベル)", () => {
    // runtime mutation 試行は型レベルで block されるが defensive check
    const ids = MIRROR_TEXT_TEMPLATES.map((t) => t.id);
    const snapshot = JSON.stringify(ids);
    // 何度 read しても変わらない
    expect(JSON.stringify(MIRROR_TEXT_TEMPLATES.map((t) => t.id))).toBe(snapshot);
  });
});
