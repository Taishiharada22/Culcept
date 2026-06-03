import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ShiftOffBadge,
  ShiftOffBadgeIcon,
  SHIFT_OFF_BADGE_ICON_NAMES,
  SHIFT_OFF_BADGE_ICON_LABELS,
  SHIFT_OFF_COLOR_PALETTE,
} from "@/app/(culcept)/plan/components/shiftOffBadge";

describe("ShiftOffBadge アイコン registry", () => {
  it("選べるアイコンは 6 種、全てラベルを持つ", () => {
    expect(SHIFT_OFF_BADGE_ICON_NAMES).toHaveLength(6);
    for (const name of SHIFT_OFF_BADGE_ICON_NAMES) {
      expect(SHIFT_OFF_BADGE_ICON_LABELS[name]).toBeTruthy();
    }
  });

  it("色パレットは複数用意され、hex 値を持つ", () => {
    expect(SHIFT_OFF_COLOR_PALETTE.length).toBeGreaterThanOrEqual(4);
    for (const c of SHIFT_OFF_COLOR_PALETTE) {
      expect(c.value).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("全アイコンが例外なく描画される", () => {
    for (const name of SHIFT_OFF_BADGE_ICON_NAMES) {
      const html = renderToStaticMarkup(<ShiftOffBadgeIcon icon={name} />);
      expect(html.length).toBeGreaterThan(0);
      // svg か（kyu は text 入り svg）
      expect(html).toContain("<svg");
    }
  });
});

describe("ShiftOffBadge（色 + アイコン + ラベル）", () => {
  it("ラベルと a11y ラベルを描画する", () => {
    const html = renderToStaticMarkup(
      <ShiftOffBadge icon="moon" color="#64748b" label="公休" />
    );
    expect(html).toContain('data-testid="shift-off-badge"');
    expect(html).toContain("公休");
    expect(html).toContain('aria-label="休み: 公休"');
    expect(html).toContain('role="img"');
  });

  it("ユーザー選択色をスタイルに反映する（色カスタム）", () => {
    const html = renderToStaticMarkup(
      <ShiftOffBadge icon="star" color="#8b5cf6" label="希望休" />
    );
    // color が style に乗る（大文字小文字・形式は実装依存だが値は含む）
    expect(html.toLowerCase()).toContain("#8b5cf6");
  });

  it("H / BD / HREQ で異なる label・アイコンを与えられる（意味差を残す）", () => {
    const h = renderToStaticMarkup(
      <ShiftOffBadge icon="kyu" color="#64748b" label="公休" />
    );
    const bd = renderToStaticMarkup(
      <ShiftOffBadge icon="home" color="#14b8a6" label="休み" />
    );
    const hreq = renderToStaticMarkup(
      <ShiftOffBadge icon="star" color="#f59e0b" label="希望休" />
    );
    expect(h).toContain("公休");
    expect(bd).toContain("休み");
    expect(hreq).toContain("希望休");
    // 色も別
    expect(h).not.toEqual(bd);
    expect(bd).not.toEqual(hreq);
  });
});
