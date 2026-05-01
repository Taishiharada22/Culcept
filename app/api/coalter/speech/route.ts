/**
 * Stage 4 L4-i Phase 1 — Presence Speech Synthesis API
 *
 * 正本: layout plan v0.3 §7.9 / CEO 確定方針 (2026-04-30 L4-i 設計 v2)
 *
 * POST /api/coalter/speech
 *   - flag OFF (presenceExecutorEnabled): 503 service_unavailable
 *   - LLM disabled (presenceSpeechLLMEnabled / ANTHROPIC_API_KEY 未設定):
 *     200 + speechSource:"static" + fallbackReason:"flag_off"
 *   - missing required field (state/mode/variant/threadId): 400
 *   - state が S2/S5/S7 以外: 400 (LLM 対象外、Phase 1 厳格)
 *   - unauthorized (no session): 401
 *   - thread/pair not found: 404
 *   - not pair member: 403
 *   - rate limit 超過 (soft guard): 200 + speechSource:"static" + fallbackReason:"rate_limited"
 *   - LLM 5xx / 通信エラー: 200 + speechSource:"fallback" + fallbackReason:"llm_error"
 *   - validation 全 retry 後も違反: 200 + speechSource:"fallback" + fallbackReason:"validation_failed"
 *   - LLM 成功: 200 + speechSource:"llm" + body=<合成文面>
 *
 * 不変原則 (CEO 厳守 2026-04-30):
 *   - server-side route (anon key + cookie session = RLS 経由で gate)
 *   - 二重 gate: client `speechFetchGate.ts` + server flag check
 *   - request payload に **会話本文 / ユーザー入力文 / 個人情報を入れない**
 *   - response.body 以外 (prompt / LLM raw / 違反 message) を Sentry / log payload に入れない
 *   - rate limit は **soft guard** (Phase 1 では cross-instance を保証しない)
 *   - auth 失敗は **401 (not static fallback)** — fallback と auth 失敗を混ぜない (CEO 厳守)
 *   - Phase 1 では LLM を呼ばない (env 未設定で必ず flag_off response)
 *   - L4-l flip / Phase 2 で env 設定後に LLM 経路が初めて active
 */

import { NextResponse, type NextRequest } from "next/server";

import { COALTER_FLAGS } from "@/lib/coalter/flags";
import { supabaseServer } from "@/lib/supabase/server";
import {
  buildPresenceSpeech,
  hasLlmCallInjected,
  setLlmCall,
} from "@/lib/coalter/presence/speechBuilder";
import { createAnthropicLlmCallFromEnv } from "@/lib/coalter/presence/llmCall";
import {
  PRESENCE_STATES,
  PRESENCE_MODES,
  PATTERN_VARIANTS,
  type PatternVariant,
  type PresenceMode,
  type PresenceState,
} from "@/lib/coalter/presence/types";

export const runtime = "nodejs";

/** L4-i Phase 1: LLM 発火対象 state は S2/S5/S7 のみ (CEO 確定 2026-04-30 設計 v2) */
const SPEECH_ENABLED_STATES: ReadonlySet<PresenceState> = new Set([
  "S2",
  "S5",
  "S7",
]);

/**
 * Static fallback 文面 (variant 別、CEO 厳守: client 側 component の hardcoded と
 * 一致させない — server 側は variant 軸で管理、client 側は state 軸の hardcoded)。
 *
 * speechBuilder.ts:34-42 の STATIC_MOCK_BY_VARIANT と同一値 (重複 acknowledged、
 * 別 phase で集約検討)。
 */
const SERVER_STATIC_MOCK_BY_VARIANT: Readonly<Record<PatternVariant, string>> = {
  A: "今、間に入れそうな間が少しありそう。",
  B: "二人の間に少し温度差が見えるかもしれません。",
  C: "少し整理する時間を入れてみるのはどうですか？",
  D: "その揺れに視線を向けてみてもいいかもしれません。",
  E: "違う言葉で言うと、こう聞こえているのかもしれません。",
  F1: "二人で少し話す時間を取れるとよさそうです。",
  F2: "夕方の予定を整えるなら、20 分の話す時間を入れてみる方法があります。",
};

interface SpeechRequest {
  state: PresenceState;
  mode: PresenceMode;
  variant: PatternVariant;
  threadId: string;
  contextEnums?: Readonly<Record<string, unknown>>;
}

interface SpeechResponse {
  body: string;
  /** L4-i Phase 1: speech 合成 source */
  speechSource: "static" | "llm" | "fallback";
  /** retry 回数 (0 = 1 発、>=1 = retry、-1 = 全 retry 失敗で fallback) */
  retries: number;
  /** LLM call 経過時間 (ms)、static で 0 */
  latencyMs: number;
  /** validator 違反検出したか (true でも fallback で safe) */
  validationFailed: boolean;
  /** fallback 理由 (speechSource="static" or "llm" で null) */
  fallbackReason:
    | null
    | "flag_off"
    | "rate_limited"
    | "llm_error"
    | "validation_failed"
    | "timeout";
}

function flagOffResponse() {
  return NextResponse.json(
    {
      error: "presence_executor_disabled",
      message:
        "CoAlter Presence executor is disabled (Stage 4 L4-l flip まで OFF)。",
    },
    { status: 503 },
  );
}

function staticFallbackResponse(
  variant: PatternVariant,
  fallbackReason: SpeechResponse["fallbackReason"],
): NextResponse {
  const body: SpeechResponse = {
    body: SERVER_STATIC_MOCK_BY_VARIANT[variant],
    speechSource: "static",
    retries: 0,
    latencyMs: 0,
    validationFailed: false,
    fallbackReason,
  };
  return NextResponse.json(body, { status: 200 });
}

function llmFallbackResponse(
  variant: PatternVariant,
  fallbackReason: NonNullable<SpeechResponse["fallbackReason"]>,
  retries: number,
  latencyMs: number,
  validationFailed: boolean,
): NextResponse {
  const body: SpeechResponse = {
    body: SERVER_STATIC_MOCK_BY_VARIANT[variant],
    speechSource: "fallback",
    retries,
    latencyMs,
    validationFailed,
    fallbackReason,
  };
  return NextResponse.json(body, { status: 200 });
}

/**
 * Soft rate limit (Phase 1、in-memory per-instance、cross-instance NOT guaranteed)。
 *
 * Vercel serverless で instance 間で抜ける可能性は CEO 認知済 (Q4 修正方針)。
 * Phase 1 主防御は client 側 dedupe + AbortController。本 route は補助 guard。
 */
const RATE_LIMIT_PER_THREAD: Map<string, number[]> = new Map();
const RATE_LIMIT_WINDOW_MS = 60_000; // 60 秒
const RATE_LIMIT_MAX_PER_WINDOW = 5;
const RATE_LIMIT_HOUR_MS = 3600_000;
const RATE_LIMIT_MAX_PER_HOUR = 30;

function checkRateLimit(threadId: string): boolean {
  const now = Date.now();
  const history = RATE_LIMIT_PER_THREAD.get(threadId) ?? [];
  // 1 時間より古い記録は破棄
  const recent = history.filter((ts) => now - ts < RATE_LIMIT_HOUR_MS);
  // 60 秒以内
  const within60s = recent.filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);
  if (within60s.length >= RATE_LIMIT_MAX_PER_WINDOW) {
    return false; // 60 秒 5 件超
  }
  if (recent.length >= RATE_LIMIT_MAX_PER_HOUR) {
    return false; // 1 時間 30 件超
  }
  recent.push(now);
  RATE_LIMIT_PER_THREAD.set(threadId, recent);
  return true;
}

function isPresenceState(v: unknown): v is PresenceState {
  return (
    typeof v === "string" && (PRESENCE_STATES as readonly string[]).includes(v)
  );
}

function isPresenceMode(v: unknown): v is PresenceMode {
  return (
    typeof v === "string" && (PRESENCE_MODES as readonly string[]).includes(v)
  );
}

function isPatternVariant(v: unknown): v is PatternVariant {
  return (
    typeof v === "string" && (PATTERN_VARIANTS as readonly string[]).includes(v)
  );
}

export async function POST(req: NextRequest) {
  // Gate 1: presenceExecutor flag (entire CoAlter route gate)
  if (!COALTER_FLAGS.presenceExecutorEnabled) {
    return flagOffResponse();
  }

  // Request parsing
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_json", message: "request body is not valid JSON" },
      { status: 400 },
    );
  }
  if (typeof raw !== "object" || raw === null) {
    return NextResponse.json(
      { error: "invalid_request", message: "request body must be an object" },
      { status: 400 },
    );
  }
  const body = raw as Record<string, unknown>;

  const state = body.state;
  const mode = body.mode;
  const variant = body.variant;
  const threadId = body.threadId;

  if (!isPresenceState(state)) {
    return NextResponse.json(
      { error: "invalid_state", message: "state must be S0-S8" },
      { status: 400 },
    );
  }
  if (!isPresenceMode(mode)) {
    return NextResponse.json(
      { error: "invalid_mode", message: "mode must be normal/daily/travel" },
      { status: 400 },
    );
  }
  if (!isPatternVariant(variant)) {
    return NextResponse.json(
      { error: "invalid_variant", message: "variant must be A-F2" },
      { status: 400 },
    );
  }
  if (typeof threadId !== "string" || threadId.length === 0) {
    return NextResponse.json(
      { error: "missing_thread_id", message: "threadId is required" },
      { status: 400 },
    );
  }
  if (!SPEECH_ENABLED_STATES.has(state)) {
    return NextResponse.json(
      {
        error: "state_not_speech_enabled",
        message: "Phase 1: speech synthesis is restricted to S2/S5/S7",
      },
      { status: 400 },
    );
  }

  // Auth check (cookie session → 401 if absent、CEO 厳守 fallback と混ぜない)
  const supabase = await supabaseServer();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return NextResponse.json(
      { error: "unauthorized", message: "auth session required" },
      { status: 401 },
    );
  }
  const userId = authData.user.id;

  // Pair lookup (RLS で pair member のみ取得可)
  const { data: pair, error: pairError } = await supabase
    .from("coalter_pair_states")
    .select("id, user_a, user_b")
    .eq("thread_id", threadId)
    .maybeSingle();
  if (pairError) {
    return NextResponse.json(
      { error: "internal", message: "pair lookup failed" },
      { status: 500 },
    );
  }
  if (!pair) {
    return NextResponse.json(
      { error: "pair_not_found", message: "no pair for thread" },
      { status: 404 },
    );
  }
  const isMember = pair.user_a === userId || pair.user_b === userId;
  if (!isMember) {
    return NextResponse.json(
      { error: "forbidden", message: "not a pair member" },
      { status: 403 },
    );
  }

  // Gate 2: LLM flag + API key (Phase 1 default OFF)
  // Phase 1 では env 未設定で必ずここで fallback 経路に入る (LLM 課金ゼロ)
  if (
    !COALTER_FLAGS.presenceSpeechLLMEnabled ||
    !process.env.ANTHROPIC_API_KEY
  ) {
    return staticFallbackResponse(variant, "flag_off");
  }

  // Gate 3: Soft rate limit (Phase 1: per-instance、cross-instance NOT guaranteed)
  if (!checkRateLimit(threadId)) {
    return staticFallbackResponse(variant, "rate_limited");
  }

  // L4-i Phase 2 (CEO 確定 2026-05-01 fix-forward): lazy init recovery path。
  //
  // instrumentation.ts は cold start で setLlmCall(createAnthropicLlmCallFromEnv())
  // を呼ぶが、Vercel serverless で route の function instance に instrumentation
  // が反映されていないケース (cold start 時 env 未到達 / 別 instance 等) があるため、
  // request 時に injection を再確認して null なら復旧させる。
  //
  // gate 2 通過 = ANTHROPIC_API_KEY が runtime で読めることを保証しているので、
  // ここで createAnthropicLlmCallFromEnv() は確実に non-null を返す想定。
  if (!hasLlmCallInjected()) {
    const llmFn = createAnthropicLlmCallFromEnv();
    if (llmFn) {
      setLlmCall(llmFn);
    }
    // null のままなら buildPresenceSpeech 内で source="fallback" /
    // fallbackReason="llm_error" が返る (本書 SpeechOutput metadata で正直に
    // propagate される)
  }

  // LLM 呼び出し (実 source / retries / latencyMs / validationFailed / fallbackReason は
  // speechBuilder の SpeechOutput metadata から直接 propagate)
  let speechResult: Awaited<ReturnType<typeof buildPresenceSpeech>>;
  try {
    speechResult = await buildPresenceSpeech({
      variant,
      state,
      mode,
      // contextEnums は将来拡張用。Phase 1 では undefined のまま渡す
      // (会話本文を入れない原則維持)
    });
  } catch {
    // unexpected throw (speechBuilder 内 try/catch をすり抜けた場合)
    return llmFallbackResponse(variant, "llm_error", 0, 0, false);
  }

  // SpeechOutput metadata を SpeechResponse に直接 propagate (mislabel fix)
  const response: SpeechResponse = {
    body: speechResult.body,
    speechSource: speechResult.source,
    retries: speechResult.retries,
    latencyMs: speechResult.latencyMs,
    validationFailed: speechResult.validationFailed,
    fallbackReason: speechResult.fallbackReason,
  };
  return NextResponse.json(response, { status: 200 });
}
