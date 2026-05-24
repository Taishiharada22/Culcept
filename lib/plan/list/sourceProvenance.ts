/**
 * Phase 3-N List impl sub-phase 3.5 — Source model 2-axis refactor (= 第 10 補正反映)
 *
 * 設計原則 (= 第 10 補正、 sub-phase 3 の 1 軸モデルを 2 軸に分離):
 *   - **Origin axis** (= 由来、 immutable): user / imported / alter_generated
 *   - **Authority axis** (= 所有権、 transition 可能): proposed / user_owned / import_locked
 *   - 9 組合せのうち **5 valid variant のみ** を discriminated union で表現
 *   - 不正組み合わせ 4 件は型上表現不能 (= 第 9 補正 #1 機械的禁止 維持 + 強化)
 *
 * 第 10 補正の本質 (= GPT 第 10 補正、 2026-05-24):
 *   - 旧 sub-phase 3: SourceType 1 軸に「由来 / 所有権 / 確定状態」 を載せて混在 (= accepted Alter generated の説明が揺れる)
 *   - 新: Origin (= 由来) + Authority (= 所有権) を分離
 *   - accepted Alter generated = { origin: alter_generated, authority: user_owned, acceptedAt: ... }
 *   - → **「由来は消えない」 + 「user が編集できる」 を矛盾なく表現**
 *
 * 第 7 補正 #2 (= imported lock 逃がし道) との整合:
 *   - override 差分管理: imported + import_locked → imported + user_owned (= 由来保持 + 編集自由)
 *   - 複製: imported event を base に新規 user + user_owned event 作成 (= 元 imported 不変)
 *
 * 第 8 補正 #2 (= accepted Alter generated 完全消失防止) との整合:
 *   - accepted 後も origin === 'alter_generated' (= 「由来」 永遠保持)
 *   - acceptedAt metadata で受け入れ時刻 保持
 *
 * 設計書:
 *   - docs/alter-plan-list-redesign-spec-audit.md §19.7
 *   - decision-log (= 第 10 補正引き継ぎ commit)
 */

import { type EventCategory } from "./types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2 軸 source model: Origin + Authority
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Origin axis (= 由来、 immutable)
 *
 * - user: user が直接作成
 * - imported: 文書取り込み (= シフト表 / 時間割 / PDF)
 * - alter_generated: Alter 提案由来 (= 受け入れ前後問わず、 「由来は永遠保持」)
 */
export type Origin = 'user' | 'imported' | 'alter_generated';

/**
 * Authority axis (= 所有権、 transition 可能)
 *
 * - proposed: Alter 提案中 (= user 未受け入れ)
 * - user_owned: user 所有 (= user 編集自由)
 * - import_locked: imported source 真実性ロック (= 時刻 / 場所 編集不可)
 */
export type Authority = 'proposed' | 'user_owned' | 'import_locked';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Source model 5 valid variant (= 9 組合せから 4 不正除外、 discriminated union)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 妥当性 table (= 9 組合せ):
 *
 * | Origin          | Authority      | 妥当性 | 説明 |
 * |-----------------|----------------|--------|------|
 * | user            | user_owned     | ✅ valid | user 作成 = user 所有 |
 * | user            | proposed       | ❌ 不正 | user 作成は proposed にならない |
 * | user            | import_locked  | ❌ 不正 | user 作成は import_locked にならない |
 * | imported        | import_locked  | ✅ valid | imported default |
 * | imported        | user_owned     | ✅ valid | 第 7 補正 #2 override 後 |
 * | imported        | proposed       | ❌ 不正 | imported は proposed にならない |
 * | alter_generated | proposed       | ✅ valid | Alter 提案 未受け入れ |
 * | alter_generated | user_owned     | ✅ valid | Alter 提案 受け入れ済 (= acceptedAt あり) |
 * | alter_generated | import_locked  | ❌ 不正 | Alter generated は import_locked にならない |
 */

/** user 作成、 user 所有 */
export type UserOwnedSource = {
  readonly origin: 'user';
  readonly authority: 'user_owned';
};

/** imported default (= ロック)、 importedFrom required */
export type ImportedLockedSource = {
  readonly origin: 'imported';
  readonly authority: 'import_locked';
  readonly importedFrom: string;
};

/** imported override 済 (= 第 7 補正 #2)、 importedFrom 保持 */
export type ImportedOverriddenSource = {
  readonly origin: 'imported';
  readonly authority: 'user_owned';
  readonly importedFrom: string;
};

/** Alter 提案 (= 未確定) */
export type AlterProposedSource = {
  readonly origin: 'alter_generated';
  readonly authority: 'proposed';
};

/** Alter 提案 受け入れ済 (= 第 8 補正 #2 acceptedAt 保持) */
export type AlterAcceptedSource = {
  readonly origin: 'alter_generated';
  readonly authority: 'user_owned';
  readonly acceptedAt: string;
};

/** Source model discriminated union (= 5 valid variant、 不正組み合わせ表現不能) */
export type SourceModel =
  | UserOwnedSource
  | ImportedLockedSource
  | ImportedOverriddenSource
  | AlterProposedSource
  | AlterAcceptedSource;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Strict event card view model (= source model 統合)
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

/** Strict event card with 2-axis source model */
export type StrictEventCardViewModel = EventCardCommon & {
  readonly sourceModel: SourceModel;
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Derived state helpers (= ConfirmedState 等を derived value として復元)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 未確定か (= authority === 'proposed')
 *
 * UI 表示用 (= dashed border + opacity 0.7 + 「受け入れる」 chip、 Spec §3.1)
 */
export function isProposed(sourceModel: SourceModel): boolean {
  return sourceModel.authority === 'proposed';
}

/**
 * imported source ロック中か (= authority === 'import_locked')
 *
 * UI 表示用 (= 時刻 / 場所編集 attempt 時に ImportedLockEscape modal trigger、 第 7 補正 #2)
 */
export function isImportLocked(sourceModel: SourceModel): boolean {
  return sourceModel.authority === 'import_locked';
}

/**
 * Alter 由来か (= origin === 'alter_generated')
 *
 * 第 10 補正本質: accepted 後も origin が保持されるので、 「由来」 は永遠に消えない
 * UI 表示用 (= 詳細 sheet で 「Alter 提案を受け入れ済」 caption、 Spec §3.1)
 */
export function isAlterOrigin(sourceModel: SourceModel): boolean {
  return sourceModel.origin === 'alter_generated';
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Factory functions (= validated API)
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

/** Factory: user 作成 event (= user + user_owned 自動) */
export function createUserEvent(input: CommonInput): StrictEventCardViewModel {
  return {
    ...input,
    sourceModel: { origin: 'user', authority: 'user_owned' },
  };
}

/** Factory: imported event (= imported + import_locked 自動、 importedFrom required) */
export function createImportedEvent(
  input: CommonInput & { importedFrom: string },
): StrictEventCardViewModel {
  const { importedFrom, ...common } = input;
  return {
    ...common,
    sourceModel: { origin: 'imported', authority: 'import_locked', importedFrom },
  };
}

/** Factory: Alter proposed event (= alter_generated + proposed 自動) */
export function createAlterProposedEvent(input: CommonInput): StrictEventCardViewModel {
  return {
    ...input,
    sourceModel: { origin: 'alter_generated', authority: 'proposed' },
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Transition functions (= state transition、 第 7 補正 #2 + 第 8 補正 #2)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Alter proposed → accepted (= 第 8 補正 #2 acceptedAt 保持、 第 10 補正 origin 不変)
 *
 * - origin: 'alter_generated' のまま (= 「由来は消えない」)
 * - authority: 'proposed' → 'user_owned' (= 「user 編集自由」)
 * - acceptedAt: 自動付与 (= ISO 8601、 default は現在時刻)
 *
 * @throws Error if input が alter_generated + proposed でない
 */
export function acceptAlterProposed(
  event: StrictEventCardViewModel,
  acceptedAt: string = new Date().toISOString(),
): StrictEventCardViewModel {
  if (event.sourceModel.origin !== 'alter_generated' || event.sourceModel.authority !== 'proposed') {
    throw new Error('acceptAlterProposed: input must be { origin: alter_generated, authority: proposed }');
  }
  return {
    ...event,
    sourceModel: { origin: 'alter_generated', authority: 'user_owned', acceptedAt },
  };
}

/**
 * Imported event を override (= 第 7 補正 #2 「override 差分管理」 主方式)
 *
 * - origin: 'imported' のまま (= 「imported source の真実保持」)
 * - authority: 'import_locked' → 'user_owned' (= 「user 編集自由」)
 * - importedFrom: 保持 (= 由来 source 名は不変)
 *
 * @throws Error if input が imported + import_locked でない
 */
export function overrideImported(event: StrictEventCardViewModel): StrictEventCardViewModel {
  if (event.sourceModel.origin !== 'imported' || event.sourceModel.authority !== 'import_locked') {
    throw new Error('overrideImported: input must be { origin: imported, authority: import_locked }');
  }
  return {
    ...event,
    sourceModel: {
      origin: 'imported',
      authority: 'user_owned',
      importedFrom: event.sourceModel.importedFrom,
    },
  };
}

/**
 * Imported event を複製して新規 user event 化 (= 第 7 補正 #2 「複製」 補助方式)
 *
 * - 元 imported は不変
 * - 新規 user event を返す (= origin: 'user', authority: 'user_owned')
 * - importedFrom は不継承 (= 完全に別 anchor)
 *
 * @param event 元 imported event (= 不変、 imported origin のみ受け付け)
 * @param newId 新規 user event の id
 * @throws Error if input が imported origin でない
 */
export function cloneImported(
  event: StrictEventCardViewModel,
  newId: string,
): StrictEventCardViewModel {
  if (event.sourceModel.origin !== 'imported') {
    throw new Error('cloneImported: input must be imported origin');
  }
  return {
    id: newId,
    title: event.title,
    startTime: event.startTime,
    endTime: event.endTime,
    location: event.location,
    alterNote: event.alterNote,
    category: event.category,
    executionLayerCounts: event.executionLayerCounts,
    sourceModel: { origin: 'user', authority: 'user_owned' },
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Source display variants (= 第 7 補正 #1 多軸表現、 維持)
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
 * Compact variant (= event card 主表示、 2 軸 = 色 + icon)
 *
 * 主画面 noise 回避のため label は非表示
 */
export const COMPACT_VARIANT: SourceDisplayVariant = {
  showDot: true,
  showIcon: true,
  showLabel: false,
};

/**
 * Full variant (= 詳細 sheet / 競合 modal、 全 3 軸)
 *
 * 詳細閲覧時は完全情報
 */
export const FULL_VARIANT: SourceDisplayVariant = {
  showDot: true,
  showIcon: true,
  showLabel: true,
};
