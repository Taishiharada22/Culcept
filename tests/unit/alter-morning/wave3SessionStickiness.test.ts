/**
 * v2 session stickiness tests — W3-PR-5 Commit 2
 *
 * 目的:
 *   - adaptPipelineToLegacy が返す session に pipelineVersion="v2" がつく
 *   - 旧 session（pipelineVersion 未設定）は undefined のまま保持される型
 *   - ゲート相当ロジック（isNewSession || isStickyV2）が意図通り
 *     新規 / v2 継続のみ v2 経路に入り、旧継続は旧経路に落ちる
 *
 * 注意:
 *   API route 全体の integration は別 E2E で担保する。ここでは
 *   stickiness 判定の真理値表と adapter のラベリングまで。
 */
import { describe, test, expect, beforeEach, vi } from "vitest";

import {
  runMorningPipeline,
  createStubComprehensionProvider,
} from "@/lib/alter-morning/morningPipeline";
import { resetEventCounter, utteranceProvenance } from "@/lib/alter-morning/comprehension/eventSchema";
import { adaptPipelineToLegacy } from "@/lib/alter-morning/legacyAdapter";
import { stubNarrationProvider } from "@/lib/alter-morning/expression/narration";
import type { L1PipelineInput } from "@/lib/alter-morning/comprehension/l1Pipeline";
import type { MorningSession } from "@/lib/alter-morning/types";

function mkRaw(): L1PipelineInput["raw"] {
  return {
    targetDate: "2026-04-22",
    startPoint: null,
    departureTime: null,
    goOut: true,
    operations: [],
    events: [
      {
        turn_mode: "create",
        change_scope: null,
        target_ref: null,
        target_ref_confidence: null,
        certainty: "asserted",
        when: {
          startTime: "09:00",
          timeHint: null,
          provenance: utteranceProvenance(["9時"], "high"),
        },
        where: {
          place_ref: "スタバ",
          placeType: "chain_brand",
          provenance: utteranceProvenance(["スタバ"], "high"),
        },
        what: {
          activity: "コーヒー",
          activityCanonical: "コーヒー",
          provenance: utteranceProvenance(["コーヒー"], "high"),
        },
        who: [],
        transport: null,
        missing_semantic_critical: [],
        missing_solver_blockers: [],
      },
    ],
  };
}

beforeEach(() => {
  resetEventCounter();
});

describe("adaptPipelineToLegacy → pipelineVersion stickiness (W3-PR-5)", () => {
  test("v2 pipeline を通した session は pipelineVersion='v2' を持つ", async () => {
    const pipelineResult = await runMorningPipeline(
      { utterance: "9時にスタバでコーヒー" },
      {
        comprehension: createStubComprehensionProvider(mkRaw()),
        narration: stubNarrationProvider,
        weather: null,
      },
    );
    const { session } = adaptPipelineToLegacy(pipelineResult, {
      sessionId: "ms_test",
      utterance: "9時にスタバでコーヒー",
    });
    expect(session.pipelineVersion).toBe("v2");
  });

  test("comprehension_failed でも session は v2 タグを維持する（prod safe degrade）", async () => {
    // W3-PR-8 items=0 禁則: dev/test は throw、prod のみ safe degrade
    const orig = process.env.NODE_ENV;
    // @ts-expect-error
    process.env.NODE_ENV = "production";
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const pipelineResult = await runMorningPipeline(
        { utterance: "意味不明" },
        {
          comprehension: { async extract() { return null; } },
          narration: stubNarrationProvider,
          weather: null,
        },
      );
      const { session } = adaptPipelineToLegacy(pipelineResult, {
        sessionId: "ms_test",
        utterance: "意味不明",
      });
      expect(session.pipelineVersion).toBe("v2");
      expect(session.phase).toBe("clarifying");
    } finally {
      // @ts-expect-error
      process.env.NODE_ENV = orig;
      errSpy.mockRestore();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Gate truth table（route 内ロジックを純関数化したもの。実装は route.ts）
// ─────────────────────────────────────────────────────────────────────────────

function decideUseV2(
  v2Enabled: boolean,
  hasExistingMorningSession: boolean,
  rawPipelineVersion: MorningSession["pipelineVersion"],
): boolean {
  const isNewSession = !hasExistingMorningSession;
  const isStickyV2 = hasExistingMorningSession && rawPipelineVersion === "v2";
  return v2Enabled && (isNewSession || isStickyV2);
}

describe("v2 gate decision truth table (W3-PR-5)", () => {
  test("flag OFF → 常に false", () => {
    expect(decideUseV2(false, false, undefined)).toBe(false);
    expect(decideUseV2(false, true, "v2")).toBe(false);
  });

  test("flag ON & 新規セッション → true", () => {
    expect(decideUseV2(true, false, undefined)).toBe(true);
  });

  test("flag ON & 既存 v2 → true（sticky）", () => {
    expect(decideUseV2(true, true, "v2")).toBe(true);
  });

  test("flag ON & 既存 legacy（pipelineVersion undefined） → false（脳は混ぜない）", () => {
    expect(decideUseV2(true, true, undefined)).toBe(false);
  });
});
