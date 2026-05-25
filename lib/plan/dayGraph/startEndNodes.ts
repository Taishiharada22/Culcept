/**
 * StartNode / EndNode generators — Phase 3-K (= K-1b)。
 *
 * 設計書: docs/alter-plan-phase3-k-daygraph-design.md §5 / §22.7
 *
 * 役割:
 *   観測境界 (= observation boundary、 起床/就寝の断定ではない) を表す
 *   implicit node を pure 関数で生成。
 *
 * 不変原則:
 *   - default boundary は "06:00" / "23:00" (= options で override 可)
 *   - durationMin = 0 (= 「点」 として配置、 §22.7)
 *   - origin: "implicit" 固定
 *   - LLM 不使用
 */

import {
  DEFAULT_BOUNDARY_END_TIME,
  DEFAULT_BOUNDARY_START_TIME,
  type BoundaryRationale,
  type EndNode,
  type StartNode,
} from "./dayGraphTypes";
import { bucketFromHHMM, parseHHMMtoMinutes } from "./timeFormat";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Input types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface BoundaryNodeInput {
  /** "YYYY-MM-DD" */
  readonly date: string;
  /** "HH:MM" 形式、 不正なら default に fallback */
  readonly startTime?: string;
  /** "HH:MM" 形式、 不正なら default に fallback */
  readonly endTime?: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * options.startTime を strict 検証 + default fallback。
 *
 * @returns { resolvedStart, isDefault }
 */
function resolveBoundaryStartTime(input: BoundaryNodeInput): {
  resolved: string;
  isDefault: boolean;
} {
  const provided = input.startTime;
  if (typeof provided === "string" && parseHHMMtoMinutes(provided) !== null) {
    return { resolved: provided, isDefault: provided === DEFAULT_BOUNDARY_START_TIME };
  }
  return { resolved: DEFAULT_BOUNDARY_START_TIME, isDefault: true };
}

function resolveBoundaryEndTime(input: BoundaryNodeInput): {
  resolved: string;
  isDefault: boolean;
} {
  const provided = input.endTime;
  if (typeof provided === "string" && parseHHMMtoMinutes(provided) !== null) {
    return { resolved: provided, isDefault: provided === DEFAULT_BOUNDARY_END_TIME };
  }
  return { resolved: DEFAULT_BOUNDARY_END_TIME, isDefault: true };
}

function rationaleFor(isDefault: boolean): BoundaryRationale {
  return {
    type: isDefault ? "default" : "user_override",
    timezone: "local",
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Generators
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * StartNode を生成。
 *
 * 設計:
 *   - id = `${date}_start_0` (= 1 日 1 個)
 *   - origin: "implicit"
 *   - startTime === endTime (= 「点」、 durationMin = 0)
 *   - timeBucket は startTime ベース
 */
export function buildStartNode(input: BoundaryNodeInput): StartNode {
  const { resolved, isDefault } = resolveBoundaryStartTime(input);
  return {
    id: `${input.date}_start_0`,
    kind: "start",
    origin: "implicit",
    startTime: resolved,
    endTime: resolved,
    durationMin: 0,
    timeBucket: bucketFromHHMM(resolved),
    boundaryRationale: rationaleFor(isDefault),
  };
}

/**
 * EndNode を生成。
 *
 * 設計:
 *   - id = `${date}_end_0`
 *   - origin: "implicit"
 *   - startTime === endTime
 *   - timeBucket は startTime ベース
 */
export function buildEndNode(input: BoundaryNodeInput): EndNode {
  const { resolved, isDefault } = resolveBoundaryEndTime(input);
  return {
    id: `${input.date}_end_0`,
    kind: "end",
    origin: "implicit",
    startTime: resolved,
    endTime: resolved,
    durationMin: 0,
    timeBucket: bucketFromHHMM(resolved),
    boundaryRationale: rationaleFor(isDefault),
  };
}
