/**
 * B — Mock-only Structural Supabase TravelSessionDbPort tests（注入 structural client・real DB なし）
 *
 * 設計正本: docs/t11-real-supabase-repository-adapter-design.md（§4-9 案 B）
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createSupabaseTravelSessionDbPort,
  type SupabaseTravelSessionStructuralClient,
} from "@/lib/server/travel/supabase-travel-session-db-port";
import { createTravelSessionRepositoryFromDbPort } from "@/lib/server/travel/travel-session-repository-db-adapter";
import type { TravelSessionDbPort } from "@/lib/server/travel/travel-session-db-port";
import type { TravelSessionPersistenceWriteInput } from "@/lib/shared/travel/travel-session-persistence-types";

const strip = (raw: string) =>
  raw.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
const SRC = strip(readFileSync(resolve(process.cwd(), "lib/server/travel/supabase-travel-session-db-port.ts"), "utf8"));

type MockResult = { data: unknown; error: { message: string } | null };
type Recorded = { table: string; op: string; args?: unknown };

/** structural Supabase-like client の mock（real DB なし・call を record・responder で結果を決める）。 */
function mockClient(responder: (table: string, ops: string[], kind: "single" | "maybeSingle" | "array") => MockResult) {
  const record: Recorded[] = [];
  const make = (table: string) => {
    const ops: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {
      insert(v: unknown) { ops.push("insert"); record.push({ table, op: "insert", args: v }); return b; },
      select(c?: string) { ops.push("select"); record.push({ table, op: "select", args: c }); return b; },
      delete() { ops.push("delete"); record.push({ table, op: "delete" }); return b; },
      eq(col: string, val: string) { ops.push(`eq:${col}`); record.push({ table, op: "eq", args: { col, val } }); return b; },
      order(col: string) { ops.push("order"); record.push({ table, op: "order", args: col }); return b; },
      single() { return Promise.resolve(responder(table, ops, "single")); },
      maybeSingle() { return Promise.resolve(responder(table, ops, "maybeSingle")); },
      then(onF: (r: MockResult) => unknown, onR?: (e: unknown) => unknown) {
        return Promise.resolve(responder(table, ops, "array")).then(onF, onR);
      },
    };
    return b;
  };
  const client = { from(table: string) { record.push({ table, op: "from" }); return make(table); } };
  return { client: client as unknown as SupabaseTravelSessionStructuralClient, record };
}

const sessionRow = { id: "sess1", owner_user_id: "u1", status: "draft", visibility: "shared", created_at: "T", updated_at: "T" };
const inputRow = { id: "in1", session_id: "sess1", slot_key: "destination_area", value: { areaText: "Kyoto" }, slot_status: "confirmed", fill_state: "filled", owner_kind: "shared", visibility: "shared", provenance: { refIds: [] }, created_at: "T", updated_at: "T" };
const linkRow = { id: "lk1", session_id: "sess1", source: "user_provided", external_reference: "https://a", generated: false, inert: true, renderable: true, eligibility: "eligible", visibility: "shared", provenance: { refIds: [] }, created_at: "T" };

const tablesOf = (record: Recorded[], op: string) => record.filter((r) => r.op === op).map((r) => r.table);

describe("1. table 名 + owner-scoped filter（注入 client のみ）", () => {
  it("insertSession → plan_travel_sessions に insert+select+single", async () => {
    const { client, record } = mockClient(() => ({ data: sessionRow, error: null }));
    const port = createSupabaseTravelSessionDbPort(client);
    const r = await port.insertSession({ owner_user_id: "u1", status: "draft", visibility: "shared" });
    expect(r.id).toBe("sess1");
    expect(record.some((x) => x.table === "plan_travel_sessions" && x.op === "insert")).toBe(true);
    expect(record.some((x) => x.table === "plan_travel_sessions" && x.op === "select")).toBe(true);
  });
  it("insertInputs → plan_travel_session_inputs / insertLinks → plan_travel_session_links", async () => {
    const a = mockClient(() => ({ data: [inputRow], error: null }));
    await createSupabaseTravelSessionDbPort(a.client).insertInputs([{ session_id: "sess1", slot_key: "destination_area", value: { areaText: "Kyoto" }, slot_status: "confirmed", fill_state: "filled", owner_kind: "shared", visibility: "shared", provenance: { refIds: [] } }]);
    expect(tablesOf(a.record, "insert")).toEqual(["plan_travel_session_inputs"]);
    const b = mockClient(() => ({ data: [linkRow], error: null }));
    await createSupabaseTravelSessionDbPort(b.client).insertLinks([{ session_id: "sess1", source: "user_provided", external_reference: "https://a", generated: false, inert: true, renderable: true, eligibility: "eligible", visibility: "shared", provenance: { refIds: [] } }]);
    expect(tablesOf(b.record, "insert")).toEqual(["plan_travel_session_links"]);
  });
  it("selectBundleByOwner → 3 table query・session は id+owner_user_id で scope", async () => {
    const { client, record } = mockClient((table, _ops, kind) => {
      if (table === "plan_travel_sessions" && kind === "maybeSingle") return { data: sessionRow, error: null };
      if (table === "plan_travel_session_inputs") return { data: [inputRow], error: null };
      if (table === "plan_travel_session_links") return { data: [linkRow], error: null };
      return { data: null, error: null };
    });
    const bundle = await createSupabaseTravelSessionDbPort(client).selectBundleByOwner("sess1", "u1");
    expect(bundle).not.toBeNull();
    expect(new Set(tablesOf(record, "from"))).toEqual(new Set(["plan_travel_sessions", "plan_travel_session_inputs", "plan_travel_session_links"]));
    // owner-scoped: session select に eq id + eq owner_user_id
    const eqs = record.filter((r) => r.op === "eq" && r.table === "plan_travel_sessions").map((r) => (r.args as { col: string }).col);
    expect(eqs).toContain("id");
    expect(eqs).toContain("owner_user_id");
  });
  it("listByOwner → eq owner_user_id + order・deleteByOwner → delete eq id + eq owner_user_id", async () => {
    const l = mockClient(() => ({ data: [sessionRow], error: null }));
    await createSupabaseTravelSessionDbPort(l.client).listByOwner("u1");
    expect(l.record.filter((r) => r.op === "eq").map((r) => (r.args as { col: string }).col)).toContain("owner_user_id");
    expect(l.record.some((r) => r.op === "order")).toBe(true);

    const d = mockClient(() => ({ data: [sessionRow], error: null }));
    const ok = await createSupabaseTravelSessionDbPort(d.client).deleteByOwner("sess1", "u1");
    expect(ok).toBe(true);
    expect(d.record.some((r) => r.op === "delete" && r.table === "plan_travel_sessions")).toBe(true);
    const deqs = d.record.filter((r) => r.op === "eq").map((r) => (r.args as { col: string }).col);
    expect(deqs).toEqual(expect.arrayContaining(["id", "owner_user_id"]));
  });
});

describe("2. DB error → 中立 failure（raw diag を出さない）", () => {
  it("insertSession error → throws（raw message を持たない code のみ）", async () => {
    const { client } = mockClient(() => ({ data: null, error: { message: "RLS denied: secret detail" } }));
    await expect(createSupabaseTravelSessionDbPort(client).insertSession({ owner_user_id: "u1", status: "draft", visibility: "shared" })).rejects.toMatchObject({ code: "insert_session_failed" });
  });
  it("selectBundle: session error/不在 → null（children を引かない）", async () => {
    const { client, record } = mockClient(() => ({ data: null, error: { message: "x" } }));
    expect(await createSupabaseTravelSessionDbPort(client).selectBundleByOwner("sess1", "u1")).toBeNull();
    expect(tablesOf(record, "from")).toEqual(["plan_travel_sessions"]); // children を query しない
  });
  it("delete error → false・0 row → false", async () => {
    const e = mockClient(() => ({ data: null, error: { message: "x" } }));
    expect(await createSupabaseTravelSessionDbPort(e.client).deleteByOwner("s", "u")).toBe(false);
    const z = mockClient(() => ({ data: [], error: null }));
    expect(await createSupabaseTravelSessionDbPort(z.client).deleteByOwner("s", "u")).toBe(false);
  });
});

describe("3. save flow cleanup（mapping adapter・child 失敗→best-effort session delete）", () => {
  const writeInput: TravelSessionPersistenceWriteInput = {
    ownerUserId: "u1", status: "draft", visibility: "shared",
    inputs: [{ slotKey: "destination_area", value: { areaText: "Kyoto" }, slotStatus: "confirmed", fillState: "filled", owner: { kind: "shared" }, visibility: "shared", provenance: { refIds: [] } }],
    links: [{ source: "user_provided", externalReference: "https://a", generated: false, inert: true, eligibility: "eligible", visibility: "shared", provenance: { refIds: [] }, renderable: true }],
  };
  /** mock port: insertInputs を失敗させ、deleteByOwner 呼び出しを記録。 */
  function failingPort(failOn: "session" | "inputs"): { port: TravelSessionDbPort; deletes: { sessionId: string; ownerUserId: string }[] } {
    const deletes: { sessionId: string; ownerUserId: string }[] = [];
    const port: TravelSessionDbPort = {
      async insertSession(row) { if (failOn === "session") throw new Error("boom"); return { id: "s1", ...row, created_at: "T", updated_at: "T" }; },
      async insertInputs() { if (failOn === "inputs") throw new Error("boom"); return []; },
      async insertLinks() { return []; },
      async selectBundleByOwner() { return null; },
      async listByOwner() { return []; },
      async deleteByOwner(sessionId, ownerUserId) { deletes.push({ sessionId, ownerUserId }); return true; },
    };
    return { port, deletes };
  }
  it("child insert 失敗 → best-effort cleanup delete（owner-scoped）", async () => {
    const { port, deletes } = failingPort("inputs");
    const repo = createTravelSessionRepositoryFromDbPort(port);
    const r = await repo.saveTravelSessionIntent(writeInput);
    expect(r.ok).toBe(false);
    expect(deletes).toEqual([{ sessionId: "s1", ownerUserId: "u1" }]); // cleanup・owner-scoped
  });
  it("session insert 失敗 → cleanup しない", async () => {
    const { port, deletes } = failingPort("session");
    const repo = createTravelSessionRepositoryFromDbPort(port);
    const r = await repo.saveTravelSessionIntent(writeInput);
    expect(r.ok).toBe(false);
    expect(deletes).toHaveLength(0);
  });
});

describe("4. source-contract（server-only・no service_role/createClient/generated types/外部）", () => {
  it('import "server-only" を持つ', () => {
    const raw = readFileSync(resolve(process.cwd(), "lib/server/travel/supabase-travel-session-db-port.ts"), "utf8");
    expect(raw).toMatch(/import "server-only";/);
  });
  it("service_role/admin/createClient/generated Database/app・UI/engine/display/booking なし", () => {
    expect(SRC).not.toMatch(/service_role|serviceRole/);
    expect(SRC).not.toMatch(/createAdminClient|supabaseAdmin|admin/i);
    expect(SRC).not.toContain("createClient");
    expect(SRC).not.toContain("supabaseServer");
    expect(SRC).not.toMatch(/database\.types|supabase\/types|Database\b/);
    expect(SRC).not.toMatch(/from ["']next/);
    expect(SRC).not.toMatch(/from ["']react/);
    expect(SRC).not.toMatch(/from ["'][^"']*(components|app\/|_actions)/);
    for (const f of ["runTravelPlanEngine", "buildTravelPlanDisplayResult", "buildPlanIntelligenceProjection", "deriveCoAlterProjectionCues", "buildGeneratedMapsSearchIntent", "booking", "calendar", "executionAuthority"]) {
      expect(SRC).not.toContain(f);
    }
    expect(SRC).not.toMatch(/useCoAlter|\/talk|coalter/i);
    expect(SRC).not.toMatch(/\bfetch\(/);
  });
  it("table 名は MVP 3 table のみ", () => {
    expect(SRC).toContain("plan_travel_sessions");
    expect(SRC).toContain("plan_travel_session_inputs");
    expect(SRC).toContain("plan_travel_session_links");
    expect(SRC).not.toContain("plan_travel_session_participants");
    expect(SRC).not.toContain("plan_travel_session_private_inputs");
    expect(SRC).not.toContain("display_cache");
  });
});
