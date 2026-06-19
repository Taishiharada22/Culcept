/**
 * Staging-only smoke（mode B）— gate→adapter→action-state→panel の **フルパイプライン**を
 *   gate matrix の組み合わせで通し、staging で観測されるはずの挙動を決定論的に証明する。
 *
 * ★ 真の live staging smoke は実行不可（/plan は auth middleware で /login へ・gate は staging URL+
 *   server-only flag 要・staging deploy/env/push 不可）。本 smoke は実 gate/adapter/action-state/panel を
 *   使った決定論的 proof（env/flag 変更なし・DB なし・push なし・production 非接触）。
 *
 * 設計正本: docs/t11-production-deny-release-preconditions-gate-matrix.md（§5/§7/§9 mode B）
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { isPlanTravelLiveAllowed, isPlanTravelExternalLinksAllowed } from "@/lib/plan/travel/plan-travel-live-gate";
import { buildTravelPlanDisplayResult } from "@/lib/shared/travel/travel-plan-display-adapter";
import { toTravelLiveActionState, type TravelLiveActionState } from "@/lib/plan/travel/travel-live-action-state";
import { TravelLivePanel, TravelLiveReadyView } from "@/app/(culcept)/plan/TravelLivePanel";
import { STAGING_PROJECT_REF, PRODUCTION_PROJECT_REF } from "@/lib/plan/shift/devFixtureHost";
import type { SessionSurfaceEvent } from "@/lib/shared/travel/travel-session-binding-types";

const stagingUrl = `https://${STAGING_PROJECT_REF}.supabase.co`;
const prodUrl = `https://${PRODUCTION_PROJECT_REF}.supabase.co`;

const READY: SessionSurfaceEvent[] = [
  { kind: "destination_input", areaText: "京都", surface: "form_input" },
  { kind: "selected_plan_window", window: { kind: "single_day", date: "2026-07-01" } },
];
const MISSING_DEST: SessionSurfaceEvent[] = [
  { kind: "selected_plan_window", window: { kind: "single_day", date: "2026-07-01" } },
];

interface GateEnv {
  travelLive: boolean;
  planRouteLive: boolean;
  supabaseUrl: string;
  travelExternalLinks: boolean;
}
const env = (over: Partial<GateEnv> = {}): GateEnv => ({
  travelLive: true,
  planRouteLive: true,
  supabaseUrl: stagingUrl,
  travelExternalLinks: false,
  ...over,
});

/** page(visible) + server action(includeExternalLinks) + adapter + action-state を合成（実コード）。 */
function pipeline(e: GateEnv, events: SessionSurfaceEvent[]): { visible: boolean; includeExternalLinks: boolean; state: TravelLiveActionState | null } {
  const visible = isPlanTravelLiveAllowed(e); // page が panel visibility を計算
  const includeExternalLinks = isPlanTravelExternalLinksAllowed(e); // server action が gate から計算
  if (!visible) return { visible, includeExternalLinks, state: null }; // action は unavailable 相当（panel 非表示）
  const result = buildTravelPlanDisplayResult(
    { events, participantIds: ["P1"], viewerId: "P1" },
    { fixtureAllowed: false },
    { includeExternalLinks },
  );
  return { visible, includeExternalLinks, state: toTravelLiveActionState(result) };
}

describe("1. gate matrix（production deny=最終 brake・external は live に従属）", () => {
  it("production URL + 全 flag true → live なし（deny）", () => {
    const p = pipeline(env({ supabaseUrl: prodUrl, travelExternalLinks: true }), READY);
    expect(p.visible).toBe(false);
    expect(p.includeExternalLinks).toBe(false); // external も deny（live gate 継承）
    expect(renderToStaticMarkup(<TravelLivePanel visible={false} />)).toBe(""); // 何も描かない
  });
  it("staging + travelLive=false → live なし", () => {
    expect(pipeline(env({ travelLive: false }), READY).visible).toBe(false);
  });
  it("staging + planRouteLive=false → live なし", () => {
    expect(pipeline(env({ planRouteLive: false }), READY).visible).toBe(false);
  });
  it("staging + live + externalLinks=false → live あり・external gate off", () => {
    const p = pipeline(env(), READY);
    expect(p.visible).toBe(true);
    expect(p.includeExternalLinks).toBe(false);
  });
  it("staging + live + externalLinks=true → live あり・external gate on", () => {
    const p = pipeline(env({ travelExternalLinks: true }), READY);
    expect(p.visible).toBe(true);
    expect(p.includeExternalLinks).toBe(true);
  });
});

describe("2. ready 投影 + external link 出し分け（confirmed shared destination）", () => {
  it("external off + ready → ready 投影・external link section なし", () => {
    const p = pipeline(env(), READY);
    expect(p.state?.status).toBe("ready");
    if (p.state?.status !== "ready") throw new Error("ready 期待");
    expect(p.state.display.externalLinks).toBeUndefined();
    const h = renderToStaticMarkup(<TravelLiveReadyView state={p.state} />);
    expect(h).toContain("travel-live-ready");
    expect(h).not.toContain("travel-live-external-links");
    expect(h).not.toContain("<a ");
  });
  it("external on + ready → 生成 Maps 検索 hand-off（検索 badge + 検索 disclaimer + href）", () => {
    const p = pipeline(env({ travelExternalLinks: true }), READY);
    if (p.state?.status !== "ready") throw new Error("ready 期待");
    expect(p.state.display.externalLinks).toHaveLength(1);
    const h = renderToStaticMarkup(<TravelLiveReadyView state={p.state} />);
    expect(h).toContain("travel-live-external-links");
    expect(h).toContain("検索"); // 中立 badge
    expect(h).toContain("検索結果です。正確な場所は外部で確認してください。");
    expect(h).toContain("これは予約・確定ではありません。");
    expect(h).toMatch(/href="https:\/\/www\.google\.com\/maps\/search\//);
    expect(h).toMatch(/rel="noopener noreferrer"/);
  });
  it("on-path render は overtrust/raw を出さない", () => {
    const p = pipeline(env({ travelExternalLinks: true }), READY);
    if (p.state?.status !== "ready") throw new Error("ready 期待");
    const h = renderToStaticMarkup(<TravelLiveReadyView state={p.state} />);
    for (const f of [
      "予約する", "空きあり", "最安", "この場所を見る", "ここに行く", "地図で見る",
      "verified", "検証済", "おすすめ", "ランキング",
      "executionAuthority", "diagnostics", "authoritative", "userId", "user_id",
    ]) {
      expect(h).not.toContain(f);
    }
    expect(h).not.toMatch(/\bm2\b/i);
  });
});

describe("3. not-ready（missing destination）→ display/external なし（構造）", () => {
  it("missing destination → not_ready_missing・display 不在", () => {
    const p = pipeline(env({ travelExternalLinks: true }), MISSING_DEST);
    expect(p.state?.status).not.toBe("ready");
    expect(p.state && "display" in p.state).toBe(false); // not-ready は display を運ばない＝external 不能
  });
});

describe("4. panel visibility（gate 連動）", () => {
  it("visible=false → panel 何も描かない", () => {
    expect(renderToStaticMarkup(<TravelLivePanel visible={false} />)).toBe("");
  });
  it("visible=true → panel + form（idle・external links なし・href なし）", () => {
    const h = renderToStaticMarkup(<TravelLivePanel visible={true} />);
    expect(h).toContain("travel-live-panel");
    expect(h).toContain("旅行プランの下書き");
    expect(h).not.toContain("travel-live-external-links"); // idle（未送信）＝state に externalLinks なし
    expect(h).not.toContain("<a ");
  });
});
