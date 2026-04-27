/**
 * Stage 4 L4-d — Reactivation Flow test
 *
 * plan v0.3 §7.4 Gate:
 *   - disabled → enabled 直接遷移が UI 上存在しない
 *   - disabled → pending_consent → enabled の 2 step 経路
 */

import { describe, it, expect } from "vitest";

import CoAlterReactivationFlow from "@/app/components/chat/CoAlterReactivationFlow";
import CoAlterDisabledUi from "@/app/components/chat/CoAlterDisabledUi";
import { availabilityReducer } from "@/lib/coalter/presence/availability";

describe("L4-d Reactivation Flow — module shape", () => {
  it("CoAlterReactivationFlow / CoAlterDisabledUi が function export", () => {
    expect(typeof CoAlterReactivationFlow).toBe("function");
    expect(typeof CoAlterDisabledUi).toBe("function");
  });
});

describe("L4-d 不可侵 — disabled → enabled 直接遷移は availabilityReducer で禁止", () => {
  it("disabled + CONSENT_GRANTED → state 不変 (REENABLE_REQUEST 経由必須)", () => {
    expect(
      availabilityReducer("disabled", { type: "CONSENT_GRANTED" }),
    ).toBe("disabled");
  });

  it("disabled + ACTIVATE → state 不変 (enabled 経由必須)", () => {
    expect(availabilityReducer("disabled", { type: "ACTIVATE" })).toBe(
      "disabled",
    );
  });

  it("disabled + REENABLE_REQUEST → pending_consent (唯一の経路)", () => {
    expect(
      availabilityReducer("disabled", { type: "REENABLE_REQUEST" }),
    ).toBe("pending_consent");
  });

  it("disabled → pending_consent → enabled 2 step 経路", () => {
    let av = availabilityReducer("disabled", { type: "REENABLE_REQUEST" });
    expect(av).toBe("pending_consent");
    av = availabilityReducer(av, { type: "CONSENT_GRANTED" });
    expect(av).toBe("enabled");
  });
});

describe("L4-d 構造 invariant — Reactivation Flow component の経路", () => {
  it("CoAlterReactivationFlow.tsx は availability ベースで分岐 (disabled → DisabledUi / pending → ConsentFlow)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/CoAlterReactivationFlow.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    // disabled / pending_consent それぞれの分岐
    expect(content).toMatch(/availability\s*===\s*["']disabled["']/);
    expect(content).toMatch(/availability\s*===\s*["']pending_consent["']/);
    // enabled / active / inactive は本 component の責務外 (return null)
    expect(content).toMatch(/return\s+null/);
  });

  it("CoAlterDisabledUi.tsx に「再有効化を提案」button + onReenableRequest", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/CoAlterDisabledUi.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(/onReenableRequest/);
    expect(content).toMatch(/再有効化/);
    expect(content).toMatch(/coalter-reenable-request/);
  });

  it("CoAlterDisabledUi に「直接 enabled に戻す」button が存在しない", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/CoAlterDisabledUi.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    // ACTIVATE / CONSENT_GRANTED 直接呼び出しの prop 名がない
    expect(content).not.toMatch(/onActivate/);
    expect(content).not.toMatch(/onConsentGranted/);
    expect(content).not.toMatch(/onEnable\b/);
  });
});
