/**
 * liveCollector (1a wiring proof) unit test.
 *
 * 目的:
 *   - talk_messages のみを読む最小 collector が pure に動くことを固定
 *   - CollectorMeta が queryCount=1 / sources=["talk_messages"] を正しく返す
 *   - 呼び元（invoke route）が受け取る bundle が runUnderstanding() の
 *     入力として型的に通ること（person/relationship は null/空で OK）
 *
 * 1a スコープなので「意味ある todayReading」は問わない。本 test の関心は
 * 経路・shape・read-only 性（1 query のみ）の 3 点。
 */

import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { collectLiveBundle } from "@/lib/coalter/understanding/liveCollector";
import { runUnderstanding } from "@/lib/coalter/understanding";
import type { IsoTimestamp } from "@/lib/coalter/understanding/types";

const NOW: IsoTimestamp = "2026-04-20T12:00:00.000Z";
const USER_A = "user-a-uuid";
const USER_B = "user-b-uuid";

type TalkRow = { sender_id: string; body: string; created_at: string };

/**
 * Supabase の chain `.from(t).select(...).eq(...).order(...).limit(...)` を
 * Promise として resolve させる最小モック。他の chain は呼ばれたら fail させる。
 */
function mockSupabaseTalk(rows: TalkRow[] | Error): SupabaseClient {
  const limit = vi.fn(() =>
    rows instanceof Error
      ? Promise.resolve({ data: null, error: { message: rows.message } })
      : Promise.resolve({ data: rows, error: null }),
  );
  const order = vi.fn(() => ({ limit }));
  const eq = vi.fn(() => ({ order }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn((table: string) => {
    if (table !== "talk_messages") {
      throw new Error(`unexpected table: ${table}`);
    }
    return { select };
  });
  return { from } as unknown as SupabaseClient;
}

describe("collectLiveBundle (1a) — talk_messages のみ", () => {
  it("2 人の turn だけを拾い、senderId / body / createdAt を保つ", async () => {
    // Supabase からは ASCENDING=false (= DESC) で返る前提。collector 内で reverse() して ASC に戻す
    const rows: TalkRow[] = [
      { sender_id: USER_B, body: "何系がいい？", created_at: "2026-04-20T10:01:00.000Z" },
      { sender_id: USER_A, body: "映画決めて", created_at: "2026-04-20T10:00:00.000Z" },
    ];
    const supabase = mockSupabaseTalk(rows);
    const { bundle, meta } = await collectLiveBundle({
      supabase,
      threadId: "t-1",
      userA: USER_A,
      userB: USER_B,
      now: NOW,
    });

    expect(bundle.conversation.turns).toHaveLength(2);
    expect(bundle.conversation.turns[0].body).toBe("映画決めて");
    expect(bundle.conversation.turns[0].senderId).toBe(USER_A);
    expect(bundle.conversation.turns[1].senderId).toBe(USER_B);

    expect(meta.queryCount).toBe(1);
    expect(meta.sources).toEqual(["talk_messages"]);
  });

  it("pair 外の sender_id は除外する", async () => {
    // DESC 順（新しい方が先）で入れる
    const rows: TalkRow[] = [
      { sender_id: USER_B, body: "b says", created_at: "2026-04-20T10:02:00.000Z" },
      { sender_id: "stranger-uuid", body: "noise", created_at: "2026-04-20T10:01:00.000Z" },
      { sender_id: USER_A, body: "a says", created_at: "2026-04-20T10:00:00.000Z" },
    ];
    const supabase = mockSupabaseTalk(rows);
    const { bundle } = await collectLiveBundle({
      supabase,
      threadId: "t-1",
      userA: USER_A,
      userB: USER_B,
      now: NOW,
    });
    expect(bundle.conversation.turns.map((t) => t.body)).toEqual(["a says", "b says"]);
  });

  it("person side は全部 null/空、relationship/environmental は最小スタブ", async () => {
    const supabase = mockSupabaseTalk([]);
    const { bundle } = await collectLiveBundle({
      supabase,
      threadId: "t-empty",
      userA: USER_A,
      userB: USER_B,
      now: NOW,
    });
    expect(bundle.personA.stargazer.decisionAxes).toEqual([]);
    expect(bundle.personA.alter.trustLevel.level).toBe(0);
    expect(bundle.personA.behavioral.recentActivity).toEqual([]);
    expect(bundle.personA.context.location).toBeNull();
    expect(bundle.relationship.sharedHistory).toEqual([]);
    expect(bundle.relationship.fairnessLedger).toEqual([]);
    expect(bundle.environmental.timestamp).toBe(NOW);
    expect(bundle.environmental.weather).toBeNull();
  });

  it("Supabase error は呼び元に throw する（fail-open は呼び元責任）", async () => {
    const supabase = mockSupabaseTalk(new Error("db down"));
    await expect(
      collectLiveBundle({
        supabase,
        threadId: "t-err",
        userA: USER_A,
        userB: USER_B,
        now: NOW,
      }),
    ).rejects.toThrow(/talk_messages fetch failed/);
  });
});

describe("collectLiveBundle → runUnderstanding (1a 経路接続)", () => {
  it("最小 bundle で runUnderstanding() が outcome 判定前提を満たす結果を返す", async () => {
    const rows: TalkRow[] = [
      { sender_id: USER_A, body: "ねえ映画", created_at: "2026-04-20T10:00:00.000Z" },
    ];
    const supabase = mockSupabaseTalk(rows);
    const { bundle } = await collectLiveBundle({
      supabase,
      threadId: "t-1",
      userA: USER_A,
      userB: USER_B,
      now: NOW,
    });

    const lens = await runUnderstanding(bundle, NOW, "pair-hash");

    // 1a の構造的特性: person 側が null/空 なので source_coverage は全ゼロになる
    expect(lens.personalLenses.a.sourcedFrom.stargazer).toEqual([]);
    expect(lens.personalLenses.a.sourcedFrom.alter).toEqual([]);
    expect(lens.personalLenses.a.sourcedFrom.behavioral).toEqual([]);
    expect(lens.personalLenses.b.sourcedFrom.stargazer).toEqual([]);
    expect(lens.personalLenses.b.sourcedFrom.alter).toEqual([]);
    expect(lens.personalLenses.b.sourcedFrom.behavioral).toEqual([]);

    // lensVersion と computedAt は caller 注入値で決定論
    expect(lens.lensVersion).toBe("1.0.0");
    expect(lens.computedAt).toBe(NOW);
  });
});
