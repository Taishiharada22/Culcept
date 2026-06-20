import { describe, it, expect } from "vitest";

import { isSourceMarkerSmokeEnabled } from "@/app/(culcept)/plan/dev-source-marker-smoke/sourceMarkerSmokeGate";

describe("isSourceMarkerSmokeEnabled — dev preview の強い gate", () => {
  it("default（flag 未設定）は false", () => {
    expect(isSourceMarkerSmokeEnabled({})).toBe(false);
    expect(
      isSourceMarkerSmokeEnabled({ flag: undefined, nodeEnv: "development" })
    ).toBe(false);
  });

  it("flag='true' + non-production で true", () => {
    expect(
      isSourceMarkerSmokeEnabled({ flag: "true", nodeEnv: "development" })
    ).toBe(true);
    expect(
      isSourceMarkerSmokeEnabled({ flag: "true", nodeEnv: "test" })
    ).toBe(true);
  });

  it("production は flag='true' でも常に false（production deny）", () => {
    expect(
      isSourceMarkerSmokeEnabled({ flag: "true", nodeEnv: "production" })
    ).toBe(false);
  });

  it("flag が 'true' 以外は false（厳密一致）", () => {
    expect(
      isSourceMarkerSmokeEnabled({ flag: "1", nodeEnv: "development" })
    ).toBe(false);
    expect(
      isSourceMarkerSmokeEnabled({ flag: "TRUE", nodeEnv: "development" })
    ).toBe(false);
  });
});
