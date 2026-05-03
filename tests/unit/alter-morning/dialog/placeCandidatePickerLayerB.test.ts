/**
 * PlaceCandidatePicker Layer B unit tests (B-3c-2 Commit 3)
 *
 * pure helper isCandidateInvalidCoordinates のみ検証 (= UI render は別レイヤー)。
 * Layer A をすり抜けた候補が UI で disabled 化されることの構造保証。
 */

import { describe, it, expect } from "vitest";
import { isCandidateInvalidCoordinates } from "@/components/alter-morning/PlaceCandidatePicker";

describe("isCandidateInvalidCoordinates (Layer B)", () => {
  it("validCoordinates undefined (= legacy candidate) → false (= disabled しない、既存挙動維持)", () => {
    expect(isCandidateInvalidCoordinates({})).toBe(false);
    expect(isCandidateInvalidCoordinates({ validCoordinates: undefined })).toBe(
      false,
    );
  });

  it("validCoordinates: true (= Layer A 通過後) → false", () => {
    expect(isCandidateInvalidCoordinates({ validCoordinates: true })).toBe(
      false,
    );
  });

  it("validCoordinates: false (= Layer A をすり抜けた稀ケース) → true", () => {
    expect(isCandidateInvalidCoordinates({ validCoordinates: false })).toBe(
      true,
    );
  });
});
