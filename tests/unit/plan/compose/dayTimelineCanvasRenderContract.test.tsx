/**
 * DayTimelineCanvas render contract（A-2・静的描画）
 *
 * 不変原則（既存 render contract 規約）:
 *   - @testing-library 不使用（renderToStaticMarkup のみ）
 *   - LLM / API / DB / network 不使用
 *   - interaction（drag / snap）は SSR で取れないため A-3 / smoke に回す
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import {
  DayTimelineCanvas,
  type TimelineBlock,
} from "@/app/(culcept)/plan/components/compose/DayTimelineCanvas";

const BLOCKS: TimelineBlock[] = [
  { id: "ex-lunch", label: "ランチ", startMin: 750, endMin: 810, tone: "existing" },
  { id: "dr-mtg", label: "MTG", startMin: 900, endMin: 1020, tone: "draft" },
];

function render(blocks: TimelineBlock[] = BLOCKS): string {
  return renderToStaticMarkup(<DayTimelineCanvas blocks={blocks} />);
}

describe("俯瞰ルーラー（既定 6:00–24:00）", () => {
  it("root が render され、毎正時ラベルを含む", () => {
    const html = render();
    expect(html).toContain('data-testid="compose-timeline"');
    expect(html).toContain("06:00");
    expect(html).toContain("12:00");
    expect(html).toContain("24:00");
  });

  it("窓外（早朝）の時刻ラベルは出さない", () => {
    expect(render()).not.toContain("00:00");
  });
});

describe("ブロック静的描画", () => {
  it("各 block が testid + tone + ラベル + 時刻範囲で描画される", () => {
    const html = render();
    expect(html).toContain('data-testid="compose-block-ex-lunch"');
    expect(html).toContain('data-testid="compose-block-dr-mtg"');
    expect(html).toContain("ランチ");
    expect(html).toContain("MTG");
    expect(html).toContain("15:00–17:00"); // draft MTG 900–1020
  });

  it("tone（existing / draft）を data 属性で区別", () => {
    const html = render();
    expect(html).toContain('data-tone="existing"');
    expect(html).toContain('data-tone="draft"');
  });

  it("blocks 空でもルーラーは描画される", () => {
    const html = render([]);
    expect(html).toContain('data-testid="compose-timeline"');
    expect(html).toContain("06:00");
  });
});
