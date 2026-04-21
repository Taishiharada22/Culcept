/**
 * L2.1b Where Slot Classifier — Comprehension-First v1.3+ Wave 3 (W3-PR-6 Commit 2)
 *
 * 設計書: CEO 方針 2026-04-22「5W1H 三層化（FIXED / PROVISIONAL / ASK）」
 *
 * 責務:
 *   Event.where の「確定度」を 3 値で判定し、ASK が必要かを決める。
 *   - FIXED:       place が既に確定している（解決済み or 固有名詞で発話尊重）
 *   - PROVISIONAL: 情報は不足だが自動で補える（曖昧候補の代表選択 / 近隣 event 借用）
 *   - ASK:         ユーザーに戻さないと進めない（完全欠損 かつ 借用元なし 等）
 *
 * 設計原則:
 *   - 純関数・辞書ベース・LLM 呼び出しなし
 *   - 「曖昧なら無理に recommend しない」(R5): candidates が閾値超なら ASK
 *   - cross-event anchor は adjacent 優先 → 時間距離閾値内（R4）
 *   - 定数は export して呼び出し側で再利用可能にする（マジックナンバー排除）
 */
import type { Event } from "../comprehension/eventSchema";
import type { GroundedPlace } from "./placeGrounder";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants（マジックナンバー禁止: CEO 方針）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * ambiguous 候補がこの件数以下であれば「曖昧だが代表候補を仮採用」=PROVISIONAL。
 * 超えたら「多すぎて絞れない」=ASK (where_pick_from_candidates)。
 * R5: 曖昧なら無理に recommend しない / 絞ってからユーザーに戻す。
 */
export const WHERE_MAX_CANDIDATES_FOR_RECOMMENDATION = 5;

/**
 * cross-event anchor の時間窓（分）。
 * 対象 event と anchor event の startTime 差がこの値以下なら借用可能。
 * adjacent（配列上で隣接）は時間差不問で優先採用（R4）。
 */
export const WHERE_CROSS_EVENT_TIME_WINDOW_MIN = 90;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type WhereSlotStatus =
  | { kind: "fixed"; reason: "known_base" | "exact_proper_noun" | "resolved_single" | "respected_unresolved" }
  | { kind: "provisional"; reason: "ambiguous_top_pick" | "cross_event_anchor"; anchorEventId?: string }
  | { kind: "ask"; reason: "missing_no_anchor" | "ambiguous_too_many" };

export interface WhereClassifierCtx {
  events: Event[];
  index: number;
  grounded: GroundedPlace[];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Cross-event anchor lookup
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * HH:mm 形式の startTime を分数値に変換（昇順比較用）。
 * null の event は anchor 対象外。
 */
function toMinutes(hhmm: string | null | undefined): number | null {
  if (!hhmm) return null;
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * cross-event anchor を探す。R4 準拠:
 *   1. adjacent (idx±1) で status==="resolved" なら最優先（時間差不問）
 *   2. それ以外で |Δt| <= WHERE_CROSS_EVENT_TIME_WINDOW_MIN の resolved event
 *
 * 見つからない場合は null。
 * 借用元 event の place を「近く」として仮採用する用途。
 */
export function findCrossEventAnchor(
  ctx: WhereClassifierCtx,
): { anchor: GroundedPlace; eventIdx: number; reason: "adjacent" | "within_window" } | null {
  const { events, index, grounded } = ctx;
  const groundedByEvent = new Map(grounded.map((g) => [g.event_id, g]));

  function groundedFor(i: number): GroundedPlace | null {
    if (i < 0 || i >= events.length) return null;
    return groundedByEvent.get(events[i].event_id) ?? null;
  }

  // 1. adjacent 優先（prev → next の順、prev の方が文脈的に強い）
  for (const offset of [-1, 1]) {
    const g = groundedFor(index + offset);
    if (g && g.status === "resolved") {
      return { anchor: g, eventIdx: index + offset, reason: "adjacent" };
    }
  }

  // 2. 時間窓内
  const selfMin = toMinutes(events[index].when.startTime);
  if (selfMin == null) return null;

  for (let i = 0; i < events.length; i++) {
    if (i === index) continue;
    if (i === index - 1 || i === index + 1) continue; // adjacent は上で見た
    const g = groundedFor(i);
    if (!g || g.status !== "resolved") continue;
    const otherMin = toMinutes(events[i].when.startTime);
    if (otherMin == null) continue;
    if (Math.abs(otherMin - selfMin) <= WHERE_CROSS_EVENT_TIME_WINDOW_MIN) {
      return { anchor: g, eventIdx: i, reason: "within_window" };
    }
  }

  return null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Where slot classification
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Event.where を三層判定する。
 *
 * 判定順（早い方が優先）:
 *   A. place_ref==null:
 *     A-1. cross-event anchor あり → PROVISIONAL (cross_event_anchor)
 *     A-2. なし                    → ASK (missing_no_anchor)
 *   B. place_ref あり / grounded resolved:
 *     B-1. known_base              → FIXED (known_base)
 *     B-2. placeType==exact_proper_noun → FIXED (exact_proper_noun)  ※R1
 *     B-3. candidates.length === 1 → FIXED (resolved_single)
 *   C. place_ref あり / grounded ambiguous:
 *     C-1. candidates.length <= WHERE_MAX_CANDIDATES_FOR_RECOMMENDATION
 *                                  → PROVISIONAL (ambiguous_top_pick)
 *     C-2. それ以上                → ASK (ambiguous_too_many)
 *   D. place_ref あり / grounded unresolved:
 *     D-1. placeType==exact_proper_noun → FIXED (respected_unresolved)  ※R1（辞書外でも発話尊重）
 *     D-2. placeType==null / generic → FIXED (respected_unresolved)     ※ユーザー発話尊重
 *     D-3. placeType==chain_brand で辞書 miss は例外的だが発話尊重 → FIXED
 */
export function classifyWhereSlot(
  ev: Event,
  ctx: WhereClassifierCtx,
): WhereSlotStatus {
  const groundedByEvent = new Map(ctx.grounded.map((g) => [g.event_id, g]));
  const g = groundedByEvent.get(ev.event_id) ?? null;

  // A. place_ref 欠損
  if (!ev.where.place_ref) {
    const anchor = findCrossEventAnchor(ctx);
    if (anchor) {
      return {
        kind: "provisional",
        reason: "cross_event_anchor",
        anchorEventId: anchor.anchor.event_id,
      };
    }
    return { kind: "ask", reason: "missing_no_anchor" };
  }

  // B/C/D. place_ref あり
  if (!g) {
    // grounded データなし = 保守的に発話尊重（= FIXED）
    return { kind: "fixed", reason: "respected_unresolved" };
  }

  // B-1. known_base
  if (ev.where.placeType === "known_base" ||
      g.selected?.placeType === "known_base") {
    return { kind: "fixed", reason: "known_base" };
  }

  if (g.status === "resolved") {
    // B-2. exact_proper_noun
    if (ev.where.placeType === "exact_proper_noun") {
      return { kind: "fixed", reason: "exact_proper_noun" };
    }
    // B-3. 単一解決
    if (g.candidates.length <= 1) {
      return { kind: "fixed", reason: "resolved_single" };
    }
    // resolved だが候補複数（groundPlace は 1 件 hit で resolved を返す仕様なので
    // 通常到達しないが、将来の拡張に対して保険）
    return {
      kind: "provisional",
      reason: "ambiguous_top_pick",
    };
  }

  if (g.status === "ambiguous") {
    // C-1 / C-2
    if (g.candidates.length <= WHERE_MAX_CANDIDATES_FOR_RECOMMENDATION) {
      return { kind: "provisional", reason: "ambiguous_top_pick" };
    }
    return { kind: "ask", reason: "ambiguous_too_many" };
  }

  // D. unresolved（辞書 miss）
  // exact_proper_noun でも generic でも、place_ref が null ではなく
  // ユーザーが明示した以上は発話尊重（=FIXED）。
  return { kind: "fixed", reason: "respected_unresolved" };
}
