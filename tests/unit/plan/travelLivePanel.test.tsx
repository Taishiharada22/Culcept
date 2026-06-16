/**
 * B2-disp C — Travel Live Panel render + source-contract test。
 *   gate(visible prop) で出し分け・中立 copy・engine/adapter 非 import・useActionState・禁止 copy/button なし。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { TravelLivePanel, TravelLiveReadyView } from "@/app/(culcept)/plan/TravelLivePanel";
import { toTravelLiveActionState } from "@/lib/plan/travel/travel-live-action-state";
import { buildTravelPlanDisplayResult } from "@/lib/shared/travel/travel-plan-display-adapter";
import type { SessionSurfaceEvent } from "@/lib/shared/travel/travel-session-binding-types";

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
  it("★ B: hidden participantId(P1) を除去・participant は「あなた」のみ・raw userId 非表示", () => {
    const h = renderToStaticMarkup(<TravelLivePanel visible={true} />);
    expect(h).toContain("参加者: あなた");
    expect(h).not.toContain('name="participantId"');
    expect(h).not.toContain("P1");
    expect(h).not.toContain("userId");
    expect(h).not.toContain("user_id");
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

describe("2b. richer ReadyView render（display-safe projection・中立・no forbidden）", () => {
  const READY: SessionSurfaceEvent[] = [
    { kind: "destination_input", areaText: "京都", surface: "form_input" },
    { kind: "selected_plan_window", window: { kind: "single_day", date: "2026-07-01" } },
  ];
  const readyState = () => {
    const s = toTravelLiveActionState(buildTravelPlanDisplayResult({ events: READY, participantIds: ["P1"], viewerId: "P1" }, { fixtureAllowed: false }));
    if (s.status !== "ready") throw new Error("expected ready");
    return s;
  };
  it("ready 投影（answer/why/viewer）+ disclaimer を render・rich/中立", () => {
    const h = renderToStaticMarkup(<TravelLiveReadyView state={readyState()} />);
    expect(h).toContain("travel-live-ready");
    expect(h).toContain("旅行プランの下書き");
    expect(h).toContain("これは予約・確定ではありません");
  });
  it("禁止 copy / booking / 外部 link / 内部 flag を render しない", () => {
    const h = renderToStaticMarkup(<TravelLiveReadyView state={readyState()} />);
    for (const f of ["予約する", "確定する", "実行する", "この案にする", "スケジュールに追加", "<button", "<a ", "href", "http"]) expect(h).not.toContain(f);
    // display-safe payload のみ＝authoritative/raw/diagnostics を render しない
    for (const f of ["executionAuthority", "provenance", "diagnostics", "authoritative"]) expect(h).not.toContain(f);
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
    for (const f of ['name="status"', "TravelPlanEngineInput", 'name="user_id"', 'name="userId"', 'name="participantId"']) expect(SRC).not.toContain(f);
  });
  it("booking/calendar/execute/send・useCoAlter/talk/realtime なし", () => {
    expect(SRC).not.toMatch(/booking|calendar/i);
    expect(SRC).not.toMatch(/useCoAlter|\/talk|realtime|read_receipt/i);
  });
});
