/**
 * P-D Reality Pipeline Preview Client（route 非依存 render test）。
 *   fixture envelope で render → summary 表示・raw/PII/title/location/seedRef なし・apply button なし・full ChangeSet payload なし。
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import fs from "node:fs";
import path from "node:path";
import { RealityPipelinePreviewClient, type RealityPipelinePreviewMeta } from "@/app/(culcept)/plan/dev-reality-pipeline/RealityPipelinePreviewClient";
import type { RealityPipelineEnvelope } from "@/lib/plan/reality/orchestration/reality-pipeline";

const FORBIDDEN = /seed_?ref|utterance|personality|怠惰|だらしな|@[a-z]|\b\d{10,}\b/i;
const meta: RealityPipelinePreviewMeta = { hardConstraintsCount: 5, availableWindowsCount: 6, usableContextsCount: 1, memoryItemCount: 5 };

function env(over: Partial<RealityPipelineEnvelope> = {}): RealityPipelineEnvelope {
  return {
    date: "2026-06-20",
    worldReadiness: "ready",
    recommended: { tier: "protect", activeMinutes: 120, restMinutes: 180, strain: "low" },
    reasoning: { fits: { time: "good", energy: "ok", weather: "caution", mobility: "ok" }, confidence: "tentative", readiness: "ready_to_show" },
    surfacedTrigger: { kind: "preflight", headline: "そろそろ次の予定の準備を始められます" },
    silencedTriggerCount: 1,
    permission: { verdict: "allowed", risk: "low", reason: "権限の範囲内です" },
    changeSetDraft: { id: "draft:emptyday:2026-06-20:protect", opCount: 6 },
    stopReasons: [],
    ...over,
  };
}

describe("P-D render — summary 表示", () => {
  it("envelope 要約を表示（readiness/recommended/confidence/trigger/permission/opCount/redaction）", () => {
    const html = renderToStaticMarkup(<RealityPipelinePreviewClient envelope={env()} meta={meta} />);
    expect(html).toContain("ready");
    expect(html).toContain("protect");
    expect(html).toContain("tentative"); // confidence
    expect(html).toContain("preflight"); // trigger
    expect(html).toContain("allowed"); // permission
    expect(html).toContain("6 操作候補"); // ChangeSet summary（opCount のみ）
    expect(html).toContain("usableContexts 1"); // memory influence
    expect(html).toContain("clean"); // redaction status
  });
  it("insufficient（recommended null + stopReasons）も render できる", () => {
    const html = renderToStaticMarkup(<RealityPipelinePreviewClient envelope={env({ recommended: null, reasoning: null, worldReadiness: "insufficient", changeSetDraft: null, stopReasons: ["組める空き時間が見当たりません"] })} />);
    expect(html).toContain("組めない");
    expect(html).toContain("組める空き時間が見当たりません");
  });
});

describe("P-D safety — raw/PII/apply button なし", () => {
  it("FORBIDDEN（raw/seedRef/personality）が render に出ない", () => {
    expect(renderToStaticMarkup(<RealityPipelinePreviewClient envelope={env()} meta={meta} />)).not.toMatch(FORBIDDEN);
  });
  it("ChangeSet draft の **id（full payload）を render しない**（opCount のみ）", () => {
    const html = renderToStaticMarkup(<RealityPipelinePreviewClient envelope={env()} meta={meta} />);
    expect(html).not.toContain("draft:emptyday"); // id 文字列を出さない
  });
  it("**apply button / 一切の button を置かない**", () => {
    const html = renderToStaticMarkup(<RealityPipelinePreviewClient envelope={env()} meta={meta} />);
    expect(html).not.toContain("<button");
  });
});

describe("P-D source contract — presentational / no apply / no fetch", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "app/(culcept)/plan/dev-reality-pipeline/RealityPipelinePreviewClient.tsx"), "utf8");
  it("fetch / button / onClick / useState を持たない（write/apply/interactive なし）", () => {
    expect(src).not.toContain("fetch(");
    expect(src).not.toContain("<button");
    expect(src).not.toContain("onClick");
    expect(src).not.toContain("useState");
  });
});
