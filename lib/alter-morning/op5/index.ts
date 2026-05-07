/**
 * OP-5 public API — OP-5.1 + OP-5.2 (CEO 2026-05-06)
 *
 * OP-5 shadow path の internal infra を public に export する barrel。
 *
 * 規律 (OP-5.1 / OP-5.2):
 *   - 本 module を **runtime path から import しない** (= morningPipeline /
 *     route.ts / legacyAdapter は不変)。
 *   - 接続 (= morningPipeline 1 箇所での起動) は OP-5.3 で扱う。
 *   - OP-5.1 / OP-5.2 では internal infra のみ提供。
 *   - OP-5.2 で永続化しない (= DB / log / Sentry / table 全て手を出さない)。
 *
 * 公開 API:
 *   - flags (OP-5.1): `Op5Flags`, `Op5ShadowLogLevel`, `readOp5Flags`,
 *                     `shouldRunShadow`
 *   - orchestrator (OP-5.1): `ShadowOrchestratorInput`,
 *                            `ShadowOrchestratorResult`, `runShadowOrchestrator`
 *   - redaction (OP-5.2): `RedactedShadowObservation`,
 *                         `RedactedSummaryObservation`,
 *                         `RedactedVerboseObservation`,
 *                         `PriorityBucket`, `DurationBucket`, `RedactOptions`,
 *                         `redactShadowResult`
 *   - comparator (OP-5.2): `LegacyShadowSnapshot`, `ShadowComparison`,
 *                          `MismatchCategory`, `AnchorComparison`,
 *                          `TargetDateComparison`, `TravelEdgesComparison`,
 *                          `compareShadowVsLegacy`
 */

export type { Op5Flags, Op5ShadowLogLevel } from "./flags";
export { readOp5Flags, shouldRunShadow } from "./flags";

export type {
  ShadowOrchestratorInput,
  ShadowOrchestratorResult,
} from "./shadowOrchestrator";
export { runShadowOrchestrator } from "./shadowOrchestrator";

export type {
  RedactedShadowObservation,
  RedactedSummaryObservation,
  RedactedVerboseObservation,
  PriorityBucket,
  DurationBucket,
  RedactOptions,
} from "./redaction";
export { redactShadowResult } from "./redaction";

export type {
  LegacyShadowSnapshot,
  ShadowComparison,
  MismatchCategory,
  AnchorComparison,
  TargetDateComparison,
  TravelEdgesComparison,
} from "./shadowComparator";
export { compareShadowVsLegacy } from "./shadowComparator";

// OP-5.3.1: extractLegacySnapshot pure helper
export { extractLegacySnapshot } from "./extractLegacySnapshot";

// OP-5.3.2: shadow entrypoint (= runtime 接続点候補、 OP-5.3.3 で初接続予定)
export type { ShadowEntrypointInput } from "./shadowEntrypoint";
export { runShadowAndCompare } from "./shadowEntrypoint";

// OP-5.4.1: error telemetry (= category enum、 raw を渡さない型設計、 Sentry captureMessage)
export type {
  ShadowErrorCategory,
  ShadowErrorTelemetryInput,
} from "./errorTelemetry";
export { emitShadowError } from "./errorTelemetry";
