import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MobilityLegCard } from "@/components/plan/map/MobilityLegCard";
import type { ExplanationCopy } from "@/lib/plan/mobility/explanationCopy";

const baseProps = {
  legKey: "a__b",
  fromTitle: "A",
  toTitle: "B",
  selectedMode: null,
  readOnly: false,
  onSelect: () => {},
  onClose: () => {},
};

const surfaceCopy: ExplanationCopy = {
  surface: true,
  reasonCode: "surface_habitual",
  scenario: "habitual_only",
  headline: "いつもは電車を選びがちです。",
  rationale: "この区間では、電車が多めです。",
  contextNoteText: null,
  correctionPrompt: "違うなら下から選べます。",
  alternativeLabels: [],
};

describe("MobilityLegCard hypothesis block (v0-D)", () => {
  it("hypothesisCopy 未指定 → block 非描画（従来 HTML 同等）", () => {
    const html = renderToStaticMarkup(<MobilityLegCard {...baseProps} />);
    expect(html).not.toContain("mobility-hypothesis");
  });

  it("hypothesisCopy null → 非描画", () => {
    const html = renderToStaticMarkup(<MobilityLegCard {...baseProps} hypothesisCopy={null} />);
    expect(html).not.toContain("mobility-hypothesis");
  });

  it("hypothesisCopy surface=false → 非描画（safe fallback）", () => {
    const html = renderToStaticMarkup(
      <MobilityLegCard {...baseProps} hypothesisCopy={{ ...surfaceCopy, surface: false }} />,
    );
    expect(html).not.toContain("mobility-hypothesis");
  });

  it("hypothesisCopy surface → block 描画（headline/rationale/correctionPrompt）", () => {
    const html = renderToStaticMarkup(
      <MobilityLegCard {...baseProps} hypothesisCopy={surfaceCopy} />,
    );
    expect(html).toContain("mobility-hypothesis");
    expect(html).toContain("いつもは電車を選びがちです。");
    expect(html).toContain("この区間では、電車が多めです。");
    expect(html).toContain("違うなら下から選べます。");
  });
});
