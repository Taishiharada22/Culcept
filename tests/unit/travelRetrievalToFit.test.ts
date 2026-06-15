/**
 * T11-A(R2F)-D — retrieval-to-fit adapter tests
 *
 * 設計正本: docs/t11-a-retrieval-to-fit-integration-design.md（+ 補正: missing subject fail-closed・1:1）
 *
 * 主眼: strict join / valid のみ evaluateFit / invalid diagnostics / missing subject fail-closed /
 *   1:1(重複 fail-closed) / private 非漏洩 / no ranking・authority・display / engine 非呼出 / import 純度。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { deriveProposalFitInputsFromRetrievedEntities } from "@/lib/shared/travel/retrieval-to-fit";
import { normalizeManualEntityEvidence } from "@/lib/shared/travel/entity-retrieval";
import type { RetrievalToFitInput } from "@/lib/shared/travel/retrieval-to-fit-types";
import type { EntityRetrievalCandidate } from "@/lib/shared/travel/entity-retrieval-types";
import type { FitSubject, FitUserState } from "@/lib/shared/travel/fit-types";

// ── fixtures ────────────────────────────────────────────────────────────────
const entity = (placeRefId: string): EntityRetrievalCandidate =>
  normalizeManualEntityEvidence({ placeRefId, category: "place", facts: [{ kind: "roleAffinity", role: "relaxation", value: 0.8, provenance: "editorial" }] });
const soloUser = (user: FitUserState = { tolerances: {} }): FitSubject => ({ kind: "solo", user });
const base = (over: Partial<RetrievalToFitInput> = {}): RetrievalToFitInput => ({
  proposalIds: ["proposal:relaxed"],
  candidates: [entity("E1")],
  subject: soloUser(),
  bindings: [{ proposalId: "proposal:relaxed", retrievalCandidateId: "E1" }],
  ...over,
});

describe("1. valid binding → ProposalFitInput（evaluateFit は valid のみ）", () => {
  it("1 binding → 1 fitInput(candidateId=proposalId・fit 定義)・diagnostics 空", () => {
    const r = deriveProposalFitInputsFromRetrievedEntities(base());
    expect(r.fitInputs).toHaveLength(1);
    expect(r.fitInputs[0].candidateId).toBe("proposal:relaxed");
    expect(r.fitInputs[0].fit.fitLabel).toBeDefined(); // evaluateFit が走った
    expect(r.diagnostics).toHaveLength(0);
  });
});

describe("2. 未知 proposal/entity → diagnostic only（fitInput 出さない）", () => {
  it("未知 proposal id → unknown_proposal_id・fitInput 無", () => {
    const r = deriveProposalFitInputsFromRetrievedEntities(base({ bindings: [{ proposalId: "proposal:ghost", retrievalCandidateId: "E1" }] }));
    expect(r.fitInputs).toHaveLength(0);
    expect(r.diagnostics.map((d) => d.reason)).toContain("unknown_proposal_id");
  });
  it("未知 entity id → unknown_entity_id・fitInput 無", () => {
    const r = deriveProposalFitInputsFromRetrievedEntities(base({ bindings: [{ proposalId: "proposal:relaxed", retrievalCandidateId: "EX" }] }));
    expect(r.fitInputs).toHaveLength(0);
    expect(r.diagnostics.map((d) => d.reason)).toContain("unknown_entity_id");
  });
  it("空 retrievalCandidateId → missing_entity / 空 proposalId → invalid_binding", () => {
    const r1 = deriveProposalFitInputsFromRetrievedEntities(base({ bindings: [{ proposalId: "proposal:relaxed", retrievalCandidateId: "" }] }));
    expect(r1.diagnostics.map((d) => d.reason)).toContain("missing_entity");
    const r2 = deriveProposalFitInputsFromRetrievedEntities(base({ bindings: [{ proposalId: "", retrievalCandidateId: "E1" }] }));
    expect(r2.diagnostics.map((d) => d.reason)).toContain("invalid_binding");
  });
});

describe("3. ★missing fit subject → fail-closed（default user 作らない・entity-only scoring しない）", () => {
  it("subject 欠如 → fitInputs 空 + missing_fit_subject", () => {
    const r = deriveProposalFitInputsFromRetrievedEntities(base({ subject: undefined }));
    expect(r.fitInputs).toEqual([]);
    expect(r.diagnostics.map((d) => d.reason)).toEqual(["missing_fit_subject"]);
  });
});

describe("4. ★1:1 / 重複 binding → fail-closed（多 entity per proposal は HOLD）", () => {
  it("同 proposalId 複数 → duplicate_binding・fitInput 出さない", () => {
    const r = deriveProposalFitInputsFromRetrievedEntities(base({
      candidates: [entity("E1"), entity("E2")],
      bindings: [{ proposalId: "proposal:relaxed", retrievalCandidateId: "E1" }, { proposalId: "proposal:relaxed", retrievalCandidateId: "E2" }],
    }));
    expect(r.fitInputs).toHaveLength(0);
    expect(r.diagnostics.map((d) => d.reason)).toContain("duplicate_binding");
  });
  it("1 proposal = 1 entity（valid 1:1）→ 1 fitInput", () => {
    expect(deriveProposalFitInputsFromRetrievedEntities(base()).fitInputs).toHaveLength(1);
  });
});

describe("5. private FitUserState は full fit に効くが diagnostics に漏れない", () => {
  it("private trait 入りでも diagnostics は id/理由のみ（user state 非漏洩）", () => {
    const r = deriveProposalFitInputsFromRetrievedEntities(base({
      subject: soloUser({ tolerances: {}, traits: { quietLively: { value: 0.7, confidence: 0.9, visibility: "private" } } }),
      bindings: [{ proposalId: "proposal:relaxed", retrievalCandidateId: "EX" }], // invalid → diagnostic
    }));
    expect(JSON.stringify(r.diagnostics)).not.toContain("quietLively");
    expect(JSON.stringify(r.diagnostics)).not.toContain("0.7");
    for (const d of r.diagnostics) expect(Object.keys(d).every((k) => ["reason", "proposalId", "retrievalCandidateId"].includes(k))).toBe(true);
  });
});

describe("6. 出力に ranking/authority/display なし・FitResult は fit 内のみ", () => {
  it("result は {fitInputs, diagnostics} のみ", () => {
    const r = deriveProposalFitInputsFromRetrievedEntities(base());
    expect(Object.keys(r).sort()).toEqual(["diagnostics", "fitInputs"]);
  });
  it("ranking/dominance/authority/display packet/projection/cues を含まない", () => {
    const json = JSON.stringify(deriveProposalFitInputsFromRetrievedEntities(base()));
    for (const f of ["dominance", "paretoOptimal", "executionAuthority", "bookingReady", "displayPacket", "projection", "cues", "nextAction"]) {
      expect(json).not.toContain(f);
    }
  });
  it("fit(FitResult)は authoritative:false 固定（権限を産まない）", () => {
    expect(deriveProposalFitInputsFromRetrievedEntities(base()).fitInputs[0].fit.authoritative).toBe(false);
  });
});

describe("7. 純度: engine 非呼出・proposal text 非推論・import 純度", () => {
  it("helper は runTravelPlanEngine を呼ばず evaluateFit のみ・proposal copy/areaPlaceholder を読まない", () => {
    const strip = (raw: string) => raw.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
    const src = strip(readFileSync(resolve(process.cwd(), "lib/shared/travel/retrieval-to-fit.ts"), "utf8"));
    expect(src).not.toContain("runTravelPlanEngine");
    expect(src).toContain("evaluateFit");
    expect(src).not.toMatch(/areaPlaceholder|\.title|\.summary/); // proposal copy から推論しない
    for (const f of ["process.env", "Date.now", "Math.random"]) expect(src).not.toContain(f);
    expect(src).not.toMatch(/\bfetch\(/);
    expect(src).not.toMatch(/supabase/i);
    expect(src).not.toMatch(/from ["']next/);
    expect(src).not.toMatch(/from ["'][^"']*(components|app\/|engine-consume|plan-intelligence|coalter|m2|\/engine["'])/i);
  });
});
