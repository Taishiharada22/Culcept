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
import { computeWhereSharpness } from "../comprehension/eventSchema";
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
 * Event.where を三層判定する（W3-PR-8: dialog-control strict 化）。
 *
 * CEO 指示 2026-04-22:
 *   PR-8 段階では vague 3 sub-kind (anchor / category_chain / undecided) は
 *   **全部 blocking = ASK** とする。fixed proper noun のみ non-blocking。
 *   「anchor だけで plan 昇格」は anchor 検索が動く PR-9 以降に解禁する予約。
 *
 * 判定順:
 *   M. sharpness==="missing" (place_ref==null):
 *     M-1. cross-event anchor あり → PROVISIONAL (cross_event_anchor)
 *     M-2. なし                    → ASK (missing_no_anchor)
 *   F. sharpness==="fixed" (placeType ∈ {exact_proper_noun, known_base}):
 *     F-1. known_base              → FIXED (known_base)
 *     F-2. exact_proper_noun       → FIXED (exact_proper_noun)
 *   V. sharpness==="vague":
 *     V-1. 現 PR (PR-8): 無条件に ASK。grounded の状態によらず sub-kind を
 *          理由コードに埋めて返す（ambiguous_too_many / missing_no_anchor 相当）。
 *     V-2. 予約 (PR-9 search 実装後):
 *          「旧 ambiguous_top_pick / cross_event_anchor 仮採用」は anchor 検索が
 *          動くときに provisional として復活する。今は機能しないため削除。
 */
export function classifyWhereSlot(
  ev: Event,
  ctx: WhereClassifierCtx,
): WhereSlotStatus {
  const groundedByEvent = new Map(ctx.grounded.map((g) => [g.event_id, g]));
  const g = groundedByEvent.get(ev.event_id) ?? null;
  const sharpness = computeWhereSharpness(ev.where);

  // M. missing
  if (sharpness === "missing") {
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

  // F. fixed（known_base / exact_proper_noun）
  if (sharpness === "fixed") {
    if (ev.where.placeType === "known_base" ||
        g?.selected?.placeType === "known_base") {
      return { kind: "fixed", reason: "known_base" };
    }
    return { kind: "fixed", reason: "exact_proper_noun" };
  }

  // V. vague — PR-8: 全部 ASK（anchor / category_chain / undecided すべて）
  //
  // 候補件数の多寡で理由コードを分ける:
  //   grounded.status==="ambiguous" かつ candidates > 閾値 → ambiguous_too_many
  //   それ以外（grounded なし / resolved / unresolved / 候補少）→ missing_no_anchor
  //     （「仮採用して plan 走らせる」経路を PR-8 では廃止）
  if (g && g.status === "ambiguous" &&
      g.candidates.length > WHERE_MAX_CANDIDATES_FOR_RECOMMENDATION) {
    return { kind: "ask", reason: "ambiguous_too_many" };
  }

  // anchor / category_chain / undecided すべてここに落ちる。
  // PR-9 で anchor search が入れば、ここを provisional (cross_event_anchor) と
  // provisional (ambiguous_top_pick) に差し戻す（設計書 §2.5 予約）。
  return { kind: "ask", reason: "missing_no_anchor" };
}
