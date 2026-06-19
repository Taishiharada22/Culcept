/**
 * RD3x-P6 — Alter dev-only safe boolean status（`leaveByComputedPresent`）。
 *   true→「内部計算オブジェクト: あり」・false→「なし」。**exact timestamp / 出発時刻 / 間に合う / 遅れる / departure /
 *   internal ref は DOM に出さない**。Alter dev-only・flag-gated・operator-only（page が gate）。product `/plan` 本線・通知なし。
 * 正本設計: docs/reality-staging-dogfood-activation-rd3x-activate-0.md / CEO RD3x-P6 GO
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AlterDevSafeStatus } from "@/app/(culcept)/plan/dev-alter-tab/AlterDevSafeStatus";

const PAGE = readFileSync(join(process.cwd(), "app/(culcept)/plan/dev-alter-tab/page.tsx"), "utf8");
const COMP = readFileSync(join(process.cwd(), "app/(culcept)/plan/dev-alter-tab/AlterDevSafeStatus.tsx"), "utf8");
const RSURF_CLIENT = readFileSync(join(process.cwd(), "app/(culcept)/plan/dev-reality-surface/RealitySurfaceDogfoodClient.tsx"), "utf8");

const render = (present: boolean) => renderToStaticMarkup(React.createElement(AlterDevSafeStatus, { present }));

const FORBIDDEN_WORDING = ["出発時刻", "間に合", "遅れ", "departure"];
const FORBIDDEN_TOKENS = ["leavebyinstant", "arrivaltargetinstant", "timecontract", "sourcetimeestimateref", "bufferref", "durationvalue", "capability", "originvalidity", "evidenceref", "sourceref", "missinginput"];
const ISO_INSTANT = /\d{4}-\d{2}-\d{2}t\d{2}:\d{2}/;
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("RD3x-P6 #1/#2 Alter dev safe status 表示（render）", () => {
  it("#1 true → 「内部計算オブジェクト: あり」", () => {
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

describe("RD3x-P6 #3-#8 exact timestamp / internal refs / 禁止文言が DOM に出ない", () => {
  for (const present of [true, false]) {
    it(`present=${present} → leaveByInstant/arrivalTargetInstant/timeContract/sourceTimeEstimateRef/bufferRef + exact ISO 非露出`, () => {
      const low = render(present).toLowerCase();
      expect(ISO_INSTANT.test(low)).toBe(false);
      for (const t of FORBIDDEN_TOKENS) expect(low.includes(t)).toBe(false);
    });
    it(`present=${present} → 出発時刻/間に合う/遅れる/departure 文言なし`, () => {
      const html = render(present);
      for (const w of FORBIDDEN_WORDING) expect(html.includes(w)).toBe(false);
    });
  }
  it("component は boolean props のみ（internal object/ref を受け取らない）", () => {
    const code = stripComments(COMP);
    for (const t of ["leaveByInstant", "arrivalTargetInstant", "timeContract", "sourceTimeEstimateRef", "bufferRef", "durationValue", "originValidity", "evidenceRefs"]) {
      expect(code.includes(t)).toBe(false);
    }
    expect(code.includes("present: boolean")).toBe(true);
  });
});

describe("RD3x-P6 #9/#10 page: flag-gate / safe DTO のみ / product /plan 非接続 / no action・notification", () => {
  const code = stripComments(PAGE);
  it("#flag: realityOperatorPreviewLeaveBy で gate・operator auth・leak guard・safe boolean のみ読む", () => {
    expect(code.includes("PLAN_FLAGS.realityOperatorPreviewLeaveBy")).toBe(true);
    expect(code.includes("auth.getUser")).toBe(true);
    expect(code.includes("realDayPayloadLeakViolations")).toBe(true);
    expect(code.includes("leaveByComputedPresent")).toBe(true);
    expect(code.includes("AlterDevSafeStatus")).toBe(true);
  });
  it("#9/#10 page に internal ref read / write / notification / action / external が無い", () => {
    for (const bad of ["leaveByInstant", "arrivalTargetInstant", "timeContract", "sourceTimeEstimateRef", "bufferRef"]) {
      expect(code.includes(bad)).toBe(false); // safe DTO のみ・内部 ref を読まない
    }
    const low = code.toLowerCase();
    for (const bad of [".insert(", ".update(", ".delete(", ".upsert(", "localstorage", "notification", "fetch(", "router.push", "navigate", "service_role", "/plan/page"]) {
      expect(low.includes(bad)).toBe(false);
    }
  });
  it("flag-gate は status のみを条件付け（既存 mock variant 表示は無条件）", () => {
    // status band は showSafeStatus（flag ON 下流）でのみ render・mock の AlterTabBody は常時 render。
    expect(code.includes("showSafeStatus && ")).toBe(true);
    expect(code.includes("<AlterTabBody")).toBe(true);
  });
});

describe("RD3x-P6 #11 existing dev-reality-surface 表示は維持（不接触）", () => {
  it("dev-reality-surface client の RD3x-P5 表示（real-day-leaveby-computed-present）が残る", () => {
    expect(RSURF_CLIENT.includes("real-day-leaveby-computed-present")).toBe(true);
    expect(RSURF_CLIENT.includes("内部計算オブジェクト")).toBe(true);
  });
});
