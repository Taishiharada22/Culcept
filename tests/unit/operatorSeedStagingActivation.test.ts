/**
 * RD3x-ACTIVATE-1 — **staging real smoke**（実 staging DB・real user auth・mock でない）。
 *   anon key + STAGING_USER_A/B でサインインし（**service_role 不使用**）、実 glue write → 実 reader read →
 *   operator preview の `leaveByComputedPresent=true` が **staging real data** で成立することを実証。RLS で operator_seed が
 *   一般 owner read に漏れないことも実証。STAGING ONLY（linked ref hjcr・production aljav 非接触）。
 *
 * 実行条件: /Users/haradataishi/Culcept/.env.staging.local（URL/anon/USER_A/B 認証）present 時のみ。無ければ skip。
 * 正本設計: docs/reality-staging-dogfood-activation-rd3x-activate-0.md
 */
import { describe, it, expect, beforeAll, vi } from "vitest";
import fs from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  createOperatorDurationSeedServer,
  type OperatorDurationSeedServerDepsV0,
} from "@/lib/plan/reality/integration/operator-duration-seed-glue";
import {
  createSupabaseOperatorDurationSeedReader,
  type DurationConfirmationReadClient,
  type DurationConfirmationWriteClient,
} from "@/lib/plan/reality/integration/duration-confirmation-source";
import type { OperatorDurationSeedRequestV0 } from "@/lib/plan/realityCore/operatorDurationSeedWrite";
import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import type { OperatorDayPreviewDeps } from "@/lib/plan/realityCore/operatorDayPreview";

const ENV_FILE = "/Users/haradataishi/Culcept/.env.staging.local";
function loadEnv(): Record<string, string> {
  try {
    const out: Record<string, string> = {};
    for (const rawLine of fs.readFileSync(ENV_FILE, "utf8").split("\n")) {
      const line = rawLine.trim();
      if (line.length === 0 || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq <= 0) continue;
      const key = line.slice(0, eq);
      let val = line.slice(eq + 1);
      if (val.length >= 2 && ((val[0] === '"' && val[val.length - 1] === '"') || (val[0] === "'" && val[val.length - 1] === "'"))) {
        val = val.slice(1, -1);
      }
      out[key] = val; // last-wins（main staging file の real block を採用）
    }
    return out;
  } catch {
    return {};
  }
}
const E = loadEnv();
const URL = E.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON = E.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const STAGING_READY = URL.includes("hjcrvndumgiovyfdacwc") && ANON.length > 0 && !!E.STAGING_USER_A_EMAIL && !!E.STAGING_USER_A_PASSWORD;
const d = STAGING_READY ? describe : describe.skip;

const SUBJ = "2026-06-12";
const REF = new Date(Date.UTC(2026, 5, 12, 0, 0)); // JST 09:00 → subjectiveDate 2026-06-12
const ERN = (id: string) => `ern:${SUBJ}:${id}`;
const SCOPE_REF = "rd3x-activate-1"; // 固定 scope（再 run は supersede chain で active 1）

let clientA: SupabaseClient;
let clientB: SupabaseClient;
let uidA = "";

async function signIn(email: string, password: string): Promise<{ client: SupabaseClient; uid: string }> {
  const c = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new Error("staging signIn failed: " + (error ? `${error.status} ${error.message}` : "no-user"));
  return { client: c, uid: data.user.id };
}

const request = (over: Partial<OperatorDurationSeedRequestV0> = {}): OperatorDurationSeedRequestV0 => ({
  userId: "CLIENT-IGNORED", sourceAnchorRef: null,
  scope: { targetNodeId: ERN("tgt"), originRef: "opaque-o", destinationRef: "opaque-d", transportMode: "transit", timeBand: null, subjectiveDate: SUBJ, temporalScopeRef: SCOPE_REF, routeEtaSupplyId: null, providerVersion: "v1" },
  durationUpperBoundMinutes: 20, durationLowerBoundMinutes: null, durationBasis: "user_confirmed",
  confirmedBy: "CLIENT-IGNORED", sourceRefs: ["opaque-src"], evidenceRefs: ["opaque-ev"], freshnessStatus: "fresh", validUntil: null, ...over,
});

function oneOff(over: Partial<ExternalAnchor> & { id: string; startTime: string }): ExternalAnchor {
  return { anchorKind: "one_off", userId: uidA, sourceId: "src-real", title: "予定", date: SUBJ, rigidity: "soft", confirmedAt: "2026-06-01T00:00:00.000Z", ...over } as unknown as ExternalAnchor;
}

beforeAll(async () => {
  if (!STAGING_READY) return;
  const a = await signIn(E.STAGING_USER_A_EMAIL, E.STAGING_USER_A_PASSWORD);
  clientA = a.client;
  uidA = a.uid;
  // USER_B は RLS 非漏洩テスト用（任意）。認証失敗しても suite を止めない（#4 が skip）。
  if (E.STAGING_USER_B_EMAIL && E.STAGING_USER_B_PASSWORD) {
    try {
      clientB = (await signIn(E.STAGING_USER_B_EMAIL, E.STAGING_USER_B_PASSWORD)).client;
    } catch {
      clientB = undefined as unknown as SupabaseClient;
    }
  }
}, 60000);

d("RD3x-ACTIVATE-1 staging real smoke（実 staging DB・anon+user auth・service_role 不使用）", () => {
  it("#1 ref 確認: URL=staging(hjcr)・anon key（service_role でない）", () => {
    expect(URL).toContain("hjcrvndumgiovyfdacwc");
    expect(URL).not.toContain("aljavfujeqcwnqryjmhl"); // production 非接触
    expect(ANON.length).toBeGreaterThan(0);
  });

  it("#2 operator seed real write（実 glue → 実 staging DB）→ ok・environment=staging", async () => {
    const deps: OperatorDurationSeedServerDepsV0 = {
      gateInput: { flagEnabled: true, nodeEnv: "development", supabaseUrl: URL, operatorAllowlist: [uidA], requestedUserId: uidA },
      client: clientA as unknown as DurationConfirmationWriteClient,
      nowIso: "2026-06-12T08:00:00+09:00",
    };
    const r = await createOperatorDurationSeedServer(request(), deps);
    expect(r.ok).toBe(true);
    expect((r as { environment: string }).environment).toBe("staging");
  }, 30000);

  it("#3 real read（実 reader → 実 staging DB）→ operator 自身は当日 active seed を full row 取得・provenance operator_seed", async () => {
    const reader = createSupabaseOperatorDurationSeedReader(clientA as unknown as DurationConfirmationReadClient);
    const rows = await reader.listActiveByOwnerForDate(uidA, SUBJ);
    const mine = rows.filter((x) => x.scope.targetNodeId === ERN("tgt") && x.scope.temporalScopeRef === SCOPE_REF);
    expect(mine.length).toBe(1);
    expect(mine[0]!.governance.provenanceKind).toBe("operator_seed");
    expect(mine[0]!.governance.learningEligible).toBe(false);
    expect(mine[0]!.durationUpperBoundMinutes).toBe(20);
  }, 30000);

  it("#4 RLS: 一般 user(B) read に operator_seed が漏れない（owner_select 構造排除）", async () => {
    const reader = createSupabaseOperatorDurationSeedReader(clientA as unknown as DurationConfirmationReadClient);
    const mine = (await reader.listActiveByOwnerForDate(uidA, SUBJ)).filter((x) => x.scope.targetNodeId === ERN("tgt") && x.scope.temporalScopeRef === SCOPE_REF);
    // 構造的事実: seed は operator_seed × staging（applied owner_select = general_user_confirmed × production が排除する class）。
    expect(mine.length).toBe(1);
    expect(mine[0]!.governance.provenanceKind).toBe("operator_seed");
    expect(mine[0]!.governance.environment).toBe("staging");
    if (clientB) {
      // 第二ユーザー実測（B 認証可能時のみ）: B からは A の operator_seed が見えない。
      const readerB = createSupabaseOperatorDurationSeedReader(clientB as unknown as DurationConfirmationReadClient);
      expect((await readerB.listActiveByOwnerForDate(uidA, SUBJ)).length).toBe(0);
    }
  }, 30000);

  it("#5 supersede chain: 同一 scope 再 seed → active 1（履歴は残す・物理 delete しない）", async () => {
    const deps: OperatorDurationSeedServerDepsV0 = {
      gateInput: { flagEnabled: true, nodeEnv: "development", supabaseUrl: URL, operatorAllowlist: [uidA], requestedUserId: uidA },
      client: clientA as unknown as DurationConfirmationWriteClient,
      nowIso: "2026-06-12T08:05:00+09:00",
    };
    const r2 = await createOperatorDurationSeedServer(request({ durationUpperBoundMinutes: 25 }), deps);
    expect(r2.ok).toBe(true);
    const reader = createSupabaseOperatorDurationSeedReader(clientA as unknown as DurationConfirmationReadClient);
    const active = (await reader.listActiveByOwnerForDate(uidA, SUBJ)).filter((x) => x.scope.targetNodeId === ERN("tgt") && x.scope.temporalScopeRef === SCOPE_REF);
    expect(active.length).toBe(1); // active 1 行（unique index + supersede）
    expect(active[0]!.durationUpperBoundMinutes).toBe(25); // 最新
  }, 30000);

  it("#6 non-operator → reject（gate deny・DB 書き込みなし）", async () => {
    const deps: OperatorDurationSeedServerDepsV0 = {
      gateInput: { flagEnabled: true, nodeEnv: "development", supabaseUrl: URL, operatorAllowlist: [uidA], requestedUserId: "00000000-0000-4000-8000-000000000000" },
      client: clientA as unknown as DurationConfirmationWriteClient,
      nowIso: "2026-06-12T08:00:00+09:00",
    };
    const r = await createOperatorDurationSeedServer(request({ scope: { ...request().scope, targetNodeId: ERN("nonop") } }), deps);
    expect(r.ok).toBe(false);
    expect((r as { code: string }).code).toBe("gate_user_not_operator");
  }, 30000);

  it("#7 production env(url) → reject（gate deny・staging 専用）", async () => {
    const deps: OperatorDurationSeedServerDepsV0 = {
      gateInput: { flagEnabled: true, nodeEnv: "development", supabaseUrl: "https://aljavfujeqcwnqryjmhl.supabase.co", operatorAllowlist: [uidA], requestedUserId: uidA },
      client: clientA as unknown as DurationConfirmationWriteClient,
      nowIso: "2026-06-12T08:00:00+09:00",
    };
    const r = await createOperatorDurationSeedServer(request({ scope: { ...request().scope, targetNodeId: ERN("prod") } }), deps);
    expect(r.ok).toBe(false);
    expect((r as { code: string }).code).toBe("gate_production_project_ref");
  }, 30000);

  it("#8 end-to-end: flag ON + 実 reader 注入 → leaveByComputedPresent=true（staging real data）・leak 0・exact instant/raw 非露出", async () => {
    vi.stubEnv("REALITY_OPERATOR_PREVIEW_LEAVEBY", "true");
    vi.resetModules();
    const mod = await import("@/lib/plan/realityCore/operatorDayPreview");
    const reader = createSupabaseOperatorDurationSeedReader(clientA as unknown as DurationConfirmationReadClient);
    const TARGET = oneOff({ id: "tgt", startTime: "14:00", endTime: "15:00", startTimeSource: "user_explicit", locationText: "オフィス渋谷" });
    const PREV = oneOff({ id: "prv", startTime: "09:00", endTime: "10:00", startTimeSource: "user_explicit", locationText: "自宅" });
    const deps: OperatorDayPreviewDeps = {
      listAnchors: async () => [PREV, TARGET],
      listDurationConfirmations: (uid) => reader.listActiveByOwnerForDate(uid, SUBJ),
    };
    const p = await mod.buildOperatorDayRealPayload({ operatorUserId: uidA, referenceInstantUtc: REF }, deps);
    expect(p.available).toBe(true);
    expect(p.leaveByComputedPresent).toBe(true); // ★ staging real seed → durationValue → supply → computed → boolean true
    expect(mod.realDayPayloadLeakViolations(p)).toEqual([]);
    expect(/t\d{2}:\d{2}:\d{2}\+09:00/.test(JSON.stringify(p))).toBe(false); // exact instant 非露出
    for (const raw of ["オフィス渋谷", "自宅", "src-real", "予定", uidA]) expect(JSON.stringify(p)).not.toContain(raw); // raw anchor/uid 非露出
    // RD3g-P1: `departureLineCandidatePresent` は意図的 safe boolean key（"departureline" substring を含む）→ 走査前に除去。
    // RD3g-P2: `departureLineTimestampHHMM`（HH:MM value）も strip（"departure" token false positive 防止）。
    //   この flag は本 smoke では未 stub（OFF）だが、payload に常時存在する required field なので key 文字列を取り除いてから token 検査する。
    const low = JSON.stringify(p).toLowerCase().split("departurelinecandidatepresent").join("").split("departurelinetimestamphhmm").join("");
    for (const t of ["leavebyinstant", "arrivaltargetinstant", "timecontract", "sourcetimeestimateref", "bufferref", "departureline", "notification"]) expect(low.includes(t)).toBe(false);
    vi.unstubAllEnvs();
    vi.resetModules();
  }, 30000);
});
