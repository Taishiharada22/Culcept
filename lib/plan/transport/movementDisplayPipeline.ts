/**
 * Phase 3-L-4c (pure) — Movement Display Pipeline Helper
 *
 * 役割:
 *   既存 4 layer (= buildDayGraph + overlay + formatter + contract) を pure に合成する
 *   pipeline helper。 caller (= 将来 UI 接続層) が「anchors + coords + providers」 を渡すだけで
 *   一発で `MovementDisplayResult` を得られる。
 *
 * 思想:
 *   - L-4c-pure は **合成のみ**。 既存 layer の純度を破壊しない。
 *   - coords acquire (= geocode 呼出 / MapTab state 取得) は L-4c の **責任外**。
 *     caller が事前に持っている `coordsByAnchorId` map を引数で受け取る。
 *   - UI 接続 (= L-4d) は本 helper を呼ぶだけで成立する設計 (= 別 phase 着手)。
 *
 * 危険境界 (= L-4c では絶対に触れない):
 *   - geocode endpoint の能動呼出
 *   - MapTab / CalendarTab / FlowTab の改変
 *   - ExternalAnchor schema 変更
 *   - DB / env / package / dependency 追加
 *   - runtime telemetry sink 実装
 *   - localStorage / Arrival Risk Memory
 *   - warning / recommendation / optimization 文言
 *
 * L-4c-pure scope (= 2026-05-22 CEO + GPT 連続 GO 範囲):
 *   - LLM 不使用 / API 不使用 / geocode 不使用 / localStorage 不使用 / fetch 不使用
 *   - DB / env / package / dependency 変更 0
 *   - UI 変更 0
 *   - K phase / L-1/L-2/L-3/L-4a/L-4b 既存 file 変更 0
 *
 * 参照:
 *   - docs/alter-plan-phase3-l-4c-bridge-readiness-audit.md (= 連続 GO 判定)
 *   - lib/plan/dayGraph/buildDayGraph.ts (= K phase 同期 pure)
 *   - lib/plan/transport/movementSegmentOverlay.ts (= L-3c)
 *   - lib/plan/transport/movementDisplayFormatter.ts (= L-4a)
 *   - lib/plan/transport/movementDisplayContract.ts (= L-4b)
 */

import { buildDayGraph } from "@/lib/plan/dayGraph/buildDayGraph";
import type {
  BuildDayGraphOptions,
  DayGraphWarning,
} from "@/lib/plan/dayGraph/dayGraphTypes";
import type { ExternalAnchor } from "@/lib/plan/external-anchor";

import type { ManualOverride } from "./cascadeOrchestrator";
import { assertMovementDisplayResultCompliance } from "./movementDisplayContract";
import {
  formatOverlayResultForDisplay,
  type MovementDisplayResult,
} from "./movementDisplayFormatter";
import { resolveMovementSegmentOverlay } from "./movementSegmentOverlay";
import type {
  MovementPrivacyClass,
  TransportResolutionProvider,
} from "./transportTypes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Input / Output types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Pipeline 入力 (= 4 layer 合成のため caller が用意するもの全て)。
 */
export interface MovementDisplayPipelineInput {
  /** buildDayGraph に渡す anchors (= caller 責任で 1 日分 expand 済) */
  readonly anchors: ReadonlyArray<ExternalAnchor>;
  /** "YYYY-MM-DD" */
  readonly date: string;
  /** buildDayGraph options (= 任意、 default は K phase 規定) */
  readonly buildOptions?: BuildDayGraphOptions;

  /**
   * anchorId → coords の map (= caller 責任、 事前 resolve 済)。
   *
   * **L-4c は geocode endpoint を絶対に呼ばない**。
   * 空 Map なら全 transition が unresolved (= 構造的安全な default)。
   */
  readonly coordsByAnchorId: ReadonlyMap<
    string,
    { readonly lat: number; readonly lng: number }
  >;

  /** Cascade providers (= 配列順 = 試行順序) */
  readonly providers: ReadonlyArray<TransportResolutionProvider>;

  /** Manual override (= optional、 transitionIndex 別) */
  readonly overridesByTransitionIndex?: ReadonlyMap<number, ManualOverride>;

  /** Privacy class override (= optional) */
  readonly privacyClassByTransitionIndex?: ReadonlyMap<number, MovementPrivacyClass>;

  /** Opaque tracing id (= L-4 では unused / passthrough のみ) */
  readonly tracingId?: string;
}

/**
 * Pipeline 出力。
 */
export interface MovementDisplayPipelineResult {
  /** Display 出力 (= L-4a 通過済、 L-4b assertion 済) */
  readonly display: MovementDisplayResult;
  /**
   * Build warnings (= K phase が出した non-fatal、 dev console 向け)。
   *
   * 注: UI 露出禁止 (= K phase Invariant 17)。 caller は dev log / Sentry には流して良いが、
   *      end-user 表示には使わない。
   */
  readonly buildWarnings: ReadonlyArray<DayGraphWarning>;
  /** Overlay 統計 (= caller の UI summary 用素材) */
  readonly overlayCounts: {
    readonly resolvedCount: number;
    readonly unresolvedCount: number;
    readonly internalErrorCount: number;
  };
  /** Opaque tracing id passthrough */
  readonly tracingId?: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main: runMovementDisplayPipeline
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 4 layer pipeline の async pure 合成。
 *
 * Step:
 *   (1) `buildDayGraph` (= K phase 同期 pure)
 *   (2) `resolveMovementSegmentOverlay` (= L-3c 非同期 pure)
 *   (3) `formatOverlayResultForDisplay` (= L-4a 同期 pure)
 *   (4) `assertMovementDisplayResultCompliance` (= L-4b 出荷品質保証)
 *
 * 純度保証:
 *   - input mutation 0
 *   - 副作用 0 (= no DB, no fetch, no localStorage, no console)
 *   - 既存 4 layer 自身を変更しない (= 引数を pipe するだけ)
 *
 * 危険境界遵守:
 *   - geocode endpoint を呼ばない (= caller が事前 resolve 済の coords を渡す前提)
 *   - UI に touch しない
 *   - telemetry runtime sink を作らない (= tracingId は passthrough のみ)
 */
export async function runMovementDisplayPipeline(
  input: MovementDisplayPipelineInput,
): Promise<MovementDisplayPipelineResult> {
  // (1) K phase 同期 build
  const { graph, warnings } = buildDayGraph({
    anchors: input.anchors,
    date: input.date,
    options: input.buildOptions,
  });

  // (2) L-3c overlay (= 非同期 pure、 graph mutation 0、 PII sanitize 済)
  const overlay = await resolveMovementSegmentOverlay({
    graph,
    coordsByAnchorId: input.coordsByAnchorId,
    cascadeOptions: { providers: input.providers },
    ...(input.overridesByTransitionIndex
      ? { overridesByTransitionIndex: input.overridesByTransitionIndex }
      : {}),
    ...(input.privacyClassByTransitionIndex
      ? { privacyClassByTransitionIndex: input.privacyClassByTransitionIndex }
      : {}),
    ...(input.tracingId !== undefined ? { tracingId: input.tracingId } : {}),
  });

  // (3) L-4a format (= 同期 pure)
  const display = formatOverlayResultForDisplay(overlay);

  // (4) L-4b assertion (= 出荷直前 privacy structural 機械保証)
  assertMovementDisplayResultCompliance(display);

  return {
    display,
    buildWarnings: warnings,
    overlayCounts: {
      resolvedCount: overlay.resolvedCount,
      unresolvedCount: overlay.unresolvedCount,
      internalErrorCount: overlay.internalErrorCount,
    },
    ...(input.tracingId !== undefined ? { tracingId: input.tracingId } : {}),
  };
}
