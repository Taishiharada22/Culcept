/**
 * ComposeTimeField render contract（P4・開始 / 終了 / 間隔 3列・理想画像）
 *
 * 旧「未定 / 開始だけ / 終了だけ / 開始と終了」モード選択は撤去済み。
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { ComposeTimeField } from "@/app/(culcept)/plan/components/compose/ComposeTimeField";
import type { ComposeTimeConstraint } from "@/lib/plan/compose/composeTimeResolver";

function render(time: ComposeTimeConstraint): string {
  return renderToStaticMarkup(<ComposeTimeField time={time} />);
}

describe("開始 / 終了 / 間隔 の3列", () => {
  it("3列が出る（モード選択は無い）", () => {
    const html = render({ mode: "none" });
    expect(html).toContain('data-testid="compose-time-field"');
    expect(html).toContain('data-testid="compose-time-start"');
    expect(html).toContain('data-testid="compose-time-end"');
    expect(html).toContain('data-testid="compose-time-interval"');
    expect(html).toContain("開始");
    expect(html).toContain("終了");
    expect(html).toContain("間隔");
    expect(html).not.toContain('data-testid="compose-field-time-mode"');
  });

  it("間隔のクイック選択肢（30/60/120）", () => {
    const html = render({ mode: "none" });
    expect(html).toContain('data-testid="compose-interval-30"');
    expect(html).toContain('data-testid="compose-interval-60"');
    expect(html).toContain('data-testid="compose-interval-120"');
  });
});

describe("値・所要表示", () => {
  it("開始＋終了で時刻値と所要を表示", () => {
    const html = render({ mode: "both", startMin: 900, endMin: 1020 });
    expect(html).toContain('value="15:00"');
    expect(html).toContain('value="17:00"');
    expect(html).toContain('data-testid="compose-time-duration"');
    expect(html).toContain("所要 2時間");
  });

  it("空なら所要は出さない", () => {
    expect(render({ mode: "none" })).not.toContain(
      'data-testid="compose-time-duration"',
    );
  });
});
