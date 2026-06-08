/**
 * A1-7-14 PRM Learning Event Insert Mapper + Repository Port/Fake — 保存契約検証（**実 DB に書かない**）。
 *   1) mapper が M1 `prm_learning_events` schema と一致する safe row を作る（列が M1 と一致）。
 *   2) raw / seedRef / utterance / personality / trait / fixed_preference / certainty / hypotheses / user_id / id が **構造的に存在しない**。
 *   3) timestamp 注入（Date.now 直呼びなし・pure deterministic）・acted_at fallback。
 *   4) fake repository で insert / idempotency（dedup）/ 失敗時 fail-open（throw でなく ok:false）を検証。
 *   5) fake は **persisted:false marker**（本物の永続化でない）。
 */
import { describe, it, expect } from "vitest";
import { toDryRunLearningEvent, type CandidateActionContext } from "@/lib/plan/reality/learning/dry-run-learning-event";
import {
  toPrmLearningEventInsertRow,
  toPrmLearningEventInsertRows,
  type PrmLearningEventInsertRow,
} from "@/lib/plan/reality/learning/prm-learning-event-insert";
import {
  FakePrmLearningEventRepository,
  insertRowIdempotencyKey,
} from "@/lib/plan/reality/learning/fake-prm-learning-event-repository";

const HANDLE = "c1:" + "a".repeat(64);
const CAPTURED = "2026-06-15T09:05:00.000Z";
const ACTED = "2026-06-15T09:00:00.000Z";
const EXPIRES = "2026-09-15T09:05:00.000Z";

function ctx(p: Partial<CandidateActionContext> = {}): CandidateActionContext {
  return { handle: HANDLE, date: "2026-06-15", band: "afternoon", confidenceBand: "high", durationMin: 60, evidenceSource: "seed_explicit", ...p };
}

// M1 `prm_learning_events` の **insert 可能列**（id=DB 生成・user_id=repository が auth.uid() で付与 → row には含めない）。
const M1_INSERT_COLUMNS = [
  "handle",
  "action",
  "signal",
  "desired_date",
  "band",
  "confidence_band",
  "duration_min",
  "source_kind",
  "acted_at",
  "captured_at",
  "expires_at",
].sort();

describe("A1-7-14 toPrmLearningEventInsertRow — M1 schema と一致する safe row", () => {
  it("row の列が M1 insert 列と完全一致（過不足なし・user_id/id を含まない）", () => {
    const e = toDryRunLearningEvent(ctx(), "accept", ACTED);
    const row = toPrmLearningEventInsertRow(e, { capturedAtISO: CAPTURED, expiresAtISO: EXPIRES });
    expect(Object.keys(row).sort()).toEqual(M1_INSERT_COLUMNS);
    expect(row).not.toHaveProperty("user_id"); // repository が付与（mapper は持たない）
    expect(row).not.toHaveProperty("id"); // DB 生成
  });

  it("値が event の context を正しく写す（M1 CHECK enum と一致）", () => {
    const e = toDryRunLearningEvent(ctx({ band: "evening", confidenceBand: "medium", durationMin: 30, evidenceSource: "correction" }), "dismiss", ACTED);
    const row = toPrmLearningEventInsertRow(e, { capturedAtISO: CAPTURED });
    expect(row.handle).toBe(HANDLE);
    expect(row.action).toBe("dismiss"); // accept/dismiss/later
    expect(row.signal).toBe("non_adoption"); // adoption/non_adoption/deferral
    expect(row.desired_date).toBe("2026-06-15");
    expect(row.band).toBe("evening"); // morning/afternoon/evening
    expect(row.confidence_band).toBe("medium"); // high/medium/low
    expect(row.duration_min).toBe(30);
    expect(row.source_kind).toBe("correction"); // seed_explicit/correction
  });

  it("nullable context（band/desired_date/duration）を null で通す", () => {
    const e = toDryRunLearningEvent(ctx({ band: undefined, date: undefined, durationMin: undefined, confidenceBand: "low" }), "later", ACTED);
    const row = toPrmLearningEventInsertRow(e, { capturedAtISO: CAPTURED });
    expect(row.band).toBeNull();
    expect(row.desired_date).toBeNull();
    expect(row.duration_min).toBeNull();
    expect(row.confidence_band).toBe("low");
    expect(row.signal).toBe("deferral");
  });
});

describe("A1-7-14 構造的非保存 — raw/seedRef/personality/derived を生成不能", () => {
  it("row に raw/seedRef/utterance/personality/trait/fixed_preference/certainty/hypotheses が存在しない", () => {
    for (const a of ["accept", "dismiss", "later"] as const) {
      const e = toDryRunLearningEvent(ctx(), a, ACTED);
      const row = toPrmLearningEventInsertRow(e, { capturedAtISO: CAPTURED, expiresAtISO: EXPIRES });
      const json = JSON.stringify(row);
      expect(json).not.toMatch(/raw|seed_?ref|source_ref|utterance|発話/i);
      expect(json).not.toMatch(/certainty|hypothes|primary_?hypothesis/i); // derived はここに保存しない
      expect(json).not.toMatch(/trait|fixed_preference|性格[はがを的だ]/);
      expect(json).not.toMatch(/嫌い|dislike|negative|hate/i); // 評価語を含まない
      // event 由来の派生 field が漏れていない
      expect(row).not.toHaveProperty("hypotheses");
      expect(row).not.toHaveProperty("certainty");
      expect(row).not.toHaveProperty("assertsPreference");
      expect(row).not.toHaveProperty("sourceLabel");
    }
  });
});

describe("A1-7-14 timestamp 注入 — Date.now 不使用・acted_at fallback", () => {
  it("captured_at は注入値・expires_at は注入値（未指定は null）", () => {
    const e = toDryRunLearningEvent(ctx(), "accept", ACTED);
    const withTtl = toPrmLearningEventInsertRow(e, { capturedAtISO: CAPTURED, expiresAtISO: EXPIRES });
    expect(withTtl.captured_at).toBe(CAPTURED);
    expect(withTtl.expires_at).toBe(EXPIRES);
    const noTtl = toPrmLearningEventInsertRow(e, { capturedAtISO: CAPTURED });
    expect(noTtl.expires_at).toBeNull(); // 無期限（policy で後付け可）
  });

  it("acted_at は event.actedAtISO・無ければ capturedAtISO に fallback（NOT NULL を保証）", () => {
    const withActed = toPrmLearningEventInsertRow(toDryRunLearningEvent(ctx(), "accept", ACTED), { capturedAtISO: CAPTURED });
    expect(withActed.acted_at).toBe(ACTED);
    const noActed = toPrmLearningEventInsertRow(toDryRunLearningEvent(ctx(), "accept", null), { capturedAtISO: CAPTURED });
    expect(noActed.acted_at).toBe(CAPTURED); // fallback（null にならない）
  });

  it("pure deterministic（同入力→同出力・Date.now/乱数に依存しない）", () => {
    const e = toDryRunLearningEvent(ctx(), "dismiss", ACTED);
    const a = toPrmLearningEventInsertRow(e, { capturedAtISO: CAPTURED, expiresAtISO: EXPIRES });
    const b = toPrmLearningEventInsertRow(e, { capturedAtISO: CAPTURED, expiresAtISO: EXPIRES });
    expect(a).toEqual(b);
  });

  it("toPrmLearningEventInsertRows は順序保持", () => {
    const rows = toPrmLearningEventInsertRows([
      { event: toDryRunLearningEvent(ctx(), "accept", ACTED), injection: { capturedAtISO: CAPTURED } },
      { event: toDryRunLearningEvent(ctx(), "dismiss", ACTED), injection: { capturedAtISO: CAPTURED } },
      { event: toDryRunLearningEvent(ctx(), "later", ACTED), injection: { capturedAtISO: CAPTURED } },
    ]);
    expect(rows.map((r) => r.action)).toEqual(["accept", "dismiss", "later"]);
  });
});

describe("A1-7-14 FakePrmLearningEventRepository — insert / idempotency / fail-open / marker", () => {
  function row(over: Partial<PrmLearningEventInsertRow> = {}): PrmLearningEventInsertRow {
    return {
      ...toPrmLearningEventInsertRow(toDryRunLearningEvent(ctx(), "accept", ACTED), { capturedAtISO: CAPTURED }),
      ...over,
    };
  }

  it("marker: 本物の永続化でない（persisted:false / kind）", () => {
    const repo = new FakePrmLearningEventRepository();
    expect(repo.persisted).toBe(false);
    expect(repo.kind).toBe("fake_prm_learning_event_repository");
  });

  it("insert で row が保存され count が増える", async () => {
    const repo = new FakePrmLearningEventRepository();
    const res = await repo.insert([row(), row({ handle: "c2:" + "b".repeat(64) })]);
    expect(res.ok).toBe(true);
    expect(res.inserted).toBe(2);
    expect(repo.count).toBe(2);
  });

  it("idempotency: 同 (handle,action,acted_at) の再 insert は inserted 0（dedup）", async () => {
    const repo = new FakePrmLearningEventRepository();
    const r = row();
    expect((await repo.insert([r])).inserted).toBe(1);
    expect((await repo.insert([r])).inserted).toBe(0); // 再 fire は冪等
    expect(repo.count).toBe(1);
  });

  it("再 action（acted_at 異なる）は別 row として正しく保存される", async () => {
    const repo = new FakePrmLearningEventRepository();
    await repo.insert([row({ acted_at: ACTED })]);
    await repo.insert([row({ acted_at: "2026-06-15T18:00:00.000Z" })]); // 後で再 action
    expect(repo.count).toBe(2);
  });

  it("dedup key は handle::action::acted_at", () => {
    const r = row();
    expect(insertRowIdempotencyKey(r)).toBe(`${r.handle}::${r.action}::${r.acted_at}`);
  });

  it("失敗時 fail-open: setFailNext は throw でなく {ok:false, inserted:0} を返す", async () => {
    const repo = new FakePrmLearningEventRepository();
    repo.setFailNext(1);
    let threw = false;
    let res;
    try {
      res = await repo.insert([row()]);
    } catch {
      threw = true;
    }
    expect(threw).toBe(false); // user action を壊さない（throw しない）
    expect(res).toEqual({ ok: false, inserted: 0 });
    expect(repo.count).toBe(0); // 失敗時は保存しない
    // 次回は成功（fail は 1 回だけ）
    expect((await repo.insert([row()])).ok).toBe(true);
  });
});
