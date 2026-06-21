import { describe, it, expect } from "vitest";
import {
  loadConsent,
  grantConsent,
  revokeConsent,
  DEFAULT_CONSENT,
  TRAVEL_PERSONALIZATION_CONSENT_KEY,
  type StorageLike,
} from "@/lib/plan/travel/personalizationConsent";

function memStorage(): StorageLike {
  const data: Record<string, string> = {};
  return {
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

describe("UX-6b-2a travel personalization consent (local-only)", () => {
  it("default OFF（未保存 / storage null）", () => {
    expect(loadConsent(memStorage())).toEqual(DEFAULT_CONSENT);
    expect(loadConsent(null)).toEqual(DEFAULT_CONSENT);
    expect(DEFAULT_CONSENT.granted).toBe(false);
  });

  it("grant → ON + grantedAt + scope solo", () => {
    const s = memStorage();
    const c = grantConsent(s, "2026-06-21T00:00:00Z");
    expect(c).toEqual({ granted: true, grantedAt: "2026-06-21T00:00:00Z", scope: "solo" });
    expect(loadConsent(s).granted).toBe(true);
  });

  it("revoke → OFF（即 no-op に戻る）", () => {
    const s = memStorage();
    grantConsent(s, "2026-06-21T00:00:00Z");
    revokeConsent(s);
    expect(loadConsent(s)).toEqual(DEFAULT_CONSENT);
  });

  it("壊れた JSON → default OFF（防御的 parse）", () => {
    const s = memStorage();
    s.setItem(TRAVEL_PERSONALIZATION_CONSENT_KEY, "{not json");
    expect(loadConsent(s)).toEqual(DEFAULT_CONSENT);
  });

  it("granted=true でも grantedAt 欠落 → default OFF（詐称防止）", () => {
    const s = memStorage();
    s.setItem(TRAVEL_PERSONALIZATION_CONSENT_KEY, JSON.stringify({ granted: true, scope: "solo" }));
    expect(loadConsent(s).granted).toBe(false);
  });

  it("scope は常に solo（companions を昇格させない）", () => {
    const s = memStorage();
    s.setItem(
      TRAVEL_PERSONALIZATION_CONSENT_KEY,
      JSON.stringify({ granted: true, grantedAt: "2026-06-21T00:00:00Z", scope: "companions" }),
    );
    expect(loadConsent(s).scope).toBe("solo");
  });
});
