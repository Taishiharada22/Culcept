/**
 * P3-5 — Reality OS surface presenter（pure・非JSX）の test。
 * 検証: protect/easy/push ラベル / shift→記述語 / reasonCode→安全な日本語(未知dropで redaction) /
 *   confidence band / permission capability語 / evidenceCount 件数のみ / honestUnknown 正直表示 /
 *   raw evidence・graph・ledger を表示に戻さない。
 */
import { describe, it, expect } from "vitest";
import {
  presentRealityOsSurface,
  type RealityOsScenarioDisplayV0,
} from "@/lib/plan/realityPipeline/realityOsSurfacePresenter";
import type { RealityOsSurfaceV0, RealityOsScenarioSurfaceV0 } from "@/lib/plan/realityPipeline/realityOsSurfaceContract";

const scenario = (over: Partial<RealityOsScenarioSurfaceV0> = {}): RealityOsScenarioSurfaceV0 => ({
  scenarioId: "rs:protect",
  scenarioKind: "protect",
  feasibilityShift: "better",
  overrunRiskShift: "better",
  collapseRiskShift: "better",
  minimalProgressText: "構成を3行で書く",
  permissionBoundary: 2,
  realityDiffSummary: { added: 0, removed: 0, changed: 1, resolved: 1, collapsed: 0 },
  confidence: 0.5,
  reasonCodes: ["proposal:protect", "feasibility_shift:better", "proposal_basis:change_task"],
  evidenceCount: 3,
  ...over,
});
const surface = (scenarios: RealityOsScenarioSurfaceV0[], honestUnknown = false, reasonCodes: string[] = []): RealityOsSurfaceV0 => ({
  scenarios,
  honestUnknown,
  reasonCodes,
});

describe("P3-5 presentRealityOsSurface", () => {
  it("#1 scenarioKind → 日本語ラベル", () => {
    const d = presentRealityOsSurface(
      surface([scenario({ scenarioKind: "protect" }), scenario({ scenarioKind: "easy" }), scenario({ scenarioKind: "push" })]),
    );
    expect(d.scenarios.map((s) => s.kindLabel)).toEqual(["守る", "楽に", "攻める"]);
  });

  it("#2 shift → 記述語（非指示・unknown は まだ読めていません）", () => {
    const better = presentRealityOsSurface(surface([scenario()])).scenarios[0];
    expect(better.feasibilityLabel).toBe("成立しやすくなる");
    expect(better.overrunLabel).toBe("時間超過しにくくなる");
    expect(better.collapseLabel).toBe("崩れにくくなる");
    const worse = presentRealityOsSurface(
      surface([scenario({ feasibilityShift: "worse", overrunRiskShift: "worse", collapseRiskShift: "worse" })]),
    ).scenarios[0];
    expect(worse.feasibilityLabel).toBe("成立しにくくなる");
    const unk = presentRealityOsSurface(surface([scenario({ feasibilityShift: "unknown" })])).scenarios[0];
    expect(unk.feasibilityLabel).toBe("まだ読めていません");
    expect(unk.isUnknown).toBe(true);
  });

  it("#3 reasonCode → 安全な日本語（*_shift は drop・未知 code も drop）", () => {
    const s = scenario({ reasonCodes: ["proposal:protect", "feasibility_shift:better", "proposal_basis:change_task", "raw:secret-internal-ref"] });
    const d = presentRealityOsSurface(surface([s])).scenarios[0];
    expect(d.reasonText).toContain("守る案として提示");
    expect(d.reasonText).toContain("作業の変更にもとづく");
    // *_shift は label 済 → reasonText に出ない
    expect(d.reasonText.some((t) => t.includes("成立"))).toBe(false);
    // 未知 code は drop（生文字列を表示に戻さない）
    expect(JSON.stringify(d.reasonText)).not.toContain("raw:secret-internal-ref");
  });

  it("#4 confidence → band", () => {
    const band = (c: number) => presentRealityOsSurface(surface([scenario({ confidence: c })])).scenarios[0].confidenceBand;
    expect(band(0.2)).toBe("低");
    expect(band(0.5)).toBe("中");
    expect(band(0.8)).toBe("高");
  });

  it("#5 permissionBoundary → capability 語（緩めず値そのまま）", () => {
    expect(presentRealityOsSurface(surface([scenario({ permissionBoundary: 0 })])).scenarios[0].permissionLabel).toBe("記録のみ");
    expect(presentRealityOsSurface(surface([scenario({ permissionBoundary: 2 })])).scenarios[0].permissionLabel).toBe("候補を提案");
  });

  it("#6 evidenceCount は件数のみ / minimalProgressText は pass-through", () => {
    expect(presentRealityOsSurface(surface([scenario({ evidenceCount: 3 })])).scenarios[0].evidenceText).toBe("根拠3件");
    expect(presentRealityOsSurface(surface([scenario({ evidenceCount: 0 })])).scenarios[0].evidenceText).toBe("根拠なし");
    expect(presentRealityOsSurface(surface([scenario({ minimalProgressText: null })])).scenarios[0].minimalProgressText).toBeNull();
  });

  it("#7 honestUnknown → 正直表示（true で文・false で null）", () => {
    expect(presentRealityOsSurface(surface([scenario()], true, ["current_incomplete"])).honestUnknownLabel).toBe(
      "まだ確実には読めていない部分があります",
    );
    expect(presentRealityOsSurface(surface([scenario()], false)).honestUnknownLabel).toBeNull();
  });

  it("#8 redaction: 表示VM に raw evidence/graph/ledger を出さない", () => {
    const s = scenario({ reasonCodes: ["proposal:protect", "ledger:secret", "feasibility_shift:better"] });
    const json = JSON.stringify(presentRealityOsSurface(surface([s], true, ["contains_unknown_shift"])));
    expect(json).not.toContain("ledger:secret");
    expect(json).not.toContain("snapshot");
    expect(json).not.toContain("evidenceRefs");
    expect(json).toContain("守る案として提示"); // controlled は出てよい
  });
});
