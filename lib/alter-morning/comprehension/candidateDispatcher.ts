/**
 * candidateDispatcher — OP-4 (CEO 2026-05-05)
 *
 * `OperationEnvelope<PlanOperationCandidate>[]` を field 別に reduce する
 * **pure dispatcher**。 採用候補を返すのみで、 PlanState は書かない (= caller 責務)。
 *
 * 設計原則 (CEO 2026-05-05 規律):
 *   - pure function (= async / fetch / Supabase / I/O 一切なし)
 *   - input mutate しない (= shallow copy で sort)
 *   - 同 input で同 output (= deterministic)
 *   - runtime 接続なし (= dispatcher / legacyAdapter / route 不変)
 *
 * Field 別処理:
 *   - set_target_date: payload.date を YYYY-MM-DD 検証 → invalid reject、
 *     valid candidate 0 件 + actualToday valid → system_default 生成
 *   - set_journey_origin / resolve_place_candidate(slot=origin): reducePerField
 *   - set_journey_end / resolve_place_candidate(slot=end): reducePerField
 *   - resolve_place_candidate(slot=where): unhandled_slot_for_op4 で reject
 *   - add_travel_edge: **input order 保持で素通し** (= merge / dedupe / sort なし)
 *
 * Tie-break 4 段階 (reducePerField):
 *   1. priority 降順
 *   2. confidence 降順 (high > medium > low)
 *   3. source 優先順 (ui_action > caller_request > llm_explicit > regex_deterministic
 *      > llm_inferred > code_history > code_location > system_default)
 *   4. stable order (= 元 input 順最後が負け)
 *
 * 重要規律 (= PR #75 / OP-1 不変条件継承):
 *   - segmentOrigin を journeyOrigin に流さない (= filter で構造的分離)
 *   - segmentDestination を journeyEnd に流さない
 *   - plan.date は valid YYYY-MM-DD のみ (= LLM の "today" / "tomorrow" を弾く)
 *   - travel edge は順序自体が意味を持つ → priority sort しない
 *
 * 設計書: docs/alter-morning-operation-pipeline-unification-design.md § 4 / § 5
 */

import type {
  PlanOperationCandidate,
  SetTargetDateOperationCandidate,
  AddTravelEdgeOperationCandidate,
  SetJourneyOriginOperationCandidate,
  SetJourneyEndOperationCandidate,
  ResolvePlaceCandidateOperationCandidate,
} from "./planOperationCandidate";
import type {
  OperationEnvelope,
  OperationSource,
  OperationConfidence,
} from "./operationEnvelope";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Public types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface DispatchInput {
  /** caller (= 後の OP-6 で legacyAdapter) が各 factory を呼んで集約した envelope 集合 */
  candidates: OperationEnvelope<PlanOperationCandidate>[];

  /**
   * 全 set_target_date source unknown 時の system_default fallback で使う基準日。
   * "YYYY-MM-DD" 形式で検証する (= isValidYmd)。 不正なら system_default 生成しない。
   *
   * 重要規律 (CEO 2026-05-05 OP-1 § 4.5):
   *   actualToday は **operation source ではなく date resolution context**。
   *   priority 表に出さない。 ただし全 candidate 不在時に dispatcher が
   *   system_default operation を pipeline 内で生成する際の基準値として使う。
   */
  actualToday: string;
}

/**
 * 採用候補を field 別に返す。
 *
 * 命名規律: `selected...Candidate` (= dispatcher は採用候補を返すだけ、
 * PlanState 反映は caller 責務)。 `set...` 命名は誤解を招くため不採用。
 */
export interface DispatchResult {
  /** plan.date 用採用候補 (= valid YYYY-MM-DD のみ、 全 source unknown 時は system_default) */
  selectedTargetDateCandidate: OperationEnvelope<SetTargetDateOperationCandidate> | null;

  /** plan.journeyOrigin 用採用候補 (= set_journey_origin or resolve_place_candidate(slot=origin)) */
  selectedJourneyOriginCandidate:
    | OperationEnvelope<SetJourneyOriginOperationCandidate>
    | OperationEnvelope<ResolvePlaceCandidateOperationCandidate>
    | null;

  /** plan.journeyEnd 用採用候補 (= set_journey_end or resolve_place_candidate(slot=end)) */
  selectedJourneyEndCandidate:
    | OperationEnvelope<SetJourneyEndOperationCandidate>
    | OperationEnvelope<ResolvePlaceCandidateOperationCandidate>
    | null;

  /**
   * plan.travelEdges[] 用採用候補群。
   *
   * **input order 保持** (= CEO 2026-05-05 規律):
   *   - merge / dedupe しない
   *   - priority sort しない (= travel edge は時系列で意味を持つ)
   *   - 統合 / 重複排除は OP-3C+ travel edge 設計層で扱う
   */
  selectedTravelEdgeCandidates: OperationEnvelope<AddTravelEdgeOperationCandidate>[];

  /**
   * dispatcher が pipeline 内で生成した system_default envelope。
   * 以下の条件で null:
   *   - valid set_target_date candidate が 1 件以上ある
   *   - actualToday が isValidYmd を pass しない
   */
  systemDefaultGenerated: OperationEnvelope<SetTargetDateOperationCandidate> | null;

  /** 採用されなかった envelope の trace */
  rejected: Array<{
    envelope: OperationEnvelope<PlanOperationCandidate>;
    reason: RejectReason;
  }>;
}

/**
 * Reject 理由 (= union 型、 string drift 排除)。
 *
 * - lower_priority:           reduce で priority 負け
 * - lower_confidence:         priority 同値、 confidence 負け
 * - source_tie_break_loser:   priority 同値 + confidence 同値、 source 順負け
 * - stable_order_loser:       全 tie 通過後、 input 順序で負け (deterministic 確保)
 * - unhandled_slot_for_op4:   resolve_place_candidate(slot=where)、 OP-3C+ で対応
 * - invalid_target_date:      set_target_date.payload.date が YYYY-MM-DD でない
 *                             (例: "today" / "tomorrow" / "" / "2026-02-30")
 */
export type RejectReason =
  | "lower_priority"
  | "lower_confidence"
  | "source_tie_break_loser"
  | "stable_order_loser"
  | "unhandled_slot_for_op4"
  | "invalid_target_date";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Internal: Tie-break helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const CONF_RANK: Record<OperationConfidence, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

const SOURCE_ORDER: Record<OperationSource, number> = {
  ui_action: 1,
  caller_request: 2,
  llm_explicit: 3,
  regex_deterministic: 4,
  llm_inferred: 5,
  code_history: 6,
  code_location: 7,
  system_default: 8,
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// reducePerField (= field 別 1 件採用、 残り reject)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * field を書き換える candidate 配列から 1 件の勝者を選ぶ。
 *
 * Tie-break 4 段階:
 *   1. priority 降順
 *   2. confidence 降順
 *   3. source 優先順
 *   4. stable order (= 元 input 順最後が負け)
 *
 * 残りは rejected に分類:
 *   - priority 負け      → "lower_priority"
 *   - confidence 負け    → "lower_confidence"
 *   - source 負け        → "source_tie_break_loser"
 *   - stable order 負け → "stable_order_loser"
 */
function reducePerField<T extends PlanOperationCandidate>(
  envelopes: OperationEnvelope<T>[],
  rejectedOut: Array<{
    envelope: OperationEnvelope<PlanOperationCandidate>;
    reason: RejectReason;
  }>,
): OperationEnvelope<T> | null {
  if (envelopes.length === 0) return null;

  // 元 input 順を保持しつつ stable sort
  const indexed = envelopes.map((env, idx) => ({ env, idx }));
  const sorted = [...indexed].sort((a, b) => {
    if (a.env.priority !== b.env.priority) {
      return b.env.priority - a.env.priority;
    }
    const confA = CONF_RANK[a.env.confidence];
    const confB = CONF_RANK[b.env.confidence];
    if (confA !== confB) return confB - confA;
    const srcA = SOURCE_ORDER[a.env.source];
    const srcB = SOURCE_ORDER[b.env.source];
    if (srcA !== srcB) return srcA - srcB;
    return a.idx - b.idx;
  });

  const winner = sorted[0].env;

  // 残りを rejected に分類
  for (let i = 1; i < sorted.length; i++) {
    const loser = sorted[i].env;
    let reason: RejectReason;
    if (loser.priority < winner.priority) {
      reason = "lower_priority";
    } else if (CONF_RANK[loser.confidence] < CONF_RANK[winner.confidence]) {
      reason = "lower_confidence";
    } else if (SOURCE_ORDER[loser.source] > SOURCE_ORDER[winner.source]) {
      reason = "source_tie_break_loser";
    } else {
      reason = "stable_order_loser";
    }
    rejectedOut.push({ envelope: loser, reason });
  }

  return winner;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Date validation (CEO 2026-05-05 修正 4)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * `s` が YYYY-MM-DD 形式の有効な日付か検証する。
 *
 * 厳密検証:
 *   - regex `/^\d{4}-\d{2}-\d{2}$/` を pass
 *   - Date constructor で valid (= NaN でない)
 *   - 「2026-02-30」 等の正規化により値が変わるパターンを弾く
 *
 * 例:
 *   isValidYmd("2026-05-06") → true
 *   isValidYmd("today")      → false
 *   isValidYmd("tomorrow")   → false
 *   isValidYmd("")           → false
 *   isValidYmd("2026-02-30") → false (= 存在しない日付)
 *   isValidYmd("2026-13-01") → false (= 不正な月)
 */
function isValidYmd(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  if (isNaN(d.getTime())) return false;
  return d.toISOString().slice(0, 10) === s;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// system_default 生成
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function generateSystemDefault(
  actualToday: string,
): OperationEnvelope<SetTargetDateOperationCandidate> {
  return {
    type: "set_target_date",
    payload: { date: actualToday },
    source: "system_default",
    priority: 100,
    confidence: "low",
    provenance: {
      source_type: "inferred",
      source_span: [],
      provenance_confidence: "low",
      from_utterance: false,
    },
    trace: { ruleId: "systemDefault" },
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// processTargetDate (= 修正 1: payload.date 検証 + system_default 検討)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface TargetDateResult {
  selected: OperationEnvelope<SetTargetDateOperationCandidate> | null;
  systemDefault: OperationEnvelope<SetTargetDateOperationCandidate> | null;
}

function processTargetDate(
  candidates: OperationEnvelope<SetTargetDateOperationCandidate>[],
  actualToday: string,
  rejectedOut: Array<{
    envelope: OperationEnvelope<PlanOperationCandidate>;
    reason: RejectReason;
  }>,
): TargetDateResult {
  // 1. 全 candidate を payload.date で検証、 invalid を reject
  const validCandidates: OperationEnvelope<SetTargetDateOperationCandidate>[] = [];
  for (const env of candidates) {
    if (isValidYmd(env.payload.date)) {
      validCandidates.push(env);
    } else {
      rejectedOut.push({ envelope: env, reason: "invalid_target_date" });
    }
  }

  // 2. valid candidate 0 件 → system_default 検討
  let systemDefault: OperationEnvelope<SetTargetDateOperationCandidate> | null = null;
  if (validCandidates.length === 0 && isValidYmd(actualToday)) {
    systemDefault = generateSystemDefault(actualToday);
  }

  // 3. valid candidates + system_default で reducePerField
  const allCandidates = systemDefault
    ? [...validCandidates, systemDefault]
    : validCandidates;
  const selected = reducePerField(allCandidates, rejectedOut);

  return { selected, systemDefault };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// selectTravelEdgeCandidates (= 修正 2: input order 保持で素通し)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * `add_travel_edge` candidate を **input order 保持で素通し**する。
 *
 * CEO 2026-05-05 規律:
 *   - merge / dedupe しない
 *   - priority sort しない (= travel edge は時系列で意味を持つ、 並び替えると壊れる)
 *   - 統合 / 重複排除は OP-3C+ travel edge 設計層で扱う
 *
 * 実装は shallow copy のみ (= caller の input mutate 防止 + 元 order 保持)。
 */
function selectTravelEdgeCandidates(
  envelopes: OperationEnvelope<AddTravelEdgeOperationCandidate>[],
): OperationEnvelope<AddTravelEdgeOperationCandidate>[] {
  return [...envelopes];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main entry: dispatchCandidates (= public)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * `OperationEnvelope<PlanOperationCandidate>[]` を field 別に reduce する pure dispatcher。
 *
 * 動作:
 *   1. type 別 filter (= add_travel_edge / set_target_date / set_journey_origin /
 *      set_journey_end / resolve_place_candidate を slot 別)
 *   2. resolve_place_candidate(slot=where) を unhandled_slot_for_op4 で reject
 *   3. set_target_date を processTargetDate で検証 + reduce + system_default
 *   4. journey origin / end を reducePerField で勝者選定
 *   5. add_travel_edge は input order 保持で素通し
 *
 * @param input candidates (= 全 source からの envelope 集合) + actualToday
 * @returns DispatchResult (= 採用候補 + system_default + rejected trace)
 */
export function dispatchCandidates(input: DispatchInput): DispatchResult {
  const rejected: Array<{
    envelope: OperationEnvelope<PlanOperationCandidate>;
    reason: RejectReason;
  }> = [];

  // === 1. type 別 filter ===

  const targetDateCandidates: OperationEnvelope<SetTargetDateOperationCandidate>[] = [];
  const travelEdgeCandidates: OperationEnvelope<AddTravelEdgeOperationCandidate>[] = [];
  const journeyOriginCandidates: Array<
    | OperationEnvelope<SetJourneyOriginOperationCandidate>
    | OperationEnvelope<ResolvePlaceCandidateOperationCandidate>
  > = [];
  const journeyEndCandidates: Array<
    | OperationEnvelope<SetJourneyEndOperationCandidate>
    | OperationEnvelope<ResolvePlaceCandidateOperationCandidate>
  > = [];

  for (const env of input.candidates) {
    if (env.type === "set_target_date") {
      targetDateCandidates.push(env);
    } else if (env.type === "add_travel_edge") {
      travelEdgeCandidates.push(env);
    } else if (env.type === "set_journey_origin") {
      journeyOriginCandidates.push(env);
    } else if (env.type === "set_journey_end") {
      journeyEndCandidates.push(env);
    } else if (env.type === "resolve_place_candidate") {
      if (env.payload.slot === "origin") {
        journeyOriginCandidates.push(env);
      } else if (env.payload.slot === "end") {
        journeyEndCandidates.push(env);
      } else {
        // slot === "where" → OP-4 では未対応 (= OP-3C+ で events[i].where 反映時)
        rejected.push({ envelope: env, reason: "unhandled_slot_for_op4" });
      }
    }
    // 注: PlanOperationCandidate の type 列挙は完全 (= 5 種)、 上記 if-else で全部 cover。
    //     新 type が追加されたら TypeScript exhaustiveness で気付ける。
  }

  // === 2. set_target_date 処理 (= 修正 1: payload.date 検証 + system_default) ===

  const { selected: selectedTargetDateCandidate, systemDefault: systemDefaultGenerated } =
    processTargetDate(targetDateCandidates, input.actualToday, rejected);

  // === 3. journey origin / end は reducePerField で勝者選定 ===

  const selectedJourneyOriginCandidate = reducePerField(
    journeyOriginCandidates,
    rejected,
  );
  const selectedJourneyEndCandidate = reducePerField(journeyEndCandidates, rejected);

  // === 4. add_travel_edge は input order 保持で素通し (= 修正 2) ===

  const selectedTravelEdgeCandidates = selectTravelEdgeCandidates(travelEdgeCandidates);

  return {
    selectedTargetDateCandidate,
    selectedJourneyOriginCandidate,
    selectedJourneyEndCandidate,
    selectedTravelEdgeCandidates,
    systemDefaultGenerated,
    rejected,
  };
}
