/**
 * P3-8 — RealityOsSurfacePanel / RealityOsScenarioCard の render contract test。
 * presentational component を renderToStaticMarkup（node・no DOM）で描画し、
 * protect/easy/push 表示 / honestUnknown 表示 / evidenceCount 件数のみ / reasonText presenter済 /
 * raw evidence/graph/ledger 非表示 を検証。
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RealityOsSurfacePanel } from "@/app/(culcept)/plan/components/realityOs/RealityOsSurfacePanel";
import { presentRealityOsSurface } from "@/lib/plan/realityPipeline/realityOsSurfacePresenter";
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
  reasonCodes: ["proposal:protect", "feasibility_shift:better", "ledger:secret-ref"],
  evidenceCount: 3,
  ...over,
});
const surface = (scenarios: RealityOsScenarioSurfaceV0[], honestUnknown = false): RealityOsSurfaceV0 => ({
  scenarios,
  honestUnknown,
  reasonCodes: honestUnknown ? ["contains_unknown_shift"] : [],
});

describe("P3-8 RealityOsSurfacePanel render contract", () => {
  it("#1 protect/easy/push が描画される", () => {
    const display = presentRealityOsSurface(
      surface([scenario({ scenarioKind: "protect" }), scenario({ scenarioId: "e", scenarioKind: "easy" }), scenario({ scenarioId: "p", scenarioKind: "push" })]),
    );
    const html = renderToStaticMarkup(<RealityOsSurfacePanel display={display} />);
    expect(html).toContain("守る");
    expect(html).toContain("楽に");
    expect(html).toContain("攻める");
    expect(html).toContain("成立しやすくなる");
    expect(html).toContain('data-testid="reality-os-scenario"');
  });

  it("#2 honestUnknown が banner 表示される", () => {
    const display = presentRealityOsSurface(surface([scenario({ feasibilityShift: "unknown" })], true));
    const html = renderToStaticMarkup(<RealityOsSurfacePanel display={display} />);
    expect(html).toContain("まだ確実には読めていない部分があります");
    expect(html).toContain("まだ読めていません"); // unknown shift label
  });

  it("#3 候補なし表示（scenarios 空）", () => {
    const display = presentRealityOsSurface(surface([]));
    const html = renderToStaticMarkup(<RealityOsSurfacePanel display={display} />);
    expect(html).toContain("候補なし");
  });

  it("#4 evidenceCount は件数のみ / reasonText は presenter 済の安全文", () => {
    const html = renderToStaticMarkup(<RealityOsSurfacePanel display={presentRealityOsSurface(surface([scenario()]))} />);
    expect(html).toContain("根拠3件");
    expect(html).toContain("守る案として提示");
  });

  it("#5 redaction: raw evidence/graph/ledger を描画に出さない", () => {
    const html = renderToStaticMarkup(<RealityOsSurfacePanel display={presentRealityOsSurface(surface([scenario()], true))} />);
    expect(html).not.toContain("ledger:secret-ref");
    expect(html).not.toContain("evidenceRefs");
    expect(html).not.toContain("snapshot");
  });
});
