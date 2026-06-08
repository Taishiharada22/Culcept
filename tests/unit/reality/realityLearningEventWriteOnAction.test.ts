/**
 * A1-7-17 Learning Event Write On Action — route connection glue tests（**mock repository・実 DB insert 0**）。
 *   flag OFF→insert 0 / flag ON+status success→insert 1 / status failure→insert 0 / later(deferred)→insert 0 /
 *   entry 解決不能→insert 0 / repo failure(ok:false·throw)→action 不破壊（throw しない）/ payload に raw·seedRef なし /
 *   expires_at=180 日後 / injected clock（Date.now 直呼びでなく nowMs 由来・決定的）。
 */
import { describe, it, expect } from "vitest";
import {
  writeLearningEventOnAction,
  learningEventExpiresAtISO,
  LEARNING_EVENT_TTL_DAYS,
} from "@/lib/plan/reality/integration/learning-event-write-on-action";
import { deriveCandidateHandle, type RedactedActionResponse } from "@/lib/plan/reality/integration/candidate-action-handle";
import type { CandidateLifecycleEntry } from "@/lib/plan/reality/integration/candidate-lifecycle-guard";
import type { PrmLearningEventInsertRow, PrmLearningEventRepository } from "@/lib/plan/reality/learning/prm-learning-event-insert";

const SEED = "11111111-1111-4111-8111-111111111111";
const HANDLE = deriveCandidateHandle(SEED);
const NOW_MS = Date.parse("2026-06-15T09:00:00.000Z"); // 固定（Date.now でない）
const DAY_MS = 24 * 60 * 60 * 1000;

function entry(over: Partial<CandidateLifecycleEntry> = {}): CandidateLifecycleEntry {
  return {
    seedRef: SEED,
    status: "active",
    capturedAtMs: NOW_MS,
    expiresAtMs: null,
    actionShape: null,
    desiredDate: "2026-06-15",
    desiredTimeHint: "afternoon",
    durationMin: 60,
    confidence: 0.9,
    ...over,
  };
}
const RESP = {
  acceptOk: { accepted: true, reason: "accepted", reflectsToPlan: true, deferred: false } as RedactedActionResponse,
  dismissOk: { accepted: true, reason: "dismissed", reflectsToPlan: false, deferred: false } as RedactedActionResponse,
  laterDeferred: { accepted: true, reason: "deferred", reflectsToPlan: false, deferred: true } as RedactedActionResponse,
  failed: { accepted: false, reason: "status_conflict", reflectsToPlan: false, deferred: false } as RedactedActionResponse,
};

function mockRepo(mode: { fail?: boolean; throwOnInsert?: boolean } = {}) {
  const inserted: PrmLearningEventInsertRow[] = [];
  const repo: PrmLearningEventRepository = {
    async insert(rows) {
      if (mode.throwOnInsert) throw new Error("insert boom");
      if (mode.fail) return { ok: false, inserted: 0 };
      inserted.push(...rows);
      return { ok: true, inserted: rows.length };
    },
  };
  return { repo, inserted };
}

async function run(
  args: { flagEnabled: boolean; action: "accept" | "dismiss" | "later"; response: RedactedActionResponse; entries?: readonly CandidateLifecycleEntry[] },
  repo: PrmLearningEventRepository
) {
  await writeLearningEventOnAction({
    flagEnabled: args.flagEnabled,
    rawBody: { handle: HANDLE, action: args.action },
    response: args.response,
    entries: args.entries ?? [entry()],
    repository: repo,
    nowMs: NOW_MS,
  });
}

describe("A1-7-17 writeLearningEventOnAction — flag / status gating", () => {
  it("flag OFF → insert 0（既存挙動不変）", async () => {
    const { repo, inserted } = mockRepo();
    await run({ flagEnabled: false, action: "accept", response: RESP.acceptOk }, repo);
    expect(inserted).toHaveLength(0);
  });

  it("flag ON + accept success → insert 1", async () => {
    const { repo, inserted } = mockRepo();
    await run({ flagEnabled: true, action: "accept", response: RESP.acceptOk }, repo);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]!.action).toBe("accept");
    expect(inserted[0]!.signal).toBe("adoption");
  });

  it("flag ON + dismiss success → insert 1（非 deferred）", async () => {
    const { repo, inserted } = mockRepo();
    await run({ flagEnabled: true, action: "dismiss", response: RESP.dismissOk }, repo);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]!.action).toBe("dismiss");
    expect(inserted[0]!.signal).toBe("non_adoption");
  });

  it("flag ON + later(deferred) → insert 0（status transition なし）", async () => {
    const { repo, inserted } = mockRepo();
    await run({ flagEnabled: true, action: "later", response: RESP.laterDeferred }, repo);
    expect(inserted).toHaveLength(0);
  });

  it("status failure（accepted=false）→ insert 0", async () => {
    const { repo, inserted } = mockRepo();
    await run({ flagEnabled: true, action: "accept", response: RESP.failed }, repo);
    expect(inserted).toHaveLength(0);
  });

  it("entry 解決不能（handle 不一致）→ insert 0", async () => {
    const { repo, inserted } = mockRepo();
    await run({ flagEnabled: true, action: "accept", response: RESP.acceptOk, entries: [entry({ seedRef: "99999999-9999-4999-8999-999999999999" })] }, repo);
    expect(inserted).toHaveLength(0);
  });
});

describe("A1-7-17 fail-open — repo 失敗が action を壊さない", () => {
  it("repo が ok:false → throw せず完了", async () => {
    const { repo } = mockRepo({ fail: true });
    await expect(run({ flagEnabled: true, action: "accept", response: RESP.acceptOk }, repo)).resolves.toBeUndefined();
  });
  it("repo が throw → glue は throw しない（await-and-swallow）", async () => {
    const { repo } = mockRepo({ throwOnInsert: true });
    await expect(run({ flagEnabled: true, action: "accept", response: RESP.acceptOk }, repo)).resolves.toBeUndefined();
  });
});

describe("A1-7-17 payload 安全 / TTL / injected clock", () => {
  it("row payload に raw/seedRef/personality 等が存在しない（seedRef 非出）", async () => {
    const { repo, inserted } = mockRepo();
    await run({ flagEnabled: true, action: "accept", response: RESP.acceptOk }, repo);
    const json = JSON.stringify(inserted[0]);
    expect(json).not.toContain(SEED); // seedRef を出さない（handle のみ）
    expect(json).not.toMatch(/raw|seed_?ref|source_ref|utterance|発話/i);
    expect(json).not.toMatch(/certainty|hypothes|personality|trait|fixed_preference/i);
    expect(inserted[0]!.handle).toBe(HANDLE); // opaque handle
    // context が entry から写る
    expect(inserted[0]!.band).toBe("afternoon");
    expect(inserted[0]!.confidence_band).toBe("high"); // confidence 0.9 → high
    expect(inserted[0]!.duration_min).toBe(60);
    expect(inserted[0]!.source_kind).toBe("seed_explicit");
  });

  it("expires_at は 180 日後（acted/captured は nowMs 由来・決定的）", async () => {
    const { repo, inserted } = mockRepo();
    await run({ flagEnabled: true, action: "accept", response: RESP.acceptOk }, repo);
    const row = inserted[0]!;
    expect(row.acted_at).toBe("2026-06-15T09:00:00.000Z"); // injected nowMs 由来（Date.now 直呼びでない）
    expect(row.captured_at).toBe("2026-06-15T09:00:00.000Z");
    expect(Date.parse(row.expires_at!) - NOW_MS).toBe(LEARNING_EVENT_TTL_DAYS * DAY_MS); // 180 日
    expect(LEARNING_EVENT_TTL_DAYS).toBe(180);
  });

  it("learningEventExpiresAtISO は注入 nowMs から 180 日後（決定的）", () => {
    expect(Date.parse(learningEventExpiresAtISO(NOW_MS)) - NOW_MS).toBe(180 * DAY_MS);
    expect(learningEventExpiresAtISO(NOW_MS)).toBe(learningEventExpiresAtISO(NOW_MS)); // deterministic
  });
});
