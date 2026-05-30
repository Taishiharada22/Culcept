/**
 * URL Import Productization U3 — IcsImportModal render contract test
 *
 * 検証範囲:
 *   §1 isOpen=false → 空 (= modal 出さない)
 *   §2 isOpen=true (idle) → URL 副導線が残っており、 ガイドトグルが**閉じた状態**で出る
 *   §3 既存テスト ID の継続 (= 非破壊。 ics-url-input / ics-url-fetch-btn / ics-file-input)
 *   §4 ガイドトグル文言「URL の取り方がわからない」（CEO 配置=URL 副導線上の inline accordion）
 *   §5 OAuth ボタン 2 つ (Google / Outlook) が主役のまま (= 非破壊、 OAuth 階層維持)
 *
 * 不変原則 (= 既存 render contract 規約踏襲):
 *   - @testing-library 不使用 (= renderToStaticMarkup のみ)
 *   - LLM / API / DB / network 不使用
 *   - interaction (= state 変化) は SSR で取れないため smoke に回す
 *     → 本 test は「初期 idle DOM が壊れていない」「ガイドトグルが存在する」までを固定
 */

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// IcsImportModal は server-only な action 群を import するため、
// node 環境テストで実体を読まないよう mock 化 (render contract のみが目的)。
vi.mock("../../../app/(culcept)/plan/_actions/importIcsAnchors", () => ({
  importIcsAnchorsAction: vi.fn(),
}));
vi.mock("../../../app/(culcept)/plan/_actions/importGoogleAnchors", () => ({
  importGoogleAnchorsAction: vi.fn(),
}));
vi.mock("../../../app/(culcept)/plan/_actions/importMicrosoftAnchors", () => ({
  importMicrosoftAnchorsAction: vi.fn(),
}));
vi.mock("../../../app/(culcept)/plan/_actions/fetchIcsFromUrl", () => ({
  fetchIcsFromUrlAction: vi.fn(),
}));

import { IcsImportModal } from "@/app/(culcept)/plan/components/IcsImportModal";

const noop = (): void => undefined;

function renderClosed(): string {
  return renderToStaticMarkup(
    <IcsImportModal
      isOpen={false}
      onClose={noop}
      onSuccess={noop}
      existingAnchors={[]}
    />,
  );
}

function renderOpen(): string {
  return renderToStaticMarkup(
    <IcsImportModal
      isOpen={true}
      onClose={noop}
      onSuccess={noop}
      existingAnchors={[]}
    />,
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §1. isOpen=false (= modal を出さない)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§1 isOpen=false", () => {
  it("modal 内容を render しない (= ics-import-modal testid 無し)", () => {
    const html = renderClosed();
    expect(html).not.toContain('data-testid="ics-import-modal"');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §2 + §3. isOpen=true (idle) — 既存非破壊
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§2-3 isOpen=true idle — 既存 URL 副導線と file/OAuth が残る", () => {
  it("modal root が render される", () => {
    expect(renderOpen()).toContain('data-testid="ics-import-modal"');
  });

  it("既存 URL 副導線の input / button が残る (testid 非破壊)", () => {
    const html = renderOpen();
    expect(html).toContain('data-testid="ics-url-input"');
    expect(html).toContain('data-testid="ics-url-fetch-btn"');
  });

  it("既存 file input が残る (testid 非破壊)", () => {
    expect(renderOpen()).toContain('data-testid="ics-file-input"');
  });

  it("OAuth ボタン 2 つ (Google / Outlook) が主役のまま残る (CEO 階層維持)", () => {
    const html = renderOpen();
    expect(html).toContain('data-testid="google-connect-toggle"');
    expect(html).toContain('data-testid="microsoft-connect-toggle"');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §4. U3 ガイドトグル (= URL 副導線上 inline accordion、 初期 closed)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§4 U3 ガイドトグルが副導線として存在し、 初期は閉じている", () => {
  it("ガイドトグルが render され、 文言「URL の取り方がわからない」を含む", () => {
    const html = renderOpen();
    expect(html).toContain('data-testid="url-guide-toggle"');
    expect(html).toContain("URL の取り方がわからない");
  });

  it("ガイドは初期 closed (= aria-expanded='false')", () => {
    const html = renderOpen();
    // open 時の文字列「URL の取り方を閉じる」と guide-content は出さない
    expect(html).not.toContain("URL の取り方を閉じる");
    expect(html).not.toContain('data-testid="url-guide-content"');
    expect(html).toContain('aria-expanded="false"');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §5. classifier feedback (= URL 未入力時は何も出さない)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§5 URL 空のとき classifier feedback は何も出さない (= popcorn 防止)", () => {
  it("ics_body / ok / page-guess / not-a-url いずれも初期 idle では出ない", () => {
    const html = renderOpen();
    expect(html).not.toContain('data-testid="url-classify-ics-body"');
    expect(html).not.toContain('data-testid="url-classify-ok"');
    expect(html).not.toContain('data-testid="url-classify-page-guess"');
    expect(html).not.toContain('data-testid="url-classify-not-a-url"');
  });
});
