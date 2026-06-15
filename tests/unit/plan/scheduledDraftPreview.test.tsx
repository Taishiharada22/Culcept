/**
 * PV2 — Scheduled-Draft dev preview render + source-contract test。
 *   render（renderToStaticMarkup・route 非依存）+ page/component/fixture の guard 配線を source-contract で検証
 *   （既存 travelProjectionPreviewPage.test.ts / travelProjectionPreviewRender.test.tsx に準拠）。
 *   flag default OFF・read-only・no runtime/no 送信/no 外部 link/no booking。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { PLAN_FLAGS } from "@/lib/plan/featureFlags";
import { ScheduledDraftDisplay } from "@/app/(culcept)/plan/dev-travel-scheduled-draft/ScheduledDraftDisplay";
import { FIXTURE_BRIDGE_RESULT } from "@/app/(culcept)/plan/dev-travel-scheduled-draft/fixture";
import { projectDisplayScheduledItinerary } from "@/lib/shared/travel/scheduled-draft-display";

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");
const strip = (raw: string) => raw.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
const PAGE = strip(read("app/(culcept)/plan/dev-travel-scheduled-draft/page.tsx"));
const COMP = strip(read("app/(culcept)/plan/dev-travel-scheduled-draft/ScheduledDraftDisplay.tsx"));
const FIXTURE = strip(read("app/(culcept)/plan/dev-travel-scheduled-draft/fixture.ts"));

const display = projectDisplayScheduledItinerary(FIXTURE_BRIDGE_RESULT)!;
const html = () => renderToStaticMarkup(<ScheduledDraftDisplay itinerary={display} />);

// ── 1. flag gate（default OFF・fail-closed）────────────────────────────────────
describe("1. flag gate", () => {
  it("PLAN_FLAGS.travelProjectionPreview は env 未設定で false（本番デフォルト OFF）", () => {
    expect(PLAN_FLAGS.travelProjectionPreview).toBe(false);
  });
  it("page は !PLAN_FLAGS.travelProjectionPreview で Disabled（render しない）・新 flag 追加なし", () => {
    expect(PAGE).toMatch(/if\s*\(\s*!PLAN_FLAGS\.travelProjectionPreview\s*\)/);
    expect(PAGE).toContain("<Disabled");
    expect(PAGE).not.toMatch(/PLAN_TRAVEL_SCHEDULED_DRAFT/); // 専用 flag を足していない（既存再利用）
  });
  it("flag ON 時のみ display 投影 → ScheduledDraftDisplay を render", () => {
    expect(PAGE).toContain("projectDisplayScheduledItinerary");
    expect(PAGE).toContain("<ScheduledDraftDisplay");
  });
});

// ── 2. render（fixture display）──────────────────────────────────────────────
describe("2. render は DisplayScheduledItinerary のみ・href/booking なし", () => {
  it("fixture 旅程を表示（HH:MM・place label・draft 提案の明示）", () => {
    const h = html();
    expect(h).toContain("10:00");
    expect(h).toContain("渓谷の露天温泉");
    expect(h).toContain("提案"); // draft_proposal の明示
  });
  it("外部 href / Maps link / externalId を render しない", () => {
    const h = html();
    expect(h).not.toContain("<a ");
    expect(h).not.toContain("href");
    expect(h).not.toContain("http");
    expect(h).not.toMatch(/maps/i);
    expect(h).not.toContain("place_demo_onsen"); // externalId は inert・UI に出さない
  });
  it("booking/calendar/action button・serverOnly・provenance を render しない（予約 button/affordance なし）", () => {
    const h = html();
    // 注: 免責 disclaimer は「予約・確定・送信・実行は行いません」と予約を**否定**して言及する（望ましい）。
    //   禁止対象は booking の affordance（button/action）であって「予約」という語の否定的言及ではない。
    for (const f of ["<button", "<form", "onclick", "serverOnly", "provenance", "executionAuthority"]) expect(h).not.toContain(f);
  });
});

// ── 3. source-contract（page / component / fixture）───────────────────────────
describe("3. page は read-only・no runtime/送信/DB/外部", () => {
  it("runtime（runTravelPlanEngine/assembleScheduledDraft）を実行しない", () => {
    for (const f of ["runTravelPlanEngine", "assembleScheduledDraft", "evaluateFit"]) expect(PAGE).not.toContain(f);
  });
  it("fetch/API/DB/Supabase/送信/realtime/useCoAlter/外部 Maps/booking を持たない", () => {
    for (const f of ["fetch(", "/api/", "supabase", "useCoAlter", "realtime", "readReceipt", "read_receipt", "googleapis", "booking", "href"]) expect(PAGE).not.toContain(f);
  });
  it("write/apply/seed を持たない（read-only）", () => {
    for (const re of [/\.insert\s*\(/, /\.update\s*\(/, /\.delete\s*\(/, /\.upsert\s*\(/, /apply/i, /seed/i]) expect(PAGE).not.toMatch(re);
  });
});
describe("4. component は read-only・action/外部 link なし", () => {
  it("prop は DisplayScheduledItinerary（envelope/raw draft/provenance を受けない）", () => {
    expect(COMP).toContain("itinerary: DisplayScheduledItinerary");
    for (const f of ["executionAuthority", "serverOnly", "ScheduledTravelItineraryDraft", "AssemblyBridgeResult"]) expect(COMP).not.toContain(f);
  });
  it("button/input/form/onClick/useState/fetch/useCoAlter/<a/href/externalId を持たない", () => {
    for (const f of ["<button", "<input", "<form", "onClick", "useState", "fetch(", "useCoAlter", "<a ", "href", "externalId"]) expect(COMP).not.toContain(f);
  });
});
describe("5. fixture は fixture のみ・runtime/外部なし", () => {
  it("runTravelPlanEngine/assembleScheduledDraft/fetch/supabase/maps を持たない", () => {
    for (const f of ["runTravelPlanEngine", "assembleScheduledDraft", "fetch(", "supabase", "googleapis", "/api/"]) expect(FIXTURE).not.toContain(f);
  });
});
