import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { OutfitItemImage } from "@/app/(culcept)/plan/tabs/_calendar-outfit/OutfitItemImage";

const SRC_PATH = "app/(culcept)/plan/tabs/_calendar-outfit/OutfitItemImage.tsx";

function render(src: string): string {
  return renderToStaticMarkup(createElement(OutfitItemImage, { src, alt: "item", className: "c" }));
}

describe("C1L hotfix — OutfitItemImage は src をそのまま表示（描画時 cutout なし）", () => {
  it("① cutoutUrl(透過 data URL) をそのまま src に出す（再処理しない）", () => {
    const cut = "data:image/png;base64,CUTDATA";
    const html = render(cut);
    expect(html).toContain(`src="${cut}"`);
  });

  it("② legacy imageUrl(背景付き data URL) もそのまま表示", () => {
    const img = "data:image/jpeg;base64,IMGDATA";
    expect(render(img)).toContain(`src="${img}"`);
  });

  it("③ 外部 URL もそのまま表示", () => {
    const url = "https://cdn.example.com/x.png";
    expect(render(url)).toContain(`src="${url}"`);
  });

  it("④ <img> 要素を 1 つ返す（presentational）", () => {
    const html = render("data:image/png;base64,A");
    expect(html.startsWith("<img")).toBe(true);
  });

  it("⑤ 構造: useCutoutImage / removeBackground を import/使用しない（main thread を塞がない）", () => {
    const source = readFileSync(SRC_PATH, "utf8");
    expect(source).not.toContain("useCutoutImage");
    expect(source).not.toContain("removeBackground");
  });
});
