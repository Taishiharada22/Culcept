/**
 * Phase 3-N Plan P2 Step 2 v3.1 — HDM Phase ゲート contract test
 *
 * 検証範囲 (= readiness v3.1 §3.3 確定):
 *   - getPhaseFramingHint (= Phase → framing level)
 *   - evaluatePhaseGate (= 統合判定)
 *   - evaluatePhaseGateForUser (= stub)
 *
 * 不変原則:
 *   - pure (= 同 phase → 同 result)
 *   - LLM / API / DB 不使用
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  getPhaseFramingHint,
  evaluatePhaseGate,
  evaluatePhaseGateForUser,
} from "@/lib/plan/llm/hdmPhaseGate";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// getPhaseFramingHint
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("getPhaseFramingHint", () => {
  it("Phase 0-1 → no_personal_framing", () => {
    expect(getPhaseFramingHint(0)).toBe("no_personal_framing");
    expect(getPhaseFramingHint(1)).toBe("no_personal_framing");
  });

  it("Phase 2 → soft_personal_with_hedge", () => {
    expect(getPhaseFramingHint(2)).toBe("soft_personal_with_hedge");
  });

  it("Phase 3 → moderate_personal", () => {
    expect(getPhaseFramingHint(3)).toBe("moderate_personal");
  });

  it("Phase 4-5 → deep_personal_framing", () => {
    expect(getPhaseFramingHint(4)).toBe("deep_personal_framing");
    expect(getPhaseFramingHint(5)).toBe("deep_personal_framing");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// evaluatePhaseGate (= 統合判定)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("evaluatePhaseGate", () => {
  it("Phase 0: allow=false, readoutLevel=meta_only, framing=no_personal", () => {
    const r = evaluatePhaseGate(0);
    expect(r.allowPersonalModelInjection).toBe(false);
    expect(r.readoutLevel).toBe("meta_only");
    expect(r.framingHint).toBe("no_personal_framing");
  });

  it("Phase 1: allow=false (= 個別化解禁前)", () => {
    const r = evaluatePhaseGate(1);
    expect(r.allowPersonalModelInjection).toBe(false);
  });

  it("Phase 2: allow=true, readoutLevel=stable", () => {
    const r = evaluatePhaseGate(2);
    expect(r.allowPersonalModelInjection).toBe(true);
    expect(r.readoutLevel).toBe("stable");
    expect(r.framingHint).toBe("soft_personal_with_hedge");
  });

  it("Phase 3: readoutLevel=stable_recent", () => {
    const r = evaluatePhaseGate(3);
    expect(r.allowPersonalModelInjection).toBe(true);
    expect(r.readoutLevel).toBe("stable_recent");
    expect(r.framingHint).toBe("moderate_personal");
  });

  it("Phase 4: readoutLevel=full + deep framing", () => {
    const r = evaluatePhaseGate(4);
    expect(r.readoutLevel).toBe("full");
    expect(r.framingHint).toBe("deep_personal_framing");
  });

  it("Phase 5: 同 Phase 4 と同等の解禁", () => {
    const r = evaluatePhaseGate(5);
    expect(r.readoutLevel).toBe("full");
    expect(r.framingHint).toBe("deep_personal_framing");
  });

  it("deterministic (= 同 phase → 同 result)", () => {
    expect(evaluatePhaseGate(3)).toEqual(evaluatePhaseGate(3));
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// evaluatePhaseGateForUser (= server stub)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("evaluatePhaseGateForUser: server stub", () => {
  it("userId 不在 → Phase 0 fallback", async () => {
    const r = await evaluatePhaseGateForUser();
    expect(r.allowPersonalModelInjection).toBe(false);
    expect(r.readoutLevel).toBe("meta_only");
  });

  it("userId 指定 → Step 2 v3.1 では Phase 0 fallback (= 実 wire 別 Step)", async () => {
    const r = await evaluatePhaseGateForUser("user-x");
    expect(r.allowPersonalModelInjection).toBe(false);
  });
});
