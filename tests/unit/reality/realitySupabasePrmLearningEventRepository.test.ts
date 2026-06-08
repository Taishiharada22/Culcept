/**
 * A1-7-16 Supabase PRM Learning Event Repository — mock client tests（**実 DB 接続なし・insert 実行 0**）。
 *   1) insert payload = mapper 済 row + user_id（injected）・table=prm_learning_events。
 *   2) user_id が injected auth user から入る・service_role 非前提（user-RLS client 注入）。
 *   3) raw/seedRef/utterance/personality/trait/fixed_preference が payload に存在しない・return に UUID を出さない。
 *   4) insert success / insert failure(error) / auth-network 例外（throw·reject）の **fail-open**（throw せず {ok:false}）。
 *   5) 空 rows は insert 呼ばず {ok:true,inserted:0}。Date.now 直呼びなし。実 Supabase 接続 0（mock）。
 */
import { describe, it, expect } from "vitest";
import { toDryRunLearningEvent, type CandidateActionContext } from "@/lib/plan/reality/learning/dry-run-learning-event";
import { toPrmLearningEventInsertRow } from "@/lib/plan/reality/learning/prm-learning-event-insert";
import {
  createSupabasePrmLearningEventRepository,
  PRM_LEARNING_EVENTS_TABLE,
  type PrmLearningEventWriteClient,
} from "@/lib/plan/reality/learning/supabase-prm-learning-event-repository";

const USER = "99999999-9999-4999-8999-999999999999";
const OTHER_UUID = "11111111-1111-4111-8111-111111111111";
const HANDLE = "c1:" + "a".repeat(64);
const CAPTURED = "2026-06-15T09:05:00.000Z";
const ACTED = "2026-06-15T09:00:00.000Z";

function ctx(p: Partial<CandidateActionContext> = {}): CandidateActionContext {
  return { handle: HANDLE, date: "2026-06-15", band: "afternoon", confidenceBand: "high", durationMin: 60, evidenceSource: "seed_explicit", ...p };
}
function row(action: "accept" | "dismiss" | "later" = "accept") {
  return toPrmLearningEventInsertRow(toDryRunLearningEvent(ctx(), action, ACTED), { capturedAtISO: CAPTURED });
}

type Mode = { error?: { message: string } | null; throwSync?: boolean; reject?: boolean };
function mockWriteClient(mode: Mode = {}) {
  const calls: { table: string; payload: readonly Record<string, unknown>[] }[] = [];
  const client: PrmLearningEventWriteClient = {
    from(table: string) {
      return {
        insert(rows: readonly Record<string, unknown>[]) {
          calls.push({ table, payload: rows });
          if (mode.throwSync) throw new Error("auth context invalid"); // 同期例外（auth）
          if (mode.reject) return Promise.reject(new Error("network down")); // 非同期 reject（network）
          return Promise.resolve({ error: mode.error ?? null });
        },
      };
    },
  };
  return { client, calls };
}

describe("A1-7-16 createSupabasePrmLearningEventRepository — insert payload / user_id / 非保存", () => {
  it("insert success → {ok,inserted=N}・table=prm_learning_events・payload=row+user_id", async () => {
    const { client, calls } = mockWriteClient();
    const repo = createSupabasePrmLearningEventRepository(client, USER);
    const res = await repo.insert([row("accept"), row("dismiss")]);
    expect(res).toEqual({ ok: true, inserted: 2 });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.table).toBe(PRM_LEARNING_EVENTS_TABLE);
    expect(calls[0]!.payload).toHaveLength(2);
    for (const p of calls[0]!.payload) {
      expect(p.user_id).toBe(USER); // injected auth user（RLS WITH CHECK と一致）
      expect(p.handle).toBe(HANDLE); // mapper row が保持される
    }
  });

  it("user_id は injected userId（他人 id を載せない）", async () => {
    const { client, calls } = mockWriteClient();
    await createSupabasePrmLearningEventRepository(client, USER).insert([row()]);
    expect(calls[0]!.payload[0]!.user_id).toBe(USER);
    expect(JSON.stringify(calls[0]!.payload)).not.toContain(OTHER_UUID);
  });

  it("payload に raw/seedRef/utterance/personality/trait/fixed_preference/certainty/hypotheses が存在しない", async () => {
    const { client, calls } = mockWriteClient();
    await createSupabasePrmLearningEventRepository(client, USER).insert([row("accept"), row("later")]);
    const json = JSON.stringify(calls[0]!.payload);
    expect(json).not.toMatch(/raw|seed_?ref|source_ref|utterance|発話/i);
    expect(json).not.toMatch(/certainty|hypothes|assertsPreference|sourceLabel/i);
    expect(json).not.toMatch(/trait|fixed_preference|personality|性格[はがを的だ]/);
    expect(json).not.toMatch(/嫌い|dislike|negative|hate/i);
    // payload の各 key は M1 列 + user_id のみ
    for (const p of calls[0]!.payload) {
      expect(Object.keys(p).sort()).toEqual(
        ["acted_at", "action", "band", "captured_at", "confidence_band", "desired_date", "duration_min", "expires_at", "handle", "signal", "source_kind", "user_id"].sort()
      );
    }
  });

  it("return は count/status のみ・UUID を出さない", async () => {
    const { client } = mockWriteClient();
    const res = await createSupabasePrmLearningEventRepository(client, USER).insert([row()]);
    expect(Object.keys(res).sort()).toEqual(["inserted", "ok"]);
    expect(JSON.stringify(res)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i); // UUID を返さない
  });
});

describe("A1-7-16 fail-open — error / 例外 / reject で throw せず {ok:false}", () => {
  it("insert error → {ok:false,inserted:0}（throw しない）", async () => {
    const { client } = mockWriteClient({ error: { message: "db error detail（露出しない）" } });
    const res = await createSupabasePrmLearningEventRepository(client, USER).insert([row()]);
    expect(res).toEqual({ ok: false, inserted: 0 });
    expect(JSON.stringify(res)).not.toContain("db error detail"); // error detail を return に出さない
  });

  it("auth 同期例外 → {ok:false}（fail-open・user action を壊さない）", async () => {
    const { client } = mockWriteClient({ throwSync: true });
    let threw = false;
    let res;
    try {
      res = await createSupabasePrmLearningEventRepository(client, USER).insert([row()]);
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
    expect(res).toEqual({ ok: false, inserted: 0 });
  });

  it("network reject → {ok:false}（fail-open）", async () => {
    const { client } = mockWriteClient({ reject: true });
    const res = await createSupabasePrmLearningEventRepository(client, USER).insert([row()]);
    expect(res).toEqual({ ok: false, inserted: 0 });
  });

  it("空 rows → insert 呼ばず {ok:true,inserted:0}", async () => {
    const { client, calls } = mockWriteClient();
    const res = await createSupabasePrmLearningEventRepository(client, USER).insert([]);
    expect(res).toEqual({ ok: true, inserted: 0 });
    expect(calls).toHaveLength(0); // 実 insert 0
  });
});
