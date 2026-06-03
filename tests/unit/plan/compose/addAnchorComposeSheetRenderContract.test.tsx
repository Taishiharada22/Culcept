/**
 * AddAnchorComposeSheet render contract（A-2・2カラム骨格）
 *
 * 検証範囲:
 *   §1 isOpen=false → compose-sheet 無し（modal 非表示）
 *   §2 isOpen=true → 日付ヘッダ + 左タイムライン + 右パネル + 完了
 *   §3 配置済み draft が左タイムラインに block 描画
 *   §4 既存予定が read-only block で残る
 *   §5 配置可能な作成中 draft が ComposeCard で preview される
 *
 * 不変原則: renderToStaticMarkup のみ。LLM / API / DB / network / 候補検索 不使用。
 * interaction（drag / 完了押下 / 日付切替の本格挙動）は A-3 / smoke。
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { AddAnchorComposeSheet } from "@/app/(culcept)/plan/components/compose/AddAnchorComposeSheet";
import type { TimelineBlock } from "@/app/(culcept)/plan/components/compose/DayTimelineCanvas";
import type { ComposeDraftState } from "@/lib/plan/compose/composeDraft";

const EXISTING: TimelineBlock[] = [
  { id: "ex-lunch", label: "ランチ", startMin: 750, endMin: 810, tone: "existing" },
];

const PLACED: ComposeDraftState = {
  id: "d-mtg",
  core: { title: "クライアントMTG", locationText: "渋谷オフィス", rigidity: "hard" },
  time: { mode: "both", startMin: 900, endMin: 1020 },
  placement: {
    status: "placed",
    startMin: 900,
    endMin: 1020,
    crossesMidnight: false,
    edgeClamped: false,
  },
};

const ACTIVE_PLACEABLE: ComposeDraftState = {
  id: "d-active",
  core: { title: "企画書", locationText: "カフェ", rigidity: "soft" },
  time: { mode: "start", startMin: 600 },
  placement: { status: "unplaced" },
};

const ACTIVE_EMPTY: ComposeDraftState = {
  id: "d-empty",
  core: { title: "", locationText: "", rigidity: "" },
  time: { mode: "none" },
  placement: { status: "unplaced" },
};

const ACTIVE_TITLE_ONLY: ComposeDraftState = {
  id: "d-title",
  core: { title: "企画書", locationText: "", rigidity: "" },
  time: { mode: "none" },
  placement: { status: "unplaced" },
};

const noop = (): void => undefined;

function render(opts: {
  isOpen: boolean;
  drafts?: ComposeDraftState[];
  active?: ComposeDraftState;
}): string {
  return renderToStaticMarkup(
    <AddAnchorComposeSheet
      isOpen={opts.isOpen}
      onClose={noop}
      dateLabel="6/1(月)"
      existingBlocks={EXISTING}
      drafts={opts.drafts ?? [PLACED, opts.active ?? ACTIVE_PLACEABLE]}
      activeDraft={opts.active ?? ACTIVE_PLACEABLE}
    />,
  );
}

describe("§1 isOpen=false", () => {
  it("compose-sheet を render しない", () => {
    expect(render({ isOpen: false })).not.toContain('data-testid="compose-sheet"');
  });
});

describe("§2 isOpen=true — 2カラム骨格", () => {
  it("sheet / 日付ヘッダ / 前後矢印 / タイムライン / フォーム / 完了 が揃う", () => {
    const html = render({ isOpen: true });
    expect(html).toContain('data-testid="compose-sheet"');
    expect(html).toContain('data-testid="compose-date-header"');
    expect(html).toContain('data-testid="compose-date-prev"');
    expect(html).toContain('data-testid="compose-date-next"');
    expect(html).toContain('data-testid="compose-timeline-col"');
    expect(html).toContain('data-testid="compose-timeline"');
    expect(html).toContain('data-testid="compose-form-col"');
    expect(html).toContain('data-testid="compose-form-panel"');
    expect(html).toContain('data-testid="compose-complete-btn"');
    expect(html).toContain("6/1(月)");
    expect(html).toContain("完了");
  });
});

describe("§3 配置済み draft → タイムライン block", () => {
  it("placed draft が compose-block として draft tone で描画", () => {
    const html = render({ isOpen: true });
    expect(html).toContain('data-testid="compose-block-d-mtg"');
    expect(html).toContain("クライアントMTG");
  });
});

describe("§4 既存予定 read-only block", () => {
  it("既存予定が existing tone で残る", () => {
    const html = render({ isOpen: true });
    expect(html).toContain('data-testid="compose-block-ex-lunch"');
    expect(html).toContain('data-tone="existing"');
  });
});

describe("§5 作成中 draft の card preview", () => {
  it("配置可能（title + 場所あり）なら ComposeCard を preview", () => {
    const html = render({ isOpen: true, active: ACTIVE_PLACEABLE });
    expect(html).toContain('data-testid="compose-active-preview"');
    expect(html).toContain('data-testid="compose-card"');
    expect(html).toContain("企画書");
  });

  it("title だけでも live preview が出る（配置はまだ不可・ヒント表示）", () => {
    const html = render({
      isOpen: true,
      drafts: [ACTIVE_TITLE_ONLY],
      active: ACTIVE_TITLE_ONLY,
    });
    expect(html).toContain('data-testid="compose-active-preview"');
    expect(html).toContain('data-testid="compose-card"');
    expect(html).toContain("「どこで？」も入れると配置できます");
  });

  it("title も空なら card / preview を出さない", () => {
    const html = render({
      isOpen: true,
      drafts: [ACTIVE_EMPTY],
      active: ACTIVE_EMPTY,
    });
    expect(html).not.toContain('data-testid="compose-card"');
    expect(html).not.toContain('data-testid="compose-active-preview"');
  });
});

describe("§6 ②-1 placed draft の再編集", () => {
  it("active が placed draft → 編集バー + 新しい予定ボタン、ドラッグカードは出さない", () => {
    const html = render({ isOpen: true, drafts: [PLACED], active: PLACED });
    expect(html).toContain('data-testid="compose-editing-bar"');
    expect(html).toContain("クライアントMTG");
    expect(html).toContain("を編集中");
    expect(html).toContain('data-testid="compose-new-draft"');
    // 既に配置済みなので「ドラッグして配置」カードは出さない
    expect(html).not.toContain('data-testid="compose-active-preview"');
  });

  it("activeBlockId 指定で左ブロックが data-active ハイライト", () => {
    const html = renderToStaticMarkup(
      <AddAnchorComposeSheet
        isOpen
        onClose={noop}
        dateLabel="6/1(月)"
        existingBlocks={EXISTING}
        drafts={[PLACED]}
        activeDraft={PLACED}
        activeBlockId="d-mtg"
      />,
    );
    expect(html).toContain('data-active="true"');
  });
});

describe("§7 ②-3 既存予定のインライン編集", () => {
  const EDITING: ComposeDraftState = {
    id: "edit-ex-lunch",
    core: { title: "ランチ会", locationText: "渋谷", rigidity: "hard" },
    time: { mode: "both", startMin: 750, endMin: 810 },
    placement: {
      status: "placed",
      startMin: 750,
      endMin: 810,
      crossesMidnight: false,
      edgeClamped: false,
    },
    editingAnchorId: "ex-lunch",
  };
  const renderEditing = () =>
    renderToStaticMarkup(
      <AddAnchorComposeSheet
        isOpen
        onClose={noop}
        dateLabel="6/1(月)"
        existingBlocks={EXISTING}
        drafts={[EDITING]}
        activeDraft={EDITING}
        editingAnchorIds={["ex-lunch"]}
        onCancelEdit={noop}
      />,
    );

  it("既存編集中 → amber バー(existing) + 完了 + キャンセル、＋新しい予定は出さない", () => {
    const html = renderEditing();
    expect(html).toContain('data-testid="compose-editing-bar"');
    expect(html).toContain('data-mode="existing"');
    expect(html).toContain("既存の予定");
    expect(html).toContain('data-testid="compose-complete-edit"'); // 完了（編集保存）
    expect(html).toContain('data-testid="compose-cancel-edit"');
    expect(html).not.toContain('data-testid="compose-new-draft"');
  });

  it("編集中の既存ブロックは隠す（編集 draft と二重表示しない）", () => {
    const html = renderEditing();
    // ex-lunch（既存）は editingAnchorIds に含まれ非表示
    expect(html).not.toContain('data-testid="compose-block-ex-lunch"');
    // 代わりに編集 draft ブロックが出る
    expect(html).toContain('data-testid="compose-block-edit-ex-lunch"');
  });
});
