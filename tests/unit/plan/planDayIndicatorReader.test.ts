import { describe, it, expect } from "vitest";
import {
  listPlanDayIndicators,
  UNDEFINED_TABLE_CODE,
  type DayIndicatorQuery,
} from "@/lib/plan/planDayIndicatorReader";

const ROW = {
  id: "ind-1",
  user_id: "user-1",
  source_id: "src-1",
  date: "2025-07-03",
  kind: "off",
  label: "公休",
  counts_as_public_holiday: true,
  raw_code: "H",
  semantic_type: "holiday",
  source_type: "shift_image",
};

function query(result: { data: unknown[] | null; error: unknown }): {
  run: DayIndicatorQuery;
  calls: string[];
} {
  const calls: string[] = [];
  return {
    calls,
    run: async (userId) => {
      calls.push(userId);
      return result;
    },
  };
}

describe("listPlanDayIndicators", () => {
  it("正常: row を domain（camelCase）に写像。userId で引く", async () => {
    const q = query({ data: [ROW], error: null });
    const out = await listPlanDayIndicators(q.run, "user-1");
    expect(q.calls).toEqual(["user-1"]);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      id: "ind-1",
      date: "2025-07-03",
      kind: "off",
      label: "公休",
      countsAsPublicHoliday: true,
      rawCode: "H",
      semanticType: "holiday",
      sourceType: "shift_image",
      sourceId: "src-1",
    });
  });

  it("kind / sourceType を防御的に narrow（off_request / manual）", async () => {
    const q = query({
      data: [
        { ...ROW, kind: "off_request", counts_as_public_holiday: false, source_type: "manual", source_id: null, raw_code: null, semantic_type: null },
      ],
      error: null,
    });
    const out = await listPlanDayIndicators(q.run, "user-1");
    expect(out[0].kind).toBe("off_request");
    expect(out[0].sourceType).toBe("manual");
    expect(out[0].sourceId).toBeNull();
    expect(out[0].rawCode).toBeNull();
    expect(out[0].countsAsPublicHoliday).toBe(false);
  });

  it("空 data → []", async () => {
    const q = query({ data: [], error: null });
    expect(await listPlanDayIndicators(q.run, "user-1")).toEqual([]);
  });

  it("★ 42P01 undefined_table のみ graceful degrade → []（production 未適用でも /plan を壊さない）", async () => {
    const q = query({
      data: null,
      error: { code: UNDEFINED_TABLE_CODE, message: 'relation "plan_day_indicators" does not exist' },
    });
    expect(await listPlanDayIndicators(q.run, "user-1")).toEqual([]);
  });

  it("★ 42P01 以外の DB error は握りつぶさず throw（本当の障害を [] で隠さない）", async () => {
    const q = query({
      data: null,
      error: { code: "42501", message: "permission denied" },
    });
    await expect(listPlanDayIndicators(q.run, "user-1")).rejects.toThrow(
      /listPlanDayIndicators failed/
    );
  });

  it("PostgrestError 形でない未知 error も throw（[] にしない）", async () => {
    const q = query({ data: null, error: new Error("network down") });
    await expect(listPlanDayIndicators(q.run, "user-1")).rejects.toThrow(
      /listPlanDayIndicators failed/
    );
  });

  it("23xxx 等の制約 error も degrade しない（42P01 限定の確認）", async () => {
    const q = query({
      data: null,
      error: { code: "23505", message: "duplicate key" },
    });
    await expect(listPlanDayIndicators(q.run, "user-1")).rejects.toThrow();
  });
});
