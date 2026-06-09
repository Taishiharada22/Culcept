#!/usr/bin/env tsx
/**
 * Reality Control OS — A-4-c2 Reflection Preview Staging Render Smoke（CEO smoke gate・**staging・read-only・no-write・no-seed**）
 *
 * 役割: `/plan/dev-reality-pipeline` page の **データ経路そのもの**（real anchors + real M1/M3 → envelope + meta +
 *   reflection DTO）を real staging で再生し、**実 client component（RealityPipelinePreviewClient）を同一 payload で
 *   render** して Reflection Preview section の表示契約（必須文言・allowlist label・denied data 不在・button 不在）を検証する。
 *   route 契約・client 表示と**同等の payload** を通す（CEO 許可の guarded script 方式）。
 *
 * 3 phase（react-server 条件と react-dom/server が両立しないため dynamic import で分離）:
 *   --phase=flag-off … REALITY_PIPELINE_PREVIEW 未設定で flag=false（page は Disabled・read しない）を確認
 *   --phase=data     … guards + operator auth + real read + envelope/meta/DTO 計算 + payload redaction → temp JSON
 *   --phase=render   … temp JSON → 実 client を renderToStaticMarkup → HTML 表示契約検証 → temp 削除
 *
 * 実行:
 *   npx tsx scripts/reality-preview-render-smoke.ts --phase=flag-off
 *   REALITY_PREVIEW_RENDER_SMOKE_GO=1 REALITY_PIPELINE_PREVIEW=true NODE_OPTIONS="--conditions=react-server" \
 *     npx tsx scripts/reality-preview-render-smoke.ts --phase=data --out=/tmp/a4c2-payload.json
 *   npx tsx scripts/reality-preview-render-smoke.ts --phase=render --in=/tmp/a4c2-payload.json
 *
 * 安全: staging allowlist(hjcrvndumgiovyfdacwc)・本番 denylist(aljav…) fatal・service_role fatal・GO 必須・
 *   read-only(select のみ)・**write 0 / seed 0 / cleanup 不要**・新規 route/flag/read path なし（page と同一 wiring 再利用）・
 *   temp payload は redacted 済み JSON のみ（render 後に削除）・実時刻は log に出さない（format 検証のみ）。
 */

import { config as loadDotenv } from "dotenv";

loadDotenv({ path: ".env.local" });

function fatal(r: string): never { console.error(`\n❌ FATAL: ${r}\n`); process.exit(1); }
function log(m: string): void { console.log(m); }
function ok(c: boolean, l: string): boolean { log(`${c ? "✅" : "❌"} ${l}`); return c; }
function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}

const PHASE = arg("phase") ?? "";
// payload 全体（envelope+meta+DTO）に出てはいけない raw/PII（P-E と同系）。
const FORBIDDEN = /seed_?ref|utterance|personality|trait|怠惰|だらしな|title|location|住所|@[a-z]|\b\d{10,}\b/i;
// DTO 単体への厳格 deny（display: id / 実体 field 名も不可）。
const DTO_FORBIDDEN = /seed_?ref|utterance|personality|trait|title|location|display:|confidence|reason|origin|rigidity|@[a-z]|\b\d{10,}\b|[0-9a-f]{8}-[0-9a-f]{4}/i;
const LABEL_ALLOWLIST = new Set(["集中の時間", "軽い用事の時間", "休息", "自由時間", "余白"]);

// ━━━━━━━━━━━━━━ phase: flag-off（REALITY_PIPELINE_PREVIEW 未設定で実行） ━━━━━━━━━━━━━━
async function phaseFlagOff(): Promise<void> {
  if (process.env.REALITY_PIPELINE_PREVIEW !== undefined) fatal("flag-off phase は REALITY_PIPELINE_PREVIEW 未設定で実行すること。");
  const { PLAN_FLAGS } = await import("@/lib/plan/featureFlags");
  let pass = true;
  pass = ok(PLAN_FLAGS.realityPipelinePreview === false, "flag OFF: PLAN_FLAGS.realityPipelinePreview=false（page は Disabled・read/run しない）") && pass;
  log(`\n${pass ? "✅ PASS" : "❌ FAIL"} — phase=flag-off`);
  process.exit(pass ? 0 : 1);
}

// ━━━━━━━━━━━━━━ phase: data（react-server 条件・real staging read） ━━━━━━━━━━━━━━
async function phaseData(): Promise<void> {
  const OUT = arg("out");
  if (!OUT) fatal("--out=/tmp/… が必要。");
  if (process.env.REALITY_PREVIEW_RENDER_SMOKE_GO !== "1") fatal("GO 未設定（REALITY_PREVIEW_RENDER_SMOKE_GO=1）。");
  if (process.env.NODE_ENV === "production") fatal("NODE_ENV=production 不可。");

  const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const SB_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const PROJECT_REF = process.env.STAGING_SUPABASE_PROJECT_REF ?? "";
  const EMAIL = process.env.STAGING_USER_A_EMAIL ?? "";
  const PASSWORD = process.env.STAGING_USER_A_PASSWORD ?? "";
  for (const [k, v] of [["URL", SB_URL], ["ANON", SB_ANON], ["REF", PROJECT_REF], ["EMAIL", EMAIL], ["PW", PASSWORD]]) if (!v) fatal(`Missing ${k}`);
  if (/service_role/i.test(SB_ANON)) fatal("anon key に service_role 混入。");

  const { STAGING_PROJECT_REF, PRODUCTION_PROJECT_REF } = await import("@/lib/plan/shift/devFixtureHost");
  if (PROJECT_REF === PRODUCTION_PROJECT_REF) fatal("PRODUCTION GUARD: ref 本番。");
  if (PROJECT_REF !== STAGING_PROJECT_REF) fatal(`STAGING GUARD: ref が ${STAGING_PROJECT_REF} でない。`);
  let host = "";
  try { host = new URL(SB_URL).host.toLowerCase(); } catch { fatal("URL 不正。"); }
  const refFromHost = host.match(/^([a-z0-9]+)\.supabase\.(co|in)$/)?.[1];
  if (refFromHost === PRODUCTION_PROJECT_REF) fatal("PRODUCTION GUARD: host 本番。");
  if (refFromHost !== STAGING_PROJECT_REF) fatal("STAGING GUARD: host ref 不一致。");
  log(`▶ target = staging host ${host}（A-4-c2 render smoke・data phase・read-only）`);

  let pass = true;
  // ── page guard 分岐（pure・page と同一 helper）──
  const { isCandidateActionsPreviewHostAllowed } = await import("@/lib/plan/reality/candidateActionsPreviewHost");
  const STAGING_HTTP = `https://${STAGING_PROJECT_REF}.supabase.co`;
  const PROD_HTTP = `https://${PRODUCTION_PROJECT_REF}.supabase.co`;
  pass = ok(isCandidateActionsPreviewHostAllowed({ hostMode: "true", supabaseUrl: STAGING_HTTP }) === true, "guard: host=true + staging → 表示可") && pass;
  pass = ok(isCandidateActionsPreviewHostAllowed({ hostMode: "true", supabaseUrl: PROD_HTTP }) === false, "guard: production ref → notFound 相当（block）") && pass;
  pass = ok(isCandidateActionsPreviewHostAllowed({ hostMode: undefined, supabaseUrl: STAGING_HTTP }) === false, "guard: host 未設定 → dormant（不可視）") && pass;
  const { PLAN_FLAGS } = await import("@/lib/plan/featureFlags");
  pass = ok(PLAN_FLAGS.realityPipelinePreview === true, "guard: REALITY_PIPELINE_PREVIEW=true → flag ON（本 smoke 限定）") && pass;

  // ── operator auth（非 operator は read しない分岐も確認）──
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(SB_URL, SB_ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const pre = await sb.auth.getUser();
  pass = ok(pre.data.user === null, "guard: 未ログイン client の getUser=null（non-operator → page は Disabled・read しない）") && pass;
  const { data: auth, error: e } = await sb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (e || !auth.user) fatal(`sign-in 失敗: ${e?.message ?? "no user"}`);
  const userId = auth.user.id;
  pass = ok(!!userId, "guard: operator auth → user 取得（read/run へ進む分岐）") && pass;

  // ── real read（page と同一 wiring・新規 read path なし）──
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const nowMinute = now.getHours() * 60 + now.getMinutes();
  const nowMs = now.getTime();
  const { createSupabaseWorldStateSourcePorts } = await import("@/lib/plan/reality/assembly/supabase-worldstate-source-ports");
  const { createSupabaseMemorySourcePorts } = await import("@/lib/plan/reality/assembly/supabase-memory-source-ports");
  const { assembleWorldState } = await import("@/lib/plan/reality/assembly/world-state-assembler");
  const { assembleMemoryItems } = await import("@/lib/plan/reality/assembly/memory-assembler");
  const { synthesizeMemory } = await import("@/lib/plan/reality/learning/memory-synthesis");
  const { runRealityPipeline } = await import("@/lib/plan/reality/orchestration/reality-pipeline");
  const { computeReflectionPreviewDto } = await import("@/lib/plan/reality/permission/reflection-preview-compute");

  const FIXTURE_CONTEXT = { energy: { value: 0.6, source: "fixture" }, weather: { value: "rain", source: "fixture" } } as unknown as import("@/lib/plan/context/contextModifier").ContextSnapshot;
  const baseWorldPorts = createSupabaseWorldStateSourcePorts(sb, userId, date);
  const world = await assembleWorldState({ ...baseWorldPorts, readContext: async () => FIXTURE_CONTEXT }, date, nowMinute);
  const memoryItems = await assembleMemoryItems(createSupabaseMemorySourcePorts(sb, userId));
  const envelope = runRealityPipeline({ memoryItems, worldState: world, permissionLevel: 2, nowMs });
  const synthesis = synthesizeMemory(memoryItems, nowMs);
  const meta = {
    hardConstraintsCount: world.todaySchedule.length,
    availableWindowsCount: world.availableWindows.length,
    usableContextsCount: synthesis.usableContexts.length,
    memoryItemCount: memoryItems.length,
  };
  const reflectionPreview = computeReflectionPreviewDto({ world, memoryItems, date, nowMs }) ?? undefined;
  log(`▶ real read: hardConstraints=${meta.hardConstraintsCount} windows=${meta.availableWindowsCount} memory=${meta.memoryItemCount}`);
  log(`▶ reflection: stage=${reflectionPreview?.stage ?? "null"} verdict=${reflectionPreview?.preconditionVerdict ?? "—"} items=${reflectionPreview?.reflectedItemCount ?? 0} blockers=${reflectionPreview?.blockersCount ?? 0} warnings=${reflectionPreview?.warningsCount ?? 0}`);

  // ── payload 検証（client へ渡る 3 prop と同一物）──
  const payload = { envelope, meta, reflectionPreview };
  pass = ok(!FORBIDDEN.test(JSON.stringify(payload)), "redaction: payload(envelope+meta+DTO) に raw/PII/title/location/seedRef なし") && pass;
  if (reflectionPreview) {
    pass = ok(!DTO_FORBIDDEN.test(JSON.stringify(reflectionPreview)), "redaction: DTO 厳格 deny（display:/confidence/reason/origin/rigidity/UUID）不一致") && pass;
    pass = ok(reflectionPreview.items.every((i) => LABEL_ALLOWLIST.has(i.label)), "label: 全 item が allowlist 5 語のみ") && pass;
    pass = ok(reflectionPreview.items.every((i) => /^\d{2}:\d{2}$/.test(i.startTime) && (i.endTime === undefined || /^\d{2}:\d{2}$/.test(i.endTime))), "HH:MM: 全 item が exact time 形式（実時刻は log 非出力）") && pass;
  }

  const fs = await import("node:fs");
  fs.writeFileSync(OUT, JSON.stringify(payload), "utf8");
  log(`▶ payload → ${OUT}（redacted 済・render phase 後に削除）`);
  log(`\n${pass ? "✅ PASS" : "❌ FAIL"} — phase=data（real read・write 0・seed 0）`);
  await sb.auth.signOut();
  process.exit(pass ? 0 : 1);
}

// ━━━━━━━━━━━━━━ phase: render（通常条件・実 client component render） ━━━━━━━━━━━━━━
async function phaseRender(): Promise<void> {
  const IN = arg("in");
  if (!IN) fatal("--in=/tmp/… が必要。");
  const fs = await import("node:fs");
  if (!fs.existsSync(IN)) fatal(`payload なし: ${IN}（先に --phase=data を実行）`);
  const payload = JSON.parse(fs.readFileSync(IN, "utf8"));

  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { RealityPipelinePreviewClient } = await import("@/app/(culcept)/plan/dev-reality-pipeline/RealityPipelinePreviewClient");
  const html = renderToStaticMarkup(
    createElement(RealityPipelinePreviewClient, {
      envelope: payload.envelope,
      meta: payload.meta,
      reflectionPreview: payload.reflectionPreview,
    }),
  );

  let pass = true;
  // ── Reflection Preview section 表示契約 ──
  pass = ok(html.includes("Reflection Preview（反映プレビュー・観測のみ）"), "render: section 名表示") && pass;
  pass = ok(html.includes("まだ予定には書き込んでいません。保存・確定・通知は行いません。"), "render: 必須文言表示") && pass;
  if (payload.reflectionPreview) {
    const dto = payload.reflectionPreview as { stage: string; preconditionVerdict: string | null; reflectedItemCount: number; items: { startTime: string; endTime?: string; label: string }[] };
    pass = ok(html.includes(dto.stage), `render: stage（${dto.stage}）表示`) && pass;
    pass = ok(dto.preconditionVerdict === null || html.includes(dto.preconditionVerdict), `render: preconditionVerdict（${dto.preconditionVerdict}）表示`) && pass;
    pass = ok(html.includes(String(dto.reflectedItemCount)), "render: reflectedItemCount 表示") && pass;
    pass = ok(dto.items.every((i) => html.includes(`${i.startTime}`) && html.includes(i.label)), "render: 全 item の HH:MM + allowlist label 表示") && pass;
    pass = ok(dto.items.every((i) => LABEL_ALLOWLIST.has(i.label)), "render: label は allowlist のみ") && pass;
  }
  pass = ok(html.includes("すべて動かせる候補（suggestion）・エンジン推論。未確定。"), "render: page 固定文（origin/rigidity 抽象表示）") && pass;
  // ── denied data / 導線 不在 ──
  pass = ok(!html.includes("display:emptyday"), "render: item id / display id を出さない") && pass;
  pass = ok(!html.includes("<button"), "render: button（apply/save/commit/confirm）一切なし") && pass;
  pass = ok(!html.includes("反映済み") && !html.includes("書き込み済み") && !html.includes("保存済み"), "render: 完了語なし") && pass;
  pass = ok(!FORBIDDEN.test(html), "render: HTML に raw/PII/title/location/seedRef なし") && pass;
  pass = ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i.test(html), "render: UUID なし") && pass;
  pass = ok(html.includes("redaction") && html.includes("clean ✓"), "render: client 自己 redaction チェック=clean") && pass;

  fs.unlinkSync(IN); // temp payload 削除（残さない）
  log("▶ temp payload 削除済");
  log(`\n${pass ? "✅ PASS" : "❌ FAIL"} — phase=render（実 client render・表示契約検証・write 0）`);
  process.exit(pass ? 0 : 1);
}

if (PHASE === "flag-off") phaseFlagOff().catch((err) => fatal(`unexpected: ${err instanceof Error ? err.message : String(err)}`));
else if (PHASE === "data") phaseData().catch((err) => fatal(`unexpected: ${err instanceof Error ? err.message : String(err)}`));
else if (PHASE === "render") phaseRender().catch((err) => fatal(`unexpected: ${err instanceof Error ? err.message : String(err)}`));
else fatal("--phase=flag-off|data|render を指定。");
