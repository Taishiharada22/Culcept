/**
 * RD3g-P1 — Alter **L2 dev-only departure line candidate** status（`departureLineCandidatePresent`）。
 *   true→「内部出発線候補: あり」・false→「なし」。**exact timestamp / 出発時刻 / 間に合う / 遅れる / 必ず / 保証 /
 *   出発してください / 送信 / 予約 / internal ref / instant は DOM に出さない**。dev-only・専用 flag・operator-only（page が gate）。
 *   product `/plan` 本線・Alter 本線・notification なし。
 * 正本設計: docs/reality-departure-line-boundary-design-rd3g-0.md（RD3g-P1）
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AlterDevDepartureLineStatus } from "@/app/(culcept)/plan/dev-alter-tab/AlterDevDepartureLineStatus";

const PAGE = readFileSync(join(process.cwd(), "app/(culcept)/plan/dev-alter-tab/page.tsx"), "utf8");
const COMP = readFileSync(join(process.cwd(), "app/(culcept)/plan/dev-alter-tab/AlterDevDepartureLineStatus.tsx"), "utf8");
const SAFE_COMP = readFileSync(join(process.cwd(), "app/(culcept)/plan/dev-alter-tab/AlterDevSafeStatus.tsx"), "utf8");
const RSURF_CLIENT = readFileSync(join(process.cwd(), "app/(culcept)/plan/dev-reality-surface/RealitySurfaceDogfoodClient.tsx"), "utf8");

const render = (present: boolean) => renderToStaticMarkup(React.createElement(AlterDevDepartureLineStatus, { present }));

// RD3g-0 禁止語（user-facing 文言にしない）。"departure" latin は testid に正当使用するため visible-copy 検査では除外。
const FORBIDDEN_WORDING = ["出発時刻", "間に合", "遅れ", "必ず", "保証", "今すぐ出発", "出発してください", "自動で変更", "送信", "予約"];
const FORBIDDEN_TOKENS = ["leavebyinstant", "arrivaltargetinstant", "timecontract", "sourcetimeestimateref", "bufferref", "durationvalue", "capability", "originvalidity", "evidenceref", "sourceref", "missinginput"];
const ISO_INSTANT = /\d{4}-\d{2}-\d{2}t\d{2}:\d{2}/;
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("RD3g-P1 #1/#2 departure line candidate 表示（render・presence-only）", () => {
  it("#1/#2 flag ON + valid computed 相当（present=true）→ 「内部出発線候補: あり」", () => {
    const html = render(true);
    expect(html).toContain("内部出発線候補: あり");
    expect(html).not.toContain("内部出発線候補: なし");
  });
  it("#2 present=false → 「内部出発線候補: なし」（安全に false 表示）", () => {
    const html = render(false);
    expect(html).toContain("内部出発線候補: なし");
    expect(html).not.toContain("内部出発線候補: あり");
  });
});

describe("RD3g-P1 #3/#8-#14 exact timestamp / internal refs / 禁止文言が DOM に出ない", () => {
  for (const present of [true, false]) {
    it(`present=${present} → exact ISO instant / internal ref token 非露出（#8-#14）`, () => {
      const low = render(present).toLowerCase();
      expect(ISO_INSTANT.test(low)).toBe(false); // #3 exact timestamp を DOM に出さない（presence-only）
      for (const t of FORBIDDEN_TOKENS) expect(low.includes(t)).toBe(false);
    });
    it(`present=${present} → 出発時刻/間に合う/遅れる/必ず/保証/送信/予約 等の禁止文言なし`, () => {
      const html = render(present);
      for (const w of FORBIDDEN_WORDING) expect(html.includes(w)).toBe(false);
    });
  }
  it("component は boolean props のみ（internal object/ref/instant を受け取らない）", () => {
    const code = stripComments(COMP);
    for (const t of ["leaveByInstant", "arrivalTargetInstant", "timeContract", "sourceTimeEstimateRef", "bufferRef", "durationValue", "originValidity", "evidenceRefs", "leaveByComputed"]) {
      expect(code.includes(t)).toBe(false);
    }
    expect(code.includes("present: boolean")).toBe(true);
    expect(code.includes("内部出発線候補")).toBe(true);
  });
});

describe("RD3g-P1 #4-#7 page: 専用 flag gate / safe DTO のみ / product /plan 非接続 / no action・notification", () => {
  const code = stripComments(PAGE);
  it("#flag: realityOperatorDepartureLinePreview で gate・operator auth・leak guard・safe boolean のみ読む", () => {
    expect(code.includes("PLAN_FLAGS.realityOperatorDepartureLinePreview")).toBe(true);
    expect(code.includes("auth.getUser")).toBe(true);
    expect(code.includes("realDayPayloadLeakViolations")).toBe(true);
    expect(code.includes("departureLineCandidatePresent")).toBe(true);
    expect(code.includes("AlterDevDepartureLineStatus")).toBe(true);
    expect(code.includes("showDepartureStatus && ")).toBe(true);
  });
  it("#4/#5 page に internal ref read / exact instant 構築 / write / notification / action / external が無い", () => {
    for (const bad of ["leaveByInstant", "arrivalTargetInstant", "timeContract", "sourceTimeEstimateRef", "bufferRef"]) {
      expect(code.includes(bad)).toBe(false); // safe DTO のみ・内部 ref を読まない
    }
    const low = code.toLowerCase();
    for (const bad of [".insert(", ".update(", ".delete(", ".upsert(", "localstorage", "notification", "fetch(", "router.push", "navigate", "service_role", "/plan/page"]) {
      expect(low.includes(bad)).toBe(false); // #6 product /plan 非接続・#7 notification/action なし
    }
  });
  it("flag-gate は status のみを条件付け（既存 mock variant 表示は無条件）", () => {
    expect(code.includes("<AlterTabBody")).toBe(true);
  });
});

describe("RD3g-P1 既存表示の不破壊（RD3x-P6 safe status / RD3x-P5 dev-reality-surface）", () => {
  it("#safe-status: RD3x-P6 AlterDevSafeStatus（leaveByComputedPresent）は維持", () => {
    const code = stripComments(PAGE);
    expect(code.includes("AlterDevSafeStatus")).toBe(true);
    expect(code.includes("showSafeStatus && ")).toBe(true);
    expect(SAFE_COMP.includes("内部計算オブジェクト")).toBe(true);
  });
  it("#dev-reality-surface: RD3x-P5 表示（real-day-leaveby-computed-present）が残る", () => {
    expect(RSURF_CLIENT.includes("real-day-leaveby-computed-present")).toBe(true);
    expect(RSURF_CLIENT.includes("内部計算オブジェクト")).toBe(true);
  });
});
