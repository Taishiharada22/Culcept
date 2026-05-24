/**
 * Phase 3-N List impl sub-phase 6 — ExecutionLayerChip render contract test
 *
 * 検証範囲 (= IA 拘束 #6 軽いサイン spec + 規約 24-extended、 react-dom/server で string HTML 検査):
 *   §1 0 件 / 空 → null (= IA #8 「出さないイベント」 整合)
 *   §2 compound 表示 (= 「準備 N / 事後 M」、 各 counts > 0 のみ slash 区切り)
 *   §3 focus-visible slate (= 規約 24-extended、 brand 色禁止)
 *   §4 a11y (= aria-label が 「execution layer: ...」 format、 button type 明示)
 *
 * 不変原則:
 *   - @testing-library なし (= react-dom/server.renderToStaticMarkup のみ使用)
 *   - LLM / API / DB / network 不使用
 *   - 既存 file 不触
 *
 * 設計書:
 *   - Spec audit §5.7 + §19.13
 *   - IA Audit §2.2 #6 (= 軽いサイン spec)
 *   - app/(culcept)/plan/components/list/ExecutionLayerChip.tsx
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ExecutionLayerChip } from "@/app/(culcept)/plan/components/list/ExecutionLayerChip";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §1 0 件 / 空 → null (= IA #8 整合)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("ExecutionLayerChip §1. 0 件 / 空 → null", () => {
  it("§1.1 全 counts undefined → null (= 空 HTML)", () => {
    const html = renderToStaticMarkup(<ExecutionLayerChip counts={{}} />);
    expect(html).toBe('');
  });

  it("§1.2 全 counts 0 → null (= 空 HTML)", () => {
    const html = renderToStaticMarkup(
      <ExecutionLayerChip counts={{ preparation: 0, post: 0 }} />,
    );
    expect(html).toBe('');
  });

  it("§1.3 preparation 0 + post undefined → null", () => {
    const html = renderToStaticMarkup(
      <ExecutionLayerChip counts={{ preparation: 0 }} />,
    );
    expect(html).toBe('');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §2 compound 表示 (= 各 counts > 0 のみ slash 区切り)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("ExecutionLayerChip §2. compound 表示", () => {
  it("§2.1 preparation のみ → 「準備 N」", () => {
    const html = renderToStaticMarkup(
      <ExecutionLayerChip counts={{ preparation: 3 }} />,
    );
    expect(html).toContain('準備 3');
    expect(html).not.toContain('事後');
    expect(html).not.toContain(' / ');
  });

  it("§2.2 post のみ → 「事後 M」", () => {
    const html = renderToStaticMarkup(
      <ExecutionLayerChip counts={{ post: 2 }} />,
    );
    expect(html).toContain('事後 2');
    expect(html).not.toContain('準備');
    expect(html).not.toContain(' / ');
  });

  it("§2.3 両方 > 0 → 「準備 N / 事後 M」", () => {
    const html = renderToStaticMarkup(
      <ExecutionLayerChip counts={{ preparation: 3, post: 1 }} />,
    );
    expect(html).toContain('準備 3');
    expect(html).toContain('事後 1');
    expect(html).toContain(' / ');
  });

  it("§2.4 preparation > 0 + post 0 → 「準備 N」 のみ (= 0 は除外)", () => {
    const html = renderToStaticMarkup(
      <ExecutionLayerChip counts={{ preparation: 3, post: 0 }} />,
    );
    expect(html).toContain('準備 3');
    expect(html).not.toContain('事後');
    expect(html).not.toContain(' / ');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §3 focus-visible slate (= 規約 24-extended、 brand 色禁止)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("ExecutionLayerChip §3. focus-visible slate (= 規約 24-extended)", () => {
  it("§3.1 focus-visible:border-slate-300 が含まれる", () => {
    const html = renderToStaticMarkup(
      <ExecutionLayerChip counts={{ preparation: 1 }} />,
    );
    expect(html).toContain('focus-visible:border-slate-300');
  });

  it("§3.2 focus-visible:border-{indigo|purple|amber|orange|red} 等 brand 系含まれない", () => {
    const html = renderToStaticMarkup(
      <ExecutionLayerChip counts={{ preparation: 1 }} />,
    );
    expect(html).not.toMatch(/focus-visible:border-indigo/);
    expect(html).not.toMatch(/focus-visible:border-purple/);
    expect(html).not.toMatch(/focus-visible:border-amber/);
    expect(html).not.toMatch(/focus-visible:border-orange/);
    expect(html).not.toMatch(/focus-visible:border-red/);
  });

  it("§3.3 focus: (= focus-visible なし) brand 系も含まれない", () => {
    const html = renderToStaticMarkup(
      <ExecutionLayerChip counts={{ preparation: 1 }} />,
    );
    expect(html).not.toMatch(/focus:border-indigo/);
    expect(html).not.toMatch(/focus:border-purple/);
    expect(html).not.toMatch(/focus:border-slate/); // visibility なし slate も禁止
  });

  it("§3.4 focus:outline-none 維持 (= browser default outline 排除)", () => {
    const html = renderToStaticMarkup(
      <ExecutionLayerChip counts={{ preparation: 1 }} />,
    );
    expect(html).toContain('focus:outline-none');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §4 a11y (= aria-label format + button type 明示)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("ExecutionLayerChip §4. a11y", () => {
  it("§4.1 aria-label が 「execution layer: ...」 format (= preparation のみ)", () => {
    const html = renderToStaticMarkup(
      <ExecutionLayerChip counts={{ preparation: 3 }} />,
    );
    expect(html).toContain('aria-label="execution layer: 準備 3"');
  });

  it("§4.2 aria-label format (= 両方)", () => {
    const html = renderToStaticMarkup(
      <ExecutionLayerChip counts={{ preparation: 3, post: 1 }} />,
    );
    expect(html).toContain('aria-label="execution layer: 準備 3 / 事後 1"');
  });

  it("§4.3 button type=\"button\" 明示 (= form 送信防止)", () => {
    const html = renderToStaticMarkup(
      <ExecutionLayerChip counts={{ preparation: 1 }} />,
    );
    expect(html).toContain('type="button"');
  });

  it("§4.4 data-testid 持つ", () => {
    const html = renderToStaticMarkup(
      <ExecutionLayerChip counts={{ preparation: 1 }} />,
    );
    expect(html).toContain('data-testid="plan-list-execution-chip"');
  });
});
