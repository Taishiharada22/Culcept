/**
 * DialogState — 会話所有層の単一責任型
 *
 * 位置づけ:
 *   PR-8 rev 3 で導入する「会話を所有する 1 コンポーネント」の型定義のみ。
 *   実装（reducer / taxonomy / derivePendingClarify）は同ディレクトリの別ファイル
 *   に分離。flag `DIALOG_STATE_V2` が false の間、本型は session に optional
 *   field として存在するが読み書きされない（commit 13 の contract）。
 *
 * 設計書:
 *   - docs/alter-morning-strict-confirmation-design.md §3.7 (DialogState)
 *   - docs/alter-morning-pr8-rev3-implementation-detail.md §1 (Reducer 詳細)
 *   - docs/alter-morning-pr9-places-search-design.md §2.1 (PR-9 入力契約)
 *
 * 後続 PR との握り（型互換は後続 PR のみが崩せる）:
 *   - focus.event_id = ComprehensionEvent.event_id と同型 (string)
 *   - focus.slot ⊆ PendingSlot ("where" | "when" | "what" | "who") の subset
 *   - searchQueryDraft.anchorRegion + (chain|category) が揃ったときのみ PR-9 起動
 *   - lastGoodPlan は provider_recovering 時の UI 継続用
 *
 * 不変条件（reducer で保証）:
 *   - conversationStatus の遷移は閉じた FSA（下の許可行列 §10.1）
 *   - narrowStep は focus.slot="where" に限り 0→1→2→terminal の monotonic
 *   - searchQueryDraft.readyForHandoff は他 3 フィールドから自動 derive
 *   - chain ↔ category 相互排他（detail §1.4）
 */

import type { Event as ComprehensionEvent } from "../comprehension/eventSchema";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Conversation Status — 会話の現在モード
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * conversationStatus state machine:
 *
 *                ┌──────────────> provider_recovering ────┐
 *                │                 (any → failure)        │
 *                │                                        │
 *     stable <──┼─── clarifying ──── narrowing ──── search_handoff_blocking
 *                │                                          │
 *                └──────── slot_switching ──────────────────┘
 *
 * - stable:                 confirmationState 全部 confirmed、次入力待ち
 * - clarifying:             1 event に対する「何を」再確認中
 * - narrowing:              where slot の narrowStep>0 で anchor/category/chain を詰めている
 * - search_handoff_blocking: PR-9 起動前状態（PR-8 内部のみ、user-facing は slot_switching と同等）
 * - slot_switching:         別 slot に focus 移動中
 * - provider_recovering:    LLM / Places API 失敗後の lastGoodPlan 継続状態
 *
 * 遷移許可表（detail §1.1）:
 *   - stable        → clarifying | narrowing | provider_recovering
 *   - clarifying    → stable | narrowing | slot_switching | search_handoff_blocking | provider_recovering
 *   - narrowing     → narrowing | search_handoff_blocking | clarifying | slot_switching | stable | provider_recovering
 *   - search_handoff_blocking → clarifying | narrowing | slot_switching | stable | provider_recovering
 *   - slot_switching → clarifying | narrowing | stable | provider_recovering
 *   - provider_recovering → clarifying | narrowing | stable (フェーズ権威より先に評価)
 */
export type ConversationStatus =
  | "stable"
  | "clarifying"
  | "narrowing"
  | "search_handoff_blocking"
  | "slot_switching"
  | "provider_recovering";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Focus — 現在 clarify している (event, slot) の組
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 会話の focus（誰のどの slot を今詰めているか）。
 *
 * narrowStep:
 *   focus.slot="where" のみ 0→1→2→3(terminal) で使う。
 *   - 0: generic（「どこ？」）
 *   - 1: anchor captured, category/chain まだ
 *   - 2: anchor + (category|chain) 揃った、search_handoff_blocking 手前
 *   - 3: PR-9 でのみ到達。PR-8 内では最大 2。
 *   where 以外の slot では narrowStep は 0 固定（使わない）。
 */
export interface DialogFocus {
  /** ComprehensionEvent.event_id と同型 */
  event_id: string;
  /**
   * 現在 focus している slot。PendingSlot の subset。
   * transport / endpoint は PR-10 以降で追加されるが、PR-8 rev 3 では扱わない。
   */
  slot: "where" | "when" | "what" | "who";
  /** where 専用 staircase step。他 slot では 0 固定 */
  narrowStep: 0 | 1 | 2 | 3;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Search Query Draft — PR-9 への handoff 契約
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * PR-9 places search の入力に渡される query 下書き。
 * 完成条件は `readyForHandoff`（reducer が自動 derive）:
 *
 *   readyForHandoff ⇔ anchorRegion != null && (categoryToken != null || chainToken != null)
 *
 * chain ↔ category 相互排他（detail §1.4）:
 *   - chainToken 確定時 → categoryToken は null に上書き
 *   - categoryToken 確定時 → chainToken を null に上書きはしない（chain はより specific なので上書きしない）
 *
 * PR-9 が受け取る想定値:
 *   - anchorRegion: "甲府" | "甲府駅周辺" 等（anchor dict 由来 or free text）
 *   - categoryToken: "カフェ" | "ランチ" 等（category dict 由来）
 *   - chainToken: "スタバ" | "マック" 等（chain dict 由来、正規化前の表記）
 */
export interface SearchQueryDraft {
  /** anchor（地域 / ランドマーク）。narrowStep >= 1 で non-null 保証（reducer 不変条件） */
  anchorRegion: string | null;
  /** カテゴリ（ジャンル）。chain と相互排他。detail §2.2 */
  categoryToken: string | null;
  /** chain ブランド。detail §2.1 の chainBrandDict から match */
  chainToken: string | null;
  /**
   * PR-9 起動可能フラグ。他 3 フィールドから自動 derive。
   * 手動で true 代入する経路は reducer 内部のみ許可。
   */
  readyForHandoff: boolean;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Normalized Capture — LLM からの「何を captured したか」単位
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * taxonomy 分類（decision table, detail §2 & design §3.9）:
 *
 *   - proper_noun_specific: 「サドヤ」「Tully's 甲府昭和店」    → 一意同定可能
 *   - chain_with_anchor:    「甲府のスタバ」                    → blocking 直行
 *   - chain_alone:          「スタバ」                          → anchor 追加聴取
 *   - category_with_anchor: 「甲府のカフェ」                    → blocking 直行
 *   - category_alone:       「カフェ」                          → anchor 追加聴取
 *   - anchor_alone:         「甲府」                            → chain/category 追加聴取
 *   - baseline:             「自宅」「オフィス」                → baseline 参照（PR-9 非経由）
 *   - undecided:            「決めてない」「まだ」「任せる」    → narrowStep 不進
 *   - generic_placeholder:  「ランチ」（時間域兼用の場合）      → rulePreParse で既処理想定
 *   - other:                分類不能                            → flatCount 加算のみ
 */
export type CaptureSubKind =
  | "proper_noun_specific"
  | "chain_with_anchor"
  | "chain_alone"
  | "category_with_anchor"
  | "category_alone"
  | "anchor_alone"
  | "baseline"
  | "undecided"
  | "generic_placeholder"
  | "other";

/**
 * progressDelta — 今回の入力が focus を前進させたか
 *   - "advanced":  narrowStep を進める / slot を confirm できる
 *   - "flat":      同じ粒度の情報のみ（flatCount 加算）
 *   - "regressed": 以前確定した情報を否定（narrowStep--）
 */
export type ProgressDelta = "advanced" | "flat" | "regressed";

export interface NormalizedCapture {
  /** 分類（detail §2 classify 関数の出力） */
  subKind: CaptureSubKind;
  /** taxonomy から抽出した anchor。無ければ null */
  extractedAnchor: string | null;
  /** taxonomy から抽出した category。無ければ null */
  extractedCategory: string | null;
  /** taxonomy から抽出した chain。無ければ null */
  extractedChain: string | null;
  /** 発話中の生片（analytics / debug） */
  rawSpan: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Captured History — ターン毎の capture log
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * capturedHistory[] は reducer が追記のみ行う append-only log。
 * flatCount は末尾 n 件の trailing "flat" 連続で derive（detail §1.3）。
 */
export interface CapturedHistoryEntry {
  /** turn 番号（1 始まり、session 内連番） */
  turnIndex: number;
  /** ISO timestamp */
  capturedAt: string;
  /** 対象 focus（当時の focus のスナップショット） */
  focus: DialogFocus;
  /** 今回の capture */
  capture: NormalizedCapture;
  /** progress 評価（detail §1.2 判定式） */
  progressDelta: ProgressDelta;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Last Good Plan — provider 失敗時の UI 継続用スナップショット
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * provider_recovering 時に UI が保持する「最後に成功した plan 相当」。
 * 本型は MorningPlan への循環参照を避け、ComprehensionEvent の読み取り専用配列
 * として保持する（表示には legacyAdapter 既存経路で十分）。
 *
 * null の場合は「まだ一度も成功 plan を持っていない」= UI に表示するものがない。
 * このとき reducer は plan を undefined のまま返し、adapter 層で空表示扱い。
 * detail §3.3 「makeEmptyRetryPlan 禁止」規則により placeholder plan は作らない。
 */
export interface LastGoodPlanSnapshot {
  /** 成功時のターン index */
  capturedAtTurn: number;
  /** 成功時の events（読み取り専用、上書きは reducer のみ） */
  events: ReadonlyArray<ComprehensionEvent>;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DialogState — 本体
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * DialogState の version 1。
 *
 * version bump:
 *   フィールド追加（後方互換）はそのまま version=1 を維持。
 *   意味変更 / 破壊的変更時は version=2 に bump し、ensureSessionV1 が reset。
 *   旧 version の session は migration せず新規にリセット（beta-only 方針、detail §6）。
 */
export type DialogStateVersion = 1;

export interface DialogState {
  version: DialogStateVersion;

  /**
   * 現在 focus。stable 中でも直前 focus を保持する（slot_switching 判定のため）。
   * session 初期化直後は null。
   */
  focus: DialogFocus | null;

  /** 現在のモード */
  conversationStatus: ConversationStatus;

  /** ターン毎の capture log（append-only、reducer のみ書く） */
  capturedHistory: CapturedHistoryEntry[];

  /**
   * 意味不明応答 (semantic_miss) の連続カウント。
   * 2 連続で pending 破棄 → fresh comprehension に戻す（既存 PendingClarify 由来の規則維持）。
   */
  semanticMissStreak: number;

  /**
   * provider 失敗連続カウント。`isProviderFailure()` が true の回を加算、
   * 成功で 0 リセット。detail §3 providerRecovery。
   */
  providerFailureStreak: number;

  /** provider 失敗時に UI に表示を維持する plan スナップショット */
  lastGoodPlan: LastGoodPlanSnapshot | null;

  /**
   * PR-9 に渡す query 下書き。focus.slot="where" のとき reducer が更新。
   * 他 slot focus 中も前回の where 情報を保持する（slot 切替後に戻ってきた時の復元用）。
   */
  searchQueryDraft: SearchQueryDraft;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DialogAction — reducer 入力
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * reducer は DialogState を state として、DialogAction を入力として、
 * 次の DialogState を返す pure 関数。
 *
 * commit 13 では action 型のみ定義し、実装は throw する stub（detail §1）。
 * commit 14 で reducer 本実装。
 */
export type DialogAction =
  /**
   * 新ターン入力の取り込み。comprehension 結果 + 発話生片から NormalizedCapture を
   * classify し、focus 更新・narrowStep 遷移・capturedHistory 追記を行う。
   */
  | {
      type: "TURN_CAPTURED";
      turnIndex: number;
      capturedAt: string;
      /** 発話を classify した結果（taxonomy.ts の classifyUtterance 由来） */
      capture: NormalizedCapture;
      /**
       * 対象 event（comprehension が出した event_id）。focus 不在時に focus を張る起点。
       * 既に focus がある場合も、明示的に event が切り替わる場合はこれで上書き。
       */
      targetEventId: string;
      /**
       * 対象 slot（comprehension + gapResolver が今ターンで決めた slot）。
       * 会話全体の focus と一致しない場合もある（slot_switching 判定のため）。
       */
      targetSlot: DialogFocus["slot"];
    }
  /**
   * provider 失敗。conversationStatus → "provider_recovering" に遷移。
   * providerFailureStreak++ / lastGoodPlan は維持。
   * 4 種の失敗条件は detail §3.1 isProviderFailure で集約判定。
   */
  | {
      type: "PROVIDER_FAILED";
      turnIndex: number;
      /** "comprehension_failed" | "empty_items" | "timeout" | "provider_error" */
      reason:
        | "comprehension_failed"
        | "empty_items"
        | "timeout"
        | "provider_error";
    }
  /**
   * provider 復帰成功。conversationStatus を "stable"|"clarifying"|"narrowing" の
   * いずれかに戻す（focus 状態から reducer が決める）。providerFailureStreak = 0。
   * lastGoodPlan は新 events で更新。
   */
  | {
      type: "PROVIDER_RECOVERED";
      turnIndex: number;
      /** 新しい成功 events。lastGoodPlan に格納される */
      events: ReadonlyArray<ComprehensionEvent>;
    }
  /**
   * 明示的な focus 切替（slot_switching）。gapResolver が別 slot を優先判定した場合や、
   * ユーザーが別 event の話題に完全に移った場合に発行。
   */
  | {
      type: "FOCUS_SWITCHED";
      turnIndex: number;
      nextFocus: DialogFocus;
    }
  /**
   * 会話リセット（session migration / 旧 session）。
   * DialogState を初期状態に戻し、capturedHistory を空にする。
   * detail §6 ensureSessionV1 が発行。
   */
  | {
      type: "RESET";
      turnIndex: number;
    };

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Initial State — session 新規作成時
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 新規 session の DialogState 初期値。
 * reducer は全 action でこの初期値から derive 可能な状態遷移のみ行う。
 *
 * 注意: commit 13 の段階では `MorningSession.dialogState` は optional / null。
 * flag false 時はこの初期値すら代入されない（dead code）。
 * flag true 時のみ session.dialogState = createInitialDialogState() で初期化。
 */
export function createInitialDialogState(): DialogState {
  return {
    version: 1,
    focus: null,
    conversationStatus: "stable",
    capturedHistory: [],
    semanticMissStreak: 0,
    providerFailureStreak: 0,
    lastGoodPlan: null,
    searchQueryDraft: {
      anchorRegion: null,
      categoryToken: null,
      chainToken: null,
      readyForHandoff: false,
    },
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Type Guards / 型検査用 util
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** v1 session かどうか（migration 判定用、detail §6） */
export function isDialogStateV1(
  state: DialogState | null | undefined,
): state is DialogState {
  return !!state && state.version === 1;
}

/** search_handoff_blocking に到達可能か（PR-9 起動可否の事前判定） */
export function isSearchHandoffReady(state: DialogState): boolean {
  return state.searchQueryDraft.readyForHandoff === true;
}
