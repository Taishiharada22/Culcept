/**
 * Stage 2 L2-k — urgentTrigger test
 *
 * plan v0.3 §5.11 Gate:
 *   - critical signal 3 種で urgent 起動 (dignity / rupture / safety / heat / asymmetric)
 *   - §8.5.4 3 解除 path (urgentReleaseLogic.test 側)
 *   - §8.6.3 禁止組み合わせ enforce (urgentMemoryPriority.test 側)
 */

import { describe, it, expect } from "vitest";

import {
  detectUrgent,
  type UrgentTriggerInput,
} from "@/lib/coalter/presence/urgentTrigger";
import {
  decideRelease,
  isUrgentAutoRefireBlocked,
} from "@/lib/coalter/presence/urgentReleaseLogic";
import type { PresenceSignal } from "@/lib/coalter/presence/types";

const sig = (
  trigger: string,
  kind: PresenceSignal["kind"] = "critical",
): PresenceSignal => ({
  kind,
  strength: kind === "implicit" ? "soft" : "strong",
  detectedAt: 0,
  meta: { trigger },
});

const baseInput = (
  over: Partial<UrgentTriggerInput> = {},
): UrgentTriggerInput => ({
  signal: sig("heat_escalation"),
  presenceState: "S5",
  ...over,
});

describe("L2-k urgentTrigger — critical signal 各カテゴリで起動", () => {
  it("rupture trigger → category=rupture_detected / form=dominant_card", () => {
    const r = detectUrgent(baseInput({ signal: sig("rupture_detected") }));
    expect(r?.category).toBe("rupture_detected");
    expect(r?.form).toBe("dominant_card");
  });

  it("dignity trigger → category=dignity_violation / form=dominant_card", () => {
    const r = detectUrgent(baseInput({ signal: sig("dignity_violation") }));
    expect(r?.category).toBe("dignity_violation");
    expect(r?.form).toBe("dominant_card");
  });

  it("safety trigger → category=safety_concern / form=dominant_card", () => {
    const r = detectUrgent(baseInput({ signal: sig("safety_concern") }));
    expect(r?.category).toBe("safety_concern");
    expect(r?.form).toBe("dominant_card");
  });

  it("heat trigger → category=heat_escalation / form=overlay_banner", () => {
    const r = detectUrgent(baseInput({ signal: sig("heat_escalation") }));
    expect(r?.category).toBe("heat_escalation");
    expect(r?.form).toBe("overlay_banner");
  });

  it("asymmetric_overload trigger → category=asymmetric_overload / form=inline_cue", () => {
    const r = detectUrgent(baseInput({ signal: sig("asymmetric_overload") }));
    expect(r?.category).toBe("asymmetric_overload");
    expect(r?.form).toBe("inline_cue");
  });

  it("trigger 未指定 critical signal → default heat_escalation", () => {
    const r = detectUrgent(
      baseInput({
        signal: { kind: "critical", strength: "strong", detectedAt: 0 },
      }),
    );
    expect(r?.category).toBe("heat_escalation");
  });
});

describe("L2-k urgentTrigger — §4.3.5 S4 中は urgent 起動禁止", () => {
  it("S4 + critical signal でも urgent 起動しない (§4.3.5 派手さ抑制)", () => {
    const r = detectUrgent(
      baseInput({ presenceState: "S4", signal: sig("rupture_detected") }),
    );
    expect(r).toBeNull();
  });
});

describe("L2-k urgentTrigger — non-critical signal は urgent 起動しない", () => {
  it("explicit signal → null (cooldown active なし時)", () => {
    const r = detectUrgent(
      baseInput({ signal: sig("explicit", "explicit") as PresenceSignal }),
    );
    expect(r).toBeNull();
  });

  it("implicit signal → null", () => {
    const r = detectUrgent(
      baseInput({ signal: sig("implicit", "implicit") as PresenceSignal }),
    );
    expect(r).toBeNull();
  });

  it("dignityActive=true + non-critical signal → dignity_violation 起動 (cooldown active で警告化)", () => {
    const r = detectUrgent(
      baseInput({
        signal: sig("explicit", "explicit") as PresenceSignal,
        dignityActive: true,
      }),
    );
    expect(r?.category).toBe("dignity_violation");
  });

  it("ruptureActive=true + non-critical signal → rupture_detected 起動", () => {
    const r = detectUrgent(
      baseInput({
        signal: sig("explicit", "explicit") as PresenceSignal,
        ruptureActive: true,
      }),
    );
    expect(r?.category).toBe("rupture_detected");
  });
});

describe("L2-k urgentTrigger — memoryFallback 選択 (§8.6.2)", () => {
  it("dominant_card + memoryPanelOpen → compact (空間競合)", () => {
    const r = detectUrgent(
      baseInput({
        signal: sig("rupture_detected"),
        memoryPanelOpen: true,
      }),
    );
    expect(r?.memoryFallback).toBe("compact");
  });

  it("dominant_card + memoryPanelOpen=false → demote (短時間想定)", () => {
    const r = detectUrgent(
      baseInput({
        signal: sig("rupture_detected"),
        memoryPanelOpen: false,
      }),
    );
    expect(r?.memoryFallback).toBe("demote");
  });

  it("expectedDurationMs >= 10000 → compact (長時間)", () => {
    const r = detectUrgent(
      baseInput({
        signal: sig("heat_escalation"),
        expectedDurationMs: 12_000,
      }),
    );
    expect(r?.memoryFallback).toBe("compact");
  });

  it("overlay_banner + 短時間 → demote", () => {
    const r = detectUrgent(
      baseInput({
        signal: sig("heat_escalation"),
        expectedDurationMs: 3_000,
      }),
    );
    expect(r?.memoryFallback).toBe("demote");
  });
});

// ─────────────────────────────────────────────
// urgentReleaseLogic
// ─────────────────────────────────────────────

describe("L2-k urgentReleaseLogic — §8.5.4 4 解除 path", () => {
  it("upper_priority_swap が最優先で released", () => {
    const r = decideRelease({
      upperPrioritySwap: true,
      interventionComplete: true, // 同時 true でも upper が優先
    });
    expect(r.released).toBe(true);
    expect(r.path).toBe("upper_priority_swap");
  });

  it("intervention_complete で released (upper なし)", () => {
    const r = decideRelease({ interventionComplete: true });
    expect(r.path).toBe("intervention_complete");
  });

  it("user_dismiss で released", () => {
    const r = decideRelease({ userDismiss: true });
    expect(r.path).toBe("user_dismiss");
  });

  it("timeoutElapsed で released", () => {
    const r = decideRelease({ timeoutElapsed: true });
    expect(r.path).toBe("timeout");
  });

  it("いずれの trigger も false → released=false", () => {
    expect(decideRelease({}).released).toBe(false);
  });
});

describe("L2-k urgentReleaseLogic — §8.5.4 追加挽留禁止 / 沈黙ペナルティ禁止", () => {
  it("user_dismiss 直後 60s 以内は autoRefire block (追加挽留禁止)", () => {
    expect(isUrgentAutoRefireBlocked("user_dismiss", 30_000)).toBe(true);
    expect(isUrgentAutoRefireBlocked("user_dismiss", 70_000)).toBe(false);
  });

  it("timeout 直後 60s 以内は autoRefire block (沈黙ペナルティ禁止)", () => {
    expect(isUrgentAutoRefireBlocked("timeout", 30_000)).toBe(true);
    expect(isUrgentAutoRefireBlocked("timeout", 70_000)).toBe(false);
  });

  it("intervention_complete / upper_priority_swap は block しない", () => {
    expect(isUrgentAutoRefireBlocked("intervention_complete", 0)).toBe(false);
    expect(isUrgentAutoRefireBlocked("upper_priority_swap", 0)).toBe(false);
  });

  it("blockMs override 可能", () => {
    expect(isUrgentAutoRefireBlocked("user_dismiss", 30_000, 10_000)).toBe(false);
  });
});
