/**
 * P5 — production-shaped asset adapter の test。
 * fixture-backed source → pipeline input/surface / live stub → unavailable / 部分欠測 → fail-closed /
 * redaction維持 / honest-unknown。
 */
import { describe, it, expect } from "vitest";
import {
  createFixtureAssetSource,
  createLiveAssetSourceStub,
  assembleRealityOsPipelineInput,
  composeRealityOsSurfaceFromSource,
  UNAVAILABLE,
} from "@/lib/plan/realityPipeline/realityOsAssetProviders";
import { surfaceContractViolations } from "@/lib/plan/realityPipeline/realityOsSurfaceContract";

describe("P5 realityOsAssetProviders", () => {
  it("#1 fixture source → pipeline input を組める（ok）", () => {
    const r = assembleRealityOsPipelineInput(createFixtureAssetSource());
    expect("ok" in r).toBe(true);
    if ("ok" in r) {
      expect(r.ok.anchors.length).toBeGreaterThan(0);
      expect(r.ok.proposalTask.taskId).toBe("ot1");
    }
  });

  it("#2 fixture source → surface（contract 適合・redacted）", () => {
    const r = composeRealityOsSurfaceFromSource(createFixtureAssetSource());
    expect("surface" in r).toBe(true);
    if ("surface" in r) {
      expect(surfaceContractViolations(r.surface)).toEqual([]);
      const json = JSON.stringify(r.surface);
      expect(json).not.toContain("asset:current");
      expect(json).not.toContain("fixture:overrun");
      expect(json).not.toContain("snapshot");
    }
  });

  it("#3 live stub → unavailable（real asset 未接続 = honest）", () => {
    const r = composeRealityOsSurfaceFromSource(createLiveAssetSourceStub());
    expect("unavailable" in r).toBe(true);
    if ("unavailable" in r) {
      expect(r.unavailable).toEqual(expect.arrayContaining(["calendar_anchors", "task", "current_state"]));
    }
  });

  it("#4 部分欠測 → fail-closed（unavailable に該当 reason のみ）", () => {
    const src = { ...createFixtureAssetSource(), anchors: UNAVAILABLE };
    const r = assembleRealityOsPipelineInput(src);
    expect("unavailable" in r).toBe(true);
    if ("unavailable" in r) {
      expect(r.unavailable).toContain("calendar_anchors");
      expect(r.unavailable).not.toContain("task"); // task は available
    }
  });

  it("#5 judgmentByStance 空（honest-unknown）でも input は組める", () => {
    const src = { ...createFixtureAssetSource(), judgmentByStance: {} };
    const r = assembleRealityOsPipelineInput(src);
    expect("ok" in r).toBe(true); // required asset 揃えば judgment 空でも組める（unknown shift で出る）
  });
});
