import { describe, it, expect } from "vitest";
import {
  ALLOWED_ANCHOR_COLUMNS,
  FORBIDDEN_ANCHOR_COLUMNS,
  ANCHOR_TABLE,
  ANCHOR_COLUMNS_SQL,
  projectSafeDayGraph,
  projectToRealityInput,
  createColumnRestrictedAnchorSource,
  type ColumnRestrictedAnchorRow,
  type SupabaseLikeClient,
} from "@/lib/plan/reality/integration/dev-runtime-adapter";
import { runRealityShadowSmoke, type SmokeGate } from "@/lib/plan/reality/integration/dev-runtime";
import { assertRedacted } from "@/lib/plan/reality/integration/redaction-guard";

const CEO = "ceo-user-id";

function row(p: Partial<ColumnRestrictedAnchorRow> = {}): ColumnRestrictedAnchorRow {
  return { id: "a1", start_time: "09:00", end_time: "10:00", rigidity: "hard", sensitive_category: null, ...p };
}

interface Capture { table?: string; columns?: string; eqCol?: string; eqVal?: string }
function mockClient(rows: unknown[], capture: Capture = {}, error: { message: string } | null = null): SupabaseLikeClient {
  return {
    from(table: string) {
      capture.table = table;
      return {
        select(columns: string) {
          capture.columns = columns;
          return {
            eq(col: string, val: string) {
              capture.eqCol = col;
              capture.eqVal = val;
              return Promise.resolve({ data: error ? null : (rows as ColumnRestrictedAnchorRow[]), error });
            },
          };
        },
      };
    },
  };
}

function gate(p: Partial<SmokeGate> = {}): SmokeGate {
  return { nodeEnv: "development", flagEnabled: true, capability: "dev-only", requestedUserId: CEO, allowedDevUserId: CEO, ...p };
}

describe("4-B-1A — column allowlist / forbiddenlist", () => {
  it("ALLOWED ∩ FORBIDDEN = ∅", () => {
    const allowed = new Set<string>(ALLOWED_ANCHOR_COLUMNS);
    for (const f of FORBIDDEN_ANCHOR_COLUMNS) expect(allowed.has(f)).toBe(false);
  });
  it("FORBIDDEN に raw 列（title/location/external_uid）が入っている", () => {
    for (const c of ["title", "location_text", "external_uid"]) {
      expect(FORBIDDEN_ANCHOR_COLUMNS as readonly string[]).toContain(c);
    }
  });
  it("SELECT 句は許可列のみ・'*' でない・raw 列を含まない", () => {
    expect(ANCHOR_COLUMNS_SQL).toBe("id, start_time, end_time, rigidity, sensitive_category");
    expect(ANCHOR_COLUMNS_SQL).not.toContain("*");
    for (const f of FORBIDDEN_ANCHOR_COLUMNS) expect(ANCHOR_COLUMNS_SQL).not.toContain(f);
  });
});

describe("4-B-1A — adapter は許可列のみ select し external_anchors のみ読む（mock spy）", () => {
  it("select 引数は ANCHOR_COLUMNS_SQL（'*'・raw 列を渡さない）", async () => {
    const cap: Capture = {};
    const ds = createColumnRestrictedAnchorSource(mockClient([row()], cap));
    await ds.loadForSmoke(CEO);
    expect(cap.table).toBe("external_anchors");
    expect(cap.columns).toBe(ANCHOR_COLUMNS_SQL);
    expect(cap.columns).not.toBe("*");
    expect(cap.columns).not.toContain("title");
    expect(cap.columns).not.toContain("location_text");
    expect(cap.columns).not.toContain("external_uid");
    expect(cap.eqCol).toBe("user_id");
    expect(cap.eqVal).toBe(CEO);
  });
  it("table は external_anchors 固定（plan_seeds に触れない）", async () => {
    const cap: Capture = {};
    await createColumnRestrictedAnchorSource(mockClient([row()], cap)).loadForSmoke(CEO);
    expect(cap.table).toBe(ANCHOR_TABLE);
    expect(cap.table).not.toContain("seed");
  });
});

describe("4-B-1A — SafeDayGraphProjection（raw を持たない最小 node）", () => {
  it("dayNode は id/startMin/endMin/importance/hard のみ（title/location フィールド無し）", () => {
    const proj = projectSafeDayGraph([row({ id: "x", start_time: "09:00", end_time: "10:00", rigidity: "hard" })]);
    expect(proj.dayNodes).toHaveLength(1);
    expect(Object.keys(proj.dayNodes[0]).sort()).toEqual(["endMin", "hard", "id", "importance", "startMin"]);
  });
  it("mode: 0 件→build / 重複→repair / 非重複→complete", () => {
    expect(projectSafeDayGraph([]).mode).toBe("build");
    expect(projectSafeDayGraph([row({ id: "a", start_time: "09:00", end_time: "11:00" }), row({ id: "b", start_time: "10:00", end_time: "12:00" })]).mode).toBe("repair");
    expect(projectSafeDayGraph([row({ id: "a", start_time: "09:00", end_time: "10:00" }), row({ id: "b", start_time: "11:00", end_time: "12:00" })]).mode).toBe("complete");
  });
  it("parse 不能な時刻は skip（degraded・落ちない）", () => {
    expect(projectSafeDayGraph([row({ start_time: "2026-06-03T09:00:00Z", end_time: null })]).dayNodes).toHaveLength(0);
  });
});

describe("4-B-1A — projectToRealityInput（raw を読まない）", () => {
  it("RealityInput は title/location を持たず seedTraces 空", () => {
    const input = projectToRealityInput([row({ id: "a1", sensitive_category: "medical" })]);
    expect(input.seedTraces).toEqual([]);
    expect(input.anchors["a1"].sensitive).toBe(true); // category の有無のみ
    expect(JSON.stringify(input)).not.toContain("medical"); // category の raw 値も載せない（有無のみ）
  });
  it("mock が raw フィールド付き row を返しても projection は無視（許可列のみ読む）", () => {
    // 悪意/事故で title/location が混入した row
    const dirty = { id: "a1", start_time: "09:00", end_time: "10:00", rigidity: "hard", sensitive_category: null, title: "渋谷の田中皮膚科", location_text: "東京都渋谷区" } as unknown as ColumnRestrictedAnchorRow;
    const input = projectToRealityInput([dirty]);
    const json = JSON.stringify(input);
    expect(json).not.toContain("渋谷"); // raw title/location を読まない
    expect(json).not.toContain("田中");
  });
});

describe("4-B-1A — adapter 出力は smoke を通り assertRedacted-clean", () => {
  it("loadForSmoke → runRealityShadowSmoke（gate pass）→ ok・clean・raw なし", async () => {
    const dirty = { id: "real-anchor-1", start_time: "09:00", end_time: "10:00", rigidity: "hard", sensitive_category: null, title: "秘密の予定" } as unknown as ColumnRestrictedAnchorRow;
    const ds = createColumnRestrictedAnchorSource(mockClient([dirty]));
    const r = await runRealityShadowSmoke({ gate: gate(), dataSource: ds });
    expect(r.status).toBe("ok");
    if (r.status === "ok") {
      expect(assertRedacted(r.summary).clean).toBe(true);
      const json = JSON.stringify(r.summary);
      expect(json).not.toContain("秘密"); // raw title 不在
      expect(json).not.toContain("real-anchor-1"); // 実 id も出力に出ない
    }
  });
  it("client error → loadForSmoke null → smoke NO_INPUT", async () => {
    const ds = createColumnRestrictedAnchorSource(mockClient([], {}, { message: "db down" }));
    const r = await runRealityShadowSmoke({ gate: gate(), dataSource: ds });
    expect(r).toEqual({ status: "noop", code: "NO_INPUT" });
  });
});

describe("4-B-1A — seed 読取メソッドが構造的に存在しない", () => {
  it("RealityDataSource は loadForSmoke のみ（seed メソッド無し）", () => {
    const ds = createColumnRestrictedAnchorSource(mockClient([row()]));
    expect(Object.keys(ds)).toEqual(["loadForSmoke"]);
    expect(Object.keys(ds).some((k) => /seed/i.test(k))).toBe(false);
  });
});
