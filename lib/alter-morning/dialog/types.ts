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
import type { NormalizedPlaceCandidate } from "../search/normalizedPlace";

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
 * - search_candidates_presented: PR-9 が候補を提示した直後（user の selection 待ち）
 * - slot_switching:         別 slot に focus 移動中
 * - provider_recovering:    LLM / Places API 失敗後の lastGoodPlan 継続状態
 *
 * 遷移許可表（PR-9 commit 2 で拡張）:
 *   - stable        → clarifying | narrowing | provider_recovering
 *   - clarifying    → stable | narrowing | slot_switching | search_handoff_blocking | provider_recovering
 *   - narrowing     → narrowing | search_handoff_blocking | clarifying | slot_switching | stable | provider_recovering
 *   - search_handoff_blocking → search_candidates_presented | clarifying (zero-cand) | slot_switching | provider_recovering
 *   - search_candidates_presented → stable (selected) | clarifying (どれでもない) | slot_switching | provider_recovering
 *   - slot_switching → clarifying | narrowing | stable | provider_recovering
 *   - provider_recovering → clarifying | narrowing | stable (フェーズ権威より先に評価)
 */
export type ConversationStatus =
  | "stable"
  | "clarifying"
  | "narrowing"
  | "search_handoff_blocking"
  | "search_candidates_presented"
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
// Presentation Context — PR-9 で提示した候補集合のスナップショット
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * PR-9 が Places API から取得した候補を user に提示した時点のスナップショット。
 *
 * `queryFingerprint` は (anchorRegion, chainToken, categoryToken) を正規化した
 * hash 相当の識別子。SELECTED action が stale か（draft が変わった後の古い
 * selection か）判定するために reducer が使う。
 *
 * `activePresentation` = 現在 user に見えている候補集合（1 つだけ）。
 * `parkedPresentations` = 過去に提示済みで別 slot/event に focus が移った際に
 *   state として保持するだけの履歴（α' 方針: PR-9 では自動復帰しない、
 *   UI/NLU 復帰は PR-9.5 以降）。LRU 最大 3 件。
 *
 * targetEventId は「この候補がどの event の where slot 向けか」を固定する。
 * 別 event に focus が移った場合は activePresentation → parkedPresentations に
 * 退避する（reducer 不変条件）。
 */
/**
 * CEO/GPT 2026-05-03 PR B-3b 確定: presentation target の discriminated union。
 *
 * fake event を作って origin/end を event.where に偽装する誘惑を構造的に防ぐため、
 * plan-level anchor を type-level で区別する。
 *
 * 3 種:
 *   - "event_where":    既存 (W3-PR-9) — event の where slot 解決
 *   - "journey_origin": B-3 で導入 — plan-level origin の grounding
 *   - "journey_end":    B-3 で導入 — plan-level end の grounding
 *
 * backward compat (CEO 2026-05-03 確定):
 *   - PresentationContext.target は optional
 *   - 旧 session で target が無い場合、targetEventId から event_where と推定
 *   - target 必須化 / targetEventId 即時削除はしない
 *   - B-3d の type-level 分離時に統一を検討
 */
export type PresentationTarget =
  | { kind: "event_where"; eventId: string }
  | { kind: "journey_origin" }
  | { kind: "journey_end" };

export interface PresentationContext {
  /**
   * 対象 event（ComprehensionEvent.event_id）。
   *
   * 既存 W3-PR-9 で必須 field として導入。
   * B-3b で `target?` を追加したが、backward compat のため本 field は残す。
   * 旧 session / 旧 payload は本 field から `{ kind: "event_where", eventId }`
   * と推定される (`getPresentationTarget` 経由)。
   *
   * journey_origin / journey_end target の場合は sentinel
   * (PLAN_ORIGIN_SENTINEL_EVENT_ID 等) を入れる暫定対応。B-3d で型分離時に
   * targetEventId 自体の必要性を再検討する。
   */
  targetEventId: string;
  /**
   * CEO/GPT 2026-05-03 PR B-3b: discriminated union による target 識別。
   *
   * 不変条件:
   *   - 新コード経路では target を必須として扱う (= getPresentationTarget で resolve)
   *   - 旧 session で target が無い場合、targetEventId から event_where と fallback
   *   - target.kind === "event_where" のときのみ targetEventId が意味を持つ
   *   - target.kind === "journey_origin" / "journey_end" のときは
   *     targetEventId は sentinel (= 旧 sentinel との互換維持)
   */
  target?: PresentationTarget;
  /**
   * 当時の searchQueryDraft を要約した指紋。
   * reducer は payload で渡された値をそのまま保存し、比較時は厳密一致で判定。
   * 構造は外部（placesHandoff）の責務。
   */
  queryFingerprint: string;
  /** 提示した候補（UI がそのまま描画できる NormalizedPlaceCandidate の配列） */
  candidates: ReadonlyArray<NormalizedPlaceCandidate>;
  /** 提示ターン（analytics / stale 判定の補助） */
  presentedAtTurn: number;
}

/**
 * PresentationContext から PresentationTarget を取得する helper (PR B-3b)。
 *
 * 旧 session / 旧 payload で target が無い場合、targetEventId から
 * `{ kind: "event_where", eventId }` を構築する (= backward compat)。
 *
 * 不変条件:
 *   - target があれば常にそれを返す
 *   - target が無く targetEventId が空文字 → 防御的に event_where + ""
 *     (= caller 側で targetEventId 必須を validate しているため通常起きない)
 *
 * @param ctx PresentationContext
 * @returns 解決済 PresentationTarget
 */
export function getPresentationTarget(
  ctx: Pick<PresentationContext, "target" | "targetEventId">,
): PresentationTarget {
  if (ctx.target) return ctx.target;
  return { kind: "event_where", eventId: ctx.targetEventId };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Last Failed Search — zero_candidates 時の失敗理由メモ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * zero_candidates（Places API 結果 0 件）発生時に reducer が set する失敗メモ。
 *
 * 目的:
 *   - E3 (copy 強化) + E1 (state: drop failed spec + keep anchor) を両立させるため
 *     「何で失敗したか」を reducer 側で保持し、次 turn の route.ts が
 *     `「{anchor} で {chain} 見つからなかった、{category} に広げる？」` のような
 *     穏やかな re-guidance copy を生成できるようにする。
 *   - 無限ループ防止: readyForHandoff は false に戻した上で、次 turn の draft 更新で
 *     同じ failedChainToken / failedCategoryToken が再捕捉されたとしても
 *     route.ts が fingerprint 比較で抑止できる（将来拡張、commit 2 範囲外）。
 *
 * null の場合は「未失敗 or 成功後にクリア済み」。
 */
export interface LastFailedSearch {
  /** 失敗検出ターン */
  turnIndex: number;
  /** 失敗時に使っていた anchor（空文字不可、空なら record を作らない） */
  anchorRegion: string;
  /** 失敗時に使っていた category（chain が使われていた場合は null） */
  failedCategoryToken: string | null;
  /** 失敗時に使っていた chain（category が使われていた場合は null） */
  failedChainToken: string | null;
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

  /**
   * PR-9 commit 2 追加 — 現在 user に見えている候補集合（1 つだけ）。
   * null は「今は候補を提示していない」。
   *
   * set される契機: SEARCH_CANDIDATES_PRESENTED（search_handoff_blocking からの遷移）
   * clear される契機:
   *   - SEARCH_CANDIDATE_SELECTED 成功
   *   - SEARCH_ZERO_CANDIDATES（再探索で 0 件に戻った）
   *   - PROVIDER_FAILED
   *   - FOCUS_SWITCHED / TURN_CAPTURED による focus 切替 → parkedPresentations に退避
   */
  activePresentation: PresentationContext | null;

  /**
   * 過去に提示して focus 切替で退避させた presentation の履歴（LRU 最大 3 件、
   * 新しい順）。α' 方針により **PR-9 では自動復帰させない**。state 保持のみ、
   * UI/NLU 復帰は PR-9.5 以降で検討。
   */
  parkedPresentations: ReadonlyArray<PresentationContext>;

  /**
   * PR-9 commit 2 追加 — 直近の zero_candidates 失敗メモ。
   * 次 turn の route.ts が re-guidance copy 生成時に参照。
   * 成功（SEARCH_CANDIDATE_SELECTED）時は null に戻す。
   */
  lastFailedSearch: LastFailedSearch | null;

  /**
   * PR-9 commit 2 追加 — zero_candidates が連続で発生した回数。
   * SEARCH_CANDIDATE_SELECTED 成功 / focus 切替で 0 リセット。
   *
   * S9 方針（CEO 2026-04-23）:
   *   - 3 を超えても conversationStatus は clarifying のまま維持する（焦点を自動で
   *     別 slot / 別 event に移さない）。
   *   - route.ts 側が本 count を参照して copy を強める（「別のチェーンで探す？」
   *     「もう少し広いエリアで探す？」）。
   *   - reducer は count を進める責務のみ、policy は外に出す。
   */
  zeroCandidateMissCount: number;
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
      /**
       * pre-comprehended where からの seed capture（PR-12 最小根治）。
       *
       * 位置づけ:
       *   focus が前 event から新 event に切り替わった瞬間（`eventChanged=true` + `isWhereSlot`）に、
       *   新 event が既に持つ `event.where.place_ref` を classify した NormalizedCapture を
       *   draft 再構築の seed として渡すためのフィールド。ユーザー発話 (capture) が
       *   area-only / category-only でも、seed に anchor / chain / category が既に載っていれば
       *   merge 後に `readyForHandoff=true` へ到達しやすくなる。
       *
       * 責務範囲:
       *   - shadowPipeline が `isWhereSlot && eventChanged` 時のみ `classifyUtterance(event.where.place_ref)` を詰める
       *   - 上記以外（slot=when/what / eventChanged=false）では `null` または省略
       *   - reducer は `eventChanged` branch で seed → capture の順に merge する（capture 優先、seed は底上げ）
       *
       * 非責務:
       *   - `event.where.placeType` raw を categoryToken に流用すること（語彙空間不一致のため不採用、別 PR 候補）
       *   - placeTable 解決 / canonicalId 発番（別レイヤ）
       */
      seedCapture?: NormalizedCapture | null;
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
   * PR-9 commit 2 追加 — Places API から候補が返った。
   * conversationStatus: search_handoff_blocking → search_candidates_presented
   * activePresentation を新規 set する。
   *
   * reducer 責務:
   *   - prev.conversationStatus が search_handoff_blocking（or self）以外なら throw
   *   - prev.focus.slot が "where" でないなら throw
   *   - candidates.length === 0 なら throw（zero は SEARCH_ZERO_CANDIDATES 経由）
   */
  | {
      type: "SEARCH_CANDIDATES_PRESENTED";
      turnIndex: number;
      targetEventId: string;
      queryFingerprint: string;
      candidates: ReadonlyArray<NormalizedPlaceCandidate>;
    }
  /**
   * PR-9 commit 2 追加 — user が picker で候補 1 つを選択した。
   *
   * S8 方針（CEO 2026-04-23）— throw 禁止、reject/no-op で受け流す:
   *   - prev.activePresentation === null（presentation なし）
   *   - prev.conversationStatus === "provider_recovering"（復帰中の選択）
   *   - targetEventId が activePresentation と不一致（別 event 選択）
   *   - queryFingerprint が不一致（stale selection）
   *   - selectedPlaceId が activePresentation.candidates に無い
   *   いずれも reducer は prev state を返す（UI 側の gentle re-guidance で対処）。
   *
   * payload には selectedPlaceId のみ（NOT full candidate）。CEO 不変条件:
   *   reducer / route.ts が saved candidates から lookup して upgrade する。
   *   client からの coordinates 偽装を構造的に禁止する。
   */
  | {
      type: "SEARCH_CANDIDATE_SELECTED";
      turnIndex: number;
      targetEventId: string;
      queryFingerprint: string;
      selectedPlaceId: string;
    }
  /**
   * PR-9 commit 2 追加 — Places API 結果が 0 件だった。
   * conversationStatus: search_handoff_blocking → clarifying
   * narrowStep: 2 → 1（explicit rollback）
   * lastFailedSearch を set / zeroCandidateMissCount++
   * searchQueryDraft は anchor を保持し category/chain を drop（readyForHandoff は false に）
   */
  | {
      type: "SEARCH_ZERO_CANDIDATES";
      turnIndex: number;
      targetEventId: string;
      queryFingerprint: string;
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
    activePresentation: null,
    parkedPresentations: [],
    lastFailedSearch: null,
    zeroCandidateMissCount: 0,
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
