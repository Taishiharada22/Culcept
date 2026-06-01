/**
 * ComposeFormPanel render contract（A-2・質問形式 UI / controlled）
 *
 * 不変原則: renderToStaticMarkup のみ。LLM / API / DB / network 不使用。
 * A-0 補正の固定: 場所候補は「枠」のみ（PlaceCandidatesPanel 本格接続は A-3 以降）。
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { ComposeFormPanel } from "@/app/(culcept)/plan/components/compose/ComposeFormPanel";
import type { ComposeDraftCore } from "@/lib/plan/compose/composeDraft";
import type { ComposeTimeConstraint } from "@/lib/plan/compose/composeTimeResolver";

const CORE: ComposeDraftCore = {
  title: "企画書",
  locationText: "カフェ",
  rigidity: "soft",
};

function render(time: ComposeTimeConstraint, core: ComposeDraftCore = CORE): string {
  return renderToStaticMarkup(<ComposeFormPanel core={core} time={time} />);
}

describe("質問形式フィールド", () => {
  it("title / location / time-mode / rigidity が render される", () => {
    const html = render({ mode: "none" });
    expect(html).toContain('data-testid="compose-form-panel"');
    expect(html).toContain('data-testid="compose-field-title"');
    expect(html).toContain('data-testid="compose-field-location"');
    expect(html).toContain('data-testid="compose-field-time-mode"');
    expect(html).toContain('data-testid="compose-field-rigidity"');
    expect(html).toContain("なにをする？");
    expect(html).toContain("どこで？");
  });

  it("controlled な入力値が反映される", () => {
    const html = render({ mode: "none" });
    expect(html).toContain('value="企画書"');
    expect(html).toContain('value="カフェ"');
  });

  it("rigidity 2 択（hard/soft）が描画され、active が aria-pressed", () => {
    const html = render({ mode: "none" });
    expect(html).toContain('data-testid="compose-rigidity-hard"');
    expect(html).toContain('data-testid="compose-rigidity-soft"');
    expect(html).toContain("動かせない");
    expect(html).toContain("動かせる");
  });
});

describe("A-0 補正: 場所候補は枠のみ（本格接続なし）", () => {
  it("候補表示領域の枠が存在する", () => {
    const html = render({ mode: "none" });
    expect(html).toContain('data-testid="compose-location-candidates-placeholder"');
    expect(html).toContain("場所の候補はここに表示されます");
  });
});

describe("時間モード別の最小入力", () => {
  it("未定（none）は開始・終了の入力欄を出さない", () => {
    const html = render({ mode: "none" });
    expect(html).not.toContain('data-testid="compose-field-start"');
    expect(html).not.toContain('data-testid="compose-field-end"');
  });

  it("開始だけ（start）は開始のみ", () => {
    const html = render({ mode: "start", startMin: 600 });
    expect(html).toContain('data-testid="compose-field-start"');
    expect(html).not.toContain('data-testid="compose-field-end"');
    expect(html).toContain('value="10:00"'); // 600 分
  });

  it("終了だけ（end）は終了のみ", () => {
    const html = render({ mode: "end", endMin: 1020 });
    expect(html).not.toContain('data-testid="compose-field-start"');
    expect(html).toContain('data-testid="compose-field-end"');
    expect(html).toContain('value="17:00"'); // 1020 分
  });

  it("開始と終了（both）は両方", () => {
    const html = render({ mode: "both", startMin: 900, endMin: 1020 });
    expect(html).toContain('data-testid="compose-field-start"');
    expect(html).toContain('data-testid="compose-field-end"');
    expect(html).toContain('value="15:00"');
    expect(html).toContain('value="17:00"');
  });
});
