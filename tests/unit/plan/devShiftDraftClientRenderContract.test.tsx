/**
 * SR B1b-2C-8-b — DevShiftDraftClient shell render contract
 *
 * 不変条件（shell 範囲のみ）:
 *   - host testid / 警告文 / placeholder が出る
 *   - safe copy（「本流」「正式入口」「保存できます」「取り込み完了」「error/wrong/failed/誤/失敗/間違」不使用）
 *   - 「検証 host」「製品の取り込み入口ではありません」で統一
 *   - file input / Blob / ObjectURL / FormData / ShiftImportModal / extractShiftDraftAction
 *     関連の DOM / attribute は出ない（2C-8-c で接続）
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { DevShiftDraftClient } from "@/app/(culcept)/plan/dev-shift-draft/DevShiftDraftClient";

const html = renderToStaticMarkup(<DevShiftDraftClient />);

describe("DevShiftDraftClient shell（B1b-2C-8-b）", () => {
  it("host testid + 警告 + placeholder を含む", () => {
    expect(html).toContain('data-testid="dev-shift-draft-host"');
    expect(html).toContain('data-testid="dev-shift-draft-warning"');
    expect(html).toContain('data-testid="dev-shift-draft-shell-placeholder"');
  });

  it("「検証 host」「製品の取り込み入口ではありません」を含む（CEO 補正のコピー統一）", () => {
    expect(html).toContain("検証 host");
    expect(html).toContain("製品の取り込み入口ではありません");
  });

  it("次段への placeholder 文言を含む（画像選択・行指定・下書き抽出を接続）", () => {
    expect(html).toContain("次の段階");
    expect(html).toContain("画像選択");
    expect(html).toContain("行指定");
    expect(html).toContain("下書き抽出");
  });

  it("safe copy（避ける表現を含まない）", () => {
    // CEO 補正: shell 段階で誤解を招く表現を回避
    expect(html).not.toContain("本流");
    expect(html).not.toContain("正式入口");
    expect(html).not.toContain("保存できます");
    expect(html).not.toContain("取り込み完了");
    // 既存規約: error/wrong/failed/誤/失敗/間違 を user-facing copy で使わない
    expect(html).not.toMatch(/error|wrong|failed|誤|失敗|間違/i);
  });

  it("shell 範囲外の DOM を含まない（file input / Modal / extraction 関連なし）", () => {
    expect(html).not.toMatch(/<input[^>]*type="file"/i);
    expect(html).not.toMatch(/<form/i);
    expect(html).not.toContain("shift-import-modal");
    expect(html).not.toContain("assisted-row-selector");
    expect(html).not.toContain("extractShiftDraft");
    expect(html).not.toContain("ObjectURL");
    expect(html).not.toMatch(/blob:|data:image|base64/i);
  });
});
