/**
 * RD3c-P3a-wire-AB — duration-confirmation-source Supabase repository（mock client・実 DB なし）+ static-safety（2026-06-16）
 * 正本設計: docs/reality-operator-seed-wiring-rd3-c-p3a-wire-0.md
 *
 * 核: injected user-RLS client で insert/findActiveByScope/markSuperseded。raw DB error は safe code に sanitize。
 *   unique violation(23505) → active_duplicate_conflict。`.from(duration_confirmations)` は本 source のみ（static-safety）。
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  createSupabaseOperatorDurationSeedRepository,
  OperatorSeedRepositoryError,
  DURATION_CONFIRMATIONS_TABLE,
  type DurationConfirmationWriteClient,
} from "@/lib/plan/reality/integration/duration-confirmation-source";
import type { DurationConfirmationInsertV0, DurationConfirmationScopeV0 } from "@/lib/plan/realityCore/durationConfirmation";

const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "99999999-9999-4999-8999-999999999999";

const scope = (over: Partial<DurationConfirmationScopeV0> = {}): DurationConfirmationScopeV0 => ({
  targetNodeId: "ern:2026-06-12:a1", originRef: "opaque-o1", destinationRef: "opaque-d1", transportMode: "transit",
  timeBand: null, subjectiveDate: "2026-06-12", temporalScopeRef: "tsr-1", routeEtaSupplyId: null, providerVersion: "v1", ...over,
});
const insertRow = (): DurationConfirmationInsertV0 => ({
  userId: OWNER, sourceAnchorRef: null, scope: scope(),
  durationUpperBoundMinutes: 20, durationLowerBoundMinutes: null, durationBasis: "user_confirmed",
  governance: { provenanceKind: "operator_seed", actorType: "operator", environment: "staging", learningEligible: false, productionEligible: false, confirmedBy: "operator-1", confirmedAt: "2026-06-12T08:00:00+09:00", createdBySlice: "RD3c-P3a", sourceRefs: ["opaque-src"], evidenceRefs: ["opaque-ev"] },
  freshnessStatus: "fresh", validUntil: null, revokedAt: null,
});

type Mode = {
  insertError?: { code?: string; message: string } | null;
  insertData?: { id: string } | null;
  selectData?: Array<{ id: string }> | null;
  selectError?: { message: string } | null;
  updateError?: { message: string } | null;
  throwSync?: boolean;
};
function mockClient(mode: Mode = {}) {
  const calls: Array<{ op: string; table: string; arg?: unknown; filters: Array<[string, unknown]> }> = [];
  const filterBuilder = <D>(op: string, table: string, terminal: () => DCResult<D>) => {
    const filters: Array<[string, unknown]> = [];
    const rec = calls[calls.length - 1];
    const self: Record<string, unknown> = {
      eq(c: string, v: unknown) { filters.push([c, v]); rec!.filters.push([c, v]); return self; },
      is(c: string, v: null) { filters.push([c, v]); rec!.filters.push([c, v]); return self; },
      then(resolve: (r: DCResult<D>) => unknown) { return Promise.resolve(terminal()).then(resolve); },
    };
    return self;
  };
  const client: DurationConfirmationWriteClient = {
    from(table: string) {
      return {
        insert(row: Record<string, unknown>) {
          calls.push({ op: "insert", table, arg: row, filters: [] });
          if (mode.throwSync) throw new Error("auth context invalid");
          return { select: () => ({ single: () => Promise.resolve({ data: mode.insertData ?? { id: "new-1" }, error: mode.insertError ?? null }) }) };
        },
        select(_cols: string) {
          calls.push({ op: "select", table, filters: [] });
          return filterBuilder("select", table, () => ({ data: mode.selectData ?? [], error: mode.selectError ?? null })) as never;
        },
        update(patch: Record<string, unknown>) {
          calls.push({ op: "update", table, arg: patch, filters: [] });
          return filterBuilder("update", table, () => ({ data: null, error: mode.updateError ?? null })) as never;
        },
      };
    },
  };
  return { client, calls };
}
interface DCResult<D> { data: D | null; error: { code?: string; message: string } | null }

describe("RD3c-P3a-wire-AB #10/#12 insert/markSuperseded mapping", () => {
  it("#10 insert は duration_confirmations に flat row（user_id=owner・governance/scope 展開）", async () => {
    const { client, calls } = mockClient({ insertData: { id: "new-1" } });
    const r = await createSupabaseOperatorDurationSeedRepository(client, OWNER).insert(insertRow());
    expect(r).toEqual({ id: "new-1" });
    expect(calls[0]!.op).toBe("insert");
    expect(calls[0]!.table).toBe(DURATION_CONFIRMATIONS_TABLE);
    const payload = calls[0]!.arg as Record<string, unknown>;
    expect(payload.user_id).toBe(OWNER);
    expect(payload.target_node_id).toBe("ern:2026-06-12:a1");
    expect(payload.provenance_kind).toBe("operator_seed");
    expect(payload.learning_eligible).toBe(false);
    expect(payload.duration_upper_bound_minutes).toBe(20);
    // raw nested object を載せない（flat 列）
    expect(payload.scope).toBeUndefined();
    expect(payload.governance).toBeUndefined();
  });
  it("#12 markSuperseded は own row のみ（id + user_id=owner で filter）", async () => {
    const { client, calls } = mockClient();
    await createSupabaseOperatorDurationSeedRepository(client, OWNER).markSuperseded("old-1", "new-1");
    const upd = calls.find((c) => c.op === "update")!;
    expect(upd.table).toBe(DURATION_CONFIRMATIONS_TABLE);
    expect(upd.arg).toEqual({ superseded_by: "new-1" });
    expect(upd.filters).toContainEqual(["id", "old-1"]);
    expect(upd.filters).toContainEqual(["user_id", OWNER]);
  });
});

describe("RD3c-P3a-wire-AB #11 findActiveByScope は active のみ filter", () => {
  it("user_id/scope eq + superseded_by/revoked_at is null", async () => {
    const { client, calls } = mockClient({ selectData: [{ id: "a" }, { id: "b" }] });
    const out = await createSupabaseOperatorDurationSeedRepository(client, OWNER).findActiveByScope(OWNER, scope());
    expect(out).toEqual([{ id: "a" }, { id: "b" }]);
    const sel = calls.find((c) => c.op === "select")!;
    expect(sel.filters).toContainEqual(["user_id", OWNER]);
    expect(sel.filters).toContainEqual(["target_node_id", "ern:2026-06-12:a1"]);
    expect(sel.filters).toContainEqual(["superseded_by", null]);
    expect(sel.filters).toContainEqual(["revoked_at", null]);
  });
  it("read error → [](fail-safe)", async () => {
    const { client } = mockClient({ selectError: { message: "connection reset" }, selectData: null });
    expect(await createSupabaseOperatorDurationSeedRepository(client, OWNER).findActiveByScope(OWNER, scope())).toEqual([]);
  });
});

describe("RD3c-P3a-wire-AB #13/#14/#15 raw DB error sanitization", () => {
  const rawMsg = "duplicate key value violates unique constraint \"...uniq\" DETAIL: Key (user_id)=(11111111-1111-4111-8111-111111111111) already exists.";
  it("#14 unique violation(23505) → active_duplicate_conflict（safe code・raw を出さない）", async () => {
    const { client } = mockClient({ insertError: { code: "23505", message: rawMsg }, insertData: null });
    await expect(createSupabaseOperatorDurationSeedRepository(client, OWNER).insert(insertRow())).rejects.toMatchObject({ code: "active_duplicate_conflict" });
  });
  it("#13/#15 generic DB error → db_insert_failed（raw SQL/UUID/message を出さない）", async () => {
    const { client } = mockClient({ insertError: { message: rawMsg }, insertData: null });
    try {
      await createSupabaseOperatorDurationSeedRepository(client, OWNER).insert(insertRow());
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(OperatorSeedRepositoryError);
      const err = e as OperatorSeedRepositoryError;
      expect(err.code).toBe("db_insert_failed");
      // raw message / UUID / SQL を漏らさない
      expect(err.message).toBe("db_insert_failed");
      expect(err.message).not.toContain(OWNER);
      expect(err.message.toLowerCase()).not.toContain("constraint");
      expect(JSON.stringify(err)).not.toContain(OWNER);
    }
  });
  it("sync throw（auth/network）→ db_insert_failed（raw を出さない）", async () => {
    const { client } = mockClient({ throwSync: true });
    await expect(createSupabaseOperatorDurationSeedRepository(client, OWNER).insert(insertRow())).rejects.toMatchObject({ code: "db_insert_failed" });
  });
  it("supersede error → supersede_failed", async () => {
    const { client } = mockClient({ updateError: { message: "rls denied" } });
    await expect(createSupabaseOperatorDurationSeedRepository(client, OWNER).markSuperseded("x", null)).rejects.toMatchObject({ code: "supersede_failed" });
  });
});

describe("RD3c-P3a-wire-AB #5-#9 server-only / injected client / static-safety", () => {
  const SRC = "lib/plan/reality/integration/duration-confirmation-source.ts";
  const code = fs.readFileSync(path.join(process.cwd(), SRC), "utf8");
  const stripped = code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  it("#5 repository file は server-only", () => {
    expect(code.includes('import "server-only"')).toBe(true);
  });
  it("#7/#8 createClient しない・service_role を使わない（injected client）", () => {
    expect(stripped.includes("createClient")).toBe(false);
    expect(stripped.toLowerCase().includes("service_role")).toBe(false);
  });
  it("#9 reality tree 内で `.from(duration_confirmations)` query を持つのは duration-confirmation-source.ts のみ", () => {
    const root = path.join(process.cwd(), "lib/plan/reality");
    const files = fs.readdirSync(root, { recursive: true }) as string[];
    const offenders: string[] = [];
    for (const rel of files) {
      if (typeof rel !== "string" || !rel.endsWith(".ts")) continue;
      const full = path.join(root, rel);
      if (!fs.statSync(full).isFile()) continue;
      const c = fs.readFileSync(full, "utf8");
      if (/\.from\(\s*DURATION_CONFIRMATIONS_TABLE\s*\)/.test(c) || /\.from\(\s*["']duration_confirmations["']\s*\)/.test(c)) {
        offenders.push(rel.replace(/\\/g, "/"));
      }
    }
    expect(offenders).toEqual(["integration/duration-confirmation-source.ts"]);
  });
});
