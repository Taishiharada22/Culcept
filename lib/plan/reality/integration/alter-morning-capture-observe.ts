import "server-only";
/**
 * Reality Control OS — A1-5-5g-2/4 Alter-Morning Route Capture Wiring（server-only・observe+write・barrel 非 export）
 *
 * 設計: docs/aneurasync-reality-control-os-connection-design.md §8.35/§8.36/§8.38
 *
 * 役割: `app/api/alter-morning/plan/route.ts` が **fire-and-forget** で呼ぶ capture 配線。
 *   route の utterance から would/did-capture する。**route response を変えない**。
 *   route は薄く保つ原則ゆえ、mode 決定 / gate 解決 / deps 構築 / fire-and-forget をここに集約する（route は 1 行）。
 *
 * 厳守:
 *   - **mode 決定（decideCaptureMode）**: kill 最優先 → LIVE=write（real RPC・実 DB write）→ OBSERVE=observe（dry-run fake・実 DB 0）→ none（no-op）。
 *     **default は両 flag off → no-op（production 挙動変更ゼロ）**。write の real RPC は user-RLS / SECURITY INVOKER / service_role 不要。
 *   - **fire-and-forget・never-throw**: `fireMorningCapture` は **void を同期返却**し、内部の async capture を待たない・例外を握りつぶす（write mode でも同方針）。
 *     → route の user response（{ok,data}/{ok,error}）に一切影響しない。
 *   - **cheap guard**: mode=null（kill / 両 flag off）なら **即 return**（real extractor を構築しない）。
 *   - **gate が production hard block**: NEXT_PUBLIC_SUPABASE_URL が production(aljav) / 非 staging / 非 canary / nodeEnv=production なら gate block → extractor 0 / write 0（runCaptureService が gate 最初）。
 *   - **raw は extraction.utterance のみ**。result は redacted（WouldCaptureSummary・reason code のみ）。raw/prompt/response/apiKey/seedId を出さない。
 *   - server-only / barrel 非 export。
 */

import { randomUUID } from "node:crypto";
import { PLAN_FLAGS } from "../../featureFlags";
import { createServerLlmSeedExtractor } from "../llm-seed-extractor-adapter.server";
import { createFakeCaptureWriteClient, type CaptureWriteClient } from "./capture-write-repository";
import { createRpcCaptureWriteClient, type RpcCapableClient } from "./capture-rpc-adapter";
import { runCaptureRouteObserver, type CaptureRouteRunnerResult, type CaptureRouteMode } from "./capture-route-runner";
import type { CaptureGateInput } from "../capture-gate";
import type { CaptureServiceDeps } from "./capture-service";

/** capture の source_ref（opaque・raw 本文でない）。 */
const MORNING_CAPTURE_SOURCE = "alter-morning-plan";

/**
 * A1-5-5g-3: redacted observation sink（**route response に混ぜない**観測点）。
 *   fire-and-forget observer の結果を redacted に観測する唯一の口。受け取る `CaptureRouteRunnerResult` は
 *   元々 redacted（mode/observed/summary{wouldCapture,wouldEvidence,outcome,reason}/note のみ・**raw/prompt/response/apiKey なし**）。
 *   既定 = redacted console.log（observe ON 時の production 監視）。test/smoke は `setCaptureObserveSink` で deterministic 捕捉。
 */
export type CaptureObserveSink = (result: CaptureRouteRunnerResult) => void;

/** 既定 sink: redacted log（raw を出さない・既知 safe field のみ projection）。 */
function defaultCaptureObserveSink(result: CaptureRouteRunnerResult): void {
  try {
    // eslint-disable-next-line no-console
    console.log(
      "[reality.capture.observe]",
      JSON.stringify({
        mode: result.mode,
        observed: result.observed,
        outcome: result.summary?.outcome ?? null,
        wouldCapture: result.summary?.wouldCapture ?? null,
        wouldEvidence: result.summary?.wouldEvidence ?? null,
        reason: result.summary?.reason ?? null,
        note: result.note,
      })
    );
  } catch {
    // log 失敗も握りつぶし（observe が route を壊さない）
  }
}

let captureObserveSink: CaptureObserveSink = defaultCaptureObserveSink;

/** observation sink を差し替える（test/smoke が redacted result を捕捉するため）。 */
export function setCaptureObserveSink(sink: CaptureObserveSink): void {
  captureObserveSink = sink;
}

/** sink を既定（redacted log）に戻す。 */
export function resetCaptureObserveSink(): void {
  captureObserveSink = defaultCaptureObserveSink;
}

/** 現在の sink に redacted result を流す（**try/catch・never-throw**・sink error は route に波及させない）。 */
export function emitCaptureObserve(result: CaptureRouteRunnerResult): void {
  try {
    captureObserveSink(result);
  } catch {
    // sink error 握りつぶし（route response 不変）
  }
}

/** flags/env/userId → capture gate input（**pure**・mode 非依存）。`flagEnabled`=有効 flag（observe→OBSERVE / write→LIVE）→ gate.liveEnabled。 */
export function resolveMorningObserveGate(opts: {
  readonly flagEnabled: boolean;
  readonly killed: boolean;
  readonly nodeEnv: string;
  readonly supabaseUrl: string | undefined;
  readonly userId: string;
  readonly canaryUserIds: readonly string[];
}): CaptureGateInput {
  return {
    liveEnabled: opts.flagEnabled,
    killed: opts.killed,
    nodeEnv: opts.nodeEnv,
    supabaseUrl: opts.supabaseUrl,
    requestedUserId: opts.userId,
    canaryUserIds: opts.canaryUserIds,
  };
}

/**
 * capture 実行（**DI core**・テスト可能・observe/write 両対応）。morning route 用の extraction を組み `runCaptureRouteObserver` へ。
 *   gate/deps/mode は注入。seedId/nowIso は test で固定可（既定は server 生成）。
 *   **mode="observe" → dry-run fake write（実 DB 0）/ mode="write" → real RPC write client（caller が注入したときのみ実書き）**。
 */
export async function runMorningCaptureObserve(
  utterance: string,
  gate: CaptureGateInput,
  deps: CaptureServiceDeps,
  opts?: { readonly seedId?: string; readonly nowIso?: string; readonly mode?: CaptureRouteMode }
): Promise<CaptureRouteRunnerResult> {
  const nowIso = opts?.nowIso ?? new Date().toISOString();
  const seedId = opts?.seedId ?? randomUUID();
  return runCaptureRouteObserver(
    { mode: opts?.mode ?? "observe", gate, extraction: { utterance, nowIso, sourceRef: MORNING_CAPTURE_SOURCE }, seedId, capturedAt: nowIso },
    deps
  );
}

/** capture mode 決定（**pure**）。優先順位: kill 最優先 → write(LIVE) → observe(OBSERVE) → none。 */
export function decideCaptureMode(flags: {
  readonly killed: boolean;
  readonly live: boolean;
  readonly observe: boolean;
}): CaptureRouteMode | null {
  if (flags.killed) return null; // kill 最優先（observe/write とも停止）
  if (flags.live) return "write"; // REALITY_CAPTURE_LIVE → 実 write
  if (flags.observe) return "observe"; // REALITY_CAPTURE_OBSERVE → dry-run 観測
  return null; // どちらの flag も off → no-op
}

/**
 * A1-5-5g-2/4: route entry（**fire-and-forget・void 同期返却・never-throw**・observe/write 両対応）。
 *   route は `fireMorningCapture(body.utterance, user.id, supabase)` を呼ぶだけ（await しない）。
 *   mode 決定（decideCaptureMode・kill 最優先 → LIVE=write → OBSERVE=observe → none）:
 *     - null（kill / 両 flag off）→ **即 return（extractor 構築なし・write 0）**。default は両 flag off ゆえ production 挙動変更ゼロ。
 *     - "write"（REALITY_CAPTURE_LIVE）→ **real RPC write client**（`rpcClient`=route の認証済 Supabase client・user-RLS・SECURITY INVOKER・service_role 不要）。
 *     - "observe"（REALITY_CAPTURE_OBSERVE）→ **dry-run fake write client（実 DB 0）**。
 *   gate（production/staging/canary・kill）は runCaptureService が最初に通す（block→extractor 0/write 0）。
 *   例外は同期/非同期とも握りつぶす（route response 不変）。
 *
 * @param rpcClient route の認証済 Supabase client（write mode の RPC 先・observe mode では未使用）。
 */
export function fireMorningCapture(utterance: string, userId: string, rpcClient: RpcCapableClient): void {
  try {
    const mode = decideCaptureMode({
      killed: PLAN_FLAGS.realityCaptureKill,
      live: PLAN_FLAGS.realityCaptureLive,
      observe: PLAN_FLAGS.realityCaptureObserve,
    });
    if (mode === null) return; // kill / 両 flag off → no-op（extractor 構築なし）

    // mode 別 flag（gate.liveEnabled 用）と write client。write のみ real RPC（実 DB write・user-RLS）。
    const flagEnabled = mode === "write" ? PLAN_FLAGS.realityCaptureLive : PLAN_FLAGS.realityCaptureObserve;
    const writeClient: CaptureWriteClient =
      mode === "write"
        ? createRpcCaptureWriteClient(rpcClient) // 実 RPC（atomic・service_role 0）
        : createFakeCaptureWriteClient(); // dry-run・実 DB 0

    const gate = resolveMorningObserveGate({
      flagEnabled,
      killed: PLAN_FLAGS.realityCaptureKill,
      nodeEnv: process.env.NODE_ENV ?? "",
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      userId,
      canaryUserIds: PLAN_FLAGS.canaryUserIds,
    });
    const deps: CaptureServiceDeps = { extractor: createServerLlmSeedExtractor(), writeClient };

    void runMorningCaptureObserve(utterance, gate, deps, { mode })
      .then((result) => {
        // redacted observation のみ（WouldCaptureSummary・raw/seedId なし）。route response には混ぜない。
        emitCaptureObserve(result);
      })
      .catch(() => {
        // async error 握りつぶし（route response 不変）
      });
  } catch {
    // sync 構築 error も握りつぶし（route response 不変）
  }
}
