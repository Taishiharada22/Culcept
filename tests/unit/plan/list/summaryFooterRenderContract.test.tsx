/**
 * Phase 3-N List impl sub-phase 8c — SummaryFooter render contract test
 *
 * 検証範囲 (= 8c 解釈レイヤーの器、 中立文体):
 *   §1 4 領域 render (= 円形 indicator + 状態名 + 一言解釈 + CTA)
 *   §2 中立文体 (= 評価形容詞 0 / 数値 0 / 強い命令 0)
 *   §3 SVG 円形 + 4 arc 構造 (= 数値表現なし)
 *   §4 規約 24-extended (= CTA に focus-visible:border-slate-300)
 *   §5 a11y (= aria-label / role)
 *
 * 不変原則:
 *   - LLM / API / DB / network 不使用
 *   - 既存 file 不触
 *
 * 設計書:
 *   - app/(culcept)/plan/components/list/SummaryFooter.tsx
 *   - decision-log (= 8c readiness + GPT 補正)
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  SummaryFooter,
  SUMMARY_FOOTER_STATE_LABEL,
  SUMMARY_FOOTER_INTERPRETATION,
  SUMMARY_FOOTER_CTA_LABEL,
} from "@/app/(culcept)/plan/components/list/SummaryFooter";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §1 4 領域 render
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("SummaryFooter §1. 4 領域 render", () => {
  it("§1.1 container + 4 領域 data-testid 全件出る", () => {
    const html = renderToStaticMarkup(<SummaryFooter />);
    expect(html).toContain('data-testid="plan-list-summary-footer"');
    expect(html).toContain('data-testid="plan-list-summary-footer-state"');
    expect(html).toContain('data-testid="plan-list-summary-footer-interpretation"');
    expect(html).toContain('data-testid="plan-list-summary-footer-cta"');
  });

  it("§1.2 状態名 「集中と休息のリズム」 (= constant 経由) が render", () => {
    const html = renderToStaticMarkup(<SummaryFooter />);
    expect(html).toContain(SUMMARY_FOOTER_STATE_LABEL);
    expect(html).toContain('集中と休息のリズム');
  });

  it("§1.3 一言解釈 「集中する時間と、 ひと息つく時間が交互に入っています」 が render", () => {
    const html = renderToStaticMarkup(<SummaryFooter />);
    expect(html).toContain(SUMMARY_FOOTER_INTERPRETATION);
    expect(html).toContain('集中する時間と、ひと息つく時間が交互に入っています');
  });

  it("§1.4 CTA 「リズムを整えるヒント」 + › が render", () => {
    const html = renderToStaticMarkup(<SummaryFooter />);
    expect(html).toContain(SUMMARY_FOOTER_CTA_LABEL);
    expect(html).toContain('リズムを整えるヒント');
    expect(html).toContain('›');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §2 中立文体 (= 評価形容詞 / 数値 / 強い命令 0)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("SummaryFooter §2. 中立文体 (= GPT 補正、 評価装置ではなく解釈の器)", () => {
  it("§2.1 評価形容詞 0 (= 「最適」 「重要」 「良い」 「悪い」 「ベスト」)", () => {
    const html = renderToStaticMarkup(<SummaryFooter />);
    expect(html).not.toContain('最適');
    expect(html).not.toContain('重要');
    expect(html).not.toContain('良い');
    expect(html).not.toContain('悪い');
    expect(html).not.toContain('ベスト');
  });

  it("§2.2 数値 0 (= 「78%」 「100%」 等の score 表現なし)", () => {
    const html = renderToStaticMarkup(<SummaryFooter />);
    expect(html).not.toMatch(/\d+%/);
    expect(html).not.toMatch(/\d+点/);
  });

  it("§2.3 強い命令 0 (= 「しなさい」 「しろ」 「やれ」 等)", () => {
    const html = renderToStaticMarkup(<SummaryFooter />);
    expect(html).not.toContain('しなさい');
    expect(html).not.toContain('しろ');
    expect(html).not.toContain('やれ');
  });

  it("§2.4 禁止語 10 件 (= おすすめ / これをした方がいい / 最適 / 推奨 / 改善 / 警告 / 危険 / 注意 / リスク / 最適化) 出ない", () => {
    const html = renderToStaticMarkup(<SummaryFooter />);
    expect(html).not.toContain('おすすめ');
    expect(html).not.toContain('これをした方がいい');
    expect(html).not.toContain('推奨');
    expect(html).not.toContain('改善');
    expect(html).not.toContain('警告');
    expect(html).not.toContain('危険');
    expect(html).not.toContain('注意');
    expect(html).not.toContain('リスク');
    expect(html).not.toContain('最適化');
  });

  it("§2.5 「バランス良好」 「良いプランです」 等 mock 文体 (= readiness 例文) 出ない (= GPT 補正で中立化)", () => {
    const html = renderToStaticMarkup(<SummaryFooter />);
    expect(html).not.toContain('バランス良好');
    expect(html).not.toContain('良いプラン');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §3 SVG 円形 + 4 arc 構造 (= 視覚サマリー枠、 数値なし)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("SummaryFooter §3. SVG 円形 indicator (= 固定 構造、 数値なし)", () => {
  it("§3.1 SVG <circle> 外枠 + 4 <path> arc が render", () => {
    const html = renderToStaticMarkup(<SummaryFooter />);
    expect(html).toContain('<svg');
    expect(html).toContain('<circle');
    // 4 arc paths (= cafe / meal / work / home symbolic)
    const pathMatches = html.match(/<path/g) ?? [];
    expect(pathMatches.length).toBeGreaterThanOrEqual(4);
  });

  it("§3.2 4 segment 色 (= indigo / orange / blue / emerald) が含まれる (= cafe/meal/work/home symbolic)", () => {
    const html = renderToStaticMarkup(<SummaryFooter />);
    // indigo (99 102 241), orange (249 115 22), blue (59 130 246), emerald (16 185 129)
    expect(html).toContain('rgb(99 102 241)'); // indigo (cafe)
    expect(html).toContain('rgb(249 115 22)'); // orange (meal)
    expect(html).toContain('rgb(59 130 246)'); // blue (work)
    expect(html).toContain('rgb(16 185 129)'); // emerald (home)
  });

  it("§3.3 SVG 内に数値テキスト (= score 表示) なし", () => {
    const html = renderToStaticMarkup(<SummaryFooter />);
    // SVG の <text> 要素はない
    expect(html).not.toMatch(/<text[^>]*>/);
  });

  it("§3.4 SVG aria-hidden=\"true\" (= 装飾扱い、 別 text で aria-label)", () => {
    const html = renderToStaticMarkup(<SummaryFooter />);
    expect(html).toContain('aria-hidden="true"');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §4 規約 24-extended (= focus-visible:border-slate-300、 brand 色 0)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("SummaryFooter §4. 規約 24-extended (= CTA button)", () => {
  it("§4.1 focus-visible:border-slate-300 が CTA に出る", () => {
    const html = renderToStaticMarkup(<SummaryFooter />);
    expect(html).toContain('focus-visible:border-slate-300');
  });

  it("§4.2 focus-visible:border-{indigo|purple|amber|orange|red} 等 brand 系含まれない", () => {
    const html = renderToStaticMarkup(<SummaryFooter />);
    expect(html).not.toMatch(/focus-visible:border-indigo/);
    expect(html).not.toMatch(/focus-visible:border-purple/);
    expect(html).not.toMatch(/focus-visible:border-amber/);
    expect(html).not.toMatch(/focus-visible:border-orange/);
    expect(html).not.toMatch(/focus-visible:border-red/);
  });

  it("§4.3 focus:outline-none 維持", () => {
    const html = renderToStaticMarkup(<SummaryFooter />);
    expect(html).toContain('focus:outline-none');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §5 a11y (= section aria-label + CTA aria-label + button type)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("SummaryFooter §5. a11y", () => {
  it("§5.1 section aria-label=\"1日全体の解釈\" + role=section", () => {
    const html = renderToStaticMarkup(<SummaryFooter />);
    expect(html).toContain('aria-label="1日全体の解釈"');
    expect(html).toContain('<section');
  });

  it("§5.2 CTA button type=\"button\" 明示", () => {
    const html = renderToStaticMarkup(<SummaryFooter />);
    expect(html).toContain('type="button"');
  });

  it("§5.3 CTA aria-label (= 「リズムを整えるヒント」)", () => {
    const html = renderToStaticMarkup(<SummaryFooter />);
    expect(html).toContain('aria-label="リズムを整えるヒント"');
  });
});
