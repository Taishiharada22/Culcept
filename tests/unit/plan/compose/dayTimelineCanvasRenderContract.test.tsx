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
  it("root が render され、毎正時ラベル（hour-only）を含む", () => {
    const html = render();
    expect(html).toContain('data-testid="compose-timeline"');
    expect(html).toContain('data-testid="compose-hour-6"'); // 6:00 → 6
    expect(html).toContain('data-testid="compose-hour-12"');
    expect(html).toContain('data-testid="compose-hour-24"'); // 24:00 → 24
  });

  it("窓外（早朝 0–5 時）の時刻ラベルは出さない", () => {
    const html = render();
    expect(html).not.toContain('data-testid="compose-hour-0"');
    expect(html).not.toContain('data-testid="compose-hour-5"');
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
    expect(html).toContain('data-testid="compose-hour-6"');
  });
});

describe("ghost（A-3・ドラッグ中プレビュー）", () => {
  it("ghost 指定で点線プレビューを描画", () => {
    const html = renderToStaticMarkup(
      <DayTimelineCanvas blocks={[]} ghost={{ startMin: 900, endMin: 960 }} />,
    );
    expect(html).toContain('data-testid="compose-ghost"');
    expect(html).toContain("15:00–16:00");
    expect(html).toContain('data-invalid="false"');
  });

  it("invalid ghost は data-invalid=true + 日跨ぎ表記", () => {
    const html = renderToStaticMarkup(
      <DayTimelineCanvas
        blocks={[]}
        ghost={{ startMin: 1410, endMin: 1430, invalid: true }}
      />,
    );
    expect(html).toContain('data-invalid="true"');
    expect(html).toContain("日跨ぎ");
  });

  it("ghost 未指定なら描画しない", () => {
    expect(render()).not.toContain('data-testid="compose-ghost"');
  });
});

describe("placed block の削除/戻すボタン（A-3）", () => {
  it("callback 指定時、draft block にのみ削除/戻すボタン", () => {
    const html = renderToStaticMarkup(
      <DayTimelineCanvas
        blocks={BLOCKS}
        onRemoveBlock={() => undefined}
        onUnplaceBlock={() => undefined}
      />,
    );
    expect(html).toContain('data-testid="compose-block-remove-dr-mtg"');
    expect(html).toContain('data-testid="compose-block-unplace-dr-mtg"');
    // existing block には出さない
    expect(html).not.toContain('data-testid="compose-block-remove-ex-lunch"');
    expect(html).not.toContain('data-testid="compose-block-unplace-ex-lunch"');
  });

  it("callback 未指定ならボタンなし（A-2 静的のまま）", () => {
    expect(render()).not.toContain('data-testid="compose-block-remove-dr-mtg"');
  });
});

describe("重なり lane 分割（UI-5）", () => {
  it("重なる2ブロックは data-lanes=2 で描画", () => {
    const html = renderToStaticMarkup(
      <DayTimelineCanvas
        blocks={[
          { id: "x", label: "A", startMin: 540, endMin: 660, tone: "existing" },
          { id: "y", label: "B", startMin: 600, endMin: 720, tone: "existing" },
        ]}
      />,
    );
    expect(html).toContain('data-testid="compose-block-x"');
    expect(html).toContain('data-testid="compose-block-y"');
    expect(html).toContain('data-lanes="2"');
  });

  it("重ならないブロックは data-lanes=1", () => {
    expect(render()).toContain('data-lanes="1"');
  });
});

describe("placed block の移動/伸縮ハンドル（P4-4）", () => {
  it("onBlockReposition 指定時、draft block にのみ resize ハンドル", () => {
    const html = renderToStaticMarkup(
      <DayTimelineCanvas blocks={BLOCKS} onBlockReposition={() => undefined} />,
    );
    expect(html).toContain('data-testid="compose-block-resize-top-dr-mtg"');
    expect(html).toContain('data-testid="compose-block-resize-bottom-dr-mtg"');
    expect(html).not.toContain('data-testid="compose-block-resize-top-ex-lunch"');
  });

  it("未指定ならハンドルなし", () => {
    expect(render()).not.toContain('data-testid="compose-block-resize-top-dr-mtg"');
  });
});

describe("②-1 クリック編集（onBlockSelect / activeBlockId）", () => {
  it("activeBlockId 一致の draft block は data-active ハイライト", () => {
    const html = renderToStaticMarkup(
      <DayTimelineCanvas
        blocks={BLOCKS}
        onBlockSelect={() => undefined}
        activeBlockId="dr-mtg"
      />,
    );
    expect(html).toContain('data-active="true"');
  });

  it("activeBlockId 無しなら data-active は付かない", () => {
    expect(
      renderToStaticMarkup(
        <DayTimelineCanvas blocks={BLOCKS} onBlockSelect={() => undefined} />,
      ),
    ).not.toContain('data-active="true"');
  });

  it("既存(existing)ブロックは active ハイライト対象外", () => {
    const html = renderToStaticMarkup(
      <DayTimelineCanvas
        blocks={BLOCKS}
        onBlockSelect={() => undefined}
        activeBlockId="ex-lunch"
      />,
    );
    expect(html).not.toContain('data-active="true"');
  });
});

describe("②-2 既存予定のクリック編集（onExistingSelect）", () => {
  it("onExistingSelect 指定で既存ブロックが data-clickable に", () => {
    const html = renderToStaticMarkup(
      <DayTimelineCanvas blocks={BLOCKS} onExistingSelect={() => undefined} />,
    );
    // ex-lunch（existing）が clickable
    expect(html).toContain('data-clickable="true"');
  });

  it("onExistingSelect 無しなら data-clickable は付かない", () => {
    expect(render()).not.toContain('data-clickable="true"');
  });

  it("draft block は onExistingSelect の対象外（既存のみ）", () => {
    // draft(dr-mtg) に onExistingSelect は効かない（reposition/select は別経路）
    const html = renderToStaticMarkup(
      <DayTimelineCanvas
        blocks={[{ id: "d1", label: "X", startMin: 900, endMin: 960, tone: "draft" }]}
        onExistingSelect={() => undefined}
      />,
    );
    expect(html).not.toContain('data-clickable="true"');
  });
});

describe("②-3 既存編集中の amber + 脈動", () => {
  it("activeBlockId + activeIsEditing → 脈動リング（compose-block-editing-pulse）", () => {
    const html = renderToStaticMarkup(
      <DayTimelineCanvas
        blocks={BLOCKS}
        onBlockSelect={() => undefined}
        activeBlockId="dr-mtg"
        activeIsEditing
      />,
    );
    expect(html).toContain('data-testid="compose-block-editing-pulse"');
  });

  it("activeIsEditing 無し（新規 active）は脈動なし", () => {
    const html = renderToStaticMarkup(
      <DayTimelineCanvas
        blocks={BLOCKS}
        onBlockSelect={() => undefined}
        activeBlockId="dr-mtg"
      />,
    );
    expect(html).not.toContain('data-testid="compose-block-editing-pulse"');
  });
});

describe("現在時刻ライン（UI-polish・対象日=今日のときのみ）", () => {
  it("nowMin が可視窓内なら現在時刻ラインを描画", () => {
    const html = renderToStaticMarkup(
      <DayTimelineCanvas blocks={BLOCKS} nowMin={840} />,
    );
    expect(html).toContain('data-testid="compose-timeline-now"');
  });

  it("nowMin が窓外（早朝 5:00=300）なら描画しない", () => {
    const html = renderToStaticMarkup(
      <DayTimelineCanvas blocks={BLOCKS} nowMin={300} />,
    );
    expect(html).not.toContain('data-testid="compose-timeline-now"');
  });

  it("nowMin 未指定なら描画しない（後方互換）", () => {
    expect(render()).not.toContain('data-testid="compose-timeline-now"');
  });

  it("nowMin あり → 過去 dim（compose-timeline-past）を描画", () => {
    const html = renderToStaticMarkup(
      <DayTimelineCanvas blocks={BLOCKS} nowMin={840} />,
    );
    expect(html).toContain('data-testid="compose-timeline-past"');
  });

  it("nowMin なし → 過去 dim なし（今日以外は dim しない）", () => {
    expect(render()).not.toContain('data-testid="compose-timeline-past"');
  });
});

describe("空状態ヒント（UI-polish・ドラッグ先を明示）", () => {
  it("blocks 空 + ghost なし → ヒントを描画", () => {
    expect(render([])).toContain('data-testid="compose-timeline-empty"');
  });

  it("blocks ありなら空状態ヒントは出さない", () => {
    expect(render()).not.toContain('data-testid="compose-timeline-empty"');
  });

  it("blocks 空でも ghost 中はヒントを出さない（ghost 優先）", () => {
    const html = renderToStaticMarkup(
      <DayTimelineCanvas blocks={[]} ghost={{ startMin: 900, endMin: 960 }} />,
    );
    expect(html).not.toContain('data-testid="compose-timeline-empty"');
    expect(html).toContain('data-testid="compose-ghost"');
  });
});

describe("③ containment band（context parent のみ background・GPT 補正）", () => {
  const b = (
    id: string,
    label: string,
    startMin: number,
    endMin: number,
    tone: "existing" | "draft" = "existing",
  ): TimelineBlock => ({ id, label, startMin, endMin, tone });
  const r = (blocks: TimelineBlock[]) =>
    renderToStaticMarkup(<DayTimelineCanvas blocks={blocks} />);

  it("context parent + 完全内包 child → parent=container band / child=contained 前景", () => {
    const html = r([b("w", "仕事", 540, 1080), b("m", "会議", 780, 840)]);
    expect(html).toContain('data-testid="compose-block-w"');
    expect(html).toContain('data-role="container"');
    expect(html).toContain('data-role="contained"');
  });

  it("exclusive parent（映画）+ child → band にならず従来表示（lane）", () => {
    const html = r([b("mv", "映画", 540, 1080), b("x", "メモ", 780, 840)]);
    expect(html).not.toContain('data-role="container"');
    expect(html).toContain('data-lanes="2"'); // 映画⊇メモ も従来 lane 分割
  });

  it("parent なしの partial overlap → 従来 lane（band 化しない）", () => {
    const html = r([b("a", "打合せ", 540, 720), b("c", "打合せ", 660, 840)]);
    expect(html).not.toContain('data-role="container"');
    expect(html).toContain('data-lanes="2"');
  });

  it("context parent + child があっても、別の partial overlap block は壊れない", () => {
    const html = r([
      b("w", "仕事", 540, 1080), // container
      b("m", "会議", 780, 840), // contained
      b("p", "懇親", 1140, 1260), // 19–21（work 外）
      b("q", "電話", 1200, 1320), // 20–22（懇親と partial overlap）
    ]);
    expect(html).toContain('data-role="container"'); // 仕事
    expect(html).toContain('data-role="contained"'); // 会議
    expect(html).toContain('data-lanes="2"'); // 懇親/電話 は従来 lane 維持
  });

  it("child 同士が重なる → 前景側で lane 分割（data-lanes=2）", () => {
    const html = r([
      b("w", "仕事", 540, 1080), // container
      b("ma", "会議A", 780, 900), // 13–15 contained
      b("mb", "会議B", 840, 960), // 14–16 contained（A と重なる）
    ]);
    expect(html).toContain('data-role="container"');
    expect(html).toContain('data-lanes="2"'); // child 同士 lane
  });

  it("draft の context parent も band 化（案B）＋ ↩✕ タップ操作維持", () => {
    const html = renderToStaticMarkup(
      <DayTimelineCanvas
        blocks={[b("w", "仕事", 540, 1080, "draft"), b("m", "会議", 780, 840)]}
        onBlockSelect={() => undefined}
        onRemoveBlock={() => undefined}
        onUnplaceBlock={() => undefined}
      />,
    );
    expect(html).toContain('data-role="container"'); // draft でも文脈予定なら band（横並びにしない）
    expect(html).toContain('data-role="contained"'); // 会議 は前景
    // 退行防止: draft バンドは ↩戻す / ✕削除 を維持（drag/resize は #8）
    expect(html).toContain('data-testid="compose-block-remove-w"');
    expect(html).toContain('data-testid="compose-block-unplace-w"');
  });

  it("draft container の child は前景で lane（draft 同士の重なりも分割）", () => {
    const html = r([
      b("w", "仕事", 540, 1080, "draft"),
      b("ma", "会議A", 780, 900, "draft"),
      b("mb", "会議B", 840, 960, "draft"),
    ]);
    expect(html).toContain('data-role="container"');
    expect(html).toContain('data-lanes="2"');
  });
});
