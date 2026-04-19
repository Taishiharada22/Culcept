/**
 * CoAlter Stage 1 Understand — 内部ペア匿名化 export CLI
 *
 * 実行例:
 *   COALTER_EXPORT_PAIR_USER_A=<uuid> \
 *   COALTER_EXPORT_PAIR_USER_B=<uuid> \
 *   COALTER_EXPORT_PAIR_PEPPER=<secret> \
 *   npx tsx scripts/coalter/export-internal-pair.ts
 *
 * [CEO lock 2026-04-20 M0-6B] 出力ファイル:
 *   - `scripts/coalter/internal-pairs/internal-pair-<pairHash>.json`
 *   - chmod 600（.gitignore 済み）
 *
 * 含めてよいもの: pairHash / 集約 signal (CompressedTodayInput) / rule snapshot（集約形）
 * 含めてはいけないもの: userId / displayName / email / turns.body / 生 narrative
 * → `assertAnonymized` が JSON.stringify の結果を検査して違反があれば throw。
 *
 * [CEO lock 2026-04-20 shadow 実行承認] Y-lite scope:
 *   使ってよい: talk_messages / stargazer_axis_snapshots / stargazer_inner_weather /
 *              stargazer_alter_growth (hdm_phase_state, trust_level) /
 *              coalter_fairness_ledger / coalter_pair_states / coalter_sessions
 *   使わない:   calendar / wardrobe / styleProfile / その他横断データ
 *
 * 既存 fixture を使う smoke test 経路:
 *   COALTER_EXPORT_INPUT=<json path>  （指定時は Supabase を叩かない）
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { config as loadDotenv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  assertAnonymized,
  computePairHash,
  type InternalPairCase,
  type InternalPairExportV1,
  type RuleSnapshot,
} from "@/lib/coalter/understanding/__testkit__/internalPairSchema";
import {
  buildObservationBundle,
  type CollectorInputs,
  type PersonCollectorInput,
  type RelationshipCollectorInput,
  type ConversationCollectorInput,
  type EnvironmentalCollectorInput,
} from "@/lib/coalter/understanding/observationBundle";
import { readTodayRuleBased } from "@/lib/coalter/understanding/todayReader";
import { compressForTodayReader } from "@/lib/coalter/understanding/compressTodayInput";
import type {
  ConversationTurn,
  DecisionAxis,
  FairnessRecord,
  HdmPhaseSummary,
  IsoTimestamp,
  ThemeTag,
  TrustLevelScalar,
} from "@/lib/coalter/understanding/types";

loadDotenv({ path: ".env.local" });

// ═══════════════════════════════════════════════════════════════════════════
// 1. CLI entry
// ═══════════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  const userA = requiredEnv("COALTER_EXPORT_PAIR_USER_A");
  const userB = requiredEnv("COALTER_EXPORT_PAIR_USER_B");
  const pepper = requiredEnv("COALTER_EXPORT_PAIR_PEPPER");
  const outDir =
    process.env.COALTER_EXPORT_OUT_DIR ?? "scripts/coalter/internal-pairs";

  const pairHash = computePairHash(userA, userB, pepper);

  const { cases, queryHash } = await loadCases(userA, userB);

  const doc: InternalPairExportV1 = {
    schemaVersion: "coalter.internal_pair.v1",
    pairHash,
    extractedAt: new Date().toISOString(),
    sessionCount: cases.length,
    cases,
  };

  assertAnonymized(doc);

  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `internal-pair-${pairHash}.json`);
  fs.writeFileSync(outPath, JSON.stringify(doc, null, 2), "utf8");
  fs.chmodSync(outPath, 0o600);

  // 集約値のみ。raw text は出さない。queryHash は consent 文書 §4 追記用。
  console.log(
    `[coalter/export] pairHash=${pairHash} sessionCount=${cases.length} queryHash=${queryHash} out=${outPath}`,
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. helpers
// ═══════════════════════════════════════════════════════════════════════════

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (typeof v !== "string" || v.length === 0) {
    throw new Error(`[coalter/export] env ${name} is required`);
  }
  return v;
}

async function loadCases(
  userA: string,
  userB: string,
): Promise<{ cases: InternalPairCase[]; queryHash: string }> {
  const fixturePath = process.env.COALTER_EXPORT_INPUT;
  if (typeof fixturePath === "string" && fixturePath.length > 0) {
    const raw = fs.readFileSync(fixturePath, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error("[coalter/export] COALTER_EXPORT_INPUT must be array");
    }
    const queryHash = sha256Hex(`fixture:${fixturePath}`).slice(0, 16);
    return { cases: parsed as InternalPairCase[], queryHash };
  }
  return loadSessionsFromSupabase(userA, userB);
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Supabase collector (Y-lite scope, read-only)
// ═══════════════════════════════════════════════════════════════════════════

type AxisRow = {
  user_id: string;
  axis_id: string;
  score: string | number;
  confidence: string | number | null;
  observation_layer: string | null;
  context: string | null;
  created_at: string;
};

type WeatherRow = {
  user_id: string;
  weather_type: string;
  energy_level: number | null;
  stress_level: number | null;
  emotional_tone: string | null;
  social_battery: number | null;
  stability: number | null;
  recorded_at: string;
};

type GrowthRow = {
  user_id: string;
  hdm_phase_state: {
    currentPhase?: number;
    lastTransitionAt?: string | null;
  } | null;
  trust_level: number | null;
  updated_at: string;
};

type FairnessRow = {
  session_id: string;
  bias_score: number;
  decided_at: string;
};

type MessageRow = {
  sender_id: string;
  body: string;
  created_at: string;
};

type SessionRow = {
  id: string;
  mode: string;
  trigger_pattern: string | null;
  created_at: string;
  ended_at: string | null;
};

async function loadSessionsFromSupabase(
  userA: string,
  userB: string,
): Promise<{ cases: InternalPairCase[]; queryHash: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "[coalter/export] NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required",
    );
  }
  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });

  const pair = await fetchPairState(supabase, userA, userB);

  const [sessions, messages, axesAll, weatherAll, growthRows, fairnessRows] =
    await Promise.all([
      fetchSessions(supabase, pair.id),
      fetchMessages(supabase, pair.thread_id),
      fetchAxes(supabase, [userA, userB]),
      fetchWeather(supabase, [userA, userB]),
      fetchGrowth(supabase, [userA, userB]),
      fetchFairness(supabase, pair.id),
    ]);

  const queryHash = sha256Hex(
    `pair=${pair.id}|sessions=${sessions.length}|msgs=${messages.length}|axes=${axesAll.length}|weather=${weatherAll.length}|fairness=${fairnessRows.length}`,
  ).slice(0, 16);

  const cases: InternalPairCase[] = [];
  for (let i = 0; i < sessions.length; i += 1) {
    const sess = sessions[i];
    const nextStart = sessions[i + 1]?.created_at ?? null;
    const sessEnd = sess.ended_at ?? nextStart ?? new Date().toISOString();

    const inputs = buildSessionInputs({
      userA,
      userB,
      session: sess,
      sessEnd,
      messages,
      axesAll,
      weatherAll,
      growthRows,
      fairnessRows,
    });

    const bundle = buildObservationBundle(inputs);
    const reading = readTodayRuleBased(bundle);
    const compressed = compressForTodayReader(bundle);

    const ruleSnapshot: RuleSnapshot = {
      mode: reading.mode,
      energyBudget: reading.energyBudget,
      timeBudget: reading.timeBudget,
      confidence: reading.confidence,
      latentNeedsCount: reading.latentNeeds.length,
    };

    cases.push({
      caseId: sess.id,
      compressedInput: compressed,
      ruleSnapshot,
    });
  }

  return { cases, queryHash };
}

// ─── Supabase fetch primitives ──────────────────────────────────────────────

async function fetchPairState(
  supabase: SupabaseClient,
  userA: string,
  userB: string,
): Promise<{ id: string; thread_id: string }> {
  const { data: forward, error: fErr } = await supabase
    .from("coalter_pair_states")
    .select("id, thread_id, user_a, user_b, state")
    .eq("user_a", userA)
    .eq("user_b", userB)
    .eq("state", "enabled")
    .limit(1);
  if (fErr) throw new Error(`[coalter/export] pair query failed: ${fErr.message}`);
  let row = forward?.[0];
  if (!row) {
    const { data: reverse, error: rErr } = await supabase
      .from("coalter_pair_states")
      .select("id, thread_id, user_a, user_b, state")
      .eq("user_a", userB)
      .eq("user_b", userA)
      .eq("state", "enabled")
      .limit(1);
    if (rErr) throw new Error(`[coalter/export] pair query failed: ${rErr.message}`);
    row = reverse?.[0];
  }
  if (!row) {
    throw new Error("[coalter/export] no enabled coalter_pair_states row for given users");
  }
  return { id: row.id as string, thread_id: row.thread_id as string };
}

async function fetchSessions(
  supabase: SupabaseClient,
  pairStateId: string,
): Promise<SessionRow[]> {
  const { data, error } = await supabase
    .from("coalter_sessions")
    .select("id, mode, trigger_pattern, created_at, ended_at")
    .eq("pair_state_id", pairStateId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`[coalter/export] sessions fetch failed: ${error.message}`);
  return (data ?? []) as SessionRow[];
}

async function fetchMessages(
  supabase: SupabaseClient,
  threadId: string,
): Promise<MessageRow[]> {
  const { data, error } = await supabase
    .from("talk_messages")
    .select("sender_id, body, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`[coalter/export] messages fetch failed: ${error.message}`);
  return (data ?? []) as MessageRow[];
}

async function fetchAxes(
  supabase: SupabaseClient,
  userIds: string[],
): Promise<AxisRow[]> {
  const { data, error } = await supabase
    .from("stargazer_axis_snapshots")
    .select(
      "user_id, axis_id, score, confidence, observation_layer, context, created_at",
    )
    .in("user_id", userIds)
    .is("context", null)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`[coalter/export] axes fetch failed: ${error.message}`);
  return (data ?? []) as AxisRow[];
}

async function fetchWeather(
  supabase: SupabaseClient,
  userIds: string[],
): Promise<WeatherRow[]> {
  const { data, error } = await supabase
    .from("stargazer_inner_weather")
    .select(
      "user_id, weather_type, energy_level, stress_level, emotional_tone, social_battery, stability, recorded_at",
    )
    .in("user_id", userIds)
    .order("recorded_at", { ascending: true });
  if (error) throw new Error(`[coalter/export] weather fetch failed: ${error.message}`);
  return (data ?? []) as WeatherRow[];
}

async function fetchGrowth(
  supabase: SupabaseClient,
  userIds: string[],
): Promise<GrowthRow[]> {
  const { data, error } = await supabase
    .from("stargazer_alter_growth")
    .select("user_id, hdm_phase_state, trust_level, updated_at")
    .in("user_id", userIds);
  if (error) throw new Error(`[coalter/export] growth fetch failed: ${error.message}`);
  return (data ?? []) as GrowthRow[];
}

async function fetchFairness(
  supabase: SupabaseClient,
  pairStateId: string,
): Promise<FairnessRow[]> {
  const { data, error } = await supabase
    .from("coalter_fairness_ledger")
    .select("session_id, bias_score, decided_at")
    .eq("pair_state_id", pairStateId)
    .order("decided_at", { ascending: true });
  if (error) throw new Error(`[coalter/export] fairness fetch failed: ${error.message}`);
  return (data ?? []) as FairnessRow[];
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Per-session composition → CollectorInputs
//    userId は "pair_user_a" / "pair_user_b" に置換（real UUID を export に出さない）
// ═══════════════════════════════════════════════════════════════════════════

const ANON_A = "pair_user_a";
const ANON_B = "pair_user_b";

function buildSessionInputs(args: {
  userA: string;
  userB: string;
  session: SessionRow;
  sessEnd: string;
  messages: MessageRow[];
  axesAll: AxisRow[];
  weatherAll: WeatherRow[];
  growthRows: GrowthRow[];
  fairnessRows: FairnessRow[];
}): CollectorInputs {
  const { userA, userB, session, sessEnd, messages, axesAll, weatherAll, growthRows, fairnessRows } = args;
  const sessStart = session.created_at;

  const turns: ConversationTurn[] = messages
    .filter((m) => m.created_at >= sessStart && m.created_at <= sessEnd)
    .map((m) => ({
      senderId: m.sender_id === userA ? ANON_A : m.sender_id === userB ? ANON_B : ANON_A,
      body: m.body,
      createdAt: m.created_at as IsoTimestamp,
    }));

  const personA = buildPerson(ANON_A, userA, sessStart, axesAll, weatherAll, growthRows);
  const personB = buildPerson(ANON_B, userB, sessStart, axesAll, weatherAll, growthRows);

  const relationship: RelationshipCollectorInput = {
    sharedHistory: [],
    fairnessLedger: fairnessRows
      .filter((f) => f.decided_at <= sessStart)
      .map((f) => ({
        sessionId: f.session_id,
        decidedAt: f.decided_at as IsoTimestamp,
        skew: clampRange(f.bias_score, -1, 1),
        topic: session.trigger_pattern ?? "general",
      })),
    currentTemperature: null,
    interactionPattern: null,
    unresolvedThreads: [],
    rupturesAndRepairs: [],
  };

  const latestWeatherA = latestBefore(weatherAll.filter((w) => w.user_id === userA), sessStart, (w) => w.recorded_at);
  const latestWeatherB = latestBefore(weatherAll.filter((w) => w.user_id === userB), sessStart, (w) => w.recorded_at);

  const conversation: ConversationCollectorInput = {
    turns,
    theme: mapTriggerToTheme(session.trigger_pattern),
    extractedConstraints: null,
    caringIntensity: null,
    implicitMood: latestWeatherA?.emotional_tone ?? latestWeatherB?.emotional_tone ?? null,
    energyLevel: mapEnergyLevel(latestWeatherA?.energy_level, latestWeatherB?.energy_level),
    conversationArc: null,
    questionGuardState: null,
  };

  const environmental: EnvironmentalCollectorInput = {
    timestamp: sessStart as IsoTimestamp,
    weather: null,
  };

  return {
    personA,
    personB,
    relationship,
    conversation,
    environmental,
    collectedAt: sessStart as IsoTimestamp,
  };
}

function buildPerson(
  anonId: string,
  realId: string,
  before: string,
  axesAll: AxisRow[],
  weatherAll: WeatherRow[],
  growthRows: GrowthRow[],
): PersonCollectorInput {
  const axes = latestAxesPerKey(axesAll.filter((a) => a.user_id === realId), before);
  const weather = latestBefore(weatherAll.filter((w) => w.user_id === realId), before, (w) => w.recorded_at);
  const growth = growthRows.find((g) => g.user_id === realId) ?? null;

  const phaseState: HdmPhaseSummary | null = growth?.hdm_phase_state?.currentPhase != null
    ? {
        phase: clampRange(growth.hdm_phase_state.currentPhase ?? 0, 0, 5),
        lastTransitionAt: (growth.hdm_phase_state.lastTransitionAt ?? growth.updated_at) as IsoTimestamp,
      }
    : null;

  const trustLevel: TrustLevelScalar | null = growth
    ? {
        level: clampRange((growth.trust_level ?? 0) * 5, 0, 5),
        observedAt: growth.updated_at as IsoTimestamp,
      }
    : null;

  const recentEmotional = weather?.emotional_tone
    ? {
        dominantAffect: weather.emotional_tone,
        intensity: clampRange(
          ((weather.energy_level ?? 0.5) + (weather.stress_level ?? 0.5)) / 2,
          0,
          1,
        ),
        observedAt: weather.recorded_at as IsoTimestamp,
      }
    : null;

  return {
    userId: anonId,
    displayName: anonId === ANON_A ? "A" : "B",
    stargazer:
      axes.length > 0
        ? {
            axes,
            comfortSources: [],
            fatigueTriggers: [],
            recoveryConditions: [],
            unspokenDesires: [],
            breakingConditions: [],
            stateVariability: null,
          }
        : null,
    alter:
      phaseState || trustLevel || recentEmotional
        ? {
            personalityLens: null,
            recentEmotionalState: recentEmotional,
            trustLevel,
            phaseState,
            recentNarratives: [],
          }
        : null,
    behavioral: null, // Y-lite: calendar / wear は使わない
    context: null, // Y-lite: location / wardrobe / styleProfile は使わない
  };
}

// ─── axis / weather pickers ─────────────────────────────────────────────────

function latestAxesPerKey(rows: AxisRow[], before: string): DecisionAxis[] {
  const byAxis = new Map<string, AxisRow>();
  for (const r of rows) {
    if (r.created_at > before) continue;
    const cur = byAxis.get(r.axis_id);
    if (!cur || cur.created_at < r.created_at) byAxis.set(r.axis_id, r);
  }
  return Array.from(byAxis.values()).map((r) => ({
    key: r.axis_id,
    value: clampRange(Number(r.score), -1, 1),
    confidence: clampRange(Number(r.confidence ?? 0), 0, 1),
    observedAt: r.created_at as IsoTimestamp,
  }));
}

function latestBefore<T>(rows: T[], before: string, getTs: (r: T) => string): T | null {
  let latest: T | null = null;
  let latestTs = "";
  for (const r of rows) {
    const ts = getTs(r);
    if (ts > before) continue;
    if (ts > latestTs) {
      latest = r;
      latestTs = ts;
    }
  }
  return latest;
}

function mapEnergyLevel(
  a: number | null | undefined,
  b: number | null | undefined,
): "high" | "mid" | "low" | null {
  const vals = [a, b].filter((v): v is number => typeof v === "number");
  if (vals.length === 0) return null;
  const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
  if (avg >= 0.66) return "high";
  if (avg >= 0.33) return "mid";
  return "low";
}

function mapTriggerToTheme(trigger: string | null): ThemeTag {
  if (!trigger) return null;
  const t = trigger.toLowerCase();
  if (/(movie|film|cinema)/.test(t)) return "movie";
  if (/(food|lunch|dinner|meal|eat)/.test(t)) return "food";
  if (/(travel|trip)/.test(t)) return "travel";
  if (/(gift|present)/.test(t)) return "gift";
  return "other";
}

function clampRange(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return lo;
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}

function sha256Hex(s: string): string {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. main
// ═══════════════════════════════════════════════════════════════════════════

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[coalter/export] fatal: ${msg}`);
  process.exit(1);
});
