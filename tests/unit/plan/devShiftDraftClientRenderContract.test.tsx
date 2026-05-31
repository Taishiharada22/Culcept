/**
 * SR B1b-2C-8-c-2 — DevShiftDraftClient state machine skeleton render contract
 *
 * 不変条件（static render = idle 状態のみ検証。state 遷移は reducer test 側）:
 *   ① host testid / 警告文 / state attribute が出る
 *   ② 初期 state = idle（data-state="idle"）
 *   ③ idle で file input が DOM に存在し、accept=image/png,image/jpeg
 *   ④ idle で「画像を選ぶ」CTA が出る
 *   ⑤ idle では AssistedRowSelector が mount されない（image_loaded 以降に出る）
 *   ⑥ 範囲外の DOM が出ない:
 *      - ShiftImportModal mount なし（"shift-import-modal" testid 不在）
 *      - extractShiftDraft の trace なし
 *      - data:image / base64 / dataURL の trace なし
 *      - blob: URL は static render では空（mount 時に作る）
 *   ⑦ safe copy（CEO 補正）:
 *      - 「本流」「正式入口」「保存できます」「取り込み完了」を含まない
 *      - error/wrong/failed/誤/失敗/間違 を含まない
 *   ⑧ saveEnabled prop を受け取れる（accept されて render が壊れない）
 *      - 本コミット範囲では UI への visible 反映なし（dormant 維持）
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { DevShiftDraftClient } from "@/app/(culcept)/plan/dev-shift-draft/DevShiftDraftClient";

const htmlDefault = renderToStaticMarkup(<DevShiftDraftClient />);
const htmlSaveOff = renderToStaticMarkup(<DevShiftDraftClient saveEnabled={false} />);
const htmlSaveOn = renderToStaticMarkup(<DevShiftDraftClient saveEnabled />);

describe("DevShiftDraftClient — shell shared invariants（B1b-2C-8-c-2）", () => {
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

describe("DevShiftDraftClient — idle 初期 render（B1b-2C-8-c-2）", () => {
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

  it("idle では AssistedRowSelector / row-select 階層が mount されない", () => {
    // assisted-row-selector の DOM trace（component 内部の testid を含む可能性は将来あり得るが、本 host 直配下では出ない）
    expect(htmlDefault).not.toContain('data-testid="dev-shift-draft-row-select"');
  });

  it("idle では「次の段階」placeholder（row_selected 用）が出ない", () => {
    expect(htmlDefault).not.toContain(
      'data-testid="dev-shift-draft-next-stage-placeholder"'
    );
  });

  it("8-c-3 以降の placeholder（extracting / cells_loaded / error）が idle では出ない", () => {
    expect(htmlDefault).not.toContain(
      'data-testid="dev-shift-draft-extracting-placeholder"'
    );
    expect(htmlDefault).not.toContain(
      'data-testid="dev-shift-draft-cells-loaded-placeholder"'
    );
    expect(htmlDefault).not.toContain(
      'data-testid="dev-shift-draft-error-placeholder"'
    );
  });
});

describe("DevShiftDraftClient — 範囲外 DOM の不在（B1b-2C-8-c-2）", () => {
  it("ShiftImportModal の mount trace がない", () => {
    expect(htmlDefault).not.toContain('data-testid="shift-import-modal"');
    expect(htmlDefault).not.toContain('data-testid="shift-review-grid"');
  });

  it("extractShiftDraft 呼出の trace がない", () => {
    expect(htmlDefault).not.toContain("extractShiftDraft");
  });

  it("画像本体（data:image / base64 / dataURL）の trace がない", () => {
    expect(htmlDefault).not.toMatch(/data:image|base64|dataurl/i);
  });

  it("static render では blob: URL は本文に出現しない（mount 時に作るため）", () => {
    expect(htmlDefault).not.toContain("blob:");
  });
});

describe("DevShiftDraftClient — saveEnabled prop（B1b-2C-8-c-2）", () => {
  it("saveEnabled 未指定 / false / true で render は壊れず、いずれも idle で同形", () => {
    // 本コミット範囲では saveEnabled は UI に visible 反映しない（dormant 維持）。
    // → 3 通りで idle 表示が成立する＝prop が accept されており、UI に副作用がない。
    expect(htmlDefault).toContain('data-testid="dev-shift-draft-idle"');
    expect(htmlSaveOff).toContain('data-testid="dev-shift-draft-idle"');
    expect(htmlSaveOn).toContain('data-testid="dev-shift-draft-idle"');
  });

  it("saveEnabled=true でも「この内容で保存」CTA は idle 段階では出ない（Modal mount は 8-c-4）", () => {
    expect(htmlSaveOn).not.toContain("この内容で保存");
    expect(htmlSaveOn).not.toContain('data-testid="shift-import-modal"');
  });
});
