/**
 * 在 app シフト表取込 入口（S1）+ 確認画面（S2）— render contract
 *
 * renderToStaticMarkup 規約（jsdom 不使用）。
 *
 * 固定:
 *   §1 flag default OFF（commit ガード）
 *   §2 ShiftImportEntryInner: 「シフト表」ボタンが出る（modal は閉＝null）
 *   §3 S2: ShiftImportModal を fixture cells + saveEnabled=false で開くと確認画面が出る
 *       （= live VLM 非依存・DB write なしの確認のみ経路）
 *   §4 S3A-2-2-1: draftLiveEnabled の prop chain（default false・閉状態では live UI 非表示）
 *   §5 S3A-2-2-2: ShiftDraftInApp（在app live flow 初期 shell・saveEnabled=false・raw 非保持）
 */
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// ShiftImportModal の import chain（server action）対策（既存 plan render test と同方針）
vi.mock("server-only", () => ({}));

import { PLAN_FLAGS } from "@/lib/plan/featureFlags";
import { ShiftImportEntryInner } from "@/app/(culcept)/plan/components/ShiftImportEntryInner";
import { ShiftDraftInApp } from "@/app/(culcept)/plan/components/ShiftDraftInApp";
import { ShiftImportModal } from "@/app/(culcept)/plan/components/ShiftImportModal";
import { buildShiftFixture } from "@/lib/plan/shift/devFixtureHost";

const NOW = new Date("2025-06-12T00:00:00.000Z");

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
describe("§1 PLAN_FLAGS.shiftImportEntryEnabled — commit ガード", () => {
  it("default OFF（env 未設定 → false）= 本番で入口非表示", () => {
    expect(PLAN_FLAGS.shiftImportEntryEnabled).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
describe("§2 ShiftImportEntryInner — 入口本体", () => {
  it("「シフト表」取込ボタンが出る（modal は閉＝null）", () => {
    const html = renderToStaticMarkup(<ShiftImportEntryInner now={NOW} />);
    expect(html).toContain('data-testid="plan-shift-import-entry"');
    expect(html).toContain("シフト表");
    expect(html).toContain("シフト表（画像・PDF）を取り込む"); // aria-label
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
describe("§3 S2: 確認画面（fixture cells・saveEnabled=false）", () => {
  it("ShiftImportModal open + fixture cells → 確認画面が render（fixture コードが出る）", () => {
    const fx = buildShiftFixture(NOW); // FIXTURE_CODES = E-18 / H / HREQ
    expect(fx.cells.length).toBeGreaterThan(0);
    const html = renderToStaticMarkup(
      <ShiftImportModal
        open={true}
        year={fx.year}
        month={fx.month}
        cells={fx.cells}
        saveEnabled={false}
        riskReviewEnabled
        onSuccess={() => {}}
        onClose={() => {}}
      />
    );
    // 確認画面が落ちずに render され、fixture の原稿コードが少なくとも 1 つ出る
    const anyCode = fx.cells.some((c) => html.includes(c.rawCode));
    expect(anyCode).toBe(true);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §4 S3A-2-2-1: draftLiveEnabled plumbing（flag + prop chain・live UI はまだ出さない）
describe("§4 draftLiveEnabled plumbing（live UI 非接続）", () => {
  it("PLAN_FLAGS.shiftDraftLiveEnabled は default false（commit ガード）", () => {
    expect(PLAN_FLAGS.shiftDraftLiveEnabled).toBe(false);
  });

  it("draftLiveEnabled 未指定 → data-draft-live=\"false\"（既定）", () => {
    const html = renderToStaticMarkup(<ShiftImportEntryInner now={NOW} />);
    expect(html).toContain('data-draft-live="false"');
  });

  it("draftLiveEnabled=true → data-draft-live=\"true\"（prop が leaf component まで届く）", () => {
    const html = renderToStaticMarkup(
      <ShiftImportEntryInner now={NOW} draftLiveEnabled={true} />
    );
    expect(html).toContain('data-draft-live="true"');
  });

  it("draftLiveEnabled=true でも live UI はまだ出ない（fixture 入口のまま・file input / dev-shift-draft なし）", () => {
    const htmlLive = renderToStaticMarkup(
      <ShiftImportEntryInner now={NOW} draftLiveEnabled={true} />
    );
    const htmlFixture = renderToStaticMarkup(
      <ShiftImportEntryInner now={NOW} draftLiveEnabled={false} />
    );
    // 入口ボタンは両方で出る（fixture fallback 不変）
    expect(htmlLive).toContain('data-testid="plan-shift-import-entry"');
    // live flow（画像選択 file input / dev-shift-draft host）はまだ出さない
    expect(htmlLive).not.toMatch(/type="file"/i);
    expect(htmlLive).not.toContain("dev-shift-draft");
    // data-draft-live 以外は fixture 版と完全同一構造（閉状態では live UI 差分ゼロ）
    expect(
      htmlLive.replace('data-draft-live="true"', 'data-draft-live="false"')
    ).toBe(htmlFixture);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §5 S3A-2-2-2: ShiftDraftInApp（在app live flow・初期 shell・saveEnabled=false・raw 非保持）
describe("§5 ShiftDraftInApp（在app live flow）", () => {
  it("初期 shell（idle）が render される（画像を選ぶ / PNG・JPEG file input）", () => {
    const html = renderToStaticMarkup(<ShiftDraftInApp onClose={() => {}} />);
    expect(html).toContain('data-testid="plan-shift-draft-inapp"');
    expect(html).toContain('data-testid="plan-shift-draft-inapp-idle"');
    expect(html).toContain("画像を選ぶ");
    expect(html).toMatch(/type="file"/i);
    expect(html).toMatch(/accept="image\/png,image\/jpeg"/i);
  });

  it("idle では確認画面 / 保存 CTA / 抽出ボタンが出ない（VLM は user action 時のみ・auto なし）", () => {
    const html = renderToStaticMarkup(<ShiftDraftInApp onClose={() => {}} />);
    // 確認画面（ShiftReviewGrid）は cells_loaded.reviewOpen のみ mount → idle では出ない
    expect(html).not.toContain('data-testid="shift-review-grid"');
    // 保存 CTA は出さない（saveEnabled=false・そもそも idle）
    expect(html).not.toContain("この内容で保存");
    // 抽出ボタン（この画像で読み取る）は crop_review のみ → idle では出ない
    expect(html).not.toContain("この画像で読み取る");
  });

  it("画像本体（base64 / dataURL / blob:）の trace がない（ObjectURL のみ・raw 非保持）", () => {
    const html = renderToStaticMarkup(<ShiftDraftInApp onClose={() => {}} />);
    expect(html).not.toMatch(/data:image|base64|dataurl/i);
    expect(html).not.toContain("blob:");
  });

  it("dev 専用 chrome（検証 host / debug summary）は出さない（product presentation）", () => {
    const html = renderToStaticMarkup(<ShiftDraftInApp onClose={() => {}} />);
    expect(html).not.toContain("検証 host");
    expect(html).not.toContain('data-testid="dev-shift-draft-debug-summary"');
    expect(html).not.toContain("製品の取り込み入口ではありません");
  });
});
