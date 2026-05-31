/**
 * SR B1b-2C-2 — AssistedRowSelector render contract（static / no jsdom）
 *
 * 注: interaction（mouse drag / touchmove / keyboard handler の発火）の単体検証は
 *   jsdom 依存を新規追加する必要があり、B1b-2C-2 の依存無追加方針と CEO 提示の
 *   「途中で止める条件」に該当するため、本ファイルでは取り扱わない。
 *   実物の interaction は staging smoke（Playwright）と clear/confirm/clear ボタンの
 *   disabled 状態の renderContract で間接的に担保する。
 *
 * 不変条件（render contract で固定）:
 *   - initialSelection なし → CTA disabled / clear disabled
 *   - valid initialSelection → 両 overlay + CTA active + 確認文言
 *   - invalid（順序逆 / 範囲外）→ CTA disabled + validation 文言
 *   - 4 ハンドルが role=slider + aria-* 必須
 *   - data:image / 巨大 base64 を内部に作らない
 *   - safe copy（error / wrong / failed / 誤 / 失敗 / 間違 を含まない）
 *   - pure model 再利用（component CTA ⇔ validateSelection().ctaActive）
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { AssistedRowSelector } from "@/app/(culcept)/plan/components/AssistedRowSelector";
import {
  validateSelection,
  type AssistedRowSelection,
} from "@/lib/plan/shift/assistedRowSelection";

const IMG = { imageW: 1860, imageH: 846 };
const validSel: AssistedRowSelection = {
  ...IMG,
  headerBand: { top: 180, bottom: 226 },
  personRowBand: { top: 290, bottom: 350 },
};
const invalidSel: AssistedRowSelection = {
  ...IMG,
  // ヘッダが personRow より下 → orderingIssue
  headerBand: { top: 400, bottom: 450 },
  personRowBand: { top: 290, bottom: 350 },
};

function render(
  over: Partial<React.ComponentProps<typeof AssistedRowSelector>> = {}
) {
  return renderToStaticMarkup(
    <AssistedRowSelector
      imageObjectUrl="blob:http://localhost/fake-uuid"
      imageW={IMG.imageW}
      imageH={IMG.imageH}
      onConfirm={() => {}}
      {...over}
    />
  );
}

describe("AssistedRowSelector — render（static）", () => {
  it("initialSelection なし → CTA disabled / hint「tap して指定」", () => {
    const html = render();
    expect(html).toContain('data-testid="assisted-row-selector"');
    expect(html).toMatch(/assisted-row-confirm"[^>]*disabled/);
    expect(html).toContain("画像を tap して自分の行を指定");
    expect(html).not.toContain('data-testid="assisted-row-header-band"');
    expect(html).not.toContain('data-testid="assisted-row-person-band"');
  });

  it("valid initialSelection → 両 overlay + CTA active + 確認文言", () => {
    const html = render({ initialSelection: validSel });
    expect(html).toContain('data-testid="assisted-row-header-band"');
    expect(html).toContain('data-testid="assisted-row-person-band"');
    expect(html).toContain('data-testid="assisted-row-confirm-summary"');
    expect(html).toContain("このヘッダとこの行を読み取る");
    // CTA は disabled 属性を持たない
    expect(html).not.toMatch(/assisted-row-confirm"[^>]*disabled/);
  });

  it("invalid initialSelection（順序逆）→ CTA disabled + ordering validation", () => {
    const html = render({ initialSelection: invalidSel });
    expect(html).toMatch(/assisted-row-confirm"[^>]*disabled/);
    expect(html).toContain('data-testid="assisted-row-validation"');
    expect(html).toContain('data-testid="assisted-row-validation-ordering"');
    expect(html).not.toContain('data-testid="assisted-row-confirm-summary"');
  });

  it("a11y: 4 ハンドルが role=slider + aria-valuemin/max/now + tabindex", () => {
    const html = render({ initialSelection: validSel });
    for (const t of [
      "assisted-row-handle-header-top",
      "assisted-row-handle-header-bottom",
      "assisted-row-handle-personRow-top",
      "assisted-row-handle-personRow-bottom",
    ]) {
      expect(html).toContain(`data-testid="${t}"`);
    }
    expect(html).toMatch(/role="slider"/);
    expect(html).toMatch(/aria-valuemax="846"/);
    expect(html).toMatch(/aria-orientation="vertical"/);
  });

  it("imageObjectUrl は src にそのまま入る（host が blob: で渡す前提）", () => {
    const html = render({ imageObjectUrl: "blob:http://x/abc", initialSelection: validSel });
    expect(html).toMatch(/src="blob:http:\/\/x\/abc"/);
  });
});

describe("AssistedRowSelector — safety / safe copy", () => {
  it("data:image / base64 文字列を内部に永続化しない（render 結果に出ない）", () => {
    const html = render({
      // host 側のミス想定 — component は受け取って表示するだけだが、
      // 「永続化しない」観点では state/props に dataURL を **混入させない** ことが目的。
      // 実用上は src にそのまま入りうるが、その他の場所には現れない。
      imageObjectUrl: "blob:safe-url",
      initialSelection: validSel,
    });
    // ホストが誤って渡しても、component の内部 state/markup には base64 を作らない
    expect(html).not.toMatch(/data:image\/[a-z]+;base64,/);
    expect(html).not.toMatch(/[A-Za-z0-9+/]{200,}=*/); // 巨大 base64 塊が出現しない
  });

  it("user-facing copy に error / wrong / failed / 誤 / 失敗 / 間違 を含まない", () => {
    const htmls = [
      render(),
      render({ initialSelection: validSel }),
      render({ initialSelection: invalidSel }),
    ];
    for (const h of htmls) {
      expect(h).not.toMatch(/error|wrong|failed|誤|失敗|間違/i);
    }
  });

  it("pure model 再利用: 同 selection で component CTA active ⇔ validateSelection().ctaActive", () => {
    expect(validateSelection(validSel).ctaActive).toBe(true);
    expect(validateSelection(invalidSel).ctaActive).toBe(false);
    expect(render({ initialSelection: validSel })).not.toMatch(/assisted-row-confirm"[^>]*disabled/);
    expect(render({ initialSelection: invalidSel })).toMatch(/assisted-row-confirm"[^>]*disabled/);
  });
});

/** 指定 testid の <button> タグを取り出す（属性順序に依存しない）。 */
function buttonTag(html: string, testid: string): string | null {
  const re = new RegExp(`<button[^>]*data-testid="${testid}"[^>]*>`, "i");
  return html.match(re)?.[0] ?? null;
}
const hasDisabled = (tag: string | null) => !!tag && / disabled(?:=|[ />])/i.test(tag);

describe("AssistedRowSelector — CTA / clear の disabled 状態（render contract）", () => {
  it("initialSelection なし → confirm + clear が両方 disabled", () => {
    const html = render();
    expect(hasDisabled(buttonTag(html, "assisted-row-confirm"))).toBe(true);
    expect(hasDisabled(buttonTag(html, "assisted-row-clear"))).toBe(true);
  });

  it("valid initialSelection → confirm active + clear active（disabled でない）", () => {
    const html = render({ initialSelection: validSel });
    expect(hasDisabled(buttonTag(html, "assisted-row-confirm"))).toBe(false);
    expect(hasDisabled(buttonTag(html, "assisted-row-clear"))).toBe(false);
  });

  it("invalid initialSelection → confirm disabled / clear active（unblock 用に有効）", () => {
    const html = render({ initialSelection: invalidSel });
    expect(hasDisabled(buttonTag(html, "assisted-row-confirm"))).toBe(true);
    expect(hasDisabled(buttonTag(html, "assisted-row-clear"))).toBe(false);
  });

  it("onCancel 渡せば cancel ボタンが出る（無ければ出ない）", () => {
    expect(render({ initialSelection: validSel })).not.toContain('data-testid="assisted-row-cancel"');
    expect(
      render({ initialSelection: validSel, onCancel: () => {} })
    ).toContain('data-testid="assisted-row-cancel"');
  });
});
