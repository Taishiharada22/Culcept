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

// W3-PR-9: 地理座標は normalizedPlace.ts で reserved 済み（commit 13）。
// LLM は生成しない。Places API tool 層で user 選択時に注入する設計。
import type { GeoCoordinates } from "../search/normalizedPlace";

export type { GeoCoordinates };

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
  /**
   * 地理座標。W3-PR-9: Places Search で user 選択後に tool 層が注入。
   * LLM からは必ず undefined/null（invent 禁止）。未解決時も null。
   *
   * 型は optional (undefined 許容) だが、L1 Pipeline の attachEventId で
   * 必ず null に正規化される。consumers は `coordinates ?? null` で扱う。
   * 既存テスト fixture との後方互換のため optional にしている。
   */
  coordinates?: GeoCoordinates | null;
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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SlotSharpness — W3-PR-7 三層判定の正本（derived pure function）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 設計書: docs/alter-morning-comprehension-first-wave3-pr7-design.md §3
//
// sharpness は slot 値から都度計算する pure function として実装する。
// Event schema に永続フィールドは**追加しない**。理由:
//   - 単一真実源: raw slot 値（startTime / place_ref / activity 等）のみが正本。
//     sharpness を field 化すると「更新し忘れ」バグの温床になる
//   - 保守容易: 既存テスト fixture を一切書き換えずに済む
//   - 計算コスト: slot 3 つの sharpness 判定は O(1) × 3。実行コスト無視可能
//
// 設計原則:
//   - missing_semantic_critical（二値: 存在/不在）とは別概念。sharpness は三値
//   - vague を missing に混ぜない（CEO 方針 2026-04-22）
//   - chain_brand は **原則 vague 固定**（「スタバ」だけでは支店確定せず）
//   - VAGUE_ACTIVITY_SET は保守的に（誤爆より漏れを許容）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type SlotSharpness = "fixed" | "vague" | "missing";

/**
 * 汎用的で具体性に欠ける活動語。activity / activityCanonical が
 * これらに一致する（trim 後、大小文字無視）場合 What は vague 扱い。
 *
 * CEO 承認 2026-04-22: 「仕事」「作業」「用事」「予定」「もろもろ」「雑務」「タスク」。
 * Wave 4+ で category default（リモート/会議/作業）を引けるようにする段階的拡張を想定。
 */
export const VAGUE_ACTIVITY_SET: ReadonlySet<string> = new Set([
  "仕事",
  "作業",
  "用事",
  "予定",
  "もろもろ",
  "雑務",
  "タスク",
]);

/**
 * HH:mm 形式の簡易検証（"09:00" / "23:59" 等）。
 */
function isHHmm(s: string | null | undefined): boolean {
  if (!s) return false;
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

/**
 * When の sharpness:
 *   - fixed:   startTime が "HH:mm" にマッチ
 *   - vague:   startTime null かつ timeHint != null
 *   - missing: 両方 null
 */
export function computeWhenSharpness(when: WhenSlot): SlotSharpness {
  if (isHHmm(when.startTime)) return "fixed";
  if (when.timeHint != null) return "vague";
  return "missing";
}

/**
 * Where の sharpness:
 *   - missing: place_ref null
 *   - fixed:   placeType が exact_proper_noun / known_base
 *   - vague:   chain_brand / generic_place / null placeType（それ以外）
 *
 * CEO 明示 2026-04-22: chain_brand は auto-grounding が resolved を返しても
 * sharpness 計算上は vague のまま。fixed 昇格は以下の 2 経路のみ:
 *   1. user 確認済みで grounded.status=resolved かつ candidates==1（Gate は別層で）
 *   2. user が支店を明示（placeType=exact_proper_noun へ昇格）
 *
 * ここは slot 値のみを見る純関数なので、grounded は参照しない。
 */
export function computeWhereSharpness(where: WhereSlot): SlotSharpness {
  if (where.place_ref == null || where.place_ref.trim() === "") return "missing";
  if (where.placeType === "exact_proper_noun") return "fixed";
  if (where.placeType === "known_base") return "fixed";
  return "vague";
}

/**
 * What の sharpness:
 *   - missing: activity が null or 空文字
 *   - vague:   activity / activityCanonical が VAGUE_ACTIVITY_SET に一致
 *   - fixed:   それ以外
 */
export function computeWhatSharpness(what: WhatSlot): SlotSharpness {
  const a = (what.activity ?? "").trim();
  if (!a) return "missing";
  const canon = (what.activityCanonical ?? "").trim();
  if (VAGUE_ACTIVITY_SET.has(a)) return "vague";
  if (canon && VAGUE_ACTIVITY_SET.has(canon)) return "vague";
  return "fixed";
}
