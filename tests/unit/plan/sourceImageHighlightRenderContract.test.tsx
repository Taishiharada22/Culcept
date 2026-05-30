import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SourceImageHighlight } from "@/app/(culcept)/plan/components/SourceImageHighlight";
import { HARADA_SPRIX_JULY_GEOMETRY } from "@/lib/plan/shift/shiftGridGeometry";

describe("SourceImageHighlight", () => {
  it("元画像を表示し、highlightDay があれば枠を出す", () => {
    const html = renderToStaticMarkup(
      <SourceImageHighlight
        imageSrc="/demo.png"
        geometry={HARADA_SPRIX_JULY_GEOMETRY}
        highlightDay={8}
        displayWidth={340}
      />
    );
    expect(html).toContain('data-testid="source-image-highlight"');
    expect(html).toContain('src="/demo.png"');
    expect(html).toContain('data-testid="source-image-highlight-box"');
  });

  it("highlightDay が null なら枠を出さない", () => {
    const html = renderToStaticMarkup(
      <SourceImageHighlight
        imageSrc="/demo.png"
        geometry={HARADA_SPRIX_JULY_GEOMETRY}
        highlightDay={null}
      />
    );
    expect(html).toContain('data-testid="source-image-highlight"');
    expect(html).not.toContain('data-testid="source-image-highlight-box"');
  });

  it("day が違えば枠の left 位置が変わる（決定論的 bbox）", () => {
    const h1 = renderToStaticMarkup(
      <SourceImageHighlight imageSrc="/d.png" geometry={HARADA_SPRIX_JULY_GEOMETRY} highlightDay={1} displayWidth={340} />
    );
    const h8 = renderToStaticMarkup(
      <SourceImageHighlight imageSrc="/d.png" geometry={HARADA_SPRIX_JULY_GEOMETRY} highlightDay={8} displayWidth={340} />
    );
    expect(h1).not.toEqual(h8);
  });
});
