/**
 * P3-9 — CoAlter PlanIntelligenceLivePanel の Reality OS dormant seam test。
 * - realityOsSurface 未指定（flag OFF 既定の状態）→ Reality OS section 完全非描画
 * - realityOsSurface 指定（flag ON fixture 条件）→ protect/easy/push 描画
 * - PLAN_FLAGS.realityOsSurfaceProd は default OFF
 * - fixture-backed display builder は redacted（raw evidence/ledger 非露出）
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PlanIntelligenceLivePanel } from "@/app/(culcept)/plan/tabs/coalter/PlanIntelligenceLivePanel";
import { PLAN_FLAGS } from "@/lib/plan/featureFlags";
import { buildRealityOsSurfaceFixtureDisplay } from "@/lib/plan/realityPipeline/realityOsSurfaceFixture";
import type { PlanIntelligenceLiveVM } from "@/app/(culcept)/plan/tabs/coalter/planIntelligenceLiveViewModel";

// 最小の unavailable VM（Reality OS seam とは独立に panel が成立する形）
const VM_UNAVAILABLE = { status: "unavailable" } as unknown as PlanIntelligenceLiveVM;

describe("P3-9 PlanIntelligence Reality OS dormant seam", () => {
  it("#1 PLAN_FLAGS.realityOsSurfaceProd は default OFF", () => {
    expect(PLAN_FLAGS.realityOsSurfaceProd).toBe(false);
  });

  it("#2 realityOsSurface 未指定 → Reality OS section 完全非描画（dormant）", () => {
    const html = renderToStaticMarkup(<PlanIntelligenceLivePanel vm={VM_UNAVAILABLE} />);
    expect(html).not.toContain('data-testid="reality-os-surface"');
    expect(html).not.toContain("守る");
  });

  it("#3 realityOsSurface 指定 → protect/easy/push 描画（flag ON fixture 条件）", () => {
    const display = buildRealityOsSurfaceFixtureDisplay();
    const html = renderToStaticMarkup(<PlanIntelligenceLivePanel vm={VM_UNAVAILABLE} realityOsSurface={display} />);
    expect(html).toContain('data-testid="reality-os-surface"');
    // fixture は protect/easy/push の少なくとも1つを surface に出す（routeCount>0 のとき）
    const hasStance = html.includes("守る") || html.includes("楽に") || html.includes("攻める") || html.includes("候補なし");
    expect(hasStance).toBe(true);
  });

  it("#4 fixture-backed display は redacted（raw evidence/ledger/graph 非露出）", () => {
    const html = renderToStaticMarkup(
      <PlanIntelligenceLivePanel vm={VM_UNAVAILABLE} realityOsSurface={buildRealityOsSurfaceFixtureDisplay()} />,
    );
    expect(html).not.toContain("seam:current");
    expect(html).not.toContain("fixture:overrun");
    expect(html).not.toContain("ledger:");
    expect(html).not.toContain("snapshot");
  });
});
