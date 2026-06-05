import "server-only";
/**
 * Reality Control OS — A1-5-4d-0/1 Structured Capture Orchestrator Skeleton
 *   （DI・no-run・raw 端から端まで遮断・barrel 非 export・server-only）
 *
 * 設計: docs/aneurasync-reality-control-os-connection-design.md §8.23
 *
 * 役割: A1-5-4 で確定した 3 部品を **1 本の no-run pipeline** に束ねる配線層。
 *   intake guard（A1-5-4c・fail-closed）→ capture mapper（A1-5-4a・pure）→ write seam（A1-5-4b-1・DI atomic）。
 *   将来 A1-5-5 は **本 orchestrator のロジックを変えず** に、実抽出器の structured 出力と
 *   実 client（`createRpcCaptureWriteClient(実 Supabase)`）を注入するだけで runtime 化できる。
 *
 * capture orchestration boundary（A1-5-4d-0）:
 *   [raw 発話] --(extractor: LLM/parse・**別段階・未接続**)--> [ExtractorStructuredOutput（structured・**untrusted**）]
 *     --(本 orchestrator)-->
 *        1. buildStructuredCaptureInput（**intake guard・fail-closed**: raw field を reject・allowlist 再構築）
 *        2. captureToDrafts（**pure**: structured-only draft 化・default duration なし）
 *        3. writeStructuredCapture（**DI write seam**: owner/linkage 検証 → client.writeCapture を atomic 1 回）
 *     --> [StructuredCapturePipelineResult（stage 付き・raw なし）]
 *
 * 厳守:
 *   - **入力は untrusted structured output**（raw 発話でない）。seedId/userId/capturedAt は **caller/server 注入**。
 *   - **fail-closed**: intake が reject したら write を **呼ばない**（raw/不正 → write 0）。strip しない。
 *   - **client は DI**（本 skeleton では fake/no-run のみ）。orchestrator 内で **実 client を構築しない**
 *     （createClient なし・実 RPC/実 DB write なし）。real client 注入は A1-5-5（別 GO）。
 *   - **raw を結果にも payload にも持ち込まない**（intake が allowlist 再構築済・本層は構造のみ束ねる）。
 *   - **LLM/prompt/抽出ロジックなし**（structured 出力は前段で確定済）。
 *   - `server-only`（write seam を合成するため・client bundle 取り込み禁止）/ barrel 非 export / runtime・route・UI 非接続。
 */

import { buildStructuredCaptureInput, type IntakeRejectReason } from "../seed-capture-intake";
import { captureToDrafts } from "../seed-capture-mapper";
import {
  writeStructuredCapture,
  type CaptureWriteClient,
  type CaptureWriteCode,
} from "./capture-write-repository";

/**
 * orchestrator 入力。`extracted` は **untrusted structured output**（extractor の生出力・raw 発話でない）。
 * seedId/userId/capturedAt は **caller/server が注入**（extracted 由来でない・id/時刻の偽装を遮断）。
 */
export interface StructuredCapturePipelineInput {
  readonly seedId: string;
  readonly userId: string;
  readonly capturedAt: string;
  /** extractor の structured 出力（untrusted・intake guard で検証）。raw 発話そのものではない。 */
  readonly extracted: unknown;
}

/**
 * pipeline の結果（**stage 判別共用体**・raw を含まない）。
 *   - ok:true（stage="write"）  → seed (+ 任意 evidence) を write 成功。`wroteEvidence` で duration 有無を伝える。
 *   - ok:false / stage="write"  → write seam/client が拒否（no_run / write_failed / owner_mismatch / seed_link_mismatch）。
 *   - ok:false / stage="intake" → intake guard が reject（raw 混入 / 不正 structured）。**write は呼ばれていない**。
 * `wroteEvidence` は payload に evidence draft を含めたか（duration を捕捉できたか）。raw でない安全なメタ情報。
 */
export type StructuredCapturePipelineResult =
  | { readonly ok: true; readonly stage: "write"; readonly code: "ok"; readonly wroteEvidence: boolean }
  | { readonly ok: false; readonly stage: "write"; readonly code: CaptureWriteCode; readonly wroteEvidence: boolean }
  | { readonly ok: false; readonly stage: "intake"; readonly reason: IntakeRejectReason; readonly field?: string };

/**
 * A1-5-4d-1: untrusted structured output → intake guard → draft → write seam を 1 本に束ねる pipeline。
 *   - client は **DI**（fake/no-run のみ・本 skeleton では実 DB に触れない）。
 *   - intake reject 時は **write を呼ばない**（fail-closed・raw/不正 → write 0）。
 *   - owner/linkage は mapper が単一 input から両 draft を導出するため常に整合（mismatch は構造的に発生不能）。
 *     write seam の owner/linkage guard は defense-in-depth（A1-5-4b で実証済）。
 */
export async function runStructuredCapturePipeline(
  input: StructuredCapturePipelineInput,
  client: CaptureWriteClient
): Promise<StructuredCapturePipelineResult> {
  // 1. intake guard（fail-closed・raw 遮断・allowlist 再構築）。seedId/userId/capturedAt は caller 注入。
  const intake = buildStructuredCaptureInput(input.seedId, input.userId, input.capturedAt, input.extracted);
  if (!intake.ok) {
    // reject → write を呼ばない（write 0）。field は存在する時のみ載せる（exactOptional 安全）。
    return intake.field !== undefined
      ? { ok: false, stage: "intake", reason: intake.reason, field: intake.field }
      : { ok: false, stage: "intake", reason: intake.reason };
  }

  // 2. structured-only draft 化（pure・raw なし・default duration なし）。
  const drafts = captureToDrafts(intake.input);
  const wroteEvidence = drafts.evidenceDraft !== null;

  // 3. write seam（DI client・atomic・no-run/fake では実 DB write 0）。
  const outcome = await writeStructuredCapture(drafts, client);
  if (outcome.ok) {
    return { ok: true, stage: "write", code: "ok", wroteEvidence };
  }
  return { ok: false, stage: "write", code: outcome.code, wroteEvidence };
}
