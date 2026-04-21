/**
 * L2.1 Gap Resolver — Comprehension-First v1.3+ Wave 1
 *
 * 設計書: docs/alter-morning-comprehension-first-v1.3plus.md §3.1
 *
 * 責務:
 *   - Event[] の欠損を semantic / solver_blocker 2 系統で解析
 *   - clarify 戦略を決定する（「何時頃？」「朝・昼・夜？」等）
 *   - L2.2 Time Solver / L2.3 Place Grounder へ委譲するか、ユーザに clarify 戻すかを判定
 *
 * 戦略（設計書 §3.1）:
 *   per event:
 *     |semantic| >= 2  → 粗 time bucket clarify（「朝・昼・夜どれ？」）
 *     semantic==["when"]  → 「何時頃？」
 *     semantic==["where"] → L2.3 Place Grounder へ defer（clarify せず）
 *     semantic==["what"]  → 「何する予定？」
 *     |semantic|==0 & blockers: Solver 内部で解決試行、2+ tentative 連鎖時のみ clarify
 *
 * 純関数。副作用なし。LLM 呼び出しなし。
 */

import type {
  Event,
  SemanticCriticalSlot,
  SolverBlocker,
} from "../comprehension/eventSchema";
import { buildClarifyQuestion } from "./clarifyQuestionBuilder";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * clarify の種類（発話テンプレ選択用）。
 */
export type ClarifyKind =
  | "coarse_time_bucket"    // |semantic|≥2: 朝・昼・夜どれ？
  | "specific_time"         // semantic==["when"]: 何時頃？
  | "activity"              // semantic==["what"]: 何する予定？
  | "tentative_chain"       // tentative が連鎖（Q1-A' 条件）
  | "target_ref_low"        // target_ref_confidence=low
  | "transport"             // solver_blocker: transport
  | "endpoint";             // solver_blocker: endpoint / end_time

export interface ClarifyRequest {
  event_id: string;
  kind: ClarifyKind;
  /** クリア対象 slot（clarify 後の応答をどこに書くか） */
  target_slot: SemanticCriticalSlot | SolverBlocker | "target_ref";
  /** テンプレで使うメタ情報 */
  hint?: string;
  /**
   * ユーザーに戻す日本語質問文（rule-based 生成、Wave 3 W3-PR-1）。
   * resolveGaps 時に buildClarifyQuestion で自動生成される。
   */
  question: string;
}

export type GapAction =
  | { type: "defer_to_place_grounder"; event_id: string }
  | { type: "defer_to_time_solver"; event_id: string }
  | { type: "pass_through"; event_id: string }
  | { type: "clarify"; request: ClarifyRequest };

export interface GapResolution {
  /** event_id → Action */
  actions: GapAction[];
  /** 全体で最優先の clarify (UI に 1 件だけ戻す時の選択) */
  primary_clarify: ClarifyRequest | null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Event 単体判定
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * tentative 連鎖カウント: 当 event を含めて前後で tentative が 2+ 連続しているか。
 */
function hasTentativeChain(events: Event[], idx: number): boolean {
  const cur = events[idx];
  if (cur.certainty !== "tentative") return false;
  const prev = events[idx - 1];
  const next = events[idx + 1];
  if (prev && prev.certainty === "tentative") return true;
  if (next && next.certainty === "tentative") return true;
  return false;
}

/**
 * ClarifyRequest を組み立てる internal helper。
 * question フィールドを rule-based builder で自動付与する（Wave 3 W3-PR-1）。
 */
function mkClarify(
  req: Omit<ClarifyRequest, "question">,
): GapAction {
  const question = buildClarifyQuestion({ kind: req.kind, hint: req.hint });
  return { type: "clarify", request: { ...req, question } };
}

export function resolveEventGap(
  ev: Event,
  ctx: { events: Event[]; index: number },
): GapAction {
  // Turn 2+ modify: target_ref_confidence=low は最優先 clarify
  if (ev.turn_mode === "modify" && ev.target_ref_confidence === "low") {
    return mkClarify({
      event_id: ev.event_id,
      kind: "target_ref_low",
      target_slot: "target_ref",
      hint: ev.target_ref ?? undefined,
    });
  }

  const sem = ev.missing_semantic_critical;
  const blk = ev.missing_solver_blockers;

  // |semantic| >= 2 → 粗 time bucket
  if (sem.length >= 2) {
    return mkClarify({
      event_id: ev.event_id,
      kind: "coarse_time_bucket",
      target_slot: "when",
      hint: ev.what.activity || ev.what.activityCanonical || undefined,
    });
  }

  // semantic==["when"]
  if (sem.length === 1 && sem[0] === "when") {
    return mkClarify({
      event_id: ev.event_id,
      kind: "specific_time",
      target_slot: "when",
      hint: ev.what.activity || ev.what.activityCanonical || undefined,
    });
  }

  // semantic==["where"] → Place Grounder へ defer
  if (sem.length === 1 && sem[0] === "where") {
    return {
      type: "defer_to_place_grounder",
      event_id: ev.event_id,
    };
  }

  // semantic==["what"]
  if (sem.length === 1 && sem[0] === "what") {
    return mkClarify({
      event_id: ev.event_id,
      kind: "activity",
      target_slot: "what",
      hint: ev.where.place_ref ?? undefined,
    });
  }

  // semantic==0: solver_blockers を見る
  if (sem.length === 0) {
    // tentative 連鎖チェック（Q1-A' 条件）
    if (hasTentativeChain(ctx.events, ctx.index)) {
      return mkClarify({
        event_id: ev.event_id,
        kind: "tentative_chain",
        target_slot: "when",
        hint:
          ev.target_ref ??
          ev.what.activity ??
          ev.what.activityCanonical ??
          undefined,
      });
    }

    if (blk.length === 0) {
      return { type: "pass_through", event_id: ev.event_id };
    }

    // blocker が transport だけ: Time Solver で transport 推定で済むので defer
    if (blk.length === 1 && blk[0] === "transport") {
      return { type: "defer_to_time_solver", event_id: ev.event_id };
    }

    // blocker に place_resolution が含まれる: Place Grounder へ defer
    if (blk.includes("place_resolution")) {
      return { type: "defer_to_place_grounder", event_id: ev.event_id };
    }

    // blocker に endpoint / end_time が含まれる: clarify
    if (blk.includes("endpoint") || blk.includes("end_time")) {
      return mkClarify({
        event_id: ev.event_id,
        kind: "endpoint",
        target_slot: "endpoint",
        hint: ev.what.activity || ev.what.activityCanonical || undefined,
      });
    }

    // それ以外（transport 複合等）: transport clarify
    return mkClarify({
      event_id: ev.event_id,
      kind: "transport",
      target_slot: "transport",
      hint: ev.where.place_ref ?? undefined,
    });
  }

  // 到達し得ない（sem.length が負になることはない）
  return { type: "pass_through", event_id: ev.event_id };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 全 Events 解析 + primary clarify 選択
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * clarify kind の優先度。UI に戻す 1 件を選ぶときに使う。
 * 数値が小さいほど優先。
 */
const CLARIFY_PRIORITY: Record<ClarifyKind, number> = {
  target_ref_low: 0,       // 最優先（modify の曖昧さ）
  coarse_time_bucket: 1,   // |semantic|≥2
  specific_time: 2,
  activity: 3,
  tentative_chain: 4,
  endpoint: 5,
  transport: 6,
};

export function resolveGaps(events: Event[]): GapResolution {
  const actions: GapAction[] = events.map((ev, index) =>
    resolveEventGap(ev, { events, index }),
  );

  let primary: ClarifyRequest | null = null;
  let primaryScore = Infinity;
  for (const a of actions) {
    if (a.type === "clarify") {
      const score = CLARIFY_PRIORITY[a.request.kind] ?? 99;
      if (score < primaryScore) {
        primary = a.request;
        primaryScore = score;
      }
    }
  }

  return { actions, primary_clarify: primary };
}
