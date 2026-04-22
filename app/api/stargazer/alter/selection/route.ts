/**
 * POST /api/stargazer/alter/selection
 *
 * W3-PR-9 Commit 5a-2: Places Search 候補選択専用 endpoint。
 *
 * 設計方針:
 *   - chat route (/api/stargazer/alter) の branch ではなく独立 endpoint
 *     理由: chat route 10000+ 行から fault isolation、race 安全、責務分離
 *   - server canonical response pattern（optimistic update しない）
 *     理由: reducer reject 時に client rollback 不要、state 不一致を構造的に排除
 *   - client-authoritative morning session（chat route と同じ）
 *     理由: 既存アーキテクチャに整合。DB 永続化は別 layer で行う
 *
 * 処理順序（goal からの逆算で耐障害化）:
 *   1. auth (userId 取得)
 *   2. body parse & shape validate
 *   3. dialogState の presence validate
 *   4. dialogReducer SEARCH_CANDIDATE_SELECTED dispatch
 *      - reducer 内 guard: provider_recovering / no activePresentation /
 *        targetEventId mismatch / queryFingerprint mismatch / invalid placeId /
 *        non-presented status / focus mismatch → 全て no-op (prev 返す)
 *   5. accepted? (nextState !== prev)
 *      - rejected → 200 with accepted=false + reason
 *   6. accepted の場合: applyPlaceSelection(persistedEvents, targetEventId, candidate)
 *      - applied=false (event graph から event_id 消失) → 409 (state 不整合)
 *   7. canonical morningSession を組み立てて返す
 *
 * 返却:
 *   - accepted=true:  { accepted, morningSession: {..., dialogState, persistedEvents} }
 *   - accepted=false: { accepted, reason }  — 200（client は再描画する）
 *   - structural error: 400/409/500 + { error, reason }
 */

import { NextResponse, type NextRequest } from "next/server";
import { checkStargazerTier } from "@/lib/stargazer/tierGuard";
import { dialogReducer } from "@/lib/alter-morning/dialog/reducer";
import type { DialogState } from "@/lib/alter-morning/dialog/types";
import type { Event } from "@/lib/alter-morning/comprehension/eventSchema";
import { applyPlaceSelection } from "@/lib/alter-morning/search/applyPlaceSelection";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Reject reasons — client が UI feedback に使える enum
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type RejectReason =
  | "missing_dialog_state"
  | "no_active_presentation"
  | "target_event_mismatch"
  | "query_fingerprint_stale"
  | "invalid_place_id"
  | "status_not_presented"
  | "reducer_rejected"
  | "event_not_found";

interface SelectionRequestBody {
  turnIndex: number;
  targetEventId: string;
  queryFingerprint: string;
  selectedPlaceId: string;
  morningSession: {
    sessionId?: string;
    phase?: string;
    dialogState?: DialogState | null;
    persistedEvents?: Event[];
    // pass-through: 他の field は変更せずそのまま返却
    [key: string]: unknown;
  };
}

function isString(x: unknown): x is string {
  return typeof x === "string" && x.length > 0;
}

function validateBody(x: unknown): SelectionRequestBody | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (typeof o.turnIndex !== "number") return null;
  if (!isString(o.targetEventId)) return null;
  if (!isString(o.queryFingerprint)) return null;
  if (!isString(o.selectedPlaceId)) return null;
  if (!o.morningSession || typeof o.morningSession !== "object") return null;
  return o as unknown as SelectionRequestBody;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Handler
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function POST(req: NextRequest) {
  try {
    const tierCheck = await checkStargazerTier("alter");
    if (tierCheck instanceof NextResponse) return tierCheck;

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const body = validateBody(raw);
    if (!body) {
      return NextResponse.json(
        { error: "Invalid request shape" },
        { status: 400 },
      );
    }

    const { targetEventId, queryFingerprint, selectedPlaceId, morningSession } =
      body;
    const prevDialogState = morningSession.dialogState ?? null;
    const prevEvents = morningSession.persistedEvents ?? [];

    // Step 3: dialogState presence
    if (!prevDialogState) {
      return rejectJson("missing_dialog_state");
    }

    // Step 4: 事前観測（reason 特定用）。reducer は no-op で吸収するが、
    //         client への feedback reason を細かく返すため事前チェックする。
    //         ただし **真の判定は reducer の戻り値**で行う（defense in depth）。
    const prevActive = prevDialogState.activePresentation;
    let preflightReason: RejectReason | null = null;
    if (!prevActive) {
      preflightReason = "no_active_presentation";
    } else if (prevActive.targetEventId !== targetEventId) {
      preflightReason = "target_event_mismatch";
    } else if (prevActive.queryFingerprint !== queryFingerprint) {
      preflightReason = "query_fingerprint_stale";
    } else if (
      !prevActive.candidates.find((c) => c.placeId === selectedPlaceId)
    ) {
      preflightReason = "invalid_place_id";
    } else if (
      prevDialogState.conversationStatus !== "search_candidates_presented"
    ) {
      preflightReason = "status_not_presented";
    }

    // Step 5: dispatch reducer（常に通す — 真の判定源）
    const nextDialogState = dialogReducer(prevDialogState, {
      type: "SEARCH_CANDIDATE_SELECTED",
      turnIndex: body.turnIndex,
      targetEventId,
      queryFingerprint,
      selectedPlaceId,
    });

    const accepted = nextDialogState !== prevDialogState;

    if (!accepted) {
      return rejectJson(preflightReason ?? "reducer_rejected");
    }

    // Step 6: event 更新（reducer 受理後のみ）
    const candidate = prevActive!.candidates.find(
      (c) => c.placeId === selectedPlaceId,
    )!; // preflight で存在確認済み（reducer accepted = candidate exists）

    const eventUpdate = applyPlaceSelection({
      events: prevEvents,
      targetEventId,
      candidate,
    });

    if (!eventUpdate.applied) {
      // 部分成功を返さない（全か無か）:
      //   dialogState は reducer で進んだが、event graph に target が無い =
      //   state 不整合。ここで dialogState だけ進めて event を更新しないと
      //   client 側で dialogState と event のズレが恒久化する。
      //   morningSession を返さず client は pre-request state を維持する。
      //   reducer 実行はメモリ内 pure で副作用ゼロなので破棄して問題ない。
      console.warn("[alter-selection] event not found after reducer accept", {
        targetEventId,
      });
      return NextResponse.json(
        {
          accepted: false,
          reason: "event_not_found" satisfies RejectReason,
        },
        { status: 200 },
      );
    }

    // Step 7: canonical morningSession
    const nextMorningSession = {
      ...morningSession,
      dialogState: nextDialogState,
      persistedEvents: eventUpdate.events,
    };

    return NextResponse.json({
      accepted: true,
      morningSession: nextMorningSession,
    });
  } catch (error) {
    console.error("[alter-selection] unhandled error", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

function rejectJson(reason: RejectReason) {
  return NextResponse.json({ accepted: false, reason }, { status: 200 });
}
