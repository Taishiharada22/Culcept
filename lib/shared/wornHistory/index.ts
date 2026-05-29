/**
 * shared WornHistory — public barrel（Phase 3-A: pure domain only）
 *
 * storage / engine / server には接続しない。 canonical 型・eligibility・converter・conflict policy のみ。
 * client store / runtime 接続は後続 Phase（3-B 以降）で別途。
 */

export type {
  SatisfactionLevel,
  WornHistorySource,
  WornHistoryOrigin,
  WornHistoryEntry,
} from "./types";

export {
  isSatisfactionLevel,
  computeLearningEligibility,
  recomputeLearningEligibility,
  type LearningEligibilityInput,
  type LearningEligibilityOptions,
} from "./eligibility";

export {
  planWornRecordToEntry,
  calendarWornRecordToEntry,
  type PlanWornRecordInput,
  type CalendarWornRecordInput,
  type CalendarConvertOptions,
} from "./converters";

export {
  resolveWornHistoryConflict,
  type WornHistoryConflictDecision,
} from "./conflictPolicy";
