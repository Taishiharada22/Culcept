/**
 * planRebuild — W3-PR-10 Phase 1 Domain Model
 *
 * 位置づけ:
 *   Comprehension-First Path A で、events から plan.items と canonical
 *   TransportSegment[] を **1 回だけ** 生成する pure function。
 *   adaptPipelineToLegacy / selection endpoint の両方から呼ばれる共通入口。
 *
 * 設計原則（Phase 0 Audit + CEO 確定 2026-04-23 / 2026-04-24）:
 *   - **pure**: 関数内部で env / feature flag を読まない。引数 enableTransportV2 を受ける
 *   - **T1**: Domain truth は TransportSegment[]。persisted travel PlanItem は display cache
 *   - **T2**: canonical segments は build 時 1 回だけ生成、consumer は結果を参照。
 *     builder（buildTransportSegments）は export しない → consumer 直叩き禁止を型で enforce
 *   - **T3**: flag OFF 完全互換。enableTransportV2=false 時は transportSegments を返さない
 *     （conditional spread で object に含めない、undefined も含めない）
 *   - **coordinates 未確定 pair invariant（CEO 確定 2026-04-24）**:
 *     両端 where.coordinates が揃った隣接 event pair のみ TransportSegment を生成。
 *     片方でも null/undefined の pair は segment 不生成。
 *     heuristic placeholder edge 禁止。不完全情報で canonical edge を捏造しない
 *
 * 非責務（Phase 1 非スコープ）:
 *   - mode 推定（mainTransport 既定値 or "unknown" で埋める、per-segment 推定なし）
 *   - Routes API 呼び出し（durationMin / distanceM は null 既定、Phase 2 以降）
 *   - Path B（processMorningMessage / buildDayPlan / insertTravelItems）は不干渉
 *   - dialogState / pendingClarify / phase 決定には関与しない（caller が別管理）
 *   - needs_answer 上書きも caller 側で実施（eventToPlanItem が生成する素の item を返すのみ）
 */

import type { Event as ComprehensionEvent } from "../comprehension/eventSchema";
import {
  computeWhenSharpness,
  computeWhereSharpness,
  computeWhatSharpness,
} from "../comprehension/eventSchema";
import type {
  PlanItem,
  ConfirmationState,
  WhereVagueSubKind,
  MainLocation,
} from "../types";
import type { TransportMode, TransportSegment } from "../transport/types";
import { estimateNeutralDurationMin } from "../transport/durationHeuristic";
import { classifyWhereVague } from "./whereVagueClassifier";
// CEO 2026-04-29 PR #44: endTime 推論 (activity → typical duration)
import { inferEndTimeFromActivity } from "./typicalDuration";
// CEO 2026-04-28 Option B: home/current → first_event の synthetic travel segment
//   を 1-event plan でも生成可能にする。HOME_TRAVEL_SENTINEL_ID は実 event_id と
//   衝突しない sentinel として segment.fromEventId に入る。
// CEO 2026-04-28 Journey 構造: last_event → 帰宅 の synthetic travel segment も
//   生成する。ENDPOINT_TRAVEL_SENTINEL_ID は segment.toEventId に入る sentinel。
// CEO 2026-04-28 G2 (5W1H How): event.transport (raw Japanese) → item.transport
//   (vcTypes.TransportMode) の写像に parseJapaneseTransportToVc を使う。
import {
  HOME_TRAVEL_SENTINEL_ID,
  ENDPOINT_TRAVEL_SENTINEL_ID,
  parseJapaneseTransportToVc,
} from "./transportContext";
import type { HomeAnchor, JourneyEndAnchor } from "./transportContext";
import type { TransportMode as VcTransportMode } from "@/app/(culcept)/calendar/_lib/vcTypes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Defaults（Phase 1 固定、将来 CEO 判断で変更）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const DEFAULT_DURATION_MIN = 45;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Internal: event.where → PlanItem.location（PR-11 UI 正しさ修正）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 位置づけ（2026-04-23 CEO 承認 Step 3 最小根治）:
//   Phase 1 Domain Model において、event.where は canonical な場所情報を持つが、
//   従来 eventToPlanItem はそれを text field に join するだけで、UI が読む
//   PlanItem.location （= MainLocation）に一切変換していなかった。
//   結果 MorningPlanCard の render gate `whereSharpness === "fixed" && item.location?.label`
//   が常に false となり、「確定済なのに場所名 UI に出ない」現象を引き起こしていた。
//
// 不変項:
//   - label（= event.where.place_ref）が空なら location 自体 undefined を返す
//     （MainLocation.label は required string のため、空文字を詰めない）
//   - canonicalId は placeTable 解決を経ない以上空文字 ""（intentParser の既存 precedent）
//   - source は "user_explicit"
//       event.where.place_ref は utterance 由来（user 発話）か selection 由来
//       （user が候補を明示選択）のいずれか。どちらも user 明示として扱って差し支えない
//   - lat/lng は coordinates が有限 number の時のみ含める。NaN/Infinity/非 number は除外
//
// 非責務:
//   - placeTable 解決 / canonicalId 発番 → 別レイヤ（placeResolver / intentParser）
//   - category / traits 推定 → placeTable 依存のため本 pure fn では扱わない
//   - propertyHints / resolvedName の精緻化 → 別 PR
//   - placeId（Google Place ID）転送 → 現在 event.where に field 自体が無いため対象外
function eventWhereToLocation(
  where: ComprehensionEvent["where"],
): MainLocation | undefined {
  const label =
    typeof where.place_ref === "string" && where.place_ref.trim().length > 0
      ? where.place_ref
      : null;
  if (label === null) return undefined;

  const c = where.coordinates;
  const hasValidCoords =
    c != null &&
    typeof c.lat === "number" &&
    typeof c.lng === "number" &&
    Number.isFinite(c.lat) &&
    Number.isFinite(c.lng);

  return {
    canonicalId: "",
    label,
    source: "user_explicit",
    resolvedName: label,
    ...(hasValidCoords ? { lat: c!.lat, lng: c!.lng } : {}),
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Internal: event → PlanItem
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function eventToPlanItem(event: ComprehensionEvent, orderHint: number): PlanItem {
  const startTime = event.when.startTime ?? undefined;
  const hasFixedStart = Boolean(startTime);
  const whatText = event.what.activity || event.what.activityCanonical || "予定";
  const whereText = event.where.place_ref ?? "";

  // CEO 2026-04-29 PR #44: endTime を text に表示 (explicit or activity 推論)
  //   - event.when.endTime あり → そのまま採用
  //   - 無し + activity から typical_duration 推論可 (high/medium) → 推論値を採用
  //   - 推論不能 (low confidence) → start のみ表示
  let endTimeForText: string | null = event.when.endTime ?? null;
  if (!endTimeForText && startTime) {
    const inferred = inferEndTimeFromActivity({
      startTime,
      activity: event.what.activity || event.what.activityCanonical,
    });
    if (inferred.endTime && inferred.confidence !== "low") {
      endTimeForText = inferred.endTime;
    }
  }
  const whenText = startTime
    ? endTimeForText
      ? `${startTime}〜${endTimeForText}`
      : startTime
    : "";

  const text = [whenText, whereText, whatText].filter((s) => s.length > 0).join(" ");

  const whenSharpness = computeWhenSharpness(event.when);
  const whereSharpness = computeWhereSharpness(event.where);
  const whatSharpness = computeWhatSharpness(event.what);

  const whereVagueSubKind: WhereVagueSubKind | undefined =
    whereSharpness === "vague" ? classifyWhereVague(event.where) : undefined;

  const allFixed =
    whenSharpness === "fixed" &&
    whereSharpness === "fixed" &&
    whatSharpness === "fixed";
  const confirmationState: ConfirmationState = allFixed
    ? "confirmed"
    : "provisional";

  const location = eventWhereToLocation(event.where);

  // ── CEO 2026-04-28 G1 (5W1H Who 軸): event.who[] → item.withWhom 写像 ──
  //   仕様:
  //     - 空配列 / 空文字のみ → undefined（spread で field 自体を含めない）
  //     - 単数 → そのまま
  //     - 複数 → 「、」(Japanese enumeration) で join
  //     - 配列内の空文字は filter で除外（defensive）
  //   UI 側 (MorningPlanCard.tsx L819) は `item.withWhom` がある時のみ
  //   「👤 ...」を render する。本写像が無いと UI に 1 度も到達しない。
  const cleanedWho = event.who
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter((s) => s.length > 0);
  const withWhomText: string | undefined =
    cleanedWho.length > 0 ? cleanedWho.join("、") : undefined;

  // ── CEO 2026-04-28 G2 (5W1H How 軸): event.transport → item.transport 写像 ──
  //   仕様:
  //     - event.transport は LLM/answerBinder が書き込む raw Japanese (e.g., "電車")
  //     - parseJapaneseTransportToVc が "train"/"walk"/"bus"/... に正規化
  //     - parse 不能 / null / 空白のみ → undefined（spread で field 不在）
  //   設計判断:
  //     - 既存 deriveDayTransport (dayConditions.mainTransport derive) と同じ
  //       parser を共有することで day-wide と per-event の解釈が常に一致
  //     - parse 不能なものは保存しない (hallucination 防止)
  //     - vcTypes.TransportMode に統一 (PlanItem.transport の型と一致)
  const itemTransport: VcTransportMode | undefined =
    event.transport && event.transport.trim().length > 0
      ? parseJapaneseTransportToVc(event.transport)
      : undefined;

  return {
    id: event.event_id,
    kind: hasFixedStart ? "fixed" : "todo",
    text,
    what: whatText,
    startTime,
    durationMin: DEFAULT_DURATION_MIN,
    durationSource: "inferred",
    fixedStart: hasFixedStart,
    orderHint,
    sourceTurnIndex: 0,
    completed: false,
    whenSharpness,
    whereSharpness,
    whatSharpness,
    whereVagueSubKind,
    confirmationState,
    // conditional spread: label 無しなら location key 自体を含めない。
    // 下流 UI の `item.location?.label` guard と整合し、PR-10 C6 の
    // conditional spread precedent（transportSegments）を踏襲する。
    ...(location !== undefined ? { location } : {}),
    // CEO 2026-04-28 G1: 同伴者 (5W1H Who 軸)
    ...(withWhomText !== undefined ? { withWhom: withWhomText } : {}),
    // CEO 2026-04-28 G2: 移動手段 (5W1H How 軸)
    ...(itemTransport !== undefined ? { transport: itemTransport } : {}),
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Internal: buildTransportSegments — NOT EXPORTED
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Invariant T2 enforcement: この関数は module 外に公開しない。
// 外部呼び出しは buildPlanAndSegmentsFromEvents 経由のみ。
// consumer が毎回直接叩く設計を型レベルで禁止する。
//
// Invariant (coordinates 未確定 pair):
//   両端 where.coordinates が揃った隣接 event pair のみ segment を生成する。
//   片方でも null/undefined の場合は segment 不生成。skip して次の pair を評価。
//
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function hasCoordinates(event: ComprehensionEvent): boolean {
  const c = event.where.coordinates;
  return (
    c != null &&
    typeof c.lat === "number" &&
    typeof c.lng === "number"
  );
}

function buildTransportSegments(
  events: ComprehensionEvent[],
  mainTransport: TransportMode | undefined,
  homeAnchor: HomeAnchor | null,
  journeyEnd: JourneyEndAnchor | null,
): TransportSegment[] {
  const segments: TransportSegment[] = [];
  const mode: TransportMode = mainTransport ?? "unknown";

  // ── CEO 2026-04-28 Option B: home/current → first_event 合成 segment ──
  //   1-event plan でも travel item を出すための合成 edge。
  //   - homeAnchor が null なら作らない（CEO 案 1: hallucination 防止）
  //   - first event に coordinates が無ければ作らない（同上）
  //   - estimateNeutralDurationMin が null（≤0.2km / invalid）でも push しない
  //     （segment 自体を作らないことで synthesizeTravelItems の null-skip と整合）
  if (homeAnchor && events.length > 0 && hasCoordinates(events[0])) {
    const homeCoords = { lat: homeAnchor.lat, lng: homeAnchor.lng };
    const firstCoords = events[0].where.coordinates!;
    const estimatedDurationMin = estimateNeutralDurationMin(
      homeCoords,
      firstCoords,
    );
    if (estimatedDurationMin !== null) {
      segments.push({
        fromEventId: HOME_TRAVEL_SENTINEL_ID,
        toEventId: events[0].event_id,
        mode,
        estimatedDurationMin,
        durationSource: "heuristic",
        distanceM: null,
        confidence: mainTransport ? "inferred" : "default",
        source: "default_walk",
      });
    }
  }

  // ── 既存 event-pair segments（先行 segment と独立に動作）──
  if (events.length >= 2) {
    for (let i = 0; i < events.length - 1; i++) {
      const from = events[i];
      const to = events[i + 1];
      if (!hasCoordinates(from) || !hasCoordinates(to)) {
        // invariant: 両端座標が揃わない pair では canonical edge を捏造しない
        continue;
      }
      // Scope A: mode 非依存の中立距離 heuristic で duration を埋める。
      //   number → durationSource="heuristic"（両 field は必ず同期）
      //   null   → durationSource=null（≤0.2km or invalid coords）
      const estimatedDurationMin = estimateNeutralDurationMin(
        from.where.coordinates!,
        to.where.coordinates!,
      );
      segments.push({
        fromEventId: from.event_id,
        toEventId: to.event_id,
        mode,
        estimatedDurationMin,
        durationSource: estimatedDurationMin !== null ? "heuristic" : null,
        distanceM: null,
        confidence: mainTransport ? "inferred" : "default",
        source: "default_walk",
      });
    }
  }

  // ── CEO 2026-04-28 Journey 構造: last_event → endpoint 合成 segment ──
  //   plan の最下部 "帰宅" ノードに向けた travel edge。
  //   - journeyEnd が null（homeAnchor も null = 現在地・自宅どちらも無い）→ 作らない
  //   - last event に coordinates が無ければ作らない（hallucination 防止）
  //   - 距離 ≤0.2km（estimateNeutralDurationMin null）→ push しない
  //   - last_event の coords と journeyEnd の coords が同一の round trip default 場合、
  //     距離≈0 → null → segment 不生成（safety net で 0 分 travel が出ない）
  if (journeyEnd && events.length > 0) {
    const last = events[events.length - 1];
    if (hasCoordinates(last)) {
      const lastCoords = last.where.coordinates!;
      const endCoords = { lat: journeyEnd.lat, lng: journeyEnd.lng };
      const estimatedDurationMin = estimateNeutralDurationMin(
        lastCoords,
        endCoords,
      );
      if (estimatedDurationMin !== null) {
        segments.push({
          fromEventId: last.event_id,
          toEventId: ENDPOINT_TRAVEL_SENTINEL_ID,
          mode,
          estimatedDurationMin,
          durationSource: "heuristic",
          distanceM: null,
          confidence: mainTransport ? "inferred" : "default",
          source: "default_walk",
        });
      }
    }
  }

  return segments;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Public API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface BuildPlanAndSegmentsInput {
  events: ComprehensionEvent[];
  /**
   * feature flag 値（ALTER_MORNING_TRANSPORT_V2）。
   * call-site 側で env を読み、この関数は pure のまま引数だけで分岐する。
   * false 時: transportSegments は result に **含めない**（undefined も含めない、conditional spread）
   */
  enableTransportV2: boolean;
  /**
   * day-level 既定 transport mode（DayConditions.mainTransport 由来）。
   * 未指定時は "unknown" として segment を生成する。Phase 1 では per-segment 推定なし。
   */
  mainTransport?: TransportMode;
  /**
   * CEO 2026-04-28 Option B: home/current → first_event の synthetic travel segment 用 anchor。
   *   - 渡された場合: 1-event plan でも events[0] (coordinates 必須) との travel segment を生成
   *   - null/undefined: home segment を作らない（CEO 案 1: hallucination 防止）
   * 優先順位（resolveHomeAnchor で解決）:
   *   1. 現在地 (browser geolocation)
   *   2. 登録済み自宅 (DB baseline_home_lat/lng)
   *   3. どちらもない → null
   */
  homeAnchor?: HomeAnchor | null;
  /**
   * CEO 2026-04-28 Journey 構造: last_event → 帰宅 の synthetic travel segment 用 anchor。
   *   - 渡された場合: events.length>=1 の last event に対して endpoint travel を生成
   *   - null/undefined: endpoint segment を作らない
   * MVP: round-trip default → resolveJourneyEndAnchor(homeAnchor) で homeAnchor から派生。
   */
  journeyEnd?: JourneyEndAnchor | null;
}

export interface BuildPlanAndSegmentsOutput {
  items: PlanItem[];
  transportSegments?: TransportSegment[];
}

/**
 * events から plan.items と（flag ON 時のみ）TransportSegment[] を 1 回だけ生成する pure function。
 *
 * 副作用なし。env / flag を直接読まない。
 * 返り値の transportSegments は conditional spread で追加される:
 *   - enableTransportV2=false → key 自体を含めない（undefined も含めない）
 *   - enableTransportV2=true  → TransportSegment[] を必ず含める（0 件でも空配列を返す）
 */
export function buildPlanAndSegmentsFromEvents(
  input: BuildPlanAndSegmentsInput,
): BuildPlanAndSegmentsOutput {
  const { events, enableTransportV2, mainTransport, homeAnchor, journeyEnd } =
    input;

  const items = events.map((ev, idx) => eventToPlanItem(ev, idx));

  if (!enableTransportV2) {
    return { items };
  }

  const transportSegments = buildTransportSegments(
    events,
    mainTransport,
    homeAnchor ?? null,
    journeyEnd ?? null,
  );
  return { items, transportSegments };
}
