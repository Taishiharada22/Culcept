import "server-only";
/**
 * Reality Control OS — A1-5-5g-2 Alter-Morning Route Capture Observe Wiring（server-only・observe-only・barrel 非 export）
 *
 * 設計: docs/aneurasync-reality-control-os-connection-design.md §8.35/§8.36
 *
 * 役割: `app/api/alter-morning/plan/route.ts` が **fire-and-forget** で呼ぶ capture observe 配線。
 *   route の utterance から observe-mode で would-capture を観測する。**route response を変えない・実 DB に書かない**。
 *   route は薄く保つ原則ゆえ、gate 解決 / deps 構築 / fire-and-forget をここに集約する（route は 1 行）。
 *
 * 厳守（observe-only・write OFF）:
 *   - **observe mode のみ**（`runCaptureRouteObserver` の observe）。write client は **dry-run fake（実 DB 0）**。実 write は別 GO（A1-5-5g-3+）。
 *   - **fire-and-forget・never-throw**: `fireMorningCaptureObserve` は **void を同期返却**し、内部の async observe を待たない・例外を握りつぶす。
 *     → route の user response（{ok,data}/{ok,error}）に一切影響しない。
 *   - **cheap guard**: observe flag off / kill on なら **即 return**（real extractor を構築しない）。本番デフォルト（flag off）は boolean 1 個で抜ける。
 *   - **gate が production hard block**: NEXT_PUBLIC_SUPABASE_URL が production(aljav) / 非 staging / 非 canary / nodeEnv=production なら gate block → observer 0。
 *   - **raw は extraction.utterance のみ**。result は redacted（WouldCaptureSummary・reason code のみ）。raw/prompt/response/apiKey を出さない。
 *   - server-only / barrel 非 export。
 */

import { randomUUID } from "node:crypto";
import { PLAN_FLAGS } from "../../featureFlags";
import { createServerLlmSeedExtractor } from "../llm-seed-extractor-adapter.server";
import { createFakeCaptureWriteClient } from "./capture-write-repository";
import { runCaptureRouteObserver, type CaptureRouteRunnerResult } from "./capture-route-runner";
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

/** flags/env/userId → observe-mode gate input（**pure**）。liveEnabled=observe flag（write の live とは別）。 */
export function resolveMorningObserveGate(opts: {
  readonly observeEnabled: boolean;
  readonly killed: boolean;
  readonly nodeEnv: string;
  readonly supabaseUrl: string | undefined;
  readonly userId: string;
  readonly canaryUserIds: readonly string[];
}): CaptureGateInput {
  return {
    liveEnabled: opts.observeEnabled,
    killed: opts.killed,
    nodeEnv: opts.nodeEnv,
    supabaseUrl: opts.supabaseUrl,
    requestedUserId: opts.userId,
    canaryUserIds: opts.canaryUserIds,
  };
}

/**
 * observe-mode 実行（**DI core**・テスト可能）。morning route 用の extraction を組み `runCaptureRouteObserver`（observe）へ。
 *   gate/deps は注入。seedId/nowIso は test で固定可（既定は server 生成）。**実 write は到達しない**（observe + dry-run fake client）。
 */
export async function runMorningCaptureObserve(
  utterance: string,
  gate: CaptureGateInput,
  deps: CaptureServiceDeps,
  opts?: { readonly seedId?: string; readonly nowIso?: string }
): Promise<CaptureRouteRunnerResult> {
  const nowIso = opts?.nowIso ?? new Date().toISOString();
  const seedId = opts?.seedId ?? randomUUID();
  return runCaptureRouteObserver(
    { mode: "observe", gate, extraction: { utterance, nowIso, sourceRef: MORNING_CAPTURE_SOURCE }, seedId, capturedAt: nowIso },
    deps
  );
}

/**
 * A1-5-5g-2: route entry（**fire-and-forget・void 同期返却・never-throw**）。
 *   route は `fireMorningCaptureObserve(body.utterance, user.id)` を呼ぶだけ（await しない）。
 *   flag off / kill → 即 return（observer 0）。それ以外は gate（production/staging/canary）+ observe を fire-and-forget。
 *   deps = real extractor + **dry-run fake write client（実 DB 0）**。例外は同期/非同期とも握りつぶす（response 不変）。
 */
export function fireMorningCaptureObserve(utterance: string, userId: string): void {
  try {
    // cheap guard: observe off / kill on は real extractor を構築せず即 return
    if (!PLAN_FLAGS.realityCaptureObserve || PLAN_FLAGS.realityCaptureKill) return;
    const gate = resolveMorningObserveGate({
      observeEnabled: PLAN_FLAGS.realityCaptureObserve,
      killed: PLAN_FLAGS.realityCaptureKill,
      nodeEnv: process.env.NODE_ENV ?? "",
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      userId,
      canaryUserIds: PLAN_FLAGS.canaryUserIds,
    });
    const deps: CaptureServiceDeps = {
      extractor: createServerLlmSeedExtractor(),
      writeClient: createFakeCaptureWriteClient(), // dry-run・実 DB 0（observe-only）
    };
    void runMorningCaptureObserve(utterance, gate, deps)
      .then((result) => {
        // redacted observation のみ（WouldCaptureSummary・raw なし）。route response には混ぜない。
        emitCaptureObserve(result);
      })
      .catch(() => {
        // async error 握りつぶし（route response 不変）
      });
  } catch {
    // sync 構築 error も握りつぶし（route response 不変）
  }
}
