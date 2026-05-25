/**
 * Phase 3-J-6e-3 補正 2: source.notes 由来 reload-safe suppression
 *
 * 設計書: docs/alter-plan-phase3-predictive-day-orchestration-architecture.md
 *   §3.1 J-6 / J-6e-3 detailed plan §2
 *
 * 検証範囲:
 *   - sources 空 → 空 Set
 *   - alter-proposal: prefix なし sources → 空 Set
 *   - prefix あり sources → proposalId set
 *   - 同 proposalId 複数 source → 1 entry (= Set 性質)
 *   - 入力 mutate なし
 */

import { describe, expect, it } from "vitest";

import { extractAcceptedProposalIdsFromSources } from "@/lib/plan/proposal/acceptedFromSources";
import type { ExternalAnchorSource } from "@/lib/plan/external-anchor-source";

function source(opts: { id?: string; notes?: string }): ExternalAnchorSource {
  return {
    id: opts.id ?? "src_test",
    userId: "user_test",
    sourceType: "manual",
    capturedAt: "2026-05-21T00:00:00.000Z",
    rawRetention: "discarded",
    notes: opts.notes,
  };
}

describe("extractAcceptedProposalIdsFromSources", () => {
  it("空 sources → 空 Set", () => {
    expect(extractAcceptedProposalIdsFromSources([]).size).toBe(0);
  });

  it("notes 不在 source → 空 Set", () => {
    const set = extractAcceptedProposalIdsFromSources([source({})]);
    expect(set.size).toBe(0);
  });

  it("通常 notes (= alter-proposal prefix なし) → 空 Set", () => {
    const set = extractAcceptedProposalIdsFromSources([
      source({ notes: "manual import 2026-05" }),
      source({ notes: "user memo" }),
    ]);
    expect(set.size).toBe(0);
  });

  it("alter-proposal: prefix あり → proposalId 抽出", () => {
    const set = extractAcceptedProposalIdsFromSources([
      source({ id: "src1", notes: "alter-proposal:proposal_abc" }),
    ]);
    expect(set.size).toBe(1);
    expect(set.has("proposal_abc")).toBe(true);
  });

  it("複数 sources → 全 proposalId 集合", () => {
    const set = extractAcceptedProposalIdsFromSources([
      source({ id: "src1", notes: "alter-proposal:p1" }),
      source({ id: "src2", notes: "alter-proposal:p2" }),
      source({ id: "src3", notes: "manual" }),
      source({ id: "src4", notes: "alter-proposal:p3" }),
    ]);
    expect(set.size).toBe(3);
    expect(set.has("p1")).toBe(true);
    expect(set.has("p2")).toBe(true);
    expect(set.has("p3")).toBe(true);
  });

  it("同 proposalId 複数 source → 1 entry (= Set 性質)", () => {
    const set = extractAcceptedProposalIdsFromSources([
      source({ id: "src1", notes: "alter-proposal:p_dup" }),
      source({ id: "src2", notes: "alter-proposal:p_dup" }),
    ]);
    expect(set.size).toBe(1);
  });

  it("入力 sources を mutate しない", () => {
    const sources = [source({ notes: "alter-proposal:p1" })];
    const frozen = JSON.stringify(sources);
    extractAcceptedProposalIdsFromSources(sources);
    expect(JSON.stringify(sources)).toBe(frozen);
  });
});
