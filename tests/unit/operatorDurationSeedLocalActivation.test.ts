/**
 * RD3c-P3-local-activation — **real glue smoke**: 実 glue(createOperatorDurationSeedServer) を **実 ephemeral Postgres** に
 *   psql-backed adapter で接続して end-to-end 動作確認（mock でない）。EPHEMERAL ONLY（no Docker / no remote / no production）。
 * 正本設計: docs/reality-operator-seed-wiring-rd3-c-p3a-wire-0.md
 *
 * 環境制約: Docker 停止ゆえ local persistent Supabase stack 不可・node-postgres 未導入 → ephemeral Postgres + psql 経由。
 *   linked remote ref(aljav) 不接触・`supabase db push` 未実行・service_role 不使用。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  createOperatorDurationSeedServer,
  type OperatorDurationSeedServerDepsV0,
} from "@/lib/plan/reality/integration/operator-duration-seed-glue";
import { CAPTURE_STAGING_REF_ALLOWLIST, CAPTURE_PROD_REF_DENYLIST } from "@/lib/plan/reality/capture-gate";
import type { DurationConfirmationWriteClient } from "@/lib/plan/reality/integration/duration-confirmation-source";
import type { OperatorDurationSeedRequestV0 } from "@/lib/plan/realityCore/operatorDurationSeedWrite";

const PGBIN = "/opt/homebrew/opt/postgresql@16/bin";
const WORK = "/tmp/dc_glue_smoke";
const DATADIR = `${WORK}/pgdata`;
const SOCK = `${WORK}/sock`;
const MIG = path.join(process.cwd(), "supabase/migrations/20260616100000_duration_confirmations.sql");
const ENV = { ...process.env, LC_ALL: "C", LANG: "C", PGUSER: "postgres", PGDATABASE: "postgres" };
const OPERATOR = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const GENERAL_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const STAGING_URL = `https://${CAPTURE_STAGING_REF_ALLOWLIST[0]}.supabase.co`;
const PROD_URL = `https://${CAPTURE_PROD_REF_DENYLIST[0]}.supabase.co`;

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
/** RLS 適用: authenticated role + jwt sub で実行。 */
const asUser = (sub: string, sql: string) => psql(`SET request.jwt.claims='{"sub":"${sub}"}'; SET ROLE authenticated; ${sql}; RESET ROLE;`);

function lit(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return v.length === 0 ? "ARRAY[]::text[]" : `ARRAY[${v.map((x) => lit(x)).join(",")}]::text[]`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

/** psql-backed DurationConfirmationWriteClient（実 glue→repository を実 DB に通す・RLS は operatorSub で適用）。 */
function makePsqlClient(operatorSub: string): DurationConfirmationWriteClient {
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
        return Promise.resolve(parse(asUser(operatorSub, build()))).then(resolve);
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
          return {
            select() {
              return {
                single() {
                  const r = asUser(operatorSub, sql);
                  if (!r.ok) {
                    const code = /duplicate key|unique constraint/i.test(r.err) ? "23505" : undefined;
                    return Promise.resolve({ data: null, error: { code, message: "db_error" } });
                  }
                  return Promise.resolve({ data: { id: r.out }, error: null });
                },
              };
            },
          };
        },
        select() {
          return filterBuilder<Array<{ id: string }>>(() => `SELECT id FROM ${T}`, (r) => (r.ok ? { data: r.out ? r.out.split("\n").map((id) => ({ id })) : [], error: null } : { data: null, error: { message: "db_error" } })) as never;
        },
        update(patch: Record<string, unknown>) {
          const set = Object.keys(patch).map((c) => `${c}=${lit(patch[c])}`).join(",");
          return filterBuilder<unknown>(() => `UPDATE ${T} SET ${set}`, (r) => (r.ok ? { data: null, error: null } : { data: null, error: { message: "db_error" } })) as never;
        },
      };
    },
  };
}

const request = (over: Partial<OperatorDurationSeedRequestV0> = {}): OperatorDurationSeedRequestV0 => ({
  userId: "CLIENT-IGNORED", sourceAnchorRef: null,
  scope: { targetNodeId: "ern:2026-06-12:a1", originRef: "o1", destinationRef: "d1", transportMode: "transit", timeBand: null, subjectiveDate: "2026-06-12", temporalScopeRef: "tsr-1", routeEtaSupplyId: null, providerVersion: "v1" },
  durationUpperBoundMinutes: 20, durationLowerBoundMinutes: null, durationBasis: "user_confirmed",
  confirmedBy: "CLIENT-IGNORED", sourceRefs: ["opaque-src"], evidenceRefs: ["opaque-ev"], freshnessStatus: "fresh", validUntil: null, ...over,
});
const deps = (sub: string, supabaseUrl: string, allowlist: string[]): OperatorDurationSeedServerDepsV0 => ({
  gateInput: { flagEnabled: true, nodeEnv: "development", supabaseUrl, operatorAllowlist: allowlist, requestedUserId: sub },
  client: makePsqlClient(sub), nowIso: "2026-06-12T08:00:00+09:00",
});

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
  fs.rmSync(DATADIR, { recursive: true, force: true });
  fs.rmSync(SOCK, { recursive: true, force: true });
});

describe("RD3c-P3-local-activation #2-#5 local(ephemeral) apply + structure", () => {
  it("#1 ephemeral 起動・#2 migration apply 済（remote 不接触）", () => {
    expect(pgAvailable).toBe(true);
  });
  it("#3 table / #4 RLS / #5 partial unique index", () => {
    expect(psql(`SELECT relrowsecurity FROM pg_class WHERE relname='duration_confirmations';`).out).toBe("t");
    expect(psql(`SELECT count(*) FROM pg_indexes WHERE indexname='duration_confirmations_active_scope_uniq';`).out).toBe("1");
  });
});

describe("RD3c-P3-local-activation #7-#17 real glue smoke（実 glue → 実 DB）", () => {
  it("#7 allowlisted operator → insert 成功・readback で operator_seed/staging/eligible=false", async () => {
    const r = await createOperatorDurationSeedServer(request(), deps(OPERATOR, STAGING_URL, [OPERATOR]));
    expect(r.ok).toBe(true);
    expect((r as { environment: string }).environment).toBe("staging");
    // #13/#14 readback（operator 自身）
    const row = asUser(OPERATOR, `SELECT provenance_kind||'|'||environment||'|'||learning_eligible||'|'||production_eligible||'|'||user_id FROM duration_confirmations WHERE confirmed_by='${OPERATOR}' AND superseded_by IS NULL`);
    expect(row.out).toBe(`operator_seed|staging|false|false|${OPERATOR}`);
  });
  it("#6 owner general(B) read に operator_seed が出ない", () => {
    const b = asUser(GENERAL_B, `SELECT count(*) FROM duration_confirmations WHERE provenance_kind='operator_seed'`);
    expect(b.out).toBe("0");
  });
  it("#8 non-operator → reject（gate deny・DB 書き込みなし）", async () => {
    const before = psql(`SELECT count(*) FROM duration_confirmations`).out;
    const r = await createOperatorDurationSeedServer(request({ scope: { ...request().scope, targetNodeId: "ern:nonop" } }), deps("cccccccc-cccc-4ccc-8ccc-cccccccccccc", STAGING_URL, [OPERATOR]));
    expect(r.ok).toBe(false);
    expect((r as { code: string }).code).toBe("gate_user_not_operator");
    expect(psql(`SELECT count(*) FROM duration_confirmations`).out).toBe(before);
  });
  it("#9 production ref → reject（gate deny）", async () => {
    const r = await createOperatorDurationSeedServer(request({ scope: { ...request().scope, targetNodeId: "ern:prod" } }), deps(OPERATOR, PROD_URL, [OPERATOR]));
    expect(r.ok).toBe(false);
    expect((r as { code: string }).code).toBe("gate_production_project_ref");
  });
  it("#10/#11/#12 同一 scope 再 seed → supersede chain（active 1 行・物理 delete しない）", async () => {
    const sc = { ...request().scope, targetNodeId: "ern:dup", temporalScopeRef: "tsr-dup" };
    const r1 = await createOperatorDurationSeedServer(request({ scope: sc, durationUpperBoundMinutes: 20 }), deps(OPERATOR, STAGING_URL, [OPERATOR]));
    expect(r1.ok).toBe(true);
    const r2 = await createOperatorDurationSeedServer(request({ scope: sc, durationUpperBoundMinutes: 25 }), deps(OPERATOR, STAGING_URL, [OPERATOR]));
    expect(r2.ok).toBe(true); // 既存を supersede してから insert
    expect((r2 as unknown as { supersededIds: string[] }).supersededIds.length).toBe(1); // #11 supersede chain
    // #12 active は 1 行・#10 物理 delete しない（履歴 2 行残る）
    expect(asUser(OPERATOR, `SELECT count(*) FROM duration_confirmations WHERE target_node_id='ern:dup' AND superseded_by IS NULL AND revoked_at IS NULL`).out).toBe("1");
    expect(asUser(OPERATOR, `SELECT count(*) FROM duration_confirmations WHERE target_node_id='ern:dup'`).out).toBe("2"); // 履歴保持
  });
  it("#16/#17 raw DB error / UUID / SQL を result に出さない（validation 失敗も safe code）", async () => {
    const r = await createOperatorDurationSeedServer(request({ durationUpperBoundMinutes: 23 }), deps(OPERATOR, STAGING_URL, [OPERATOR]));
    expect(r.ok).toBe(false);
    expect((r as { code: string }).code).toBe("validation_failed");
    expect(JSON.stringify(r)).not.toContain(OPERATOR);
    expect(JSON.stringify(r).toLowerCase()).not.toContain("constraint");
  });
});
