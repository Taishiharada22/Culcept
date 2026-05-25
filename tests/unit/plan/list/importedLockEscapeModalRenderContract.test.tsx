/**
 * Phase 3-N List impl sub-phase 7 — ImportedLockEscapeModal render contract test
 *
 * 検証範囲 (= sub-phase 7 first-pass、 第 7 補正 #2 imported lock 逃がし道 + CEO 追加条件):
 *   §1 isOpen=false → null (= 空 HTML、 DOM 出さない)
 *   §2 isOpen=true → modal HTML 出力 (見出し / sub-text / 2 affordance / cancel)
 *   §3 2 affordance 文言確認 (= 「この予定を上書きして編集」 / 「複製して別の予定として編集」)
 *   §4 a11y attributes (= role='dialog' / aria-modal='true' / aria-labelledby)
 *   §5 規約 24-extended (= focus-visible:border-slate-300 + brand 色 0)
 *   §6 importedFrom sub-text 表示
 *
 * 不変原則:
 *   - @testing-library なし (= react-dom/server.renderToStaticMarkup のみ使用)
 *   - LLM / API / DB / network 不使用
 *   - 既存 file 不触
 *   - first-pass: callback 呼出のみ test、 実 logic 接続は sub-phase 8+
 *
 * 設計書:
 *   - Spec audit §5.8 + §19.13
 *   - IA Audit §2.2 #5 (= imported lock 逃がし道)
 *   - app/(culcept)/plan/components/list/ImportedLockEscapeModal.tsx
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ImportedLockEscapeModal } from "@/app/(culcept)/plan/components/list/ImportedLockEscapeModal";

const noop = (): void => undefined;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §1 isOpen=false → null (= 空 HTML、 DOM 出さない)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("ImportedLockEscapeModal §1. isOpen=false → null", () => {
  it("§1.1 isOpen=false なら空 HTML (= modal DOM 出さない)", () => {
    const html = renderToStaticMarkup(
      <ImportedLockEscapeModal
        isOpen={false}
        onClose={noop}
        onOverride={noop}
        onClone={noop}
        importedFrom="シフト表"
      />,
    );
    expect(html).toBe('');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §2 isOpen=true → modal HTML 出力
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("ImportedLockEscapeModal §2. isOpen=true → modal HTML 出力", () => {
  it("§2.1 見出し 「予定の編集」 が出る", () => {
    const html = renderToStaticMarkup(
      <ImportedLockEscapeModal
        isOpen={true}
        onClose={noop}
        onOverride={noop}
        onClone={noop}
        importedFrom="シフト表"
      />,
    );
    expect(html).toContain('予定の編集');
  });

  it("§2.2 modal container + 2 affordance + cancel が DOM に出る", () => {
    const html = renderToStaticMarkup(
      <ImportedLockEscapeModal
        isOpen={true}
        onClose={noop}
        onOverride={noop}
        onClone={noop}
        importedFrom="シフト表"
      />,
    );
    expect(html).toContain('data-testid="plan-list-imported-lock-escape-modal"');
    expect(html).toContain('data-testid="plan-list-imported-lock-escape-modal-override"');
    expect(html).toContain('data-testid="plan-list-imported-lock-escape-modal-clone"');
    expect(html).toContain('data-testid="plan-list-imported-lock-escape-modal-cancel"');
    expect(html).toContain('data-testid="plan-list-imported-lock-escape-modal-backdrop"');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §3 2 affordance 文言確認 (= CEO + GPT 追加条件、 override / clone 意味混在防止)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("ImportedLockEscapeModal §3. 2 affordance 文言 (= CEO 追加条件)", () => {
  it("§3.1 override affordance: 「この予定を上書きして編集」 + 補足", () => {
    const html = renderToStaticMarkup(
      <ImportedLockEscapeModal
        isOpen={true}
        onClose={noop}
        onOverride={noop}
        onClone={noop}
        importedFrom="シフト表"
      />,
    );
    expect(html).toContain('この予定を上書きして編集');
    expect(html).toContain('元の予定が編集後の内容に置き換わります');
  });

  it("§3.2 clone affordance: 「複製して別の予定として編集」 + 補足", () => {
    const html = renderToStaticMarkup(
      <ImportedLockEscapeModal
        isOpen={true}
        onClose={noop}
        onOverride={noop}
        onClone={noop}
        importedFrom="シフト表"
      />,
    );
    expect(html).toContain('複製して別の予定として編集');
    expect(html).toContain('元の予定はそのまま残り、新しい予定が追加されます');
  });

  it("§3.3 cancel: 「閉じる」", () => {
    const html = renderToStaticMarkup(
      <ImportedLockEscapeModal
        isOpen={true}
        onClose={noop}
        onOverride={noop}
        onClone={noop}
        importedFrom="シフト表"
      />,
    );
    expect(html).toContain('閉じる');
  });

  it("§3.4 禁止語 10 件 (= おすすめ / これをした方がいい / 最適 / 推奨 / 改善 / 警告 / 危険 / 注意 / リスク / 最適化) 出ない", () => {
    const html = renderToStaticMarkup(
      <ImportedLockEscapeModal
        isOpen={true}
        onClose={noop}
        onOverride={noop}
        onClone={noop}
        importedFrom="シフト表"
      />,
    );
    expect(html).not.toContain('おすすめ');
    expect(html).not.toContain('これをした方がいい');
    expect(html).not.toContain('最適');
    expect(html).not.toContain('推奨');
    expect(html).not.toContain('改善');
    expect(html).not.toContain('警告');
    expect(html).not.toContain('危険');
    expect(html).not.toContain('注意');
    expect(html).not.toContain('リスク');
    // 最適化 (substring) は 最適 で既に網羅されるが念のため
    expect(html).not.toContain('最適化');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §4 a11y attributes (= dialog / aria-modal / aria-labelledby)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("ImportedLockEscapeModal §4. a11y attributes", () => {
  it("§4.1 role='dialog' が container に出る", () => {
    const html = renderToStaticMarkup(
      <ImportedLockEscapeModal
        isOpen={true}
        onClose={noop}
        onOverride={noop}
        onClone={noop}
        importedFrom="シフト表"
      />,
    );
    expect(html).toContain('role="dialog"');
  });

  it("§4.2 aria-modal='true' が出る", () => {
    const html = renderToStaticMarkup(
      <ImportedLockEscapeModal
        isOpen={true}
        onClose={noop}
        onOverride={noop}
        onClone={noop}
        importedFrom="シフト表"
      />,
    );
    expect(html).toContain('aria-modal="true"');
  });

  it("§4.3 aria-labelledby が heading id を参照", () => {
    const html = renderToStaticMarkup(
      <ImportedLockEscapeModal
        isOpen={true}
        onClose={noop}
        onOverride={noop}
        onClone={noop}
        importedFrom="シフト表"
      />,
    );
    expect(html).toContain('aria-labelledby="imported-lock-escape-modal-heading"');
    expect(html).toContain('id="imported-lock-escape-modal-heading"');
  });

  it("§4.4 backdrop は aria-hidden + tabIndex=-1 (= 直接 focus 不可)", () => {
    const html = renderToStaticMarkup(
      <ImportedLockEscapeModal
        isOpen={true}
        onClose={noop}
        onOverride={noop}
        onClone={noop}
        importedFrom="シフト表"
      />,
    );
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('tabindex="-1"');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §5 規約 24-extended (= focus-visible:border-slate-300 + brand 色 0)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("ImportedLockEscapeModal §5. 規約 24-extended", () => {
  it("§5.1 focus-visible:border-slate-300 が全 interactive 要素に出る", () => {
    const html = renderToStaticMarkup(
      <ImportedLockEscapeModal
        isOpen={true}
        onClose={noop}
        onOverride={noop}
        onClone={noop}
        importedFrom="シフト表"
      />,
    );
    expect(html).toContain('focus-visible:border-slate-300');
    // override / clone / cancel の 3 button 全部に focus-visible:border-slate-300
    const matches = html.match(/focus-visible:border-slate-300/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(3);
  });

  it("§5.2 focus-visible:border-{indigo|purple|amber|orange|red} 等 brand 系含まれない", () => {
    const html = renderToStaticMarkup(
      <ImportedLockEscapeModal
        isOpen={true}
        onClose={noop}
        onOverride={noop}
        onClone={noop}
        importedFrom="シフト表"
      />,
    );
    expect(html).not.toMatch(/focus-visible:border-indigo/);
    expect(html).not.toMatch(/focus-visible:border-purple/);
    expect(html).not.toMatch(/focus-visible:border-amber/);
    expect(html).not.toMatch(/focus-visible:border-orange/);
    expect(html).not.toMatch(/focus-visible:border-red/);
  });

  it("§5.3 focus: (= focus-visible なし) brand 系も含まれない", () => {
    const html = renderToStaticMarkup(
      <ImportedLockEscapeModal
        isOpen={true}
        onClose={noop}
        onOverride={noop}
        onClone={noop}
        importedFrom="シフト表"
      />,
    );
    expect(html).not.toMatch(/focus:border-indigo/);
    expect(html).not.toMatch(/focus:border-purple/);
    expect(html).not.toMatch(/focus:border-slate/); // visibility なし slate も禁止
  });

  it("§5.4 focus:outline-none 維持 (= browser default outline 排除)", () => {
    const html = renderToStaticMarkup(
      <ImportedLockEscapeModal
        isOpen={true}
        onClose={noop}
        onOverride={noop}
        onClone={noop}
        importedFrom="シフト表"
      />,
    );
    expect(html).toContain('focus:outline-none');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §6 importedFrom sub-text 表示
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("ImportedLockEscapeModal §6. importedFrom sub-text 表示", () => {
  it("§6.1 importedFrom 名が sub-text に表示 (= 「シフト表」)", () => {
    const html = renderToStaticMarkup(
      <ImportedLockEscapeModal
        isOpen={true}
        onClose={noop}
        onOverride={noop}
        onClone={noop}
        importedFrom="シフト表"
      />,
    );
    expect(html).toContain('シフト表から取り込んだ予定です');
  });

  it("§6.2 別 importedFrom 名でも format 維持 (= 「大学時間割PDF」)", () => {
    const html = renderToStaticMarkup(
      <ImportedLockEscapeModal
        isOpen={true}
        onClose={noop}
        onOverride={noop}
        onClone={noop}
        importedFrom="大学時間割PDF"
      />,
    );
    expect(html).toContain('大学時間割PDFから取り込んだ予定です');
  });
});
