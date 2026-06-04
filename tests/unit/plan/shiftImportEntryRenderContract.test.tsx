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
 */
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// ShiftImportModal の import chain（server action）対策（既存 plan render test と同方針）
vi.mock("server-only", () => ({}));

import { PLAN_FLAGS } from "@/lib/plan/featureFlags";
import { ShiftImportEntryInner } from "@/app/(culcept)/plan/components/ShiftImportEntryInner";
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
    // data-draft-live 以外は fixture 版と完全同一構造（live UI 差分ゼロ＝plumbing のみ）
    expect(
      htmlLive.replace('data-draft-live="true"', 'data-draft-live="false"')
    ).toBe(htmlFixture);
  });
});
