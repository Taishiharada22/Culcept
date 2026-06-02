import { describe, it, expect } from "vitest";
import {
  createDatedColumnRestrictedAnchorSource,
  type UserContextClient,
  type RealReadBounds,
} from "@/lib/plan/reality/integration/dev-runtime-realsource";
import { ANCHOR_COLUMNS_SQL, FORBIDDEN_ANCHOR_COLUMNS, type ColumnRestrictedAnchorRow } from "@/lib/plan/reality/integration/dev-runtime-adapter";
import { runRealityShadowSmoke, type SmokeGate } from "@/lib/plan/reality/integration/dev-runtime";
import { assertRedacted } from "@/lib/plan/reality/integration/redaction-guard";

const CEO = "ceo-user-id";
const DAY = "2026-06-03";
const bounds: RealReadBounds = { date: DAY, limit: 50 };

function row(p: Partial<ColumnRestrictedAnchorRow> = {}): ColumnRestrictedAnchorRow {
  return { id: "a1", start_time: "09:00", end_time: "10:00", rigidity: "hard", sensitive_category: null, ...p };
}

interface Cap { table?: string; select?: string; eqs: [string, string][]; limit?: number; error: { message: string } | null }
function mockUserClient(rows: unknown[], cap: Cap): UserContextClient {
  const q = {
    eq(col: string, val: string) {
      cap.eqs.push([col, val]);
      return q;
    },
    limit(n: number) {
      cap.limit = n;
      return Promise.resolve({ data: cap.error ? null : (rows as ColumnRestrictedAnchorRow[]), error: cap.error });
    },
  };
  return {
    from(table: string) {
      cap.table = table;
      return {
        select(columns: string) {
          cap.select = columns;
          return q;
        },
      };
    },
  };
}
function cap(error: { message: string } | null = null): Cap {
  return { eqs: [], error };
}
function gate(p: Partial<SmokeGate> = {}): SmokeGate {
  return { nodeEnv: "development", flagEnabled: true, capability: "dev-only", requestedUserId: CEO, allowedDevUserId: CEO, ...p };
}

describe("4-B-1C-a — query 形（column-restricted + user_id + date + limit）", () => {
  it("select は許可列のみ・'*' でない・raw 列を含まない", async () => {
    const c = cap();
    await createDatedColumnRestrictedAnchorSource(mockUserClient([row()], c), bounds).loadForSmoke(CEO);
    expect(c.table).toBe("external_anchors");
    expect(c.select).toBe(ANCHOR_COLUMNS_SQL);
    expect(c.select).not.toBe("*");
    for (const f of FORBIDDEN_ANCHOR_COLUMNS) expect(c.select).not.toContain(f);
  });

  it("user_id eq（RLS 二重防御）+ date eq（単一日）+ limit（無制限禁止）が全て付く", async () => {
    const c = cap();
    await createDatedColumnRestrictedAnchorSource(mockUserClient([row()], c), bounds).loadForSmoke(CEO);
    expect(c.eqs).toContainEqual(["user_id", CEO]);
    expect(c.eqs).toContainEqual(["date", DAY]);
    expect(c.limit).toBe(50);
  });

  it("date / limit は必須（型で全期間・無制限を防ぐ）", () => {
    // @ts-expect-error date 欠落は型エラー
    const _a: RealReadBounds = { limit: 10 };
    // @ts-expect-error limit 欠落は型エラー
    const _b: RealReadBounds = { date: DAY };
    expect(true).toBe(true);
  });

  it("table は external_anchors 固定（plan_seeds に触れない）", async () => {
    const c = cap();
    await createDatedColumnRestrictedAnchorSource(mockUserClient([row()], c), bounds).loadForSmoke(CEO);
    expect(c.table).not.toContain("seed");
  });
});

describe("4-B-1C-a — 出力は raw を運ばず assertRedacted-clean", () => {
  it("raw 混入 row でも projection は無視し smoke は clean", async () => {
    const dirty = { id: "real-anchor-9", start_time: "09:00", end_time: "10:00", rigidity: "hard", sensitive_category: "medical", title: "渋谷の田中皮膚科", location_text: "渋谷区" } as unknown as ColumnRestrictedAnchorRow;
    const ds = createDatedColumnRestrictedAnchorSource(mockUserClient([dirty], cap()), bounds);
    const r = await runRealityShadowSmoke({ gate: gate(), dataSource: ds });
    expect(r.status).toBe("ok");
    if (r.status === "ok") {
      expect(assertRedacted(r.summary).clean).toBe(true);
      const json = JSON.stringify(r.summary);
      expect(json).not.toContain("渋谷");
      expect(json).not.toContain("medical"); // sensitive_category 文字列も出ない
      expect(json).not.toContain("real-anchor-9"); // 実 id も ephemeral 化
    }
  });

  it("client error → null → smoke NO_INPUT", async () => {
    const ds = createDatedColumnRestrictedAnchorSource(mockUserClient([], cap({ message: "rls denied" })), bounds);
    const r = await runRealityShadowSmoke({ gate: gate(), dataSource: ds });
    expect(r).toEqual({ status: "noop", code: "NO_INPUT" });
  });
});

describe("4-B-1C-a — gate fail 時は実 client を呼ばない（実 read なし）", () => {
  it("production / flag-off では from() が呼ばれない", async () => {
    const c = cap();
    const ds = createDatedColumnRestrictedAnchorSource(mockUserClient([row()], c), bounds);
    await runRealityShadowSmoke({ gate: gate({ nodeEnv: "production" }), dataSource: ds });
    await runRealityShadowSmoke({ gate: gate({ flagEnabled: false }), dataSource: ds });
    expect(c.table).toBeUndefined(); // query が一度も発行されていない
  });
});

describe("4-B-1C-a — seed 読取メソッド不在（構造）", () => {
  it("生成される RealityDataSource は loadForSmoke のみ", () => {
    const ds = createDatedColumnRestrictedAnchorSource(mockUserClient([row()], cap()), bounds);
    expect(Object.keys(ds)).toEqual(["loadForSmoke"]);
  });
});
