import { describe, it, expect } from "vitest";

import { shouldUseComposeSheet } from "@/lib/plan/compose/composeGate";

describe("shouldUseComposeSheet（A-4b gate）", () => {
  it("flag OFF（false）→ legacy（false）", () => {
    expect(shouldUseComposeSheet(false)).toBe(false);
  });

  it("flag ON（true）のときだけ compose（true）", () => {
    expect(shouldUseComposeSheet(true)).toBe(true);
  });
});
