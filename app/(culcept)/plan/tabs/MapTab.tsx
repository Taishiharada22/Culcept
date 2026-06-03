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
  utcMidnight,
} from "./_helpers";
import {
  useGoogleMapsScript,
  type GmapsApi,
  type GmapsIcon,
  type GmapsLatLng,
  type GmapsMap,
  type GmapsMarker,
  type GmapsMarkerOptions,
  type GmapsPolyline,
  type GmapsPolylineOptions,
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
  // S1-A: 移動手段選択の永続化スコープ = 当日 (YYYY-MM-DD)。 別日に漏れないための日別キー。
  //   utcMidnight 由来なので toISOString().slice(0,10) で安定した日付文字列になる。
  const dayKey = selectedDate.toISOString().slice(0, 10);

  // ── selectedPinId state (= 旧 newSelectedPinId、 9 closeout で rename) ──
  //   default null = 8 場面表 #1 「初期 selected なし」
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  // S1-A: leg ごとのユーザー選択移動手段。 localStorage に当日スコープで永続化 (DB/Supabase なし)。
  //   初期値は {} (= SSR と一致)、 復元は下の useEffect で mount 後に行う (hydration 不整合回避)。
  const [selectedModeByLeg, setSelectedModeByLeg] = useState<
    Record<string, RouteTransportMode>
  >({});
  // v1 Step 2a: 開いている移動手段カードの legKey (null = 非表示)
  const [openMobilityLegKey, setOpenMobilityLegKey] = useState<string | null>(
    null,
  );
  // S1-A: 当日の保存済み移動手段を復元 (mount 後 client のみ)。 dayKey 変化で各日のスコープを読む。
  //   破損/未保存/SSR は loadPersistedLegModes が {} を返す (fail-open)。
  useEffect(() => {
    setSelectedModeByLeg(loadPersistedLegModes(dayKey));
  }, [dayKey]);

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
      setOpenMobilityLegKey(null); // 相互排他: 移動手段カードを閉じる
      setSelectedPinId((prev) => (prev === anchor.id ? prev : anchor.id));
    },
    [],
  );

  // ── sheet close handler (= ✕ button or background tap、 場面 #4/#7) ──
  const handleSheetClose = useCallback(() => {
    setSelectedPinId(null);
  }, []);

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

  // ── v1 Step 2a: 移動手段カード (leg チップ tap で開閉、 手段選択を local state へ) ──
  const handleLegChipClick = useCallback((legKey: string) => {
    setSelectedPinId(null); // 相互排他: pin sheet を閉じる
    setOpenMobilityLegKey(legKey);
  }, []);
  const handleMobilityCardClose = useCallback(
    () => setOpenMobilityLegKey(null),
    [],
  );
  const handleSelectLegMode = useCallback(
    (legKey: string, mode: RouteTransportMode) => {
      // S1-A: 選択を即 localStorage へ永続化 (best-effort)。 updater 内 save は冪等
      //   (StrictMode の二重実行でも同一 JSON を書くだけ)。 reactive effect の初回上書きを避ける狙い。
      setSelectedModeByLeg((prev) => {
        const next = { ...prev, [legKey]: mode };
        savePersistedLegModes(dayKey, next);
        return next;
      });
    },
    [dayKey],
  );

  // 開いている leg の card data (= from/to title + selectedMode + 過去判定 readOnly)
  const mobilityCard = useMemo(() => {
    if (!openMobilityLegKey) return null;
    const sorted = [...allPins].sort((a, b) =>
      a.anchor.startTime.localeCompare(b.anchor.startTime),
    );
    let idx = -1;
    for (let i = 0; i < sorted.length - 1; i += 1) {
      if (
        legKeyOf(sorted[i]!.anchor.id, sorted[i + 1]!.anchor.id) ===
        openMobilityLegKey
      ) {
        idx = i;
        break;
      }
    }
    if (idx < 0) return null;
    const titleOf = (a: ExternalAnchor) =>
      a.sensitiveCategory ? `[${SENSITIVE_LABEL[a.sensitiveCategory]}]` : a.title;
    const ref = now ?? new Date();
    const nowMin = ref.getHours() * 60 + ref.getMinutes();
    const state = resolveLegState(idx, resolveFocusLegIndex(sorted, nowMin));
    return {
      legKey: openMobilityLegKey,
      fromTitle: titleOf(sorted[idx]!.anchor),
      toTitle: titleOf(sorted[idx + 1]!.anchor),
      selectedMode: selectedModeByLeg[openMobilityLegKey] ?? null,
      readOnly: state === "done", // 過去(2個前以前) = 編集不可 (実績の器)
    };
  }, [openMobilityLegKey, allPins, selectedModeByLeg, now]);

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
        onBackgroundClick={handleSheetClose}
        dayItemsForPanel={dayItemsForPanel}
        onDayItemTap={handleDayItemTap}
        selectedSheetForLabel={sheet}
        selectedModeByLeg={selectedModeByLeg}
        onLegChipClick={handleLegChipClick}
        mobilityActive={openMobilityLegKey !== null}
      />
      <MapBottomSheet
        sheet={sheet}
        onClose={handleSheetClose}
        onOpenDetail={onAnchorClick ? handleOpenDetail : undefined}
        routeUrl={routeUrl}
      />
      {mobilityCard && (
        <MobilityLegCard
          legKey={mobilityCard.legKey}
          fromTitle={mobilityCard.fromTitle}
          toTitle={mobilityCard.toTitle}
          selectedMode={mobilityCard.selectedMode}
          readOnly={mobilityCard.readOnly}
          onSelect={handleSelectLegMode}
          onClose={handleMobilityCardClose}
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
  onPinClick,
  onBackgroundClick,
  dayItemsForPanel,
  onDayItemTap,
  selectedSheetForLabel,
  selectedModeByLeg,
  onLegChipClick,
  mobilityActive,
}: {
  pins: AnchorWithCoord[];
  baselineCoords: BaselineCoords | null;
  loading: boolean;
  apiAvailable: boolean;
  /** 現在 selected な anchor id (= sheet/label sync key、 9 closeout で rename 済み) */
  selectedAnchorId: string | null;
  onPinClick?: (anchor: ExternalAnchor) => void;
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
  /** v1 Step 2a: leg ごとのユーザー選択移動手段 (= 線/チップの色に反映)。 */
  selectedModeByLeg?: Record<string, RouteTransportMode>;
  /** v1 Step 2a: leg チップ tap → 親へ legKey (= 移動手段カードを開く)。 */
  onLegChipClick?: (legKey: string) => void;
  /** v1 Step 2a: 移動手段カード表示中 (= DayItemsPanel と競合回避で hide)。 */
  mobilityActive?: boolean;
}) {
  const { ready, keyAvailable } = useGoogleMapsScript();
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<GmapsMap | null>(null);
  const onPinClickRef = useRef(onPinClick);
  onPinClickRef.current = onPinClick;
  // 9a-impl-fix1: background click handler ref (= Effect 1 内 listener が prop 変化に追従)
  const onBackgroundClickRef = useRef(onBackgroundClick);
  onBackgroundClickRef.current = onBackgroundClick;
  // v1 Step 2a: leg チップ tap handler (= Effect 内 marker listener が prop 変化に追従)
  const onLegChipClickRef = useRef(onLegChipClick);
  onLegChipClickRef.current = onLegChipClick;

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

    // ── route polyline (時刻順 pin を「道路沿い」で connect、移動 OS 風の階層表示) ──
    //
    // 設計 (Reality Control OS — v2.1 情報設計: 全部主張ではなく "次に動く区間" を立てる):
    //   - sortedPins は anchor.startTime ascending、pin.kind 不問
    //   - 1 pin 以下 / 全 pin 同点 は polyline 描画しない
    //   - 順番は固定 (= "1 から順"、 並べ替え/TSP はしない)
    //   - 階層 (= 全体は俯瞰、 焦点は 1 つ):
    //       past   = 細い・薄い・グレー・点線 (引く)
    //       future = 中細・mode 色・点線 (控えめ・アニメ無し)
    //       next   = 太い・mode 色・solid + 白 casing + 控えめ flow animation (主役)
    //   - 移動手段で色分け (resolveTransportMode)。 現状 mode source 無 → 全 leg "unknown" 中立色。
    //   - progressive enhancement: まず中立の直線 → 道路 path 取得でき次第 区間別 style へ差し替え。
    //   - polyline は pin marker の下層 (marker が上に重なる)
    //
    // 注: baseline pin が混在すると line が baseline 経由になる (= "今日この順で動く" 視覚化)。
    const sortedPins = [...pins].sort((a, b) =>
      a.anchor.startTime.localeCompare(b.anchor.startTime),
    );
    const routePolylines: GmapsPolyline[] = [];
    const routeAnimationTimers: number[] = [];
    const legIconMarkers: GmapsMarker[] = [];
    let routeCancelled = false;
    if (
      sortedPins.length >= 2 &&
      !isSamePointCluster(sortedPins.map((p) => p.coord))
    ) {
      const coords = sortedPins.map((p) => p.coord);
      // 焦点区間 (= 次に動くべき leg) を現在時刻から決定
      const now = new Date();
      const focusLegIndex = resolveFocusLegIndex(
        sortedPins,
        now.getHours() * 60 + now.getMinutes(),
      );
      // 区間ごとの表示 ViewModel (= 表示の器)。 state/mode をここで確定し、 描画は ViewModel を消費する
      const legViewModels = buildRouteLegViewModels(
        sortedPins,
        focusLegIndex,
        selectedModeByLeg,
      );

      // ── Mobility icon layer v1 Step 1: 各 leg 中点に「移動チップ」を表示 ──
      //   displayMode の色で着色 (現状すべて unknown=中立スレート)。 done(過去) は faint。
      //   Step 1 は表示のみ (clickable:false / state なし)。 Step 2 で tap→カード→手段切替を載せる。
      //   ★距離推定はしない: 色は displayMode (= 実 selectedMode が無い今は unknown) に従うだけ。
      for (const vm of legViewModels) {
        // Step 1.1: 初期は直線中点 (描画後に道路ルート線の中点へ寄せる)
        const mid = legChipPosition([vm.from, vm.to]);
        const chipState = mapChipStateForLeg(vm.state);
        const chipPx = mobilityChipPx(chipState);
        const iconMarker = new maps.Marker({
          map,
          position: mid,
          icon: {
            url: mobilityLegIconDataUri(vm.displayMode, chipState),
            anchor: new maps.Point(chipPx / 2, chipPx / 2),
          },
          clickable: true, // Step 2a: tap → 移動手段カード
        } as MobilityMarkerOptions);
        // チップ tap → 親へ legKey を渡しカードを開く (= ref で最新 handler に追従)
        iconMarker.addListener("click", () => {
          onLegChipClickRef.current?.(vm.legKey);
        });
        legIconMarkers.push(iconMarker);
      }

      // (1) 中立の直線を即描画 — ルート解決前 / DirectionsService 不可 / 失敗時の確実な表示
      let straightFallback: GmapsPolyline | null = new maps.Polyline({
        map,
        path: coords,
        strokeColor: ROUTE_MODE_COLORS.unknown,
        strokeOpacity: 0.6,
        strokeWeight: 4,
        clickable: false,
      } as RoutePolylineOptions);
      routePolylines.push(straightFallback);

      // (2) DirectionsService が使える場合のみ、区間ごとの道路ルート + 階層 style へ差し替え (fail-open)
      const directionsService = createDirectionsService(maps);
      if (directionsService) {
        // 区間ごとに displayMode → API travelMode を解決して fetch (flight は道路ルートにしない)
        Promise.all(
          legViewModels.map((vm) => {
            const apiMode = toApiTravelMode(maps, vm.displayMode);
            if (apiMode === null) {
              return Promise.resolve<GmapsLatLng[] | null>(null); // flight → 空路 (arc/点線)
            }
            return fetchRoadSegmentPath(
              directionsService,
              vm.from,
              vm.to,
              apiMode,
            );
          }),
        )
          .then((segmentPaths) => {
            if (routeCancelled) return;
            // 描けるものが 1 つも無い (= flight も無く全 fetch 失敗) → 中立直線のまま (ちらつき回避)
            const anyDrawable = legViewModels.some(
              (vm, i) =>
                vm.displayMode === "flight" ||
                (segmentPaths[i] != null && segmentPaths[i]!.length >= 2),
            );
            if (!anyDrawable) return;

            // 直線 fallback を消して、区間ごとの mode 別ジオメトリ + 階層 style へ
            straightFallback?.setMap(null);
            if (straightFallback) {
              const fi = routePolylines.indexOf(straightFallback);
              if (fi >= 0) routePolylines.splice(fi, 1);
              straightFallback = null;
            }

            for (let i = 0; i < legViewModels.length; i += 1) {
              const vm = legViewModels[i]!;
              const chip = legIconMarkers[i];

              // 飛行機: 道路ルートにせず、空路風の arc を点線で描く (= 概念表示、 偽の道路は描かない)
              if (vm.displayMode === "flight") {
                const arc = flightArcPath(vm.from, vm.to);
                routePolylines.push(
                  new maps.Polyline({
                    map,
                    path: arc,
                    strokeOpacity: 0,
                    icons: dottedRouteIcons(maps, ROUTE_MODE_COLORS.flight, 0.9),
                    zIndex: ROUTE_Z_AHEAD,
                    clickable: false,
                  } as RoutePolylineOptions),
                );
                if (chip) {
                  (chip as GmapsMarkerWithSetPosition).setPosition(
                    arc[Math.floor(arc.length / 2)]!,
                  );
                }
                continue;
              }

              // 道路系: 取得できた区間は道路 path、 取れない区間 (TRANSIT/BICYCLING 失敗等) は
              //   from→to 直線 + 点線化 (= 「この手段の経路は未対応」を正直に視覚化、 偽の道路は描かない)
              const seg = segmentPaths[i];
              const resolved = seg != null && seg.length >= 2;
              const legPath: GmapsLatLng[] = resolved ? seg! : [vm.from, vm.to];
              if (legPath.length < 2) continue;
              const baseStyle = getRouteStyleForLeg(vm.state, vm.displayMode);
              const style = resolved ? baseStyle : { ...baseStyle, dashed: true };
              const built = buildGlassyLegLines(maps, map, legPath, style);
              for (const line of built.lines) routePolylines.push(line);
              // 発光呼吸 + ノード鼓動 は「解決した current(今→次)」区間のみ
              if (resolved && shouldAnimateLeg(vm.state) && built.glow) {
                const aura = createRouteAuraAnimation(
                  maps,
                  map,
                  built.glow,
                  vm.to, // 次の目的地 = 鼓動させるノード
                  style.color,
                );
                for (const ring of aura.markers) legIconMarkers.push(ring);
                routeAnimationTimers.push(aura.timerId);
              }
              // チップを実際の描画 path 線上の中点へスナップ
              if (chip) {
                (chip as GmapsMarkerWithSetPosition).setPosition(
                  legChipPosition(legPath),
                );
              }
            }
          })
          .catch(() => {
            // fail-open: 中立の直線のまま
          });
      }
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
      // pin / baseline / selected 変化で markers + route polyline + flow animation 破棄、Map instance は keep alive
      routeCancelled = true; // 進行中の道路ルート差し替えを無効化 (cleanup 後の描画防止)
      for (const t of routeAnimationTimers) clearInterval(t);
      for (const m of markers) m.setMap(null);
      for (const m of legIconMarkers) m.setMap(null);
      for (const pl of routePolylines) pl.setMap(null);
    };
  }, [pins, baselineCoords, selectedAnchorId, selectedModeByLeg]);

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
      {dayItemsForPanel && onDayItemTap && !selectedSheetForLabel && !mobilityActive && (
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
// MobilityLegCard (v2 判断OS化): leg チップ tap で開く移動手段カード
//   - ✦おすすめ枠 (= 判断OS。 実 recommendedMode が来たら点灯、 無ければ正直に「順次提案」)
//   - 主な手段 / 制限あり(β) にグルーピング、 注記の氾濫を βバッジ + 1行脚注へ集約
//   - 選択は mode 色でハイライト、 過去(done) leg は readOnly
//   - ★経路ジオメトリ・推奨の中身は実データ接続後 (偽の数字は出さない)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function MobilityLegCard({
  legKey,
  fromTitle,
  toTitle,
  selectedMode,
  recommendedMode,
  readOnly,
  onSelect,
  onClose,
}: {
  legKey: string;
  fromTitle: string;
  toTitle: string;
  selectedMode: RouteTransportMode | null;
  recommendedMode?: RouteTransportMode | null;
  readOnly: boolean;
  onSelect: (legKey: string, mode: RouteTransportMode) => void;
  onClose: () => void;
}) {
  const chipBg = (mode: RouteTransportMode) => ({
    backgroundImage: `url("${mobilitySquircleDataUri(mode)}")`,
    backgroundSize: "contain",
  });
  const modeButton = (mode: RouteTransportMode, limited: boolean) => {
    const active = selectedMode === mode;
    const color = ROUTE_MODE_COLORS[mode];
    return (
      <button
        key={mode}
        type="button"
        disabled={readOnly}
        aria-pressed={active}
        onClick={() => onSelect(legKey, mode)}
        className={`relative flex flex-col items-center gap-1 rounded-2xl border-2 px-1 py-2 transition ${
          readOnly ? "cursor-default" : "hover:bg-slate-50"
        } ${limited ? "opacity-60" : ""}`}
        style={
          active
            ? { borderColor: color, backgroundColor: `${color}14` }
            : { borderColor: "transparent", backgroundColor: "transparent" }
        }
      >
        <span
          aria-hidden
          className="block h-11 w-11 bg-center bg-no-repeat"
          style={chipBg(mode)}
        />
        <span className="text-[11px] font-semibold text-slate-700">
          {MOBILITY_MODE_META[mode].label}
        </span>
        {limited && (
          <span className="absolute right-1 top-1 rounded-md bg-slate-300 px-1 text-[8px] font-bold tracking-wide text-white">
            β
          </span>
        )}
      </button>
    );
  };
  return (
    <div data-testid="mobility-leg-card" className="absolute inset-x-3 bottom-3 z-20">
      <div className="rounded-3xl border border-slate-200/90 bg-white p-4 shadow-[0_18px_50px_-12px_rgba(15,23,42,0.28)]">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-[15px] font-bold text-slate-900">
            {fromTitle} <span className="font-medium text-slate-300">→</span>{" "}
            {toTitle}
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400 hover:bg-slate-200"
          >
            ✕
          </button>
        </div>

        {/* ✦おすすめ枠 (= 判断OS): 実 recommendedMode で点灯、 無ければ正直に順次提案 */}
        <div className="mt-3 rounded-2xl border border-indigo-100 bg-gradient-to-br from-blue-50 to-violet-50 px-3.5 py-3">
          <div className="flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-indigo-600">
            <span aria-hidden>✦</span> おすすめ
          </div>
          {recommendedMode ? (
            <div className="mt-2 flex items-center gap-2.5">
              <span
                aria-hidden
                className="block h-11 w-11 bg-center bg-no-repeat"
                style={chipBg(recommendedMode)}
              />
              <div className="text-sm font-bold text-slate-900">
                {MOBILITY_MODE_META[recommendedMode].label}
              </div>
            </div>
          ) : (
            <p className="mt-1 text-xs text-indigo-500/90">
              予定に合わせた最適な移動を順次提案します
            </p>
          )}
        </div>

        {/* 主な手段 */}
        <div className="mt-4">
          <div className="mb-2 text-[11px] font-semibold tracking-wider text-slate-400">
            主な手段{readOnly ? "（過去の移動・実績／編集不可）" : ""}
          </div>
          <div className="grid grid-cols-5 gap-2">
            {MOBILITY_MAIN_MODES.map((m) => modeButton(m, false))}
          </div>
        </div>

        {/* 制限あり (β) */}
        <div className="mt-4">
          <div className="mb-2 text-[11px] font-semibold tracking-wider text-slate-400">
            制限あり
          </div>
          <div className="grid grid-cols-5 gap-2">
            {MOBILITY_LIMITED_MODES.map((m) => modeButton(m, true))}
          </div>
          <p className="mt-2 text-[10px] text-slate-400">
            β＝経路は概念表示／地域により未対応の場合あり
          </p>
        </div>

        {/* 状態 */}
        <div className="mt-3 flex gap-4 border-t border-slate-100 pt-3 text-[11px] text-slate-400">
          <span>
            現在表示：
            <b className="text-slate-700">
              {selectedMode ? MOBILITY_MODE_META[selectedMode].label : "未設定"}
            </b>
          </span>
          <span>
            実績：<b className="text-slate-700">未記録</b>
          </span>
        </div>
      </div>
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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 道路ルート描画 helpers (Reality Control OS — 地図の線を道路沿いに、 v1)
//
// 役割: 地図の接続線を「直線」→「道路沿いの折れ線」へ。順番は固定 (= "1 から順")。
//   client-side DirectionsService で各区間 (連続 pin ペア) の overview_path を取得し描画する。
//   geometry 取得元は将来サーバ Routes API + 永続 cache へ差し替え可 (描画側は LatLng[] を消費するだけ)。
//
// 不変原則 (既存制約遵守):
//   - googleMapsLoader.ts は不触。 DirectionsService の型は本 file で local 宣言 (= MapWithListener 同 pattern)。
//   - 新 env / migration / dep すべて 0。
//
// Fail-open / コスト:
//   - DirectionsService 不在 / REQUEST_DENIED (= Directions API 未有効) → 直線へ無劣化 fallback。
//     REQUEST_DENIED を一度観測したら session 中は試行停止 (= console / quota の無駄打ち防止)。
//   - 区間結果は module cache で memo 化 (= pin 選択で Effect 2 が再実行されても再課金しない)。
//   - 区間 timeout (= DIRECTIONS_SEGMENT_TIMEOUT_MS) で hang を打ち切り、 該区間は直線で補完。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ── 経路の視覚設計 (Reality Control OS — 移動 OS 風の階層表示 v2.3) ──
//
// 思想 (CEO 2026-06): 全体は俯瞰しつつ "今 → 次" の移動だけが主役。
//   done(2 個前以前)=波線 / prev(一個前→今)=細い実線 / current(今→次)=太い実線+静かに呼吸する光 /
//   ahead(次より先)=細い実線(控えめ)。 mode 色は実 transportMode がある区間のみ点灯、 無ければ中立色
//   (★距離からの mode 推定はしない。 CEO: 距離判定は誤判定が多く Plan OS の信頼を落とす)。
//
// 関心の分離 (= 巨大条件分岐にしない):
//   resolveFocusLegIndex / resolveLegState / resolveTransportMode /
//   getRouteStyleForLeg / shouldAnimateLeg / buildGlassyLegLines / createRouteAuraAnimation

// 移動手段 (CEO: 電車/新幹線/車/タクシー/徒歩/バス/自転車/飛行機/不明)
type RouteTransportMode =
  | "walk"
  | "car"
  | "taxi"
  | "train"
  | "shinkansen"
  | "bus"
  | "bicycle"
  | "flight"
  | "unknown";

// leg の時間的状態 (= 今を中心とした階層)
//   done=2 個前以前(波線) / previous=一個前→今(細実線) / current=今→次(太実線+glow) / ahead=次より先(細実線)
type RouteLegState = "done" | "previous" | "current" | "ahead";

// 1 区間の表示用 ViewModel (= 表示の器)。 ★正本型 RouteLeg は別 Phase で lib/shared に作る (今は作らない)。
//   移動手段の candidate/selected/actual を「器」として保持。 実 data 接続まで [] / null / unknown。
//   displayMode は ★距離推定をせず、 selectedMode があればそれ、 無ければ unknown。
interface RouteLegViewModel {
  index: number;
  legKey: string; // = `${fromAnchorId}__${toAnchorId}` (= 区間の安定キー)
  from: GmapsLatLng;
  to: GmapsLatLng;
  state: RouteLegState;
  candidateModes: RouteTransportMode[]; // ユーザーが許可した候補 (現状 [])
  selectedMode: RouteTransportMode | null; // 今表示・採用 (現状 null)
  actualMode: RouteTransportMode | null; // 実際に使った実績 (現状 null)
  displayMode: RouteTransportMode; // 描画に使う mode (= selectedMode ?? "unknown")
}

// 1 区間の解決済み視覚スタイル
interface RouteLegStyle {
  color: string;
  weight: number; // ガラス本体の太さ(px)
  bodyOpacity: number; // 半透明ガラス本体の不透明度
  glowExtra: number; // 外側グローは body より +n px 太い
  glowOpacity: number; // 外側グロー (current は呼吸の基準下限)
  coreWeight: number; // 白い芯の太さ(px)
  coreOpacity: number; // 白い芯の不透明度
  dashed: boolean; // done = 丸点線
  animate: boolean; // current のみ呼吸 + 到着ノード鼓動
  zIndex: number; // core の z (body=z-1, glow=z-2)
}

// 移動手段別の色 (mode-aware)。 transport mode source が来たら即 light up する。
//   現状: ExternalAnchor / 親 PlanClient に mode field 無 → 全 leg "unknown" (中立色) で描画。
const ROUTE_MODE_COLORS: Record<RouteTransportMode, string> = {
  walk: "#2e9e5b", // 徒歩 = グリーン
  car: "#1a73e8", // 車 = ブルー
  taxi: "#f59e0b", // タクシー = アンバー
  train: "#1565c0", // 電車 = 鉄道系ブルー
  shinkansen: "#0b3d91", // 新幹線 = 濃紺系ブルー
  bus: "#8e24aa", // バス = パープル
  bicycle: "#0d9488", // 自転車 = ティール
  flight: "#0891b2", // 飛行機 = シアン/空色
  unknown: "#64748b", // 不明 = 中立スレート
};

// 移動手段カードのグルーピング (判断OS化: 主な手段 / 制限あり β)。 unknown はボタンにしない。
const MOBILITY_MAIN_MODES: RouteTransportMode[] = [
  "walk",
  "car",
  "taxi",
  "train",
  "bus",
];
const MOBILITY_LIMITED_MODES: RouteTransportMode[] = [
  "bicycle",
  "flight",
  "shinkansen",
];
// 各手段の表示メタ。 note = 正直な経路対応状況 (★嘘の経路を見せないための明示)
const MOBILITY_MODE_META: Record<RouteTransportMode, { label: string; note?: string }> = {
  walk: { label: "徒歩" },
  car: { label: "車" },
  taxi: { label: "タクシー" },
  train: { label: "電車", note: "乗換経路は地域により未対応" },
  shinkansen: { label: "新幹線", note: "乗換経路は地域により未対応" },
  bus: { label: "バス", note: "乗換経路は地域により未対応" },
  bicycle: { label: "自転車", note: "日本は経路未対応・概念表示" },
  flight: { label: "飛行機", note: "空路（概念表示）" },
  unknown: { label: "未設定" },
};

/** 区間の安定キー (= from/to anchor id の組)。 selectedMode の保持と tap 識別に使う。 */
function legKeyOf(fromAnchorId: string, toAnchorId: string): string {
  return `${fromAnchorId}__${toAnchorId}`;
}

/**
 * S1-A: 移動手段選択 (selectedModeByLeg) の localStorage 永続化。
 *   - key: `plan-map:selectedModeByLeg:v1:${dayKey}` (= 当日スコープ。 別日に漏れない)
 *   - value: { [legKey]: RouteTransportMode } (legKey = legKeyOf。 anchorsForDay が元 anchor を返すため
 *     anchor id は再 fetch をまたいで安定 → id ベース legKey で復元が成立。 id 不安定 source は現状なし)
 *   - fail-open: SSR / JSON 破損 / 書込失敗 は握りつぶし UI を壊さない (= best-effort persistence)
 *   - 範囲: localStorage のみ。 DB / Supabase / shared 型 / observation / weather / 学習 は持たない (S1-A)
 *   - schema 進化時は新 key version (`:v2:`) + migration で吸収する想定 (今は v1 固定)
 */
const MOBILITY_PERSIST_KEY_PREFIX = "plan-map:selectedModeByLeg:v1:";

/** 当日の leg→mode を localStorage から復元 (未保存・破損・SSR は {} で fail-open)。 */
function loadPersistedLegModes(
  dayKey: string,
): Record<string, RouteTransportMode> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(
      `${MOBILITY_PERSIST_KEY_PREFIX}${dayKey}`,
    );
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    const out: Record<string, RouteTransportMode> = {};
    for (const [legKey, mode] of Object.entries(
      parsed as Record<string, unknown>,
    )) {
      // 既知の mode 値のみ採用 (= 破損値は捨てる → fail-open で unknown 扱い)
      if (typeof mode === "string" && mode in ROUTE_MODE_COLORS) {
        out[legKey] = mode as RouteTransportMode;
      }
    }
    return out;
  } catch {
    return {}; // JSON 破損 / getItem 例外 → 未保存扱い
  }
}

/** 当日の leg→mode を localStorage へ保存 (書込失敗 = QuotaExceeded / private mode 等は握りつぶす)。 */
function savePersistedLegModes(
  dayKey: string,
  modes: Record<string, RouteTransportMode>,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      `${MOBILITY_PERSIST_KEY_PREFIX}${dayKey}`,
      JSON.stringify(modes),
    );
  } catch {
    // best-effort: 失敗しても state はメモリに残り UI は継続 (= fail-open)
  }
}

const ROUTE_DONE_COLOR = "#94a3b8"; // done(2 個前以前) = 薄いグレーの丸点線で de-emphasize
const ROUTE_CORE_COLOR = "#ffffff"; // ガラス導線の白い芯 (= ホログラム的な光の筋)
const ROUTE_FOCUS_WEIGHT = 7; // current(今→次) ガラス本体の太さ(px) = 主役

// 近未来ガラス質ホログラム線 = 外側グロー(半透明) + 本体(半透明 mode 色) + 白い芯。
//   "発光する導線"。 アニメは中央を走らせず、 current の glow が呼吸し到着ノードが鼓動する。
// ① ライン発光呼吸 (current glow): 位置不動、 strokeOpacity だけ静かに増減。
const ROUTE_BREATH_PERIOD_MS = 6000; // 1 呼吸 ≈ 6 秒 (ゆっくり)
const ROUTE_BREATH_MIN_OPACITY = 0.1;
const ROUTE_BREATH_MAX_OPACITY = 0.32;
// ② ノード発光鼓動 (次の目的地): 光の輪が拡大しながらフェード (心拍)。 線上は走らせない。
const ROUTE_PULSE_PERIOD_MS = 2600; // 1 鼓動 ≈ 2.6 秒
const ROUTE_PULSE_MIN_SCALE = 5; // 輪の最小半径(px)
const ROUTE_PULSE_MAX_SCALE = 30; // 輪の最大半径(px)
const ROUTE_PULSE_MAX_OPACITY = 0.5; // 輪の最大不透明度 (拡大につれ 0 へフェード)
const ROUTE_AURA_FRAME_MS = 60; // 呼吸 + 鼓動の更新間隔 (≈ 16fps)

// z-index: done < ahead < previous < current。 各 leg は glow(z-2) < body(z-1) < core(z)。
const ROUTE_Z_DONE = 10;
const ROUTE_Z_AHEAD = 22; // glow 20 / body 21 / core 22
const ROUTE_Z_PREVIOUS = 32; // glow 30 / body 31 / core 32
const ROUTE_Z_FOCUS_MAIN = 62; // glow 60 / body 61 / core 62

// GmapsPolylineOptions に zIndex/clickable + 太い symbol(icons) を足した local 拡張
//   (googleMapsLoader.ts は frozen のため本 file 側で型を広げる)
interface RouteSymbol {
  path: string | number;
  strokeColor?: string;
  strokeOpacity?: number;
  strokeWeight?: number;
  fillColor?: string; // 丸ドット塗り用 (Google Symbol は fill 対応、 frozen loader は触らず local 拡張)
  fillOpacity?: number;
  scale?: number;
}
type RoutePolylineOptions = Omit<GmapsPolylineOptions, "icons"> & {
  zIndex?: number;
  clickable?: boolean;
  icons?: Array<{ icon: RouteSymbol; offset?: string; repeat?: string }>;
};
type GmapsPolylineWithSetOptions = GmapsPolyline & {
  setOptions(opts: RoutePolylineOptions): void;
};

/** "HH:mm" → 0 時からの分。 parse 不能なら null。 */
function parseStartTimeToMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  return h * 60 + min;
}

/**
 * 焦点区間 (= 「次に動くべき leg」) を現在時刻から決定。
 *   - leg は pin[i] → pin[i+1] (index 0..pins.length-2)
 *   - 次の目的地 = startTime が現在時刻より後の最初の pin → その pin に到着する leg (= nextStop-1)
 *   - 開始前 (= 最初の pin も未来) → 最初の leg(0)
 *   - 全て過去 → 最後の leg (= 当日の最終移動を focus、 閲覧時も焦点ゼロにしない)
 *   - pin が 2 未満なら -1 (focus なし)
 *   注 (CEO): 「全て過去ならアニメ無し」も可。 焦点ゼロだと地図が伝わらないため常に 1 区間 focus。
 *             切替は本 function 1 箇所で可能。
 */
function resolveFocusLegIndex(
  pins: AnchorWithCoord[],
  nowMinutes: number,
): number {
  if (pins.length < 2) return -1;
  const nextStop = pins.findIndex((p) => {
    const t = parseStartTimeToMinutes(p.anchor.startTime);
    return t != null && t > nowMinutes;
  });
  if (nextStop > 0) return nextStop - 1; // 次の目的地へ到着する区間
  if (nextStop === 0) return 0; // 開始前 → 最初の区間
  return pins.length - 2; // 全て過去 → 最終区間
}

/** leg index → 状態 (current=今→次 を中心に、 前=previous/done、 後=ahead)。 */
function resolveLegState(legIndex: number, focusLegIndex: number): RouteLegState {
  if (focusLegIndex < 0) return "ahead";
  if (legIndex === focusLegIndex) return "current"; // 今 → 次
  if (legIndex === focusLegIndex - 1) return "previous"; // 一個前 → 今
  if (legIndex < focusLegIndex - 1) return "done"; // 2 個前以前
  return "ahead"; // 次より先
}

/**
 * leg の表示 mode を解決 (= 差し替え口/seam)。 ★距離からの推定は一切しない
 *   (CEO: 距離で walk/train/car/bus/taxi/bicycle/flight を当てるのは誤判定が多く Plan OS の信頼を落とす)。
 *
 * 現状: 実 selectedMode が無い (予定追加側の transportMode 候補生成は別 Phase/別セッション) → "unknown"。
 *   → getRouteStyleForLeg で unknown は中立スレート色 (= 距離等で色を変えない)。
 * 次フェーズ: 予定作成時に transportMode (徒歩/車/タクシー/電車/新幹線/バス/自転車/飛行機) を持たせ、
 *   leg.selectedMode に流せば その区間だけ ROUTE_MODE_COLORS で正確に着色 (差し替えは本 function のみ)。
 *   flight は別途 道路ルートにせず arc/破線 fallback とする (= 実 mode data 到着後に対応)。
 */
function resolveTransportMode(leg: {
  selectedMode: RouteTransportMode | null;
}): RouteTransportMode {
  return leg.selectedMode ?? "unknown";
}

/**
 * sortedPins → 区間ごとの表示 ViewModel (= 表示の器)。
 *   - state は今を中心とした階層 (done/previous/current/ahead)
 *   - candidate/selected/actual は実 data 接続まで空 (器のみ)。 ★距離推定はしない
 *   - displayMode = selectedMode ?? "unknown"
 */
function buildRouteLegViewModels(
  pins: AnchorWithCoord[],
  focusLegIndex: number,
  selectedModeByLeg?: Record<string, RouteTransportMode>,
): RouteLegViewModel[] {
  const legs: RouteLegViewModel[] = [];
  for (let i = 0; i < pins.length - 1; i += 1) {
    const legKey = legKeyOf(pins[i]!.anchor.id, pins[i + 1]!.anchor.id);
    // selectedMode = ユーザーが手段カードで選んだ値 (= 推測ではない)。 無ければ null → unknown。
    const selectedMode = selectedModeByLeg?.[legKey] ?? null;
    legs.push({
      index: i,
      legKey,
      from: pins[i]!.coord,
      to: pins[i + 1]!.coord,
      state: resolveLegState(i, focusLegIndex),
      candidateModes: [],
      selectedMode,
      actualMode: null,
      displayMode: resolveTransportMode({ selectedMode }),
    });
  }
  return legs;
}

/** (state, mode) → ガラス質スタイル。 done=丸点線 / previous・ahead=控えめガラス / current=発光する主役。 */
function getRouteStyleForLeg(
  state: RouteLegState,
  mode: RouteTransportMode,
): RouteLegStyle {
  if (state === "done") {
    // 2 個前以前 = 薄いグレーの丸点線 (引く・glow/core 無し)
    return {
      color: ROUTE_DONE_COLOR,
      weight: 3,
      bodyOpacity: 0.5,
      glowExtra: 0,
      glowOpacity: 0,
      coreWeight: 0,
      coreOpacity: 0,
      dashed: true,
      animate: false,
      zIndex: ROUTE_Z_DONE,
    };
  }
  if (state === "previous") {
    // 一個前 → 今 = 半透明ガラス + 白い芯 (静的)
    return {
      color: ROUTE_MODE_COLORS[mode],
      weight: 5,
      bodyOpacity: 0.5,
      glowExtra: 6,
      glowOpacity: 0.14,
      coreWeight: 2,
      coreOpacity: 0.5,
      dashed: false,
      animate: false,
      zIndex: ROUTE_Z_PREVIOUS,
    };
  }
  if (state === "ahead") {
    // 次より先 = 透明度を上げた控えめガラス (引く)
    return {
      color: ROUTE_MODE_COLORS[mode],
      weight: 4.5,
      bodyOpacity: 0.38,
      glowExtra: 5,
      glowOpacity: 0.1,
      coreWeight: 1.5,
      coreOpacity: 0.38,
      dashed: false,
      animate: false,
      zIndex: ROUTE_Z_AHEAD,
    };
  }
  // current = 今 → 次 = 太い半透明ガラス + 白い芯 + 呼吸する glow + 到着ノード鼓動 = 主役
  return {
    color: ROUTE_MODE_COLORS[mode],
    weight: ROUTE_FOCUS_WEIGHT,
    bodyOpacity: 0.6,
    glowExtra: 9,
    glowOpacity: ROUTE_BREATH_MIN_OPACITY, // 呼吸で増減する初期値
    coreWeight: 2.5,
    coreOpacity: 0.72,
    dashed: false,
    animate: true,
    zIndex: ROUTE_Z_FOCUS_MAIN,
  };
}

/** glow animation するのは current (= 今→次、 主役) 区間のみ。 */
function shouldAnimateLeg(state: RouteLegState): boolean {
  return state === "current";
}

/** 丸点線 icons (= done / 未対応区間用)。 Google 純正 CIRCLE の塗りドット (Apple マップ風の上品な点線)。 */
function dottedRouteIcons(maps: GmapsApi, color: string, opacity: number) {
  return [
    {
      icon: {
        path: maps.SymbolPath.CIRCLE, // 純正の塗り円 (= 確実に filled・scale=半径px)
        fillColor: color,
        fillOpacity: opacity,
        strokeOpacity: 0,
        scale: 2.5,
      },
      offset: "0",
      repeat: "14px",
    },
  ];
}

/**
 * 1 区間をガラス質ホログラムとして描画。
 *   active = 外側グロー(半透明) + 本体(半透明 mode 色) + 白い芯 の 3 層 / done = 丸点線。
 *   戻り値 glow は current の「呼吸」で animate するため参照を返す (done/静的は null)。
 */
function buildGlassyLegLines(
  maps: GmapsApi,
  map: GmapsMap,
  path: GmapsLatLng[],
  style: RouteLegStyle,
): { lines: GmapsPolyline[]; glow: GmapsPolyline | null } {
  if (style.dashed) {
    return {
      lines: [
        new maps.Polyline({
          map,
          path,
          strokeOpacity: 0, // 本体は透明、 丸ドットだけ見せる
          icons: dottedRouteIcons(maps, style.color, style.bodyOpacity),
          zIndex: style.zIndex,
          clickable: false,
        } as RoutePolylineOptions),
      ],
      glow: null,
    };
  }
  // 外側グロー (= 半透明の発光) → 本体 (= 半透明ガラス) → 白い芯 (= 光の筋) の順で重ねる
  const glow = new maps.Polyline({
    map,
    path,
    strokeColor: style.color,
    strokeOpacity: style.glowOpacity,
    strokeWeight: style.weight + style.glowExtra,
    zIndex: style.zIndex - 2,
    clickable: false,
  } as RoutePolylineOptions);
  const body = new maps.Polyline({
    map,
    path,
    strokeColor: style.color,
    strokeOpacity: style.bodyOpacity,
    strokeWeight: style.weight,
    zIndex: style.zIndex - 1,
    clickable: false,
  } as RoutePolylineOptions);
  const core = new maps.Polyline({
    map,
    path,
    strokeColor: ROUTE_CORE_COLOR,
    strokeOpacity: style.coreOpacity,
    strokeWeight: style.coreWeight,
    zIndex: style.zIndex,
    clickable: false,
  } as RoutePolylineOptions);
  return { lines: [glow, body, core], glow };
}

/**
 * current(今→次) の近未来アニメーション (中央を走らせない)。
 *   ① ライン発光呼吸: current の glow の strokeOpacity だけを sin で静かに増減 (位置不動)。
 *   ② ノード発光鼓動: 次の目的地に光の輪を 2 つ半周ずらして置き、 拡大しながらフェード (心拍)。
 *   戻り値 markers は cleanup で setMap(null)、 timerId は clearInterval する。
 */
function createRouteAuraAnimation(
  maps: GmapsApi,
  map: GmapsMap,
  glow: GmapsPolyline,
  nextPos: GmapsLatLng,
  color: string,
): { markers: GmapsMarker[]; timerId: number } {
  const pulseRing = (scale: number, opacity: number): RouteRingIcon => ({
    path: maps.SymbolPath.CIRCLE,
    fillOpacity: 0, // 塗らない = 輪っか
    strokeColor: color,
    strokeWeight: 2,
    strokeOpacity: opacity,
    scale,
  });
  // 2 つの輪 (半周ずらし) で concentric な心拍に
  const rings = [0, 0.5].map(
    () =>
      new maps.Marker({
        map,
        position: nextPos,
        icon: pulseRing(ROUTE_PULSE_MIN_SCALE, 0),
        clickable: false,
      } as MobilityMarkerOptions),
  );
  const breathSpan = ROUTE_BREATH_MAX_OPACITY - ROUTE_BREATH_MIN_OPACITY;
  let ms = 0;
  const timerId = window.setInterval(() => {
    ms += ROUTE_AURA_FRAME_MS;
    // ① ライン発光呼吸 (位置不動・opacity のみ)
    const breath =
      ROUTE_BREATH_MIN_OPACITY +
      breathSpan * (0.5 + 0.5 * Math.sin((2 * Math.PI * ms) / ROUTE_BREATH_PERIOD_MS));
    (glow as GmapsPolylineWithSetOptions).setOptions({ strokeOpacity: breath });
    // ② ノード発光鼓動 (拡大 + フェード)
    rings.forEach((ring, i) => {
      const phase = (ms / ROUTE_PULSE_PERIOD_MS + i * 0.5) % 1;
      const scale = ROUTE_PULSE_MIN_SCALE + (ROUTE_PULSE_MAX_SCALE - ROUTE_PULSE_MIN_SCALE) * phase;
      const op = ROUTE_PULSE_MAX_OPACITY * (1 - phase);
      (ring as GmapsMarkerWithSetIcon).setIcon(pulseRing(scale, op));
    });
  }, ROUTE_AURA_FRAME_MS);
  return { markers: rings, timerId };
}

// ── Mobility チップ (v2 polish: 塗り mode 色 + 艶 + 影 + リング + 状態階層) ──
//   状態がアイコンに宿る: current=大+glow / future=通常 / past=薄灰 / selected=glow / plain。
//   ★距離推定はしない (色は displayMode に従うだけ、 mode は実 data が来た時だけ確定)。
type MobilityChipState = "current" | "future" | "past" | "selected" | "plain";

/** チップの px サイズ (= 地図上の状態階層: current を大きく、 past を小さく)。 */
function mobilityChipPx(state: MobilityChipState): number {
  if (state === "current") return 40;
  if (state === "past") return 26;
  if (state === "selected") return 34;
  return 30;
}

/** leg state → チップ状態 (done=過去薄灰 / current=今→次は大+glow / 他=future)。 */
function mapChipStateForLeg(legState: RouteLegState): MobilityChipState {
  if (legState === "done") return "past";
  if (legState === "current") return "current";
  return "future";
}
// GmapsMarkerOptions に clickable を足した local 拡張 (googleMapsLoader.ts は frozen)
type MobilityMarkerOptions = GmapsMarkerOptions & { clickable?: boolean };
// GmapsMarker に setPosition を足した local 拡張 (= チップを描画後に線上へ寄せる)
type GmapsMarkerWithSetPosition = GmapsMarker & {
  setPosition(latLng: GmapsLatLng): void;
};
// GmapsIcon に strokeOpacity を足した local 拡張 (= Google Symbol は対応、 frozen loader は触らず)
type RouteRingIcon = GmapsIcon & { strokeOpacity?: number };
// GmapsMarker に setIcon を足した local 拡張 (= ノード鼓動リングを毎フレーム更新、 frozen file 不触)
type GmapsMarkerWithSetIcon = GmapsMarker & {
  setIcon(icon: RouteRingIcon): void;
};

/**
 * leg の描画 path から「線上の中点」を返す (Step 1.1)。
 *   - 直線中点ではなく実際のルート線の上にチップを置くための位置。
 *   - 2 点 (直線 fallback) → 平均。 3 点以上 (道路 path) → 中央 index ≈ 視覚的中点。
 *   - ★距離による mode 推定はしない (= 純粋に index/平均の幾何で位置を出すだけ)。
 */
function legChipPosition(path: GmapsLatLng[]): GmapsLatLng {
  if (path.length <= 1) return path[0]!;
  if (path.length === 2) {
    return {
      lat: (path[0]!.lat + path[1]!.lat) / 2,
      lng: (path[0]!.lng + path[1]!.lng) / 2,
    };
  }
  return path[Math.floor(path.length / 2)]!;
}

function mobilityLegIconDataUri(
  mode: RouteTransportMode,
  state: MobilityChipState,
): string {
  const past = state === "past";
  const color = past ? "#94a3b8" : ROUTE_MODE_COLORS[mode]; // 過去は薄灰 (mode 不問)
  const opacity = past ? 0.55 : 1;
  const ring = state === "current" || state === "selected";
  const px = mobilityChipPx(state);
  const glow = ring
    ? `<circle cx="15" cy="15" r="13.4" fill="none" stroke="${color}" stroke-opacity="0.3" stroke-width="2.4"/>`
    : "";
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 30 30">` +
    `<defs><filter id="csh" x="-40%" y="-40%" width="180%" height="180%">` +
    `<feDropShadow dx="0" dy="0.6" stdDeviation="0.9" flood-color="#0f172a" flood-opacity="0.28"/></filter></defs>` +
    `<g opacity="${opacity}">${glow}` +
    `<g filter="url(#csh)">` +
    `<circle cx="15" cy="15" r="11.3" fill="${color}"/>` +
    `<ellipse cx="15" cy="10.6" rx="9" ry="5.6" fill="#ffffff" opacity="0.14"/>` + // 艶
    `</g>` +
    mobilityGlyphLayer(mode) +
    `</g></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

/** カード用 iOS squircle チップ (= 塗り mode 色の角丸四角 + 白 Lucide glyph + mode 色の影)。 */
function mobilitySquircleDataUri(mode: RouteTransportMode): string {
  const color = ROUTE_MODE_COLORS[mode];
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30">` +
    `<defs><filter id="sq" x="-30%" y="-30%" width="160%" height="160%">` +
    `<feDropShadow dx="0" dy="0.7" stdDeviation="0.8" flood-color="${color}" flood-opacity="0.35"/></filter></defs>` +
    `<g filter="url(#sq)">` +
    `<rect x="3" y="3" width="24" height="24" rx="8" fill="${color}"/>` +
    `<rect x="3" y="3" width="24" height="11" rx="8" fill="#ffffff" opacity="0.12"/>` +
    `</g>` +
    mobilityGlyphLayer(mode) +
    `</svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

/** Lucide glyph を白線で 30-box 中央に内接配置する layer (= 円/squircle 共通)。 */
function mobilityGlyphLayer(mode: RouteTransportMode): string {
  return (
    `<g transform="translate(7.3,7.3) scale(0.64)" fill="none" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">` +
    mobilityGlyphLucide(mode) +
    `</g>`
  );
}

/**
 * mode → Lucide アイコンの inner SVG (lucide-react v0.563.0, ISC)。
 *   stroke/fill は親 mobilityGlyphLayer が指定 (白線)。 手描きをやめプロのアイコンセットを採用。
 *   walk=footprints / car=car / taxi=car-taxi-front / train・shinkansen=train-front /
 *   bus=bus-front / bicycle=bike / flight=plane / unknown=waypoints。
 */
function mobilityGlyphLucide(mode: RouteTransportMode): string {
  switch (mode) {
    case "walk":
      return '<path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z"/><path d="M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z"/><path d="M16 17h4"/><path d="M4 13h4"/>';
    case "car":
      return '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>';
    case "taxi":
      return '<path d="M10 2h4"/><path d="m21 8-2 2-1.5-3.7A2 2 0 0 0 15.646 5H8.4a2 2 0 0 0-1.903 1.257L5 10 3 8"/><path d="M7 14h.01"/><path d="M17 14h.01"/><rect width="18" height="8" x="3" y="10" rx="2"/><path d="M5 18v2"/><path d="M19 18v2"/>';
    case "train":
    case "shinkansen":
      return '<path d="M8 3.1V7a4 4 0 0 0 8 0V3.1"/><path d="m9 15-1-1"/><path d="m15 15 1-1"/><path d="M9 19c-2.8 0-5-2.2-5-5v-4a8 8 0 0 1 16 0v4c0 2.8-2.2 5-5 5Z"/><path d="m8 19-2 3"/><path d="m16 19 2 3"/>';
    case "bus":
      return '<path d="M4 6 2 7"/><path d="M10 6h4"/><path d="m22 7-2-1"/><rect width="16" height="16" x="4" y="3" rx="2"/><path d="M4 11h16"/><path d="M8 15h.01"/><path d="M16 15h.01"/><path d="M6 19v2"/><path d="M18 21v-2"/>';
    case "bicycle":
      return '<circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/>';
    case "flight":
      return '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>';
    default: // unknown = waypoints
      return '<path d="m10.586 5.414-5.172 5.172"/><path d="m18.586 13.414-5.172 5.172"/><path d="M6 12h12"/><circle cx="12" cy="20" r="2"/><circle cx="12" cy="4" r="2"/><circle cx="20" cy="12" r="2"/><circle cx="4" cy="12" r="2"/>';
  }
}

const DIRECTIONS_SEGMENT_TIMEOUT_MS = 5000;
const ROUTE_CACHE_COORD_DIGITS = 5; // ≒ 1.1m 解像度で区間 key を量子化

// ── 最小 DirectionsService 型 (googleMapsLoader.ts 不触のための local 宣言) ──
interface GmapsLatLngObj {
  lat(): number;
  lng(): number;
}
interface GmapsDirectionsResult {
  routes?: Array<{ overview_path?: GmapsLatLngObj[] }>;
}
interface GmapsDirectionsService {
  route(
    request: { origin: GmapsLatLng; destination: GmapsLatLng; travelMode: string },
    callback: (result: GmapsDirectionsResult | null, status: string) => void,
  ): void;
}

/** 区間ルート cache (key=from|to|mode)。値: 道路 path / null=確定失敗 (= 再試行しない)。 */
const roadSegmentPathCache = new Map<string, GmapsLatLng[] | null>();
/** 同一区間の in-flight request 合流 (重複 API call 防止)。 */
const roadSegmentInflight = new Map<string, Promise<GmapsLatLng[] | null>>();
/** REQUEST_DENIED (= Directions API 未有効/制限) を観測したら session 中は試行停止。 */
let directionsApiUnavailable = false;

function roadSegmentKey(from: GmapsLatLng, to: GmapsLatLng, mode: string): string {
  const q = (n: number) => n.toFixed(ROUTE_CACHE_COORD_DIGITS);
  return `${q(from.lat)},${q(from.lng)}|${q(to.lat)},${q(to.lng)}|${mode}`;
}

/** displayMode → DirectionsService の travelMode (flight は null = 道路ルートにしない)。 */
function toApiTravelMode(maps: unknown, mode: RouteTransportMode): string | null {
  const tm = (maps as { TravelMode?: Record<string, string> }).TravelMode;
  const v = (k: string) => tm?.[k] ?? k; // enum があれば優先、 無ければ文字列 fallback
  switch (mode) {
    case "walk":
      return v("WALKING");
    case "car":
    case "taxi":
      return v("DRIVING");
    case "train":
    case "bus":
    case "shinkansen":
      return v("TRANSIT");
    case "bicycle":
      return v("BICYCLING");
    case "flight":
      return null; // 道路ルートにしない (= 空路 arc/点線)
    default:
      return v("DRIVING"); // unknown = 中立コネクタの geometry (mode 主張ではない)
  }
}

/** 2 点間の空路風 arc (= 飛行機の概念表示)。 ★距離計算は使わず、 from-to 差分の垂直方向に膨らませる。 */
function flightArcPath(from: GmapsLatLng, to: GmapsLatLng): GmapsLatLng[] {
  const dLat = to.lat - from.lat;
  const dLng = to.lng - from.lng;
  // 中点から from→to に対し垂直方向へ膨らませた control point (= sqrt/asin 不要)
  const cLat = (from.lat + to.lat) / 2 - dLng * 0.18;
  const cLng = (from.lng + to.lng) / 2 + dLat * 0.18;
  const pts: GmapsLatLng[] = [];
  const steps = 24;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const mt = 1 - t;
    // 二次ベジェ: (1-t)^2·from + 2(1-t)t·C + t^2·to
    pts.push({
      lat: mt * mt * from.lat + 2 * mt * t * cLat + t * t * to.lat,
      lng: mt * mt * from.lng + 2 * mt * t * cLng + t * t * to.lng,
    });
  }
  return pts;
}

/** DirectionsService instance を生成 (不可なら null = 直線 fallback)。 */
function createDirectionsService(maps: unknown): GmapsDirectionsService | null {
  if (directionsApiUnavailable) return null;
  const ctor = (maps as { DirectionsService?: new () => GmapsDirectionsService })
    .DirectionsService;
  if (typeof ctor !== "function") return null;
  try {
    return new ctor();
  } catch {
    return null;
  }
}

/**
 * 1 区間 (from→to) の道路 path を取得。 cache / in-flight 合流 / timeout / fail-open 込み。
 * 戻り値: 道路沿い LatLng[] / null (= 該区間は呼び出し側で直線補完)。
 */
function fetchRoadSegmentPath(
  service: GmapsDirectionsService,
  from: GmapsLatLng,
  to: GmapsLatLng,
  travelMode: string,
): Promise<GmapsLatLng[] | null> {
  const key = roadSegmentKey(from, to, travelMode);
  if (roadSegmentPathCache.has(key)) {
    return Promise.resolve(roadSegmentPathCache.get(key) ?? null);
  }
  const existing = roadSegmentInflight.get(key);
  if (existing) return existing;

  const promise = new Promise<GmapsLatLng[] | null>((resolve) => {
    let settled = false;
    // cache=true は「確定結果」(成功 path or 確定失敗) のみ。 transient/timeout は cache せず次回再試行可。
    const settle = (value: GmapsLatLng[] | null, cache: boolean) => {
      if (settled) return;
      settled = true;
      if (cache) roadSegmentPathCache.set(key, value);
      resolve(value);
    };
    const timer = setTimeout(() => settle(null, false), DIRECTIONS_SEGMENT_TIMEOUT_MS);
    try {
      service.route(
        { origin: from, destination: to, travelMode },
        (result, status) => {
          clearTimeout(timer);
          if (status === "OK") {
            const path = result?.routes?.[0]?.overview_path;
            if (path && path.length > 0) {
              settle(path.map((pt) => ({ lat: pt.lat(), lng: pt.lng() })), true);
            } else {
              settle(null, true); // OK だが path 無し → 確定失敗扱い
            }
            return;
          }
          if (status === "REQUEST_DENIED") {
            directionsApiUnavailable = true; // Directions API 未有効 → 以後 session 中は試行しない
            settle(null, false);
            return;
          }
          if (status === "ZERO_RESULTS" || status === "NOT_FOUND") {
            settle(null, true); // 経路なし → 確定失敗、 再試行しない
            return;
          }
          // OVER_QUERY_LIMIT / UNKNOWN_ERROR 等 transient → cache せず直線補完
          settle(null, false);
        },
      );
    } catch {
      clearTimeout(timer);
      settle(null, false);
    }
  }).finally(() => {
    roadSegmentInflight.delete(key);
  });

  roadSegmentInflight.set(key, promise);
  return promise;
}
