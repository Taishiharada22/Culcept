/**
 * Tier1-B-C — 外部 hand-off link render（read-only・SafeTravelLinkHrefModel のみ・cue と別 section・生成/fetch なし）
 *
 * 設計正本: docs/t11-tier1-b-c-href-ui-render-design.md（§14）
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { TravelExternalLinks, TravelLiveReadyView } from "@/app/(culcept)/plan/TravelLivePanel";
import { toTravelLiveActionState } from "@/lib/plan/travel/travel-live-action-state";
import { buildTravelPlanDisplayResult } from "@/lib/shared/travel/travel-plan-display-adapter";
import type { SessionSurfaceEvent } from "@/lib/shared/travel/travel-session-binding-types";
import type { SafeTravelLinkHrefModel } from "@/lib/shared/travel/safe-link-href-types";

const strip = (raw: string) => raw.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
const SRC = strip(readFileSync(resolve(process.cwd(), "app/(culcept)/plan/TravelLivePanel.tsx"), "utf8"));

const URL = "https://example.com/x?a=1";
const model = (label: string, handoffUrl = URL): SafeTravelLinkHrefModel => ({
  kind: "external_handoff",
  handoffUrl,
  label,
  external: true,
  authoritative: false,
  rendered: false,
});

describe("1. TravelExternalLinks（pure・href model のみ）", () => {
  it("eligible href model → external link を render（外部 hand-off section）", () => {
    const h = renderToStaticMarkup(<TravelExternalLinks links={[model("外部で確認する")]} />);
    expect(h).toContain("travel-live-external-links");
    expect(h).toContain("外部で確認");
    expect(h).toContain("外部で確認する"); // label
  });
  it("href === handoffUrl（unchanged）", () => {
    const h = renderToStaticMarkup(<TravelExternalLinks links={[model("外部で確認する")]} />);
    expect(h).toContain(`href="${URL}"`);
  });
  it("target=_blank の時 rel に noopener noreferrer を含む", () => {
    const h = renderToStaticMarkup(<TravelExternalLinks links={[model("外部で確認する")]} />);
    expect(h).toMatch(/target="_blank"/);
    expect(h).toContain('rel="noopener noreferrer"');
  });
  it("links 空 → 何も render しない（null）", () => {
    expect(renderToStaticMarkup(<TravelExternalLinks links={[]} />)).toBe("");
  });
  it("raw URL を plain text として出さない（label と異なる時）", () => {
    const h = renderToStaticMarkup(<TravelExternalLinks links={[model("外部で確認する", URL)]} />);
    expect(h).not.toContain(`>${URL}<`); // 要素テキストとして URL を出さない（href 属性のみ）
  });
  it("diagnostics/private/userId/M2 text を render しない", () => {
    const h = renderToStaticMarkup(<TravelExternalLinks links={[model("外部で確認する")]} />);
    for (const f of ["executionAuthority", "diagnostics", "provenance", "authoritative", "userId", "user_id", "red_line", "preference", "stargazer"]) {
      expect(h).not.toContain(f);
    }
    expect(h).not.toMatch(/\bm2\b/i);
  });
  it("禁止 copy / booking・calendar・action button / CoAlter input を render しない", () => {
    const h = renderToStaticMarkup(<TravelExternalLinks links={[model("外部で確認する")]} />);
    for (const f of ["予約する", "空きあり", "最安", "確定", "この場所にする", "スケジュールに追加", "今すぐ行く", "この案で決定", "<button", "<input", "Alterに送る"]) {
      expect(h).not.toContain(f);
    }
  });
});

describe("2. TravelLiveReadyView placement（D: state.display.externalLinks 単一 source・cue と別 section）", () => {
  const READY: SessionSurfaceEvent[] = [
    { kind: "destination_input", areaText: "京都", surface: "form_input" },
    { kind: "selected_plan_window", window: { kind: "single_day", date: "2026-07-01" } },
  ];
  // ★ D: links は state.display.externalLinks 経由で注入（placeholder prop は廃止）。
  const readyWithCues = (externalLinks?: SafeTravelLinkHrefModel[]) => {
    const base = toTravelLiveActionState(buildTravelPlanDisplayResult({ events: READY, participantIds: ["P1"], viewerId: "P1" }, { fixtureAllowed: false }));
    if (base.status !== "ready") throw new Error("expected ready");
    return {
      ...base,
      display: {
        ...base.display,
        cues: [{ action: "ask_question", source: "questionsToAsk", ref: "REF_x" }] as const,
        ...(externalLinks ? { externalLinks } : {}),
      },
    } as Extract<ReturnType<typeof toTravelLiveActionState>, { status: "ready" }>;
  };

  it("state.display.externalLinks 注入 → external link section が cue section の外・後に出る", () => {
    const h = renderToStaticMarkup(<TravelLiveReadyView state={readyWithCues([model("外部で確認する")])} />);
    const idxCues = h.indexOf("travel-live-cues");
    const idxExt = h.indexOf("travel-live-external-links");
    expect(idxCues).toBeGreaterThan(-1);
    expect(idxExt).toBeGreaterThan(idxCues); // cue の後
    // ★ link は cue section の内側に出ない（cues〜external-links の区間に <a なし）
    expect(h.slice(idxCues, idxExt)).not.toContain("<a ");
    // 「確認しておきたいこと」の中に link を入れない
    expect(h).toContain("確認しておきたいこと");
  });
  it("href model は unchanged で TravelExternalLinks に渡る", () => {
    const h = renderToStaticMarkup(<TravelLiveReadyView state={readyWithCues([model("外部で確認する", "https://kept.example.com/x")])} />);
    expect(h).toContain('href="https://kept.example.com/x"');
  });
  it("externalLinks 不在 → external link section を出さない", () => {
    const h = renderToStaticMarkup(<TravelLiveReadyView state={readyWithCues()} />);
    expect(h).not.toContain("travel-live-external-links");
    expect(h).not.toContain("<a ");
    expect(h).not.toContain("href");
  });
  it("externalLinks 空配列 → external link section を出さない", () => {
    const h = renderToStaticMarkup(<TravelLiveReadyView state={readyWithCues([])} />);
    expect(h).not.toContain("travel-live-external-links");
    expect(h).not.toContain("<a ");
  });
});

describe("3. source-contract（client 純度・UI は model 構築しない）", () => {
  it("UI は SafeTravelLinkIntent を受けず helper を呼ばない（生成/分類なし・state 駆動）", () => {
    expect(SRC).not.toContain("SafeTravelLinkIntent");
    for (const f of ["buildSafeTravelLinkHrefModel", "prepareSafeTravelLinkHrefModels", "prepareTravelExternalLinkHrefModels", "buildGeneratedMapsSearchIntent"]) {
      expect(SRC).not.toContain(f);
    }
    expect(SRC).toContain("state.display.externalLinks"); // ★ D: 単一 source of truth
  });
  it("URL 生成 / fetch / prefetch / Maps 生成なし", () => {
    for (const f of ["encodeURIComponent", "new URL(", "fetch(", "XMLHttpRequest", "prefetch", "preload", "maps.google", "googleapis", "PlacesService", "scrape"]) {
      expect(SRC).not.toContain(f);
    }
  });
  it("DB/Supabase/API/web search/CoAlter/talk import なし", () => {
    expect(SRC).not.toMatch(/supabase/i);
    expect(SRC).not.toMatch(/\/api\//);
    expect(SRC).not.toMatch(/webSearch|web_search/i);
    // CoAlter *runtime*（useCoAlter/`/talk`/realtime）なし。cue 型 import（CoAlterProjectionCue=G）は許可。
    expect(SRC).not.toMatch(/useCoAlter|\/talk|realtime|read_receipt/i);
  });
  it("禁止 copy を source に持たない", () => {
    for (const f of ["予約する", "空きあり", "最安", "この場所にする", "スケジュールに追加", "今すぐ行く", "この案で決定"]) {
      expect(SRC).not.toContain(f);
    }
  });
});
