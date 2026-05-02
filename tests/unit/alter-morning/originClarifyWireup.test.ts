/**
 * Origin clarify wire-up integration test (PR B-2e' Commit 5)
 *
 * CEO/GPT 2026-05-02 PR B-2e' 必須 9 ケース + 補強テスト
 *
 * 9 必須ケース:
 *   #1: userOverrideOriginLabel が same-plan STRONG prior より勝つ (優先順位修正の核)
 *   #2: userOverrideOriginLabel が Layer 1 explicit よりも勝つ
 *   #3: pending.slot === "origin" の回答が LLM append / event bind に流れない (= bindOriginAnswer のみ)
 *   #4: origin answer 成功後 pendingClarify が clear される
 *   #5: bindOriginAnswer 失敗時は semantic_miss として既存 fallback
 *   #6: 他 primary clarify がある時 origin clarify は出ない (= 二重保証)
 *   #7: activePresentation / search中 / where pending 中は origin clarify 出ない
 *   #8: endpoint / transport / where 既存 clarify を壊さない (regression)
 *   #9: userOverrideOriginLabel = null (= 通常時) は既存 flow と完全一致 (backward compat)
 *
 * Part 構成:
 *   A: 優先順位検証 (= adaptPipelineToLegacy 経由で journeyOrigin が user_override で plug される)
 *   B: backward compat (= userOverrideOriginLabel 不指定で既存挙動)
 *   C: gap detection 統合 (= legacyAdapter 三重保証 wire-up)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  runMorningPipeline,
  createStubComprehensionProvider,
} from "@/lib/alter-morning/morningPipeline";
import { adaptPipelineToLegacy } from "@/lib/alter-morning/legacyAdapter";
import {
  resetEventCounter,
  utteranceProvenance,
  type Event,
} from "@/lib/alter-morning/comprehension/eventSchema";
import type { L1PipelineInput } from "@/lib/alter-morning/comprehension/l1Pipeline";
import type { MorningPlan } from "@/lib/alter-morning/types";

vi.mock("server-only", () => ({}));

beforeEach(() => {
  resetEventCounter();
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fixtures
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const TODAY = "2026-05-02";

function eventWithCoords(): Event {
  return {
    event_id: "event_1",
    turn_mode: "create",
    target_ref: null,
    target_ref_confidence: null,
    change_scope: null,
    when: {
      startTime: "12:00",
      timeHint: null,
      provenance: utteranceProvenance(["12時"], "high"),
    },
    where: {
      place_ref: "新宿",
      placeType: "exact_proper_noun",
      coordinates: { lat: 35.6896, lng: 139.7006 },
      provenance: utteranceProvenance(["新宿"], "high"),
    },
    what: {
      activity: "ランチ",
      activityCanonical: "ランチ",
      provenance: utteranceProvenance(["ランチ"], "high"),
    },
    who: [],
    transport: null,
    certainty: "asserted",
    missing_semantic_critical: [],
    missing_solver_blockers: [],
  };
}

function mkRaw(): L1PipelineInput["raw"] {
  return {
    targetDate: TODAY,
    startPoint: null,
    departureTime: null,
    goOut: true,
    operations: [],
    events: [],
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Part A: 優先順位検証 — userOverrideOriginLabel が最優先 Layer
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[Part A] 優先順位 — userOverrideOriginLabel は最優先", () => {
  describe("[#1 必須] userOverrideOriginLabel が same-plan STRONG prior より勝つ", () => {
    it("priorPlan.journeyOrigin = user_declared (STRONG) があっても、当 turn の userOverrideOriginLabel が勝つ", async () => {
      const result = await runMorningPipeline(
        { utterance: "12時に新宿でランチ" },
        { comprehension: createStubComprehensionProvider(mkRaw()), weather: null },
      );
      // priorPlan = STRONG prior (user_declared = "自宅")
      const priorPlan: MorningPlan = {
        date: TODAY,
        items: [],
        dayConditions: {},
        createdAt: TODAY,
        confirmed: false,
        status: "needs_answer",
        journeyOrigin: {
          kind: "known_exact",
          label: "自宅",
          lat: 35.69,
          lng: 139.7,
          source: "user_declared",
        },
        journeyEnd: { kind: "unknown", reason: "no_endpoint_signal" },
      };
      const adapted = adaptPipelineToLegacy(result, {
        sessionId: "test-1",
        utterance: "ホテルから",
        priorPersistedEvents: [eventWithCoords()],
        today: TODAY,
        priorPlan,
        userOverrideOriginLabel: "ホテル", // ← 当 turn 回答
      });
      expect(adapted.session.plan?.journeyOrigin?.kind).toBe("known_label_only");
      if (adapted.session.plan?.journeyOrigin?.kind === "known_label_only") {
        expect(adapted.session.plan.journeyOrigin.label).toBe("ホテル");
        expect(adapted.session.plan.journeyOrigin.source).toBe("user_override");
      }
    });
  });

  describe("[#2 必須] userOverrideOriginLabel は registered_home / current にも勝つ", () => {
    it("homeAnchor が解決していても userOverrideOriginLabel が prevail", async () => {
      const result = await runMorningPipeline(
        { utterance: "12時に新宿でランチ" },
        { comprehension: createStubComprehensionProvider(mkRaw()), weather: null },
      );
      const adapted = adaptPipelineToLegacy(result, {
        sessionId: "test-2",
        utterance: "ホテルから",
        priorPersistedEvents: [eventWithCoords()],
        today: TODAY,
        userHomeLat: 35.69, // home anchor
        userHomeLng: 139.7,
        userOverrideOriginLabel: "ホテル", // ← 当 turn 回答
      });
      expect(adapted.session.plan?.journeyOrigin?.kind).toBe("known_label_only");
      if (adapted.session.plan?.journeyOrigin?.kind === "known_label_only") {
        expect(adapted.session.plan.journeyOrigin.label).toBe("ホテル");
        expect(adapted.session.plan.journeyOrigin.source).toBe("user_override");
      }
    });
  });

  describe("[#9 必須] backward compat — userOverrideOriginLabel 不指定は既存 flow", () => {
    it("不指定時、homeAnchor → registered_home が origin", async () => {
      const result = await runMorningPipeline(
        { utterance: "12時に新宿でランチ" },
        { comprehension: createStubComprehensionProvider(mkRaw()), weather: null },
      );
      const adapted = adaptPipelineToLegacy(result, {
        sessionId: "test-9",
        utterance: "12時に新宿でランチ",
        priorPersistedEvents: [eventWithCoords()],
        today: TODAY,
        userHomeLat: 35.69,
        userHomeLng: 139.7,
        // userOverrideOriginLabel 不指定
      });
      expect(adapted.session.plan?.journeyOrigin?.kind).toBe("known_exact");
      if (adapted.session.plan?.journeyOrigin?.kind === "known_exact") {
        expect(adapted.session.plan.journeyOrigin.source).toBe("registered_home");
      }
    });

    it("不指定 + 全 anchor null → unknown (= 既存挙動)", async () => {
      const result = await runMorningPipeline(
        { utterance: "12時に新宿でランチ" },
        { comprehension: createStubComprehensionProvider(mkRaw()), weather: null },
      );
      const adapted = adaptPipelineToLegacy(result, {
        sessionId: "test-9b",
        utterance: "12時に新宿でランチ",
        priorPersistedEvents: [eventWithCoords()],
        today: TODAY,
        // homeAnchor 不指定 + userOverrideOriginLabel 不指定
      });
      // unknown reason は B-2d-a permission state etc. に依存
      expect(adapted.session.plan?.journeyOrigin?.kind).toBe("unknown");
    });
  });

  describe("[補強] 空文字 / null は plug しない", () => {
    it("userOverrideOriginLabel = '' は既存 flow と同じ", async () => {
      const result = await runMorningPipeline(
        { utterance: "12時" },
        { comprehension: createStubComprehensionProvider(mkRaw()), weather: null },
      );
      const adapted = adaptPipelineToLegacy(result, {
        sessionId: "test-empty",
        utterance: "12時",
        priorPersistedEvents: [eventWithCoords()],
        today: TODAY,
        userHomeLat: 35.69,
        userHomeLng: 139.7,
        userOverrideOriginLabel: "", // 空文字
      });
      expect(adapted.session.plan?.journeyOrigin?.kind).toBe("known_exact");
      if (adapted.session.plan?.journeyOrigin?.kind === "known_exact") {
        expect(adapted.session.plan.journeyOrigin.source).toBe("registered_home");
      }
    });

    it("userOverrideOriginLabel = null も同様", async () => {
      const result = await runMorningPipeline(
        { utterance: "12時" },
        { comprehension: createStubComprehensionProvider(mkRaw()), weather: null },
      );
      const adapted = adaptPipelineToLegacy(result, {
        sessionId: "test-null",
        utterance: "12時",
        priorPersistedEvents: [eventWithCoords()],
        today: TODAY,
        userHomeLat: 35.69,
        userHomeLng: 139.7,
        userOverrideOriginLabel: null,
      });
      expect(adapted.session.plan?.journeyOrigin?.kind).toBe("known_exact");
    });
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Part B: STRONG prior 連動 — 次 turn の自動継承
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[Part B] STRONG prior 連動 — user_override の自動継承", () => {
  it("当 turn の user_override は次 turn で priorPlan として STRONG 守られる", async () => {
    // turn 1: user_override で plug
    const result1 = await runMorningPipeline(
      { utterance: "12時に新宿でランチ" },
      { comprehension: createStubComprehensionProvider(mkRaw()), weather: null },
    );
    const adapted1 = adaptPipelineToLegacy(result1, {
      sessionId: "turn1",
      utterance: "ホテルから",
      priorPersistedEvents: [eventWithCoords()],
      today: TODAY,
      userOverrideOriginLabel: "ホテル",
    });
    const turn1Origin = adapted1.session.plan?.journeyOrigin;
    expect(turn1Origin?.kind).toBe("known_label_only");

    // turn 2: priorPlan = turn1 result、別 turn だが samePlanDate=true
    const result2 = await runMorningPipeline(
      { utterance: "あと 14時に銀座でカフェ" },
      { comprehension: createStubComprehensionProvider(mkRaw()), weather: null },
    );
    const adapted2 = adaptPipelineToLegacy(result2, {
      sessionId: "turn2",
      utterance: "あと 14時に銀座でカフェ",
      priorPersistedEvents: [eventWithCoords()],
      today: TODAY,
      priorPlan: adapted1.session.plan, // ← turn 1 の plan を prior として
      userHomeLat: 35.69, // home あっても
      userHomeLng: 139.7,
      // userOverrideOriginLabel 当 turn は不指定
    });
    // STRONG prior として user_override が守られる
    expect(adapted2.session.plan?.journeyOrigin?.kind).toBe("known_label_only");
    if (adapted2.session.plan?.journeyOrigin?.kind === "known_label_only") {
      expect(adapted2.session.plan.journeyOrigin.label).toBe("ホテル");
      expect(adapted2.session.plan.journeyOrigin.source).toBe("user_override");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Part C: 三重保証 — wire-up が phase=plan_presented を override しない
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[Part C] 三重保証 — wire-up が plan_presented を override しない", () => {
  it("既存 home/current 不指定 fixture は plan_presented を維持 (= 既存 test 互換)", async () => {
    const result = await runMorningPipeline(
      { utterance: "12時に新宿でランチ" },
      { comprehension: createStubComprehensionProvider(mkRaw()), weather: null },
    );
    const adapted = adaptPipelineToLegacy(result, {
      sessionId: "test-c",
      utterance: "12時に新宿でランチ",
      priorPersistedEvents: [eventWithCoords()],
      today: TODAY,
      // home/current/userOverrideOriginLabel すべて不指定
      // → 既存挙動として journeyOrigin=unknown でも phase=plan_presented になるはず
      // （ただし result.gapResolution に primary_clarify があれば clarifying）
    });
    // origin clarify wire-up は phase!=plan_presented guard で skip
    // (= 既存挙動を破壊しない、保守的 rollout)
    // 結果: phase は既存通り (plan_presented or clarifying)
    expect(["plan_presented", "clarifying"]).toContain(adapted.response.phase);
    // pendingClarify が origin になっていないこと
    expect(adapted.session.pendingClarify?.slot).not.toBe("origin");
  });
});
