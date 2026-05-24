/**
 * Phase 3-N Plan List impl foundation — Pure type 定義
 *
 * 設計原則 (= Spec audit `6bc20c49` §5 + 第 8 補正 3 留意点反映):
 *   - pure type のみ (= LLM / API / DB / network 不使用)
 *   - 既存 anchor data model から transform する view model
 *   - 第 8 補正 #2: accepted Alter generated の alterAcceptedAt metadata 確保 (= 完全消失防止)
 *   - 第 8 補正 #3: executionLayerCounts optional (= card 軽い chip の枠まで、 学習ループ本実装は後続)
 *
 * 13 拘束条件との対応 (= IA Audit `4d1c3e7d`):
 *   - SourceType: #1 source provenance UI / #12 状態遷移
 *   - SourceProvenance: #1 + #12 + 第 8 補正 #2 alterAcceptedAt
 *   - ConfirmedState: #5 確定前後表現
 *   - EventCardViewModel: 主要 view model (= Spec §5.1 基盤)
 *   - TransitionViewModel: 補助 (= Spec §5.3 基盤)
 *   - TimelineSpineViewModel: 構造統合 (= Spec §5.2 基盤)
 *
 * 設計書:
 *   - docs/alter-plan-list-redesign-spec-audit.md (= `6bc20c49`)
 *   - docs/alter-plan-list-map-ia-audit.md (= `4d1c3e7d`)
 *   - docs/alter-plan-list-map-design-direction-audit.md (= `e99406ce`)
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Source types (= 13 拘束 #1 + state machine #12)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Anchor の由来 source (= 4 種類、 拘束 #1 + #12)
 *
 * 状態遷移 (= IA #12):
 *   - user_entered → user 編集 → user_entered (= 同)
 *   - imported → user 編集 (title/メモ/Execution) → imported 維持
 *   - imported → user 編集 (時刻/場所) → ロック (= ImportedLockEscape modal trigger)
 *   - alter_generated_proposed → 受け入れ → user_entered (= alterAcceptedAt metadata 保持)
 *   - alter_generated_proposed → 削除 → (削除、 Alter 学習: 「user 拒否」)
 *   - alter_generated_accepted は内部状態 (= 受け入れ後 user_entered に変換、 metadata で由来保持)
 */
export type SourceType =
  | 'user_entered'
  | 'imported'
  | 'alter_generated_proposed'
  | 'alter_generated_accepted';

/**
 * Source provenance (= 詳細 metadata、 拘束 #1 + 第 8 補正 #2)
 *
 * 第 8 補正 #2 反映: alterAcceptedAt で「Alter 由来」 履歴を保持 (= 完全消失防止)
 *   - main card 主表示では dot 消滅 (= Spec §3.1)
 *   - 但し詳細 sheet では由来表示
 *   - main card に極小 metadata の逃がし道は後段 sub-phase で
 */
export type SourceProvenance = {
  readonly source: SourceType;
  /** imported 由来時の source 名 (= 「シフト表」 / 「時間割」 / 「PDF」 等) */
  readonly importedFrom?: string;
  /** alter_generated_accepted 時の受け入れ時刻 (= ISO 8601、 第 8 補正 #2 metadata) */
  readonly alterAcceptedAt?: string;
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Event category (= visual encoding 用、 Spec §8.2 color tokens 対応)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Event の category (= 5 種類、 Spec §8.2 color tokens に対応)
 *
 * - cafe: 紫 (= indigo/violet 系)
 * - meal: オレンジ (= orange-500)
 * - work: 青 (= blue/sky 系)
 * - home: 緑 (= emerald 系)
 * - other: 既定 (= category 未指定時)
 */
export type EventCategory = 'cafe' | 'meal' | 'work' | 'home' | 'other';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Confirmed state (= 拘束 #5 + #12 確定前後表現)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Event の確定状態 (= 拘束 #5 + #12)
 *
 * - 'confirmed': user_entered / imported / alter_generated_accepted で表示 (= solid border、 opacity 1.0)
 * - 'proposed': alter_generated_proposed (= dashed border、 opacity 0.7、 「受け入れる ›」 chip)
 */
export type ConfirmedState = 'confirmed' | 'proposed';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Event card view model (= Spec §5.1 EventCardProps 基盤)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * EventCard の表示単位 view model
 *
 * Spec §5.1 EventCardProps の基盤型。 既存 anchor data model から transform。
 *
 * 第 8 補正 #3 反映: executionLayerCounts は optional、 first pass では undefined OK
 *   (= card 軽い chip の枠だけ、 学習ループ本実装は後続 sub-phase)
 */
export type EventCardViewModel = {
  readonly id: string;
  readonly title: string;
  /** HH:MM format */
  readonly startTime: string;
  /** HH:MM format、 optional (= 終了時刻未設定の予定) */
  readonly endTime?: string;
  readonly location?: string;
  /** Alter による意味付け補助文 (= 「集中しやすい〜」 等) */
  readonly alterNote?: string;
  readonly category: EventCategory;
  readonly provenance: SourceProvenance;
  readonly confirmedState: ConfirmedState;
  /** Event Execution Layer chip 用 counts (= 第 8 補正 #3、 first pass: optional、 枠まで) */
  readonly executionLayerCounts?: {
    readonly preparation?: number;
    readonly post?: number;
  };
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Transition view model (= Spec §5.3 TransitionChip props 基盤)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Event 間の transition (= 「移動」 等)
 *
 * Spec §5.3 TransitionChipProps の基盤型。
 * label は自然な日本語 (= 「移動」 / 「移動・リフレッシュ」 等、 第 2 補正 revert で参考画像踏襲)
 */
export type TransitionViewModel = {
  /** HH:MM format */
  readonly fromTime: string;
  /** HH:MM format */
  readonly toTime: string;
  /** label (= 「移動」 / 「移動・リフレッシュ」 等、 default '移動') */
  readonly label: string;
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Timeline spine view model (= Spec §5.2 TimelineSpine props 基盤、 構造統合)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Timeline 全体の view model (= 1 日分の events + transitions)
 */
export type TimelineSpineViewModel = {
  readonly events: ReadonlyArray<EventCardViewModel>;
  readonly transitions: ReadonlyArray<TransitionViewModel>;
};
