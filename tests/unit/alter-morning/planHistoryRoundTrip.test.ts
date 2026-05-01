/**
 * planHistory round-trip integration test (PR B-5a Commit 6)
 *
 * CEO 確認 4 項目の flow level 検証:
 *   1. 同じ user_id + plan_date の upsert が「重複作成ではなく更新」 になる
 *      (PRIMARY KEY 動作の round-trip 再現)
 *   2. upsert 時 updated_at が更新される
 *      (trigger 動作 — mock では updated_at は state で再現)
 *   3. fetchPreviousDayPlan が直前 1 日のみ取得
 *      (前々日の plan は取らない、cascade なし)
 *   4. plan_date と plan.date mismatch を helper レベルで防ぐ
 *      (upsert payload assert + helper signature 設計)
 *
 * 本 test は in-memory Supabase mock で round-trip flow を確認。
 * 実 Supabase との接続は production migration で動作確認済 (Test 3-6)。
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  upsertPlanHistory,
  fetchPreviousDayPlan,
} from "@/lib/alter-morning/persistence/planHistory";
import type { MorningPlan } from "@/lib/alter-morning/types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// In-memory Supabase mock — round-trip simulator
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 本 mock は alter_morning_plan_history table の挙動を再現:
//   - PRIMARY KEY (user_id, plan_date) に基づく upsert (重複作成ではなく更新)
//   - updated_at の自動更新 (trigger 模倣)
//   - select / where eq でレコード取得
//   - CHECK 制約は helper 側で防がれる (mock では DB CHECK は再現しない)

interface StoredRow {
  user_id: string;
  plan_date: string;
  plan: MorningPlan;
  created_at: string;
  updated_at: string;
}

class InMemorySupabase {
  private rows: Map<string, StoredRow> = new Map();
  private currentTable: string | null = null;
  private selectCols: string | null = null;
  private eqFilters: Array<{ col: string; value: unknown }> = [];

  private key(userId: string, planDate: string): string {
    return `${userId}::${planDate}`;
  }

  from(table: string) {
    this.currentTable = table;
    return this;
  }

  async upsert(
    data: { user_id: string; plan_date: string; plan: MorningPlan },
    _options?: { onConflict?: string },
  ): Promise<{ error: { code?: string } | null }> {
    if (this.currentTable !== "alter_morning_plan_history") {
      return { error: { code: "WRONG_TABLE" } };
    }
    const k = this.key(data.user_id, data.plan_date);
    const existing = this.rows.get(k);
    const now = new Date().toISOString();
    if (existing) {
      // PRIMARY KEY conflict → update (CEO 確認 1)
      this.rows.set(k, {
        ...existing,
        plan: data.plan,
        updated_at: now, // CEO 確認 2: trigger 模倣 (BEFORE UPDATE で now() 設定)
      });
    } else {
      this.rows.set(k, {
        ...data,
        created_at: now,
        updated_at: now,
      });
    }
    return { error: null };
  }

  select(cols: string) {
    this.selectCols = cols;
    return this;
  }

  eq(col: string, value: unknown) {
    this.eqFilters.push({ col, value });
    return this;
  }

  async maybeSingle(): Promise<{
    data: { plan: MorningPlan } | null;
    error: null;
  }> {
    const userId = this.eqFilters.find((f) => f.col === "user_id")?.value as string;
    const planDate = this.eqFilters.find((f) => f.col === "plan_date")
      ?.value as string;
    this.eqFilters = []; // reset for next query
    const row = this.rows.get(this.key(userId, planDate));
    if (!row) return { data: null, error: null };
    return { data: { plan: row.plan }, error: null };
  }

  // Test 用 helper
  __getRow(userId: string, planDate: string): StoredRow | undefined {
    return this.rows.get(this.key(userId, planDate));
  }

  __countRows(): number {
    return this.rows.size;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fixtures
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const USER_A = "11111111-2222-3333-4444-555555555555";
const USER_B = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

function mkPlan(date: string, items: number = 1): MorningPlan {
  return {
    date,
    items: Array.from({ length: items }, (_, i) => ({
      id: `item_${i + 1}`,
      kind: "fixed" as const,
      text: `予定${i + 1}`,
      what: "ミーティング",
      startTime: "10:00",
      durationMin: 60,
      completed: false,
    })),
    dayConditions: {},
    createdAt: `${date}T00:00:00Z`,
    confirmed: false,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CEO 確認 1: 同じ user_id + plan_date upsert が更新になる
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[CEO 確認 1] PRIMARY KEY (user_id, plan_date) upsert が更新になる", () => {
  let supabase: InMemorySupabase;

  beforeEach(() => {
    supabase = new InMemorySupabase();
  });

  it("同じ user + 同じ plan_date で 2 回 upsert → 1 行のみ (重複作成なし)", async () => {
    const plan1 = mkPlan("2026-05-02", 1);
    const plan2 = mkPlan("2026-05-02", 3);

    await upsertPlanHistory(supabase as any, USER_A, plan1);
    await upsertPlanHistory(supabase as any, USER_A, plan2);

    expect(supabase.__countRows()).toBe(1); // 重複作成ではなく更新
  });

  it("更新後の plan は最新 (上書きされる)", async () => {
    const plan1 = mkPlan("2026-05-02", 1);
    const plan2 = mkPlan("2026-05-02", 3);

    await upsertPlanHistory(supabase as any, USER_A, plan1);
    await upsertPlanHistory(supabase as any, USER_A, plan2);

    const row = supabase.__getRow(USER_A, "2026-05-02");
    expect(row?.plan.items?.length).toBe(3); // 最新 plan で上書き
  });

  it("異なる user で同 plan_date → 別行 (各 user が独立)", async () => {
    const plan = mkPlan("2026-05-02", 1);
    await upsertPlanHistory(supabase as any, USER_A, plan);
    await upsertPlanHistory(supabase as any, USER_B, plan);
    expect(supabase.__countRows()).toBe(2);
  });

  it("同 user で異なる plan_date → 別行 (各日の plan が蓄積される)", async () => {
    await upsertPlanHistory(supabase as any, USER_A, mkPlan("2026-05-01"));
    await upsertPlanHistory(supabase as any, USER_A, mkPlan("2026-05-02"));
    await upsertPlanHistory(supabase as any, USER_A, mkPlan("2026-05-03"));
    expect(supabase.__countRows()).toBe(3);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CEO 確認 2: upsert 時 updated_at が更新される (trigger 模倣)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[CEO 確認 2] upsert 時 updated_at 更新", () => {
  it("初回 upsert → created_at = updated_at", async () => {
    const supabase = new InMemorySupabase();
    await upsertPlanHistory(supabase as any, USER_A, mkPlan("2026-05-02"));
    const row = supabase.__getRow(USER_A, "2026-05-02");
    expect(row?.created_at).toBe(row?.updated_at);
  });

  it("2 回目 upsert (更新) → updated_at が created_at より新しい", async () => {
    const supabase = new InMemorySupabase();
    await upsertPlanHistory(supabase as any, USER_A, mkPlan("2026-05-02", 1));
    const row1 = supabase.__getRow(USER_A, "2026-05-02");
    const created = row1?.created_at;

    // 数 ms 待つ (mock の Date.now ベース trigger を再現)
    await new Promise((r) => setTimeout(r, 5));

    await upsertPlanHistory(supabase as any, USER_A, mkPlan("2026-05-02", 3));
    const row2 = supabase.__getRow(USER_A, "2026-05-02");
    expect(row2?.created_at).toBe(created); // created_at は不変
    // updated_at は更新される
    expect(new Date(row2!.updated_at).getTime()).toBeGreaterThan(
      new Date(created!).getTime(),
    );
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CEO 確認 3: fetchPreviousDayPlan 直前 1 日のみ取得 (cascade なし)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[CEO 確認 3] fetchPreviousDayPlan 直前 1 日のみ取得", () => {
  let supabase: InMemorySupabase;

  beforeEach(async () => {
    supabase = new InMemorySupabase();
    // 過去 5 日分の plan を保存
    for (const date of [
      "2026-04-28",
      "2026-04-29",
      "2026-04-30",
      "2026-05-01",
      "2026-05-02",
    ]) {
      await upsertPlanHistory(supabase as any, USER_A, mkPlan(date));
    }
  });

  it("[必須証明] todayDate=2026-05-02 → 直前 1 日 (2026-05-01) の plan を返す", async () => {
    const result = await fetchPreviousDayPlan(supabase as any, USER_A, "2026-05-02");
    expect(result?.date).toBe("2026-05-01");
  });

  it("[必須証明] cascade なし: 前々日 (2026-04-30) の plan は取らない", async () => {
    const result = await fetchPreviousDayPlan(supabase as any, USER_A, "2026-05-02");
    expect(result?.date).not.toBe("2026-04-30");
  });

  it("直前日 plan が不在 → null (一昨日を遡らない)", async () => {
    // todayDate=2026-05-02 で直前 (2026-05-01) を削除して試す
    const supabaseEmpty = new InMemorySupabase();
    await upsertPlanHistory(supabaseEmpty as any, USER_A, mkPlan("2026-04-30")); // 一昨日
    const result = await fetchPreviousDayPlan(
      supabaseEmpty as any,
      USER_A,
      "2026-05-02",
    );
    expect(result).toBeNull(); // 直前 1 日不在 → null (cascade で 2026-04-30 を取らない)
  });

  it("月またぎ: todayDate=2026-05-01 → 直前 1 日 (2026-04-30)", async () => {
    const result = await fetchPreviousDayPlan(supabase as any, USER_A, "2026-05-01");
    expect(result?.date).toBe("2026-04-30");
  });

  it("年またぎ: todayDate=2026-01-01 → 2025-12-31 を取る", async () => {
    await upsertPlanHistory(supabase as any, USER_A, mkPlan("2025-12-31"));
    const result = await fetchPreviousDayPlan(supabase as any, USER_A, "2026-01-01");
    expect(result?.date).toBe("2025-12-31");
  });

  it("user 別: USER_A の plan が USER_B から見えない", async () => {
    const result = await fetchPreviousDayPlan(supabase as any, USER_B, "2026-05-02");
    expect(result).toBeNull(); // USER_B には plan がない
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CEO 確認 4: plan_date と plan.date mismatch を helper レベルで防ぐ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[CEO 確認 4] plan_date = plan.date 強制 (helper レベル)", () => {
  it("upsert 後、保存された row の plan_date が plan.date と一致", async () => {
    const supabase = new InMemorySupabase();
    const plan = mkPlan("2026-05-15");
    await upsertPlanHistory(supabase as any, USER_A, plan);
    const row = supabase.__getRow(USER_A, "2026-05-15");
    expect(row).toBeDefined();
    expect(row?.plan_date).toBe(row?.plan.date);
    expect(row?.plan_date).toBe("2026-05-15");
  });

  it("複数日 upsert: 各 row で plan_date = plan.date", async () => {
    const supabase = new InMemorySupabase();
    const dates = ["2026-04-28", "2026-04-30", "2026-05-02"];
    for (const date of dates) {
      await upsertPlanHistory(supabase as any, USER_A, mkPlan(date));
    }
    for (const date of dates) {
      const row = supabase.__getRow(USER_A, date);
      expect(row?.plan_date).toBe(row?.plan.date);
      expect(row?.plan_date).toBe(date);
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Round-trip 総合 flow
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Round-trip flow: upsert (Day N) → fetchPreviousDayPlan (Day N+1)", () => {
  it("Day 1 で upsert → Day 2 で前日 plan 取得 → Day 3 で前日 plan 取得 (各日が直前 1 日のみ)", async () => {
    const supabase = new InMemorySupabase();

    // Day 1: 2026-05-01
    const day1Plan = mkPlan("2026-05-01", 2);
    await upsertPlanHistory(supabase as any, USER_A, day1Plan);

    // Day 2: 前日 (2026-05-01) の plan を取得
    const day2Result = await fetchPreviousDayPlan(supabase as any, USER_A, "2026-05-02");
    expect(day2Result?.date).toBe("2026-05-01");
    expect(day2Result?.items?.length).toBe(2);

    // Day 2 自身の plan を upsert
    const day2Plan = mkPlan("2026-05-02", 1);
    await upsertPlanHistory(supabase as any, USER_A, day2Plan);

    // Day 3: 前日 (2026-05-02) の plan を取得 (Day 1 plan は取らない、cascade なし)
    const day3Result = await fetchPreviousDayPlan(supabase as any, USER_A, "2026-05-03");
    expect(day3Result?.date).toBe("2026-05-02");
    expect(day3Result?.items?.length).toBe(1);
    expect(day3Result?.date).not.toBe("2026-05-01"); // cascade なし
  });
});
