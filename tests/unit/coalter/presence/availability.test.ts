/**
 * Stage 2 L2-e — availability 5 状態遷移 test
 *
 * plan §5.5 Gate:
 *   - 5 状態遷移 PASS
 *   - disabled → enabled 直接遷移禁止 / pending_consent 経由必須
 */

import { describe, it, expect } from "vitest";

import {
  availabilityReducer,
  initialAvailability,
  isUiVisible,
  getPresenceMobility,
} from "@/lib/coalter/presence/availability";
import type { ExecutorAvailability } from "@/lib/coalter/presence/types";

describe("L2-e availability — master §5 状態遷移", () => {
  it("初期 state は inactive", () => {
    expect(initialAvailability()).toBe("inactive");
  });

  it("inactive → pending_consent (REQUEST_CONSENT)", () => {
    expect(availabilityReducer("inactive", { type: "REQUEST_CONSENT" })).toBe(
      "pending_consent",
    );
  });

  it("pending_consent → enabled (CONSENT_GRANTED)", () => {
    expect(
      availabilityReducer("pending_consent", { type: "CONSENT_GRANTED" }),
    ).toBe("enabled");
  });

  it("pending_consent → inactive (CONSENT_REJECTED)", () => {
    expect(
      availabilityReducer("pending_consent", { type: "CONSENT_REJECTED" }),
    ).toBe("inactive");
  });

  it("enabled → active (ACTIVATE)", () => {
    expect(availabilityReducer("enabled", { type: "ACTIVATE" })).toBe("active");
  });

  it("active → enabled (SESSION_END)", () => {
    expect(availabilityReducer("active", { type: "SESSION_END" })).toBe(
      "enabled",
    );
  });

  it("enabled / active → disabled (OPT_OUT、master §5: enabled / active どちらからも opt-out)", () => {
    expect(availabilityReducer("enabled", { type: "OPT_OUT" })).toBe("disabled");
    expect(availabilityReducer("active", { type: "OPT_OUT" })).toBe("disabled");
  });

  it("disabled → pending_consent (REENABLE_REQUEST、必ず pending_consent 経由)", () => {
    expect(
      availabilityReducer("disabled", { type: "REENABLE_REQUEST" }),
    ).toBe("pending_consent");
  });
});

describe("L2-e availability — 不正遷移は state 不変 (defensive)", () => {
  it("disabled → enabled 直接遷移は禁止 (master §5 / 統合契約 §2.1 不可侵)", () => {
    // CONSENT_GRANTED は pending_consent でのみ受容
    expect(
      availabilityReducer("disabled", { type: "CONSENT_GRANTED" }),
    ).toBe("disabled");
    // ACTIVATE は enabled でのみ受容
    expect(availabilityReducer("disabled", { type: "ACTIVATE" })).toBe(
      "disabled",
    );
  });

  it("inactive から ACTIVATE / OPT_OUT 等は state 不変", () => {
    expect(availabilityReducer("inactive", { type: "ACTIVATE" })).toBe(
      "inactive",
    );
    expect(availabilityReducer("inactive", { type: "OPT_OUT" })).toBe(
      "inactive",
    );
    expect(availabilityReducer("inactive", { type: "SESSION_END" })).toBe(
      "inactive",
    );
  });

  it("enabled に対する CONSENT_GRANTED 等は state 不変", () => {
    expect(
      availabilityReducer("enabled", { type: "CONSENT_GRANTED" }),
    ).toBe("enabled");
    expect(
      availabilityReducer("enabled", { type: "REQUEST_CONSENT" }),
    ).toBe("enabled");
  });

  it("active から REENABLE_REQUEST は state 不変", () => {
    expect(
      availabilityReducer("active", { type: "REENABLE_REQUEST" }),
    ).toBe("active");
  });
});

describe("L2-e availability — UI 可視性 / Presence 可動域 (統合契約 §2.2)", () => {
  it("isUiVisible: enabled / active のみ true", () => {
    expect(isUiVisible("enabled")).toBe(true);
    expect(isUiVisible("active")).toBe(true);
    expect(isUiVisible("disabled")).toBe(false);
    expect(isUiVisible("inactive")).toBe(false);
    expect(isUiVisible("pending_consent")).toBe(false);
  });

  it("getPresenceMobility: active=all / enabled=s0_only / 他=none", () => {
    expect(getPresenceMobility("active")).toBe("all");
    expect(getPresenceMobility("enabled")).toBe("s0_only");
    expect(getPresenceMobility("disabled")).toBe("none");
    expect(getPresenceMobility("inactive")).toBe("none");
    expect(getPresenceMobility("pending_consent")).toBe("none");
  });
});

describe("L2-e availability — フロー網羅 (master §5 図)", () => {
  it("inactive → pending_consent → enabled → active → enabled → disabled → pending_consent → enabled (full cycle)", () => {
    let av: ExecutorAvailability = initialAvailability();
    av = availabilityReducer(av, { type: "REQUEST_CONSENT" });
    expect(av).toBe("pending_consent");
    av = availabilityReducer(av, { type: "CONSENT_GRANTED" });
    expect(av).toBe("enabled");
    av = availabilityReducer(av, { type: "ACTIVATE" });
    expect(av).toBe("active");
    av = availabilityReducer(av, { type: "SESSION_END" });
    expect(av).toBe("enabled");
    av = availabilityReducer(av, { type: "OPT_OUT" });
    expect(av).toBe("disabled");
    av = availabilityReducer(av, { type: "REENABLE_REQUEST" });
    expect(av).toBe("pending_consent");
    av = availabilityReducer(av, { type: "CONSENT_GRANTED" });
    expect(av).toBe("enabled");
  });

  it("inactive → pending_consent → inactive (拒否経路、72h 無応答 / 明示拒否)", () => {
    let av: ExecutorAvailability = "inactive";
    av = availabilityReducer(av, { type: "REQUEST_CONSENT" });
    av = availabilityReducer(av, { type: "CONSENT_REJECTED" });
    expect(av).toBe("inactive");
  });

  it("active から OPT_OUT で disabled へ直接 (master §5: active からも opt-out 可)", () => {
    let av: ExecutorAvailability = "active";
    av = availabilityReducer(av, { type: "OPT_OUT" });
    expect(av).toBe("disabled");
  });
});
