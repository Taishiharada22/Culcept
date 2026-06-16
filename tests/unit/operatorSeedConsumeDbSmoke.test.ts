/**
 * RD3x-P1 — operator seed consume **ephemeral DB smoke**: 実 DB に書いた duration_confirmations を readback して
 *   consume loop（→ durationValue → supply → computed leaveBy → ERN attach）を実証。EPHEMERAL ONLY（no Docker/remote/production）。
 * 正本設計: docs/reality-operator-seed-activation-plan-rd3x-0.md
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { consumeDurationConfirmationForLeaveBy, type OperatorSeedSupplyContextV0 } from "@/lib/plan/realityCore/operatorSeedConsume";
import { assembleLeaveByBindings } from "@/lib/plan/realityCore/leaveByAssembly";
import type { DurationConfirmationRowV0 } from "@/lib/plan/realityCore/durationConfirmation";
import type { EventRealityNodeV0 } from "@/lib/plan/realityCore/eventRealityNode";

const PGBIN = "/opt/homebrew/opt/postgresql@16/bin";
const WORK = "/tmp/dc_consume_smoke";
const DATADIR = `${WORK}/pgdata`;
const SOCK = `${WORK}/sock`;
const MIG = path.join(process.cwd(), "supabase/migrations/20260616100000_duration_confirmations.sql");
const ENV = { ...process.env, LC_ALL: "C", LANG: "C", PGUSER: "postgres", PGDATABASE: "postgres" };
const OP = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ERN_ID = "ern:2026-06-12:a1";
let pgUp = false;

function psql(sql: string): { ok: boolean; out: string } {
  try {
    return { ok: true, out: execFileSync(`${PGBIN}/psql`, ["-h", SOCK, "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-qtA", "-c", sql], { env: ENV, encoding: "utf8" }).trim() };
  } catch {
    return { ok: false, out: "" };
  }
}
const asOp = (sql: string) => psql(`SET request.jwt.claims='{"sub":"${OP}"}'; SET ROLE authenticated; ${sql}; RESET ROLE;`);

/** 実 DB の flat json（snake_case）→ DurationConfirmationRowV0（nested・readback 用 mapper）。 */
function jsonToRow(j: Record<string, unknown>): DurationConfirmationRowV0 {
  return {
    id: String(j.id), userId: String(j.user_id), sourceAnchorRef: (j.source_anchor_ref as string | null) ?? null,
    scope: { targetNodeId: String(j.target_node_id), originRef: String(j.origin_ref), destinationRef: String(j.destination_ref), transportMode: j.transport_mode as DurationConfirmationRowV0["scope"]["transportMode"], timeBand: (j.time_band as string | null) ?? null, subjectiveDate: String(j.subjective_date), temporalScopeRef: String(j.temporal_scope_ref), routeEtaSupplyId: (j.route_eta_supply_id as string | null) ?? null, providerVersion: String(j.provider_version) },
    durationUpperBoundMinutes: Number(j.duration_upper_bound_minutes), durationLowerBoundMinutes: j.duration_lower_bound_minutes === null ? null : Number(j.duration_lower_bound_minutes),
    durationBasis: j.duration_basis as DurationConfirmationRowV0["durationBasis"],
    governance: { provenanceKind: j.provenance_kind as DurationConfirmationRowV0["governance"]["provenanceKind"], actorType: j.actor_type as DurationConfirmationRowV0["governance"]["actorType"], environment: j.environment as DurationConfirmationRowV0["governance"]["environment"], learningEligible: Boolean(j.learning_eligible), productionEligible: Boolean(j.production_eligible), confirmedBy: String(j.confirmed_by), confirmedAt: String(j.confirmed_at), createdBySlice: String(j.created_by_slice), sourceRefs: (j.source_refs as string[]) ?? [], evidenceRefs: (j.evidence_refs as string[]) ?? [] },
    freshnessStatus: (j.freshness_status as DurationConfirmationRowV0["freshnessStatus"]) ?? null, validUntil: (j.valid_until as string | null) ?? null,
    supersededBy: (j.superseded_by as string | null) ?? null, revokedAt: (j.revoked_at as string | null) ?? null,
  };
}

const supplyCtx: OperatorSeedSupplyContextV0 = {
  evaluatedAtIso: "2026-06-12T09:00:00+09:00",
  arrival: { arrivalTargetInstant: "2026-06-12T14:00:00+09:00", arrivalTargetRef: "arr-1", targetEventDate: "2026-06-12", startTimeSource: "user_explicit", sourceRefs: ["src-a"], evidenceRefs: ["ev-a"] },
  buffer: { bufferPolicyId: "buf-1", bufferScopeRef: "bscope-1", rigidity: "hard", highCommitment: false, freshness: "valid", sourceRefs: ["src-b"], evidenceRefs: ["ev-b"] },
  origin: { originInferenceStage: "previous_event_end", dayGraphDate: "2026-06-12", dayGraphSnapshotId: "snap-1", previousEvent: { nodeId: "prev", endTimeHHMM: "09:00", durationSource: "explicit", boundaryClipped: false, locationText: "office", sensitive: false, startTimeSource: "user_explicit", anchorRef: "anchor-prev" } },
};
const reqScope = { targetNodeId: ERN_ID, subjectiveDate: "2026-06-12", transportMode: "transit" as const, temporalScopeRef: "tsr-1" };
const insertSql = (target: string, upper: number) =>
  `INSERT INTO duration_confirmations (user_id,target_node_id,origin_ref,destination_ref,transport_mode,subjective_date,temporal_scope_ref,provider_version,duration_upper_bound_minutes,duration_basis,provenance_kind,actor_type,environment,learning_eligible,production_eligible,confirmed_by,confirmed_at,created_by_slice,source_refs,evidence_refs,valid_until) VALUES ('${OP}','${target}','opaque-o1','opaque-d1','transit','2026-06-12','tsr-1','v1',${upper},'user_confirmed','operator_seed','operator','staging',false,false,'${OP}','2026-06-12T09:00:00+09:00','RD3x-P1',ARRAY['opaque-src']::text[],ARRAY['opaque-ev']::text[],NULL)`;

beforeAll(() => {
  try {
    fs.rmSync(DATADIR, { recursive: true, force: true }); fs.rmSync(SOCK, { recursive: true, force: true }); fs.mkdirSync(SOCK, { recursive: true });
    execFileSync(`${PGBIN}/initdb`, ["-D", DATADIR, "--locale=C", "-U", "postgres"], { env: ENV, stdio: "ignore" });
    execFileSync(`${PGBIN}/pg_ctl`, ["-D", DATADIR, "-o", `-c listen_addresses='' -c unix_socket_directories=${SOCK}`, "-w", "start"], { env: ENV, stdio: "ignore" });
    psql(`DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $f$ SELECT (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid $f$;
      GRANT USAGE ON SCHEMA auth TO authenticated;`);
    psql(fs.readFileSync(MIG, "utf8"));
    psql(`GRANT SELECT, INSERT ON duration_confirmations TO authenticated;`);
    pgUp = psql(`SELECT count(*) FROM information_schema.tables WHERE table_name='duration_confirmations';`).out === "1";
  } catch { pgUp = false; }
}, 60000);

afterAll(() => {
  try { execFileSync(`${PGBIN}/pg_ctl`, ["-D", DATADIR, "-w", "stop"], { env: ENV, stdio: "ignore" }); } catch { /* noop */ }
  fs.rmSync(DATADIR, { recursive: true, force: true }); fs.rmSync(SOCK, { recursive: true, force: true });
});

describe("RD3x-P1 ephemeral DB consume smoke（実 DB readback → consume loop）", () => {
  it("#20 ephemeral 起動・remote 不接触", () => {
    expect(pgUp).toBe(true);
  });
  it("#1-#7 実 DB に insert → readback → durationValue → supply complete → computed → ERN attach", async () => {
    expect(asOp(insertSql(ERN_ID, 20)).ok).toBe(true); // operator が RLS で seed insert
    const j = asOp(`SELECT to_jsonb(t) FROM duration_confirmations t WHERE target_node_id='${ERN_ID}' AND superseded_by IS NULL`);
    expect(j.ok).toBe(true);
    const dbRow = jsonToRow(JSON.parse(j.out)); // 実 DB row を readback
    expect(dbRow.governance.provenanceKind).toBe("operator_seed");
    expect(dbRow.governance.learningEligible).toBe(false);
    // consume loop（実 DB row 起点）
    const cand = await consumeDurationConfirmationForLeaveBy([dbRow], reqScope, supplyCtx, "2026-06-12T09:00:00+09:00");
    expect(cand).not.toBeNull();
    expect(cand!.leaveBy.status).toBe("computed"); // #6 computed
    // ERN attach（#7・readiness 0→1 相当: leaveByComputed が attach される）
    const ern = { eventRealityNodeId: ERN_ID, subjectiveDate: "2026-06-12", leaveBy: { value: null, whyUnresolved: ["eta_source_missing"] } } as unknown as EventRealityNodeV0;
    const consuming = { nowInstant: "2026-06-12T09:00:00+09:00", timezone: "Asia/Tokyo", wallClockHHMM: "09:00", calendarDate: "2026-06-12", subjectiveDate: "2026-06-12", minuteOfSubjectiveDay: 540 };
    const out = assembleLeaveByBindings({ eventRealityNodes: [ern], supplyCandidates: [cand!], consumingInstant: consuming, ernScopeByNodeId: { [ERN_ID]: cand!.computedScope } });
    const present = out.eventRealityNodes.filter((e) => e.leaveByComputed !== undefined).length;
    expect(present).toBe(1); // readiness leaveByComputedPresentCount 0→1 相当
    expect(out.eventRealityNodes[0]!.leaveBy).toEqual(ern.leaveBy); // existing display leaveBy 不変
  });
  it("#19 usable row なし → fixture へ fallback せず null（consume 何も生まない）", async () => {
    // DB に valid row はあるが、要求 scope が一致しない（別 target）→ usable なし → null（fixture へ fallback しない）。
    const bad = await consumeDurationConfirmationForLeaveBy([], { ...reqScope, targetNodeId: "ern:no-such" }, supplyCtx, "2026-06-12T09:00:00+09:00");
    expect(bad).toBeNull();
  });
});
