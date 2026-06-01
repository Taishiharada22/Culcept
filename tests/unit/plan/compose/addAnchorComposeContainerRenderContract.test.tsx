/**
 * AddAnchorComposeContainer render contract（A-3・初期描画契約）
 *
 * 検証範囲（SSR で取れるもの）:
 *   - seeded state から sheet / placed block / 既存 block / 未配置ドラッグカードを描画
 *   - 初期は ghost / 日付切替確認ダイアログを出さない
 *   - 日付ヘッダ + 完了ボタンが出る
 *
 * 不変原則: renderToStaticMarkup のみ。実ドラッグ / drop / snap / 確認押下は A-5 smoke。
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { AddAnchorComposeContainer } from "@/app/(culcept)/plan/components/compose/AddAnchorComposeContainer";
import type { TimelineBlock } from "@/app/(culcept)/plan/components/compose/DayTimelineCanvas";
import type { ComposeState } from "@/lib/plan/compose/composeDraft";

const EXISTING: TimelineBlock[] = [
  { id: "ex-lunch", label: "ランチ", startMin: 750, endMin: 810, tone: "existing" },
];

const INITIAL: ComposeState = {
  drafts: [
    {
      id: "d-mtg",
      core: { title: "MTG", locationText: "渋谷", rigidity: "hard" },
      time: { mode: "both", startMin: 900, endMin: 1020 },
      placement: {
        status: "placed",
        startMin: 900,
        endMin: 1020,
        crossesMidnight: false,
        edgeClamped: false,
      },
    },
    {
      id: "d-active",
      core: { title: "企画書", locationText: "カフェ", rigidity: "soft" },
      time: { mode: "start", startMin: 600 },
      placement: { status: "unplaced" },
    },
  ],
};

const noop = (): void => undefined;

function render(): string {
  return renderToStaticMarkup(
    <AddAnchorComposeContainer
      isOpen
      onClose={noop}
      dateLabel="6/1(月)"
      existingBlocks={EXISTING}
      initialState={INITIAL}
      initialActiveId="d-active"
      initialNextId={2}
    />,
  );
}

describe("初期描画", () => {
  it("sheet / placed block / 既存 block を描画", () => {
    const html = render();
    expect(html).toContain('data-testid="compose-sheet"');
    expect(html).toContain('data-testid="compose-block-d-mtg"'); // placed draft
    expect(html).toContain('data-testid="compose-block-ex-lunch"'); // existing
    expect(html).toContain("MTG");
  });

  it("未配置 placeable draft をドラッグ可能カードで描画", () => {
    const html = render();
    expect(html).toContain('data-testid="compose-card-draggable"');
    expect(html).toContain('data-testid="compose-card"');
    expect(html).toContain('data-testid="compose-unplaced-list"');
    expect(html).toContain("企画書");
  });

  it("初期は ghost / 確認ダイアログを出さない", () => {
    const html = render();
    expect(html).not.toContain('data-testid="compose-ghost"');
    expect(html).not.toContain('data-testid="compose-datechange-confirm"');
  });

  it("日付ヘッダ（前後）と完了ボタンを描画", () => {
    const html = render();
    expect(html).toContain('data-testid="compose-date-prev"');
    expect(html).toContain('data-testid="compose-date-next"');
    expect(html).toContain('data-testid="compose-complete-btn"');
    expect(html).toContain("6/1(月)");
  });
});
