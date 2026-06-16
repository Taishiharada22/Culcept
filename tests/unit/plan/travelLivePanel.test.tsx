/**
 * B2-disp C — Travel Live Panel render + source-contract test。
 *   gate(visible prop) で出し分け・中立 copy・engine/adapter 非 import・useActionState・禁止 copy/button なし。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { TravelLivePanel } from "@/app/(culcept)/plan/TravelLivePanel";

const strip = (raw: string) => raw.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
const SRC = strip(readFileSync(resolve(process.cwd(), "app/(culcept)/plan/TravelLivePanel.tsx"), "utf8"));

describe("1. gate（visible prop・server 計算）", () => {
  it("visible=false → 何も render しない（null）", () => {
    expect(renderToStaticMarkup(<TravelLivePanel visible={false} />)).toBe("");
  });
  it("visible=true → panel + form（中立 copy）を render", () => {
    const h = renderToStaticMarkup(<TravelLivePanel visible={true} />);
    expect(h).toContain("travel-live-panel");
    expect(h).toContain("旅行プランの下書き");
    expect(h).toContain("これは予約・確定ではありません");
    expect(h).toContain("travel-live-form");
    expect(h).toContain('name="destination"');
    expect(h).toContain('name="date"');
    expect(h).toContain("下書きを見る");
  });
});

describe("2. 禁止 copy / booking・execute button なし", () => {
  it("禁止 copy（予約する/確定する/実行する/この案にする/スケジュールに追加）を出さない", () => {
    const h = renderToStaticMarkup(<TravelLivePanel visible={true} />);
    for (const f of ["予約する", "確定する", "実行する", "この案にする", "スケジュールに追加"]) expect(h).not.toContain(f);
  });
  it("外部 link/href・booking/calendar button を出さない", () => {
    const h = renderToStaticMarkup(<TravelLivePanel visible={true} />);
    for (const f of ["<a ", "href", "http", "予約ボタン"]) expect(h).not.toContain(f);
    expect(h).not.toMatch(/maps/i);
  });
});

describe("3. source-contract（client 純度）", () => {
  it("\"use client\" + useActionState + server action のみ（engine/adapter を直接 import しない）", () => {
    expect(SRC).toMatch(/^"use client";/);
    expect(SRC).toContain("useActionState");
    expect(SRC).toContain("submitTravelLiveIntakeAction");
    for (const f of ["runTravelPlanEngine", "buildTravelPlanDisplayResult", "getProductionTravelInput", "bindTravelSessionIntake", "toDisplayPacket"]) {
      expect(SRC).not.toContain(f);
    }
  });
  it("client は env/flag を読まない・送るのは permissioned field のみ（status/TravelPlanEngineInput を送らない）", () => {
    expect(SRC).not.toContain("process.env");
    expect(SRC).not.toContain("PLAN_FLAGS");
    expect(SRC).not.toContain("isPlanTravelLiveAllowed");
    for (const f of ['name="status"', "TravelPlanEngineInput", 'name="user_id"', 'name="userId"']) expect(SRC).not.toContain(f);
  });
  it("booking/calendar/execute/send・useCoAlter/talk/realtime なし", () => {
    expect(SRC).not.toMatch(/booking|calendar/i);
    expect(SRC).not.toMatch(/useCoAlter|\/talk|realtime|read_receipt/i);
  });
});
