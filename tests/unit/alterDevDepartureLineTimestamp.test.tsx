/**
 * RD3g-P2 — Alter **L2 dev-only departure HH:MM timestamp** status（`departureLineTimestampHHMM`）。
 *   timestamp 非 null → 「出発候補時刻: HH:MM（dev観測のみ・Alter）」・null → 「出発候補時刻: なし（dev観測のみ・Alter）」。
 *   **full ISO instant / 日付 / 秒 / TZ offset / 出発時刻 / 間に合う / 遅れる / 内部 ref は DOM に出さない**。
 *   dev-only・専用 flag・operator-only（page が gate）。
 * 正本設計: docs/reality-departure-line-boundary-design-rd3g-0.md（RD3g-P2）
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AlterDevDepartureLineTimestamp } from "@/app/(culcept)/plan/dev-alter-tab/AlterDevDepartureLineTimestamp";

const PAGE = readFileSync(join(process.cwd(), "app/(culcept)/plan/dev-alter-tab/page.tsx"), "utf8");
const COMP = readFileSync(join(process.cwd(), "app/(culcept)/plan/dev-alter-tab/AlterDevDepartureLineTimestamp.tsx"), "utf8");

const render = (timestamp: string | null) =>
  renderToStaticMarkup(React.createElement(AlterDevDepartureLineTimestamp, { timestamp }));

// RD3g-0 禁止語（user-facing 文言にしない）
const FORBIDDEN_WORDING = ["出発時刻", "間に合", "遅れ", "必ず", "保証", "今すぐ出発", "出発してください", "自動で変更", "送信", "予約", "遅刻"];
const FORBIDDEN_TOKENS = ["leavebyinstant", "arrivaltargetinstant", "timecontract", "sourcetimeestimateref", "bufferref", "durationvalue", "capability", "originvalidity", "evidenceref", "sourceref", "missinginput"];
const FULL_ISO_INSTANT = /\d{4}-\d{2}-\d{2}t\d{2}:\d{2}/; // YYYY-MM-DDTHH:MM（HH:MM のみは通す）
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("RD3g-P2 #1/#2 departure timestamp 表示（render・HH:MM のみ）", () => {
  it("#1 timestamp='13:40' → 「出発候補時刻: 13:40」を表示", () => {
    const html = render("13:40");
    expect(html).toContain("出発候補時刻: 13:40");
    expect(html).toContain("dev観測のみ・Alter");
    expect(html).not.toContain("なし");
  });
  it("#2 timestamp=null → 「出発候補時刻: なし」を表示", () => {
    const html = render(null);
    expect(html).toContain("出発候補時刻: なし");
    expect(html).toContain("dev観測のみ・Alter");
  });
  it("#1b 各種 HH:MM 値を正しく表示（08:00 / 20:30）", () => {
    expect(render("08:00")).toContain("出発候補時刻: 08:00");
    expect(render("20:30")).toContain("出発候補時刻: 20:30");
  });
});

describe("RD3g-P2 #3/#8-#14 full ISO instant / internal refs / 禁止文言が DOM に出ない", () => {
  for (const ts of ["13:40", null] as const) {
    it(`timestamp=${ts} → full ISO instant（YYYY-MM-DDTHH:MM）非露出`, () => {
      const low = render(ts).toLowerCase();
      expect(FULL_ISO_INSTANT.test(low)).toBe(false);
    });
    it(`timestamp=${ts} → internal ref token 非露出`, () => {
      const low = render(ts).toLowerCase();
      for (const t of FORBIDDEN_TOKENS) expect(low.includes(t)).toBe(false);
    });
    it(`timestamp=${ts} → 禁止文言（出発時刻/間に合う/遅れる/必ず/保証等）非露出`, () => {
      const html = render(ts);
      for (const w of FORBIDDEN_WORDING) expect(html.includes(w)).toBe(false);
    });
  }
  it("component は string | null のみ受け取る（LeaveByComputationV0 object / exact instant / *Ref を受け取らない）", () => {
    const code = stripComments(COMP);
    for (const t of ["leaveByInstant", "arrivalTargetInstant", "timeContract", "sourceTimeEstimateRef", "bufferRef", "durationValue", "leaveByComputed", "LeaveByComputationV0"]) {
      expect(code.includes(t)).toBe(false);
    }
    expect(code.includes("timestamp: string | null")).toBe(true);
    expect(code.includes("出発候補時刻")).toBe(true);
  });
});

describe("RD3g-P2 #4-#7 page: 専用 flag gate / safe DTO / product /plan 非接続 / no action", () => {
  const code = stripComments(PAGE);
  it("#flag: realityOperatorDepartureLineTimestampDev で gate・departureLineTimestampHHMM を読む", () => {
    expect(code.includes("PLAN_FLAGS.realityOperatorDepartureLineTimestampDev")).toBe(true);
    expect(code.includes("departureLineTimestampHHMM")).toBe(true);
    expect(code.includes("AlterDevDepartureLineTimestamp")).toBe(true);
    expect(code.includes("showTimestampStatus && ")).toBe(true);
  });
  it("#4 page に internal ref / write / notification / action がない", () => {
    const low = code.toLowerCase();
    for (const bad of [".insert(", ".update(", ".delete(", ".upsert(", "localstorage", "notification", "service_role"]) {
      expect(low.includes(bad)).toBe(false);
    }
  });
  it("#5 page に leaveByInstant / arrivalTargetInstant / timeContract 等の internal field を直接読む記述がない", () => {
    for (const bad of ["leaveByInstant", "arrivalTargetInstant", "timeContract"]) {
      expect(code.includes(bad)).toBe(false);
    }
  });
});

describe("RD3g-P2 既存表示の不破壊（RD3x-P6 safe status / RD3g-P1 departure candidate / RD3x-P5 dev-reality-surface）", () => {
  it("RD3x-P6 AlterDevSafeStatus が維持されている", () => {
    const code = stripComments(PAGE);
    expect(code.includes("AlterDevSafeStatus")).toBe(true);
    expect(code.includes("showSafeStatus && ")).toBe(true);
  });
  it("RD3g-P1 AlterDevDepartureLineStatus が維持されている", () => {
    const code = stripComments(PAGE);
    expect(code.includes("AlterDevDepartureLineStatus")).toBe(true);
    expect(code.includes("showDepartureStatus && ")).toBe(true);
  });
});
