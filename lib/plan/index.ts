/**
 * Plan domain types — public re-export
 *
 * Alter Plan 基盤の型を一括公開する。実装ロジック（hook / repository / generator）は
 * 各ファイルの後続 commit で追加していく。
 *
 * 設計書: docs/alter-plan-foundation-design.md
 *
 * Wave 1: 型のみ export（W1-1）。
 */

// ── 共有 ──
export type { LocationCategory } from "./location-category";

// ── ExternalAnchorSource（§2.1, §11.2） ──
export type {
  ExternalAnchorSource,
  ExternalAnchorSourceType,
  RawRetention,
} from "./external-anchor-source";

// ── ExternalAnchor（§2.0, §2.1, §12） ──
export type {
  ExternalAnchor,
  OneOffExternalAnchor,
  RecurringExternalAnchor,
  AnchorRigidity,
  AnchorSensitiveCategory,
} from "./external-anchor";

// ── PlanSeed（§2.0, §2.2） ──
export type {
  PlanSeed,
  PlanSeedTimeHint,
  PlanSeedSource,
  PlanSeedStatus,
} from "./plan-seed";

// ── PlanDriftEvent（§2.3） ──
export type {
  PlanDriftEvent,
  PlanDriftTarget,
  PlanDriftType,
  PlanDriftEvidenceSource,
  PlanDriftEvidenceStrength,
  PlanDriftPredicted,
  PlanDriftActual,
  PlanDriftTargetSnapshot,
} from "./plan-drift-event";

// ── DraftPlan（§2.4, §5） ──
export type {
  DraftPlan,
  DraftPlanItem,
  DraftPlanLevel,
  DraftPlanGenerator,
  DraftPlanStatus,
  DraftPlanItemOrigin,
  DraftPlanItemRigidity,
  DraftPlanBasedOn,
} from "./draft-plan";

// ── AlterConfirmation（§4） ──
export type {
  AlterConfirmationAction,
  AlterConfirmationState,
  AlterConfirmationSource,
  AlterConfirmationMeta,
} from "./alter-confirmation";
