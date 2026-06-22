// tests/unit/plan/postVisit/postVisitDogfoodFlag.test.ts
// 評価OS Stage 4-A3b: dogfood flag を dev-only env で点火できることの検証。
//   default OFF / dev + env=1 で ON / production は env でも必ず false（hard block）/ "1" 以外は OFF。
import { describe, it, expect, vi, afterEach } from "vitest";
import { isPostVisitCheckEnabled } from "@/lib/plan/postVisit/postVisitObservation";
import { isFitArcReadoutEnabled } from "@/lib/plan/postVisit/fitArcReadout";

afterEach(() => vi.unstubAllEnvs());

const POST = "NEXT_PUBLIC_ANEURASYNC_POST_VISIT_DOGFOOD";
const ARC = "NEXT_PUBLIC_ANEURASYNC_FIT_ARC_DOGFOOD";

describe("dogfood env flag — dev-only 点火 / production hard block / default OFF", () => {
  it("★env 未設定 + dev → OFF（default・source const 編集不要のまま OFF）", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv(POST, "");
    vi.stubEnv(ARC, "");
    expect(isPostVisitCheckEnabled()).toBe(false);
    expect(isFitArcReadoutEnabled()).toBe(false);
  });
  it("★dev + env=1 → ON（source 編集なしで dev session のみ点火）", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv(POST, "1");
    vi.stubEnv(ARC, "1");
    expect(isPostVisitCheckEnabled()).toBe(true);
    expect(isFitArcReadoutEnabled()).toBe(true);
  });
  it("★production + env=1 → false（hard block・env が立っても必ず false）", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv(POST, "1");
    vi.stubEnv(ARC, "1");
    expect(isPostVisitCheckEnabled()).toBe(false);
    expect(isFitArcReadoutEnabled()).toBe(false);
  });
  it("★env が '1' 以外 → OFF（厳密一致のみ点火）", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv(POST, "true");
    vi.stubEnv(ARC, "yes");
    expect(isPostVisitCheckEnabled()).toBe(false);
    expect(isFitArcReadoutEnabled()).toBe(false);
  });
  it("★2 flag は独立（postVisit のみ ON で fit-arc は OFF のまま）", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv(POST, "1");
    vi.stubEnv(ARC, "");
    expect(isPostVisitCheckEnabled()).toBe(true);
    expect(isFitArcReadoutEnabled()).toBe(false);
  });
});
