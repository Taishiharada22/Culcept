/**
 * A1-5-7-7 Capture Candidate Client Bridge + AskHero wiring test
 *   既存 plan test pattern（renderToStaticMarkup・@testing-library なし・env=node）+ fake fetch（real network 0）。
 */
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import * as fs from "fs";
import * as path from "path";
import { selectCaptureCandidate, selectMorningProtocolCaptureCandidate, fetchCaptureCandidate, buildCaptureCandidateRequestBody, submitForCaptureCandidate, CAPTURE_CANDIDATE_V2_ROUTE } from "@/components/home/morning/captureCandidateClient";
import { appendCaptureCandidateToMorningResult } from "@/lib/plan/reality/integration/candidate-response-assembler";
import { CaptureCandidateBanner } from "@/components/home/morning/CaptureCandidateBanner";
import type { CandidateSurfaceDTO } from "@/lib/plan/reality/integration/candidate-surface";

const SEED_UUID = "11111111-1111-4111-8111-111111111111";
const SURFACE: CandidateSurfaceDTO = {
  hasCandidate: true,
  candidateCount: 1,
  status: "has_candidate",
  items: [{ durationMin: 60, evidenceSource: "seed_explicit", date: null, band: "morning", confidenceBand: "high" }],
};
function okResponse(cc?: unknown) {
  return { ok: true, data: { status: "ok", comprehension: { events: [] }, ...(cc !== undefined ? { captureCandidate: cc } : {}) } };
}
function fakeFetch(json: unknown): typeof fetch {
  return (async () => ({ json: async () => json })) as unknown as typeof fetch;
}

describe("A1-5-7-7 selectCaptureCandidate — response → captureCandidate（pure・redacted）", () => {
  it("非 object / ok!==true / data なし / captureCandidate なし → undefined", () => {
    expect(selectCaptureCandidate(undefined)).toBeUndefined();
    expect(selectCaptureCandidate({ ok: false })).toBeUndefined();
    expect(selectCaptureCandidate({ ok: true })).toBeUndefined();
    expect(selectCaptureCandidate({ ok: true, data: {} })).toBeUndefined();
  });
  it("hasCandidate=false → undefined（既存 UI 不変）", () => {
    expect(selectCaptureCandidate(okResponse({ hasCandidate: false, items: [] }))).toBeUndefined();
  });
  it("candidate present → DTO（redacted・既存 data keys は無視し captureCandidate のみ抽出）", () => {
    const cc = selectCaptureCandidate(okResponse(SURFACE));
    expect(cc).toEqual(SURFACE);
  });
  it("汚染 captureCandidate（source_ref/seedRef 混入）→ client boundary で drop", () => {
    const cc = selectCaptureCandidate(okResponse({ ...SURFACE, source_ref: "SREF", items: [{ ...SURFACE.items[0], seedRef: SEED_UUID, source_ref: "ISREF" }] }));
    const json = JSON.stringify(cc);
    for (const leak of ["SREF", "ISREF", "source_ref", "seedRef", SEED_UUID]) expect(json).not.toContain(leak);
    expect(json).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
  });
});

describe("A1-5-7-7 fetchCaptureCandidate — dormant gated fetch（fake fetch・fail-open）", () => {
  it("enabled=false → fetchImpl を呼ばず undefined（fetch 0・real network なし）", async () => {
    const spy = vi.fn();
    expect(await fetchCaptureCandidate({ enabled: false, body: { utterance: "x" }, fetchImpl: spy as unknown as typeof fetch })).toBeUndefined();
    expect(spy).not.toHaveBeenCalled();
  });
  it("enabled=true + fake response candidate → DTO（POST /api/alter-morning/plan）", async () => {
    const f = vi.fn(async () => ({ json: async () => okResponse(SURFACE) }));
    const cc = await fetchCaptureCandidate({ enabled: true, body: { utterance: "x" }, fetchImpl: f as unknown as typeof fetch });
    expect(cc).toEqual(SURFACE);
    expect(f).toHaveBeenCalledWith(CAPTURE_CANDIDATE_V2_ROUTE, expect.objectContaining({ method: "POST" }));
  });
  it("enabled=true + fake response no candidate → undefined（既存 UI 不変）", async () => {
    expect(await fetchCaptureCandidate({ enabled: true, body: {}, fetchImpl: fakeFetch(okResponse()) })).toBeUndefined();
  });
  it("enabled=true + fetch throw → undefined（fail-open）", async () => {
    const f = (async () => { throw new Error("net"); }) as unknown as typeof fetch;
    expect(await fetchCaptureCandidate({ enabled: true, body: {}, fetchImpl: f })).toBeUndefined();
  });
  it("enabled=true + ok:false response → undefined", async () => {
    expect(await fetchCaptureCandidate({ enabled: true, body: {}, fetchImpl: fakeFetch({ ok: false, error: "x" }) })).toBeUndefined();
  });
});

describe("A1-5-7-7 propagation — bridge → captureCandidate → banner（MorningPlanCard 表示）", () => {
  it("fake response candidate → banner「候補があります」", () => {
    const cc = selectCaptureCandidate(okResponse(SURFACE));
    expect(renderToStaticMarkup(<CaptureCandidateBanner candidate={cc} />)).toContain("候補があります");
  });
  it("flag off（bridge undefined）→ banner 空 markup（既存 UI 不変）", async () => {
    const cc = await fetchCaptureCandidate({ enabled: false, body: {}, fetchImpl: vi.fn() as unknown as typeof fetch });
    expect(renderToStaticMarkup(<CaptureCandidateBanner candidate={cc} />)).toBe("");
  });
  it("banner に source_ref/UUID/enum 技術名が出ない（汚染 response 経由）", () => {
    const cc = selectCaptureCandidate(okResponse({ ...SURFACE, source_ref: "SREF", items: [{ ...SURFACE.items[0], seedRef: SEED_UUID }] }));
    const html = renderToStaticMarkup(<CaptureCandidateBanner candidate={cc} />);
    for (const leak of ["SREF", "source_ref", "seedRef", SEED_UUID, "seed_explicit", "hasCandidate"]) expect(html).not.toContain(leak);
  });
});

describe("A1-5-7-8 buildCaptureCandidateRequestBody — 必要最小限の body（utterance のみ）", () => {
  it("utterance のみ → { utterance }（phenotype/weather 等 載せない）", () => {
    const body = buildCaptureCandidateRequestBody({ utterance: "9時にスタバ" });
    expect(body).toEqual({ utterance: "9時にスタバ" });
    expect(Object.keys(body)).toEqual(["utterance"]);
  });
  it("targetDateHint あり → { utterance, targetDateHint }（それ以外は載せない）", () => {
    const body = buildCaptureCandidateRequestBody({ utterance: "x", targetDateHint: "2026-06-07" });
    expect(body).toEqual({ utterance: "x", targetDateHint: "2026-06-07" });
    expect(Object.keys(body).sort()).toEqual(["targetDateHint", "utterance"]);
  });
});

describe("A1-5-7-8 submitForCaptureCandidate — inert submit bridge（dormant・fail-open）", () => {
  it("enabled=false → fetchImpl 未呼出（fetch 0）/ undefined（既存 UI 不変）", async () => {
    const spy = vi.fn();
    expect(await submitForCaptureCandidate({ utterance: "x" }, { enabled: false, fetchImpl: spy as unknown as typeof fetch })).toBeUndefined();
    expect(spy).not.toHaveBeenCalled();
  });
  it("enabled=true + fake candidate → DTO / body は utterance のみ（POST /api/alter-morning/plan）", async () => {
    const f = vi.fn(async () => ({ json: async () => okResponse(SURFACE) }));
    const cc = await submitForCaptureCandidate({ utterance: "9時にスタバ" }, { enabled: true, fetchImpl: f as unknown as typeof fetch });
    expect(cc).toEqual(SURFACE);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(CAPTURE_CANDIDATE_V2_ROUTE);
    expect(JSON.parse(init.body as string)).toEqual({ utterance: "9時にスタバ" }); // 最小 body
  });
  it("enabled=true + no candidate → undefined（既存 UI 不変）", async () => {
    expect(await submitForCaptureCandidate({ utterance: "x" }, { enabled: true, fetchImpl: fakeFetch(okResponse()) })).toBeUndefined();
  });
  it("enabled=true + fetch error → undefined（fail-open・既存 UI 不変）", async () => {
    const f = (async () => { throw new Error("net"); }) as unknown as typeof fetch;
    expect(await submitForCaptureCandidate({ utterance: "x" }, { enabled: true, fetchImpl: f })).toBeUndefined();
  });
  it("propagation: submit → DTO → banner「候補があります」", async () => {
    const cc = await submitForCaptureCandidate({ utterance: "x" }, { enabled: true, fetchImpl: fakeFetch(okResponse(SURFACE)) });
    expect(renderToStaticMarkup(<CaptureCandidateBanner candidate={cc} />)).toContain("候補があります");
  });
});

describe("A1-5-8-0/1 selectMorningProtocolCaptureCandidate — B案 contract（morningProtocol.captureCandidate）", () => {
  function alterResponse(cc?: unknown) {
    return { morningProtocol: { phase: "presented", sessionId: "s", plan: { date: "2026-06-07", items: [] }, ...(cc !== undefined ? { captureCandidate: cc } : {}) } };
  }
  it("morningProtocol なし / captureCandidate なし / hasCandidate=false → undefined", () => {
    expect(selectMorningProtocolCaptureCandidate(undefined)).toBeUndefined();
    expect(selectMorningProtocolCaptureCandidate({})).toBeUndefined();
    expect(selectMorningProtocolCaptureCandidate(alterResponse())).toBeUndefined();
    expect(selectMorningProtocolCaptureCandidate(alterResponse({ hasCandidate: false, items: [] }))).toBeUndefined();
  });
  it("morningProtocol.captureCandidate present → DTO（redacted）", () => {
    expect(selectMorningProtocolCaptureCandidate(alterResponse(SURFACE))).toEqual(SURFACE);
  });
  it("汚染（source_ref/seedRef）→ client boundary で drop", () => {
    const cc = selectMorningProtocolCaptureCandidate(alterResponse({ ...SURFACE, source_ref: "SREF", items: [{ ...SURFACE.items[0], seedRef: SEED_UUID }] }));
    const json = JSON.stringify(cc);
    for (const leak of ["SREF", "source_ref", "seedRef", SEED_UUID]) expect(json).not.toContain(leak);
    expect(json).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
  });
  it("V2 contract（data.captureCandidate）には反応しない（B案 extractor は morningProtocol を読む）", () => {
    expect(selectMorningProtocolCaptureCandidate(okResponse(SURFACE))).toBeUndefined();
  });
  it("元 response の既存 morningProtocol keys を壊さない（read-only extract）", () => {
    const resp = alterResponse(SURFACE);
    selectMorningProtocolCaptureCandidate(resp);
    expect(resp.morningProtocol.plan).toEqual({ date: "2026-06-07", items: [] });
    expect(resp.morningProtocol.phase).toBe("presented");
  });
});

describe("A1-5-8-0/1 server side reuse — appendCaptureCandidateToMorningResult が morningProtocol へ additive（B案）", () => {
  const mp = { phase: "presented", sessionId: "s", plan: { date: "x", items: [] } };
  it("no candidate → 元 morningProtocol と deep-equal（既存 keys 不変）", () => {
    expect(appendCaptureCandidateToMorningResult(mp, undefined)).toEqual(mp);
    expect("captureCandidate" in appendCaptureCandidateToMorningResult(mp, undefined)).toBe(false);
  });
  it("candidate present → captureCandidate を additive（既存 keys 維持）", () => {
    const out = appendCaptureCandidateToMorningResult(mp, SURFACE) as Record<string, unknown>;
    expect(out.phase).toBe("presented");
    expect((out.plan as { date: string }).date).toBe("x");
    expect(out.captureCandidate).toEqual(SURFACE);
    expect(Object.keys(out).filter((k) => !(k in mp))).toEqual(["captureCandidate"]);
  });
});

describe("A1-5-7-7 AskHero wiring（静的配線確認・heavy render 回避）", () => {
  const SRC = fs.readFileSync(path.join(process.cwd(), "components/home/AskHero.tsx"), "utf8");
  it("optional morningCaptureCandidate prop を持つ（additive）", () => {
    expect(SRC).toContain("morningCaptureCandidate?: CandidateSurfaceDTO");
  });
  it("MorningPlanCard へ captureCandidate を渡す（dormant・親未供給→undefined）", () => {
    expect(SRC).toContain("captureCandidate={morningCaptureCandidate}");
  });
  it("既存 morning props（plan/events/visualFlowEnabled）を消していない", () => {
    for (const k of ["plan={morningPlan}", "events={morningEvents}", "visualFlowEnabled={visualFlowEnabled}"]) {
      expect(SRC).toContain(k);
    }
  });
});

// ── A1-5-8-3: Stargazer Client Consumption（/api/stargazer/alter response → morningCaptureCandidate state → banner）──
// 本流 /api/stargazer/alter response 形（top-level ok/sessionId/response + 完全 morningProtocol）。useAlterChat が消費する shape。
function alterChatResponse(cc?: unknown) {
  return {
    ok: true,
    sessionId: "sess-1",
    response: "おはよう。今日のプランだよ。",
    morningProtocol: {
      phase: "presented",
      sessionId: "sess-1",
      pipelineVersion: "v2",
      plan: { date: "2026-06-07", confirmed: false, items: [{ title: "朝のルーティン" }] },
      rawInputs: [{ text: "x" }],
      parsedIntent: { foo: 1 },
      planStateV2: { state: "ok" },
      dialogState: { v: 2 },
      ...(cc !== undefined ? { captureCandidate: cc } : {}),
    },
  };
}
// useAlterChat の handler が state に入れる値 = selectMorningProtocolCaptureCandidate(data)
const consumeAlterResponse = (resp: unknown) => selectMorningProtocolCaptureCandidate(resp);

describe("A1-5-8-3 client consumption — /api/stargazer/alter response → morningCaptureCandidate state", () => {
  it("captureCandidate なし → state undefined（既存 morning plan flow 不変）", () => {
    const resp = alterChatResponse();
    expect(consumeAlterResponse(resp)).toBeUndefined();
    // extraction は read-only: 既存 morningProtocol flow（plan/dialogState/planStateV2/rawInputs）を壊さない
    expect(resp.morningProtocol.plan).toEqual({ date: "2026-06-07", confirmed: false, items: [{ title: "朝のルーティン" }] });
    expect(resp.morningProtocol.dialogState).toEqual({ v: 2 });
    expect(resp.morningProtocol.planStateV2).toEqual({ state: "ok" });
    expect(resp.morningProtocol.rawInputs).toEqual([{ text: "x" }]);
  });
  it("captureCandidate present → state は redacted DTO", () => {
    expect(consumeAlterResponse(alterChatResponse(SURFACE))).toEqual(SURFACE);
  });
  it("hasCandidate=false → state undefined（banner 非表示）", () => {
    expect(consumeAlterResponse(alterChatResponse({ hasCandidate: false, candidateCount: 0, status: "none", items: [] }))).toBeUndefined();
  });
  it("error response（{error} / {ok:false}）→ state undefined（既存挙動不変）", () => {
    expect(consumeAlterResponse({ error: "Internal error" })).toBeUndefined();
    expect(consumeAlterResponse({ ok: false })).toBeUndefined();
  });
  it("extraction は read-only（response を mutate しない）", () => {
    const resp = alterChatResponse(SURFACE);
    const before = JSON.stringify(resp);
    consumeAlterResponse(resp);
    expect(JSON.stringify(resp)).toBe(before);
  });
});

describe("A1-5-8-3 client consumption — present→banner 表示 / absent→banner なし（UI 既存同等）", () => {
  it("captureCandidate present → 抽出 DTO を banner に渡すと「候補があります」", () => {
    const cc = consumeAlterResponse(alterChatResponse(SURFACE));
    expect(renderToStaticMarkup(<CaptureCandidateBanner candidate={cc} />)).toContain("候補があります");
  });
  it("captureCandidate absent → undefined → banner 空 markup（既存 UI 完全不変）", () => {
    const cc = consumeAlterResponse(alterChatResponse());
    expect(renderToStaticMarkup(<CaptureCandidateBanner candidate={cc} />)).toBe("");
  });
  it("error response → undefined → banner 空 markup", () => {
    const cc = consumeAlterResponse({ error: "Internal error" });
    expect(renderToStaticMarkup(<CaptureCandidateBanner candidate={cc} />)).toBe("");
  });
});

describe("A1-5-8-3 client consumption — raw/source_ref/UUID non-surface（state/DOM 双方）", () => {
  it("汚染 captureCandidate → state（抽出値）に leak しない", () => {
    const contaminated = { ...SURFACE, source_ref: "SREF", rawNote: "歯医者", items: [{ ...SURFACE.items[0], seedRef: SEED_UUID, signal: "RAW_SIG" }] };
    const json = JSON.stringify(consumeAlterResponse(alterChatResponse(contaminated)));
    for (const leak of ["SREF", "source_ref", "seedRef", "rawNote", "歯医者", "RAW_SIG", SEED_UUID]) expect(json).not.toContain(leak);
    expect(json).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
  });
  it("汚染 captureCandidate → banner DOM にも leak しない（enum 技術名も非表示）", () => {
    const contaminated = { ...SURFACE, source_ref: "SREF", items: [{ ...SURFACE.items[0], seedRef: SEED_UUID, signal: "RAW_SIG" }] };
    const cc = consumeAlterResponse(alterChatResponse(contaminated));
    const html = renderToStaticMarkup(<CaptureCandidateBanner candidate={cc} />);
    for (const leak of ["SREF", "source_ref", "seedRef", "RAW_SIG", SEED_UUID, "seed_explicit"]) expect(html).not.toContain(leak);
  });
  it("state は raw response 本文/plan text/他 morningProtocol field を保持しない（redacted DTO のみ）", () => {
    const json = JSON.stringify(consumeAlterResponse(alterChatResponse(SURFACE)));
    for (const leak of ["おはよう", "朝のルーティン", "rawInputs", "dialogState", "planStateV2", "pipelineVersion"]) expect(json).not.toContain(leak);
  });
});

describe("A1-5-8-3 wiring（静的配線確認・heavy render 回避）", () => {
  const HOME = fs.readFileSync(path.join(process.cwd(), "app/AneurasyncHome.tsx"), "utf8");
  const HOOK = fs.readFileSync(path.join(process.cwd(), "hooks/useAlterChat.ts"), "utf8");
  it("AneurasyncHome が AskHero へ morningCaptureCandidate={alterChat.morningCaptureCandidate} を渡す", () => {
    expect(HOME).toContain("morningCaptureCandidate={alterChat.morningCaptureCandidate}");
  });
  it("AneurasyncHome 既存 morning props（morningPlan/morningPhase）を消していない", () => {
    for (const k of ["morningPlan={alterChat.morningPlan}", "morningPhase={alterChat.morningPhase}"]) expect(HOME).toContain(k);
  });
  it("useAlterChat が selectMorningProtocolCaptureCandidate(data) で抽出し state へ set", () => {
    expect(HOOK).toContain("setMorningCaptureCandidate(selectMorningProtocolCaptureCandidate(data))");
  });
  it("useAlterChat が morningCaptureCandidate を return する", () => {
    expect(HOOK).toMatch(/return \{[\s\S]*morningCaptureCandidate/);
  });
  it("useAlterChat の既存 setMorningPlan(data.morningProtocol.plan) を壊していない（壊さない最優先）", () => {
    expect(HOOK).toContain("setMorningPlan(data.morningProtocol.plan)");
  });
});
