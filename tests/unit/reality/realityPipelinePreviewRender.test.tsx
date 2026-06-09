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
import type { ReflectionPreviewClientDto } from "@/lib/plan/reality/permission/reflection-preview-dto";

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
    changeSetDraft: { opCount: 6 },
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
  it("ChangeSet draft は **opCount のみ**（id/op 内容を render しない）", () => {
    const html = renderToStaticMarkup(<RealityPipelinePreviewClient envelope={env()} meta={meta} />);
    expect(html).toContain("6 操作候補"); // opCount のみ表示
    expect(html).not.toContain("draft:emptyday"); // id 文字列（draft identity）を出さない
  });
  it("**apply button / 一切の button を置かない**", () => {
    const html = renderToStaticMarkup(<RealityPipelinePreviewClient envelope={env()} meta={meta} />);
    expect(html).not.toContain("<button");
  });
});

describe("A-4-c render — Reflection Preview section（DTO のみ・観測のみ）", () => {
  const reflection: ReflectionPreviewClientDto = {
    stage: "done",
    preconditionVerdict: "can_apply",
    reflected: true,
    reflectedItemCount: 2,
    blockersCount: 0,
    warningsCount: 0,
    items: [
      { startTime: "10:00", endTime: "11:00", label: "集中の時間" },
      { startTime: "12:00", endTime: "13:00", label: "休息" },
    ],
  };
  it("section 名・必須明示文・HH:MM + allowlist label・counts が出る", () => {
    const html = renderToStaticMarkup(<RealityPipelinePreviewClient envelope={env()} meta={meta} reflectionPreview={reflection} />);
    expect(html).toContain("Reflection Preview（反映プレビュー・観測のみ）");
    expect(html).toContain("まだ予定には書き込んでいません。保存・確定・通知は行いません。");
    expect(html).toContain("10:00");
    expect(html).toContain("–11:00");
    expect(html).toContain("集中の時間");
    expect(html).toContain("休息");
    expect(html).toContain("can_apply");
  });
  it("完了語（反映済み/書き込み済み/保存済み）と display: id と button を出さない", () => {
    const html = renderToStaticMarkup(<RealityPipelinePreviewClient envelope={env()} meta={meta} reflectionPreview={reflection} />);
    expect(html).not.toContain("反映済み");
    expect(html).not.toContain("書き込み済み");
    expect(html).not.toContain("保存済み");
    expect(html).not.toContain("display:emptyday"); // item id を渡していない（DTO に無い）
    expect(html).not.toContain("<button");
    expect(html).not.toMatch(FORBIDDEN);
  });
  it("prop なしなら section 不在（optional・既存表示は不変）", () => {
    const html = renderToStaticMarkup(<RealityPipelinePreviewClient envelope={env()} meta={meta} />);
    expect(html).not.toContain("Reflection Preview");
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
