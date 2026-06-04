import { describe, it, expect } from "vitest";
import {
  runCompleteShadowRealSmoke,
  buildCompleteShadowGate,
  type CompleteShadowRealSmokeDeps,
} from "@/lib/plan/reality/integration/complete-shadow-real-smoke";
import { ANCHOR_COLUMNS_SQL, FORBIDDEN_ANCHOR_COLUMNS, type ColumnRestrictedAnchorRow } from "@/lib/plan/reality/integration/dev-runtime-adapter";
import { assertDevReportRedacted } from "@/lib/plan/reality/integration/redaction-guard";
import type { UserContextClient } from "@/lib/plan/reality/integration/dev-runtime-realsource";
import type { SmokeGate } from "@/lib/plan/reality/integration/dev-runtime";

const CEO = "ceo-user-id";
const DAY = "2026-06-05";

function row(p: Partial<ColumnRestrictedAnchorRow> = {}): ColumnRestrictedAnchorRow {
  return { id: "a1", start_time: "09:00", end_time: "10:00", rigidity: "hard", sensitive_category: null, ...p };
}

interface Cap {
  table?: string;
  select?: string;
  eqs: [string, string][];
  limit?: number;
  error: { message: string } | null;
}
/** from/select/eq/limit を spy する mock user-RLS client（実 DB 不使用）。 */
function mockUserClient(rows: unknown[], cap: Cap, opts: { throwOnLimit?: boolean } = {}): UserContextClient {
  const q = {
    eq(col: string, val: string) {
      cap.eqs.push([col, val]);
      return q;
    },
    limit(n: number) {
      cap.limit = n;
      if (opts.throwOnLimit) throw new Error("boom");
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
function smokeDeps(p: {
  gate?: SmokeGate;
  client: UserContextClient;
  clientContext?: "user_rls" | "service_role";
  date?: string;
  limit?: number;
}): CompleteShadowRealSmokeDeps {
  return { gate: p.gate ?? gate(), client: p.client, clientContext: p.clientContext ?? "user_rls", date: p.date ?? DAY, limit: p.limit ?? 50 };
}

describe("A1-5-1b runCompleteShadowRealSmoke — gate fail-closed（load 0・実 read なし）", () => {
  it("flag off → from() 呼ばれない・FLAG_OFF", async () => {
    const c = cap();
    const r = await runCompleteShadowRealSmoke(smokeDeps({ gate: gate({ flagEnabled: false }), client: mockUserClient([row()], c) }));
    expect(r.status).toBe("noop");
    if (r.status === "noop") expect(r.code).toBe("FLAG_OFF");
    expect(c.table).toBeUndefined();
  });
  it("production → from() 呼ばれない・PRODUCTION", async () => {
    const c = cap();
    const r = await runCompleteShadowRealSmoke(smokeDeps({ gate: gate({ nodeEnv: "production" }), client: mockUserClient([row()], c) }));
    expect(r.status).toBe("noop");
    if (r.status === "noop") expect(r.code).toBe("PRODUCTION");
    expect(c.table).toBeUndefined();
  });
  it("capability 不一致 → from() 呼ばれない・NO_CAPABILITY", async () => {
    const c = cap();
    const r = await runCompleteShadowRealSmoke(smokeDeps({ gate: gate({ capability: undefined }), client: mockUserClient([row()], c) }));
    expect(r.status).toBe("noop");
    if (r.status === "noop") expect(r.code).toBe("NO_CAPABILITY");
    expect(c.table).toBeUndefined();
  });
  it("user mismatch → from() 呼ばれない・OUT_OF_SCOPE_USER", async () => {
    const c = cap();
    const r = await runCompleteShadowRealSmoke(smokeDeps({ gate: gate({ requestedUserId: "intruder" }), client: mockUserClient([row()], c) }));
    expect(r.status).toBe("noop");
    if (r.status === "noop") expect(r.code).toBe("OUT_OF_SCOPE_USER");
    expect(c.table).toBeUndefined();
  });
  it("service_role → from() 呼ばれない・SERVICE_ROLE_REFUSED", async () => {
    const c = cap();
    const r = await runCompleteShadowRealSmoke(smokeDeps({ client: mockUserClient([row()], c), clientContext: "service_role" }));
    expect(r.status).toBe("noop");
    if (r.status === "noop") expect(r.code).toBe("SERVICE_ROLE_REFUSED");
    expect(c.table).toBeUndefined();
  });
});

describe("A1-5-1b runCompleteShadowRealSmoke — pass（column-restricted・candidateCount=0）", () => {
  it("user_rls + CEO + flag on で SELECT 1 回・許可列のみ・'*' なし・forbidden 非含有・user_id+date eq", async () => {
    const c = cap();
    const r = await runCompleteShadowRealSmoke(smokeDeps({ client: mockUserClient([row()], c) }));
    expect(r.status).toBe("ok");
    expect(c.table).toBe("external_anchors");
    expect(c.select).toBe(ANCHOR_COLUMNS_SQL);
    expect(c.select).not.toBe("*");
    for (const f of FORBIDDEN_ANCHOR_COLUMNS) expect(c.select).not.toContain(f);
    expect(c.eqs).toContainEqual(["user_id", CEO]);
    expect(c.eqs).toContainEqual(["date", DAY]);
  });
  it("table は external_anchors（seed read 0・plan_seeds に触れない）", async () => {
    const c = cap();
    await runCompleteShadowRealSmoke(smokeDeps({ client: mockUserClient([row()], c) }));
    expect(c.table).not.toContain("seed");
  });
  it("limit は ≤50 に clamp（無制限禁止）", async () => {
    const c = cap();
    await runCompleteShadowRealSmoke(smokeDeps({ client: mockUserClient([row()], c), limit: 1000 }));
    expect(c.limit).toBe(50);
  });
  it("CompleteDispatchInput empty → candidateCount=0（report.totalCandidates=0）", async () => {
    const r = await runCompleteShadowRealSmoke(smokeDeps({ client: mockUserClient([row(), row({ id: "a2", start_time: "11:00", end_time: "12:00" })], cap()) }));
    expect(r.status).toBe("ok");
    if (r.status === "ok") {
      expect(r.report.totalCandidates).toBe(0);
      expect(typeof r.rowsRead).toBe("number");
    }
  });
  it("RealSmokeReport は counts/enum/bool のみ・redaction clean・service-role 不使用", async () => {
    const r = await runCompleteShadowRealSmoke(smokeDeps({ client: mockUserClient([row()], cap()) }));
    expect(r.status).toBe("ok");
    if (r.status === "ok") {
      expect(assertDevReportRedacted(r.report).clean).toBe(true);
      expect(r.redactionPass).toBe(true);
      expect(r.serviceRoleUsed).toBe(false);
      expect(r.recurringIncluded).toBe(false);
    }
  });
  it("raw 混入 row でも出力に raw id/title/location/sensitive_category が出ない", async () => {
    const dirty = {
      id: "real-anchor-9",
      start_time: "09:00",
      end_time: "10:00",
      rigidity: "hard",
      sensitive_category: "medical",
      title: "渋谷の田中皮膚科",
      location_text: "渋谷区",
    } as unknown as ColumnRestrictedAnchorRow;
    const r = await runCompleteShadowRealSmoke(smokeDeps({ client: mockUserClient([dirty], cap()) }));
    expect(r.status).toBe("ok");
    const json = JSON.stringify(r);
    expect(json).not.toContain("渋谷");
    expect(json).not.toContain("田中");
    expect(json).not.toContain("medical");
    expect(json).not.toContain("real-anchor-9");
  });
});

describe("A1-5-1b runCompleteShadowRealSmoke — fail-closed（adapter/no-input・raw 非含有）", () => {
  it("client error → null → NO_INPUT", async () => {
    const r = await runCompleteShadowRealSmoke(smokeDeps({ client: mockUserClient([], cap({ message: "rls denied" })) }));
    expect(r.status).toBe("noop");
    if (r.status === "noop") expect(r.code).toBe("NO_INPUT");
  });
  it("client throw → ADAPTER_DEGRADED（raw/stack 非含有）", async () => {
    const r = await runCompleteShadowRealSmoke(smokeDeps({ client: mockUserClient([row()], cap(), { throwOnLimit: true }) }));
    expect(r.status).toBe("noop");
    if (r.status === "noop") expect(r.code).toBe("ADAPTER_DEGRADED");
    expect(JSON.stringify(r)).not.toContain("boom");
  });
});

describe("A1-5-1b buildCompleteShadowGate — flag default false（安全既定）", () => {
  it("PLAN_FLAGS.realityCompleteShadow 未設定 → flagEnabled=false", () => {
    const g = buildCompleteShadowGate({ nodeEnv: "development", capability: "dev-only", requestedUserId: CEO, allowedDevUserId: CEO });
    expect(g.flagEnabled).toBe(false);
  });
});
