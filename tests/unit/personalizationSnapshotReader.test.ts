import { describe, it, expect } from "vitest";
import {
  getPersonalizationSnapshot,
  getPairPersonalizationContext,
  FAIRNESS_RECENT_WINDOW,
} from "@/lib/shared/personalization/snapshotReader";

type Result = { data: unknown[] | null; error: { message: string } | null };

/**
 * structural fake client。select チェーンのみを実装し、呼ばれたメソッド名を記録する。
 * write 系メソッド（insert/update/delete/upsert）は**そもそも存在しない**。
 */
function fakeClient(tables: Record<string, Result>, opts: { throwOn?: string } = {}) {
  const calls: string[] = [];
  function chain(table: string) {
    const c = {
      eq: (..._args: unknown[]) => {
        calls.push(`${table}.eq`);
        return c;
      },
      is: (..._args: unknown[]) => {
        calls.push(`${table}.is`);
        return c;
      },
      order: (..._args: unknown[]) => {
        calls.push(`${table}.order`);
        return c;
      },
      then: (resolve: (r: Result) => unknown, reject?: (e: unknown) => unknown) => {
        if (opts.throwOn === table) {
          return Promise.reject(new Error("boom")).then(resolve, reject);
        }
        return Promise.resolve(tables[table] ?? { data: [], error: null }).then(resolve, reject);
      },
    };
    return c;
  }
  const client = {
    from: (table: string) => {
      calls.push(`${table}.from`);
      return {
        select: (_cols: string) => {
          calls.push(`${table}.select`);
          return chain(table);
        },
      };
    },
  };
  return { client, calls };
}

const axisRow = (axisId: string, score: number, confidence: number | null, createdAt: string) => ({
  axis_id: axisId,
  score,
  confidence,
  created_at: createdAt,
});

describe("getPersonalizationSnapshot", () => {
  it("軸ごと最新 1 件を採用し、未知 axis_id は除外、confidence NULL は 0", async () => {
    const { client } = fakeClient({
      stargazer_axis_snapshots: {
        data: [
          axisRow("cautious_vs_bold", -0.8, 0.5, "2026-06-01T00:00:00Z"),
          axisRow("cautious_vs_bold", 0.6, 0.9, "2026-06-10T00:00:00Z"), // 最新
          axisRow("not_a_real_axis", 1, 1, "2026-06-10T00:00:00Z"), // 未知 → 除外
          axisRow("plan_vs_spontaneous", -0.4, null, "2026-06-05T00:00:00Z"), // conf NULL → 0
        ],
        error: null,
      },
      stargazer_alter_growth: { data: [], error: null },
    });
    const s = await getPersonalizationSnapshot(client, "u1", "2026-06-12T09:00:00Z");
    expect(s).not.toBeNull();
    expect(s!.userId).toBe("u1");
    expect(s!.asOf).toBe("2026-06-12T09:00:00Z");
    expect(s!.axes.cautious_vs_bold).toEqual({
      score: 0.6,
      confidence: 0.9,
      observedAt: "2026-06-10T00:00:00Z",
    });
    expect(s!.axes.plan_vs_spontaneous!.confidence).toBe(0);
    expect(Object.keys(s!.axes)).toHaveLength(2);
  });

  it("score の clamp（範囲外 → -1..1）と string 数値の正規化", async () => {
    const { client } = fakeClient({
      stargazer_axis_snapshots: {
        data: [axisRow("introvert_vs_extrovert", 7 as unknown as number, "0.500" as unknown as number, "2026-06-10T00:00:00Z")],
        error: null,
      },
      stargazer_alter_growth: { data: [], error: null },
    });
    const s = await getPersonalizationSnapshot(client, "u1", "2026-06-12T09:00:00Z");
    expect(s!.axes.introvert_vs_extrovert).toMatchObject({ score: 1, confidence: 0.5 });
  });

  it("growth 行から hdm を構築（phase clamp 0..5・trust は raw passthrough）、行なしは hdm null", async () => {
    const { client } = fakeClient({
      stargazer_axis_snapshots: { data: [], error: null },
      stargazer_alter_growth: {
        data: [
          {
            hdm_phase_state: { currentPhase: 7 },
            trust_level: 0.42,
            updated_at: "2026-06-10T00:00:00Z",
          },
        ],
        error: null,
      },
    });
    const s = await getPersonalizationSnapshot(client, "u1", "2026-06-12T09:00:00Z");
    expect(s!.hdm).toEqual({ currentPhase: 5, trustLevelRaw: 0.42 });

    const { client: c2 } = fakeClient({
      stargazer_axis_snapshots: { data: [], error: null },
      stargazer_alter_growth: { data: [], error: null },
    });
    const s2 = await getPersonalizationSnapshot(c2, "u1", "2026-06-12T09:00:00Z");
    expect(s2!.hdm).toBeNull();
  });

  it("観測ゼロでも null ではなく空 snapshot（axes 空 / dynamicState・decisionMeta は null 固定）", async () => {
    const { client } = fakeClient({
      stargazer_axis_snapshots: { data: [], error: null },
      stargazer_alter_growth: { data: [], error: null },
    });
    const s = await getPersonalizationSnapshot(client, "u1", "2026-06-12T09:00:00Z");
    expect(s).not.toBeNull();
    expect(s!.axes).toEqual({});
    expect(s!.dynamicState).toBeNull();
    expect(s!.decisionMeta).toBeNull();
  });

  it("query error / 例外は throw せず null", async () => {
    const { client } = fakeClient({
      stargazer_axis_snapshots: { data: null, error: { message: "rls" } },
      stargazer_alter_growth: { data: [], error: null },
    });
    expect(await getPersonalizationSnapshot(client, "u1", "2026-06-12T09:00:00Z")).toBeNull();

    const { client: c2 } = fakeClient(
      {
        stargazer_axis_snapshots: { data: [], error: null },
        stargazer_alter_growth: { data: [], error: null },
      },
      { throwOn: "stargazer_axis_snapshots" },
    );
    expect(await getPersonalizationSnapshot(c2, "u1", "2026-06-12T09:00:00Z")).toBeNull();
  });

  it("read-only 証明: 呼ばれるのは from/select/eq/is/order のみ", async () => {
    const { client, calls } = fakeClient({
      stargazer_axis_snapshots: { data: [], error: null },
      stargazer_alter_growth: { data: [], error: null },
    });
    await getPersonalizationSnapshot(client, "u1", "2026-06-12T09:00:00Z");
    const methods = new Set(calls.map((c) => c.split(".")[1]));
    expect([...methods].sort()).toEqual(["eq", "from", "is", "order", "select"].filter((m) => methods.has(m)));
    for (const m of methods) {
      expect(["from", "select", "eq", "is", "order"]).toContain(m);
    }
  });
});

describe("getPairPersonalizationContext", () => {
  const pairRow = (state: string, onboardedAt: string | null) => ({
    id: "p1",
    state,
    onboarded_at: onboardedAt,
  });
  const ledgerRow = (bias: number, decidedAt: string) => ({ bias_score: bias, decided_at: decidedAt });

  it("enabled = state 'enabled' かつ onboarded_at 非 null", async () => {
    const { client } = fakeClient({
      coalter_pair_states: { data: [pairRow("enabled", "2026-06-01T00:00:00Z")], error: null },
      coalter_fairness_ledger: { data: [], error: null },
    });
    const ctx = await getPairPersonalizationContext(client, "p1");
    expect(ctx!.enabled).toBe(true);
    expect(ctx!.partnerSnapshot).toBeNull(); // M2-A 固定

    const { client: c2 } = fakeClient({
      coalter_pair_states: { data: [pairRow("enabled", null)], error: null },
      coalter_fairness_ledger: { data: [], error: null },
    });
    expect((await getPairPersonalizationContext(c2, "p1"))!.enabled).toBe(false);
  });

  it("pair 行が見えない（RLS 非メンバー / 不在）→ null", async () => {
    const { client } = fakeClient({
      coalter_pair_states: { data: [], error: null },
      coalter_fairness_ledger: { data: [], error: null },
    });
    expect(await getPairPersonalizationContext(client, "p1")).toBeNull();
  });

  it("currentBias は直近 10 行の平均（古い行は除外・clamp あり）", async () => {
    const rows = [
      ledgerRow(-1, "2026-05-01T00:00:00Z"), // window 外
      ledgerRow(-1, "2026-05-02T00:00:00Z"), // window 外
      ...Array.from({ length: FAIRNESS_RECENT_WINDOW }, (_, i) =>
        ledgerRow(0.5, `2026-06-0${Math.min(i + 1, 9)}T0${i}:00:00Z`),
      ),
    ];
    const { client } = fakeClient({
      coalter_pair_states: { data: [pairRow("enabled", "2026-06-01T00:00:00Z")], error: null },
      coalter_fairness_ledger: { data: rows, error: null },
    });
    const ctx = await getPairPersonalizationContext(client, "p1");
    expect(ctx!.fairness.rows).toHaveLength(12);
    expect(ctx!.fairness.currentBias).toBeCloseTo(0.5, 5);
  });

  it("ledger 行ゼロ → currentBias 0 / query error → null", async () => {
    const { client } = fakeClient({
      coalter_pair_states: { data: [pairRow("pending_consent", null)], error: null },
      coalter_fairness_ledger: { data: [], error: null },
    });
    const ctx = await getPairPersonalizationContext(client, "p1");
    expect(ctx!.fairness.currentBias).toBe(0);
    expect(ctx!.enabled).toBe(false);

    const { client: c2 } = fakeClient({
      coalter_pair_states: { data: [pairRow("enabled", "2026-06-01T00:00:00Z")], error: null },
      coalter_fairness_ledger: { data: null, error: { message: "x" } },
    });
    expect(await getPairPersonalizationContext(c2, "p1")).toBeNull();
  });
});
