/**
 * SR B1b-2C-8-c-3 — DevShiftDraftClient render contract（idle static render）
 *
 * 注: renderToStaticMarkup は初期 state=idle のみを描画する。抽出 transition
 *   （row_selected→extracting→cells_loaded/error）の論理は reducer / orchestrator
 *   の pure test（devShiftDraftReducerLogic / runDraftExtractionSubmit）で固定する。
 *   本 contract は idle render + 構造的安全性（base64/raw 不在）+ props 受理に絞る。
 *
 * 不変条件:
 *   ① host testid / 警告 / state=idle
 *   ② idle で file input（accept=image/png,image/jpeg）+「画像を選ぶ」CTA
 *   ③ idle では row-select 階層 / 月入力 / extracting / cells_loaded / error が出ない
 *   ④ 範囲外: ShiftImportModal mount なし / extractShiftDraft trace なし / base64・dataURL・blob: 不在
 *   ⑤ safe copy（本流 / 正式入口 / 保存できます / 取り込み完了 / error 系を含まない）
 *   ⑥ saveEnabled / defaultYear / defaultMonth を受理しても idle render は壊れない
 */
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// extractShiftDraftAction の import chain が server-only（Gemini adapter）を引くため無効化
vi.mock("server-only", () => ({}));

import { DevShiftDraftClient } from "@/app/(culcept)/plan/dev-shift-draft/DevShiftDraftClient";

const htmlDefault = renderToStaticMarkup(<DevShiftDraftClient />);
const htmlSaveOff = renderToStaticMarkup(<DevShiftDraftClient saveEnabled={false} />);
const htmlSaveOn = renderToStaticMarkup(
  <DevShiftDraftClient saveEnabled defaultYear={2026} defaultMonth={6} />
);

describe("DevShiftDraftClient — shell shared invariants（B1b-2C-8-c-3）", () => {
  it("host testid + 警告 + 初期 state=idle が出る", () => {
    expect(htmlDefault).toContain('data-testid="dev-shift-draft-host"');
    expect(htmlDefault).toContain('data-testid="dev-shift-draft-warning"');
    expect(htmlDefault).toContain('data-state="idle"');
  });

  it("「検証 host」「製品の取り込み入口ではありません」（CEO 補正のコピー統一）", () => {
    expect(htmlDefault).toContain("検証 host");
    expect(htmlDefault).toContain("製品の取り込み入口ではありません");
  });

  it("safe copy（避ける表現を含まない）", () => {
    expect(htmlDefault).not.toContain("本流");
    expect(htmlDefault).not.toContain("正式入口");
    expect(htmlDefault).not.toContain("保存できます");
    expect(htmlDefault).not.toContain("取り込み完了");
    expect(htmlDefault).not.toMatch(/error|wrong|failed|誤|失敗|間違/i);
  });
});

describe("DevShiftDraftClient — idle 初期 render（B1b-2C-8-c-3）", () => {
  it("file input が DOM に存在し、accept は image/png,image/jpeg", () => {
    expect(htmlDefault).toContain('data-testid="dev-shift-draft-file-input"');
    expect(htmlDefault).toMatch(/<input[^>]*type="file"/i);
    expect(htmlDefault).toMatch(/accept="image\/png,image\/jpeg"/i);
  });

  it("idle 既定の placeholder + 「画像を選ぶ」CTA が出る", () => {
    expect(htmlDefault).toContain('data-testid="dev-shift-draft-idle"');
    expect(htmlDefault).toContain('data-testid="dev-shift-draft-pick-image"');
    expect(htmlDefault).toContain("画像を選ぶ");
  });

  it("idle では row-select 階層 / 月入力 / 抽出系が出ない", () => {
    expect(htmlDefault).not.toContain('data-testid="dev-shift-draft-row-select"');
    expect(htmlDefault).not.toContain('data-testid="dev-shift-draft-target-month"');
    expect(htmlDefault).not.toContain('data-testid="dev-shift-draft-extract"');
    expect(htmlDefault).not.toContain('data-testid="dev-shift-draft-extracting"');
    expect(htmlDefault).not.toContain('data-testid="dev-shift-draft-cells-loaded"');
    expect(htmlDefault).not.toContain('data-testid="dev-shift-draft-error"');
  });
});

describe("DevShiftDraftClient — 範囲外 DOM の不在（B1b-2C-8-c-3）", () => {
  it("ShiftImportModal の mount trace がない（8-c-4 に分離）", () => {
    expect(htmlDefault).not.toContain('data-testid="shift-import-modal"');
    expect(htmlDefault).not.toContain('data-testid="shift-review-grid"');
  });

  it("保存導線（「この内容で保存」）が出ない", () => {
    expect(htmlDefault).not.toContain("この内容で保存");
  });

  it("画像本体（data:image / base64 / dataURL）の trace がない", () => {
    expect(htmlDefault).not.toMatch(/data:image|base64|dataurl/i);
  });

  it("static render では blob: URL は本文に出現しない（submit 時にだけ decode するため）", () => {
    expect(htmlDefault).not.toContain("blob:");
  });
});

describe("DevShiftDraftClient — props 受理（B1b-2C-8-c-3）", () => {
  it("saveEnabled 未指定 / false / true(+default month) で idle render が壊れない", () => {
    expect(htmlDefault).toContain('data-testid="dev-shift-draft-idle"');
    expect(htmlSaveOff).toContain('data-testid="dev-shift-draft-idle"');
    expect(htmlSaveOn).toContain('data-testid="dev-shift-draft-idle"');
  });

  it("saveEnabled=true でも保存 CTA / Modal は idle 段階では出ない（Modal mount は 8-c-4）", () => {
    expect(htmlSaveOn).not.toContain("この内容で保存");
    expect(htmlSaveOn).not.toContain('data-testid="shift-import-modal"');
  });
});
