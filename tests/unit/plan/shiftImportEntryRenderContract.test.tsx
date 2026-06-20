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
 *   §6 S-save-2: saveEnabled の server→prop plumbing（flag default OFF・endpoint forwarding・dormant 不変）
 */
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// ShiftImportModal の import chain（server action）対策（既存 plan render test と同方針）
vi.mock("server-only", () => ({}));

import { PLAN_FLAGS } from "@/lib/plan/featureFlags";
import { ShiftImportEntryInner } from "@/app/(culcept)/plan/components/ShiftImportEntryInner";
import { ShiftDraftInApp } from "@/app/(culcept)/plan/components/ShiftDraftInApp";
import { ShiftImportModal } from "@/app/(culcept)/plan/components/ShiftImportModal";
import type { ShiftReviewCell } from "@/app/(culcept)/plan/components/ShiftReviewGrid";
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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §6 S-save-2: saveEnabled の server→prop plumbing
//   - PLAN_SHIFT_IMPORT_SAVE（server-only flag）を server で読み boolean prop で leaf まで流す。
//   - flag OFF（既定）→ 確認画面の保存導線は dormant placeholder（「この内容で保存」なし＝action 到達不能）。
//   - flag ON 相当（saveEnabled=true）→ 在app live review の endpoint（ShiftImportModal）で active 保存 CTA。
//   - ShiftDraftInApp idle では saveEnabled は inert（保存は cells_loaded のみ・auto なし）。
//   注: rawCode N/G は HARADA_SPRIX で解決（unresolved なし）→ saveEnabled=true で active CTA が出る。

const RESOLVED_CELLS: ShiftReviewCell[] = [
  { day: 1, date: "2025-06-01", rawCode: "N", confidence: 1 },
  { day: 2, date: "2025-06-02", rawCode: "G", confidence: 1 },
];

describe("§6 saveEnabled plumbing（PLAN_SHIFT_IMPORT_SAVE → server→prop）", () => {
  it("PLAN_FLAGS.shiftImportSave は default false（commit ガード = 保存 dormant）", () => {
    expect(PLAN_FLAGS.shiftImportSave).toBe(false);
  });

  it("endpoint: saveEnabled=false（flag OFF 相当）→ 確認画面は dormant placeholder（「この内容で保存」なし＝保存 action 到達不能）", () => {
    const html = renderToStaticMarkup(
      <ShiftImportModal
        open={true}
        year={2025}
        month={6}
        cells={RESOLVED_CELLS}
        saveEnabled={false}
        onSuccess={() => {}}
        onClose={() => {}}
      />
    );
    expect(html).toContain("反映（次段で有効化）"); // dormant placeholder
    expect(html).not.toContain("この内容で保存"); // active 保存 trigger なし
  });

  it("endpoint: saveEnabled=true（flag ON 相当）+ resolved cells → active 保存 CTA（「この内容で保存」・enabled 構造）", () => {
    const html = renderToStaticMarkup(
      <ShiftImportModal
        open={true}
        year={2025}
        month={6}
        cells={RESOLVED_CELLS}
        saveEnabled={true}
        onSuccess={() => {}}
        onClose={() => {}}
      />
    );
    expect(html).toContain("この内容で保存"); // active 保存 CTA（structure のみ・click は別経路）
    expect(html).not.toContain("反映（次段で有効化）");
  });

  it("ShiftDraftInApp: saveEnabled 未指定（default false）→ idle に保存 CTA なし", () => {
    const html = renderToStaticMarkup(<ShiftDraftInApp onClose={() => {}} />);
    expect(html).not.toContain("この内容で保存");
  });

  it("ShiftDraftInApp: saveEnabled は idle で inert（true/false で idle shell 完全同一・保存は cells_loaded のみ）", () => {
    const htmlOn = renderToStaticMarkup(
      <ShiftDraftInApp saveEnabled={true} onClose={() => {}} />
    );
    const htmlOff = renderToStaticMarkup(
      <ShiftDraftInApp saveEnabled={false} onClose={() => {}} />
    );
    // idle では確認画面が mount されないため saveEnabled は描画に影響しない（保存導線は cells_loaded のみ）
    expect(htmlOn).toBe(htmlOff);
    expect(htmlOn).not.toContain("この内容で保存");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §7 RD-2 bug fix: 保存成功 callback の pass-through seam
//   - PlanShiftImportEntry / ShiftImportEntryInner / ShiftDraftInApp が onSuccess?: () => void prop を
//     受け取れること（型 + render エラーなし）。
//   - onSuccess 未指定でも従来通り render される（後方互換）。
//   - onSuccess を渡しても render は壊れない（structure に影響なし）。
//   - 実 callback の発火タイミング（save 成功 → 内部 onSaveSucceeded → 親 onSuccess の順）は実 DB 接続が
//     必要な統合経路のため、本 render contract test では型 + render の seam が成立することまでを担保する。
describe("§7 RD-2 bug fix: onSuccess pass-through seam（型 + render）", () => {
  it("ShiftImportEntryInner: onSuccess 未指定でも閉状態で render OK（後方互換）", () => {
    const html = renderToStaticMarkup(<ShiftImportEntryInner now={NOW} />);
    expect(html).toContain('data-testid="plan-shift-import-entry"');
  });

  it("ShiftImportEntryInner: onSuccess を指定しても閉状態の render が変わらない", () => {
    const cb = vi.fn();
    const htmlWith = renderToStaticMarkup(
      <ShiftImportEntryInner now={NOW} onSuccess={cb} />
    );
    const htmlWithout = renderToStaticMarkup(
      <ShiftImportEntryInner now={NOW} />
    );
    expect(htmlWith).toBe(htmlWithout);
    // render 時点では callback は呼ばれない（mount/save 経路）
    expect(cb).not.toHaveBeenCalled();
  });

  it("ShiftDraftInApp: onSuccess を指定しても idle shell が変わらない（saveEnabled inert と同方針）", () => {
    const cb = vi.fn();
    const htmlWith = renderToStaticMarkup(
      <ShiftDraftInApp onClose={() => {}} onSuccess={cb} />
    );
    const htmlWithout = renderToStaticMarkup(
      <ShiftDraftInApp onClose={() => {}} />
    );
    expect(htmlWith).toBe(htmlWithout);
    expect(cb).not.toHaveBeenCalled();
  });
});
