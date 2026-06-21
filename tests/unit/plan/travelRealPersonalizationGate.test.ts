import { describe, it, expect, vi } from "vitest";
import {
  isRealPersonalizationReadAllowed,
  resolveRealSoftPersonalization,
  type InjectedSnapshotReader,
} from "@/lib/plan/travel/realPersonalizationGate";

describe("UX-6b-2a real personalization gate (flag ∧ consent ∧ solo)", () => {
  it("全 ON + solo → true", () => {
    expect(isRealPersonalizationReadAllowed({ flagEnabled: true, consentGranted: true, mode: "solo" })).toBe(true);
  });
  it("flag OFF → false（no-op）", () => {
    expect(isRealPersonalizationReadAllowed({ flagEnabled: false, consentGranted: true, mode: "solo" })).toBe(false);
  });
  it("consent OFF → false（no-op）", () => {
    expect(isRealPersonalizationReadAllowed({ flagEnabled: true, consentGranted: false, mode: "solo" })).toBe(false);
  });
  it("companions（non-solo）→ false（HOLD）", () => {
    expect(isRealPersonalizationReadAllowed({ flagEnabled: true, consentGranted: true, mode: "companions" })).toBe(false);
  });
});

describe("UX-6b-2a resolveRealSoftPersonalization (caller skeleton・inject・snapshotReader 未実行)", () => {
  it("gate false（flag OFF）→ null かつ reader 未呼出", async () => {
    const reader: InjectedSnapshotReader = { read: vi.fn(async () => null) };
    const r = await resolveRealSoftPersonalization({ flagEnabled: false, consentGranted: true, mode: "solo" }, reader);
    expect(r).toBeNull();
    expect(reader.read).not.toHaveBeenCalled(); // snapshotReader 未実行
  });

  it("gate false（consent OFF）→ reader 未呼出", async () => {
    const reader: InjectedSnapshotReader = { read: vi.fn(async () => null) };
    await resolveRealSoftPersonalization({ flagEnabled: true, consentGranted: false, mode: "solo" }, reader);
    expect(reader.read).not.toHaveBeenCalled();
  });

  it("gate false（companions）→ reader 未呼出", async () => {
    const reader: InjectedSnapshotReader = { read: vi.fn(async () => null) };
    await resolveRealSoftPersonalization({ flagEnabled: true, consentGranted: true, mode: "companions" }, reader);
    expect(reader.read).not.toHaveBeenCalled();
  });

  it("gate true（全 ON）→ inject reader を呼ぶ（fake・snapshot null → null）", async () => {
    const reader: InjectedSnapshotReader = { read: vi.fn(async () => null) };
    const r = await resolveRealSoftPersonalization({ flagEnabled: true, consentGranted: true, mode: "solo" }, reader);
    expect(r).toBeNull();
    expect(reader.read).toHaveBeenCalledTimes(1); // gate 許可 → inject reader を呼ぶ（real snapshotReader ではない）
  });
});
