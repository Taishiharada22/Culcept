/**
 * ComposeTimeField render contract（P4-3・開始/終了/間隔 スクロールホイール）
 *
 * 旧「未定/開始だけ/…」モードと input[type=time] は撤去。枠内スクロール（ComposeWheel）。
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { ComposeTimeField } from "@/app/(culcept)/plan/components/compose/ComposeTimeField";
import type { ComposeTimeConstraint } from "@/lib/plan/compose/composeTimeResolver";

function render(time: ComposeTimeConstraint): string {
  return renderToStaticMarkup(<ComposeTimeField time={time} />);
}

describe("スクロールホイール構成（時+分 ×開始/終了、間隔）", () => {
  it("5つのホイールと 3列ラベルが出る", () => {
    const html = render({ mode: "both", startMin: 900, endMin: 1020 });
    expect(html).toContain('data-testid="compose-time-field"');
    expect(html).toContain('data-testid="compose-time-start-hour"');
    expect(html).toContain('data-testid="compose-time-start-min"');
    expect(html).toContain('data-testid="compose-time-end-hour"');
    expect(html).toContain('data-testid="compose-time-end-min"');
    expect(html).toContain('data-testid="compose-time-interval-wheel"');
    expect(html).toContain("開始");
    expect(html).toContain("終了");
    expect(html).toContain("間隔");
  });

  it("旧モード選択・ネイティブ time input は無い", () => {
    const html = render({ mode: "both", startMin: 900, endMin: 1020 });
    expect(html).not.toContain('data-testid="compose-field-time-mode"');
    expect(html).not.toContain('type="time"');
  });

  it("各ホイールに選択値の option が描画される（15:00–17:00）", () => {
    const html = render({ mode: "both", startMin: 900, endMin: 1020 });
    expect(html).toContain('data-testid="compose-time-start-hour-opt-15"');
    expect(html).toContain('data-testid="compose-time-end-hour-opt-17"');
    expect(html).toContain('data-testid="compose-time-interval-wheel-opt-120"');
  });
});

describe("間隔: 30分以降10分刻み＋実値（長押し前）", () => {
  it("34分（開始40分でない端数）は実値が選択肢に挿入される", () => {
    const html = render({ mode: "both", startMin: 540, endMin: 574 }); // 34分
    expect(html).toContain('data-testid="compose-time-interval-wheel-opt-30"');
    expect(html).toContain('data-testid="compose-time-interval-wheel-opt-40"');
    expect(html).toContain('data-testid="compose-time-interval-wheel-opt-34"');
  });

  it("間隔セルは長押し用に data-fine=false 初期", () => {
    const html = render({ mode: "both", startMin: 900, endMin: 1020 });
    expect(html).toContain('data-testid="compose-time-interval"');
    expect(html).toContain('data-fine="false"');
  });
});

describe("空白(—)からスタート（CEO）", () => {
  it("間隔の先頭に空白(—)がある（30 の上）", () => {
    const html = render({ mode: "both", startMin: 900, endMin: 1020 });
    expect(html).toContain('data-testid="compose-time-interval-wheel-opt-null"');
  });

  it("未設定(none)は各ホイールが空白(—)を持つ", () => {
    const html = render({ mode: "none" });
    expect(html).toContain('data-testid="compose-time-start-hour-opt-null"');
    expect(html).toContain('data-testid="compose-time-interval-wheel-opt-null"');
    expect(html).toContain("—");
  });
});
