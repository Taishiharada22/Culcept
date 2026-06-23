// tests/unit/plan/postVisit/crossDomainContract.test.ts
// 評価OS ②-6: cross-domain 一方向契約の検証。
//   invariant_core のみ転移可・domain_surface(具体選好)は転移不可・同一ドメインは全通し・
//   ★gap test: source の具体選好(locationCategory)が target に漏れない。
import { describe, it, expect } from "vitest";
import {
  isTransferable,
  transferTendencies,
  assertNoSurfaceLeak,
  AXIS_TRANSFERABILITY,
} from "@/lib/plan/postVisit/crossDomainContract";
import type { PersonaTendency } from "@/lib/plan/postVisit/personaPrior";

function tendency(axis: string): PersonaTendency {
  return { axis: axis as PersonaTendency["axis"], label: axis, preferredValue: "x", strength: 0.03, confidence: "observed", evidenceCount: 10, note: "" };
}

describe("isTransferable / 契約", () => {
  it("★判断原理(companion/gap/timeOfDay/dayType) は転移可", () => {
    for (const a of ["companion", "gapBucket", "timeOfDay", "dayType"]) expect(isTransferable(a)).toBe(true);
  });
  it("★具体選好(locationCategory) は転移不可", () => {
    expect(isTransferable("locationCategory")).toBe(false);
    expect(AXIS_TRANSFERABILITY.locationCategory).toBe("domain_surface");
  });
});

describe("transferTendencies — 一方向契約", () => {
  const tendencies = [tendency("companion"), tendency("gapBucket"), tendency("locationCategory"), tendency("mobilityLoad")];
  it("★同一ドメイン → 全て通す", () => {
    expect(transferTendencies(tendencies, "place", "place")).toHaveLength(4);
  });
  it("★クロスドメイン → invariant_core のみ（locationCategory/mobilityLoad は落ちる）", () => {
    const out = transferTendencies(tendencies, "place", "food");
    expect(out.map((t) => t.axis).sort()).toEqual(["companion", "gapBucket"]);
    expect(out.some((t) => t.axis === "locationCategory")).toBe(false);
  });
  it("★★gap test: source の具体選好(locationCategory)が target ranking に漏れない", () => {
    const out = transferTendencies([tendency("locationCategory")], "food", "purchase");
    expect(out).toHaveLength(0); // 具体選好は1つも渡らない
    expect(assertNoSurfaceLeak(out)).toBe(true);
  });
  it("★assertNoSurfaceLeak: 転移後に domain_surface が残っていない", () => {
    const out = transferTendencies(tendencies, "place", "travel");
    expect(assertNoSurfaceLeak(out)).toBe(true);
    // 故意に surface を混ぜると false（契約違反検出）
    expect(assertNoSurfaceLeak([...out, tendency("locationCategory")])).toBe(false);
  });
});
