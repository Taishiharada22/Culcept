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

describe("MobilityLegCard readOnly contract (Slice 1: 過去実績の上書き防止)", () => {
  it("readOnly: mode ボタンが disabled(選択不可) + 「編集不可」注記", () => {
    const html = render({ readOnly: true });
    expect(html).toContain("disabled");
    expect(html).toContain("編集不可");
  });
  it("readOnly: recallMode があっても「前回」ボタンは出ない(適用不可)", () => {
    const html = render({ readOnly: true, recallMode: "train" });
    expect(html).not.toContain("前回この区間");
  });
  it("非 readOnly: mode ボタンは disabled でない(選択可)", () => {
    const html = render({ readOnly: false });
    expect(html).not.toContain("disabled");
  });
  it("非 readOnly + recallMode: 「前回」+「適用」が出る(tap で適用可)", () => {
    const html = render({ readOnly: false, recallMode: "train" });
    expect(html).toContain("前回この区間");
    expect(html).toContain("適用");
  });
});
