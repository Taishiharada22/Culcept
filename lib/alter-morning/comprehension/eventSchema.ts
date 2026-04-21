/**
 * L1 Event Schema — Comprehension-First v1.3+ Wave 1
 *
 * 設計書: docs/alter-morning-comprehension-first-v1.3plus.md §2
 *
 * 位置づけ:
 *   L1 Comprehension 層の出力 = Event[]。発話を provenance 付き 5W1H+ に畳んだもの。
 *   既存 LLMRawSegment / LLMExtractResult とは別レイヤ（並行存在、Wave 1 では
 *   新レイヤが L1 の正規出力となる。旧型は adapter で相互変換）。
 *
 * 設計原則:
 *   - Provenance を schema 必須に持ち上げ、hallucinate を checker で弾ける構造にする
 *   - 欠損を semantic / solver_blocker 2 系統に分離し clarify 戦略を精緻化する
 *   - Turn 2+ の modify を target_ref + change_scope で明示化する
 *   - L1 LLM は内部 ID を扱わない。target_ref は自然言語ヒント。L2 で解決
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Provenance — slot の根拠情報
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * slot の由来タイプ。
 *
 * - "utterance": ユーザ発話に根拠文字列が存在する
 * - "baseline":  baseline（プロフィール/過去 plan/辞書）から引いた
 * - "inferred":  LLM が文脈から推論した（発話根拠なし）
 * - "tool":      外部 tool（Places API 等）から取得した
 *
 * L1 LLM が "utterance" を申告しても、L1.2 checker が source_span を
 * deterministic に検査して実在確認する。嘘の "utterance" は "inferred" に降格。
 */
export type ProvenanceSource = "utterance" | "baseline" | "inferred" | "tool";

export type ProvenanceConfidence = "low" | "medium" | "high";

export interface Provenance {
  source_type: ProvenanceSource;
  /**
   * 発話内の根拠文字列（正規化前の生片）。
   * source_type="utterance" 時は必須。他の source_type では空配列可。
   *
   * 例: place="サドヤ" source_type="utterance" source_span=["サドヤ"]
   */
  source_span: string[];
  provenance_confidence: ProvenanceConfidence;
  /**
   * 後方互換フラグ。source_type === "utterance" と等価。
   * 既存 triage コード（isPlaceFromUserUtterance）からの移行用。
   */
  from_utterance: boolean;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Slot values (provenance 付き wrappers)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type TimeHintValue = "morning" | "noon" | "afternoon" | "evening";

export interface WhenSlot {
  /** "HH:mm" 形式 or null */
  startTime: string | null;
  timeHint: TimeHintValue | null;
  provenance: Provenance;
}

export interface WhereSlot {
  /**
   * place_ref = 記号。L2.3 Place Grounder 到達まで実 place ではない。
   * 例: "サドヤ" / "マック" / "自宅" / null
   */
  place_ref: string | null;
  placeType: string | null;
  provenance: Provenance;
}

export interface WhatSlot {
  activity: string;
  activityCanonical: string;
  provenance: Provenance;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Event — L1 出力の中核単位
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * create: 新規予定の追加
 * modify: 既存予定の変更
 */
export type TurnMode = "create" | "modify";

/**
 * modify 時の change_scope。change の粒度を schema に持ち上げる。
 *
 * - replace: slot 丸ごと差し替え（「朝はマックに変更」）
 * - patch:   slot の一部だけ上書き（「時間を10時に」）
 * - append:  リストに追加（「同行者に田中を追加」）
 * - remove:  slot 削除（「場所未定に戻す」）
 */
export type ChangeScope = "replace" | "patch" | "append" | "remove";

/**
 * 意味理解層の欠損。clarify 対象。
 */
export type SemanticCriticalSlot = "when" | "where" | "what";

/**
 * 計画層の blocker。Solver が解けるか／clarify が必要か判定対象。
 */
export type SolverBlocker =
  | "transport"
  | "end_time"
  | "endpoint"
  | "place_resolution";

/**
 * slot の確度。tentative は "〜あたり" のような揺れた言及。
 * Solver はこれを plan graph に入れてよい（v1.3+ Q1-A' 決定）が、
 * narration で必ず揺らす。confirmed への昇格は禁止。
 */
export type Certainty = "asserted" | "tentative" | "inferred";

export interface Event {
  /** L1 内で発番する安定 ID（Wave 1 では event_N 形式） */
  event_id: string;

  turn_mode: TurnMode;

  /**
   * modify 時に、どの既存 event を指しているかの自然言語ヒント。
   * 例: "朝の予定" / "ランチ" / "最後の予定"
   * L1 LLM は内部 ID を扱わない（hallucinate 回避）。L2 modify router が解決する。
   *
   * turn_mode="create" の場合は null。
   */
  target_ref: string | null;

  /**
   * target_ref の解決確度。low の場合、L2.1 Gap Resolver は置き換え確定せず clarify。
   */
  target_ref_confidence: ProvenanceConfidence | null;

  /** modify 時の change_scope。turn_mode="create" の場合は null。 */
  change_scope: ChangeScope | null;

  when: WhenSlot;
  where: WhereSlot;
  what: WhatSlot;

  /** 同行者。省略可。critical には入れない（設計書 §2.3）。 */
  who: string[];

  /** 移動手段。省略可。solver_blocker には入り得る。 */
  transport: string | null;

  certainty: Certainty;

  /**
   * 意味理解の欠損。when/where/what に限定。
   * L1.2 checker / L2.1 Gap Resolver が書き込む。
   */
  missing_semantic_critical: SemanticCriticalSlot[];

  /**
   * Solver 側の blocker。transport / end_time / endpoint / place_resolution。
   * L2.1 / L2.2 / L2.3 が書き込む。
   */
  missing_solver_blockers: SolverBlocker[];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Comprehension Result — L1 全体の出力
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface ComprehensionResult {
  /** L1 が抽出した events */
  events: Event[];
  /** 全体の targetDate（today / tomorrow / YYYY-MM-DD） */
  targetDate: string;
  /** 全体の出発地点（provenance 付き） */
  startPoint: {
    place_ref: string | null;
    provenance: Provenance;
  } | null;
  /** 全体の出発時刻 "HH:mm" */
  departureTime: {
    value: string | null;
    provenance: Provenance;
  } | null;
  /** goOut フラグ */
  goOut: boolean | null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Event ID 生成
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

let _eventCounter = 0;

export function generateEventId(): string {
  _eventCounter += 1;
  return `event_${_eventCounter}`;
}

/** テスト用: カウンターをリセット */
export function resetEventCounter(): void {
  _eventCounter = 0;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers: Provenance 構築 shortcuts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function utteranceProvenance(
  spans: string[],
  confidence: ProvenanceConfidence = "high",
): Provenance {
  return {
    source_type: "utterance",
    source_span: spans,
    provenance_confidence: confidence,
    from_utterance: true,
  };
}

export function baselineProvenance(
  confidence: ProvenanceConfidence = "medium",
): Provenance {
  return {
    source_type: "baseline",
    source_span: [],
    provenance_confidence: confidence,
    from_utterance: false,
  };
}

export function inferredProvenance(
  confidence: ProvenanceConfidence = "low",
): Provenance {
  return {
    source_type: "inferred",
    source_span: [],
    provenance_confidence: confidence,
    from_utterance: false,
  };
}

export function toolProvenance(
  confidence: ProvenanceConfidence = "high",
): Provenance {
  return {
    source_type: "tool",
    source_span: [],
    provenance_confidence: confidence,
    from_utterance: false,
  };
}
