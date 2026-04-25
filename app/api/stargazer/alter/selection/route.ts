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
import { buildPlanAndSegmentsFromEvents } from "@/lib/alter-morning/planning/planRebuild";
import {
  synthesizeTravelItems,
  interleaveTravelItems,
} from "@/lib/alter-morning/planning/synthesizeTravelItems";
import {
  ALTER_MORNING_FLAGS,
  resolveTransportV2FlagSource,
} from "@/lib/alter-morning/dialog/flags";
import type { MorningPlan, PlanItem } from "@/lib/alter-morning/types";
import type { TransportMode as VcTransportMode } from "@/app/(culcept)/calendar/_lib/vcTypes";
import type { TransportMode as PlanTransportMode } from "@/lib/alter-morning/transport/types";
import { normalizePlanItem } from "@/lib/alter-morning/normalizedPlanItem";
import {
  computeSegmentsBuiltTelemetry,
  computeDisplayRenderedTelemetry,
} from "@/lib/alter-morning/transport/telemetry";
import {
  buildNextPlaceAskText,
  shouldAskNextPlace,
} from "@/lib/alter-morning/conversationStarter";
// NOTE: `@/lib/stargazer/analytics` transitively imports `@/lib/supabaseAdmin`,
// which eagerly reads `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` at
// module load. Vitest runs without those envs set, so any static import chain
// that reaches supabaseAdmin crashes during test module resolution. We defer
// analytics via dynamic import so the chain only resolves when we actually emit
// — a path guarded by flag_source, i.e. never reached in unit tests.

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
// TransportMode mapper (Phase 2 scope 4-D / CEO 2026-04-26)
//   既存 architectural debt: vcTypes.TransportMode と transport/types.TransportMode が
//   別 union (vcTypes は "train"/"bus"、transport/types は "public_transit"/"unknown")。
//   selection 経由で priorPlan.dayConditions.mainTransport (vcTypes) を
//   buildPlanAndSegmentsFromEvents (transport/types) に渡すため、ここで thin mapping。
//   完全な型統一は別 PR の構造修正で対応。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function mapVcTransportToPlanTransport(
  mode: VcTransportMode | undefined,
): PlanTransportMode | undefined {
  if (mode === undefined) return undefined;
  switch (mode) {
    case "walk":
      return "walk";
    case "bicycle":
      return "bicycle";
    case "car":
    case "motorcycle":
      return "car";
    case "taxi":
      return "taxi";
    case "train":
    case "bus":
      // 公共交通手段は "public_transit" にまとめる (transport/types のセマンティクス)
      return "public_transit";
    case "plane":
      // 飛行機は plan layer では未対応 → unknown 扱い
      return "unknown";
    default: {
      // exhaustive check fallback
      const _exhaustive: never = mode;
      void _exhaustive;
      return "unknown";
    }
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Handler
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function POST(req: NextRequest) {
  try {
    const tierCheck = await checkStargazerTier("alter");
    if (tierCheck instanceof NextResponse) return tierCheck;
    // W3-PR-10 canary: userId は tierCheck 戻り値に既に含まれている（/lib/stargazer/tierGuard.ts:74）。
    // transportV2 allowlist 判定で使う。ここで抽出しておく。
    const { userId } = tierCheck;

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

    // Step 7a: plan rebuild
    //   Phase 2 scope 1 (CEO 2026-04-26): plan rebuild 自体は transportV2 flag
    //   不問で実行する。理由 = candidate 選択後に events が更新されたなら、
    //   plan items は events と同期した状態で UI に返す必要がある。flag OFF で
    //   plan を rebuild しないと client は古い plan (Markcity 等) を表示し続ける。
    //
    //   ただし travel synthesize / interleave / telemetry は transportV2 flag ON 時のみ:
    //     - flag OFF: items は events から rebuild、travel item なし、transportSegments なし
    //     - flag ON:  上記 + travel item interleave + transportSegments + telemetry
    //
    //   buildPlanAndSegmentsFromEvents の `enableTransportV2: false` 経路は
    //   transportSegments を返さない既存挙動なので、flag OFF でも items 再構築は安全。
    let rebuiltPlan: MorningPlan | undefined;
    const priorPlan = morningSession.plan as MorningPlan | undefined;
    if (priorPlan) {
      const enableTransportV2 = ALTER_MORNING_FLAGS.transportV2(userId);
      // Phase 2 scope 4-D (CEO 2026-04-26): priorPlan.dayConditions.mainTransport を
      //   buildPlanAndSegmentsFromEvents に渡すことで、travel item / transportSegments
      //   の mode が反映される。旧 logic は events.transport を見ない設計上、user の
      //   「電車」入力が plan の travel item に反映されない問題があった。
      //   vcTypes.TransportMode → transport/types.TransportMode の mapping は
      //   mapVcTransportToPlanTransport で（既存 architectural debt の対応）。
      const built = buildPlanAndSegmentsFromEvents({
        events: eventUpdate.events,
        enableTransportV2,
        mainTransport: mapVcTransportToPlanTransport(
          priorPlan.dayConditions?.mainTransport,
        ),
      });

      let interleavedItems = built.items;

      // travel synthesize + interleave + telemetry は transportV2 flag ON のみ
      if (enableTransportV2 && built.transportSegments !== undefined) {
        // ── W3-PR-10 canary O2: transport_v2_segments_built emit ──
        const flagSource = resolveTransportV2FlagSource(userId);
        if (flagSource != null) {
          const telemetry = computeSegmentsBuiltTelemetry(
            eventUpdate.events,
            built.transportSegments,
          );
          void import("@/lib/stargazer/analytics")
            .then(({ trackStargazerEvent }) =>
              trackStargazerEvent({
                userId,
                event: "transport_v2_segments_built",
                feature: "alter_morning",
                metadata: {
                  schema_version: "2026-04-24",
                  flag_source: flagSource,
                  session_id: morningSession.sessionId ?? null,
                  plan_date: priorPlan.date,
                  caller: "selection_route",
                  ...telemetry,
                },
                timestamp: new Date().toISOString(),
              }),
            )
            .catch(() => {
              /* analytics must never block plan rebuild — swallow */
            });
        }

        // ── W3-PR-10 Phase 2: travel display cache interleave ──
        const entries = synthesizeTravelItems(
          built.transportSegments,
          eventUpdate.events,
        );
        interleavedItems = interleaveTravelItems(built.items, entries);

        // ── W3-PR-10 canary O3: transport_v2_display_rendered emit ──
        if (flagSource != null) {
          const telemetry = computeDisplayRenderedTelemetry(
            built.transportSegments,
            interleavedItems,
          );
          void import("@/lib/stargazer/analytics")
            .then(({ trackStargazerEvent }) =>
              trackStargazerEvent({
                userId,
                event: "transport_v2_display_rendered",
                feature: "alter_morning",
                metadata: {
                  schema_version: "2026-04-24",
                  flag_source: flagSource,
                  session_id: morningSession.sessionId ?? null,
                  plan_date: priorPlan.date,
                  caller: "selection_route",
                  ...telemetry,
                },
                timestamp: new Date().toISOString(),
              }),
            )
            .catch(() => {
              /* analytics must never block plan rebuild — swallow */
            });
        }
      }

      const normalizedItems: PlanItem[] = interleavedItems.map((item) =>
        normalizePlanItem(item),
      );
      rebuiltPlan = {
        ...priorPlan,
        items: normalizedItems,
        ...(enableTransportV2 && built.transportSegments !== undefined
          ? { transportSegments: built.transportSegments }
          : {}),
      };
    }

    // Step 7b: canonical morningSession
    //   Phase 2 scope 1 (CEO 2026-04-26): rebuiltPlan は priorPlan が存在すれば
    //   transportV2 flag 不問で常に作られるため、flag OFF でも plan が含まれる
    //   ようになる。これは selection 後に client UI が古い plan を表示し続ける
    //   問題（CEO 観測「TSUTAYA tap 後も Markcity が残る」）の構造的修正。
    //
    //   flag OFF: rebuiltPlan は items のみ更新（travel item / transportSegments なし）。
    //     client は setMorningPlan で「items だけ最新化された plan」に置換する。
    //   flag ON:  rebuiltPlan は items + travel + transportSegments すべて含む。
    //
    //   invariant: priorPlan が存在すれば response.morningSession.plan は必ず含まれる。
    //     priorPlan が undefined の時のみ plan は含まれない（既存の no-priorPlan 挙動）。
    // Phase 2 scope 4-B (CEO 2026-04-26): selection 受理時に同 event_id + slot=where
    //   の pendingClarify を null に clear する。
    //
    //   観測の真因 (CEO 4/26 4:28):
    //     Turn 2 で TSUTAYA tap → applyPlaceSelection で events 更新済 (where 確定)
    //     しかし selection route は session.pendingClarify を touch しない設計だった
    //     → 次 turn で legacyAdapter / morningPipeline に stale pendingClarify
    //       (where_center clarify "10:00のカフェはどのあたり？") が継承される
    //     → user は selection で確定済なのに同じ「カフェはどのあたり？」が再発
    //
    //   修正: selection 受理時に pendingClarify を clear する。ただし以下は維持:
    //     - 別 event_id の pendingClarify (multi-segment 対応)
    //     - slot=where 以外 (transport / when 等の必要な clarify を消さない)
    const incomingPendingClarify = (morningSession as { pendingClarify?: unknown })
      .pendingClarify as
      | {
          event_id?: string;
          slot?: string;
        }
      | null
      | undefined;
    const shouldClearPendingClarify =
      incomingPendingClarify != null &&
      incomingPendingClarify.event_id === targetEventId &&
      incomingPendingClarify.slot === "where";
    const nextPendingClarify = shouldClearPendingClarify
      ? null
      : incomingPendingClarify ?? null;

    const {
      plan: _passthroughPlan,
      pendingClarify: _staleIncomingPendingClarify,
      ...morningSessionWithoutPlan
    } = morningSession as Record<string, unknown> & {
      plan?: MorningPlan;
      pendingClarify?: unknown;
    };
    const nextMorningSession = {
      ...morningSessionWithoutPlan,
      dialogState: nextDialogState,
      persistedEvents: eventUpdate.events,
      pendingClarify: nextPendingClarify,
      ...(rebuiltPlan !== undefined ? { plan: rebuiltPlan } : {}),
    };

    // Step 7c: W3-PR-10 positive-path nudge
    //   narrow trigger (conversationStarter.shouldAskNextPlace):
    //     A. このターンで 1 件目 place が confirm された
    //     B. まだ複数 place に到達していない
    //     C. ユーザーが終了意思を示していない
    //   さらに transportV2 flag ON ユーザー限定（観測対象外ユーザーに UX 変化を与えない）。
    //
    //   発火時は response 末尾に `alterFollowUp: { text }` を付けるだけ。
    //   DialogState / reducer / plan のいずれも変更しない。client は injectMessage 経由で
    //   UI に Alter 発話として 1 通だけ表示する。DB dialogues への永続化もしない
    //   （初版 scope 外、後続 PR で必要性確認）。
    //
    //   observability: O2 / O3 telemetry は本 nudge と独立。natural 2 件目が
    //   user 応答で追加されれば segment build 側で segment_count > 0 が発火する。
    let alterFollowUp: { text: string } | undefined;
    if (ALTER_MORNING_FLAGS.transportV2(userId)) {
      const should = shouldAskNextPlace({
        prevEvents,
        nextEvents: eventUpdate.events,
        capturedHistory: nextDialogState.capturedHistory,
      });
      if (should) {
        alterFollowUp = { text: buildNextPlaceAskText() };
      }
    }

    return NextResponse.json({
      accepted: true,
      morningSession: nextMorningSession,
      ...(alterFollowUp !== undefined ? { alterFollowUp } : {}),
    });
  } catch (error) {
    console.error("[alter-selection] unhandled error", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

function rejectJson(reason: RejectReason) {
  return NextResponse.json({ accepted: false, reason }, { status: 200 });
}
