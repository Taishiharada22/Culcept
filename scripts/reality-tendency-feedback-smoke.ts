#!/usr/bin/env tsx
/**
 * Reality Control OS — A1-7-35 Tendency Feedback controlled smoke（CEO 手動・単発・**staging 限定・operator-only**）
 *
 * 役割: culcept-staging の RLS user context（anon + sign-in）で、A1-7-35 の **実 Supabase adapter**
 *   （reader / M2 repo / M3 repo / M3 updater）＋ pure core `executeTendencyFeedback` を **実 staging DB** に対して
 *   confirm/correct/reject の主要 3 経路で走らせ、**可逆**な行作用（user M2 / 新 M3 version / user_correction / retracted_at）を
 *   検証し、**全 seed を cleanup して 0 に戻す**。＝「実 DB + RLS で過断定なく可逆に書け、痕跡を残さない」ことの確認。
 *
 * 実行（CEO operation・staging のみ・明示 GO 必須）:
 *   REALITY_FEEDBACK_SMOKE_GO=1 NODE_OPTIONS="--conditions=react-server" \
 *     npx tsx scripts/reality-tendency-feedback-smoke.ts
 *
 * env（.env.local・staging 値）:
 *   NEXT_PUBLIC_SUPABASE_URL       = https://<staging-ref>.supabase.co
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY  = staging anon public key（service_role 不可）
 *   STAGING_SUPABASE_PROJECT_REF   = <staging-ref>（20 文字・URL host と一致必須）
 *   STAGING_USER_A_EMAIL / STAGING_USER_A_PASSWORD = staging の 1 アカウント
 *
 * 安全（CEO 固定条件をコードで強制）:
 *   - **staging 限定**: URL host ref が STAGING_PROJECT_REF と厳格一致しなければ fatal。本番 ref（denylist）一致で fatal。
 *   - service_role 禁止（anon key に "service_role" 検出で fatal）。NODE_ENV=production / GO 無しで fatal。
 *   - user-RLS（anon + sign-in・service role でない）。書くのは自分の user_id 行のみ。
 *   - **env 永続変更なし**（process env のみ・.env を書かない）。**production 触れない**。
 *   - **必ず cleanup**（成功/失敗どちらでも finally で seed M1/M2/M3 を marker 一致 DELETE → 0 検証）。
 *   - 出力は **redacted**（counts + boolean のみ・raw/個別 id/個別 context を出さない）。
 */

import { config as loadDotenv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { STAGING_PROJECT_REF, PRODUCTION_PROJECT_REF } from "@/lib/plan/shift/devFixtureHost";
import {
  createSupabasePrmModelEntryReader,
  type PrmModelEntryReadClient,
} from "@/lib/plan/reality/learning/supabase-prm-model-entry-reader";
import {
  createSupabasePrmReviewDecisionRepository,
  type PrmReviewDecisionWriteClient,
} from "@/lib/plan/reality/learning/supabase-prm-review-decision-repository";
import {
  createSupabasePrmModelEntryRepository,
  createSupabasePrmModelEntryUpdater,
  type PrmModelEntryWriteClient,
  type PrmModelEntryUpdateClient,
} from "@/lib/plan/reality/learning/supabase-prm-model-entry-repository";
import { executeTendencyFeedback } from "@/lib/plan/reality/learning/tendency-feedback-core";
import { tendencyKey } from "@/lib/plan/reality/learning/prm-model-entry-read";

loadDotenv({ path: ".env.local" });

function fatal(reason: string): never {
  // eslint-disable-next-line no-console
  console.error(`\n❌ FATAL: ${reason}\n`);
  process.exit(1);
}
function log(msg: string): void {
  // eslint-disable-next-line no-console
  console.log(msg);
}
function ok(cond: boolean, label: string): boolean {
  log(`${cond ? "✅" : "❌"} ${label}`);
  return cond;
}

const GO = process.env.REALITY_FEEDBACK_SMOKE_GO === "1";
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SB_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const PROJECT_REF = process.env.STAGING_SUPABASE_PROJECT_REF ?? "";
const EMAIL = process.env.STAGING_USER_A_EMAIL ?? "";
const PASSWORD = process.env.STAGING_USER_A_PASSWORD ?? "";

const PROD_REF_DENYLIST = [PRODUCTION_PROJECT_REF];
const STAGING_REF_ALLOWLIST = [STAGING_PROJECT_REF];

function preflight(): void {
  if (!GO) fatal('明示 GO 未設定。`REALITY_FEEDBACK_SMOKE_GO=1` を付けて実行してください。');
  if (process.env.NODE_ENV === "production") fatal("NODE_ENV=production では実行しません（dev-only）。");
  const missing: string[] = [];
  if (!SB_URL) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!SB_ANON) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!PROJECT_REF) missing.push("STAGING_SUPABASE_PROJECT_REF");
  if (!EMAIL) missing.push("STAGING_USER_A_EMAIL");
  if (!PASSWORD) missing.push("STAGING_USER_A_PASSWORD");
  if (missing.length) fatal(`Missing env（.env.local）: ${missing.join(", ")}`);
  if (/service_role/i.test(SB_ANON)) fatal('SECRET GUARD: anon key に "service_role" 混入。anon のみ許可。');
  if (!/^[a-z0-9]{20}$/.test(PROJECT_REF)) fatal(`STAGING_SUPABASE_PROJECT_REF="${PROJECT_REF}" 不正。`);
  if (PROD_REF_DENYLIST.includes(PROJECT_REF)) fatal("PRODUCTION GUARD: project ref が本番。");
  if (!STAGING_REF_ALLOWLIST.includes(PROJECT_REF)) fatal(`STAGING GUARD: project ref が許可 staging（${STAGING_PROJECT_REF}）でない。`);
  let host = "";
  try { host = new URL(SB_URL).host.toLowerCase(); } catch { fatal("NEXT_PUBLIC_SUPABASE_URL 不正。"); }
  const m = host.match(/^([a-z0-9]+)\.supabase\.(co|in)$/);
  if (!m) fatal(`PRODUCTION GUARD: host="${host}" が "<ref>.supabase.co" 形でない。`);
  const ref = m[1]!;
  if (PROD_REF_DENYLIST.includes(ref)) fatal(`PRODUCTION GUARD: URL host が本番 ref（${ref}）。`);
  if (!STAGING_REF_ALLOWLIST.includes(ref)) fatal(`STAGING GUARD: URL host ref（${ref}）が許可 staging でない。`);
  if (ref !== PROJECT_REF) fatal(`PRODUCTION GUARD: URL host ref="${ref}" ≠ PROJECT_REF="${PROJECT_REF}"。`);
  log(`▶ target = staging host ${host}（operator-only feedback smoke）`);
}

const M2_TABLE = "prm_review_decisions";
const M3_TABLE = "prm_model_entries";

async function main(): Promise<void> {
  preflight();

  const sb = createClient(SB_URL, SB_ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: auth, error: signInErr } = await sb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (signInErr || !auth.user) fatal(`sign-in 失敗: ${signInErr?.message ?? "no user"}`);
  const userId = auth.user.id;
  log(`▶ signed in（RLS user context・id 末尾4=…${userId.slice(-4)}）`);

  const epoch = Date.now();
  const marker = `tfbsmoke_${epoch}`; // この run の seed を一意特定（cleanup の LIKE 基点）
  const cv = (n: number) => `${marker}_${n}`; // context_value / source_value に埋める
  const client = sb as unknown as SupabaseClient;

  // ── 実 adapter（production と同一コード経路）──
  const reader = createSupabasePrmModelEntryReader(sb as unknown as PrmModelEntryReadClient, userId);
  const m2 = createSupabasePrmReviewDecisionRepository(sb as unknown as PrmReviewDecisionWriteClient, userId);
  const m3Insert = createSupabasePrmModelEntryRepository(sb as unknown as PrmModelEntryWriteClient, userId);
  const m3Update = createSupabasePrmModelEntryUpdater(sb as unknown as PrmModelEntryUpdateClient, userId);

  let pass = true;
  const seededM2Ids: string[] = [];
  const seededM3Ids: string[] = [];

  try {
    // ── seed: 3 entries（confirm/correct/reject 用）。M3 は review_decision_id NOT NULL FK ゆえ先に M2 seed ──
    for (let n = 1; n <= 3; n++) {
      const dir = "non_adoption";
      const m2Seed = {
        user_id: userId,
        proposal_fingerprint: `band:${cv(n)}:dismiss`,
        decision: "approve",
        reviewer: "operator", // seed は operator review（A1-7-33 相当）
        source_dimension: "band",
        source_value: cv(n),
        dominant_action: "dismiss",
        favored_hypothesis: "not_now",
        still_possible: ["not_selected"],
        evidence_count: 6,
        counter_count: 1,
        certainty: "tentative",
        reviewed_at: new Date(epoch).toISOString(),
      };
      const m2Res = await client.from(M2_TABLE).insert([m2Seed]).select("id");
      if (m2Res.error || !m2Res.data?.[0]?.id) fatal(`seed M2#${n} 失敗: ${m2Res.error?.message ?? "no id"}`);
      const m2Id = m2Res.data[0].id as string;
      seededM2Ids.push(m2Id);

      const m3Seed = {
        user_id: userId,
        context_dimension: "band",
        context_value: cv(n),
        tendency_direction: dir,
        favored_hypothesis: "not_now",
        still_possible: ["not_selected"],
        evidence_count: 6,
        counter_count: 1,
        certainty: "tentative",
        review_decision_id: m2Id, // reviewRequired（FK）
        user_visible: true,
      };
      const m3Res = await client.from(M3_TABLE).insert([m3Seed]).select("id");
      if (m3Res.error || !m3Res.data?.[0]?.id) fatal(`seed M3#${n} 失敗: ${m3Res.error?.message ?? "no id"}`);
      seededM3Ids.push(m3Res.data[0].id as string);
    }
    log(`▶ seeded 3 M2 + 3 M3（marker=${marker}）`);

    // ── read（実 reader・id 付き feedback パス）──
    const entries = await reader.readModelEntriesForFeedback();
    const mine = entries.filter((e) => e.contextValue.startsWith(marker));
    pass = ok(mine.length === 3, `reader が seed 3 件を id 付きで再読込（${mine.length}/3）`) && pass;
    const keyOf = (n: number) => tendencyKey({ contextDimension: "band", contextValue: cv(n), tendencyDirection: "non_adoption" });

    // ── ① confirm（entry#1）→ user M2(approve) + 新 M3 version(supersedes) + old retracted ──
    const rc = await executeTendencyFeedback({ entries, rawRequest: { tendencyKey: keyOf(1), feedback: "confirm" }, m2, m3Insert, m3Update, nowMs: epoch });
    pass = ok(rc.ok && rc.reviewed && rc.modelEntryCreated && rc.retracted && rc.partialFailure === null, `confirm: ok/reviewed/modelEntryCreated/retracted, no partial`) && pass;
    const userApprove = await client.from(M2_TABLE).select("id").eq("source_value", cv(1)).eq("reviewer", "user").eq("decision", "approve");
    pass = ok(!userApprove.error && (userApprove.data?.length ?? 0) === 1, `confirm: user M2(approve) 1 行`) && pass;
    const oldRetracted = await client.from(M3_TABLE).select("retracted_at").eq("id", seededM3Ids[0]!);
    pass = ok(!oldRetracted.error && oldRetracted.data?.[0]?.retracted_at != null, `confirm: old M3 retracted（破壊削除でない）`) && pass;
    const newVersion = await client.from(M3_TABLE).select("id, certainty").eq("supersedes_id", seededM3Ids[0]!).is("retracted_at", null);
    pass = ok(!newVersion.error && (newVersion.data?.length ?? 0) === 1, `confirm: 新 M3 version(supersedes old) 1 行`) && pass;
    pass = ok(newVersion.data?.[0]?.certainty !== "high", `confirm: 新 version certainty ≠ high（過断定なし）`) && pass;

    // ── ② correct（entry#2, direction_adjusted）→ M3 user_correction UPDATE・M2 作らない・retract しない ──
    const rcorr = await executeTendencyFeedback({ entries, rawRequest: { tendencyKey: keyOf(2), feedback: "correct", correctionKind: "direction_adjusted" }, m2, m3Insert, m3Update, nowMs: epoch });
    pass = ok(rcorr.ok && rcorr.corrected && !rcorr.reviewed && !rcorr.retracted, `correct: ok/corrected, no M2/retract`) && pass;
    const corrected = await client.from(M3_TABLE).select("user_correction, retracted_at").eq("id", seededM3Ids[1]!);
    pass = ok(corrected.data?.[0]?.user_correction === "direction_adjusted" && corrected.data?.[0]?.retracted_at == null, `correct: M3 user_correction=direction_adjusted・非 retracted`) && pass;
    const noUserM2 = await client.from(M2_TABLE).select("id").eq("source_value", cv(2)).eq("reviewer", "user");
    pass = ok((noUserM2.data?.length ?? 0) === 0, `correct: user M2 を作らない（0 行）`) && pass;

    // ── ③ reject（entry#3）→ user M2(reject) + M3 retracted（可逆）──
    const rrej = await executeTendencyFeedback({ entries, rawRequest: { tendencyKey: keyOf(3), feedback: "reject" }, m2, m3Insert, m3Update, nowMs: epoch });
    pass = ok(rrej.ok && rrej.reviewed && rrej.retracted, `reject: ok/reviewed/retracted`) && pass;
    const userReject = await client.from(M2_TABLE).select("id").eq("source_value", cv(3)).eq("reviewer", "user").eq("decision", "reject");
    pass = ok((userReject.data?.length ?? 0) === 1, `reject: user M2(reject) 1 行`) && pass;
    const rejRetracted = await client.from(M3_TABLE).select("retracted_at").eq("id", seededM3Ids[2]!);
    pass = ok(rejRetracted.data?.[0]?.retracted_at != null, `reject: M3 retracted（retracted_at・可逆）`) && pass;
  } finally {
    // ── cleanup（成功/失敗どちらでも必ず・marker 一致で run の全行を DELETE）──
    // M3 先（FK child）→ M2（cascade も効くが明示削除）。新 version / user M2 も同 marker を共有。
    const delM3 = await client.from(M3_TABLE).delete().like("context_value", `${marker}%`).select("id");
    const delM2 = await client.from(M2_TABLE).delete().like("source_value", `${marker}%`).select("id");
    const leftM3 = await client.from(M3_TABLE).select("id").like("context_value", `${marker}%`);
    const leftM2 = await client.from(M2_TABLE).select("id").like("source_value", `${marker}%`);
    const cleanM3 = (leftM3.data?.length ?? 0) === 0;
    const cleanM2 = (leftM2.data?.length ?? 0) === 0;
    log(`▶ cleanup: deleted M3=${delM3.data?.length ?? 0} / M2=${delM2.data?.length ?? 0}`);
    pass = ok(cleanM3 && cleanM2, `cleanup: marker 一致 M3/M2 残 0（痕跡なし）`) && pass;
    await sb.auth.signOut();
  }

  log(`\n${pass ? "✅ PASS" : "❌ FAIL"} — A1-7-35 tendency feedback staging smoke`);
  process.exit(pass ? 0 : 1);
}

main().catch((e) => fatal(`unexpected: ${e instanceof Error ? e.message : String(e)}`));
