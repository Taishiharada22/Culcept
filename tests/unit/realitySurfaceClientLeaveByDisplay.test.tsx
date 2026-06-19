/**
 * RD3x-P5 — dev-reality-surface client の **safe boolean 表示**（`leaveByComputedPresent`）。
 *   true→安全文言「内部計算オブジェクト: あり」・false→「なし」。**exact timestamp / 出発時刻 / 間に合う / 遅れる /
 *   departure line / internal ref は DOM / rendered text に出さない**。dev-only・operator-only（page が gate）。
 * 正本設計: docs/reality-staging-dogfood-activation-rd3x-activate-0.md / CEO RD3x-P5 GO
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RealitySurfaceDogfoodClient } from "@/app/(culcept)/plan/dev-reality-surface/RealitySurfaceDogfoodClient";
import type { RealDaySurfacePayloadV0 } from "@/lib/plan/realityCore/operatorDayPreview";
import { OPERATOR_REALITY_READINESS_INITIAL } from "@/lib/plan/realityCore/operatorRealityReadiness";

const CLIENT = readFileSync(join(process.cwd(), "app/(culcept)/plan/dev-reality-surface/RealitySurfaceDogfoodClient.tsx"), "utf8");

// available:false の最小 real payload（leaveByComputedPresent 行は available 判定の前に描画される）。
const realPayload = (present: boolean): RealDaySurfacePayloadV0 => ({
  schemaVersion: 0,
  mode: "real",
  available: false,
  reasonCode: "no_today_event",
  summary: { oneOffIncludedCount: 1, recurringIncludedCount: 0, recurringExcludedCount: 0, recurringInvalidCount: 0 },
  consumerView: null,
  renderedCopy: null,
  delivery: null,
  readiness: OPERATOR_REALITY_READINESS_INITIAL,
  leaveByComputedPresent: present,
});
const render = (present: boolean) =>
  renderToStaticMarkup(
    React.createElement(RealitySurfaceDogfoodClient, { payload: { schemaVersion: 0, scenarios: [] }, realPayload: realPayload(present) }),
  );

const FORBIDDEN_WORDING = ["出発時刻", "間に合", "遅れ", "departure"];
const FORBIDDEN_TOKENS = [
  "leavebyinstant",
  "arrivaltargetinstant",
  "timecontract",
  "sourcetimeestimateref",
  "bufferref",
  "durationvalue",
  "capability",
  "originvalidity",
  "evidenceref",
  "sourceref",
  "missinginput",
];
const ISO_INSTANT = /\d{4}-\d{2}-\d{2}t\d{2}:\d{2}/;

describe("RD3x-P5 #1/#2 safe boolean 表示（render）", () => {
  it("#1 true → 安全文言「内部計算オブジェクト: あり」が出る", () => {
    const html = render(true);
    expect(html).toContain("内部計算オブジェクト: あり");
    expect(html).not.toContain("内部計算オブジェクト: なし");
  });
  it("#2 false → 「内部計算オブジェクト: なし」（安全に false 表示）", () => {
    const html = render(false);
    expect(html).toContain("内部計算オブジェクト: なし");
    expect(html).not.toContain("内部計算オブジェクト: あり");
  });
});

describe("RD3x-P5 #3/#4 exact timestamp / internal refs / 禁止文言が DOM に出ない", () => {
  for (const present of [true, false]) {
    it(`present=${present} → 出発時刻/間に合う/遅れる/departure 文言なし`, () => {
      const html = render(present);
      for (const w of FORBIDDEN_WORDING) expect(html.includes(w)).toBe(false);
    });
    it(`present=${present} → exact ISO instant / internal ref token が DOM に出ない`, () => {
      const low = render(present).toLowerCase();
      expect(ISO_INSTANT.test(low)).toBe(false);
      for (const t of FORBIDDEN_TOKENS) expect(low.includes(t)).toBe(false);
    });
  }
});

describe("RD3x-P5 #5/#6 client source 安全（dev-only・no-action・product/Alter 非接続）", () => {
  it("client は安全文言 + testid を持ち、禁止文言/exact instant 文字列を持たない", () => {
    expect(CLIENT.includes("内部計算オブジェクト")).toBe(true);
    expect(CLIENT.includes("real-day-leaveby-computed-present")).toBe(true);
    const code = CLIENT.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, ""); // コメント除去（禁止文言の解説を誤検出しない）
    for (const w of FORBIDDEN_WORDING) expect(code.includes(w)).toBe(false);
    for (const bad of ["leaveByInstant", "arrivalTargetInstant", "timeContract", "sourceTimeEstimateRef", "bufferRef", "durationValue", "originValidity"]) {
      expect(code.includes(bad)).toBe(false);
    }
  });
  it("client は product /plan / Alter / notification / action を持たない", () => {
    // コメント除去後に走査（docstring の「no onClick」等の説明文を誤検出しない）。
    const low = CLIENT.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").toLowerCase();
    for (const bad of ["/plan/page", "alttab", "alter", "notification", "onclick", "fetch(", "router.push", "navigate"]) {
      expect(low.includes(bad)).toBe(false);
    }
  });
});
