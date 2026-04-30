/**
 * Stage 4 L4-d — CoAlterConsentFlow test
 *
 * plan v0.3 §7.4 Gate:
 *   - pending_consent UI が表示
 *   - 拒否 / 無応答タイムアウト カバー
 *
 * test strategy: React 描画なし (構造的 invariant + module shape)。
 * 実 click 動作は L4-l 統合 E2E で検証。
 */

import { describe, it, expect } from "vitest";

import CoAlterConsentFlow from "@/app/components/chat/CoAlterConsentFlow";
import { availabilityReducer } from "@/lib/coalter/presence/availability";

describe("L4-d CoAlterConsentFlow — module shape", () => {
  it("default export が React function component", () => {
    expect(typeof CoAlterConsentFlow).toBe("function");
    expect(CoAlterConsentFlow.name).toBe("CoAlterConsentFlow");
  });
});

describe("L4-d 構造 invariant — pending_consent / 72h timeout / consent reducer 整合", () => {
  it("CoAlterConsentFlow.tsx に TIMEOUT_72H_MS が定義済 (master §5「72h 無応答」)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/CoAlterConsentFlow.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(/TIMEOUT_72H_MS/);
    expect(content).toMatch(/72\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);
  });

  it("requester / askee 両 path がある (isRequester で分岐)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/CoAlterConsentFlow.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(/isRequester/);
    expect(content).toMatch(/coalter-consent-requesting/);
    expect(content).toMatch(/coalter-consent-asking/);
    expect(content).toMatch(/coalter-consent-grant/);
    expect(content).toMatch(/coalter-consent-reject/);
  });
});

describe("L4-d availability reducer 整合 (master §5 経路)", () => {
  it("inactive + REQUEST_CONSENT → pending_consent", () => {
    expect(
      availabilityReducer("inactive", { type: "REQUEST_CONSENT" }),
    ).toBe("pending_consent");
  });

  it("pending_consent + CONSENT_GRANTED → enabled", () => {
    expect(
      availabilityReducer("pending_consent", { type: "CONSENT_GRANTED" }),
    ).toBe("enabled");
  });

  it("pending_consent + CONSENT_REJECTED → inactive (拒否経路)", () => {
    expect(
      availabilityReducer("pending_consent", { type: "CONSENT_REJECTED" }),
    ).toBe("inactive");
  });

  it("pending_consent から enabled 以外への迂回経路がない (master §5)", () => {
    // disabled / active 等への直接遷移は不可
    const events: Array<Parameters<typeof availabilityReducer>[1]> = [
      { type: "ACTIVATE" },
      { type: "OPT_OUT" },
      { type: "SESSION_END" },
      { type: "REENABLE_REQUEST" },
    ];
    for (const e of events) {
      expect(availabilityReducer("pending_consent", e)).toBe("pending_consent");
    }
  });
});
