/**
 * OP-5 public API — OP-5.1 (CEO 2026-05-06)
 *
 * OP-5 shadow path の internal infra を public に export する barrel。
 *
 * 規律 (OP-5.1):
 *   - 本 module を **runtime path から import しない** (= morningPipeline /
 *     route.ts / legacyAdapter は不変)。
 *   - 接続 (= morningPipeline 1 箇所での起動) は OP-5.3 で扱う。
 *   - OP-5.1 では internal infra のみ提供。
 *
 * 公開 API:
 *   - flags: `Op5Flags`, `Op5ShadowLogLevel`, `readOp5Flags`, `shouldRunShadow`
 *   - orchestrator: `ShadowOrchestratorInput`, `ShadowOrchestratorResult`,
 *                   `runShadowOrchestrator`
 */

export type { Op5Flags, Op5ShadowLogLevel } from "./flags";
export { readOp5Flags, shouldRunShadow } from "./flags";

export type {
  ShadowOrchestratorInput,
  ShadowOrchestratorResult,
} from "./shadowOrchestrator";
export { runShadowOrchestrator } from "./shadowOrchestrator";
