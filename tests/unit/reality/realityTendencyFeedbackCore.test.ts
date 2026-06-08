/**
 * A1-7-35 Tendency Feedback Core — executeTendencyFeedback（fake repos/updater・実 DB 0）。
 *   confirm→user M2+新 M3 version+old retracted / correct→M3 user_correction UPDATE / reject→user M2+M3 retracted /
 *   entry_not_found·unknown_feedback·invalid_correction fail-closed / M2 fail fail-closed / **partial failure 明示** /
 *   reviewer=user / certainty≤tentative / redacted（id/raw 出さない）/ 破壊削除なし（update のみ）。
 */
import { describe, it, expect } from "vitest";
import {
  executeTendencyFeedback,
  type ModelEntryPatch,
  type PrmModelEntryUpdater,
} from "@/lib/plan/reality/learning/tendency-feedback-core";
import type { PrmModelEntryFeedbackEntry } from "@/lib/plan/reality/learning/prm-model-entry-read";
import { FakePrmReviewDecisionRepository } from "@/lib/plan/reality/learning/fake-prm-review-decision-repository";
import { FakePrmModelEntryRepository } from "@/lib/plan/reality/learning/fake-prm-model-entry-repository";

const KEY = "band:evening:non_adoption";
const NO_RAW = /raw|seed_?ref|utterance|personality|trait|fixed_preference/i;

function entry(over: Partial<PrmModelEntryFeedbackEntry> = {}): PrmModelEntryFeedbackEntry {
  return { id: "m3-1", contextDimension: "band", contextValue: "evening", tendencyDirection: "non_adoption", favoredHypothesis: "not_now", stillPossible: ["not_selected"], evidenceCount: 6, counterCount: 1, certainty: "tentative", ...over };
}
class FakeUpdater implements PrmModelEntryUpdater {
  readonly calls: { id: string; patch: ModelEntryPatch }[] = [];
  private failNext = 0;
  setFailNext(n = 1) { this.failNext = n; }
  async update(id: string, patch: ModelEntryPatch) {
    this.calls.push({ id, patch });
    if (this.failNext > 0) { this.failNext -= 1; return { ok: false }; }
    return { ok: true };
  }
}
function ctx() {
  return { m2: new FakePrmReviewDecisionRepository(), m3Insert: new FakePrmModelEntryRepository(), m3Update: new FakeUpdater() };
}
function run(raw: unknown, c: ReturnType<typeof ctx>, entries = [entry()]) {
  return executeTendencyFeedback({ entries, rawRequest: raw, m2: c.m2, m3Insert: c.m3Insert, m3Update: c.m3Update, nowMs: Date.parse("2026-06-15T10:00:00.000Z") });
}

describe("A1-7-35 executeTendencyFeedback — confirm/correct/reject 可逆・partial failure", () => {
  it("confirm → user M2(approve,reviewer=user) + 新 M3 version(supersedes old) + old retracted", async () => {
    const c = ctx();
    const r = await run({ tendencyKey: KEY, feedback: "confirm" }, c);
    expect(r).toEqual({ ok: true, feedback: "confirm", reviewed: true, modelEntryCreated: true, corrected: false, retracted: true, reason: "ok", partialFailure: null });
    expect(c.m2.count).toBe(1);
    expect(c.m2.rows[0]!.reviewer).toBe("user");
    expect(c.m2.rows[0]!.decision).toBe("approve");
    expect(c.m2.rows[0]!.certainty).not.toBe("high");
    expect(c.m3Insert.count).toBe(1);
    expect(c.m3Insert.rows[0]!.supersedes_id).toBe("m3-1"); // 新 version は old を supersede
    expect(c.m3Insert.rows[0]!.review_decision_id).toBe("fake-review-0"); // user M2 id
    expect(c.m3Update.calls).toEqual([{ id: "m3-1", patch: { retractedAtISO: "2026-06-15T10:00:00.000Z" } }]); // old retract（破壊削除でない）
    expect(JSON.stringify(r)).not.toMatch(NO_RAW);
    expect(JSON.stringify(r)).not.toContain("m3-1"); // id を return に出さない
  });

  it("correct(direction_adjusted) → 既存 M3 を user_correction UPDATE（破壊削除なし・M2 作らない）", async () => {
    const c = ctx();
    const r = await run({ tendencyKey: KEY, feedback: "correct", correctionKind: "direction_adjusted" }, c);
    expect(r.ok).toBe(true);
    expect(r.corrected).toBe(true);
    expect(c.m2.count).toBe(0);
    expect(c.m3Insert.count).toBe(0);
    expect(c.m3Update.calls).toEqual([{ id: "m3-1", patch: { userCorrection: "direction_adjusted" } }]);
  });

  it("reject → user M2(reject) + M3 retracted（可逆・破壊削除なし）", async () => {
    const c = ctx();
    const r = await run({ tendencyKey: KEY, feedback: "reject" }, c);
    expect(r.ok).toBe(true);
    expect(r.reviewed).toBe(true);
    expect(r.retracted).toBe(true);
    expect(c.m2.rows[0]!.decision).toBe("reject");
    expect(c.m3Update.calls[0]!.patch).toEqual({ retractedAtISO: "2026-06-15T10:00:00.000Z" });
  });

  it("entry_not_found（key 不一致）→ fail-closed・write 0", async () => {
    const c = ctx();
    const r = await run({ tendencyKey: "band:morning:non_adoption", feedback: "confirm" }, c);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("entry_not_found");
    expect(c.m2.count).toBe(0);
    expect(c.m3Insert.count).toBe(0);
    expect(c.m3Update.calls).toHaveLength(0);
  });
  it("unknown_feedback / correct without correctionKind → fail-closed", async () => {
    expect((await run({ tendencyKey: KEY, feedback: "nope" }, ctx())).reason).toBe("unknown_feedback");
    expect((await run({ tendencyKey: KEY, feedback: "correct" }, ctx())).reason).toBe("invalid_correction_kind");
  });

  it("M2 insert fail（confirm/reject）→ fail-closed・M3 触らない", async () => {
    const c = ctx();
    c.m2.setFailNext(1);
    const r = await run({ tendencyKey: KEY, feedback: "confirm" }, c);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("m2_insert_failed");
    expect(c.m3Insert.count).toBe(0);
    expect(c.m3Update.calls).toHaveLength(0);
  });

  it("**partial failure**: confirm M2 ok + M3 insert fail → modelEntryCreated:false・partialFailure 明示（old 触らない）", async () => {
    const c = ctx();
    c.m3Insert.setFailNext(1);
    const r = await run({ tendencyKey: KEY, feedback: "confirm" }, c);
    expect(r).toMatchObject({ ok: true, reviewed: true, modelEntryCreated: false, partialFailure: "model_entry_insert_failed" });
    expect(c.m2.count).toBe(1); // M2 確定（隠さない）
    expect(c.m3Update.calls).toHaveLength(0); // old は retract しない
  });
  it("**partial failure**: reject M2 ok + M3 retract fail → retracted:false・partialFailure 明示", async () => {
    const c = ctx();
    c.m3Update.setFailNext(1);
    const r = await run({ tendencyKey: KEY, feedback: "reject" }, c);
    expect(r).toMatchObject({ ok: true, reviewed: true, retracted: false, partialFailure: "m3_retract_failed" });
    expect(c.m2.count).toBe(1);
  });
});
