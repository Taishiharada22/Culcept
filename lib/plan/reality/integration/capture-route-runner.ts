import "server-only";
/**
 * Reality Control OS — A1-5-5g-0/1 Capture Route Runner Skeleton（server-only・DI・no-runtime・barrel 非 export）
 *
 * 設計: docs/aneurasync-reality-control-os-connection-design.md §8.35
 *
 * 役割: route（A1-5-5g-2 で alter-morning/plan 等）が **fire-and-forget** で呼ぶ capture observer の **配線前 skeleton**。
 *   route の utterance から observe-mode で would-capture を観測する（**route response を変えない・実 DB 書かない**）。
 *   **本 slice では route.ts に接続しない**（runner を作るだけ）。
 *
 * mode 分離（厳守・runner で固定）:
 *   - **observe**: gate → extractor → capture service（**dry-run fake write client・実 DB 0**）→ `summarizeWouldCapture`。
 *     gate liveEnabled は caller が `REALITY_CAPTURE_OBSERVE` で解決。write OFF（実 DB に書かない）。
 *   - **write（A1-5-5g-4 接続）**: gate → extractor → capture service（**real RPC write client・実 DB write**）→ did-capture。
 *     gate liveEnabled は caller が `REALITY_CAPTURE_LIVE` で解決。**実 write は caller(helper) が LIVE+staging+canary で real client を注入したときのみ**到達。
 *   両モードとも `runCaptureService` が **gate を最初に通す**（production/staging/canary block・kill 最優先）。observe/write の差は **注入される writeClient**（fake vs real RPC）のみ。
 *
 * 安全（厳守）:
 *   - **throw しない**: route response 不変のため、全 error を catch して redacted result（raw なし）を返す。
 *     observe 失敗が route の user response に影響しない（fire-and-forget）。
 *   - **raw は extraction.utterance（入力）のみ**。result（WouldCaptureSummary）は reason code のみ・raw/prompt/response/apiKey を出さない。
 *   - **production hard block 維持**: gate（evaluateCaptureGate）が production nodeEnv / production project ref / 非 staging / 非 canary で block。kill 最優先。
 *   - observe の write client は **caller が dry-run fake（実 DB 非接続・createFakeCaptureWriteClient）を注入**（write OFF を担保）。
 *   - server-only / barrel 非 export / route·UI·PlanClient·runtime から呼ばない（A1-5-5g-2 まで）。
 */

import { runCaptureService, type CaptureServiceInput, type CaptureServiceDeps } from "./capture-service";
import { summarizeWouldCapture, type WouldCaptureSummary } from "./capture-observe";
import type { CaptureGateInput } from "../capture-gate";
import type { CaptureExtractionInput } from "../seed-extractor-contract";

/** capture route の mode。observe=観測（fake write・実 DB 0）/ write=実 write（real RPC・A1-5-5g-4 接続）。 */
export type CaptureRouteMode = "observe" | "write";

/** runner 入力。`extraction.utterance` が唯一の raw。gate.liveEnabled は caller が mode の flag で解決。 */
export interface CaptureRouteRunnerInput {
  readonly mode: CaptureRouteMode;
  /** gate 文脈（observe→liveEnabled=REALITY_CAPTURE_OBSERVE / write→REALITY_CAPTURE_LIVE・caller 解決）。 */
  readonly gate: CaptureGateInput;
  /** extractor 入力（utterance=raw・nowIso・sourceRef opaque）。 */
  readonly extraction: CaptureExtractionInput;
  readonly seedId: string;
  readonly capturedAt: string;
}

/** runner 結果（**redacted**・raw なし）。route は log/observability にのみ使い response に出さない。 */
export interface CaptureRouteRunnerResult {
  readonly mode: CaptureRouteMode;
  /** capture service を実行したか（成功時 true / error 時 false）。 */
  readonly observed: boolean;
  /** would/did-capture summary（redacted）。error 時は null。 */
  readonly summary: WouldCaptureSummary | null;
  /** redacted note（"observer_error" / null）。 */
  readonly note: string | null;
}

/**
 * A1-5-5g-0/1/4: capture route observer（**server-only・throw しない・DI**）。
 *   - observe / write の両モードとも `runCaptureService`（gate → extractor → validate → orchestrator(writeClient)）を実行。
 *   - observe → dry-run fake write client（実 DB 0）/ write → real RPC write client（実 DB write）。**差は注入 writeClient のみ**。
 *   - `runCaptureService` が gate を最初に通す（production/staging/canary block・kill 最優先）。write の実書きは caller が LIVE+staging+canary で real client を注入したときのみ到達。
 *   - 全 error を catch（route response 不変）。result は redacted（raw なし）。**seedId/raw は result に出さない**。
 *
 * deps（DI）: observe は dry-run fake write client、write は real RPC write client を caller が注入する。
 */
export async function runCaptureRouteObserver(
  input: CaptureRouteRunnerInput,
  deps: CaptureServiceDeps
): Promise<CaptureRouteRunnerResult> {
  // observe / write 共通: gate → extractor → capture service（writeClient が観測/実書きを決める）→ would/did-capture
  try {
    const serviceInput: CaptureServiceInput = {
      gate: input.gate,
      extraction: input.extraction,
      seedId: input.seedId,
      capturedAt: input.capturedAt,
    };
    const result = await runCaptureService(serviceInput, deps);
    return { mode: input.mode, observed: true, summary: summarizeWouldCapture(result), note: null };
  } catch {
    // route response 不変のため throw しない（raw を含めない redacted error）
    return { mode: input.mode, observed: false, summary: null, note: "observer_error" };
  }
}
