/**
 * Bias Context pure helper tests (Phase 2-D C2)
 *
 * 設計書: docs/alter-plan-phase2-d-place-picker-mini-design.md v2 §3 / §5.8
 *
 * 検証対象:
 *   - determineBiasContextFromBaseline: baseline (null / home / city / prefecture) → BiasContext
 *   - source / coord / radiusMeters / label の精度別 mapping
 *
 * Hook (useBiasContext) 自体は usePlanBaseline + determineBiasContextFromBaseline の
 * 合成のため、pure 関数の test で network 不要に validation 可能。
 */

import { describe, it, expect } from "vitest";

import { determineBiasContextFromBaseline } from "@/app/(culcept)/plan/components/_useBiasContext";
import type { BaselineCoords } from "@/app/(culcept)/plan/tabs/_usePlanBaseline";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("determineBiasContextFromBaseline", () => {
  it("baseline null → source='none', coord=null, radius=0, label=null", () => {
    const r = determineBiasContextFromBaseline(null);
    expect(r).toEqual({
      source: "none",
      coord: null,
      radiusMeters: 0,
      label: null,
    });
  });

  it("home (具体 coord) → 10km radius、'自宅' 文言", () => {
    const baseline: BaselineCoords = {
      lat: 35.7820,
      lng: 140.3186,
      source: "home",
      label: "千葉県 成田市",
    };
    const r = determineBiasContextFromBaseline(baseline);
    expect(r.source).toBe("baseline_home");
    expect(r.coord).toEqual({ lat: 35.7820, lng: 140.3186 });
    expect(r.radiusMeters).toBe(10000);
    expect(r.label).toContain("自宅");
    expect(r.label).toContain("千葉県 成田市");
    expect(r.label).toContain("近く");
  });

  it("city (市区町村中心) → 20km radius、'居住地周辺' 文言", () => {
    const baseline: BaselineCoords = {
      lat: 35.7820,
      lng: 140.3186,
      source: "city",
      label: "千葉県 成田市",
    };
    const r = determineBiasContextFromBaseline(baseline);
    expect(r.source).toBe("baseline_city");
    expect(r.radiusMeters).toBe(20000);
    expect(r.label).toContain("居住地");
    expect(r.label).toContain("千葉県 成田市");
    expect(r.label).toContain("周辺");
  });

  it("prefecture (県中心) → 50km radius、'居住地範囲' 文言", () => {
    const baseline: BaselineCoords = {
      lat: 35.6047,
      lng: 140.1233,
      source: "prefecture",
      label: "千葉県",
    };
    const r = determineBiasContextFromBaseline(baseline);
    expect(r.source).toBe("baseline_prefecture");
    expect(r.radiusMeters).toBe(50000);
    expect(r.label).toContain("居住地");
    expect(r.label).toContain("千葉県");
    expect(r.label).toContain("範囲");
  });

  it("label null の場合は default 文言 '保存済の居住地' fallback", () => {
    const baseline: BaselineCoords = {
      lat: 35.7820,
      lng: 140.3186,
      source: "home",
      label: null,
    };
    const r = determineBiasContextFromBaseline(baseline);
    expect(r.label).toContain("保存済の居住地");
  });

  it("coord は lat/lng で normalize (lon→lng が _usePlanBaseline 側で行われる)", () => {
    const baseline: BaselineCoords = {
      lat: 35.0,
      lng: 139.0,
      source: "home",
      label: "test",
    };
    const r = determineBiasContextFromBaseline(baseline);
    expect(r.coord).toEqual({ lat: 35.0, lng: 139.0 });
  });

  it("radius は precision 順 (home < city < prefecture)", () => {
    const home: BaselineCoords = { lat: 0, lng: 0, source: "home", label: "x" };
    const city: BaselineCoords = { lat: 0, lng: 0, source: "city", label: "x" };
    const pref: BaselineCoords = { lat: 0, lng: 0, source: "prefecture", label: "x" };

    expect(determineBiasContextFromBaseline(home).radiusMeters).toBeLessThan(
      determineBiasContextFromBaseline(city).radiusMeters,
    );
    expect(determineBiasContextFromBaseline(city).radiusMeters).toBeLessThan(
      determineBiasContextFromBaseline(pref).radiusMeters,
    );
  });

  it("pure: 同じ入力で同じ出力 (deterministic、no side effects)", () => {
    const baseline: BaselineCoords = {
      lat: 35.7820,
      lng: 140.3186,
      source: "city",
      label: "千葉県 成田市",
    };
    const r1 = determineBiasContextFromBaseline(baseline);
    const r2 = determineBiasContextFromBaseline(baseline);
    expect(r1).toEqual(r2);
  });

  it("pure: 入力を mutate しない", () => {
    const baseline: BaselineCoords = {
      lat: 35.7820,
      lng: 140.3186,
      source: "home",
      label: "千葉県 成田市",
    };
    const snapshot = JSON.stringify(baseline);
    determineBiasContextFromBaseline(baseline);
    expect(JSON.stringify(baseline)).toBe(snapshot);
  });
});
