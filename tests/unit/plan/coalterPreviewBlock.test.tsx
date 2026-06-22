/**
 * C5-E: CoAlterPreviewBlock render test（SSR static markup・#3 UI 表示の機械確認）
 *
 * 検証: flag OFF→非描画 / flag ON→block+生成ボタン / ready→preview text / 中立状態テキスト。
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

import { CoAlterPreviewBlock } from "@/app/(culcept)/plan/tabs/coalter/CoAlterPreviewBlock";
import type { CoAlterBrainPreview } from "@/lib/coalter/preview/brainPreviewCore";

const noop = () => {};
const PREVIEW: CoAlterBrainPreview = {
  kind: "brain_preview",
  theme: "travel",
  hasStalemate: false,
  constraintReadiness: "low",
  turnsAnalyzed: 2,
  previewText: "この会話は「旅行」についてのようです。条件はまだ揃っていません。",
};
const render = (p: Parameters<typeof CoAlterPreviewBlock>[0]) =>
  renderToStaticMarkup(createElement(CoAlterPreviewBlock, p));

describe("CoAlterPreviewBlock（C5-E UI render）", () => {
  it("flag OFF（enabled=false）→ 何も描画しない（既存 UI 不変）", () => {
    expect(render({ enabled: false, state: "off", preview: null, onGenerate: noop })).toBe("");
  });

  it("flag ON + ready → preview block + 生成ボタン + preview text（旅行）を描画", () => {
    const html = render({ enabled: true, state: "ready", preview: PREVIEW, onGenerate: noop });
    expect(html).toContain("coalter-brain-preview-block");
    expect(html).toContain("coalter-preview-generate");
    expect(html).toContain("CoAlter プレビュー生成");
    expect(html).toContain("coalter-preview-text");
    expect(html).toContain("旅行");
    expect(html).toContain("CoAlter:");
  });

  it("flag ON + off（未生成）→ block は出るが preview text は無い", () => {
    const html = render({ enabled: true, state: "off", preview: null, onGenerate: noop });
    expect(html).toContain("coalter-brain-preview-block");
    expect(html).not.toContain("coalter-preview-text");
  });

  it("flag ON + insufficient / unavailable → 中立テキスト（preview text 無し）", () => {
    const ins = render({ enabled: true, state: "insufficient", preview: null, onGenerate: noop });
    expect(ins).toContain("会話がまだ足りません");
    expect(ins).not.toContain("coalter-preview-text");
    const un = render({ enabled: true, state: "unavailable", preview: null, onGenerate: noop });
    expect(un).toContain("取得できません");
  });

  it("ready でも preview=null なら preview text を描画しない（fail-safe）", () => {
    const html = render({ enabled: true, state: "ready", preview: null, onGenerate: noop });
    expect(html).toContain("coalter-brain-preview-block");
    expect(html).not.toContain("coalter-preview-text");
  });
});
