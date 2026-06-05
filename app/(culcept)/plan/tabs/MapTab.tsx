"use client";

/**
 * MapTab — 「自分の地理」 view (Phase 3-N Map impl 9 closeout 後の単一 path)
 *
 * 設計書:
 *   - docs/alter-plan-phase2-c-map-tab-mini-design.md (= 旧 Phase 2-C v3、 歴史参照のみ)
 *   - docs/alter-plan-map-spec-audit-v3.md (= 9 closeout 後の現行 spec)
 *   - docs/alter-plan-map-impl-readiness.md (= 9a/9b/9 closeout 計画)
 *
 * 現行構造 (9 closeout 後):
 *   - PlanMapView (= vanilla Google Maps、 涙型 SVG data URI marker、 fitBounds、 pin tap → MapBottomSheet)
 *     - failsafe: keyAvailable=false / script load 中 → MapPlaceholder
 *     - 現在地 button (= 右上、 navigator.geolocation)
 *     - overlay (= loading / no-pins-no-baseline / no-anchors / api-unavailable の adaptive 文言)
 *   - MapBottomSheet (= 下から立ち上がる sheet、 8 段構造、 9b-6 で animation 追加)
 *   - DayItemsPanel (= 左下 hybrid、 当日リスト + 凡例、 sheet 表示中は hide)
 *   - MapSelectedPinLabel (= selected pin の overlay、 pin 追従 + Y clamp)
 *
 * 9 closeout で削除済み (= 旧 OFF path):
 *   - SelectedAnchorCard / CategoryGrid / UnresolvedAnchorsSection /
 *     StaticAlterSuggestionCard / DaySwitcher / FAB
 *   - CIRCLE marker logic (= MAP_CATEGORY_MARKER / MAP_SENSITIVE_MARKER)
 *   - marker.label 形式 (= 番号 "1·09:00"、 SVG 内 time embed で代替)
 *
 * 既存資産流用 (CEO 方針 「Alter Morning 用 API 資産は Plan で流用してよい」):
 *   - lib/shared/googleMapsLoader.ts (vanilla script loader、 frozen file)
 *   - /api/plan/anchors/geocode (server endpoint、 placesApiClient + placeResolver cache 流用)
 *   - lib/alter-morning/* の内部 logic は touch なし (call signature 経由のみ)
 *
 * 不変原則 (CEO + GPT 補正):
 *   - @vis.gl/react-google-maps 不採用 (vanilla JS)
 *   - 新 env / migration / dep すべて 0
 *   - sensitive anchor は外部 API に送らない (server endpoint 側で unresolved_sensitive)
 *   - Cache low-confidence guard: cache hit でも confidence<medium は server 側で unresolved_low_confidence
 *   - Lazy resolve: visible window 内 anchor のみ geocode 対象
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ExternalAnchor } from "@/lib/plan/external-anchor";

import {
  SENSITIVE_LABEL,
  anchorsForDay,
  formatTime,
  maskedAnchorTitle,
  utcMidnight,
} from "./_helpers";
import {
  useGoogleMapsScript,
  type GmapsLatLng,
  type GmapsMap,
  type GmapsMarker,
  type GmapsPolyline,
} from "@/lib/shared/googleMapsLoader";
import { usePlanBaseline, type BaselineCoords } from "./_usePlanBaseline";
import { usePlanGeocode } from "./_usePlanGeocode";
import {
  computeLivedGeographyFallback,
  type LivedGeographyFallback,
} from "@/lib/plan/livedGeographyFallback";

// ── Phase 3-N Map impl 9 closeout: flag 削除済み、 単一 path 化 (= 常に新 surface) ──
//   旧 UI (SelectedAnchorCard / CategoryGrid / UnresolvedAnchorsSection / StaticAlterSuggestionCard /
//   DaySwitcher / FAB) は本 file から物理削除済み。 PlanMapView 内 CIRCLE marker logic も削除。
//   旧 sub-components 専用 import (= GlassBadge / categoryIconMap / categoryColorMap / brandIconMap /
//   calendarProposalSelector / quietUndoWindow / DayGraphTimeline / ProposalChip / CATEGORY_META /
//   LOCATION_GROUP_ORDER / MAP_CATEGORY_MARKER / MAP_SENSITIVE_MARKER / categoryOf / categoryFrequencyVoice /
//   categoryTimeSignature / countOccurrences / formatJpDate / groupAnchorsByLocation / isoDate /
//   useMapTabMovementDisplay / useMapTabFeasibilityDisplay / feasibilityDisclosureAdapter /
//   isPlaceUnconfirmed / detectTimedAnchorOverlaps / formatLocationDisplayParts / addDays /
//   AddRequest / AnchorResolution / CategoryGroup / LocationCategory / LocationGroupKey) は
//   cleanup patch (= 2026-05-25) で物理削除済み。
import { MapBottomSheet } from "@/components/plan/map/MapBottomSheet";
import {
  convertExternalAnchorToMapSheet,
  resolveCategory as resolveMapEventCategory,
} from "@/lib/plan/map/adapters/externalAnchorMapAdapter";
import type { MapSheetViewModel } from "@/lib/plan/map/types";
// 9 closeout: 独自 pin (= 涙型 SVG data URI + 白抜き icon + 時刻 embed、 単一 path 化済み)
import { generatePinSvgDataUri, getPinSize } from "@/lib/plan/map/pinSvg";
// 9 closeout: 左下 当日リスト / 凡例 hybrid (= 単一 path 化済み)
import { DayItemsPanel, type DayItem } from "@/components/plan/map/DayItemsPanel";
import { MobilityLegCard } from "@/components/plan/map/MobilityLegCard";
import { ROUTE_MODE_COLORS, mapChipStateForLeg, mobilityChipPx, mobilityLegIconDataUri, type RouteTransportMode } from "@/lib/plan/map/routeMode";
import { buildFlightArcLine, buildGlassyLegLines, createRouteAuraAnimation, getRouteStyleForLeg, legChipPosition, shouldAnimateLeg, type GmapsMarkerWithSetPosition } from "@/lib/plan/map/routeStyle";
import { createDirectionsService, fetchLegInfo, fetchRoadSegmentPath, flightArcPath, toApiTravelMode, type LegDurState, type LegInfo } from "@/lib/plan/map/directionsService";
import { loadPriorLegMode, loadSelectedModesForDay, saveSelectedMode } from "@/lib/plan/map/selectedModeStore";
import { loadWeightedModeBelief } from "@/lib/plan/mobility/beliefReadAdapter";
import { resolveMobilityGuidance } from "@/lib/plan/mobility/mobilityGuidance";
import { buildFeedbackEntry, saveHypothesisFeedback } from "@/lib/plan/mobility/hypothesisFeedbackStore";
import { buildObservation, saveMobilityObservation } from "@/lib/plan/mobility/mobilityObservationStore";
import { resolveFocusLegIndex, resolveLegState } from "@/lib/plan/map/legState";
// 9b-1/9b-2 carry: selected pin title overlay (= sheet で隠れない map 上部固定 + 動的 position 計算)
import {
  MapSelectedPinLabel,
  type PinScreenPosition,
} from "@/components/plan/map/MapSelectedPinLabel";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// 9 closeout cleanup: CATEGORY_AGGREGATE_WINDOW_DAYS 削除済み
//   (= CategoryGrid 削除と同時に dead、 単一 path 化済み)
const MAP_HEIGHT_PX = 380;
const MAP_DEFAULT_ZOOM_FOR_RESOLVED_SINGLE = 14;
const MAP_DEFAULT_ZOOM_FOR_BASELINE_SINGLE = 11;
const SAME_POINT_TOLERANCE_DIGITS = 4; // 4 桁 ≒ 11m

/**
 * Map 描画 fallback center / zoom.
 *
 * CEO 補正 (2026-05-20): center 優先順位は **解決済 anchor > baseline > 本 fallback**。
 *   本 default は baseline すら取得できない例外時の最後の暫定。
 *
 * 仮説 (確定値ではない):
 *   - 東京 (35.6812, 139.7671) + zoom 10: 暫定 fallback、将来 baseline-aware center upgrade で消える
 *   - 別 wave で GPS / 現在地 center に upgrade も可
 *
 * 注: pins>=1 → pin coord 中心、baseline 存在 → baseline 中心。本 default は pins=0 + baseline=null の例外時のみ。
 */
const TEMPORARY_FALLBACK_MAP_CENTER = { lat: 35.6812, lng: 139.7671 };
const TEMPORARY_FALLBACK_MAP_ZOOM = 10;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Map pin の coord 解決方式:
 *   - "resolved": locationText を Places API で解決済 (具体 coord)
 *   - "baseline": locationText 解決不能 (sensitive 含む) → baseline coord に fallback
 *
 * CEO 補正 (2026-05-20): 「予定ができたら必ず pin にする」 哲学整合のため、
 *   不解決 anchor も baseline で pin 表示。visual で kind を区別 (resolved=filled、baseline=outlined)。
 */
interface AnchorWithCoord {
  anchor: ExternalAnchor;
  coord: GmapsLatLng;
  resolvedName: string;
  /**
   * Phase 2-G: "lived_geography" 追加 (= 信頼度つき生活圏 fallback)
   * 優先順位: resolved > (home baseline) > lived_geography > city/prefecture baseline
   */
  kind: "resolved" | "baseline" | "lived_geography";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function MapTab({
  anchors,
  now,
  onAnchorClick,
}: {
  anchors: ExternalAnchor[];
  now?: Date;
  /** anchor 行クリック / pin tap で AnchorDetailModal を開く (= sheet 「詳細を見る」 CTA で利用) */
  onAnchorClick?: (anchor: ExternalAnchor) => void;
}) {
  const baseNow = now ?? new Date();
  const todayDate = utcMidnight(baseNow);

  // 9 closeout: selectedDate は 「今日」 固定 (= DaySwitcher 削除済み)
  //   将来 day 切替再導入時は新設計で作り直す (= CEO Q3 判定)
  const selectedDate = todayDate;
  // A5-3: store の永続化キー(YYYY-MM-DD・utcMidnight 由来で安定)
  const dayKey = selectedDate.toISOString().slice(0, 10);

  // ── selectedPinId state (= 旧 newSelectedPinId、 9 closeout で rename) ──
  //   default null = 8 場面表 #1 「初期 selected なし」
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);

  // ── 当日 anchor 取得 (= recurring 展開 + exception_dates 全継承) ──
  const dayAnchors = useMemo(
    () => anchorsForDay(anchors, selectedDate),
    [anchors, selectedDate],
  );

  // ── geocode (= lazy resolve、 当日 anchor のみ) ──
  const { resolutions, loading: geocodeLoading, apiAvailable } =
    usePlanGeocode(dayAnchors);

  const { baselineCoords, loading: baselineLoading } = usePlanBaseline();
  const loading = geocodeLoading || baselineLoading;

  const visibleAnchors = dayAnchors;

  // ── pin tap handler (= 8 場面表準拠、 同 pin = no-op / 別 pin = 切替) ──
  const handlePinTap = useCallback(
    (anchor: ExternalAnchor) => {
      setSelectedPinId((prev) => (prev === anchor.id ? prev : anchor.id));
    },
    [],
  );

  // ── sheet close handler (= ✕ button or background tap、 場面 #4/#7) ──
  const handleSheetClose = useCallback(() => {
    setSelectedPinId(null);
  }, []);

  // A5-2: leg tap で MobilityLegCard を開く。store/recall/durations は未接続(後 slice)。
  const [openLeg, setOpenLeg] = useState<{ legKey: string; fromTitle: string; toTitle: string } | null>(null);
  const handleLegTap = useCallback((legKey: string, fromTitle: string, toTitle: string) => {
    setSelectedPinId(null);
    setOpenLeg({ legKey, fromTitle, toTitle });
  }, []);
  const handleLegClose = useCallback(() => setOpenLeg(null), []);

  // A5-3: selectedMode を localStorage 永続化(RouteTransportMode・9語)。store を mirror する state。
  const [selectedModeByLeg, setSelectedModeByLeg] = useState<Record<string, RouteTransportMode>>({});
  useEffect(() => {
    setSelectedModeByLeg(loadSelectedModesForDay(dayKey));
  }, [dayKey]);
  const handleLegSelect = useCallback(
    (legKey: string, mode: RouteTransportMode) => {
      saveSelectedMode(dayKey, legKey, mode);
      setSelectedModeByLeg((prev) => ({ ...prev, [legKey]: mode }));
    },
    [dayKey],
  );

  // ── selected anchor (= sheet/label/CTA 共通参照) ──
  const selectedAnchor = useMemo<ExternalAnchor | null>(() => {
    if (!selectedPinId) return null;
    return dayAnchors.find((a) => a.id === selectedPinId) ?? null;
  }, [selectedPinId, dayAnchors]);

  // ── sheet view model (= MapBottomSheet + MapSelectedPinLabel 用) ──
  const sheet = useMemo<MapSheetViewModel | null>(() => {
    if (!selectedAnchor) return null;
    return convertExternalAnchorToMapSheet(selectedAnchor);
  }, [selectedAnchor]);

  // ── route URL (= 「ここへの経路」 CTA、 Google Maps dir URL、 lat/lng 不在で null=disabled) ──
  const routeUrl = useMemo<string | null>(() => {
    if (!selectedAnchor) return null;
    const r = resolutions.get(selectedAnchor.id);
    if (!r || !isValidLatLng(r.lat, r.lng)) return null;
    return `https://www.google.com/maps/dir/?api=1&destination=${r.lat},${r.lng}`;
  }, [selectedAnchor, resolutions]);

  // ── 「詳細を見る」 handler (= 既存 onAnchorClick 経由で AnchorDetailModal 起動) ──
  const handleOpenDetail = useCallback(() => {
    if (!selectedAnchor || !onAnchorClick) return;
    onAnchorClick(selectedAnchor);
  }, [selectedAnchor, onAnchorClick]);

  // ── lived geography fallback (= 信頼度つき生活圏、 pin computation 用) ──
  const livedGeography: LivedGeographyFallback | null = useMemo(
    () => computeLivedGeographyFallback(anchors, resolutions, new Date()),
    [anchors, resolutions],
  );

  // ── 全 anchor を pin 化 (= 4 段階優先順位、 旧 MapTab logic 流用) ──
  //   1. resolved (= place_resolution_cache hit)
  //   2. home baseline
  //   3. lived_geography (= confidence gate 通過)
  //   4. city / prefecture baseline
  //   5. なし → silent drop (= 9 closeout: 旧 UnresolvedAnchorsSection 削除済みのため count 不要)
  const allPins = useMemo<AnchorWithCoord[]>(() => {
    const pins: AnchorWithCoord[] = [];
    for (const anchor of visibleAnchors) {
      const r = resolutions.get(anchor.id);
      if (r && isValidLatLng(r.lat, r.lng)) {
        pins.push({
          anchor,
          coord: { lat: r.lat, lng: r.lng },
          resolvedName: r.resolvedName,
          kind: "resolved",
        });
      } else if (baselineCoords && baselineCoords.source === "home") {
        pins.push({
          anchor,
          coord: { lat: baselineCoords.lat, lng: baselineCoords.lng },
          resolvedName: baselineCoords.label ?? "自宅 周辺",
          kind: "baseline",
        });
      } else if (livedGeography) {
        pins.push({
          anchor,
          coord: { lat: livedGeography.lat, lng: livedGeography.lng },
          resolvedName: "最近の場所傾向",
          kind: "lived_geography",
        });
      } else if (baselineCoords) {
        pins.push({
          anchor,
          coord: { lat: baselineCoords.lat, lng: baselineCoords.lng },
          resolvedName: baselineCoords.label ?? "baseline 周辺",
          kind: "baseline",
        });
      }
      // 9 closeout cleanup: noPin 配列削除 (= 旧 UnresolvedAnchorsSection で表示していたが、
      //   sub-section ごと削除済みのため pin 化失敗 anchor は silent drop)
    }
    return pins;
  }, [visibleAnchors, resolutions, baselineCoords, livedGeography]);

  // Slice 1 (API不要): 開いた leg の card data — focus 階層 state / readOnly(過去=実績) / recall / sensitive mask。
  //   FH mobilityCard を NT 構造へ忠実 port。視覚復元(ガラス線/chip/オーラ)は Tier 2。
  const mobilityCardData = useMemo(() => {
    if (!openLeg) return null;
    const sorted = [...allPins].sort((a, b) =>
      a.anchor.startTime.localeCompare(b.anchor.startTime),
    );
    let idx = -1;
    for (let i = 0; i < sorted.length - 1; i += 1) {
      if (`${sorted[i]!.anchor.id}__${sorted[i + 1]!.anchor.id}` === openLeg.legKey) {
        idx = i;
        break;
      }
    }
    if (idx < 0) return null;
    const ref = now ?? new Date();
    const nowMin = ref.getHours() * 60 + ref.getMinutes();
    const state = resolveLegState(idx, resolveFocusLegIndex(sorted, nowMin));
    const isDone = state === "done"; // 過去(2個前以前)=編集不可(実績の器)
    const todaySelected = selectedModeByLeg[openLeg.legKey] ?? null;
    // S2-A recall(既存): 今日未選択 かつ 過去 leg でない時だけ「前回」想起(localStorage 読取のみ・推薦ではない)
    const existingRecall =
      todaySelected || isDone
        ? null
        : (loadPriorLegMode(dayKey, openLeg.legKey)?.mode ?? null);
    // v0-D: 実 belief から guidance を決める(hypothesis surface か recall か 1 つに統一・補正1-3)
    const sensitive = !!(
      sorted[idx]!.anchor.sensitiveCategory || sorted[idx + 1]!.anchor.sensitiveCategory
    );
    const guidance = resolveMobilityGuidance({
      belief: loadWeightedModeBelief(openLeg.legKey), // ★v0-F: 実 S1-A 履歴 + feedback の precision 加重(mock でない)
      selectedMode: todaySelected,
      readOnly: isDone,
      sensitive,
      recallMode: existingRecall,
    });
    return {
      legKey: openLeg.legKey,
      fromTitle: maskedAnchorTitle(sorted[idx]!.anchor),
      toTitle: maskedAnchorTitle(sorted[idx + 1]!.anchor),
      readOnly: isDone,
      recallMode: guidance.recallMode,
      hypothesisCopy: guidance.hypothesisCopy,
      surfacedMode: guidance.surfacedMode, // v0-E: feedback の kind 判定用(surface 時のみ非 null)
      // L1-a: 観測前方記録の context（place key/timeband の算出元・anchor 由来・capture は onSelect で）
      observationContext: {
        toStartTime: sorted[idx + 1]!.anchor.startTime,
        originText: sorted[idx]!.anchor.locationText ?? null,
        destText: sorted[idx + 1]!.anchor.locationText ?? null,
        originSensitive: !!sorted[idx]!.anchor.sensitiveCategory,
        destSensitive: !!sorted[idx + 1]!.anchor.sensitiveCategory,
      },
    };
  }, [openLeg, allPins, selectedModeByLeg, now, dayKey]);

  // v0-E: mode 選択時に「仮説への応答」を別 store(hypothesisFeedback)へ記録する wrapper。
  //   既存 handleLegSelect(現在選択の保存=selectedModeStore)は不変。本 wrapper はその後段で feedback だけ追記。
  //   ★同期記録: クリック時の closure は更新前 mobilityCardData(=実際に表示された surfacedMode)を捕捉する。
  //   ★仮説非表示(surfacedMode null)/readOnly は buildFeedbackEntry が null を返し saveHypothesisFeedback は no-op。
  const handleLegSelectWithFeedback = useCallback(
    (legKey: string, mode: RouteTransportMode) => {
      handleLegSelect(legKey, mode); // 既存: selectedMode 永続化(不変)
      if (mobilityCardData && mobilityCardData.legKey === legKey) {
        saveHypothesisFeedback(
          dayKey,
          legKey,
          buildFeedbackEntry({
            surfacedMode: mobilityCardData.surfacedMode,
            chosenMode: mode,
            readOnly: mobilityCardData.readOnly,
          }),
        );
        // L1-a: 全選択を観測ログへ前方記録（★仮説非依存・silent・別 store・readOnly/invalid は buildObservation が null→no-op）
        saveMobilityObservation(
          dayKey,
          legKey,
          buildObservation({
            mode,
            dayISO: dayKey,
            toStartTime: mobilityCardData.observationContext.toStartTime,
            originText: mobilityCardData.observationContext.originText,
            destText: mobilityCardData.observationContext.destText,
            originSensitive: mobilityCardData.observationContext.originSensitive,
            destSensitive: mobilityCardData.observationContext.destSensitive,
            readOnly: mobilityCardData.readOnly,
          }),
        );
      }
    },
    [handleLegSelect, mobilityCardData, dayKey],
  );

  // A2: leg ごとの from/to 座標(時刻順・store/route と同一 legKey)。durations fetch 用。
  const legCoordsByKey = useMemo(() => {
    const sorted = [...allPins].sort((a, b) =>
      a.anchor.startTime.localeCompare(b.anchor.startTime),
    );
    const m: Record<string, { from: GmapsLatLng; to: GmapsLatLng }> = {};
    for (let i = 0; i < sorted.length - 1; i += 1) {
      const a = sorted[i]!;
      const b = sorted[i + 1]!;
      m[`${a.anchor.id}__${b.anchor.id}`] = { from: a.coord, to: b.coord };
    }
    return m;
  }, [allPins]);

  // 所要時間/乗換数: leg オープン時に client DirectionsService で 徒歩/車/電車 を取得(leg ごと cache・偽数字なし・fail-open)。
  const [legDur, setLegDur] = useState<LegDurState | null>(null);
  const legDurCacheRef = useRef<Map<string, LegDurState>>(new Map());
  useEffect(() => {
    if (!openLeg) {
      setLegDur(null);
      return;
    }
    const key = openLeg.legKey;
    const cached = legDurCacheRef.current.get(key);
    if (cached) {
      setLegDur(cached);
      return;
    }
    const maps = window.google?.maps;
    const coords = legCoordsByKey[key];
    const service = maps && coords ? createDirectionsService(maps) : null;
    if (!maps || !coords || !service) {
      setLegDur(null);
      return;
    }
    const tmWalk = toApiTravelMode(maps, "walk");
    const tmCar = toApiTravelMode(maps, "car");
    const tmTransit = toApiTravelMode(maps, "train");
    setLegDur({ loading: true, walk: null, drive: null, transit: null });
    let cancelled = false;
    void Promise.all([
      tmWalk ? fetchLegInfo(service, coords.from, coords.to, tmWalk) : Promise.resolve<LegInfo | null>(null),
      tmCar ? fetchLegInfo(service, coords.from, coords.to, tmCar) : Promise.resolve<LegInfo | null>(null),
      tmTransit ? fetchLegInfo(service, coords.from, coords.to, tmTransit) : Promise.resolve<LegInfo | null>(null),
    ]).then(([walk, drive, transit]) => {
      if (cancelled) return;
      const result: LegDurState = { loading: false, walk, drive, transit };
      legDurCacheRef.current.set(key, result);
      setLegDur(result);
    });
    return () => {
      cancelled = true;
    };
  }, [openLeg, legCoordsByKey]);

  // ── 左下 DayItemsPanel data (= 時刻順、 category 解決) ──
  const dayItemsForPanel = useMemo<DayItem[]>(() => {
    return [...dayAnchors]
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
      .map((a) => ({
        anchorId: a.id,
        category: resolveMapEventCategory(a),
      }));
  }, [dayAnchors]);

  // ── DayItemsPanel row tap handler (= anchorId → handlePinTap 経由) ──
  const handleDayItemTap = useCallback(
    (anchorId: string) => {
      const anchor = dayAnchors.find((a) => a.id === anchorId);
      if (anchor) handlePinTap(anchor);
    },
    [dayAnchors, handlePinTap],
  );

  // ── render (= 9 closeout: 単一 path、 flag check / 旧 UI なし) ──
  return (
    <div data-testid="plan-map-tab" className="relative">
      <PlanMapView
        pins={allPins}
        baselineCoords={baselineCoords}
        loading={loading}
        apiAvailable={apiAvailable}
        selectedAnchorId={selectedPinId}
        onPinClick={handlePinTap}
        onLegTap={handleLegTap}
        selectedModeByLeg={selectedModeByLeg}
        onBackgroundClick={handleSheetClose}
        dayItemsForPanel={dayItemsForPanel}
        onDayItemTap={handleDayItemTap}
        selectedSheetForLabel={sheet}
      />
      <MapBottomSheet
        sheet={sheet}
        onClose={handleSheetClose}
        onOpenDetail={onAnchorClick ? handleOpenDetail : undefined}
        routeUrl={routeUrl}
      />
      {openLeg && mobilityCardData && (
        <MobilityLegCard
          legKey={mobilityCardData.legKey}
          fromTitle={mobilityCardData.fromTitle}
          toTitle={mobilityCardData.toTitle}
          selectedMode={selectedModeByLeg[mobilityCardData.legKey] ?? null}
          durations={legDur}
          recallMode={mobilityCardData.recallMode}
          hypothesisCopy={mobilityCardData.hypothesisCopy}
          readOnly={mobilityCardData.readOnly}
          onSelect={handleLegSelectWithFeedback}
          onClose={handleLegClose}
        />
      )}
    </div>
  );
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 9 closeout: DaySwitcher 削除済み (= CEO Q3 判定、 新 map 体験には合わず)
//   将来 day 切替再導入時は新設計で作り直す
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PlanMapView (vanilla Google Maps)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function PlanMapView({
  pins,
  baselineCoords,
  loading,
  apiAvailable,
  selectedAnchorId,
  selectedModeByLeg = {},
  onPinClick,
  onLegTap,
  onBackgroundClick,
  dayItemsForPanel,
  onDayItemTap,
  selectedSheetForLabel,
}: {
  pins: AnchorWithCoord[];
  baselineCoords: BaselineCoords | null;
  loading: boolean;
  apiAvailable: boolean;
  /** 現在 selected な anchor id (= sheet/label sync key、 9 closeout で rename 済み) */
  selectedAnchorId: string | null;
  /** A5-3: leg ごとの選択 mode (= route 色づけ用、store mirror) */
  selectedModeByLeg?: Readonly<Record<string, RouteTransportMode>>;
  onPinClick?: (anchor: ExternalAnchor) => void;
  /** A5-2: leg(区間)中点の chip tap → 移動手段カードを開く */
  onLegTap?: (legKey: string, fromTitle: string, toTitle: string) => void;
  /**
   * 9 closeout (= 旧 9a-impl-fix1 carry): background tap → selected 解除 (= 8 場面表 #7)
   *   常に attach (= 単一 path 化済み)、 marker click 別 listener で消費後のみ発火。
   */
  onBackgroundClick?: () => void;
  /** DayItemsPanel data (= 時刻順 + category 解決済み、 9 closeout で常時 render) */
  dayItemsForPanel?: ReadonlyArray<DayItem>;
  /** DayItemsPanel row tap handler (= anchorId → selected sync) */
  onDayItemTap?: (anchorId: string) => void;
  /** selected pin の sheet (= MapSelectedPinLabel + spatial binding 用、 null なら overlay 非表示) */
  selectedSheetForLabel?: MapSheetViewModel | null;
}) {
  const { ready, keyAvailable } = useGoogleMapsScript();
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<GmapsMap | null>(null);
  const onPinClickRef = useRef(onPinClick);
  onPinClickRef.current = onPinClick;
  const onLegTapRef = useRef(onLegTap);
  onLegTapRef.current = onLegTap;
  // 9a-impl-fix1: background click handler ref (= Effect 1 内 listener が prop 変化に追従)
  const onBackgroundClickRef = useRef(onBackgroundClick);
  onBackgroundClickRef.current = onBackgroundClick;

  // 9 closeout cleanup: activeCategories useMemo 削除済み
  //   (= 旧 legend (CategoryGrid 内) 専用、 DayItemsPanel が hybrid 凡例を兼ねるため不要)

  // ─── Effect 1: Map instance を 1 度だけ作成 (keyAvailable + ready 確定時) ───
  //
  // pins / baseline 変化で再 mount しない (UI ちらつき回避)。
  // 初期 center は TEMPORARY_FALLBACK で開始、Effect 2 で baseline / pins に応じて即 update。
  useEffect(() => {
    if (!keyAvailable || !ready) return;
    const el = mapRef.current;
    if (!el) return;
    const maps = window.google?.maps;
    if (!maps) return;

    // 9 closeout: 単一 path 化済み (= zoomControl 常に有効、 現在地 button は別 layer で実装)
    const map: GmapsMap = new maps.Map(el, {
      gestureHandling: "cooperative",
      disableDefaultUI: true,
      zoomControl: true,
      clickableIcons: false,
      center: TEMPORARY_FALLBACK_MAP_CENTER,
      zoom: TEMPORARY_FALLBACK_MAP_ZOOM,
    });
    mapInstanceRef.current = map;

    // 9 closeout (= 旧 9a-impl-fix1 carry): background tap → selected 解除 (= 8 場面表 #7)
    //   常に attach。 Google Maps `click` event は marker click を消費後のみ発火 (= marker tap で誤発火しない)。
    //   handler は ref 経由で prop 変化に追従 (= Effect 1 は 1 度だけ実行されるため)。
    //
    //   型注記: GmapsMap interface に addListener 未公開のため、 実 Google Maps Map class の
    //   公開 method として local cast (= googleMapsLoader.ts 不触、 frozen file 制約遵守)。
    type MapWithListener = GmapsMap & {
      addListener: (event: string, handler: () => void) => { remove: () => void };
    };
    const backgroundClickListener = (map as MapWithListener).addListener("click", () => {
      onBackgroundClickRef.current?.();
    });

    return () => {
      backgroundClickListener.remove();
      mapInstanceRef.current = null;
    };
  }, [keyAvailable, ready]);

  // ─── Effect 2: pins / baseline 変化に応じて center/zoom + markers を update ───
  //
  // CEO 補正 (2026-05-20) center 優先順位:
  //   1. pins.length >= 2 → fitBounds 全 pin (resolved + baseline 両方含む)
  //   2. pins.length == 1 → 該 pin coord 中心、kind に応じて zoom (resolved=14、baseline=11)
  //   3. pins.length == 0 + baselineCoords あり → baseline 中心、zoom 11
  //   4. pins.length == 0 + baselineCoords なし → TEMPORARY_FALLBACK (Tokyo) 中心、zoom 10
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const maps = window.google?.maps;
    if (!maps) return;

    // center / zoom 戦略
    if (pins.length >= 2) {
      // 異なる coord が複数 → fitBounds
      const allSame = isSamePointCluster(pins.map((p) => p.coord));
      if (allSame) {
        // 全 pin 同点 → 中心 + 固定 zoom (kind 混在の場合は resolved 優先)
        const hasResolved = pins.some((p) => p.kind === "resolved");
        map.setCenter(pins[0]!.coord);
        map.setZoom(
          hasResolved
            ? MAP_DEFAULT_ZOOM_FOR_RESOLVED_SINGLE
            : MAP_DEFAULT_ZOOM_FOR_BASELINE_SINGLE,
        );
      } else {
        const bounds = new maps.LatLngBounds();
        for (const p of pins) bounds.extend(p.coord);
        map.fitBounds(bounds);
      }
    } else if (pins.length === 1) {
      // 1 pin → 該 pin 中心、kind に応じて zoom
      const single = pins[0]!;
      map.setCenter(single.coord);
      map.setZoom(
        single.kind === "resolved"
          ? MAP_DEFAULT_ZOOM_FOR_RESOLVED_SINGLE
          : MAP_DEFAULT_ZOOM_FOR_BASELINE_SINGLE,
      );
    } else if (baselineCoords) {
      // pins=0 + baseline あり → baseline 中心
      map.setCenter({ lat: baselineCoords.lat, lng: baselineCoords.lng });
      map.setZoom(MAP_DEFAULT_ZOOM_FOR_BASELINE_SINGLE);
    } else {
      // pins=0 + baseline なし → TEMPORARY_FALLBACK
      map.setCenter(TEMPORARY_FALLBACK_MAP_CENTER);
      map.setZoom(TEMPORARY_FALLBACK_MAP_ZOOM);
    }

    // 9 closeout cleanup: orderById Map / markerSpec 削除済み
    //   - orderById: 旧 marker.label "1·09:00" 形式 用、 9 closeout で marker.label 不使用化により dead
    //   - markerSpec: 旧 CIRCLE marker (MAP_CATEGORY_MARKER / MAP_SENSITIVE_MARKER) 用、 涙型 SVG 単一 path 化により dead

    // ── markers (= 涙型 SVG data URI 単一 path) ──
    const markers: GmapsMarker[] = [];
    for (const pin of pins) {
      const isSelected = pin.anchor.id === selectedAnchorId;

      // 9 closeout: 常に 涙型 SVG data URI marker (= 旧 CIRCLE 削除済み、 単一 path)
      //   - resolveMapEventCategory で EventCategory (= cafe/meal/work/home/other)
      //   - generatePinSvgDataUri で涙型 + カテゴリ色 + 白抜き icon + 時刻 embed
      //   - getPinSize で物理 size、 anchor は pin 尖り先で coord 紐付け
      const eventCategory = resolveMapEventCategory(pin.anchor);
      const pinSize = getPinSize(isSelected);
      const timeLabel = formatTime(pin.anchor.startTime);

      // GmapsIcon 拡張型 (= url field、 frozen file 不触のため local cast)
      type IconWithUrl = {
        url?: string;
        anchor?: ReturnType<typeof maps.Point extends abstract new (...args: never) => infer R ? () => R : never>;
      };

      const iconStyle: IconWithUrl & Record<string, unknown> = {
        url: generatePinSvgDataUri(eventCategory, isSelected, timeLabel),
        // anchor = pin 尖り先 (= 下端中央) で coord に attach、 label 部分は anchor より上
        anchor: new maps.Point(pinSize.width / 2, pinSize.pinTipY),
      };

      const baseTitle = pin.anchor.sensitiveCategory
        ? `[${SENSITIVE_LABEL[pin.anchor.sensitiveCategory]}] (詳細は modal で)`
        : pin.anchor.title;
      // Phase 2-G: pinKind 別に title suffix を分岐
      const markerTitle =
        pin.kind === "baseline"
          ? `${baseTitle} (場所未定 — baseline 周辺の概算)`
          : pin.kind === "lived_geography"
            ? `${baseTitle} (場所未定 — 最近の場所傾向の仮置き)`
            : baseTitle;

      // 9 closeout: 単一 path 化 — marker.label 不使用 (= SVG 内 time embed 済み、 二重表示防止)
      //   selected pin は z-index 100 で前面化 (= 重なり対策)
      const marker = new maps.Marker({
        map,
        position: pin.coord,
        title: markerTitle,
        icon: iconStyle,
        ...(isSelected ? { zIndex: 100 } : {}),
      });
      marker.addListener("click", () => {
        onPinClickRef.current?.(pin.anchor);
      });
      markers.push(marker);
    }

    return () => {
      // pin / baseline / selected 変化で markers 破棄、Map instance は keep alive
      for (const m of markers) m.setMap(null);
    };
  }, [pins, baselineCoords, selectedAnchorId]);

  // ── Effect: route 描画 (per-leg ガラス質線 + mode チップ + aura)。Slice 2/3。 ──
  //   markers effect から分離 → mode 選択で pin を再生成せず route だけ再描画(flicker なし)。
  //   進捗: instant 直線 glassy → DirectionsService で道路 path へ差し替え(flight=弧/未対応=点線、chip を path 中点へ snap、current=aura)。
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const maps = window.google?.maps;
    if (!maps) return;
    const sortedPins = [...pins].sort((a, b) =>
      a.anchor.startTime.localeCompare(b.anchor.startTime),
    );
    if (sortedPins.length < 2 || isSamePointCluster(sortedPins.map((p) => p.coord))) return;
    const now = new Date();
    const focusLegIndex = resolveFocusLegIndex(
      sortedPins,
      now.getHours() * 60 + now.getMinutes(),
    );
    // per-leg ViewModel (= legKey/from/to/state/displayMode。★距離→mode 推定なし)
    const legs = sortedPins.slice(0, -1).map((a, i) => {
      const b = sortedPins[i + 1]!;
      const legKey = `${a.anchor.id}__${b.anchor.id}`;
      return {
        from: a.coord,
        to: b.coord,
        legKey,
        fromTitle: a.anchor.title,
        toTitle: b.anchor.title,
        state: resolveLegState(i, focusLegIndex),
        displayMode: (selectedModeByLeg[legKey] ?? "unknown") as RouteTransportMode,
      };
    });
    let lines: GmapsPolyline[] = [];
    const chips: GmapsMarker[] = [];
    const auraMarkers: GmapsMarker[] = [];
    const auraTimers: number[] = [];
    let routeCancelled = false;

    // mode チップ (instant・直線中点。後で道路 path 中点へ snap)
    for (const leg of legs) {
      const chipState = mapChipStateForLeg(leg.state);
      const px = mobilityChipPx(chipState);
      const chip = new maps.Marker({
        map,
        position: legChipPosition([leg.from, leg.to]),
        icon: {
          url: mobilityLegIconDataUri(leg.displayMode, chipState),
          anchor: new maps.Point(px / 2, px / 2),
        },
        title: "移動手段",
      });
      chip.addListener("click", () =>
        onLegTapRef.current?.(leg.legKey, leg.fromTitle, leg.toTitle),
      );
      chips.push(chip);
    }

    // (1) instant 直線 glassy fallback (道路解決前/不可でも確実に表示)
    for (const leg of legs) {
      const built = buildGlassyLegLines(
        maps,
        map,
        [leg.from, leg.to],
        getRouteStyleForLeg(leg.state, leg.displayMode),
      );
      for (const ln of built.lines) lines.push(ln);
    }

    // (2) DirectionsService が使えれば 道路 path へ差し替え (flight=弧/未対応=点線、chip snap、current=aura)
    const service = createDirectionsService(maps);
    if (service) {
      void Promise.all(
        legs.map((leg) => {
          const apiMode = toApiTravelMode(maps, leg.displayMode);
          return apiMode === null
            ? Promise.resolve<GmapsLatLng[] | null>(null)
            : fetchRoadSegmentPath(service, leg.from, leg.to, apiMode);
        }),
      )
        .then((segmentPaths) => {
          if (routeCancelled) return;
          const anyDrawable = legs.some(
            (leg, i) =>
              leg.displayMode === "flight" ||
              (segmentPaths[i] != null && segmentPaths[i]!.length >= 2),
          );
          if (!anyDrawable) return;
          for (const l of lines) l.setMap(null);
          lines = [];
          for (const t of auraTimers) clearInterval(t);
          auraTimers.length = 0;
          for (const mk of auraMarkers) mk.setMap(null);
          auraMarkers.length = 0;
          for (let i = 0; i < legs.length; i += 1) {
            const leg = legs[i]!;
            const chip = chips[i];
            if (leg.displayMode === "flight") {
              const arc = flightArcPath(leg.from, leg.to);
              lines.push(buildFlightArcLine(maps, map, arc, ROUTE_MODE_COLORS.flight));
              if (chip) (chip as GmapsMarkerWithSetPosition).setPosition(arc[Math.floor(arc.length / 2)]!);
              continue;
            }
            const seg = segmentPaths[i];
            const resolved = seg != null && seg.length >= 2;
            const legPath = resolved ? seg! : [leg.from, leg.to];
            const baseStyle = getRouteStyleForLeg(leg.state, leg.displayMode);
            const style = resolved ? baseStyle : { ...baseStyle, dashed: true };
            const built = buildGlassyLegLines(maps, map, legPath, style);
            for (const ln of built.lines) lines.push(ln);
            if (resolved && shouldAnimateLeg(leg.state) && built.glow) {
              const aura = createRouteAuraAnimation(maps, map, built.glow, leg.to, style.color);
              for (const ring of aura.markers) auraMarkers.push(ring);
              auraTimers.push(aura.timerId);
            }
            if (chip) (chip as GmapsMarkerWithSetPosition).setPosition(legChipPosition(legPath));
          }
        })
        .catch(() => {
          /* fail-open: instant 直線のまま */
        });
    }

    return () => {
      routeCancelled = true;
      for (const t of auraTimers) clearInterval(t);
      for (const l of lines) l.setMap(null);
      for (const c of chips) c.setMap(null);
      for (const mk of auraMarkers) mk.setMap(null);
    };
  }, [pins, selectedModeByLeg]);

  // ─── Effect 3 (9b-2): pin screen position 計算 (= MapSelectedPinLabel spatial binding 用) ───
  //   selectedAnchorId 変化 + bounds_changed event で再計算、 setState で label に流す。
  //   bounds / addListener API は GmapsMap interface 未公開のため local cast。
  //
  //   ★ Rules of Hooks 厳守: 早期 return より **前** に declare (= fix2 と同 pattern)。
  const [selectedPinScreenPos, setSelectedPinScreenPos] = useState<PinScreenPosition | null>(null);
  useEffect(() => {
    const map = mapInstanceRef.current;
    const mapDiv = mapRef.current;
    if (!map || !mapDiv || !selectedAnchorId) {
      setSelectedPinScreenPos(null);
      return;
    }
    const selectedPin = pins.find((p) => p.anchor.id === selectedAnchorId);
    if (!selectedPin) {
      setSelectedPinScreenPos(null);
      return;
    }

    // GmapsMap interface に getBounds / addListener 未公開のため cast (= 既存 pattern)
    type MapWithBoundsAndListener = GmapsMap & {
      getBounds: () =>
        | {
            getNorthEast: () => { lat: () => number; lng: () => number };
            getSouthWest: () => { lat: () => number; lng: () => number };
          }
        | undefined;
      addListener: (event: string, handler: () => void) => { remove: () => void };
    };
    const mapExt = map as MapWithBoundsAndListener;

    const updatePosition = () => {
      const bounds = mapExt.getBounds?.();
      if (!bounds) return;
      const ne = bounds.getNorthEast();
      const sw = bounds.getSouthWest();
      const rect = mapDiv.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      // Linear 比例計算 (= Mercator 非線形誤差は label 配置の精度として無視可)
      const x =
        ((selectedPin.coord.lng - sw.lng()) / (ne.lng() - sw.lng())) * rect.width;
      const y =
        ((ne.lat() - selectedPin.coord.lat) / (ne.lat() - sw.lat())) * rect.height;

      setSelectedPinScreenPos({
        x,
        y,
        mapWidth: rect.width,
        mapHeight: rect.height,
        // sheet 表示中の前提 (= selectedAnchorId set → MapBottomSheet open、 単一 path)
        sheetVisible: true,
      });
    };

    // 初回計算 + bounds_changed listener
    updatePosition();
    const listener = mapExt.addListener("bounds_changed", updatePosition);
    return () => listener.remove();
  }, [selectedAnchorId, pins]);

  // 9 closeout: 現在地 button handler (= navigator.geolocation で center 移動、 単一 path)
  //   失敗時は silent (= permission denied / unavailable で UI 不変)
  //
  //   ★ Rules of Hooks 厳守: 早期 return (= keyAvailable / ready) より **前** に declare。
  const handleGoToCurrentLocation = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const map = mapInstanceRef.current;
        if (!map) return;
        // setCenter のみ使用 (= GmapsMap 型 contract、 panTo は未公開)
        map.setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        /* silent fail (= permission denied 等) */
      },
      { timeout: 8000 },
    );
  }, []);

  // ─── render: keyAvailable=false / script 未 ready のみ placeholder、それ以外は Map 本体 ───

  if (!keyAvailable) {
    return (
      <MapPlaceholder
        text="地図の表示には API キーが設定されていません"
        sub="カテゴリ一覧と予定リストは下に表示されます"
        testId="plan-map-key-missing"
      />
    );
  }
  if (!ready) {
    // Google Maps script load 中 (NEXT_PUBLIC_*MAPS*BROWSER_KEY 設定済、JS API 取得中)
    return (
      <MapPlaceholder
        text="地図を読み込んでいます..."
        sub="少しお待ちください"
        testId="plan-map-loading-script"
      />
    );
  }

  // keyAvailable && ready: Map 本体は常に描画。状態は overlay で重ねる。
  // CEO 補正: 「予定 → pin guarantee」 反映、overlay 文言を pin の有無 + baseline 状況で adaptive 化。
  const overlay = (() => {
    if (loading) {
      return {
        text: "あなたの地理を確認中...",
        sub: "場所を解決中、解決され次第 pin が並びます",
        testId: "plan-map-overlay-loading",
      };
    }
    if (pins.length === 0 && !baselineCoords) {
      // pin 0 + baseline 未設定 → user に baseline 設定を促す
      return {
        text: "予定 + baseline を設定すると、ここに並びます",
        sub: "/baseline で居住地を設定すると、場所未定の予定も baseline 周辺の pin として表示されます",
        testId: "plan-map-overlay-no-pins-no-baseline",
      };
    }
    if (pins.length === 0 && baselineCoords) {
      // pin 0 + baseline あり (=今後 N 日の予定が 0 件)
      return {
        text: "今後の予定がまだありません",
        sub: `予定を追加すると、${baselineCoords.label ?? "あなたの地理"} の pin として並びます`,
        testId: "plan-map-overlay-no-anchors",
      };
    }
    if (!apiAvailable) {
      // pin あるが server geocode 不能 → resolved pin は出ないが baseline pin は出る
      return {
        text: "場所の解決が一時的に利用できません",
        sub: "予定は baseline 周辺の概算 pin として表示されます",
        testId: "plan-map-overlay-api-unavailable",
      };
    }
    // pin あり (resolved または baseline)、overlay なし
    return null;
  })();

  return (
    <div className="relative w-full">
      <div
        ref={mapRef}
        data-testid="plan-map-view"
        role="region"
        aria-label="マップ (今日の予定の場所)"
        className="w-full overflow-hidden"
        style={{
          // 9 closeout: full-bleed dvh-based (= header + tab area 約 130px 引く)
          height: "calc(100dvh - 130px)",
        }}
      />
      {/* 9 closeout: 現在地 button (= 単一 path、 右上 absolute、 zoom default 右下 と分離)
       *   重なり解消: Google Maps default zoom = 右下 → 現在地 button = 右上
       */}
      <button
        type="button"
        onClick={handleGoToCurrentLocation}
        aria-label="現在地を中心に表示"
        data-testid="plan-map-current-location"
        className="absolute right-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-700 shadow-md transition hover:bg-slate-50 focus:outline-none focus-visible:border focus-visible:border-slate-300"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width={20}
          height={20}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden={true}
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2 v3" />
          <path d="M12 19 v3" />
          <path d="M2 12 h3" />
          <path d="M19 12 h3" />
        </svg>
      </button>
      {overlay && (
        <div
          data-testid={overlay.testId}
          className="absolute inset-x-3 top-3 pointer-events-none"
        >
          <div className="bg-white/90 backdrop-blur-sm rounded-xl px-4 py-3 shadow-sm border border-slate-200">
            <p className="text-sm font-medium text-slate-700">
              {overlay.text}
            </p>
            <p className="text-xs text-slate-500 mt-1">{overlay.sub}</p>
          </div>
        </div>
      )}

      {/* 9 closeout: DayItemsPanel (= 左下 当日リスト hybrid、 単一 path)
       *   sheet 表示中は panel hide (= 視線競合解消、 9b-4)
       *     - sheet 閉じる (= ✕ or 余白 tap、 場面 #4/#7) で panel 再表示
       *     - pin 切替は map pin tap で行う (= 場面 #8、 panel 不要)
       */}
      {dayItemsForPanel && onDayItemTap && !selectedSheetForLabel && (
        <DayItemsPanel
          items={dayItemsForPanel}
          selectedId={selectedAnchorId}
          onItemTap={onDayItemTap}
        />
      )}

      {/* 9 closeout: MapSelectedPinLabel (= 動的 pin 追従 + Y clamp、 単一 path)
       *   - sheet null なら自動非表示 (= label 内部で return null)
       *   - selectedPinScreenPos set → pin 真上寄り + sheet で隠れない Y clamp
       *   - selectedPinScreenPos null → top-center fallback (= 9b-1 挙動)
       */}
      <MapSelectedPinLabel
        sheet={selectedSheetForLabel ?? null}
        pinPosition={selectedPinScreenPos}
      />

      {/* 9 closeout: 旧 Category legend (= 「map 上は軽く」 spec v3 §0、 sheet が主戦場) 削除済み
       *   DayItemsPanel が左下凡例 + 当日リスト hybrid を兼ねるため不要 */}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MapPlaceholder (failsafe states 共通 UI)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function MapPlaceholder({
  text,
  sub,
  testId,
}: {
  text: string;
  sub: string;
  testId: string;
}) {
  return (
    <div
      data-testid={testId}
      className="w-full rounded-2xl mb-4 bg-gradient-to-br from-slate-50 to-indigo-50/50 flex flex-col items-center justify-center px-4 text-center"
      style={{ height: `${MAP_HEIGHT_PX}px` }}
    >
      <p className="text-sm text-slate-600">{text}</p>
      <p className="text-xs text-slate-400 mt-2">{sub}</p>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 9 closeout: SelectedAnchorCard / CategoryGrid / CategoryCard / UnresolvedAnchorsSection 全削除済み
//   旧 OFF path 専用 sub-components、 単一 path 化で不要に。
//   - SelectedAnchorCard → MapBottomSheet (= 新)
//   - CategoryGrid / CategoryCard → DayItemsPanel (= 新)
//   - UnresolvedAnchorsSection → 9b-1〜9b-6 で新 surface に統合
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Pure helpers (Map 描画前提条件チェック)
// 9 closeout: StaticAlterSuggestionCard 削除済み (= 旧 Phase 2-B 用、 新 surface では sheet が役割を引き継ぐ)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function isValidLatLng(lat: unknown, lng: unknown): boolean {
  if (typeof lat !== "number" || typeof lng !== "number") return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90) return false;
  if (lng < -180 || lng > 180) return false;
  return true;
}

function isSamePointCluster(coords: GmapsLatLng[]): boolean {
  if (coords.length <= 1) return true;
  const first = coords[0]!;
  const fLat = first.lat.toFixed(SAME_POINT_TOLERANCE_DIGITS);
  const fLng = first.lng.toFixed(SAME_POINT_TOLERANCE_DIGITS);
  return coords.every(
    (c) =>
      c.lat.toFixed(SAME_POINT_TOLERANCE_DIGITS) === fLat &&
      c.lng.toFixed(SAME_POINT_TOLERANCE_DIGITS) === fLng,
  );
}
