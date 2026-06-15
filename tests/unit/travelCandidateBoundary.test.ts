/**
 * A+B — TravelCandidate Construction Boundary tests
 *
 * 設計正本: docs/t11-travelcandidate-construction-boundary-design.md（§13）
 *
 * 主眼:
 *   - scheduled_draft bridge → draft-candidate envelope（包むだけ）。
 *   - no_draft → no_candidate（候補化不可・fail-closed）。
 *   - 型 firewall: envelope は TravelCandidate に代入不可・candidates[] に push 不可・
 *     raw FitResult は fitSummary に入らない・DisplayScheduledItinerary は入力 bridge にできない。
 *   - ranking/dominance/executionAuthority/acceptance フィールド不在。
 *   - helper は engine/evaluateFit/assembler/display を呼ばない（source-contract）。
 *   - import 純度（fetch/API/DB/Supabase/app/UI/M2 なし）。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildScheduledDraftCandidateEnvelope } from "@/lib/shared/travel/travel-candidate-boundary";
import type {
  ScheduledDraftCandidateEnvelope,
  ScheduledDraftCandidateConstructionInput,
} from "@/lib/shared/travel/travel-candidate-boundary-types";
import type { ScheduledTravelItineraryDraft } from "@/lib/shared/travel/assembly-types";
import type { AssemblyBridgeResult } from "@/lib/shared/travel/solver-assembly-bridge-types";
import type { DisplayScheduledItinerary } from "@/lib/shared/travel/scheduled-draft-display-types";
import type { TravelCandidate, TravelCorePlan } from "@/lib/shared/travel/core-types";
import type { FitResult } from "@/lib/shared/travel/fit-types";

const yen = (lo: number, hi: number) => ({ lo, hi, confidence: 0.6, currency: "JPY" as const });
const DRAFT: ScheduledTravelItineraryDraft = {
  outcome: "scheduled_draft",
  authoritative: false,
  draft: true,
  candidateId: "candidate:demo",
  itinerary: {
    days: [
      {
        dayIndex: 0,
        date: "2026-07-01",
        nodes: [
          { nodeId: "n:onsen", startMin: 600, endMin: 690, place: { placeRefId: "onsen", label: "温泉" }, activityKind: "onsen", budgetBand: yen(1500, 2500), fatigueLoad: 2, nodeConfidence: "anchor" },
        ],
        edges: [],
      },
    ],
  },
  provenance: { nodeBudget: {}, edgeTransport: {}, edgeCost: {}, dayIndexSource: "single_day_zero" },
};
const BRIDGE_OK: AssemblyBridgeResult = { outcome: "scheduled_draft", serverOnly: true, draft: DRAFT };
const BRIDGE_NO: AssemblyBridgeResult = { outcome: "no_draft", serverOnly: true, reason: "assembler_rejected" };

// ── 1. 成功: scheduled_draft → envelope（包むだけ）─────────────────────────────
describe("1. scheduled_draft bridge → draft-candidate envelope", () => {
  it("envelope を産出（serverOnly/authoritative:false/draft:true/insertable:false）", () => {
    const r = buildScheduledDraftCandidateEnvelope({ bridge: BRIDGE_OK });
    expect(r.outcome).toBe("scheduled_draft_candidate_envelope");
    if (r.outcome !== "scheduled_draft_candidate_envelope") throw new Error("unreachable");
    expect(r.serverOnly).toBe(true);
    expect(r.authoritative).toBe(false);
    expect(r.draft).toBe(true);
    expect(r.insertable).toBe(false);
    expect(r.candidateId).toBe("candidate:demo");
    expect(r.scheduledDraft).toBe(DRAFT); // copy-only（同一参照を保持・改変しない）
  });
  it("candidateIdOverride / proposalId / advisory を供給時のみ carry", () => {
    const r = buildScheduledDraftCandidateEnvelope({
      bridge: BRIDGE_OK,
      candidateIdOverride: "candidate:override",
      proposalId: "proposal:x",
      fitSummary: { candidateId: "candidate:demo", grade: "good", labelCap: null, labelStability: "stable", confidenceBand: "medium", mismatchCount: 0, riskCodes: [], missingFields: [] },
      readinessSummary: { state: "ready", actionKind: "review" },
    });
    if (r.outcome !== "scheduled_draft_candidate_envelope") throw new Error("unreachable");
    expect(r.candidateId).toBe("candidate:override");
    expect(r.proposalId).toBe("proposal:x");
    expect(r.fitSummary?.grade).toBe("good");
    expect(r.readinessSummary?.state).toBe("ready");
  });
  it("advisory 未供給なら envelope に出ない", () => {
    const r = buildScheduledDraftCandidateEnvelope({ bridge: BRIDGE_OK });
    if (r.outcome !== "scheduled_draft_candidate_envelope") throw new Error("unreachable");
    expect(r.fitSummary).toBeUndefined();
    expect(r.readinessSummary).toBeUndefined();
    expect(r.proposalId).toBeUndefined();
  });
});

// ── 2. 失敗: no_draft / 非整合 → no_candidate（fail-closed）──────────────────────
describe("2. no_draft / invalid → no_candidate", () => {
  it("no_draft bridge → no_candidate（non_scheduled_draft_bridge）", () => {
    const r = buildScheduledDraftCandidateEnvelope({ bridge: BRIDGE_NO });
    expect(r.outcome).toBe("no_candidate");
    if (r.outcome !== "no_candidate") throw new Error("unreachable");
    expect(r.serverOnly).toBe(true);
    expect(r.diagnostic.reason).toBe("non_scheduled_draft_bridge");
    expect(r.diagnostic.rejectedBridgeOutcome).toBe("no_draft");
  });
  it("不正入力（bridge 欠落）→ no_candidate（invalid_input）", () => {
    // @ts-expect-error 不正入力を意図的に渡す（runtime fail-closed を検証）
    const r = buildScheduledDraftCandidateEnvelope({});
    if (r.outcome !== "no_candidate") throw new Error("unreachable");
    expect(r.diagnostic.reason).toBe("invalid_input");
  });
  it("scheduled_draft だが draft 不変条件違反 → no_candidate（missing_scheduled_draft）", () => {
    const badDraft = { ...DRAFT, candidateId: "" };
    const r = buildScheduledDraftCandidateEnvelope({ bridge: { outcome: "scheduled_draft", serverOnly: true, draft: badDraft } });
    if (r.outcome !== "no_candidate") throw new Error("unreachable");
    expect(r.diagnostic.reason).toBe("missing_scheduled_draft");
  });
});

// ── 3. ranking/dominance/authority/acceptance フィールド不在 ────────────────────
describe("3. envelope に ranking/dominance/authority/acceptance を持たない", () => {
  it("出力 JSON にこれらの語が出ない", () => {
    const json = JSON.stringify(buildScheduledDraftCandidateEnvelope({ bridge: BRIDGE_OK }));
    for (const f of ["dominatedBy", "paretoOptimal", "rank", "executionAuthority", "booking", "calendar", "accepted", "acceptance", "finalized", "planState"]) {
      expect(json).not.toContain(f);
    }
  });
});

// ── 4. 型 firewall（@ts-expect-error・実行しない＝型のみ）─────────────────────────
// 実行されない（runtime 効果なし）。tsc が拒否を確認する。代入が通る回帰は @ts-expect-error 未使用で tsc error 化。
export function _typeFirewall(
  plan: TravelCorePlan,
  env: ScheduledDraftCandidateEnvelope,
  fr: FitResult,
  disp: DisplayScheduledItinerary,
) {
  // @ts-expect-error envelope は TravelCandidate でない（title/tags/tradeoff 等を欠く）
  const notCandidate: TravelCandidate = env;
  // @ts-expect-error candidates[]（TravelCandidate[]）に insert 不可
  plan.candidates.push(env);
  // @ts-expect-error raw FitResult は fitSummary（bounded ProposalFitSummary）に入らない
  const notFit: ScheduledDraftCandidateEnvelope["fitSummary"] = fr;
  // @ts-expect-error DisplayScheduledItinerary は権威入力（bridge）にできない
  const notInput: ScheduledDraftCandidateConstructionInput = { bridge: disp };
  return [notCandidate, notFit, notInput, plan, env];
}

// ── 5. source-contract（helper / types の純度）─────────────────────────────────
describe("5. helper/types source-contract", () => {
  const strip = (raw: string) => raw.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  const HELPER = strip(readFileSync(resolve(process.cwd(), "lib/shared/travel/travel-candidate-boundary.ts"), "utf8"));
  const TYPES = strip(readFileSync(resolve(process.cwd(), "lib/shared/travel/travel-candidate-boundary-types.ts"), "utf8"));

  it("helper は engine/evaluateFit/assembler/display projection を呼ばない", () => {
    for (const f of ["runTravelPlanEngine", "evaluateFit", "assembleScheduledDraft", "projectDisplayScheduledItinerary"]) {
      expect(HELPER).not.toContain(f);
    }
  });
  it("helper は candidates 挿入 / TravelCorePlan mutation / ranking をしない", () => {
    for (const f of ["TravelCorePlan", ".candidates", "dominatedBy", "paretoOptimal", "DisplayScheduledItinerary"]) {
      expect(HELPER).not.toContain(f);
    }
  });
  it("helper/types は fetch/API/DB/Supabase/外部/M2/app/UI を import/呼出しない", () => {
    for (const src of [HELPER, TYPES]) {
      expect(src).not.toMatch(/\bfetch\(/);
      expect(src).not.toMatch(/supabase/i);
      expect(src).not.toMatch(/\/api\//);
      expect(src).not.toMatch(/googleapis|maps/i);
      expect(src).not.toMatch(/from ["']next/);
      expect(src).not.toMatch(/from ["']react/);
      expect(src).not.toMatch(/from ["'][^"']*(components|app\/|\/m2|personalization)/i);
    }
  });
});
