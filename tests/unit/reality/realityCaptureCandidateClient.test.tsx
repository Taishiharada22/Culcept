/**
 * A1-5-7-7 Capture Candidate Client Bridge + AskHero wiring test
 *   既存 plan test pattern（renderToStaticMarkup・@testing-library なし・env=node）+ fake fetch（real network 0）。
 */
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import * as fs from "fs";
import * as path from "path";
import { selectCaptureCandidate, fetchCaptureCandidate, buildCaptureCandidateRequestBody, submitForCaptureCandidate, CAPTURE_CANDIDATE_V2_ROUTE } from "@/components/home/morning/captureCandidateClient";
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
