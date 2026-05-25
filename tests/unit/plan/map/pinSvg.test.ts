/**
 * Phase 3-N Map impl sub-phase 9a-impl Step γ — pinSvg pure helper contract test
 *
 * 検証範囲 (= Step γ 独自 pin SVG data URI):
 *   §1 全 category → data URI 生成 + 涙型 + カテゴリ色
 *   §2 selected 時 size 拡大 + stroke 強化
 *   §3 各 category icon path embedded (= 白抜き)
 *   §4 出力 URI format (= data:image/svg+xml;charset=utf-8,)
 *   §5 getPinSize: selected/unselected size
 *
 * 不変原則:
 *   - 純粋関数 (= 同 input → 同 output、 deterministic)
 *   - SVG xmlns + viewBox + path 必須
 *
 * 設計書:
 *   - lib/plan/map/pinSvg.ts
 */

import { describe, expect, it } from "vitest";
import {
  generatePinSvgDataUri,
  getPinSize,
} from "@/lib/plan/map/pinSvg";
import type { EventCategory } from "@/lib/plan/list/types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("pinSvg §1 全 category → 涙型 + カテゴリ色", () => {
  const cases: Array<{ category: EventCategory; expectedColor: string }> = [
    { category: 'cafe', expectedColor: '%236366f1' }, // # → %23 encoded
    { category: 'meal', expectedColor: '%23f97316' },
    { category: 'work', expectedColor: '%233b82f6' },
    { category: 'home', expectedColor: '%2310b981' },
    { category: 'other', expectedColor: '%2364748b' },
  ];

  for (const c of cases) {
    it(`§1.${c.category} → data URI に色 ${c.expectedColor} を含む`, () => {
      const uri = generatePinSvgDataUri(c.category, false);
      expect(uri).toContain(c.expectedColor);
      // 涙型 path 確認 (= encodeURIComponent された M)
      expect(uri).toContain('M%2020%200'); // "M 20 0" encoded
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("pinSvg §2 selected 時 size 拡大 + stroke 強化", () => {
  it("§2.1 unselected → width 40 / height 64 (= pin 48 + label 16)", () => {
    const uri = generatePinSvgDataUri('cafe', false);
    expect(uri).toContain('width%3D%2240%22');
    expect(uri).toContain('height%3D%2264%22');
  });

  it("§2.2 selected → width 48 / height 72 (= 1.2x scale + label area)", () => {
    const uri = generatePinSvgDataUri('cafe', true);
    expect(uri).toContain('width%3D%2248%22');
    expect(uri).toContain('height%3D%2272%22');
  });

  it("§2.3 unselected → stroke-width 2 (= 通常)", () => {
    const uri = generatePinSvgDataUri('cafe', false);
    expect(uri).toContain('stroke-width%3D%222%22');
  });

  it("§2.4 selected → stroke-width 3 (= halo 強化)", () => {
    const uri = generatePinSvgDataUri('cafe', true);
    expect(uri).toContain('stroke-width%3D%223%22');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("pinSvg §3 各 category icon path embedded", () => {
  it("§3.cafe → コーヒーカップ本体 path 含む", () => {
    const uri = generatePinSvgDataUri('cafe', false);
    // cafe path "M 3 9 H 12" の "M 3 9" 部分が encoded で含まれる
    expect(uri).toContain('M%203%209');
  });

  it("§3.meal → フォーク + ナイフ path 含む (= 「M 4 2 V 7」 フォーク 1 本目)", () => {
    const uri = generatePinSvgDataUri('meal', false);
    expect(uri).toContain('M%204%202%20V%207');
  });

  it("§3.work → ブリーフケース 取っ手 path 含む (= 「M 6 4」 開始)", () => {
    const uri = generatePinSvgDataUri('work', false);
    expect(uri).toContain('M%206%204');
  });

  it("§3.home → 家屋根 path 含む (= 「M 2 8 L 9 2 L 16 8」 三角)", () => {
    const uri = generatePinSvgDataUri('home', false);
    expect(uri).toContain('M%202%208%20L%209%202');
  });

  it("§3.other → 円 dot 含む (= circle cx=9 cy=9)", () => {
    const uri = generatePinSvgDataUri('other', false);
    expect(uri).toContain('cx%3D%229%22');
    expect(uri).toContain('cy%3D%229%22');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("pinSvg §4 出力 format", () => {
  it("§4.1 data:image/svg+xml;charset=utf-8, prefix で始まる", () => {
    const uri = generatePinSvgDataUri('cafe', false);
    expect(uri.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
  });

  it("§4.2 xmlns / viewBox / path 全 含む (= viewBox unselected 40×64 で label 領域含む)", () => {
    const uri = generatePinSvgDataUri('cafe', false);
    expect(uri).toContain('xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22');
    expect(uri).toContain('viewBox%3D%220%200%2040%2064%22');
  });

  it("§4.3 absolute pure function (= 同 input → 同 output)", () => {
    const a = generatePinSvgDataUri('cafe', false);
    const b = generatePinSvgDataUri('cafe', false);
    expect(a).toBe(b);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("pinSvg §5 getPinSize", () => {
  it("§5.1 unselected → {width: 40, height: 64, pinTipY: 48}", () => {
    expect(getPinSize(false)).toEqual({ width: 40, height: 64, pinTipY: 48 });
  });

  it("§5.2 selected → {width: 48, height: 72, pinTipY: 48}", () => {
    expect(getPinSize(true)).toEqual({ width: 48, height: 72, pinTipY: 48 });
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("pinSvg §6 time label embedded (= Step γ 白カードラベル)", () => {
  it("§6.1 timeLabel 渡しで rect (= 白カード) + text 含む", () => {
    const uri = generatePinSvgDataUri('cafe', false, '09:00');
    // rect (= 白カード) を encoded で含む
    expect(uri).toContain('rect');
    // time "09:00" encoded
    expect(uri).toContain('09%3A00');
  });

  it("§6.2 timeLabel 未指定で rect なし (= label 出さない)", () => {
    const uri = generatePinSvgDataUri('cafe', false);
    expect(uri).not.toContain('rect');
  });

  it("§6.3 selected で font-size 10 / unselected で font-size 9", () => {
    const selected = generatePinSvgDataUri('cafe', true, '09:00');
    const unselected = generatePinSvgDataUri('cafe', false, '09:00');
    expect(selected).toContain('font-size%3D%2210%22');
    expect(unselected).toContain('font-size%3D%229%22');
  });

  it("§6.4 timeLabel XML escape (= < > & 安全化)", () => {
    const uri = generatePinSvgDataUri('cafe', false, '<>&');
    expect(uri).toContain('%26lt%3B'); // &lt; encoded
    expect(uri).toContain('%26gt%3B'); // &gt; encoded
    expect(uri).toContain('%26amp%3B'); // &amp; encoded
  });
});
