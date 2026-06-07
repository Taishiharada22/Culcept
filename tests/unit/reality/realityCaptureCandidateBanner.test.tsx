/**
 * A1-5-7-6 CaptureCandidateBanner + MorningPlanCard wiring test
 *   既存 plan test pattern（renderToStaticMarkup・@testing-library なし・vitest env=node）踏襲。
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import * as fs from "fs";
import * as path from "path";
import { CaptureCandidateBanner } from "@/components/home/morning/CaptureCandidateBanner";
import type { CandidateSurfaceDTO } from "@/lib/plan/reality/integration/candidate-surface";

const SEED_UUID = "11111111-1111-4111-8111-111111111111";
function dto(p: Partial<CandidateSurfaceDTO> = {}): CandidateSurfaceDTO {
  return {
    hasCandidate: true,
    candidateCount: 1,
    status: "has_candidate",
    items: [{ durationMin: 60, evidenceSource: "seed_explicit", date: null, band: "morning", confidenceBand: "high" }],
    ...p,
  };
}

describe("A1-5-7-6 CaptureCandidateBanner — absent → 何も描画しない（既存 UI 不変）", () => {
  it("candidate undefined → 空 markup", () => {
    expect(renderToStaticMarkup(<CaptureCandidateBanner candidate={undefined} />)).toBe("");
  });
  it("candidate null → 空 markup", () => {
    expect(renderToStaticMarkup(<CaptureCandidateBanner candidate={null} />)).toBe("");
  });
  it("hasCandidate=false → 空 markup", () => {
    expect(renderToStaticMarkup(<CaptureCandidateBanner candidate={dto({ hasCandidate: false, status: "none", items: [] })} />)).toBe("");
  });
});

describe("A1-5-7-6 CaptureCandidateBanner — present → 控えめ表示", () => {
  it("candidate present → 「候補があります」+ 約60分 + 友好ラベル + testid", () => {
    const html = renderToStaticMarkup(<CaptureCandidateBanner candidate={dto()} />);
    expect(html).toContain("候補があります");
    expect(html).toContain("（候補）");
    expect(html).toContain("約60分");
    expect(html).toContain("あなたが話した内容から");
    expect(html).toContain("午前"); // A1-6-10: band label を reflection と一致（朝→午前）
    expect(html).toContain("capture-candidate-banner");
  });
  it("correction → 「これまでの調整から」", () => {
    const html = renderToStaticMarkup(<CaptureCandidateBanner candidate={dto({ items: [{ durationMin: 30, evidenceSource: "correction", date: null, band: null, confidenceBand: "medium" }] })} />);
    expect(html).toContain("これまでの調整から");
  });
});

describe("A1-5-7-6 CaptureCandidateBanner — 技術名/raw/source_ref/UUID が DOM に出ない", () => {
  it("markup に enum/source_ref/UUID/hasCandidate が含まれない", () => {
    const html = renderToStaticMarkup(
      <CaptureCandidateBanner candidate={{ ...dto({ items: [{ durationMin: 60, evidenceSource: "seed_explicit", date: "2026-06-07", band: "morning", confidenceBand: "high" }] }), ...({ seedRef: SEED_UUID, source_ref: "SREF" } as any) }} />
    );
    for (const leak of ["seed_explicit", "source_ref", "SREF", "seedRef", SEED_UUID, "hasCandidate", "candidateCount", "evidenceSource", "confidenceBand"]) {
      expect(html).not.toContain(leak);
    }
    expect(html).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i);
  });
});

describe("A1-5-7-6 MorningPlanCard wiring（静的配線確認・heavy render 回避）", () => {
  const SRC = fs.readFileSync(path.join(process.cwd(), "components/home/morning/MorningPlanCard.tsx"), "utf8");
  it("optional captureCandidate prop を持つ（additive）", () => {
    expect(SRC).toContain("captureCandidate?: CandidateSurfaceDTO");
  });
  it("CaptureCandidateBanner を render する（candidate + A1-6-8 onCandidateAction）", () => {
    expect(SRC).toContain("<CaptureCandidateBanner candidate={captureCandidate} onCandidateAction={onCandidateAction} />");
  });
  it("既存 prop（plan / events / visualFlowEnabled）を消していない", () => {
    for (const k of ["plan: MorningPlan", "visualFlowEnabled?: boolean", "events?: ComprehensionEvent"]) {
      expect(SRC).toContain(k);
    }
  });
});
