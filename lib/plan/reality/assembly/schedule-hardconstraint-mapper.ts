/**
 * Reality Control OS — Assembly: schedule / PlanItemSnapshot → HardConstraint（**pure**・barrel 非 export）
 *
 * 設計: docs/live-reader-integration-design.md（§2.1）
 *
 * 役割: 当日の固定予定（`PlanItemSnapshot`）を R2/R5 の `HardConstraint` に変換する pure mapper。
 *   **label は粗く redact（raw title を持ち込まない）**・governance/authority を尊重（protection を保持）・
 *   **PlanItem 正本を作らない / Plan 本体に接続しない**。
 *
 * 厳守: 時刻欠損は skip（捏造しない）・raw title を出さない（label=null）・governance 由来の protection のみ・pure。
 */

import type { PlanItemSnapshot } from "../change-set";
import { primaryProtectionReason } from "../authority";
import type { HardConstraint } from "../empty-day/empty-day-input";

/**
 * PlanItemSnapshot[] → HardConstraint[]。startMin/endMin 必須・**label は redact(null)**・protection は governance 由来。
 */
export function snapshotsToHardConstraints(snapshots: readonly PlanItemSnapshot[]): readonly HardConstraint[] {
  const out: HardConstraint[] = [];
  for (const s of snapshots) {
    if (typeof s.startMin !== "number" || typeof s.endMin !== "number" || !Number.isFinite(s.startMin) || !Number.isFinite(s.endMin) || s.startMin >= s.endMin) {
      continue; // 時刻欠損/逆転は捏造せず skip
    }
    out.push({
      startMinute: s.startMin,
      endMinute: s.endMin,
      label: null, // **raw title を持ち込まない**（redact）。粗カテゴリが要れば後付け
      protection: s.governance ? primaryProtectionReason(s.governance) : null, // governance 尊重
    });
  }
  return out;
}
