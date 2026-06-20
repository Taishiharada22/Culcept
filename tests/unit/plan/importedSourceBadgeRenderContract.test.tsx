import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ImportedSourceBadge } from "@/app/(culcept)/plan/components/ImportedSourceBadge";

describe("ImportedSourceBadge — shift_image 由来の控えめな取込表示", () => {
  it("既定で「取込」を表示し、title / aria-label は「シフト取込」", () => {
    const html = renderToStaticMarkup(<ImportedSourceBadge />);
    expect(html).toContain("取込");
    expect(html).toContain('title="シフト取込"');
    expect(html).toContain('aria-label="シフト取込"');
    expect(html).toContain('data-imported-source="shift_image"');
  });

  it("週 view 向けに label「取」を渡せる（aria は依然「シフト取込」）", () => {
    const html = renderToStaticMarkup(<ImportedSourceBadge label="取" />);
    // 「取」は出るが、密表示でも意味は aria/title で担保
    expect(html).toContain(">取<");
    expect(html).toContain('aria-label="シフト取込"');
  });

  it("警告色（amber/orange/red）を使わず muted slate（由来表示であって警告でない）", () => {
    const html = renderToStaticMarkup(<ImportedSourceBadge />);
    expect(html).toContain("slate");
    expect(html).not.toMatch(/amber|orange|red|rose/);
  });

  it("追加 className を合成できる", () => {
    const html = renderToStaticMarkup(
      <ImportedSourceBadge className="ml-1" />
    );
    expect(html).toContain("ml-1");
  });
});
