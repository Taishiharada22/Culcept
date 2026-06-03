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
  wearEventToEntry,
  type PlanWornRecordInput,
  type CalendarWornRecordInput,
  type CalendarConvertOptions,
  type WearEventInput,
  type WearEventConvertOptions,
} from "./converters";

export {
  resolveWornHistoryConflict,
  type WornHistoryConflictDecision,
} from "./conflictPolicy";

export {
  buildWornHistoryView,
  loadWornHistoryView,
  getWornHistoryEntryForDate,
  getLearningCorpus,
  type BuildWornHistoryViewInput,
  type LoadWornHistoryViewOptions,
  type WornHistoryView,
  type WornHistoryConflictNote,
} from "./readView";

export {
  learningCorpusToWornRecords,
  wornHistoryEntriesToRecencyWornRecords,
  compareWornHistoryLearningInputs,
  type LearningWornRecord,
  type RecencyWornRecord,
  type AdapterOptions,
  type CompareInput,
  type WornHistoryShadowSummary,
} from "./learningAdapter";

export { WORN_HISTORY_FLAGS } from "./flags";

export {
  buildWornHistoryEngineInput,
  getRecentlyWornItemIdsFromRecencyRecords,
  type WornHistoryEngineInput,
  type BuildWornHistoryEngineInputOptions,
} from "./engineInput";
