/**
 * Stage 2 L2-h — modeReducer 7 ケース test
 *
 * plan v0.3 §5.8 Gate (test 7 ケース):
 *   ① 通常 → Daily 手動切替
 *   ② 通常 → Travel 手動切替
 *   ③ 通常 → Daily/Travel 自動昇格 (明示 mode_promotion signal)
 *   ④ 暗黙 signal で昇格しない (§11.5 enforce)
 *   ⑤ Daily → 通常復帰
 *   ⑥ Travel → 通常復帰
 *   ⑦ Daily ↔ Travel 直接遷移禁止
 */

import { describe, it, expect } from "vitest";

import {
  modeReducer,
  initialMode,
  type ModeEvent,
} from "@/lib/coalter/presence/modeReducer";
import type { PresenceMode, PresenceSignal } from "@/lib/coalter/presence/types";

const sig = (
  kind: PresenceSignal["kind"],
  meta?: Record<string, unknown>,
): PresenceSignal => ({
  kind,
  strength: kind === "implicit" ? "soft" : "strong",
  detectedAt: 0,
  meta,
});

describe("L2-h modeReducer — ① 通常 → Daily 手動切替", () => {
  it("通常 + MANUAL_SWITCH(daily) → daily", () => {
    expect(modeReducer("normal", { type: "MANUAL_SWITCH", target: "daily" })).toBe(
      "daily",
    );
  });
});

describe("L2-h modeReducer — ② 通常 → Travel 手動切替", () => {
  it("通常 + MANUAL_SWITCH(travel) → travel", () => {
    expect(modeReducer("normal", { type: "MANUAL_SWITCH", target: "travel" })).toBe(
      "travel",
    );
  });
});

describe("L2-h modeReducer — ③ 通常 → Daily/Travel 自動昇格 (明示 mode_promotion signal)", () => {
  it("通常 + AUTO_ESCALATE(daily, mode_promotion signal) → daily", () => {
    const event: ModeEvent = {
      type: "AUTO_ESCALATE",
      target: "daily",
      signal: sig("mode_promotion", { target: "daily" }),
    };
    expect(modeReducer("normal", event)).toBe("daily");
  });

  it("通常 + AUTO_ESCALATE(travel, mode_promotion signal) → travel", () => {
    const event: ModeEvent = {
      type: "AUTO_ESCALATE",
      target: "travel",
      signal: sig("mode_promotion", { target: "travel" }),
    };
    expect(modeReducer("normal", event)).toBe("travel");
  });
});

describe("L2-h modeReducer — ④ 暗黙 signal で昇格しない (§11.5 enforce)", () => {
  it("通常 + AUTO_ESCALATE + implicit signal → 不変", () => {
    const event: ModeEvent = {
      type: "AUTO_ESCALATE",
      target: "daily",
      signal: sig("implicit"),
    };
    expect(modeReducer("normal", event)).toBe("normal");
  });

  it("通常 + AUTO_ESCALATE + critical signal → 不変 (critical も自動昇格 trigger ではない)", () => {
    const event: ModeEvent = {
      type: "AUTO_ESCALATE",
      target: "daily",
      signal: sig("critical"),
    };
    expect(modeReducer("normal", event)).toBe("normal");
  });

  it("通常 + AUTO_ESCALATE + explicit signal → 不変 (explicit は手動切替経路、AUTO 経路では受容しない)", () => {
    const event: ModeEvent = {
      type: "AUTO_ESCALATE",
      target: "daily",
      signal: sig("explicit"),
    };
    expect(modeReducer("normal", event)).toBe("normal");
  });

  it("通常 + AUTO_ESCALATE + manual_restart signal → 不変", () => {
    const event: ModeEvent = {
      type: "AUTO_ESCALATE",
      target: "daily",
      signal: sig("manual_restart"),
    };
    expect(modeReducer("normal", event)).toBe("normal");
  });
});

describe("L2-h modeReducer — ⑤ Daily → 通常復帰", () => {
  it("daily + PLAN_COMPLETE → normal (§6.5.1 自然退出)", () => {
    expect(modeReducer("daily", { type: "PLAN_COMPLETE" })).toBe("normal");
  });

  it("daily + MANUAL_RETURN → normal (§6.5.2 手動復帰)", () => {
    expect(modeReducer("daily", { type: "MANUAL_RETURN" })).toBe("normal");
  });

  it("daily + MANUAL_SWITCH(normal) → normal (chip [通常] tap)", () => {
    expect(
      modeReducer("daily", { type: "MANUAL_SWITCH", target: "normal" }),
    ).toBe("normal");
  });
});

describe("L2-h modeReducer — ⑥ Travel → 通常復帰", () => {
  it("travel + PLAN_COMPLETE → normal", () => {
    expect(modeReducer("travel", { type: "PLAN_COMPLETE" })).toBe("normal");
  });

  it("travel + MANUAL_RETURN → normal", () => {
    expect(modeReducer("travel", { type: "MANUAL_RETURN" })).toBe("normal");
  });

  it("travel + MANUAL_SWITCH(normal) → normal", () => {
    expect(
      modeReducer("travel", { type: "MANUAL_SWITCH", target: "normal" }),
    ).toBe("normal");
  });
});

describe("L2-h modeReducer — ⑦ Daily ↔ Travel 直接遷移禁止 (v1.1 §2.3 通常モード本体性)", () => {
  it("daily + MANUAL_SWITCH(travel) → 不変 (Daily → Travel 直接禁止)", () => {
    expect(
      modeReducer("daily", { type: "MANUAL_SWITCH", target: "travel" }),
    ).toBe("daily");
  });

  it("travel + MANUAL_SWITCH(daily) → 不変 (Travel → Daily 直接禁止)", () => {
    expect(
      modeReducer("travel", { type: "MANUAL_SWITCH", target: "daily" }),
    ).toBe("travel");
  });

  it("Daily ↔ Travel は通常経由必須 (2 step: Daily → normal → Travel)", () => {
    let mode: PresenceMode = "daily";
    mode = modeReducer(mode, { type: "MANUAL_SWITCH", target: "normal" });
    expect(mode).toBe("normal");
    mode = modeReducer(mode, { type: "MANUAL_SWITCH", target: "travel" });
    expect(mode).toBe("travel");
  });
});

describe("L2-h modeReducer — 追加 invariant", () => {
  it("初期 mode = normal (v1.1 §2.3 本体性)", () => {
    expect(initialMode()).toBe("normal");
  });

  it("Daily 中の AUTO_ESCALATE → 不変 (通常からのみ昇格)", () => {
    const event: ModeEvent = {
      type: "AUTO_ESCALATE",
      target: "travel",
      signal: sig("mode_promotion", { target: "travel" }),
    };
    expect(modeReducer("daily", event)).toBe("daily");
  });

  it("normal 中の PLAN_COMPLETE / MANUAL_RETURN → normal 不変", () => {
    expect(modeReducer("normal", { type: "PLAN_COMPLETE" })).toBe("normal");
    expect(modeReducer("normal", { type: "MANUAL_RETURN" })).toBe("normal");
  });

  it("同一 mode への MANUAL_SWITCH は no-op", () => {
    expect(modeReducer("normal", { type: "MANUAL_SWITCH", target: "normal" })).toBe(
      "normal",
    );
    expect(modeReducer("daily", { type: "MANUAL_SWITCH", target: "daily" })).toBe(
      "daily",
    );
  });
});
