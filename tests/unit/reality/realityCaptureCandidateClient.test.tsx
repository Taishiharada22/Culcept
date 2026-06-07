/**
 * A1-5-7-7 Capture Candidate Client Bridge + AskHero wiring test
 *   既存 plan test pattern（renderToStaticMarkup・@testing-library なし・env=node）+ fake fetch（real network 0）。
 */
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import * as fs from "fs";
import * as path from "path";
import { selectCaptureCandidate, selectMorningProtocolCaptureCandidate, fetchCaptureCandidate, buildCaptureCandidateRequestBody, submitForCaptureCandidate, CAPTURE_CANDIDATE_V2_ROUTE, postCandidateAction, applyAcceptedCandidateToPlan, removeCandidateItem, applyCandidateActionResult, REALITY_CANDIDATE_ACTION_ROUTE, type CandidateActionResult } from "@/components/home/morning/captureCandidateClient";
import { appendCaptureCandidateToMorningResult } from "@/lib/plan/reality/integration/candidate-response-assembler";
import { CaptureCandidateBanner } from "@/components/home/morning/CaptureCandidateBanner";
import type { CandidateSurfaceDTO } from "@/lib/plan/reality/integration/candidate-surface";
import type { MorningPlan } from "@/lib/alter-morning/types";

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

// ── A1-6-8: Candidate Action UI Buttons + Client Wiring ──
const HANDLE_A = "c1:" + "a".repeat(64); // 有効な opaque handle 形式（c1:[0-9a-f]{64}）
const HANDLE_B = "c1:" + "b".repeat(64);
const SURFACE_WITH_HANDLE: CandidateSurfaceDTO = {
  hasCandidate: true,
  candidateCount: 1,
  status: "has_candidate",
  items: [{ durationMin: 60, evidenceSource: "seed_explicit", date: "2099-12-31", band: "afternoon", confidenceBand: "high", handle: HANDLE_A }],
};
const TEST_PLAN = {
  date: "2099-12-31",
  items: [{ id: "existing-1", kind: "fixed", text: "既存", what: null, durationMin: 30, fixedStart: true, orderHint: 0, sourceTurnIndex: 0, completed: false }],
} as unknown as MorningPlan;
function actionResponse(data: { accepted: boolean; reason?: string; reflectsToPlan?: boolean; deferred?: boolean }) {
  return { ok: true, data: { reason: "ok", reflectsToPlan: false, deferred: false, ...data } };
}
const okResult: CandidateActionResult = { ok: true, accepted: true, reason: "ok", reflectsToPlan: true, deferred: false };

describe("A1-6-8 postCandidateAction — {handle,action} POST → result（fail-safe・seedRef 非送）", () => {
  it("accept ok → {ok,accepted,reflectsToPlan}・POST /api/reality/candidate-action・body は {handle,action} のみ", async () => {
    const f = vi.fn(async () => ({ json: async () => actionResponse({ accepted: true, reflectsToPlan: true }) }));
    const r = await postCandidateAction(HANDLE_A, "accept", f as unknown as typeof fetch);
    expect(r).toEqual({ ok: true, accepted: true, reason: "ok", reflectsToPlan: true, deferred: false });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(REALITY_CANDIDATE_ACTION_ROUTE);
    expect(JSON.parse(init.body as string)).toEqual({ handle: HANDLE_A, action: "accept" }); // {handle,action} のみ
  });
  it("dismiss → accepted true・reflectsToPlan false", async () => {
    const r = await postCandidateAction(HANDLE_A, "dismiss", fakeFetch(actionResponse({ accepted: true, reflectsToPlan: false })));
    expect(r.accepted).toBe(true);
    expect(r.reflectsToPlan).toBe(false);
  });
  it("later → deferred true", async () => {
    const r = await postCandidateAction(HANDLE_A, "later", fakeFetch(actionResponse({ accepted: true, deferred: true })));
    expect(r.deferred).toBe(true);
  });
  it("accepted=false（invalid handle 等）→ ok:true・accepted:false・reason 保持（安全に失敗表示）", async () => {
    const r = await postCandidateAction("bad", "accept", fakeFetch(actionResponse({ accepted: false, reason: "invalid_handle" })));
    expect(r.ok).toBe(true);
    expect(r.accepted).toBe(false);
    expect(r.reason).toBe("invalid_handle");
  });
  it("envelope ok:false → FAILED（ok:false・accepted:false）", async () => {
    const r = await postCandidateAction(HANDLE_A, "accept", fakeFetch({ ok: false, error: "Unauthorized" }));
    expect(r.ok).toBe(false);
    expect(r.accepted).toBe(false);
  });
  it("fetch throw → FAILED（fail-safe・UI を壊さない）", async () => {
    const f = (async () => { throw new Error("net"); }) as unknown as typeof fetch;
    const r = await postCandidateAction(HANDLE_A, "accept", f);
    expect(r).toEqual({ ok: false, accepted: false, reason: "failed", reflectsToPlan: false, deferred: false });
  });
});

describe("A1-6-8 applyAcceptedCandidateToPlan — optimistic add（A1-6-7 merge 再利用・drift なし）", () => {
  it("同日 item → plan に append（id=handle・existing 保持）", () => {
    const out = applyAcceptedCandidateToPlan(TEST_PLAN, SURFACE_WITH_HANDLE.items[0]);
    expect(out!.items).toHaveLength(2);
    expect(out!.items[0].id).toBe("existing-1");
    expect(out!.items[1].id).toBe(HANDLE_A);
  });
  it("plan null → null（不変）", () => {
    expect(applyAcceptedCandidateToPlan(null, SURFACE_WITH_HANDLE.items[0])).toBeNull();
  });
  it("handle なし item → plan 不変（同一参照）", () => {
    const noHandle = { ...SURFACE_WITH_HANDLE.items[0], handle: undefined };
    expect(applyAcceptedCandidateToPlan(TEST_PLAN, noHandle)).toBe(TEST_PLAN);
  });
  it("別日 item → plan 不変（merge date filter・同一参照）", () => {
    const otherDate = { ...SURFACE_WITH_HANDLE.items[0], date: "2099-12-30" };
    expect(applyAcceptedCandidateToPlan(TEST_PLAN, otherDate)).toBe(TEST_PLAN);
  });
  it("optimistic 結果に UUID(seedRef) を含まない（id=opaque handle）", () => {
    const out = applyAcceptedCandidateToPlan(TEST_PLAN, SURFACE_WITH_HANDLE.items[0]);
    expect(JSON.stringify(out)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i);
  });
});

describe("A1-6-8 removeCandidateItem — item 除去（hasCandidate/count 再計算）", () => {
  it("handle 一致 → 除去・hasCandidate=false・count=0（banner null へ）", () => {
    const out = removeCandidateItem(SURFACE_WITH_HANDLE, HANDLE_A);
    expect(out!.items).toHaveLength(0);
    expect(out!.hasCandidate).toBe(false);
    expect(out!.candidateCount).toBe(0);
  });
  it("一致なし → 同一参照（no-op）", () => {
    expect(removeCandidateItem(SURFACE_WITH_HANDLE, HANDLE_B)).toBe(SURFACE_WITH_HANDLE);
  });
  it("undefined → undefined", () => {
    expect(removeCandidateItem(undefined, HANDLE_A)).toBeUndefined();
  });
});

describe("A1-6-8 applyCandidateActionResult — action 後の client state（pure・testable）", () => {
  it("accept 成立 → plan に add + candidate から除去", () => {
    const next = applyCandidateActionResult({ plan: TEST_PLAN, candidate: SURFACE_WITH_HANDLE }, HANDLE_A, "accept", okResult);
    expect(next.plan!.items.map((i) => i.id)).toContain(HANDLE_A);
    expect(next.candidate!.items).toHaveLength(0);
  });
  it("dismiss 成立 → candidate 除去・plan 不変", () => {
    const next = applyCandidateActionResult({ plan: TEST_PLAN, candidate: SURFACE_WITH_HANDLE }, HANDLE_A, "dismiss", { ...okResult, reflectsToPlan: false });
    expect(next.plan).toBe(TEST_PLAN);
    expect(next.candidate!.items).toHaveLength(0);
  });
  it("later → state 不変（no-op・同一参照）", () => {
    const state = { plan: TEST_PLAN, candidate: SURFACE_WITH_HANDLE };
    expect(applyCandidateActionResult(state, HANDLE_A, "later", { ...okResult, deferred: true })).toBe(state);
  });
  it("失敗（accepted=false）→ state 不変（同一参照）", () => {
    const state = { plan: TEST_PLAN, candidate: SURFACE_WITH_HANDLE };
    expect(applyCandidateActionResult(state, HANDLE_A, "accept", { ...okResult, accepted: false })).toBe(state);
  });
});

describe("A1-6-8 banner buttons — onCandidateAction 提供時のみ表示（static render）", () => {
  const noop = async () => okResult;
  it("onCandidateAction + handle → accept/dismiss/later ボタン表示", () => {
    const html = renderToStaticMarkup(<CaptureCandidateBanner candidate={SURFACE_WITH_HANDLE} onCandidateAction={noop} />);
    expect(html).toContain("candidate-action-buttons");
    expect(html).toContain("予定に入れる");
    expect(html).toContain("今はいい");
    expect(html).toContain("あとで");
  });
  it("onCandidateAction 未提供 → ボタンなし（read-only banner・既存 UI 不変）", () => {
    const html = renderToStaticMarkup(<CaptureCandidateBanner candidate={SURFACE_WITH_HANDLE} />);
    expect(html).toContain("候補があります");
    expect(html).not.toContain("candidate-action-buttons");
    expect(html).not.toContain("予定に入れる");
  });
  it("handle なし item + onCandidateAction → ボタンなし（handle 必須）", () => {
    const html = renderToStaticMarkup(<CaptureCandidateBanner candidate={SURFACE} onCandidateAction={noop} />);
    expect(html).not.toContain("candidate-action-buttons");
  });
  it("candidate なし → 空 markup（onCandidateAction あっても既存 UI 不変）", () => {
    expect(renderToStaticMarkup(<CaptureCandidateBanner candidate={undefined} onCandidateAction={noop} />)).toBe("");
  });
  it("ボタン markup に UUID(seedRef) を出さない（handle は onClick closure・static markup 非搬送）", () => {
    const html = renderToStaticMarkup(<CaptureCandidateBanner candidate={SURFACE_WITH_HANDLE} onCandidateAction={noop} />);
    expect(html).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i);
  });
});

describe("A1-6-8 wiring（静的配線確認・heavy render 回避）", () => {
  const HOME = fs.readFileSync(path.join(process.cwd(), "app/AneurasyncHome.tsx"), "utf8");
  const HOOK = fs.readFileSync(path.join(process.cwd(), "hooks/useAlterChat.ts"), "utf8");
  const ASK = fs.readFileSync(path.join(process.cwd(), "components/home/AskHero.tsx"), "utf8");
  const CARD = fs.readFileSync(path.join(process.cwd(), "components/home/morning/MorningPlanCard.tsx"), "utf8");
  it("AneurasyncHome が onCandidateAction を flag-gated で渡す（off→undefined＝read-only banner）", () => {
    expect(HOME).toContain("onCandidateAction={PLAN_FLAGS.realityCandidateActions ? alterChat.submitCandidateAction : undefined}");
  });
  it("AskHero / MorningPlanCard が onCandidateAction を banner まで通す", () => {
    expect(ASK).toContain("onCandidateAction={onCandidateAction}");
    expect(CARD).toContain("onCandidateAction={onCandidateAction}");
  });
  it("useAlterChat が submitCandidateAction を実装し postCandidateAction + applyCandidateActionResult を使う", () => {
    expect(HOOK).toContain("submitCandidateAction");
    expect(HOOK).toContain("postCandidateAction(handle, action)");
    expect(HOOK).toContain("applyCandidateActionResult");
  });
  it("useAlterChat が submitCandidateAction を return する", () => {
    expect(HOOK).toMatch(/return \{[\s\S]*submitCandidateAction/);
  });
});
