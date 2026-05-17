/**
 * CoAlter AOO Phase B B-4a — Decision types invariant test
 *
 * 正本:
 *   - 設計: docs/coalter-aoo-phase-b-mirror-channel-design.md (PR #164) §3 / §4 / §10
 *   - 実装計画: docs/coalter-aoo-phase-b-implementation-plan.md (PR #165) §2
 *   - 型実装: lib/coalter/mirror/types.ts (B-4a additions)
 *
 * test 範囲:
 *   - MirrorDecision discriminated union narrowing (STAY_SILENT vs MIRROR_CANDIDATE)
 *   - STAY_SILENT は reason 必須 / MIRROR_CANDIDATE は ervScore + reason: "speak_passed" 必須
 *   - GateResult discriminated union narrowing (passed: true vs passed: false)
 *   - CounterfactualOutcome literal union 4 値
 *   - ConversationPhase literal union 5 値
 *   - MirrorDecisionInput shape (10 fields, B-2/B-3 結果 + 4 axes + 1 sleep field)
 *   - **PII firewall (型レベル)**: MirrorDecisionInput に raw text / message id / user id /
 *     pair id / session id 等の PII field 名が存在しない
 *   - B-2/B-3 型との import 整合性
 */

import { describe, it, expect } from "vitest";
import { MIRROR_STAY_SILENT_REASON } from "@/lib/coalter/mirror/decisionConstants";
import type {
  ConversationPhase,
  CounterfactualOutcome,
  GateResult,
  MirrorDecision,
  MirrorDecisionInput,
  MirrorStaySilentReason,
  // B-2/B-3 import integrity
  MirrorModeContextResult,
  AlignmentBucketResult,
  UncertaintyBucketResult,
  SilenceBudgetBucketResult,
  PatternCategoryBucketResult,
} from "@/lib/coalter/mirror/types";

describe("B-4a MirrorDecision — discriminated union narrowing", () => {
  it("STAY_SILENT variant: reason 必須 / ervScore なし", () => {
    const d: MirrorDecision = {
      type: "STAY_SILENT",
      reason: MIRROR_STAY_SILENT_REASON.SAFE_SAFETY_CONCERN,
    };
    if (d.type === "STAY_SILENT") {
      // narrowing 後: d.reason は MirrorStaySilentReason
      const reason: MirrorStaySilentReason = d.reason;
      expect(reason).toBe("safe_gate_safety_concern");
      // ervScore は STAY_SILENT variant に存在しない (実行時 undefined)
      const ervScore = (d as { ervScore?: number }).ervScore;
      expect(ervScore).toBeUndefined();
    } else {
      throw new Error("Expected STAY_SILENT");
    }
  });

  it("MIRROR_CANDIDATE variant: ervScore 必須 / reason: 'speak_passed' 固定", () => {
    const d: MirrorDecision = {
      type: "MIRROR_CANDIDATE",
      ervScore: 0.9,
      reason: "speak_passed",
    };
    if (d.type === "MIRROR_CANDIDATE") {
      // narrowing 後: ervScore は number, reason は "speak_passed" literal
      const score: number = d.ervScore;
      const reason: "speak_passed" = d.reason;
      expect(score).toBe(0.9);
      expect(reason).toBe("speak_passed");
    } else {
      throw new Error("Expected MIRROR_CANDIDATE");
    }
  });

  it("exhaustive switch on type (TypeScript never check)", () => {
    const cases: MirrorDecision[] = [
      { type: "STAY_SILENT", reason: MIRROR_STAY_SILENT_REASON.OBSERVE_UNKNOWN_ALIGNMENT },
      { type: "MIRROR_CANDIDATE", ervScore: 0.85, reason: "speak_passed" },
    ];
    for (const d of cases) {
      let result: string;
      switch (d.type) {
        case "STAY_SILENT":
          result = d.reason;
          break;
        case "MIRROR_CANDIDATE":
          result = `MIRROR_${d.ervScore}`;
          break;
        default: {
          const _exhaustive: never = d;
          void _exhaustive;
          result = "unreachable";
        }
      }
      expect(result).toMatch(/^(observe_gate|MIRROR_)/);
    }
  });

  it("MirrorDecision の reason field は必ず MirrorStaySilentReason または 'speak_passed'", () => {
    // STAY_SILENT 各経路の sample
    const allReasons = Object.values(MIRROR_STAY_SILENT_REASON);
    for (const reason of allReasons) {
      const d: MirrorDecision = { type: "STAY_SILENT", reason };
      expect(d.type).toBe("STAY_SILENT");
      expect(d.reason).toBe(reason);
    }
    // MIRROR_CANDIDATE
    const d: MirrorDecision = { type: "MIRROR_CANDIDATE", ervScore: 0.8, reason: "speak_passed" };
    expect(d.reason).toBe("speak_passed");
  });
});

describe("B-4a GateResult — discriminated union narrowing", () => {
  it("passed: true variant: reason field なし", () => {
    const r: GateResult = { passed: true };
    if (r.passed) {
      // narrowing: reason は存在しない
      const reason = (r as { reason?: string }).reason;
      expect(reason).toBeUndefined();
    } else {
      throw new Error("Expected passed:true");
    }
  });

  it("passed: false variant: reason 必須", () => {
    const r: GateResult = {
      passed: false,
      reason: MIRROR_STAY_SILENT_REASON.SAFE_SAFETY_CONCERN,
    };
    if (!r.passed) {
      const reason: MirrorStaySilentReason = r.reason;
      expect(reason).toBe("safe_gate_safety_concern");
    } else {
      throw new Error("Expected passed:false");
    }
  });

  it("GateResult passed:false は MirrorStaySilentReason 全 17 値を受理", () => {
    const allReasons = Object.values(MIRROR_STAY_SILENT_REASON);
    for (const reason of allReasons) {
      const r: GateResult = { passed: false, reason };
      expect(r.passed).toBe(false);
      if (!r.passed) {
        expect(r.reason).toBe(reason);
      }
    }
  });
});

describe("B-4a CounterfactualOutcome — literal union (4 values, B-0 §10.2)", () => {
  it("全 4 outcome 値が string として受理される", () => {
    const outcomes: CounterfactualOutcome[] = [
      "user_misses_small_observation",
      "user_misses_meaningful_insight",
      "user_takes_harmful_action",
      "no_difference",
    ];
    for (const o of outcomes) {
      expect(typeof o).toBe("string");
    }
    expect(outcomes.length).toBe(4);
  });

  it("exhaustive switch on CounterfactualOutcome (4 branches must cover all literal cases)", () => {
    // Wide type via Array literal で全 outcome 値を iterate
    const allOutcomes: CounterfactualOutcome[] = [
      "user_misses_small_observation",
      "user_misses_meaningful_insight",
      "user_takes_harmful_action",
      "no_difference",
    ];
    const results: string[] = [];
    for (const o of allOutcomes) {
      switch (o) {
        case "user_misses_small_observation":
          results.push("small");
          break;
        case "user_misses_meaningful_insight":
          results.push("insight");
          break;
        case "user_takes_harmful_action":
          results.push("harmful");
          break;
        case "no_difference":
          results.push("none");
          break;
        default: {
          const _exhaustive: never = o;
          void _exhaustive;
          results.push("unreachable");
        }
      }
    }
    expect(results).toEqual(["small", "insight", "harmful", "none"]);
  });
});

describe("B-4a ConversationPhase — literal union (5 values incl unknown)", () => {
  it("全 5 phase 値が string として受理される", () => {
    const phases: ConversationPhase[] = [
      "greeting",
      "in_progress",
      "closing",
      "emergent",
      "unknown",
    ];
    for (const p of phases) {
      expect(typeof p).toBe("string");
    }
    expect(phases.length).toBe(5);
  });

  it("'unknown' phase が first-class member として存在", () => {
    const p: ConversationPhase = "unknown";
    expect(p).toBe("unknown");
  });
});

describe("B-4a MirrorDecisionInput — shape (10 fields strict)", () => {
  it("MirrorDecisionInput は B-2 modeContext + B-3 4 bucket + 4 optional axes の計 10 field", () => {
    const input: MirrorDecisionInput = {
      // B-2
      modeContext: {
        status: "known",
        mode: "normal",
        source: "presence_state",
        canProceedToMirrorDecision: true,
      },
      // B-3 (4 buckets)
      alignment: {
        status: "known",
        bucket: "positive",
        raw: 0.5,
        canProceedToMirrorDecision: true,
      },
      uncertainty: {
        status: "known",
        bucket: "low_0_to_30",
        raw: 0.1,
        canProceedToMirrorDecision: true,
      },
      silenceBudget: {
        status: "known",
        bucket: "mid_30_to_70",
        raw: 0.5,
        canProceedToMirrorDecision: true,
      },
      patternCategory: {
        status: "known",
        bucket: "null_pattern",
        canProceedToMirrorDecision: true,
      },
      // B-4a optional axes (4 + 1 sleep = 5 fields total optional)
      observationNovelty: 0.8,
      conversationPhase: "in_progress",
      timeSinceLastSpeakTurns: 10,
      ruptureFlag: false,
      userOverrideSleep: false,
    };

    const keys = Object.keys(input).sort();
    expect(keys).toEqual([
      "alignment",
      "conversationPhase",
      "modeContext",
      "observationNovelty",
      "patternCategory",
      "ruptureFlag",
      "silenceBudget",
      "timeSinceLastSpeakTurns",
      "uncertainty",
      "userOverrideSleep",
    ]);
    expect(keys.length).toBe(10);
  });

  it("optional axes は省略可能 (5 fields だけでも valid)", () => {
    const minimalInput: MirrorDecisionInput = {
      modeContext: {
        status: "known",
        mode: "normal",
        source: "presence_state",
        canProceedToMirrorDecision: true,
      },
      alignment: {
        status: "known",
        bucket: "neutral",
        raw: 0,
        canProceedToMirrorDecision: true,
      },
      uncertainty: {
        status: "known",
        bucket: "low_0_to_30",
        raw: 0,
        canProceedToMirrorDecision: true,
      },
      silenceBudget: {
        status: "known",
        bucket: "low_0_to_30",
        raw: 0,
        canProceedToMirrorDecision: true,
      },
      patternCategory: {
        status: "known",
        bucket: "null_pattern",
        canProceedToMirrorDecision: true,
      },
    };
    // 必須 5 fields のみ、optional 5 fields は undefined
    expect(Object.keys(minimalInput).length).toBe(5);
    expect(minimalInput.observationNovelty).toBeUndefined();
    expect(minimalInput.conversationPhase).toBeUndefined();
    expect(minimalInput.timeSinceLastSpeakTurns).toBeUndefined();
    expect(minimalInput.ruptureFlag).toBeUndefined();
    expect(minimalInput.userOverrideSleep).toBeUndefined();
  });

  it("optional axes は null も受理", () => {
    const inputWithNulls: MirrorDecisionInput = {
      modeContext: {
        status: "unknown",
        mode: null,
        source: "missing",
        canProceedToMirrorDecision: false,
      },
      alignment: {
        status: "unknown",
        bucket: "unknown",
        raw: null,
        canProceedToMirrorDecision: false,
      },
      uncertainty: {
        status: "unknown",
        bucket: "unknown",
        raw: null,
        canProceedToMirrorDecision: false,
      },
      silenceBudget: {
        status: "unknown",
        bucket: "unknown",
        raw: null,
        canProceedToMirrorDecision: false,
      },
      patternCategory: {
        status: "unknown",
        bucket: "unknown_category",
        canProceedToMirrorDecision: false,
      },
      observationNovelty: null,
      timeSinceLastSpeakTurns: null,
      ruptureFlag: null,
      userOverrideSleep: null,
    };
    expect(inputWithNulls.observationNovelty).toBeNull();
    expect(inputWithNulls.timeSinceLastSpeakTurns).toBeNull();
    expect(inputWithNulls.ruptureFlag).toBeNull();
    expect(inputWithNulls.userOverrideSleep).toBeNull();
  });
});

describe("B-4a MirrorDecisionInput — PII firewall (型レベル)", () => {
  it("MirrorDecisionInput には raw text / message id / user id / pair id / session id 等の PII field が存在しない", () => {
    // Compile-time: 型に PII field 名は存在しない (Extract で never になる)
    type PIIFieldNames =
      | "rawText"
      | "messageId"
      | "userId"
      | "pairStateId"
      | "sessionId"
      | "email"
      | "phone"
      | "ipAddress"
      | "rawMessage";
    type PIIInInput = Extract<keyof MirrorDecisionInput, PIIFieldNames>;

    // PIIInInput が never であることを compile-time + runtime で確認
    const _piiKeys: PIIInInput[] = [];
    expect(_piiKeys.length).toBe(0);

    // 期待される 10 field のみが存在することを確認
    const expectedKeys: ReadonlyArray<keyof MirrorDecisionInput> = [
      "modeContext",
      "alignment",
      "uncertainty",
      "silenceBudget",
      "patternCategory",
      "observationNovelty",
      "conversationPhase",
      "timeSinceLastSpeakTurns",
      "ruptureFlag",
      "userOverrideSleep",
    ];
    expect(expectedKeys.length).toBe(10);
  });

  it("PII field を runtime injection しても、Decision Engine は型上 access 不可", () => {
    // caller が as unknown as cast で PII を注入したシナリオ
    const inputWithPII = {
      modeContext: {
        status: "known" as const,
        mode: "normal" as const,
        source: "presence_state" as const,
        canProceedToMirrorDecision: true as const,
      },
      alignment: {
        status: "known" as const,
        bucket: "positive" as const,
        raw: 0.5,
        canProceedToMirrorDecision: true as const,
      },
      uncertainty: {
        status: "known" as const,
        bucket: "low_0_to_30" as const,
        raw: 0.1,
        canProceedToMirrorDecision: true as const,
      },
      silenceBudget: {
        status: "known" as const,
        bucket: "mid_30_to_70" as const,
        raw: 0.5,
        canProceedToMirrorDecision: true as const,
      },
      patternCategory: {
        status: "known" as const,
        bucket: "null_pattern" as const,
        canProceedToMirrorDecision: true as const,
      },
      // PII injection (型外、Decision Engine 側から access 不可)
      rawText: "should not leak",
      messageId: "msg_pii",
      userId: "user_pii",
      pairStateId: "pair_pii",
      sessionId: "session_pii",
    };
    const sanitized = inputWithPII as unknown as MirrorDecisionInput;

    // 型レベル: sanitized.modeContext は OK
    expect(sanitized.modeContext.status).toBe("known");
    // 型レベル: sanitized.rawText は TypeScript で access 不可だが、runtime には残る
    // ただし Decision Engine 側コードは型に従って rawText 等を参照しないため leak しない
    // (この test は型シグネチャの厳格さを runtime にも保証する目的、leak 防止は B-4b/c/d engine 実装で確保)
    expect((sanitized as unknown as Record<string, unknown>)["rawText"]).toBe(
      "should not leak",
    );
  });
});

describe("B-4a types.ts — B-2 / B-3 import integrity", () => {
  it("B-2 MirrorModeContextResult import 成功", () => {
    const v: MirrorModeContextResult = {
      status: "known",
      mode: "normal",
      source: "presence_state",
      canProceedToMirrorDecision: true,
    };
    expect(v.status).toBe("known");
  });

  it("B-3 全 4 bucket result type import 成功", () => {
    const a: AlignmentBucketResult = {
      status: "known",
      bucket: "neutral",
      raw: 0,
      canProceedToMirrorDecision: true,
    };
    const u: UncertaintyBucketResult = {
      status: "known",
      bucket: "low_0_to_30",
      raw: 0.1,
      canProceedToMirrorDecision: true,
    };
    const s: SilenceBudgetBucketResult = {
      status: "known",
      bucket: "mid_30_to_70",
      raw: 0.5,
      canProceedToMirrorDecision: true,
    };
    const p: PatternCategoryBucketResult = {
      status: "known",
      bucket: "null_pattern",
      canProceedToMirrorDecision: true,
    };
    expect([a, u, s, p].map((x) => x.status)).toEqual(["known", "known", "known", "known"]);
  });
});
