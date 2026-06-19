/**
 * RD3x-ACTIVATE-0 — **end-to-end activation smoke**（実 write → 実 read → operator preview safe boolean）。
 *   operator seed を実 glue で実 DB に write → 実 reader(`createSupabaseOperatorDurationSeedReader`)で read →
 *   `buildOperatorDayRealPayload`(flag ON) に注入 → `leaveByComputedPresent` が **実データで true** になることを実証。
 *   EPHEMERAL ONLY（no Docker / no remote / no production・linked ref aljav 不接触・service_role 不使用）。
 * 正本設計: docs/reality-staging-dogfood-activation-rd3x-activate-0.md
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  createOperatorDurationSeedServer,
  type OperatorDurationSeedServerDepsV0,
} from "@/lib/plan/reality/integration/operator-duration-seed-glue";
import {
  createSupabaseOperatorDurationSeedReader,
  type DurationConfirmationReadClient,
  type DurationConfirmationWriteClient,
} from "@/lib/plan/reality/integration/duration-confirmation-source";
import { CAPTURE_STAGING_REF_ALLOWLIST, CAPTURE_PROD_REF_DENYLIST } from "@/lib/plan/reality/capture-gate";
import type { OperatorDurationSeedRequestV0 } from "@/lib/plan/realityCore/operatorDurationSeedWrite";
import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import type { OperatorDayPreviewDeps } from "@/lib/plan/realityCore/operatorDayPreview";

const PGBIN = "/opt/homebrew/opt/postgresql@16/bin";
const WORK = "/tmp/dc_activate_smoke";
const DATADIR = `${WORK}/pgdata`;
const SOCK = `${WORK}/sock`;
const MIG = path.join(process.cwd(), "supabase/migrations/20260616100000_duration_confirmations.sql");
const ENV = { ...process.env, LC_ALL: "C", LANG: "C", PGUSER: "postgres", PGDATABASE: "postgres" };
const OPERATOR = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const GENERAL_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const STAGING_URL = `https://${CAPTURE_STAGING_REF_ALLOWLIST[0]}.supabase.co`;
const SUBJ = "2026-06-12";
const REF = new Date(Date.UTC(2026, 5, 12, 0, 0)); // JST 09:00 → subjectiveDate 2026-06-12
const ERN = (id: string) => `ern:${SUBJ}:${id}`;
let pgAvailable = false;

function psql(sql: string): { ok: boolean; out: string; err: string } {
  try {
    const out = execFileSync(`${PGBIN}/psql`, ["-h", SOCK, "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-qtA", "-c", sql], { env: ENV, encoding: "utf8" });
    return { ok: true, out: out.trim(), err: "" };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string };
    return { ok: false, out: (err.stdout ?? "").trim(), err: (err.stderr ?? "").trim() };
  }
}
const asUser = (sub: string, sql: string) => psql(`SET request.jwt.claims='{"sub":"${sub}"}'; SET ROLE authenticated; ${sql}; RESET ROLE;`);

function lit(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return v.length === 0 ? "ARRAY[]::text[]" : `ARRAY[${v.map((x) => lit(x)).join(",")}]::text[]`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

/** psql-backed write client（実 glue → repository を実 DB に通す）。 */
function makeWriteClient(sub: string): DurationConfirmationWriteClient {
  const T = "duration_confirmations";
  const filterBuilder = <D>(baseSql: () => string, parse: (r: { ok: boolean; out: string; err: string }) => { data: D | null; error: { code?: string; message: string } | null }) => {
    const filters: Array<[string, unknown]> = [];
    const build = () => {
      const where = filters.map(([c, v]) => (v === null ? `${c} IS NULL` : `${c}=${lit(v)}`)).join(" AND ");
      return `${baseSql()}${where ? ` WHERE ${where}` : ""}`;
    };
    const self: Record<string, unknown> = {
      eq(c: string, v: unknown) { filters.push([c, v]); return self; },
      is(c: string, v: null) { filters.push([c, v]); return self; },
      then(resolve: (r: { data: D | null; error: { code?: string; message: string } | null }) => unknown) {
        return Promise.resolve(parse(asUser(sub, build()))).then(resolve);
      },
    };
    return self;
  };
  return {
    from() {
      return {
        insert(row: Record<string, unknown>) {
          const cols = Object.keys(row);
          const sql = `INSERT INTO ${T} (${cols.join(",")}) VALUES (${cols.map((c) => lit(row[c])).join(",")}) RETURNING id`;
          return { select() { return { single() {
            const r = asUser(sub, sql);
            if (!r.ok) return Promise.resolve({ data: null, error: { code: /duplicate key|unique constraint/i.test(r.err) ? "23505" : undefined, message: "db_error" } });
            return Promise.resolve({ data: { id: r.out }, error: null });
          } }; } };
        },
        select() { return filterBuilder<Array<{ id: string }>>(() => `SELECT id FROM ${T}`, (r) => (r.ok ? { data: r.out ? r.out.split("\n").map((id) => ({ id })) : [], error: null } : { data: null, error: { message: "db_error" } })) as never; },
        update(patch: Record<string, unknown>) {
          const set = Object.keys(patch).map((c) => `${c}=${lit(patch[c])}`).join(",");
          return filterBuilder<unknown>(() => `UPDATE ${T} SET ${set}`, (r) => (r.ok ? { data: null, error: null } : { data: null, error: { message: "db_error" } })) as never;
        },
      };
    },
  };
}

/** psql-backed read client（select * → to_jsonb 行配列・RLS は sub で適用）。 */
function makeReadClient(sub: string): DurationConfirmationReadClient {
  const T = "duration_confirmations";
  return {
    from() {
      return {
        select() {
          const filters: Array<[string, unknown]> = [];
          const build = () => {
            const where = filters.map(([c, v]) => (v === null ? `${c} IS NULL` : `${c}=${lit(v)}`)).join(" AND ");
            return `SELECT to_jsonb(t) FROM ${T} t${where ? ` WHERE ${where}` : ""}`;
          };
          const self: Record<string, unknown> = {
            eq(c: string, v: unknown) { filters.push([c, v]); return self; },
            is(c: string, v: null) { filters.push([c, v]); return self; },
            then(resolve: (r: { data: ReadonlyArray<Record<string, unknown>> | null; error: { message: string } | null }) => unknown) {
              const r = asUser(sub, build());
              if (!r.ok) return Promise.resolve(resolve({ data: null, error: { message: "db_error" } }));
              const rows = r.out ? r.out.split("\n").map((l) => JSON.parse(l) as Record<string, unknown>) : [];
              return Promise.resolve(resolve({ data: rows, error: null }));
            },
          };
          return self as never;
        },
      };
    },
  };
}

const request = (over: Partial<OperatorDurationSeedRequestV0> = {}): OperatorDurationSeedRequestV0 => ({
  userId: "CLIENT-IGNORED", sourceAnchorRef: null,
  scope: { targetNodeId: ERN("tgt"), originRef: "o1", destinationRef: "d1", transportMode: "transit", timeBand: null, subjectiveDate: SUBJ, temporalScopeRef: "tsr-1", routeEtaSupplyId: null, providerVersion: "v1" },
  durationUpperBoundMinutes: 20, durationLowerBoundMinutes: null, durationBasis: "user_confirmed",
  confirmedBy: "CLIENT-IGNORED", sourceRefs: ["opaque-src"], evidenceRefs: ["opaque-ev"], freshnessStatus: "fresh", validUntil: null, ...over,
});
const writeDeps = (sub: string, supabaseUrl: string, allowlist: string[]): OperatorDurationSeedServerDepsV0 => ({
  gateInput: { flagEnabled: true, nodeEnv: "development", supabaseUrl, operatorAllowlist: allowlist, requestedUserId: sub },
  client: makeWriteClient(sub), nowIso: "2026-06-12T08:00:00+09:00",
});

function oneOff(over: Partial<ExternalAnchor> & { id: string; startTime: string }): ExternalAnchor {
  return { anchorKind: "one_off", userId: OPERATOR, sourceId: "src-real", title: "予定", date: SUBJ, rigidity: "soft", confirmedAt: "2026-06-01T00:00:00.000Z", ...over } as unknown as ExternalAnchor;
}
const TARGET = oneOff({ id: "tgt", startTime: "14:00", endTime: "15:00", startTimeSource: "user_explicit", locationText: "オフィス渋谷" });
const PREV = oneOff({ id: "prv", startTime: "09:00", endTime: "10:00", startTimeSource: "user_explicit", locationText: "自宅" });

beforeAll(() => {
  try {
    fs.rmSync(DATADIR, { recursive: true, force: true });
    fs.rmSync(SOCK, { recursive: true, force: true });
    fs.mkdirSync(SOCK, { recursive: true });
    execFileSync(`${PGBIN}/initdb`, ["-D", DATADIR, "--locale=C", "-U", "postgres"], { env: ENV, stdio: "ignore" });
    execFileSync(`${PGBIN}/pg_ctl`, ["-D", DATADIR, "-o", `-c listen_addresses='' -c unix_socket_directories=${SOCK}`, "-w", "start"], { env: ENV, stdio: "ignore" });
    psql(`DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $f$ SELECT (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid $f$;
      GRANT USAGE ON SCHEMA auth TO authenticated;`);
    const applied = psql(fs.readFileSync(MIG, "utf8"));
    psql(`GRANT SELECT, INSERT, UPDATE ON duration_confirmations TO authenticated;`);
    pgAvailable = applied.ok && psql(`SELECT count(*) FROM information_schema.tables WHERE table_name='duration_confirmations';`).out === "1";
  } catch {
    pgAvailable = false;
  }
}, 60000);

afterAll(() => {
  try { execFileSync(`${PGBIN}/pg_ctl`, ["-D", DATADIR, "-w", "stop"], { env: ENV, stdio: "ignore" }); } catch { /* noop */ }
  vi.unstubAllEnvs();
  vi.resetModules();
  fs.rmSync(DATADIR, { recursive: true, force: true });
  fs.rmSync(SOCK, { recursive: true, force: true });
});

describe("RD3x-ACTIVATE-0 preflight（ephemeral apply・remote 不接触）", () => {
  it("#1 ephemeral 起動・migration apply・RLS・partial unique index", () => {
    expect(pgAvailable).toBe(true);
    expect(psql(`SELECT relrowsecurity FROM pg_class WHERE relname='duration_confirmations';`).out).toBe("t");
    expect(psql(`SELECT count(*) FROM pg_indexes WHERE indexname='duration_confirmations_active_scope_uniq';`).out).toBe("1");
  });
  it("#2 ref 定数: staging=hjcr / production=aljav（denylist・staging≠production）", () => {
    expect(CAPTURE_STAGING_REF_ALLOWLIST[0]).toBe("hjcrvndumgiovyfdacwc");
    expect(CAPTURE_PROD_REF_DENYLIST[0]).toBe("aljavfujeqcwnqryjmhl");
    expect(CAPTURE_STAGING_REF_ALLOWLIST[0]).not.toBe(CAPTURE_PROD_REF_DENYLIST[0]);
  });
});

describe("RD3x-ACTIVATE-0 real write/read smoke", () => {
  it("#3 operator seed real write（glue→実 DB）→ readback で operator_seed/staging/eligible=false", async () => {
    const r = await createOperatorDurationSeedServer(request(), writeDeps(OPERATOR, STAGING_URL, [OPERATOR]));
    expect(r.ok).toBe(true);
    expect((r as { environment: string }).environment).toBe("staging");
    const row = asUser(OPERATOR, `SELECT provenance_kind||'|'||environment||'|'||learning_eligible||'|'||production_eligible FROM duration_confirmations WHERE target_node_id='${ERN("tgt")}' AND superseded_by IS NULL`);
    expect(row.out).toBe("operator_seed|staging|false|false");
  });
  it("#4 real read（reader→実 DB）→ operator 自身は当日 active seed を full row で取得", async () => {
    const reader = createSupabaseOperatorDurationSeedReader(makeReadClient(OPERATOR));
    const rows = await reader.listActiveByOwnerForDate(OPERATOR, SUBJ);
    expect(rows.length).toBe(1);
    expect(rows[0]!.scope.targetNodeId).toBe(ERN("tgt"));
    expect(rows[0]!.governance.provenanceKind).toBe("operator_seed");
    expect(rows[0]!.durationUpperBoundMinutes).toBe(20);
  });
  it("#5 RLS: 一般 user(B) read に operator_seed が漏れない（owner_select 構造排除）", async () => {
    const readerB = createSupabaseOperatorDurationSeedReader(makeReadClient(GENERAL_B));
    expect((await readerB.listActiveByOwnerForDate(GENERAL_B, SUBJ)).length).toBe(0);
    expect(asUser(GENERAL_B, `SELECT count(*) FROM duration_confirmations WHERE provenance_kind='operator_seed'`).out).toBe("0");
  });
  it("#6 別日 read → []（fail-safe・raw を出さない）", async () => {
    const reader = createSupabaseOperatorDurationSeedReader(makeReadClient(OPERATOR));
    expect((await reader.listActiveByOwnerForDate(OPERATOR, "2026-06-13")).length).toBe(0);
  });
});

describe("RD3x-ACTIVATE-0 end-to-end: 実 read → operator preview safe boolean", () => {
  it("#7 flag ON + 実 reader 注入 → leaveByComputedPresent=true（real data）・leak 0・exact instant/raw 非露出", async () => {
    vi.stubEnv("REALITY_OPERATOR_PREVIEW_LEAVEBY", "true");
    vi.resetModules();
    const mod = await import("@/lib/plan/realityCore/operatorDayPreview");
    const reader = createSupabaseOperatorDurationSeedReader(makeReadClient(OPERATOR));
    const deps: OperatorDayPreviewDeps = {
      listAnchors: async () => [PREV, TARGET],
      listDurationConfirmations: (uid) => reader.listActiveByOwnerForDate(uid, SUBJ),
    };
    const p = await mod.buildOperatorDayRealPayload({ operatorUserId: OPERATOR, referenceInstantUtc: REF }, deps);
    expect(p.available).toBe(true);
    expect(p.leaveByComputedPresent).toBe(true); // ★ 実 DB seed → durationValue → supply → computed → boolean true
    expect(mod.realDayPayloadLeakViolations(p)).toEqual([]); // safe DTO
    // RD3g-P1: `departureLineCandidatePresent`（L2 safe boolean）は "departureline" substring を含むため strip してから検査。
    const json = JSON.stringify(p).toLowerCase().split("departurelinecandidatepresent").join("");
    expect(/t\d{2}:\d{2}:\d{2}\+09:00/.test(JSON.stringify(p))).toBe(false); // exact instant 非露出
    for (const raw of ["オフィス渋谷", "自宅", "src-real", "予定"]) expect(JSON.stringify(p)).not.toContain(raw); // raw anchor 非露出
    // departure LINE（exact 出発時刻行）/ notification は出さない（departureStatus[unresolved schema-state]は safe ゆえ除外）。
    expect(json.includes("departureline")).toBe(false);
    expect(json.includes("notification")).toBe(false);
    expect(json.includes("leavebyinstant")).toBe(false);
    expect(json.includes("timecontract")).toBe(false);
  });
  it("#8 flag OFF → reader を読まず leaveByComputedPresent=false", async () => {
    vi.stubEnv("REALITY_OPERATOR_PREVIEW_LEAVEBY", "false");
    vi.resetModules();
    const mod = await import("@/lib/plan/realityCore/operatorDayPreview");
    let read = false;
    const deps: OperatorDayPreviewDeps = {
      listAnchors: async () => [PREV, TARGET],
      listDurationConfirmations: async () => { read = true; return []; },
    };
    const p = await mod.buildOperatorDayRealPayload({ operatorUserId: OPERATOR, referenceInstantUtc: REF }, deps);
    expect(p.available).toBe(true);
    expect(p.leaveByComputedPresent).toBe(false);
    expect(read).toBe(false);
  });
});
