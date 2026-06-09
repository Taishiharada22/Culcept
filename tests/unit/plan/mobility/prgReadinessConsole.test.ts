import { describe, it, expect, vi, afterEach } from "vitest";
import {
  PRG_READINESS_CONSOLE_ENABLED,
  isPrgReadinessConsoleEnabled,
  PRG_AXIS_LABEL,
  PRG_STATE_DISPLAY,
  buildPrgReadinessReportFromStores,
} from "@/lib/plan/mobility/prgReadinessConsole";

describe("flag / gate（dogfood 有効化・production hard block）", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("★dogfood 有効化（flag true）", () => {
    expect(PRG_READINESS_CONSOLE_ENABLED).toBe(true);
  });
  it("★非 production は ON（dev/operator）", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(isPrgReadinessConsoleEnabled()).toBe(true);
  });
  it("★production は hard block（flag true でも OFF）", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(isPrgReadinessConsoleEnabled()).toBe(false);
  });
});

describe("display helper — status summary のみ・raw 値なし", () => {
  it("★5 軸全てにラベル", () => {
    for (const k of ["context", "place_affinity", "movement_tolerance", "energy_rhythm", "personal_pace"] as const) {
      expect(PRG_AXIS_LABEL[k]).toBeTruthy();
    }
  });
  it("★5 状態全てに label + action・数字を含まない（raw 値漏洩なし）", () => {
    for (const s of ["dormant", "accumulating", "dogfooding", "needs_attention", "activation_candidate"] as const) {
      const d = PRG_STATE_DISPLAY[s];
      expect(d.label).toBeTruthy();
      expect(d.action).toBeTruthy();
      expect(`${d.label}${d.action}`).not.toMatch(/[0-9]/);
    }
  });
});

describe("buildPrgReadinessReportFromStores — loader 統合（空 store）", () => {
  it("★5 軸を返す（context/place/mt/er/pace）", () => {
    const report = buildPrgReadinessReportFromStores();
    const keys = report.axes.map((a) => a.axis).sort();
    expect(keys).toEqual(["context", "energy_rhythm", "movement_tolerance", "personal_pace", "place_affinity"]);
  });
  it("★context=dogfooding（決定時 modifier・常に operational）・personal_pace=dormant（flag OFF）", () => {
    const report = buildPrgReadinessReportFromStores();
    expect(report.axes.find((a) => a.axis === "context")?.state).toBe("dogfooding");
    expect(report.axes.find((a) => a.axis === "personal_pace")?.state).toBe("dormant");
  });
  it("★空観測の mt/er/place は accumulating（薄くて沈黙＝正常）", () => {
    const report = buildPrgReadinessReportFromStores();
    for (const k of ["movement_tolerance", "energy_rhythm", "place_affinity"] as const) {
      expect(report.axes.find((a) => a.axis === k)?.state).toBe("accumulating");
    }
  });
});
