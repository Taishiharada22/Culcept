import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { MobilityLegCard } from "@/components/plan/map/MobilityLegCard";
import type { RouteTransportMode } from "@/lib/plan/map/routeMode";

const noop = (): void => undefined;

function render(
  opts: { selectedMode?: RouteTransportMode; recallMode?: RouteTransportMode; readOnly?: boolean } = {},
): string {
  return renderToStaticMarkup(
    <MobilityLegCard
      legKey="a__b"
      fromTitle="渋谷"
      toTitle="新宿"
      selectedMode={opts.selectedMode ?? null}
      recallMode={opts.recallMode ?? null}
      readOnly={opts.readOnly ?? false}
      onSelect={noop}
      onClose={noop}
    />,
  );
}

describe("MobilityLegCard render-contract (A5-1)", () => {
  it("card / from→to / 主な手段・制限ありの全 mode label", () => {
    const html = render();
    expect(html).toContain('data-testid="mobility-leg-card"');
    expect(html).toContain("渋谷");
    expect(html).toContain("新宿");
    for (const label of ["徒歩", "車", "タクシー", "電車", "バス"]) expect(html).toContain(label);
    for (const label of ["自転車", "飛行機", "新幹線"]) expect(html).toContain(label);
    expect(html).toContain("制限あり");
    expect(html).toContain("β＝経路は概念表示");
  });
  it("selectedMode → 現在表示ラベル + active 色", () => {
    const html = render({ selectedMode: "train" });
    expect(html).toContain("現在表示");
    expect(html).toContain("電車");
    expect(html).toContain("#1565c0");
  });
  it("selectedMode なし → 未設定", () => {
    expect(render()).toContain("未設定");
  });
  it("recallMode あり(編集可) → 前回この区間 + label + 適用", () => {
    const html = render({ recallMode: "car" });
    expect(html).toContain("前回この区間");
    expect(html).toContain("適用");
    expect(html).toContain("車");
  });
  it("readOnly → recall なし + 過去ラベル", () => {
    const html = render({ recallMode: "car", readOnly: true });
    expect(html).not.toContain("前回この区間");
    expect(html).toContain("過去の移動・実績");
  });
  it("durations を持たない: 所要時間/分 を出さない (A5-1 境界)", () => {
    const html = render({ selectedMode: "walk", recallMode: "car" });
    expect(html).not.toContain("所要時間");
    expect(html).not.toContain("おすすめではなく判断材料");
    expect(html).not.toMatch(/\d+\s*分/);
  });
  it("squircle icon (svg data URI) が chip 背景に入る", () => {
    expect(render()).toContain("data:image/svg+xml");
  });
});
