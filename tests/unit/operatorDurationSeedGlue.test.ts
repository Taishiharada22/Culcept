/**
 * RD3c-P3a-wire-C — operator gate + server-only glue（gate→user-RLS client→repository→orchestration）（2026-06-16）
 * 正本設計: docs/reality-operator-seed-wiring-rd3-c-p3a-wire-0.md §2/§3/§6
 *
 * 核: operator だけが dogfood/staging で seed write を呼べる。**server が user/environment/provenance を固定**し
 *   client から isOperator/environment/provenance を受けない。gate deny → repository 不呼出。raw DB error は safe code。
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  evaluateOperatorDurationSeedGate,
  type OperatorDurationSeedGateInput,
} from "@/lib/plan/reality/operator-duration-seed-gate";
import { CAPTURE_STAGING_REF_ALLOWLIST, CAPTURE_PROD_REF_DENYLIST } from "@/lib/plan/reality/capture-gate";
import {
  createOperatorDurationSeedServer,
  resolveOperatorDurationSeedGateInputFromEnv,
  type OperatorDurationSeedServerDepsV0,
} from "@/lib/plan/reality/integration/operator-duration-seed-glue";
import type { DurationConfirmationWriteClient } from "@/lib/plan/reality/integration/duration-confirmation-source";
import type { OperatorDurationSeedRequestV0 } from "@/lib/plan/realityCore/operatorDurationSeedWrite";

const OP = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const STAGING_URL = `https://${CAPTURE_STAGING_REF_ALLOWLIST[0]}.supabase.co`;
const PROD_URL = `https://${CAPTURE_PROD_REF_DENYLIST[0]}.supabase.co`;
const DOGFOOD_URL = "http://localhost:54321"; // ref 解決不能（local dev）→ dogfood

const gateInput = (over: Partial<OperatorDurationSeedGateInput> = {}): OperatorDurationSeedGateInput => ({
  flagEnabled: true, nodeEnv: "development", supabaseUrl: STAGING_URL, operatorAllowlist: [OP], requestedUserId: OP, ...over,
});

// ── gate（#1-#9）──
describe("RD3c-P3a-wire-C gate（capture-gate 同型・fail-closed）", () => {
  it("#1 flag OFF → deny", () => {
    expect(evaluateOperatorDurationSeedGate(gateInput({ flagEnabled: false }))).toEqual({ allow: false, reason: "FLAG_OFF" });
  });
  it("#2 production nodeEnv → deny", () => {
    expect(evaluateOperatorDurationSeedGate(gateInput({ nodeEnv: "production" }))).toEqual({ allow: false, reason: "PRODUCTION_NODE_ENV" });
  });
  it("#3 production ref → deny（nodeEnv に依らず）", () => {
    expect(evaluateOperatorDurationSeedGate(gateInput({ supabaseUrl: PROD_URL }))).toEqual({ allow: false, reason: "PRODUCTION_PROJECT_REF" });
  });
  it("#4 staging ref + allowlisted → allow(staging) / dogfood ref → allow(dogfood)", () => {
    expect(evaluateOperatorDurationSeedGate(gateInput({ supabaseUrl: STAGING_URL }))).toEqual({ allow: true, environment: "staging" });
    expect(evaluateOperatorDurationSeedGate(gateInput({ supabaseUrl: DOGFOOD_URL }))).toEqual({ allow: true, environment: "dogfood" });
  });
  it("#5 allowlist empty → deny", () => {
    expect(evaluateOperatorDurationSeedGate(gateInput({ operatorAllowlist: [] }))).toEqual({ allow: false, reason: "NO_OPERATOR_ALLOWLIST" });
  });
  it("#6 non-allowlisted user → deny", () => {
    expect(evaluateOperatorDurationSeedGate(gateInput({ requestedUserId: "other" }))).toEqual({ allow: false, reason: "USER_NOT_OPERATOR" });
  });
  it("user 不在 → deny", () => {
    expect(evaluateOperatorDurationSeedGate(gateInput({ requestedUserId: null }))).toEqual({ allow: false, reason: "NO_USER" });
  });
  it("#7 environment は server-side で resolve（staging vs dogfood・production は allow に到達しない）", () => {
    expect((evaluateOperatorDurationSeedGate(gateInput({ supabaseUrl: STAGING_URL })) as { environment: string }).environment).toBe("staging");
    expect((evaluateOperatorDurationSeedGate(gateInput({ supabaseUrl: DOGFOOD_URL })) as { environment: string }).environment).toBe("dogfood");
  });
});

// ── glue（#10-#16）──
function fakeClient(opts: { insertError?: { code?: string; message: string } | null; insertData?: { id: string } | null; selectData?: Array<{ id: string }> } = {}) {
  const inserts: Record<string, unknown>[] = [];
  const filter = <D>(terminal: () => { data: D | null; error: unknown }) => {
    const b: Record<string, unknown> = {
      eq() { return b; }, is() { return b; },
      then(resolve: (r: unknown) => unknown) { return Promise.resolve(terminal()).then(resolve); },
    };
    return b;
  };
  const client: DurationConfirmationWriteClient = {
    from() {
      return {
        insert(row: Record<string, unknown>) {
          inserts.push(row);
          return { select: () => ({ single: () => Promise.resolve({ data: opts.insertError ? null : (opts.insertData ?? { id: "new-1" }), error: opts.insertError ?? null }) }) };
        },
        select() { return filter(() => ({ data: opts.selectData ?? [], error: null })) as never; },
        update() { return filter(() => ({ data: null, error: null })) as never; },
      };
    },
  };
  return { client, inserts };
}
const request = (over: Partial<OperatorDurationSeedRequestV0> = {}): OperatorDurationSeedRequestV0 => ({
  userId: "CLIENT-SUPPLIED-IGNORED", sourceAnchorRef: null,
  scope: { targetNodeId: "ern:2026-06-12:a1", originRef: "o1", destinationRef: "d1", transportMode: "transit", timeBand: null, subjectiveDate: "2026-06-12", temporalScopeRef: "tsr-1", routeEtaSupplyId: null, providerVersion: "v1" },
  durationUpperBoundMinutes: 20, durationLowerBoundMinutes: null, durationBasis: "user_confirmed",
  confirmedBy: "CLIENT-SUPPLIED-IGNORED", sourceRefs: ["opaque-src"], evidenceRefs: ["opaque-ev"], freshnessStatus: "fresh", validUntil: null, ...over,
});
const deps = (client: DurationConfirmationWriteClient, gi: Partial<OperatorDurationSeedGateInput> = {}): OperatorDurationSeedServerDepsV0 => ({
  gateInput: gateInput(gi), client, nowIso: "2026-06-12T08:00:00+09:00",
});

describe("RD3c-P3a-wire-C glue（server が user/env/provenance 固定）", () => {
  it("#11 gate deny → repository 不呼出（insert なし）・safe code", async () => {
    const { client, inserts } = fakeClient();
    const r = await createOperatorDurationSeedServer(request(), deps(client, { flagEnabled: false }));
    expect(r.ok).toBe(false);
    expect((r as { code: string }).code).toBe("gate_flag_off");
    expect(inserts.length).toBe(0);
  });
  it("#12 gate allow → repository 呼出・provenance/env/user は server 固定", async () => {
    const { client, inserts } = fakeClient({ insertData: { id: "new-1" } });
    const r = await createOperatorDurationSeedServer(request(), deps(client, { supabaseUrl: STAGING_URL }));
    expect(r.ok).toBe(true);
    expect((r as { environment: string }).environment).toBe("staging");
    expect(inserts.length).toBe(1);
    const row = inserts[0]!;
    expect(row.provenance_kind).toBe("operator_seed"); // #10 server 固定
    expect(row.actor_type).toBe("operator");
    expect(row.learning_eligible).toBe(false);
    expect(row.production_eligible).toBe(false);
    expect(row.environment).toBe("staging"); // #9 server-resolved（client から受けない）
    expect(row.user_id).toBe(OP); // #8 server-resolved auth.uid()（client の "CLIENT-SUPPLIED-IGNORED" を無視）
    expect(row.confirmed_by).toBe(OP);
  });
  it("#8/#9/#10 client が isOperator/environment/provenanceKind を注入しても無視される", async () => {
    const { client, inserts } = fakeClient({ insertData: { id: "x" } });
    const sneaky = { ...request(), isOperator: true, environment: "production", provenanceKind: "general_user_confirmed", learningEligible: true } as unknown as OperatorDurationSeedRequestV0;
    await createOperatorDurationSeedServer(sneaky, deps(client, { supabaseUrl: STAGING_URL }));
    const row = inserts[0]!;
    expect(row.environment).toBe("staging"); // production でなく gate resolved
    expect(row.provenance_kind).toBe("operator_seed");
    expect(row.learning_eligible).toBe(false);
  });
  it("#13 orchestration validation は依然走る（bad bounds → validation_failed・insert なし）", async () => {
    const { client, inserts } = fakeClient();
    const r = await createOperatorDurationSeedServer(request({ durationUpperBoundMinutes: 23 }), deps(client));
    expect(r.ok).toBe(false);
    expect((r as { code: string }).code).toBe("validation_failed");
    expect(inserts.length).toBe(0);
  });
  it("#14/#15/#16 repository safe failure → safe code・raw UUID/SQL/constraint を出さない", async () => {
    const rawMsg = `duplicate key violates unique constraint "...uniq" DETAIL: Key (user_id)=(${OP}) exists.`;
    const dup = await createOperatorDurationSeedServer(request(), deps(fakeClient({ insertError: { code: "23505", message: rawMsg }, insertData: null }).client, { supabaseUrl: STAGING_URL }));
    expect(dup).toEqual({ ok: false, code: "active_duplicate_conflict" });
    const gen = await createOperatorDurationSeedServer(request(), deps(fakeClient({ insertError: { message: rawMsg }, insertData: null }).client, { supabaseUrl: STAGING_URL }));
    expect(gen.ok).toBe(false);
    expect((gen as { code: string }).code).toBe("db_insert_failed");
    expect(JSON.stringify(gen)).not.toContain(OP); // raw UUID 非露出
    expect(JSON.stringify(gen).toLowerCase()).not.toContain("constraint"); // raw SQL 非露出
  });
});

// ── source-scan（#17-#19）──
describe("RD3c-P3a-wire-C #17-#19 no API/server action/UI・no createClient/service_role・no production write", () => {
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const gateCode = strip(fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/operator-duration-seed-gate.ts"), "utf8")).toLowerCase();
  const glueCode = strip(fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/integration/operator-duration-seed-glue.ts"), "utf8")).toLowerCase();
  it("#17 API route / server action / UI を import しない", () => {
    for (const code of [gateCode, glueCode]) {
      for (const t of ["next/server", "nextrequest", "nextresponse", '"use server"', '"use client"', "react", "/api/", "app/"]) {
        expect(code.includes(t)).toBe(false);
      }
    }
  });
  it("#18 createClient しない・service_role を使わない（injected client）", () => {
    for (const code of [gateCode, glueCode]) {
      expect(code.includes("createclient")).toBe(false);
      expect(code.includes("service_role")).toBe(false);
    }
    expect(glueCode.includes('import "server-only"')).toBe(true);
  });
  it("#19 glue は `.from` を持たない（repository に委譲・production write path なし）", () => {
    expect(glueCode.includes(".from(")).toBe(false);
    // production を環境として書かない（gate が production を allow しない）
    expect(glueCode.includes('"production"')).toBe(false);
  });
  it("#20/#21 product /plan / Alter / notification / external を import しない", () => {
    for (const code of [gateCode, glueCode]) {
      for (const t of ["/plan/page", "alttab", "buildalterscreen", "notification", "fetch(", "webhook", "email"]) {
        expect(code.includes(t)).toBe(false);
      }
    }
  });
});

describe("RD3c-P3-local-activation #18/#19 dev-only entry は flag-gated（default OFF → gate deny）", () => {
  it("env 既定（flag OFF・allowlist 空）→ gateInput.flagEnabled=false・allowlist=[] → gate は FLAG_OFF deny", () => {
    const gi = resolveOperatorDurationSeedGateInputFromEnv(OP);
    expect(gi.flagEnabled).toBe(false); // PLAN_FLAGS default OFF
    expect(gi.operatorAllowlist).toEqual([]); // 空=fail-closed
    expect(evaluateOperatorDurationSeedGate(gi)).toEqual({ allow: false, reason: "FLAG_OFF" });
  });
  it("requestedUserId は引数（server 確定）から入る（client から受けない）", () => {
    expect(resolveOperatorDurationSeedGateInputFromEnv("server-uid").requestedUserId).toBe("server-uid");
    expect(resolveOperatorDurationSeedGateInputFromEnv(null).requestedUserId).toBeNull();
  });
});
