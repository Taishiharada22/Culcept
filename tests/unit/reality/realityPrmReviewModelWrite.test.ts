/**
 * A1-7-30 M2/M3 Repository Write — mapper + fake + Supabase adapter mock tests（**実 DB write 0**）。
 *   M2: ReviewDecisionRecord→insert row（valid のみ・certainty≤tentative・no raw/seedRef/personality）/ fake / Supabase(mock・user_id・id 返却・fail-open）。
 *   M3: approved review→model entry（reviewRequired=review_decision_id 必須・approve のみ・tendency 写像）/ fake / Supabase(mock・user_id・fail-open）。
 */
import { describe, it, expect } from "vitest";
import type { ReviewDecisionRecord, ReviewedProposalSnapshot } from "@/lib/plan/reality/learning/review-decision-dry-run";
import {
  reviewDecisionRecordToInsertRow,
  reviewDecisionRecordsToInsertRows,
  type PrmReviewDecisionInsertRow,
} from "@/lib/plan/reality/learning/prm-review-decision-write";
import { FakePrmReviewDecisionRepository } from "@/lib/plan/reality/learning/fake-prm-review-decision-repository";
import {
  createSupabasePrmReviewDecisionRepository,
  PRM_REVIEW_DECISIONS_TABLE,
  type PrmReviewDecisionWriteClient,
} from "@/lib/plan/reality/learning/supabase-prm-review-decision-repository";
import {
  approvedReviewToModelEntryRow,
  approvedReviewsToModelEntryRows,
  type PrmModelEntryInsertRow,
} from "@/lib/plan/reality/learning/prm-model-entry-write";
import { FakePrmModelEntryRepository } from "@/lib/plan/reality/learning/fake-prm-model-entry-repository";
import {
  createSupabasePrmModelEntryRepository,
  PRM_MODEL_ENTRIES_TABLE,
  type PrmModelEntryWriteClient,
} from "@/lib/plan/reality/learning/supabase-prm-model-entry-repository";

const USER = "99999999-9999-4999-8999-999999999999";
const REVIEWED = "2026-06-15T10:00:00.000Z";
const NO_RAW = /raw|seed_?ref|source_ref|utterance|発話|personality|trait|fixed_preference/i;

function snap(over: Partial<ReviewedProposalSnapshot> = {}): ReviewedProposalSnapshot {
  return { sourceDimension: "band", sourceValue: "evening", dominantAction: "dismiss", favoredHypothesis: "not_now", stillPossible: ["not_selected", "mismatch_unknown"], evidenceCount: 6, counterCount: 1, certainty: "tentative", ...over };
}
function record(over: Partial<ReviewDecisionRecord> = {}): ReviewDecisionRecord {
  return { kind: "review_decision_record", valid: true, reason: "ok", proposalFingerprint: "band:evening:dismiss", decision: "approve", reviewer: "operator", effect: "add_model_entry_candidate", snapshot: snap(), reviewedAtISO: REVIEWED, reviewRequired: true, assertsPersonality: false, persisted: false, ...over };
}

describe("A1-7-30 M2 reviewDecisionRecordToInsertRow — valid review のみ・no raw/personality", () => {
  it("valid approve → row（cols/certainty≤tentative/reviewed_at）", () => {
    const row = reviewDecisionRecordToInsertRow(record());
    expect(row).not.toBeNull();
    expect(row!.proposal_fingerprint).toBe("band:evening:dismiss");
    expect(row!.decision).toBe("approve");
    expect(row!.reviewer).toBe("operator");
    expect(row!.source_dimension).toBe("band");
    expect(row!.dominant_action).toBe("dismiss");
    expect(row!.certainty).toBe("tentative");
    expect(row!.reviewed_at).toBe(REVIEWED);
    expect(row!.still_possible).toEqual(["not_selected", "mismatch_unknown"]);
    expect(JSON.stringify(row)).not.toMatch(NO_RAW);
    expect(row).not.toHaveProperty("user_id");
  });
  it("certainty に high は型で不可能（snapshot low/tentative のみ）", () => {
    expect(reviewDecisionRecordToInsertRow(record({ snapshot: snap({ certainty: "low" }) }))!.certainty).toBe("low");
  });
  it("invalid review（valid:false）→ null", () => {
    expect(reviewDecisionRecordToInsertRow(record({ valid: false, reason: "not_reviewable" }))).toBeNull();
  });
  it("decision null → null / reviewedAtISO null → null（persist 不可）", () => {
    expect(reviewDecisionRecordToInsertRow(record({ decision: null }))).toBeNull();
    expect(reviewDecisionRecordToInsertRow(record({ reviewedAtISO: null }))).toBeNull();
  });
  it("records → rows（無効 skip）", () => {
    const rows = reviewDecisionRecordsToInsertRows([record(), record({ valid: false }), record({ decision: "reject" })]);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.decision)).toEqual(["approve", "reject"]);
  });
});

function m2Mock(mode: { error?: { message: string }; throwOnSelect?: boolean } = {}) {
  const calls: { table: string; payload: readonly Record<string, unknown>[] }[] = [];
  const client: PrmReviewDecisionWriteClient = {
    from(table) {
      return {
        insert(rows) {
          calls.push({ table, payload: rows });
          return {
            select() {
              if (mode.throwOnSelect) throw new Error("auth");
              return Promise.resolve({ data: mode.error ? null : rows.map((_, i) => ({ id: `rid-${i}` })), error: mode.error ?? null });
            },
          };
        },
      };
    },
  };
  return { client, calls };
}

describe("A1-7-30 M2 repository — fake / Supabase(mock)", () => {
  it("fake: insert → ids/count・fail-open", async () => {
    const repo = new FakePrmReviewDecisionRepository();
    expect(repo.persisted).toBe(false);
    const r = await repo.insert([reviewDecisionRecordToInsertRow(record())!]);
    expect(r).toEqual({ ok: true, inserted: 1, ids: ["fake-review-0"] });
    repo.setFailNext(1);
    expect(await repo.insert([reviewDecisionRecordToInsertRow(record())!])).toEqual({ ok: false, inserted: 0, ids: [] });
  });
  it("Supabase mock: payload に user_id・table・id 返却", async () => {
    const { client, calls } = m2Mock();
    const res = await createSupabasePrmReviewDecisionRepository(client, USER).insert([reviewDecisionRecordToInsertRow(record())!]);
    expect(res).toEqual({ ok: true, inserted: 1, ids: ["rid-0"] });
    expect(calls[0]!.table).toBe(PRM_REVIEW_DECISIONS_TABLE);
    expect(calls[0]!.payload[0]!.user_id).toBe(USER);
    expect(JSON.stringify(calls[0]!.payload)).not.toMatch(NO_RAW);
  });
  it("Supabase mock: error→{ok:false}・throw→fail-open・空→{ok:true,0}", async () => {
    expect(await createSupabasePrmReviewDecisionRepository(m2Mock({ error: { message: "x" } }).client, USER).insert([reviewDecisionRecordToInsertRow(record())!])).toEqual({ ok: false, inserted: 0, ids: [] });
    expect(await createSupabasePrmReviewDecisionRepository(m2Mock({ throwOnSelect: true }).client, USER).insert([reviewDecisionRecordToInsertRow(record())!])).toEqual({ ok: false, inserted: 0, ids: [] });
    expect(await createSupabasePrmReviewDecisionRepository(m2Mock().client, USER).insert([])).toEqual({ ok: true, inserted: 0, ids: [] });
  });
});

describe("A1-7-30 M3 approvedReviewToModelEntryRow — reviewRequired・approve のみ・tendency 写像", () => {
  const base = { reviewDecisionId: "rid-0", decision: "approve" as const, snapshot: snap() };
  it("approve+reviewDecisionId → entry（tendency=non_adoption・review_decision_id・decay 1.0・user_visible・supersedes null）", () => {
    const row = approvedReviewToModelEntryRow(base);
    expect(row).not.toBeNull();
    expect(row!.tendency_direction).toBe("non_adoption"); // dismiss→non_adoption
    expect(row!.review_decision_id).toBe("rid-0");
    expect(row!.context_dimension).toBe("band");
    expect(row!.certainty).toBe("tentative");
    expect(row!.decay_weight).toBe(1.0);
    expect(row!.user_visible).toBe(true);
    expect(row!.supersedes_id).toBeNull();
    expect(row!.user_correction).toBeNull();
    expect(JSON.stringify(row)).not.toMatch(NO_RAW);
    expect(row).not.toHaveProperty("user_id");
  });
  it("tendency 写像 accept→adoption / dismiss→non_adoption / later→deferral", () => {
    expect(approvedReviewToModelEntryRow({ ...base, snapshot: snap({ dominantAction: "accept" }) })!.tendency_direction).toBe("adoption");
    expect(approvedReviewToModelEntryRow({ ...base, snapshot: snap({ dominantAction: "later" }) })!.tendency_direction).toBe("deferral");
  });
  it("**reviewRequired**: review_decision_id 空 → null", () => {
    expect(approvedReviewToModelEntryRow({ ...base, reviewDecisionId: "" })).toBeNull();
  });
  it("reject/defer → null（approve のみ entry 化・自動学習禁止）", () => {
    expect(approvedReviewToModelEntryRow({ ...base, decision: "reject" })).toBeNull();
    expect(approvedReviewToModelEntryRow({ ...base, decision: "defer" })).toBeNull();
  });
  it("不正 dominantAction → null", () => {
    expect(approvedReviewToModelEntryRow({ ...base, snapshot: snap({ dominantAction: "bogus" }) })).toBeNull();
  });
  it("複数 → rows（approve のみ）", () => {
    const rows = approvedReviewsToModelEntryRows([base, { ...base, decision: "reject" }, { ...base, snapshot: snap({ dominantAction: "accept" }) }]);
    expect(rows.map((r) => r.tendency_direction)).toEqual(["non_adoption", "adoption"]);
  });
});

function m3Mock(mode: { error?: { message: string }; throwOnInsert?: boolean } = {}) {
  const calls: { table: string; payload: readonly Record<string, unknown>[] }[] = [];
  const client: PrmModelEntryWriteClient = {
    from(table) {
      return {
        insert(rows) {
          calls.push({ table, payload: rows });
          if (mode.throwOnInsert) throw new Error("auth");
          return Promise.resolve({ error: mode.error ?? null });
        },
      };
    },
  };
  return { client, calls };
}

describe("A1-7-30 M3 repository — fake / Supabase(mock)", () => {
  const row = () => approvedReviewToModelEntryRow({ reviewDecisionId: "rid-0", decision: "approve", snapshot: snap() })!;
  it("fake: insert/count・fail-open・marker", async () => {
    const repo = new FakePrmModelEntryRepository();
    expect(repo.persisted).toBe(false);
    expect(await repo.insert([row()])).toEqual({ ok: true, inserted: 1 });
    expect(repo.count).toBe(1);
    repo.setFailNext(1);
    expect(await repo.insert([row()])).toEqual({ ok: false, inserted: 0 });
  });
  it("Supabase mock: payload user_id・table・review_decision_id 保持・no raw", async () => {
    const { client, calls } = m3Mock();
    const res = await createSupabasePrmModelEntryRepository(client, USER).insert([row()]);
    expect(res).toEqual({ ok: true, inserted: 1 });
    expect(calls[0]!.table).toBe(PRM_MODEL_ENTRIES_TABLE);
    expect(calls[0]!.payload[0]!.user_id).toBe(USER);
    expect(calls[0]!.payload[0]!.review_decision_id).toBe("rid-0");
    expect(JSON.stringify(calls[0]!.payload)).not.toMatch(NO_RAW);
  });
  it("Supabase mock: error/throw→fail-open・空→{ok:true,0}", async () => {
    expect(await createSupabasePrmModelEntryRepository(m3Mock({ error: { message: "x" } }).client, USER).insert([row()])).toEqual({ ok: false, inserted: 0 });
    expect(await createSupabasePrmModelEntryRepository(m3Mock({ throwOnInsert: true }).client, USER).insert([row()])).toEqual({ ok: false, inserted: 0 });
    expect(await createSupabasePrmModelEntryRepository(m3Mock().client, USER).insert([])).toEqual({ ok: true, inserted: 0 });
  });
});
