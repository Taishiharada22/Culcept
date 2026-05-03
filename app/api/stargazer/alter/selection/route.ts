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
// CEO/GPT 2026-05-03 PR B-3c-1: applyPlaceSelectionByTarget は target.kind 別 dispatch
//   pure helper。journey_origin では promoteJourneyOrigin を呼ぶ。
import { applyPlaceSelectionByTarget } from "@/lib/alter-morning/dialog/applyPlaceSelectionByTarget";
import type { JourneyAnchorState } from "@/lib/alter-morning/journey/anchorState";
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
import { normalizePlanItem } from "@/lib/alter-morning/normalizedPlanItem";
// CEO 2026-04-28 Option B + Journey 構造: 一元化された transport mapper /
//   home anchor / journey end 解決を使う。
//   旧 mapVcTransportToPlanTransport は本ファイル内に残置していたが、
//   transportContext.ts に移行（同じ logic を chat 経路と共有）。
import {
  deriveDayTransport,
  mapVcTransportToPlanMode,
  resolveHomeAnchor,
  resolveJourneyEndAnchor,
} from "@/lib/alter-morning/planning/transportContext";
// CEO/GPT 2026-05-02 PR B-1: JourneyAnchorState converter (selection 経路でも
// chat 経路と同じく MorningPlan.journeyOrigin/End に union 化された state を詰める)
import {
  toOriginState,
  toEndState,
  type AnchorUnknownReason,
} from "@/lib/alter-morning/journey/anchorState";
// CEO/GPT 2026-05-02 PR B-5a: plan history persistence (fail-soft)
import { supabaseServer } from "@/lib/supabase/server";
import { upsertPlanHistory } from "@/lib/alter-morning/persistence/planHistory";
// CEO 2026-04-28 PR #41a Layer 0: selection 経路の turnTrace emission。
import {
  emitTurnTrace,
  eventToShapeSnapshot,
  buildVerboseExtension,
  isVerboseTraceEnabled,
} from "@/lib/alter-morning/trace/turnTrace";
import type { PendingSlot } from "@/lib/alter-morning/types";
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
  | "event_not_found"
  // CEO/GPT 2026-05-03 PR B-3b'-2 (Layer 3 半壊 UX 防止):
  //   journey_end target の selection は B-3e 未実装のため明示的 reject。
  //   journey_origin は B-3c-1 で promotion path を実装済み (= flag-aware narrow)。
  //   200 with accepted=false で client に仕様上の reject を伝える (5xx ではない)。
  | "not_implemented_journey_anchor_promotion"
  // CEO/GPT 2026-05-03 PR B-3c-1 (GPT 2nd 補正、半壊 UX 防止):
  //   journey_origin の candidate は選択されたが、coordinates 不正 / state 不正で
  //   昇格不可能。activePresentation を clear せず client に明示 reject を返す
  //   (= 「選んだのに何も変わらない」状態を構造的に禁止)。
  //   client は同じ presentation を再表示し、別の候補を選ぶか「適切な候補がない」
  //   UI を出すかを決める (= UI 側の責務、本 PR scope 外)。
  | "journey_anchor_promotion_not_possible";

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
  /**
   * CEO 2026-04-28 Option B: browser geolocation 由来の現在地座標。
   * selection 後の plan rebuild で home anchor の優先 1 として使われる。
   * registered home (priorPlan.dayConditions 経由) より優先。
   */
  currentLat?: number | null;
  currentLng?: number | null;
}

// CEO/GPT 2026-05-02 PR B-5a Commit 3: Node runtime 明示 (defensive)
//   chat route (route.ts:552) は明示済。selection route も対称に明示する。
//   本 route は node:crypto (planHistory.ts:hashUserId 経由) を使うため、
//   Edge runtime に偶発的に変更されると壊れる。明示で防御。
export const runtime = "nodejs";

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

// CEO 2026-04-28 Option B: vcTypes ↔ transport/types mapper は
//   transportContext.ts に一元化（同じ logic を chat 経路と共有）。

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
    // CEO 2026-04-28 Option B + Journey 構造: browser geolocation 由来の現在地座標。
    //   selection 経路では registered home にアクセスできないため、
    //   currentLat/Lng が無ければ home anchor は null（travel item 不生成）。
    //   chat 経路 (legacyAdapter) は registered home を fallback で使えるため、
    //   Turn 3「電車」入力時に travel item が確実に生成される。
    //   journeyEnd は homeAnchor の round-trip default 派生。
    const selectionHomeAnchor = resolveHomeAnchor({
      currentLat: body.currentLat,
      currentLng: body.currentLng,
    });
    const selectionJourneyEnd = resolveJourneyEndAnchor(selectionHomeAnchor);

    // Step 3: dialogState presence
    if (!prevDialogState) {
      return rejectJson("missing_dialog_state");
    }

    // CEO/GPT 2026-05-03 PR B-3c-1 (Layer 3 narrow + flag-aware):
    //   journey_origin は flag ON で promotion path、flag OFF は reject。
    //   journey_end は flag 関係なく **常に reject** (= B-3e 未実装、必須 #3)。
    //   target 未指定 / target.kind === "event_where" → 既存 logic で進行 (= 完全不変、必須 #5)。
    //
    //   3 層 gate のうち Layer 3 を flag 連動 narrow:
    //     - journey_origin + flag OFF → not_implemented_journey_anchor_promotion (= 必須 #8)
    //     - journey_origin + flag ON → 後続の applyPlaceSelectionByTarget へ
    //     - journey_end (flag 不問) → not_implemented_journey_anchor_promotion (= 必須 #3)
    const prevActive = prevDialogState.activePresentation;
    const targetKind = prevActive?.target?.kind;
    if (targetKind === "journey_end") {
      return rejectJson("not_implemented_journey_anchor_promotion");
    }
    if (
      targetKind === "journey_origin" &&
      !ALTER_MORNING_FLAGS.journeyOriginGrounding(userId)
    ) {
      return rejectJson("not_implemented_journey_anchor_promotion");
    }

    // Step 4: 事前観測（reason 特定用）。reducer は no-op で吸収するが、
    //         client への feedback reason を細かく返すため事前チェックする。
    //         ただし **真の判定は reducer の戻り値**で行う（defense in depth）。
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

    // CEO/GPT 2026-05-03 PR B-3c-1 (GPT 2nd 補正、半壊 UX 防止):
    //   journey_origin path では reducer dispatch **前** に promotion を試行する。
    //   理由: candidate.coordinates 不正で blocked になった時、reducer dispatch を
    //         skip して activePresentation を維持する必要がある (= 「選んだのに
    //         何も変わらない」状態を構造的に禁止)。
    //
    //   event_where path は既存挙動完全不変 (= 必須 #5):
    //     reducer dispatch → applyPlaceSelection → plan rebuild の順。
    //
    //   journey_origin path は GPT 2nd 補正で順序固定:
    //     1. preflight (= 既に上で実行済み)
    //     2. candidate find
    //     3. applyPlaceSelectionByTarget (= promoteJourneyOrigin pure)
    //     4. blocked → reject (= reducer dispatch しない、必須 #2)
    //     5. applied → reducer dispatch (= activePresentation clear)
    //     6. plan rebuild (events 不変、plan.journeyOrigin のみ更新、必須 #4)
    let promotedJourneyOrigin:
      | (JourneyAnchorState & { kind: "known_exact" })
      | undefined;
    if (targetKind === "journey_origin") {
      // preflight 済 candidate の存在確認 (= preflightReason に !== null の場合既に reject 済)
      const candidate = prevActive?.candidates.find(
        (c) => c.placeId === selectedPlaceId,
      );
      if (!candidate) {
        // preflight が拾うはずだが defensive
        return rejectJson(preflightReason ?? "invalid_place_id");
      }
      const dispatched = applyPlaceSelectionByTarget({
        target: { kind: "journey_origin" },
        candidate,
        events: prevEvents,
        targetEventId,
        currentJourneyOrigin: (
          morningSession.plan as MorningPlan | undefined
        )?.journeyOrigin,
      });
      if (dispatched.kind === "blocked_journey_origin") {
        // GPT 2nd 補正: activePresentation を clear せず明示 reject。
        //   reducer dispatch しないため client の activePresentation は維持される
        //   → user は同じ presentation を再表示し別の候補を選べる。
        console.info(
          `[alter-selection:journey_origin] blocked reason=${dispatched.reason} placeId=${selectedPlaceId}`,
        );
        return rejectJson("journey_anchor_promotion_not_possible");
      }
      // exhaustive check: 想定外の kind が来た場合は defensive reject
      //   (= future PR で event_where や journey_end が誤って journey_origin
      //    target で来た場合の type-safe defense)
      if (dispatched.kind !== "applied_journey_origin") {
        console.warn(
          `[alter-selection:journey_origin] unexpected dispatch kind=${dispatched.kind}`,
        );
        return rejectJson("journey_anchor_promotion_not_possible");
      }
      // applied: 後続の reducer dispatch + plan rebuild に向けて昇格 state を保持
      promotedJourneyOrigin = dispatched.promotedJourneyOrigin;
    }

    // Step 5: dispatch reducer（常に通す — 真の判定源）
    //
    // CEO/GPT 2026-05-03 PR B-3c-1: action.target を必ず渡す。
    //   reducer は activePresentation.target と action.target の kind 一致で stale check
    //   を行う。target 未指定 (= legacy 経路) のままだと journey_origin presentation で
    //   片方 null の mismatch reject になる (= reducer L1001-1003)。
    //   prevActive?.target が undefined の場合 (= 既存 event_where 経路) は undefined のまま
    //   渡し、既存 legacy 判定を維持。
    const nextDialogState = dialogReducer(prevDialogState, {
      type: "SEARCH_CANDIDATE_SELECTED",
      turnIndex: body.turnIndex,
      targetEventId,
      queryFingerprint,
      selectedPlaceId,
      ...(prevActive?.target !== undefined ? { target: prevActive.target } : {}),
    });

    const accepted = nextDialogState !== prevDialogState;

    if (!accepted) {
      return rejectJson(preflightReason ?? "reducer_rejected");
    }

    // Step 6: event 更新（reducer 受理後のみ）
    //   journey_origin path では events を変更しない (= 必須 #4)。
    //   eventUpdate.applied=true として下流 (= plan rebuild) は events をそのまま使う。
    const candidate = prevActive!.candidates.find(
      (c) => c.placeId === selectedPlaceId,
    )!; // preflight で存在確認済み（reducer accepted = candidate exists）

    const eventUpdate =
      targetKind === "journey_origin"
        ? { events: prevEvents, applied: true } // events 不変 (必須 #4)
        : applyPlaceSelection({
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
      // CEO 2026-04-28 Option B: transport 解決の優先
      //   1. events[*].transport (deriveDayTransport) — 直近 Turn の answer 反映
      //   2. priorPlan.dayConditions.mainTransport — 前 turn から carry
      // homeAnchor は selection 経路では currentLat/Lng のみ採用 (registered home 不在)。
      const derivedTransport = deriveDayTransport(eventUpdate.events);
      const fallbackPlanMode = mapVcTransportToPlanMode(
        priorPlan.dayConditions?.mainTransport,
      );
      // CEO/GPT 2026-05-03 PR B-3c-1: journey_origin promotion 時は promoted coords
      //   を effective homeAnchor として使う (= 必須 #7、travel segment が正しい
      //   origin → first event を表現する)。
      //   - promotedJourneyOrigin あり → 合成 HomeAnchor (label = candidate.displayName、
      //     source = "journey_origin_promotion")
      //   - なし → 既存 selectionHomeAnchor (= currentLat/Lng 由来、event_where 経路と完全一致)
      const effectiveHomeAnchor = promotedJourneyOrigin
        ? {
            lat: promotedJourneyOrigin.lat,
            lng: promotedJourneyOrigin.lng,
            label: promotedJourneyOrigin.label,
            source: "journey_origin_promotion" as const,
          }
        : selectionHomeAnchor;
      const built = buildPlanAndSegmentsFromEvents({
        events: eventUpdate.events,
        enableTransportV2,
        mainTransport: derivedTransport?.plan ?? fallbackPlanMode,
        homeAnchor: effectiveHomeAnchor,
        journeyEnd: selectionJourneyEnd,
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
        // CEO 2026-04-28 Option B + Journey:
        //   HOME_SENTINEL → homeAnchor.label / ENDPOINT_SENTINEL → journeyEnd.label
        // CEO/GPT 2026-05-03 PR B-3c-1: journey_origin promotion 時は
        //   effectiveHomeAnchor (= promoted label "東京駅丸の内口" 等) を使う
        //   (= travel item の from 表示が正しい origin label になる、必須 #7)
        const entries = synthesizeTravelItems(
          built.transportSegments,
          eventUpdate.events,
          effectiveHomeAnchor,
          selectionJourneyEnd,
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
      // CEO 2026-04-28 Option B: dayConditions.mainTransport を events 由来で更新。
      //   events に transport が無ければ priorPlan の値を維持（不要な reset を避ける）。
      const nextDayConditions = derivedTransport
        ? { ...priorPlan.dayConditions, mainTransport: derivedTransport.vc }
        : (priorPlan.dayConditions ?? {});
      // CEO/GPT 2026-05-02 PR B-1: plan-level anchor state contract (selection 経路)
      //   chat 経路 (legacyAdapter) と同じ converter を使い、選択により再 resolver
      //   された anchor を JourneyAnchorState に変換して詰める。
      //
      //   priorPlan.journeyOrigin / journeyEnd 維持の意図:
      //     selectionHomeAnchor が null の場合 (= 選択以降も依然として位置情報なし)、
      //     chat 経路で既に設定された priorPlan の anchor state を保持する。
      //     priorPlan.journeyOrigin が undefined (= events 空 plan からの遷移) の
      //     ケースは現在発生しない (selection は events>0 plan に対して行う) が、
      //     defensive に optional のまま渡す。
      //
      // CEO/GPT 2026-05-03 PR B-3c-1 補正:
      //   journey_origin promotion path では promotedJourneyOrigin が known_exact
      //   として確定済 (= candidate.coordinates 由来)。priorityは:
      //     1. promotedJourneyOrigin (= 本 turn の journey_origin selection 結果) ★
      //     2. selectionHomeAnchor 由来 (= 既存 event_where path の挙動)
      //     3. priorPlan.journeyOrigin (= 維持)
      //   これにより journey_origin selection 後の plan rebuild で travel segment
      //   が正しい origin coords を使う (= 必須 #7)。
      const originReason: AnchorUnknownReason = "no_baseline";
      const endReason: AnchorUnknownReason = "no_endpoint_signal";
      const nextJourneyOrigin = promotedJourneyOrigin
        ? promotedJourneyOrigin
        : selectionHomeAnchor
          ? toOriginState(selectionHomeAnchor, originReason)
          : priorPlan.journeyOrigin;
      const nextJourneyEnd = selectionJourneyEnd
        ? toEndState(selectionJourneyEnd, endReason)
        : priorPlan.journeyEnd;
      rebuiltPlan = {
        ...priorPlan,
        items: normalizedItems,
        dayConditions: nextDayConditions,
        ...(enableTransportV2 && built.transportSegments !== undefined
          ? { transportSegments: built.transportSegments }
          : {}),
        ...(nextJourneyOrigin !== undefined ? { journeyOrigin: nextJourneyOrigin } : {}),
        ...(nextJourneyEnd !== undefined ? { journeyEnd: nextJourneyEnd } : {}),
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
    // Phase 2 scope 4-B' + 4-C (CEO 2026-04-26 再設計):
    //   旧 scope 4-B (pendingClarify=null clear) は撤回。
    //   selection 後に Branch A (canBind path) に入れず Branch B (fresh comprehension)
    //   になり、where が LLM 再 resolve で上書きされる regression を起こしていた。
    //
    //   正しい状態遷移:
    //     [Turn 2 selection 受理]
    //       events.where = TSUTAYA / exact_proper_noun
    //       pendingClarify = { slot: "transport", question: "移動手段は何にする？" }
    //       response message に transport question を含める (alterFollowUp 経由)
    //     [Turn 3 「電車」入力]
    //       canBind = true (pendingClarify=transport, persistedEvents 非空)
    //       Branch A: answerBinder で events.transport="電車" bind
    //       fresh comprehension 走らない → where / startTime 触らない
    //       → travel item / 移動時間が plan に反映
    //
    //   排他条件:
    //     - 同 event_id + slot="where" 既存 pendingClarify → transport pendingClarify に置換
    //     - 別 event_id pendingClarify → 維持 (multi-segment 対応)
    //     - slot=transport / when 等 → 維持 (必要な clarify を消さない)
    //     - 元から transport が non-null (events.transport != null) → pendingClarify 立てない
    //       (CEO の usecase で transport 既知なら redundant question を出さない)
    const incomingPendingClarify = (morningSession as { pendingClarify?: unknown })
      .pendingClarify as
      | {
          event_id?: string;
          slot?: string;
        }
      | null
      | undefined;
    const shouldReplaceWithTransport =
      incomingPendingClarify == null ||
      (incomingPendingClarify.event_id === targetEventId &&
        incomingPendingClarify.slot === "where");
    const targetEventTransport = eventUpdate.events.find(
      (e) => e.event_id === targetEventId,
    )?.transport;
    const transportAlreadyKnown =
      targetEventTransport != null && targetEventTransport.length > 0;

    let nextPendingClarify: unknown;
    // transportClarifyFollowUp: 場所確定後の transport question。
    // CEO 2026-04-26 方針: 「selection したら transport を聞く」シンプル state machine。
    // 既存 PR-10 nudge ("次の場所どこ？") は本 path で **置き換え**られる。
    // CEO usecase「全場所確定後に移動手段」を最優先 — nudge より transport question。
    let transportClarifyFollowUp: { text: string } | undefined;
    const transportV2Active = ALTER_MORNING_FLAGS.transportV2(userId);
    if (
      shouldReplaceWithTransport &&
      !transportAlreadyKnown &&
      transportV2Active
    ) {
      const transportQuestion = "移動手段は何にする？";
      nextPendingClarify = {
        event_id: targetEventId,
        slot: "transport",
        kind: "transport",
        scope: { event_id: targetEventId },
        question: transportQuestion,
        askedAt: new Date().toISOString(),
      };
      transportClarifyFollowUp = { text: transportQuestion };
    } else {
      // transport 既知 or 別 event_id pending → pendingClarify を touch しない
      nextPendingClarify = incomingPendingClarify ?? null;
    }

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
    // alterFollowUp (CEO 2026-04-26 方針):
    //   transport clarify を **最優先**で出す (場所→移動手段の論理順序)。
    //   それが該当しない場合のみ既存 PR-10 nudge ("次の場所どこ？") を考慮する。
    //   従来 nudge は transport が既知の multi-place case で動く想定で残す。
    let alterFollowUp: { text: string } | undefined = transportClarifyFollowUp;
    if (alterFollowUp === undefined && transportV2Active) {
      const should = shouldAskNextPlace({
        prevEvents,
        nextEvents: eventUpdate.events,
        capturedHistory: nextDialogState.capturedHistory,
      });
      if (should) {
        alterFollowUp = { text: buildNextPlaceAskText() };
      }
    }

    // ── CEO 2026-04-28 PR #41a Layer 0 + Commit 6: turnTrace emission ──
    //   selection 経路でも events / pendingClarify の遷移を追跡する。
    //   Commit 6: emit 戻り値を response の `_debug.trace` に乗せて、
    //     CEO が browser DevTools Network tab から観測可能にする。
    //   PII redact + env gate は emitTurnTrace 内で完結。
    const selectionTraceSnapshot = emitTurnTrace(
      {
        sessionId:
          typeof morningSession.sessionId === "string"
            ? morningSession.sessionId
            : "unknown",
        turnIndex: body.turnIndex,
        caller: "selection_route",
        // selection 経路は user utterance を直接受けない（candidate tap）
        utteranceLength: 0,
        hasUtterance: false,
        currentEventCount: 0, // selection は events を生成しない、event を update するだけ
        priorEventCount: prevEvents.length,
        mergedEventCount: eventUpdate.events.length,
        mergedEvents: eventUpdate.events.map(eventToShapeSnapshot),
        primaryClarifyKind: null, // selection 経路は gapResolver を呼ばない
        primaryClarifyEventId: null,
        pendingClarifySlot:
          (nextPendingClarify as { slot?: PendingSlot } | null)?.slot ?? null,
        pendingClarifyKind:
          (nextPendingClarify as { kind?: string } | null)?.kind ?? null,
        pendingClarifyEventId:
          (nextPendingClarify as { event_id?: string } | null)?.event_id ?? null,
      },
      isVerboseTraceEnabled()
        ? buildVerboseExtension({
            utterance: "", // selection は utterance なし
            mergedEvents: eventUpdate.events,
            pendingClarify:
              nextPendingClarify as import("@/lib/alter-morning/types").PendingClarify | null,
          })
        : undefined,
    );

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // CEO/GPT 2026-05-02 PR B-5a: plan history persistence (fail-soft)
    //   selection 後の rebuiltPlan を alter_morning_plan_history に upsert する。
    //   chat 経路 (route.ts:9897 付近) と同じ pattern。
    //
    //   - rebuiltPlan が undefined のときは skip (priorPlan なし path)
    //   - isPlanWorthSaving guard で空 plan は保存しない (helper 側で reject)
    //   - DB / Network 失敗時は response を壊さない (try/catch + fail-soft)
    //   - log は upsertPlanHistory 内で sha256 hash 化済 (PII 排除)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (rebuiltPlan) {
      try {
        const supabase = await supabaseServer();
        await upsertPlanHistory(supabase, userId, rebuiltPlan);
      } catch {
        // fail-soft: log は helper 内で処理済み、本 response は壊さない
      }
    }

    return NextResponse.json({
      accepted: true,
      morningSession: nextMorningSession,
      ...(alterFollowUp !== undefined ? { alterFollowUp } : {}),
      // CEO 2026-04-28 PR #41a Commit 6: browser DevTools 観測用
      ...(selectionTraceSnapshot != null
        ? { _debug: { trace: selectionTraceSnapshot } }
        : {}),
    });
  } catch (error) {
    console.error("[alter-selection] unhandled error", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

function rejectJson(reason: RejectReason) {
  return NextResponse.json({ accepted: false, reason }, { status: 200 });
}
