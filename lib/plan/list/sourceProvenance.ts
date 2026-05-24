/**
 * Phase 3-N List impl sub-phase 3 — Source provenance discriminated union + factory
 *
 * 設計原則 (= 第 9 補正 #1 反映、 不正組み合わせ機械的禁止):
 *   - discriminated union で source + confirmedState 不正組み合わせ表現不能化
 *   - factory function で API clean + validated transition
 *   - 既存 types.ts (= loose) は維持 (= 後方互換)、 新規 strict 型を提供
 *
 * 不正組み合わせの禁止例 (= 第 9 補正 #1 指摘):
 *   - user_entered + proposed (= 提案中の user_entered はあり得ない)
 *   - imported + proposed (= 提案中の imported はあり得ない)
 *   - alter_generated_proposed + alterAcceptedAt (= proposed なのに accepted timestamp)
 *
 * 設計書:
 *   - docs/alter-plan-list-redesign-spec-audit.md §19.7
 *   - decision-log `98a7b924`
 */

import { type EventCategory } from "./types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Discriminated union: 各 source variant (= 不正組み合わせ表現不能)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type UserEnteredProvenance = {
  readonly source: 'user_entered';
};

/** imported = 文書取り込み (= シフト表 / 時間割 / PDF)、 importedFrom required */
export type ImportedProvenance = {
  readonly source: 'imported';
  readonly importedFrom: string;
};

/** Alter 提案 (= 未確定、 alterAcceptedAt は型上追加不可) */
export type AlterGeneratedProposedProvenance = {
  readonly source: 'alter_generated_proposed';
};

/** Alter 受け入れ済 (= 確定、 alterAcceptedAt required、 第 8 補正 #2 metadata 確保) */
export type AlterGeneratedAcceptedProvenance = {
  readonly source: 'alter_generated_accepted';
  readonly alterAcceptedAt: string; // ISO 8601
};

/** Strict source provenance discriminated union (= 4 variant) */
export type StrictSourceProvenance =
  | UserEnteredProvenance
  | ImportedProvenance
  | AlterGeneratedProposedProvenance
  | AlterGeneratedAcceptedProvenance;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Strict EventCard view model (= confirmedState + source 整合性保証)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type EventCardCommon = {
  readonly id: string;
  readonly title: string;
  readonly startTime: string;
  readonly endTime?: string;
  readonly location?: string;
  readonly alterNote?: string;
  readonly category: EventCategory;
  readonly executionLayerCounts?: {
    readonly preparation?: number;
    readonly post?: number;
  };
};

/**
 * Confirmed event card (= user_entered / imported / alter_generated_accepted のみ)
 *
 * 拘束:
 *   - confirmedState は 'confirmed' 固定
 *   - provenance source は user_entered / imported / alter_generated_accepted のみ
 *   - alter_generated_proposed は許容しない (= type 上不可、 第 9 補正 #1)
 */
export type ConfirmedEventCard = EventCardCommon & {
  readonly confirmedState: 'confirmed';
  readonly provenance:
    | UserEnteredProvenance
    | ImportedProvenance
    | AlterGeneratedAcceptedProvenance;
};

/**
 * Proposed event card (= alter_generated_proposed のみ)
 *
 * 拘束:
 *   - confirmedState は 'proposed' 固定
 *   - provenance source は alter_generated_proposed のみ
 *   - 他の source は許容しない (= type 上不可、 第 9 補正 #1)
 */
export type ProposedEventCard = EventCardCommon & {
  readonly confirmedState: 'proposed';
  readonly provenance: AlterGeneratedProposedProvenance;
};

/** Strict event card view model (= confirmed | proposed の discriminated union) */
export type StrictEventCardViewModel = ConfirmedEventCard | ProposedEventCard;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Factory functions (= validated transition、 API clean)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type CommonInput = {
  id: string;
  title: string;
  startTime: string;
  endTime?: string;
  location?: string;
  alterNote?: string;
  category: EventCategory;
  executionLayerCounts?: {
    preparation?: number;
    post?: number;
  };
};

/** Factory: user_entered event card (= confirmed) */
export function createUserEnteredEventCard(input: CommonInput): ConfirmedEventCard {
  return {
    ...input,
    confirmedState: 'confirmed',
    provenance: { source: 'user_entered' },
  };
}

/** Factory: imported event card (= confirmed、 importedFrom required) */
export function createImportedEventCard(
  input: CommonInput & { importedFrom: string },
): ConfirmedEventCard {
  const { importedFrom, ...common } = input;
  return {
    ...common,
    confirmedState: 'confirmed',
    provenance: { source: 'imported', importedFrom },
  };
}

/** Factory: Alter proposed event card (= proposed、 受け入れ前) */
export function createAlterProposedEventCard(input: CommonInput): ProposedEventCard {
  return {
    ...input,
    confirmedState: 'proposed',
    provenance: { source: 'alter_generated_proposed' },
  };
}

/**
 * Transition: Alter proposed を受け入れて confirmed 化
 *
 * 第 8 補正 #2 反映: alterAcceptedAt metadata で「Alter 由来」 履歴を保持 (= 完全消失防止)
 *
 * @param proposed - 受け入れ前の ProposedEventCard
 * @param acceptedAt - 受け入れ時刻 (= ISO 8601、 default は現在時刻)
 */
export function acceptAlterProposed(
  proposed: ProposedEventCard,
  acceptedAt: string = new Date().toISOString(),
): ConfirmedEventCard {
  return {
    id: proposed.id,
    title: proposed.title,
    startTime: proposed.startTime,
    endTime: proposed.endTime,
    location: proposed.location,
    alterNote: proposed.alterNote,
    category: proposed.category,
    executionLayerCounts: proposed.executionLayerCounts,
    confirmedState: 'confirmed',
    provenance: { source: 'alter_generated_accepted', alterAcceptedAt: acceptedAt },
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Source display variants (= 第 7 補正 #1 多軸表現)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Source 表示の variant (= どの軸を表示するか)
 *
 * 第 7 補正 #1: 色 + アイコン or 状態ラベル の最低 2 軸併用 (= 色 dot だけ禁止)
 */
export type SourceDisplayVariant = {
  readonly showDot: boolean;
  readonly showIcon: boolean;
  readonly showLabel: boolean;
};

/**
 * Compact variant (= event card 主表示用、 2 軸 = 色 + icon)
 *
 * 主画面 noise 回避のため label は非表示
 */
export const COMPACT_VARIANT: SourceDisplayVariant = {
  showDot: true,
  showIcon: true,
  showLabel: false,
};

/**
 * Full variant (= 詳細 sheet / 競合 modal 用、 全 3 軸)
 *
 * 詳細閲覧時は完全情報
 */
export const FULL_VARIANT: SourceDisplayVariant = {
  showDot: true,
  showIcon: true,
  showLabel: true,
};
