/**
 * Reality Control OS — 4-A Anchor → PlanItemSnapshot / HardConstraint（**pure mapper・no-DB**・barrel 非 export）
 *
 * 設計: docs/full-worldstate-reader-preflight.md（§1, §7）
 *
 * 役割: column-restricted な anchor row（`external_anchors` の許可列のみ）を `PlanItemSnapshot` / `HardConstraint` に写す pure mapper。
 *   **title は read 段で既に除外済**（許可列に title なし）＝PII を持ち込まない。governance は rigidity/sensitive から導出。
 *
 * 厳守: **PlanItem 正本を作らない / Plan 本線に接続しない / actual anchor read しない**・title/label redact・
 *   sensitive は時刻・governance のみ採用・**捏造しない**（不正/欠損 skip）・pure・Date/TZ 非依存（ISO は literal time 抽出）。
 */

import type { PlanItemGovernance, ProtectionReason } from "../authority";
import type { PlanItemSnapshot } from "../change-set";
import type { HardConstraint } from "../empty-day/empty-day-input";
import { snapshotsToHardConstraints } from "./schedule-hardconstraint-mapper";

/** column-restricted anchor row（reader 出力＝ColumnRestrictedAnchorRow と同形・**title なし**）。 */
export interface AnchorScheduleRow {
  readonly id: string;
  readonly start_time: string; // "HH:mm" or ISO 8601
  readonly end_time: string | null;
  readonly rigidity: "hard" | "soft";
  readonly sensitive_category: string | null;
}

const DAY_MAX = 24 * 60;

/** "HH:mm" / ISO 8601 から **当日分**（0..1440）。literal time を抽出（Date/TZ 非依存）。不正/範囲外/日付のみは null。 */
export function parseTimeToMinutes(t: string): number | null {
  const m = /(?:^|T)(\d{1,2}):(\d{2})/.exec(t); // "09:30" or "...T09:30..." の literal time
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || h > 24 || min < 0 || min > 59) return null;
  const total = h * 60 + min;
  return total >= 0 && total <= DAY_MAX ? total : null;
}

/** rigidity / sensitive → governance（imported・import_locked・rigidity/sensitive で flexibility/protection）。 */
export function deriveAnchorGovernance(rigidity: "hard" | "soft", sensitive: string | null): PlanItemGovernance {
  const protectionReasons: ProtectionReason[] = rigidity === "hard" ? ["hard_external"] : sensitive != null ? ["user_declared"] : ["tentative"];
  return {
    origin: "imported",
    authority: "import_locked", // 外部 import = immovable（isImmovable が true）
    flexibility: rigidity === "hard" || sensitive != null ? "locked" : "movable",
    protectionReasons,
  };
}

/** anchor row → PlanItemSnapshot（start 不明は null・title は持ち込まない・end 不明は endMin 省略）。 */
export function anchorRowToSnapshot(row: AnchorScheduleRow): PlanItemSnapshot | null {
  const startMin = parseTimeToMinutes(row.start_time);
  if (startMin == null) return null; // start 不明は捏造せず skip
  const endMin = row.end_time ? parseTimeToMinutes(row.end_time) : null;
  return {
    itemId: row.id,
    startMin,
    ...(endMin != null ? { endMin } : {}), // end 不明は省略（snapshotsToHardConstraints が skip）
    // title: 持ち込まない（read 段で除外済 + redact）
    governance: deriveAnchorGovernance(row.rigidity, row.sensitive_category),
  };
}

/** anchor rows → PlanItemSnapshot[]（不正 skip）。 */
export function anchorRowsToSnapshots(rows: readonly AnchorScheduleRow[]): readonly PlanItemSnapshot[] {
  return rows.map(anchorRowToSnapshot).filter((s): s is PlanItemSnapshot => s !== null);
}

/** anchor rows → HardConstraint[]（snapshot → 既存 snapshotsToHardConstraints・label=null redact）。 */
export function anchorRowsToHardConstraints(rows: readonly AnchorScheduleRow[]): readonly HardConstraint[] {
  return snapshotsToHardConstraints(anchorRowsToSnapshots(rows));
}
