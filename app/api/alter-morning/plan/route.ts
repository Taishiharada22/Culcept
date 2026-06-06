/**
 * POST /api/alter-morning/plan — Comprehension-First v1.3+ Wave 3 (W3-PR-3)
 *
 * 設計書: docs/alter-morning-comprehension-first-wave3-design.md §7
 *
 * 責務（route handler として意識的に薄く保つ）:
 *   1. auth（Supabase）
 *   2. feature flag 判定（`ALTER_MORNING_V2_ROUTE_ENABLED` default OFF）
 *   3. 入力 body の最低限の shape 検査
 *   4. providers を組み立て `runMorningPipeline` に委譲（orchestrator が唯一の配線点）
 *   5. 結果をそのまま return
 *
 * この route に判断ロジック・annotation 加工・narration 加工を入れない。
 */

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import {
  runMorningPipeline,
  type MorningPipelineInput,
  type MorningPipelineProviders,
} from "@/lib/alter-morning/morningPipeline";
import { createLLMComprehensionProvider } from "@/lib/alter-morning/comprehension/llmComprehensionProvider";
import { createLLMNarrationProvider } from "@/lib/alter-morning/expression/llmNarrationProvider";
import { fireMorningCapture, type MorningCaptureClient } from "@/lib/plan/reality/integration/alter-morning-capture-observe";
import {
  buildMorningCaptureSurface,
  type PendingCapturedRowsReadClient,
} from "@/lib/plan/reality/integration/morning-capture-surface.server";
import { appendCaptureCandidateToMorningResult } from "@/lib/plan/reality/integration/candidate-response-assembler";

export const runtime = "nodejs";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Feature flag
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * C-1 固定: default OFF。明示的に "true" でのみ有効化。
 * test では vi.stubEnv で上書きする。
 */
function isRouteEnabled(): boolean {
  return process.env.ALTER_MORNING_V2_ROUTE_ENABLED === "true";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Body validation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface PlanRequestBody {
  utterance: string;
  targetDateHint?: string;
  phenotype?: MorningPipelineInput["phenotype"];
  partyBaseline?: MorningPipelineInput["partyBaseline"];
  weatherContext?: MorningPipelineInput["weatherContext"];
}

function parseBody(raw: unknown): PlanRequestBody | { error: string } {
  if (!raw || typeof raw !== "object") return { error: "body must be object" };
  const o = raw as Record<string, unknown>;
  if (typeof o.utterance !== "string" || o.utterance.trim().length === 0) {
    return { error: "utterance is required" };
  }
  // 残りの field は type がゆるいまま orchestrator に渡す（orchestrator 側で default 補完）
  const body: PlanRequestBody = { utterance: o.utterance };
  if (typeof o.targetDateHint === "string") body.targetDateHint = o.targetDateHint;
  if (o.phenotype && typeof o.phenotype === "object") {
    body.phenotype = o.phenotype as MorningPipelineInput["phenotype"];
  }
  if (Array.isArray(o.partyBaseline)) {
    body.partyBaseline = o.partyBaseline as MorningPipelineInput["partyBaseline"];
  }
  if (o.weatherContext && typeof o.weatherContext === "object") {
    body.weatherContext = o.weatherContext as MorningPipelineInput["weatherContext"];
  }
  return body;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Handler
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function POST(request: Request) {
  // (C-1) Feature flag — default OFF
  if (!isRouteEnabled()) {
    return NextResponse.json(
      { ok: false, error: "Not found" },
      { status: 404 },
    );
  }

  // Auth
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  // Parse
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid JSON" },
      { status: 400 },
    );
  }
  const body = parseBody(parsed);
  if ("error" in body) {
    return NextResponse.json(
      { ok: false, error: body.error },
      { status: 400 },
    );
  }

  // A1-5-5g-2/4: capture（**fire-and-forget・response 不変**・observe/write は flag が決める）。
  //   mode 決定は helper（decideCaptureMode）: kill 最優先 → LIVE=write（real RPC・実 DB）→ OBSERVE=observe（dry-run・実 DB 0）→ none（no-op・default）。
  //   gate（production / 非 staging / 非 canary / kill）で extractor 0 / write 0。write mode は認証済 supabase client を RPC 先に使う（user-RLS・service_role 不要）。
  //   fire-and-forget（void 同期返却・helper は never-throw 契約）+ ここでも try/catch（二重防御）で user response（{ok,data}/{ok,error}）に一切影響させない。
  try {
    fireMorningCapture(body.utterance, user.id, supabase as unknown as MorningCaptureClient);
  } catch {
    // capture 配線の例外は user response に影響させない（response 不変を絶対保証）
  }

  // Providers を組む（orchestrator が唯一の配線点）
  const providers: MorningPipelineProviders = {
    comprehension: createLLMComprehensionProvider({
      userId: user.id,
    }),
    narration: createLLMNarrationProvider({
      userId: user.id,
    }),
    // weather / partyBaseline は Wave 3 では注入なし（Wave 4+）
    weather: null,
  };

  try {
    const result = await runMorningPipeline(body, providers);

    // A1-5-7-5: capture candidate surface（**read-only・fail-open・additive・gated・実 LLM await なし**）。
    //   pending captured seed/evidence を read-only consumption し、候補があれば `data.captureCandidate?` を additive 追加。
    //   flag off / kill / production / 非 staging / 非 canary / no candidate / read error → null → 既存 response 完全一致（後方互換）。
    //   fire-and-forget capture write（上の fireMorningCapture）とは独立（surface は read 側）。response/error envelope は不変。
    let data: typeof result | ReturnType<typeof appendCaptureCandidateToMorningResult<typeof result>> = result;
    try {
      const surface = await buildMorningCaptureSurface(
        supabase as unknown as PendingCapturedRowsReadClient,
        user.id,
        result.comprehension?.targetDate,
      );
      data = appendCaptureCandidateToMorningResult(result, surface);
    } catch {
      // fail-open: surface 失敗は user response を壊さない（data = result）
    }
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    console.error("[alter-morning/plan] pipeline error", err);
    return NextResponse.json(
      { ok: false, error: "pipeline_error" },
      { status: 500 },
    );
  }
}
