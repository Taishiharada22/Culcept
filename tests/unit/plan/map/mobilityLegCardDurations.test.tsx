import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { MobilityLegCard } from "@/components/plan/map/MobilityLegCard";
import type { LegDurState } from "@/lib/plan/map/directionsService";

const noop = (): void => undefined;
const card = (durations: LegDurState | null) =>
  renderToStaticMarkup(
    <MobilityLegCard
      legKey="a__b"
      fromTitle="X"
      toTitle="Y"
      selectedMode={null}
      readOnly={false}
      durations={durations}
      onSelect={noop}
      onClose={noop}
    />,
  );

describe("MobilityLegCard 所要時間「目安」パネル(FH 忠実)", () => {
  it("徒歩/車・タクシー/電車・バス を分で表示・transit は乗換数も・推薦しない注記", () => {
    const html = card({
      loading: false,
      walk: { minutes: 25, transfers: null },
      drive: { minutes: 8, transfers: null },
      transit: { minutes: 14, transfers: 2 },
    });
    expect(html).toContain("この区間の移動・所要時間の目安");
    expect(html).toContain("25分");
    expect(html).toContain("8分");
    expect(html).toContain("14分");
    expect(html).toContain("乗換2回");
    expect(html).toContain("おすすめではなく判断材料");
  });
  it("loading 中は計算中表示", () => {
    expect(card({ loading: true, walk: null, drive: null, transit: null })).toContain("所要時間を計算中");
  });
  it("取れなかった手段は「—」(偽数字を出さない)", () => {
    const html = card({ loading: false, walk: { minutes: 25, transfers: null }, drive: null, transit: null });
    expect(html).toContain("25分");
    expect(html).toContain("—");
  });
  it("durations=null ならパネル非表示", () => {
    expect(card(null)).not.toContain("この区間の移動・所要時間の目安");
  });
});
