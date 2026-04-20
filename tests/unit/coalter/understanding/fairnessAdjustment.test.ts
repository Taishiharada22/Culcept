/**
 * fairnessAdjustment unit test — sessionId null tiebreak 安定性。
 *
 * [M1 C3] 目的:
 *   - onboarding seed row (sessionId=null) と 実 session 行 (sessionId=string)
 *     が混在しても sort が throw せず、決定論的な順序で処理されること。
 *   - null 同士の比較も 0 を返す (元順序保持) ことで、安定 sort になる。
 *   - 最終的な FairnessAdjustment が deep-equal で再現可能なこと
 *     (非決定的な NaN 化や undefined 化が起きないこと)。
 */

import { describe, it, expect } from "vitest";
import { deriveFairnessAdjustment } from "@/lib/coalter/understanding/fairnessAdjustment";
import type {
  ConversationObservation,
  FairnessRecord,
  IsoTimestamp,
  RelationshipObservation,
} from "@/lib/coalter/understanding/types";

function mkRel(fairnessLedger: FairnessRecord[]): RelationshipObservation {
  return {
    sharedHistory: [],
    fairnessLedger,
    currentTemperature: "neutral",
    interactionPattern: { pace: "steady", initiator: "balanced", conflictStyle: "mixed" },
    unresolvedThreads: [],
    rupturesAndRepairs: [],
  };
}

function mkConv(): ConversationObservation {
  return {
    turns: [],
    theme: null,
    extractedConstraints: {
      date: null,
      location: null,
      budget: null,
      timeSlot: null,
      preferences: [],
    },
    caringIntensity: { a: 0.5, b: 0.5 },
    implicitMood: "",
    energyLevel: "mid",
    conversationArc: "opening",
    questionGuardState: null,
  };
}

const T = (iso: string) => iso as IsoTimestamp;

describe("deriveFairnessAdjustment — sessionId null 混在", () => {
  it("seed row (null) + 実 session 行 を含む ledger で throw しない", () => {
    const ledger: FairnessRecord[] = [
      { sessionId: null, decidedAt: T("2026-04-20T00:00:00Z"), skew: 0, topic: "" },
      { sessionId: "s1", decidedAt: T("2026-04-21T00:00:00Z"), skew: -0.5, topic: "" },
      { sessionId: "s2", decidedAt: T("2026-04-22T00:00:00Z"), skew: -0.4, topic: "" },
    ];
    const result = deriveFairnessAdjustment(mkRel(ledger), mkConv());
    // seed=0 + A 寄り 2 件 → B 補正が返る想定 (mean ≈ -0.3)
    expect(result.favorSide).toBe("b");
    expect(result.basedOnSessionCount).toBe(3);
  });

  it("同 decidedAt で sessionId null と string が混在しても決定論", () => {
    const sameTime = T("2026-04-22T00:00:00Z");
    const ledgerA: FairnessRecord[] = [
      { sessionId: null, decidedAt: sameTime, skew: 0, topic: "" },
      { sessionId: "sX", decidedAt: sameTime, skew: -0.6, topic: "" },
    ];
    const ledgerB: FairnessRecord[] = [
      { sessionId: "sX", decidedAt: sameTime, skew: -0.6, topic: "" },
      { sessionId: null, decidedAt: sameTime, skew: 0, topic: "" },
    ];
    const rA = deriveFairnessAdjustment(mkRel(ledgerA), mkConv());
    const rB = deriveFairnessAdjustment(mkRel(ledgerB), mkConv());
    // null → "" で寄せる tiebreak により、入力順に依らず同一結果
    expect(rB).toEqual(rA);
  });

  it("null だけの ledger (seed のみ) でも throw せず 無補正相当を返す", () => {
    const ledger: FairnessRecord[] = [
      { sessionId: null, decidedAt: T("2026-04-20T00:00:00Z"), skew: 0, topic: "" },
    ];
    const result = deriveFairnessAdjustment(mkRel(ledger), mkConv());
    // skew=0 のみで LEDGER_SKEW_FLOOR(0.2) に届かない → favorSide=null
    expect(result.favorSide).toBeNull();
    expect(result.basedOnSessionCount).toBe(1);
  });
});
