/**
 * DateChangeConfirmDialog render contract（A-3・骨格）
 *
 * 不変原則: renderToStaticMarkup のみ。interaction（押下挙動）は smoke。
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { DateChangeConfirmDialog } from "@/app/(culcept)/plan/components/compose/DateChangeConfirmDialog";

describe("DateChangeConfirmDialog", () => {
  it("isOpen=false は何も描画しない", () => {
    expect(
      renderToStaticMarkup(<DateChangeConfirmDialog isOpen={false} />),
    ).toBe("");
  });

  it("isOpen=true で 3 択 + メッセージを描画", () => {
    const html = renderToStaticMarkup(
      <DateChangeConfirmDialog
        isOpen
        onDiscard={() => undefined}
        onCancel={() => undefined}
      />,
    );
    expect(html).toContain('data-testid="compose-datechange-confirm"');
    expect(html).toContain('data-testid="compose-datechange-save"');
    expect(html).toContain('data-testid="compose-datechange-discard"');
    expect(html).toContain('data-testid="compose-datechange-cancel"');
    expect(html).toContain("未保存の予定があります");
  });

  it("onSave 未指定なら『保存する』は disabled（A-4 未接続の正直表示）", () => {
    const html = renderToStaticMarkup(
      <DateChangeConfirmDialog
        isOpen
        onDiscard={() => undefined}
        onCancel={() => undefined}
      />,
    );
    expect(html).toMatch(/data-testid="compose-datechange-save"[^>]*disabled/);
  });
});
