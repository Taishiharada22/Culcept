import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SourceCellCrop } from "@/app/(culcept)/plan/components/SourceCellCrop";

describe("SourceCellCrop", () => {
  const html = renderToStaticMarkup(
    <SourceCellCrop
      imageSrc="/demo.png"
      imageWidth={1860}
      imageHeight={846}
      region={{ x: 366, y: 112, width: 47.8, height: 96 }}
      displayWidth={76}
    />
  );

  it("crop コンテナを描画（testid + a11y）", () => {
    expect(html).toContain('data-testid="source-cell-crop"');
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="原稿の該当セル"');
  });

  it("背景画像と background-position で領域を切り出す", () => {
    expect(html).toContain("background-image:url(/demo.png)");
    expect(html).toContain("background-position:");
    expect(html).toContain("background-size:");
    expect(html).toContain("overflow:hidden");
  });
});
