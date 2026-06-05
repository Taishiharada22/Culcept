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
 *   - **write**: **A1-5-5g-0/1 では未接続・fail-closed**（extract も write もしない）。実 write は別 GO（A1-5-5g-2+）。
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

/** capture route の mode。observe=観測（write OFF）/ write=実 write（**5g-0/1 では未接続**）。 */
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
  /** observe を実行したか（observe mode で成功時 true / write mode・error 時 false）。 */
  readonly observed: boolean;
  /** observe の would-capture summary（redacted）。未実行（write mode / error）は null。 */
  readonly summary: WouldCaptureSummary | null;
  /** redacted note（"write_mode_not_connected" / "observer_error" / null）。 */
  readonly note: string | null;
}

/**
 * A1-5-5g-0/1: capture route observer（**server-only・throw しない・DI**）。
 *   - write mode → **fail-closed**（未接続・extract/write しない）。
 *   - observe mode → `runCaptureService`（DI: extractor + dry-run fake write client）→ `summarizeWouldCapture`。
 *   - 全 error を catch（route response 不変）。result は redacted（raw なし）。
 *
 * deps（DI）: observe は **dry-run fake write client（実 DB 0）** を注入すること。実 write は本 runner では到達しない。
 */
export async function runCaptureRouteObserver(
  input: CaptureRouteRunnerInput,
  deps: CaptureServiceDeps
): Promise<CaptureRouteRunnerResult> {
  // write mode は A1-5-5g-0/1 では未接続・fail-closed（extract も write もしない）
  if (input.mode === "write") {
    return { mode: "write", observed: false, summary: null, note: "write_mode_not_connected" };
  }
  // observe mode: gate → extractor → capture service（dry-run write）→ would-capture
  try {
    const serviceInput: CaptureServiceInput = {
      gate: input.gate,
      extraction: input.extraction,
      seedId: input.seedId,
      capturedAt: input.capturedAt,
    };
    const result = await runCaptureService(serviceInput, deps);
    return { mode: "observe", observed: true, summary: summarizeWouldCapture(result), note: null };
  } catch {
    // route response 不変のため throw しない（raw を含めない redacted error）
    return { mode: "observe", observed: false, summary: null, note: "observer_error" };
  }
}
