import "server-only";
/**
 * Reality Control OS — A1-5-5c Capture Service Skeleton（server-only・DI・no-run・barrel 非 export）
 *
 * 設計: docs/aneurasync-reality-control-os-connection-design.md §8.25/§8.28
 *
 * 役割: capture の **配線層**。`evaluateCaptureGate`（§8.26）→ `SeedExtractor`（§8.27・DI）→
 *   `validateExtractorOutput`（§8.27）→ `runStructuredCapturePipeline`（§8.23・DI client）を 1 本に束ねる。
 *   **実 LLM / 実 DB / 実 RPC / route / UI 接続なし**（fake extractor + no-run/fake write client）。
 *   5d は SeedExtractor を実 LLM adapter に、writeClient を実 RPC client に **差すだけ**で runtime 化（本ロジック不変）。
 *
 * 安全の要（厳守）:
 *   - **gate を最初に通す**: blocked なら **extractor を呼ばない**（LLM コスト 0・raw 処理 0・write 0）。
 *   - **raw は extractor 入力（utterance）のみ**。service result / write payload / logs に raw・raw field 名を出さない（reason code のみ）。
 *   - **二段検証**: validateExtractorOutput（producer pre-check）+ orchestrator の intake（firewall・常時）。
 *   - seedId/capturedAt は caller 注入・userId は gate.requestedUserId（単一ソース）。
 *   - server-only / barrel 非 export / route·UI·PlanClient から呼ばない（A1-5-5g まで）。
 */

import { evaluateCaptureGate, type CaptureGateInput, type CaptureGateBlockReason } from "../capture-gate";
import {
  validateExtractorOutput,
  type SeedExtractor,
  type CaptureExtractionInput,
} from "../seed-extractor-contract";
import { runStructuredCapturePipeline } from "./structured-capture-orchestrator";
import type { CaptureWriteClient, CaptureWriteCode } from "./capture-write-repository";
import type { IntakeRejectReason } from "../seed-capture-intake";

/** service 入力。`extraction.utterance` が唯一の raw。seedId/capturedAt は server/caller 注入。 */
export interface CaptureServiceInput {
  /** gate 文脈（requestedUserId = orchestrator の userId・単一ソース）。 */
  readonly gate: CaptureGateInput;
  /** extractor 入力（utterance=raw・nowIso・sourceRef opaque）。 */
  readonly extraction: CaptureExtractionInput;
  /** server 生成 fresh UUID。 */
  readonly seedId: string;
  /** server 時刻（ISO）。 */
  readonly capturedAt: string;
}

/** DI 依存（fake/no-run のみ・実 LLM/実 client は A1-5-5d）。 */
export interface CaptureServiceDeps {
  readonly extractor: SeedExtractor;
  readonly writeClient: CaptureWriteClient;
}

/**
 * service 結果（**redacted discriminated union**・raw を含まない）。
 *   - gate_blocked: gate で停止（**extractor 未呼出・write 0**）。
 *   - no_intent: 捕捉意図なし（write 0）。
 *   - invalid_extraction: extractor 出力が validation reject（write 0・reason code のみ・field 名は出さない）。
 *   - captured: write 成功（wroteEvidence で duration 有無）。
 *   - intake_rejected: orchestrator firewall が reject（pre-validated ゆえ通常起きない＝drift signal）。
 *   - write_failed: write client/RPC 失敗（no_run / write_failed / owner_mismatch / seed_link_mismatch）。
 */
export type CaptureServiceResult =
  | { readonly outcome: "gate_blocked"; readonly reason: CaptureGateBlockReason }
  | { readonly outcome: "no_intent" }
  | { readonly outcome: "invalid_extraction"; readonly reason: IntakeRejectReason }
  | { readonly outcome: "captured"; readonly wroteEvidence: boolean }
  | { readonly outcome: "intake_rejected"; readonly reason: IntakeRejectReason }
  | { readonly outcome: "write_failed"; readonly code: CaptureWriteCode };

/**
 * A1-5-5c: capture service（**gate → extractor → validate → orchestrator**・no-run）。
 *   各分岐は redacted result を返す。raw は extractor 入力のみに閉じ込め、result に出さない。
 */
export async function runCaptureService(
  input: CaptureServiceInput,
  deps: CaptureServiceDeps
): Promise<CaptureServiceResult> {
  // 1. gate を最初に（blocked → extractor 未呼出・write 0）
  const gate = evaluateCaptureGate(input.gate);
  if (!gate.allow) return { outcome: "gate_blocked", reason: gate.reason };

  // 2. extractor（gate allow 後のみ呼ぶ）
  const extracted = await deps.extractor.extract(input.extraction);
  if (extracted.kind === "no_intent") return { outcome: "no_intent" }; // write 0

  // 3. producer pre-check（invalid → write 0・redacted: reason code のみ・field 名は出さない）
  const validation = validateExtractorOutput(extracted.raw);
  if (!validation.ok) return { outcome: "invalid_extraction", reason: validation.reason };

  // 4. orchestrator（intake firewall + mapper + write seam・DI client・no-run/fake）。
  //    extracted.raw を渡し orchestrator の intake が再検証（pre-validated ゆえ通常 ok）。
  const pipeline = await runStructuredCapturePipeline(
    {
      seedId: input.seedId,
      userId: input.gate.requestedUserId,
      capturedAt: input.capturedAt,
      extracted: extracted.raw,
    },
    deps.writeClient
  );

  // 5. redacted result へ写像
  if (pipeline.ok) return { outcome: "captured", wroteEvidence: pipeline.wroteEvidence };
  if (pipeline.stage === "intake") return { outcome: "intake_rejected", reason: pipeline.reason };
  return { outcome: "write_failed", code: pipeline.code };
}
