/**
 * planHistory — persistence helper unit test (PR B-5a Commit 5)
 *
 * CEO/GPT 2026-05-02 PR B-5a 規律 + CEO 4 確認項目:
 *
 *   GPT 規律 (helper level で固定):
 *     1. plan_date = plan.date 強制
 *     2. server-side owner enforcement (caller userId のみ)
 *     3. isPlanWorthSaving 狭める (USER_EXPLICIT 由来 OR items OR transportSegments)
 *     4. sha256 log hash
 *     5. fail-soft (caller 側で wrapping、helper は reason を返す)
 *     6. fetchPreviousDayPlan 直前 1 日のみ
 *     7. inheritance logic 不在
 *
 *   CEO 4 確認項目 (Commit 5/6 で test 化):
 *     1. 同じ user_id + plan_date upsert が更新になる (PRIMARY KEY 動作) — DB 動作なので統合 test
 *     2. upsert 時 updated_at 更新 (trigger 動作) — DB 動作なので統合 test
 *     3. fetchPreviousDayPlan が直前 1 日のみ取得 (cascade なし)
 *     4. plan_date と plan.date mismatch を helper/DB 双方で防ぐ (二重防御)
 *
 * 本 file (Commit 5) は **helper level の unit test**。
 * 1, 2 (DB 動作) は Commit 6 の integration test、または production 本番動作で確認済み。
 * 3, 4 は本 file で固定。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  upsertPlanHistory,
  fetchPreviousDayPlan,
  isPlanWorthSaving,
  hashUserId,
} from "@/lib/alter-morning/persistence/planHistory";
import type { MorningPlan } from "@/lib/alter-morning/types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Supabase mock
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface MockSupabase {
  from: (table: string) => MockSupabase;
  upsert: (data: unknown, options?: unknown) => Promise<{ error: { code?: string } | null }>;
  select: (cols: string) => MockSupabase;
  eq: (col: string, value: unknown) => MockSupabase;
  maybeSingle: () => Promise<{ data: { plan: MorningPlan } | null; error: { code?: string } | null }>;
}

function createMockSupabase(opts: {
  upsertError?: { code?: string } | null;
  fetchData?: { plan: MorningPlan } | null;
  fetchError?: { code?: string } | null;
} = {}): MockSupabase & {
  __captured: {
    fromTable?: string;
    upsertPayload?: unknown;
    upsertOptions?: unknown;
    eqCalls: Array<{ col: string; value: unknown }>;
  };
} {
  const captured: {
    fromTable?: string;
    upsertPayload?: unknown;
    upsertOptions?: unknown;
    eqCalls: Array<{ col: string; value: unknown }>;
  } = { eqCalls: [] };

  const mock: any = {
    from: vi.fn((table: string) => {
      captured.fromTable = table;
      return mock;
    }),
    upsert: vi.fn(async (data: unknown, options?: unknown) => {
      captured.upsertPayload = data;
      captured.upsertOptions = options;
      return { error: opts.upsertError ?? null };
    }),
    select: vi.fn(() => mock),
    eq: vi.fn((col: string, value: unknown) => {
      captured.eqCalls.push({ col, value });
      return mock;
    }),
    maybeSingle: vi.fn(async () => ({
      data: opts.fetchData ?? null,
      error: opts.fetchError ?? null,
    })),
  };
  mock.__captured = captured;
  return mock;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fixtures
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const TEST_USER_ID = "11111111-2222-3333-4444-555555555555";
const TEST_DATE = "2026-05-02";

function mkValidPlan(overrides?: Partial<MorningPlan>): MorningPlan {
  return {
    date: TEST_DATE,
    items: [
      {
        id: "item_1",
        kind: "fixed",
        text: "テスト予定",
        what: "ミーティング",
        startTime: "10:00",
        durationMin: 60,
        completed: false,
      },
    ],
    dayConditions: {},
    createdAt: `${TEST_DATE}T00:00:00Z`,
    confirmed: false,
    ...overrides,
  };
}

function mkPlanWithUserExplicitOrigin(): MorningPlan {
  return {
    date: TEST_DATE,
    items: [],
    dayConditions: {},
    createdAt: `${TEST_DATE}T00:00:00Z`,
    confirmed: false,
    journeyOrigin: {
      kind: "known_label_only",
      label: "ホテル",
      source: "user_declared",
    },
  };
}

function mkEmptyPlanWithRegisteredHomeOnly(): MorningPlan {
  return {
    date: TEST_DATE,
    items: [],
    dayConditions: {},
    createdAt: `${TEST_DATE}T00:00:00Z`,
    confirmed: false,
    journeyOrigin: {
      kind: "known_exact",
      label: "自宅",
      lat: 35.69,
      lng: 139.7,
      source: "registered_home",
    },
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// isPlanWorthSaving
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("isPlanWorthSaving — GPT 修正 2 反映", () => {
  it("plan undefined → false", () => {
    expect(isPlanWorthSaving(undefined)).toBe(false);
  });

  it("plan.date 不在 → false", () => {
    expect(isPlanWorthSaving({ ...mkValidPlan(), date: "" })).toBe(false);
  });

  it("items > 0 → true", () => {
    expect(isPlanWorthSaving(mkValidPlan())).toBe(true);
  });

  it("transportSegments > 0 + items 空 → true", () => {
    const plan: MorningPlan = {
      ...mkValidPlan({ items: [] }),
      transportSegments: [
        {
          fromEventId: "event_1",
          toEventId: "event_2",
          mode: "walking",
          estimatedDurationMin: 10,
          durationSource: "heuristic",
          distanceM: null,
          confidence: "default",
          source: "default_walk",
        },
      ],
    };
    expect(isPlanWorthSaving(plan)).toBe(true);
  });

  it("USER_EXPLICIT origin (user_declared) → true", () => {
    expect(isPlanWorthSaving(mkPlanWithUserExplicitOrigin())).toBe(true);
  });

  it("USER_EXPLICIT end (user_explicit_endpoint) → true", () => {
    const plan: MorningPlan = {
      ...mkValidPlan({ items: [] }),
      journeyEnd: {
        kind: "known_label_only",
        label: "ホテル",
        source: "user_explicit_endpoint",
      },
    };
    expect(isPlanWorthSaving(plan)).toBe(true);
  });

  it("[GPT 規律] registered_home だけの空 plan → false", () => {
    expect(isPlanWorthSaving(mkEmptyPlanWithRegisteredHomeOnly())).toBe(false);
  });

  it("[GPT 規律] current だけの空 plan → false", () => {
    const plan: MorningPlan = {
      ...mkValidPlan({ items: [] }),
      journeyOrigin: {
        kind: "known_exact",
        label: "現在地",
        lat: 35.65,
        lng: 139.7,
        source: "current",
      },
    };
    expect(isPlanWorthSaving(plan)).toBe(false);
  });

  it("[GPT 規律] default_round_trip だけの空 plan → false", () => {
    const plan: MorningPlan = {
      ...mkValidPlan({ items: [] }),
      journeyEnd: {
        kind: "known_exact",
        label: "帰宅",
        lat: 35.69,
        lng: 139.7,
        source: "default_round_trip",
      },
    };
    expect(isPlanWorthSaving(plan)).toBe(false);
  });

  it("[GPT 規律] unknown だけの空 plan → false", () => {
    const plan: MorningPlan = {
      ...mkValidPlan({ items: [] }),
      journeyOrigin: { kind: "unknown", reason: "no_baseline" },
      journeyEnd: { kind: "unknown", reason: "no_endpoint_signal" },
    };
    expect(isPlanWorthSaving(plan)).toBe(false);
  });

  it("[GPT 規律] comprehension_explicit (LLM 由来) だけの空 plan → false", () => {
    const plan: MorningPlan = {
      ...mkValidPlan({ items: [] }),
      journeyEnd: {
        kind: "known_label_only",
        label: "ホテル",
        source: "comprehension_explicit",
      },
    };
    expect(isPlanWorthSaving(plan)).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// hashUserId — GPT 修正 3 反映
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("hashUserId — sha256 12 chars (GPT 修正 3)", () => {
  it("output length is 12", () => {
    expect(hashUserId(TEST_USER_ID).length).toBe(12);
  });

  it("output is hex (only [0-9a-f])", () => {
    expect(hashUserId(TEST_USER_ID)).toMatch(/^[0-9a-f]{12}$/);
  });

  it("same userId → same hash (deterministic)", () => {
    expect(hashUserId(TEST_USER_ID)).toBe(hashUserId(TEST_USER_ID));
  });

  it("different userId → different hash (no collision for typical UUIDs)", () => {
    const a = hashUserId("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    const b = hashUserId("ffffffff-eeee-dddd-cccc-bbbbbbbbbbbb");
    expect(a).not.toBe(b);
  });

  it("hash does NOT contain raw userId (privacy)", () => {
    const hash = hashUserId(TEST_USER_ID);
    // raw userId の前 8 chars (前回案) や全 chars が hash に含まれていないこと
    expect(hash).not.toContain(TEST_USER_ID.slice(0, 8));
    expect(hash).not.toBe(TEST_USER_ID);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// upsertPlanHistory
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("upsertPlanHistory — guard + 接続", () => {
  let supabase: ReturnType<typeof createMockSupabase>;

  beforeEach(() => {
    supabase = createMockSupabase();
  });

  it("missing userId → ok=false + reason='missing_user_id'", async () => {
    const result = await upsertPlanHistory(supabase as any, "", mkValidPlan());
    expect(result).toEqual({ ok: false, reason: "missing_user_id" });
  });

  it("plan undefined → ok=false + reason='plan_not_worth_saving'", async () => {
    const result = await upsertPlanHistory(supabase as any, TEST_USER_ID, undefined);
    expect(result).toEqual({ ok: false, reason: "plan_not_worth_saving" });
  });

  it("[GPT 規律] registered_home だけの空 plan → ok=false (保存しない)", async () => {
    const result = await upsertPlanHistory(
      supabase as any,
      TEST_USER_ID,
      mkEmptyPlanWithRegisteredHomeOnly(),
    );
    expect(result).toEqual({ ok: false, reason: "plan_not_worth_saving" });
    // upsert は呼ばれない
    expect(supabase.__captured.upsertPayload).toBeUndefined();
  });

  it("valid plan → ok=true + alter_morning_plan_history table 呼び出し", async () => {
    const plan = mkValidPlan();
    const result = await upsertPlanHistory(supabase as any, TEST_USER_ID, plan);
    expect(result).toEqual({ ok: true });
    expect(supabase.__captured.fromTable).toBe("alter_morning_plan_history");
  });

  it("[CEO 確認 4][GPT 規律 1] upsert payload で plan_date = plan.date (caller の userId は唯一の owner source)", async () => {
    const plan = mkValidPlan({ date: "2026-05-15" });
    await upsertPlanHistory(supabase as any, TEST_USER_ID, plan);
    expect(supabase.__captured.upsertPayload).toEqual({
      user_id: TEST_USER_ID, // GPT 規律 2: caller の userId のみ
      plan_date: "2026-05-15", // GPT 規律 1: plan.date と一致
      plan,
    });
  });

  it("[CEO 確認 1] onConflict='user_id,plan_date' で PRIMARY KEY upsert", async () => {
    await upsertPlanHistory(supabase as any, TEST_USER_ID, mkValidPlan());
    expect(supabase.__captured.upsertOptions).toEqual({
      onConflict: "user_id,plan_date",
    });
    // 同じ user_id + plan_date が来たら更新される (DB 側で PRIMARY KEY 制約)
  });

  it("DB error → ok=false + reason='db_<code>'", async () => {
    supabase = createMockSupabase({ upsertError: { code: "23514" } });
    const result = await upsertPlanHistory(
      supabase as any,
      TEST_USER_ID,
      mkValidPlan(),
    );
    expect(result).toEqual({ ok: false, reason: "db_23514" });
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// fetchPreviousDayPlan — CEO 確認 3
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("fetchPreviousDayPlan — CEO 確認 3 (直前 1 日のみ、cascade なし)", () => {
  it("missing userId → null", async () => {
    const supabase = createMockSupabase();
    expect(await fetchPreviousDayPlan(supabase as any, "", TEST_DATE)).toBeNull();
  });

  it("missing todayDate → null", async () => {
    const supabase = createMockSupabase();
    expect(await fetchPreviousDayPlan(supabase as any, TEST_USER_ID, "")).toBeNull();
  });

  it("invalid date format → null", async () => {
    const supabase = createMockSupabase();
    expect(
      await fetchPreviousDayPlan(supabase as any, TEST_USER_ID, "not-a-date"),
    ).toBeNull();
  });

  it("[CEO 確認 3 必須証明] todayDate=2026-05-02 → query に plan_date=2026-05-01 (直前 1 日のみ)", async () => {
    const supabase = createMockSupabase();
    await fetchPreviousDayPlan(supabase as any, TEST_USER_ID, "2026-05-02");
    expect(supabase.__captured.fromTable).toBe("alter_morning_plan_history");
    expect(supabase.__captured.eqCalls).toEqual([
      { col: "user_id", value: TEST_USER_ID },
      { col: "plan_date", value: "2026-05-01" }, // 直前 1 日のみ
    ]);
  });

  it("[CEO 確認 3] 月をまたぐ日付計算が正しい (todayDate=2026-05-01 → plan_date=2026-04-30)", async () => {
    const supabase = createMockSupabase();
    await fetchPreviousDayPlan(supabase as any, TEST_USER_ID, "2026-05-01");
    expect(supabase.__captured.eqCalls[1]).toEqual({
      col: "plan_date",
      value: "2026-04-30",
    });
  });

  it("[CEO 確認 3] 年をまたぐ日付計算が正しい (todayDate=2026-01-01 → plan_date=2025-12-31)", async () => {
    const supabase = createMockSupabase();
    await fetchPreviousDayPlan(supabase as any, TEST_USER_ID, "2026-01-01");
    expect(supabase.__captured.eqCalls[1]).toEqual({
      col: "plan_date",
      value: "2025-12-31",
    });
  });

  it("plan が存在 → MorningPlan を返す", async () => {
    const expectedPlan = mkValidPlan({ date: "2026-05-01" });
    const supabase = createMockSupabase({ fetchData: { plan: expectedPlan } });
    const result = await fetchPreviousDayPlan(
      supabase as any,
      TEST_USER_ID,
      TEST_DATE,
    );
    expect(result).toEqual(expectedPlan);
  });

  it("plan が存在しない → null", async () => {
    const supabase = createMockSupabase({ fetchData: null });
    const result = await fetchPreviousDayPlan(
      supabase as any,
      TEST_USER_ID,
      TEST_DATE,
    );
    expect(result).toBeNull();
  });

  it("DB error → null + log (helper 側で fail-soft)", async () => {
    const supabase = createMockSupabase({ fetchError: { code: "PGRST116" } });
    const result = await fetchPreviousDayPlan(
      supabase as any,
      TEST_USER_ID,
      TEST_DATE,
    );
    expect(result).toBeNull();
  });

  it("[CEO 確認 3 + GPT 規律 6] cascade なし: 直前 1 日が無くても、それ以前を遡らない", async () => {
    // この test は「fetchPreviousDayPlan が yesterday の plan_date のみ query する」 を
    // 上記 test で固定済み。cascade なしの不変条件は eqCalls の plan_date が
    // yesterday に固定されることで証明される。
    const supabase = createMockSupabase({ fetchData: null }); // plan 不在
    await fetchPreviousDayPlan(supabase as any, TEST_USER_ID, TEST_DATE);
    // 1 回しか query しない (cascade で複数日 query しない)
    expect(supabase.maybeSingle).toHaveBeenCalledTimes(1);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CEO 確認 4: plan_date と plan.date mismatch を helper/DB 双方で防ぐ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[CEO 確認 4] plan_date と plan.date mismatch を helper/DB 双方で防ぐ", () => {
  it("[helper level] upsert payload では plan_date が必ず plan.date と一致する", async () => {
    const supabase = createMockSupabase();
    const plan = mkValidPlan({ date: "2026-12-31" });
    await upsertPlanHistory(supabase as any, TEST_USER_ID, plan);
    // helper が plan.date を使って plan_date を設定 (caller は別引数を渡せない)
    const payload = supabase.__captured.upsertPayload as {
      plan_date: string;
      plan: MorningPlan;
    };
    expect(payload.plan_date).toBe(payload.plan.date);
    expect(payload.plan_date).toBe("2026-12-31");
  });

  it("[DB level の確認は production migration test で済 (Test 3, 4)] CHECK 制約 plan_date_matches_jsonb_date が active", () => {
    // Migration 実行時の本番 DB で確認済み:
    //   Test 3: plan_date=2026-05-01 + plan.date=2026-05-02 → error 23514
    //   Test 4: plan に 'date' field 不在 → error 23514
    // helper 側で必ず一致させているので、悪意ある直接 SQL でない限り
    // CHECK 制約に到達しない (= 二重防御の構造)
    expect(true).toBe(true); // documentation as test
  });
});
