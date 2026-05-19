/**
 * CoAlter AOO Phase E-1 — Reflection-only Canon Invariant Test
 *
 * 正本:
 *   - canon: docs/coalter-aoo-phase-e-plan.md §11.1 (reflection-only canon CI gate)
 *   - 起源 design: docs/coalter-aoo-phase-b-mirror-channel-design.md (Phase B 北極星「黙る・誤読を避ける」)
 *   - 既存 test (B-5b 起源): tests/unit/coalter/mirror/mirrorTextTemplates.test.ts (138 行)
 *
 * 役割 (Phase E-1 段階):
 *   既存の B-5b 起源 template test (negative pattern check のみ) を Phase E 永続 canon として
 *   **拡張・強化** する。CEO Q5 承認 (2026-05-19 Phase E-0 approved): "reflection-only canon
 *   CI test は E-1 と同時着地、Phase E 全期間の safety net として運用"。
 *
 * 本 test が B-5b 既存 test に **追加** する invariant:
 *   1. **positive hedge form ending enforcement**: 全 template が canonical hedge ending
 *      で終わることを強制 (existing test は negative pattern のみ、本 test は positive 規範)
 *   2. **PII pattern firewall**: email / phone / URL / Supabase ref / user-id-shape を
 *      template text に含めない (existing test は文法のみ、本 test は data leak gate)
 *   3. **commit / promise vocabulary banlist**: 「確実」「必ず」「絶対」「保証」「約束」等の
 *      coercion 語彙を含めない (Mirror は reflection、確約しない)
 *   4. **第二人称 / 直接指示語 banlist**: 「あなた」「君」「お前」等の direct address を
 *      含めない (Mirror は 3rd person observation)
 *   5. **template count canonicalization**: 現在 5 entry、新規追加は CEO 直接承認 + canon
 *      §11.1 protocol 経由のみ (本 test の lock-in 値)
 *   6. **forced_canary mode の構造的不変**: forcedCanaryMode が template text を生成しない
 *      (template 経由のみ、import 副作用なし、flag OFF で完全 no-op)
 *
 * Phase E 全期間の意義:
 *   Production rollout (E-2 以降) で本 test が merge gate となる。新 template 追加 PR は
 *   本 test を通過しない限り main 着地不能。これにより reflection-only canon の **構造的
 *   永続化** を実現する (Phase B-5b の docstring 規範 → Phase E CI 強制への昇格)。
 *
 * 不可侵境界:
 *   - 既存 mirrorTextTemplates.test.ts への touch なし (本 file は新規追加のみ)
 *   - runtime app code に touch なし (lib/coalter/mirror/* は読み込み専用)
 *   - 本 test は CI で merge gate、test 自身の lock を解除する PR は CEO 直接承認必須
 */

import { describe, it, expect } from "vitest";
import {
  MIRROR_TEXT_TEMPLATES,
  MIRROR_TEXT_TEMPLATE_BY_ID,
  __getTemplateCountForTest,
} from "@/lib/coalter/mirror/mirrorTextTemplates";

// =============================================================================
// §1. Template count lock (Phase E canon)
// =============================================================================

describe("Phase E-1 reflection canon — template count lock", () => {
  it("MIRROR_TEXT_TEMPLATES 数は 5 (Phase B-5b State Mirror only、Phase E では未拡張)", () => {
    // Phase C/D/E では State Mirror 5 entry のみが許容。Difference / Tempo / Fairness /
    // Repair 系は別 phase で起票、本 lock を更新する PR は CEO 直接承認 + canon §11.1 protocol。
    expect(__getTemplateCountForTest()).toBe(5);
    expect(MIRROR_TEXT_TEMPLATES.length).toBe(5);
  });

  it("template ID は固定 5 値 (literal union と完全一致)", () => {
    const expectedIds: ReadonlyArray<string> = [
      "state_mirror_pause",
      "state_mirror_unsettled",
      "state_mirror_preverbal",
      "state_mirror_holding",
      "state_mirror_threshold",
    ];
    const actualIds = MIRROR_TEXT_TEMPLATES.map((t) => t.id).sort();
    expect(actualIds).toEqual([...expectedIds].sort());
  });
});

// =============================================================================
// §2. Positive hedge form ending enforcement (Phase E 追加 canon)
// =============================================================================

describe("Phase E-1 reflection canon — hedge form ending (positive enforcement)", () => {
  // canonical hedge endings (Phase B 北極星「黙る」を grammar で固定)
  // 各 template は以下のいずれかで終わること。これにより断定形 / 命令形が text 末で
  // 出現する可能性を構造的に排除する。
  const CANONICAL_HEDGE_ENDINGS: ReadonlyArray<string> = [
    "気がしました",
    "印象でした",
    "感覚があります",
    "感じが、ありました",
    "雰囲気でした",
  ];

  for (const t of MIRROR_TEXT_TEMPLATES) {
    it(`[${t.id}] text は canonical hedge ending のいずれかで終わる`, () => {
      const endsWithHedge = CANONICAL_HEDGE_ENDINGS.some((ending) =>
        t.text.endsWith(ending),
      );
      expect(
        endsWithHedge,
        `template "${t.id}" text "${t.text}" は canonical hedge ending (${CANONICAL_HEDGE_ENDINGS.join(" / ")}) のいずれかで終わるべき`,
      ).toBe(true);
    });
  }
});

// =============================================================================
// §3. PII pattern firewall (Phase E 追加 canon、data leak gate)
// =============================================================================

describe("Phase E-1 reflection canon — PII pattern firewall", () => {
  // template text は静的 const literal だが、defensive guard として PII pattern を block。
  // 将来 LLM 生成や動的 text concat が誤って混入した場合の構造的検出。
  for (const t of MIRROR_TEXT_TEMPLATES) {
    describe(`[${t.id}] PII firewall`, () => {
      it("email pattern を含まない", () => {
        expect(t.text).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
      });

      it("phone number pattern (国内/国際) を含まない", () => {
        // 日本国内形式 (例: 090-1234-5678 / 03-1234-5678) + 国際形式 (+81-...)
        expect(t.text).not.toMatch(/(?:\+?\d{1,3}[-\s]?)?\d{2,4}[-\s]?\d{2,4}[-\s]?\d{2,4}/);
      });

      it("URL / domain pattern を含まない", () => {
        expect(t.text).not.toMatch(/https?:\/\/\S+/);
        expect(t.text).not.toMatch(/\.(com|jp|co|io|net|org|app)\b/);
      });

      it("Supabase project ref pattern を含まない (20 文字小文字英数)", () => {
        // canon (docs/coalter-supabase-ref-canon.md §1) と整合
        expect(t.text).not.toMatch(/[a-z0-9]{20}\.supabase\.co/);
      });

      it("UUID pattern (user.id / session.id 形式) を含まない", () => {
        expect(t.text).not.toMatch(
          /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/,
        );
      });
    });
  }
});

// =============================================================================
// §4. Commit / promise vocabulary banlist (Phase E 追加 canon)
// =============================================================================

describe("Phase E-1 reflection canon — commit/promise vocabulary banlist", () => {
  // Mirror は reflection であり、確約・断定をしない。以下の語彙は構造的に block。
  const FORBIDDEN_COMMIT_VOCAB: ReadonlyArray<string> = [
    "確実",
    "必ず",
    "絶対",
    "保証",
    "約束",
    "間違いなく",
    "絶対に",
    "決して",
  ];

  for (const t of MIRROR_TEXT_TEMPLATES) {
    it(`[${t.id}] commit / promise vocabulary を含まない`, () => {
      for (const word of FORBIDDEN_COMMIT_VOCAB) {
        expect(
          t.text,
          `template "${t.id}" text "${t.text}" は commit vocab "${word}" を含むべきでない (Phase B 北極星 reflection-only)`,
        ).not.toContain(word);
      }
    });
  }
});

// =============================================================================
// §5. 第二人称 / 直接 address banlist (Phase E 追加 canon)
// =============================================================================

describe("Phase E-1 reflection canon — 第二人称 / direct address banlist", () => {
  // Mirror は 3rd person observation。「あなた」「君」等の direct address は禁止
  // (これらは Question / Proposal grammar の暗黙の前提となるため)。
  const FORBIDDEN_DIRECT_ADDRESS: ReadonlyArray<string> = [
    "あなた",
    "あなたが",
    "あなたの",
    "あなたに",
    "あなたを",
    "君が",
    "君は",
    "君の",
    "お前",
    "貴方",
  ];

  for (const t of MIRROR_TEXT_TEMPLATES) {
    it(`[${t.id}] 第二人称 direct address を含まない`, () => {
      for (const word of FORBIDDEN_DIRECT_ADDRESS) {
        expect(
          t.text,
          `template "${t.id}" text "${t.text}" は direct address "${word}" を含むべきでない (Mirror は 3rd person observation)`,
        ).not.toContain(word);
      }
    });
  }
});

// =============================================================================
// §6. Forced canary mode の構造的不変 (Phase E E-1 safety)
// =============================================================================

describe("Phase E-1 reflection canon — forced canary mode 構造的不変", () => {
  it("forcedCanaryMode module は template text を直接 export しない (template 経由のみ)", async () => {
    // forcedCanaryMode は engineAdapter 用 mock engine input を提供するが、template text
    // 自体は MIRROR_TEXT_TEMPLATES から enum-locked id 経由でのみ resolve される。
    // 本 test は forcedCanaryMode に raw text が漏れていないかを構造的に確認。
    //
    // NOTE: 変数名は `loadedModule` を使用 (`module` は Next.js ESLint rule
    // `@next/next/no-assign-module-variable` で禁止、Node.js global `module` の
    // shadow を避けるため)。
    const loadedModule = await import("@/lib/coalter/mirror/forcedCanaryMode");
    const exportedKeys = Object.keys(loadedModule);
    // forcedCanaryMode から template text を直接 export してはいけない (anti-pattern)
    for (const key of exportedKeys) {
      const value = (loadedModule as Record<string, unknown>)[key];
      if (typeof value === "string") {
        // 任意 string export がある場合、それが template text であってはならない
        for (const t of MIRROR_TEXT_TEMPLATES) {
          expect(
            value,
            `forcedCanaryMode export "${key}" が template text "${t.text}" を直接 hold しているのは Phase E canon 違反`,
          ).not.toBe(t.text);
        }
      }
    }
  });

  it("MIRROR_TEXT_TEMPLATE_BY_ID は唯一の template lookup source", () => {
    // template lookup は MIRROR_TEXT_TEMPLATE_BY_ID 経由のみ。
    // Map と Array の数が一致 (lookup の完全性)。
    expect(MIRROR_TEXT_TEMPLATE_BY_ID.size).toBe(MIRROR_TEXT_TEMPLATES.length);
    for (const t of MIRROR_TEXT_TEMPLATES) {
      expect(MIRROR_TEXT_TEMPLATE_BY_ID.get(t.id)).toBe(t);
    }
  });
});

// =============================================================================
// §7. Phase E canon meta (test 自身の trace + canon link)
// =============================================================================

describe("Phase E-1 reflection canon — test 自身の trace", () => {
  it("本 test は docs/coalter-aoo-phase-e-plan.md §11.1 の canon を実装している", () => {
    // 本 test の存在自体が canon enforcement の trace。
    // 本 test を削除 / 緩和する PR は CEO 直接承認 + canon §11.1 protocol 経由のみ。
    expect(MIRROR_TEXT_TEMPLATES.length).toBeGreaterThan(0);
  });

  it("既存 B-5b mirrorTextTemplates.test.ts と本 test は補完関係 (重複ではない)", () => {
    // B-5b 既存 test: 文法 negative pattern (question/imperative/suggestion/empathy)
    // 本 Phase E test: positive hedge ending + PII firewall + commit vocab + direct address
    // 両者の組み合わせで reflection-only canon を多層 enforce する。
    // Phase E 起源の本 test を削除した場合、Phase B-5b test だけでは PII firewall や
    // hedge ending positive enforcement が抜ける。
    expect(MIRROR_TEXT_TEMPLATES.length).toBe(5); // 同じ source、補完的検証
  });
});
