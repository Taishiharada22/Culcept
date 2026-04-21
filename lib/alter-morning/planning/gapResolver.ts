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
import {
  computeWhenSharpness,
  computeWhereSharpness,
  computeWhatSharpness,
} from "../comprehension/eventSchema";
import { buildClarifyQuestion } from "./clarifyQuestionBuilder";
import type { GroundedPlace } from "./placeGrounder";
import { classifyWhereSlot } from "./whereClassifier";
import { classifyWhenSlot } from "./whenClassifier";
import { classifyWhatSlot } from "./whatClassifier";
import type { OptOutSlot } from "../comprehension/rulePreParse";

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
  | "where_center"          // W3-PR-6: place 完全欠損、anchor もなし → どのあたり？
  | "where_pick_from_candidates" // W3-PR-6: ambiguous 候補が多すぎ → どれ？
  | "transport"             // solver_blocker: transport
  | "endpoint";             // solver_blocker: endpoint / end_time

/**
 * clarify 質問時の event scope 情報（W3-PR-7 Commit 3 で追加）。
 *
 * 「朝の仕事はどのあたり？」のような event 指定付き質問を生成するために使う。
 * events + event_id から gapResolver が都度計算する（純関数）。
 *
 * 設計書: docs/alter-morning-comprehension-first-wave3-pr7-design.md §5.1 / §5.3
 */
export interface ClarifyScope {
  /** "朝" | "12:00" | "夜" | null（表示用ラベル） */
  timeLabel: string | null;
  /** "仕事" | "ランチ" | null */
  activityLabel: string | null;
  /** plan 内で何番目の event か（1 始まり） */
  eventOrdinal: number;
  /**
   * 同 timeLabel+activityLabel の event 数。
   * >= 2 の時のみ question に "1つ目の仕事は…" のような ordinal prefix を付ける。
   */
  sameLabelCount: number;
}

export interface ClarifyRequest {
  event_id: string;
  kind: ClarifyKind;
  /** クリア対象 slot（clarify 後の応答をどこに書くか） */
  target_slot: SemanticCriticalSlot | SolverBlocker | "target_ref";
  /** テンプレで使うメタ情報 */
  hint?: string;
  /**
   * event scope 情報（W3-PR-7 Commit 3 から）。
   * 質問文に「朝の仕事はどのあたり？」のような prefix を付けるために使う。
   * 後方互換のため optional。未指定時は hint ベースの generic 文にフォールバック。
   */
  scope?: ClarifyScope;
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
 * timeHint → 表示ラベル（「朝」「昼」「夜」「夕方」など）
 */
const TIME_HINT_LABEL: Record<string, string> = {
  dawn: "早朝",
  morning: "朝",
  noon: "昼",
  afternoon: "午後",
  evening: "夕方",
  night: "夜",
  late_night: "深夜",
};

/**
 * events + event_id から ClarifyScope を計算する純関数（W3-PR-7 Commit 3）。
 *
 * - timeLabel: startTime (HH:mm) or timeHint (日本語ラベル) or null
 * - activityLabel: activityCanonical or activity or null
 * - eventOrdinal: plan 内の 1 始まりインデックス
 * - sameLabelCount: 同じ (timeLabel, activityLabel) を持つ event 数
 *
 * 設計書: docs/alter-morning-comprehension-first-wave3-pr7-design.md §5.3
 */
export function buildScopeFromEvents(
  events: Event[],
  event_id: string,
): ClarifyScope | null {
  const idx = events.findIndex((e) => e.event_id === event_id);
  if (idx < 0) return null;
  const ev = events[idx];

  const timeLabel: string | null =
    ev.when.startTime ??
    (ev.when.timeHint ? TIME_HINT_LABEL[ev.when.timeHint] ?? null : null);

  const activityLabel: string | null =
    (ev.what.activityCanonical && ev.what.activityCanonical.trim()) ||
    (ev.what.activity && ev.what.activity.trim()) ||
    null;

  // 同じラベル組み合わせの event 数をカウント
  const sameLabelCount = events.filter((e) => {
    const eTime =
      e.when.startTime ??
      (e.when.timeHint ? TIME_HINT_LABEL[e.when.timeHint] ?? null : null);
    const eAct =
      (e.what.activityCanonical && e.what.activityCanonical.trim()) ||
      (e.what.activity && e.what.activity.trim()) ||
      null;
    return eTime === timeLabel && eAct === activityLabel;
  }).length;

  return {
    timeLabel,
    activityLabel,
    eventOrdinal: idx + 1,
    sameLabelCount,
  };
}

/**
 * ClarifyRequest を組み立てる internal helper。
 * question フィールドを rule-based builder で自動付与する（Wave 3 W3-PR-1）。
 *
 * W3-PR-7 Commit 3: events + idx から scope を計算して request/question に反映する。
 */
function mkClarify(
  req: Omit<ClarifyRequest, "question" | "scope">,
  ctx: { events: Event[]; index: number },
): GapAction {
  const scope = buildScopeFromEvents(ctx.events, req.event_id) ?? undefined;
  const question = buildClarifyQuestion({
    kind: req.kind,
    hint: req.hint,
    scope,
  });
  return { type: "clarify", request: { ...req, scope, question } };
}

export function resolveEventGap(
  ev: Event,
  ctx: { events: Event[]; index: number; grounded?: GroundedPlace[] },
): GapAction {
  // Turn 2+ modify: target_ref_confidence=low は最優先 clarify
  if (ev.turn_mode === "modify" && ev.target_ref_confidence === "low") {
    return mkClarify(
      {
        event_id: ev.event_id,
        kind: "target_ref_low",
        target_slot: "target_ref",
        hint: ev.target_ref ?? undefined,
      },
      ctx,
    );
  }

  const blk = ev.missing_solver_blockers;

  // ── W3-PR-7: sharpness 駆動 dispatch ────────────────────────────────────
  // vague を missing と別に扱う。vague も ASK になり得る。
  const whenSh = computeWhenSharpness(ev.when);
  const whereSh = computeWhereSharpness(ev.where);
  const whatSh = computeWhatSharpness(ev.what);

  // aggregate heuristic: When が missing かつ他に 1+ 欠損 → coarse time bucket
  //   （When が fixed なら「朝/昼/夜?」を聞く意味がない）
  const otherMissingCount =
    (whereSh === "missing" ? 1 : 0) +
    (whatSh === "missing" ? 1 : 0);
  if (whenSh === "missing" && otherMissingCount >= 1) {
    return mkClarify(
      {
        event_id: ev.event_id,
        kind: "coarse_time_bucket",
        target_slot: "when",
        hint: ev.what.activity || ev.what.activityCanonical || undefined,
      },
      ctx,
    );
  }

  // 各 slot 単独判定（priority 順: When > Where > What）。
  // 最初に出た ASK を返す。全 slot が provisional/fixed なら defer/pass_through。
  let sawNonFixed = false;

  // When: sharpness != fixed なら classifier に投げる
  if (whenSh !== "fixed") {
    sawNonFixed = true;
    const ws = classifyWhenSlot(ev, { events: ctx.events, index: ctx.index });
    if (ws.kind === "ask") {
      return mkClarify(
        {
          event_id: ev.event_id,
          kind: "specific_time",
          target_slot: "when",
          hint: ev.what.activity || ev.what.activityCanonical || undefined,
        },
        ctx,
      );
    }
    // fixed/provisional: スキップして次 slot へ
  }

  // Where: sharpness != fixed
  if (whereSh !== "fixed") {
    sawNonFixed = true;
    if (ctx.grounded) {
      const ws = classifyWhereSlot(ev, {
        events: ctx.events,
        index: ctx.index,
        grounded: ctx.grounded,
      });
      if (ws.kind === "ask") {
        if (ws.reason === "ambiguous_too_many") {
          return mkClarify(
            {
              event_id: ev.event_id,
              kind: "where_pick_from_candidates",
              target_slot: "where",
              hint: ev.where.place_ref ?? ev.what.activity ?? undefined,
            },
            ctx,
          );
        }
        return mkClarify(
          {
            event_id: ev.event_id,
            kind: "where_center",
            target_slot: "where",
            hint: ev.what.activity || ev.what.activityCanonical || undefined,
          },
          ctx,
        );
      }
      // provisional/fixed: place grounder へ defer（plan graph に候補載せる）
    }
    // grounded 未提供なら defer_to_place_grounder に倒す（後段で判定）
  }

  // What: sharpness != fixed（missing or vague）
  if (whatSh !== "fixed") {
    sawNonFixed = true;
    const ws = classifyWhatSlot(ev, { events: ctx.events, index: ctx.index });
    if (ws.kind === "ask") {
      return mkClarify(
        {
          event_id: ev.event_id,
          kind: "activity",
          target_slot: "what",
          hint: ev.where.place_ref ?? undefined,
        },
        ctx,
      );
    }
  }

  // 全 slot が fixed、または provisional/deferred で ASK 不要
  if (!sawNonFixed) {
    // 完全 fixed — solver_blockers を見る
  } else if (whereSh !== "fixed") {
    // where が vague/missing でも ASK にならなかった（provisional） → place grounder へ
    return { type: "defer_to_place_grounder", event_id: ev.event_id };
  }

  // solver_blockers 判定（sharpness 全 fixed、or When/What provisional 時）
  {
    // tentative 連鎖チェック（Q1-A' 条件）
    if (hasTentativeChain(ctx.events, ctx.index)) {
      return mkClarify(
        {
          event_id: ev.event_id,
          kind: "tentative_chain",
          target_slot: "when",
          hint:
            ev.target_ref ??
            ev.what.activity ??
            ev.what.activityCanonical ??
            undefined,
        },
        ctx,
      );
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
      return mkClarify(
        {
          event_id: ev.event_id,
          kind: "endpoint",
          target_slot: "endpoint",
          hint: ev.what.activity || ev.what.activityCanonical || undefined,
        },
        ctx,
      );
    }

    // それ以外（transport 複合等）: transport clarify
    return mkClarify(
      {
        event_id: ev.event_id,
        kind: "transport",
        target_slot: "transport",
        hint: ev.where.place_ref ?? undefined,
      },
      ctx,
    );
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 全 Events 解析 + primary clarify 選択
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * clarify kind の優先度。UI に戻す 1 件を選ぶときに使う。
 * 数値が小さいほど優先。
 *
 * W3-PR-6 CEO 方針（2026-04-22 確定）: slot priority を
 *   When(10-14) > Where(20-24) > What(30-32) > How(40-42) > Who(50)
 * の block で並べる。modify の target_ref_low だけは 0 で最上位（全 slot に先行）。
 * Why は blocker にしない（entry 不要）。
 *
 * Where の新 kind（where_center / where_pick_from_candidates）は Commit 2 で追加。
 * ここでは枠だけ確保する。
 */
const CLARIFY_PRIORITY: Record<ClarifyKind, number> = {
  target_ref_low: 0,        // 最優先（modify の曖昧さ、slot 非依存）
  // ── When（10-14）──
  coarse_time_bucket: 10,   // |semantic|≥2 → 朝/昼/夜?
  specific_time: 11,        // |semantic|==["when"] → 何時?
  tentative_chain: 14,      // 前後 tentative → 1 点確定
  // ── Where（20-24）──
  where_center: 20,         // 場所完全欠損・借用元なし
  where_pick_from_candidates: 22, // ambiguous 候補多数、絞らせる
  // ── What（30）──
  activity: 30,
  // ── How（40-42）──
  transport: 40,
  endpoint: 42,
};

/**
 * ClarifyKind がどの slot に対応するか（opt-out 判定に使う）。
 * target_ref_low と tentative_chain は opt-out 対象外（構造的に必要）。
 */
const KIND_TO_OPT_OUT_SLOT: Partial<Record<ClarifyKind, OptOutSlot>> = {
  coarse_time_bucket: "when",
  specific_time: "when",
  where_center: "where",
  where_pick_from_candidates: "where",
  activity: "what",
  transport: "how",
  endpoint: "how",
};

export function resolveGaps(
  events: Event[],
  ctx?: {
    grounded?: GroundedPlace[];
    /** ユーザーが「聞かなくていい」と明示した slot。primary_clarify 選択時にスキップ */
    slotOptOuts?: OptOutSlot[];
  },
): GapResolution {
  const grounded = ctx?.grounded;
  const optOuts = new Set<OptOutSlot>(ctx?.slotOptOuts ?? []);
  const actions: GapAction[] = events.map((ev, index) =>
    resolveEventGap(ev, { events, index, grounded }),
  );

  // W3-PR-6 Commit 4: opt-out slot に対応する clarify は primary_clarify 選定から除外。
  // （pass_through ではなく action 自体は残す — 将来 ASK でなく PROVISIONAL 扱い
　//  する時に備え、action trace は保持）
  let primary: ClarifyRequest | null = null;
  let primaryScore = Infinity;
  for (const a of actions) {
    if (a.type !== "clarify") continue;
    const targetSlot = KIND_TO_OPT_OUT_SLOT[a.request.kind];
    if (targetSlot && optOuts.has(targetSlot)) {
      continue; // ユーザーが「聞かなくていい」と宣言した slot はスキップ
    }
    const score = CLARIFY_PRIORITY[a.request.kind] ?? 99;
    if (score < primaryScore) {
      primary = a.request;
      primaryScore = score;
    }
  }

  return { actions, primary_clarify: primary };
}
