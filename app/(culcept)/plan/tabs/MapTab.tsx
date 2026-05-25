"use client";

/**
 * MapTab — 「自分の地理」 view (Phase 2-C v3、CEO mock 整合 + Google Maps あり 本命)
 *
 * 設計書: docs/alter-plan-phase2-c-map-tab-mini-design.md
 *
 * 構造 (上から下へ):
 *   1. Header: "あなたの地理" + "今後 N 日間で訪れる場所"
 *   2. PlanMapView: vanilla Google Maps、category-themed marker、fitBounds、pin tap → AnchorDetailModal
 *      - failsafe: keyAvailable=false / pins<2 / API throw → semantic-only モード (Map 非表示)
 *   3. CategoryGrid: 9 categories grid (active + empty を全表示、empty は "今は静か" voice)
 *   4. UnresolvedAnchorsSection: locationText 空 / sensitive / API miss anchor を semantic で集約
 *   5. StaticAlterSuggestionCard: Phase 3 へ向けた静的 placeholder (CEO 補正 #2、ボタン風禁止)
 *   6. FAB: 右下 紫 gradient (Phase 2-A / 2-B 整合、AddAnchorModal 起動)
 *
 * 既存資産流用 (CEO 方針 "Alter Morning 用 API 資産は Plan で流用してよい"):
 *   - lib/shared/googleMapsLoader.ts (vanilla script loader、本 wave 新規、MorningMapView 不可触)
 *   - /api/plan/anchors/geocode (server endpoint、placesApiClient + placeResolver cache 流用)
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

import { GlassBadge } from "@/components/ui/glassmorphism-design";
import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import { isPlaceUnconfirmed } from "@/lib/plan/locationConfirmationStatus";
import { detectTimedAnchorOverlaps } from "@/lib/plan/anchorOverlap";
import { formatLocationDisplayParts } from "@/lib/plan/anchor-detail-format";
import { pickCategoryIcon } from "@/lib/plan/categoryIconMap";
import { pickCategoryColorClass } from "@/lib/plan/categoryColorMap";
import { pickBrandIcon } from "@/lib/plan/brandIconMap";
import {
  buildVariablesForProposal,
  selectFirstProposalForDate,
  type CalendarProposalProps,
} from "@/lib/plan/proposal/calendarProposalSelector";
import { selectActiveUndoForDate } from "@/lib/plan/proposal/quietUndoWindow";

import { DayGraphTimeline } from "../components/DayGraphTimeline";
import { ProposalChip } from "../components/ProposalChip";
import type { AddRequest } from "../PlanClient";
import {
  CATEGORY_META,
  LOCATION_GROUP_ORDER,
  MAP_CATEGORY_MARKER,
  MAP_SENSITIVE_MARKER,
  SENSITIVE_LABEL,
  addDays,
  anchorsForDay,
  categoryFrequencyVoice,
  categoryOf,
  categoryTimeSignature,
  countOccurrences,
  formatJpDate,
  formatTime,
  groupAnchorsByLocation,
  isoDate,
  utcMidnight,
  type CategoryGroup,
  type LocationCategory,
  type LocationGroupKey,
} from "./_helpers";
import {
  useGoogleMapsScript,
  type GmapsLatLng,
  type GmapsMap,
  type GmapsMarker,
  type GmapsPolyline,
} from "@/lib/shared/googleMapsLoader";
import { usePlanBaseline, type BaselineCoords } from "./_usePlanBaseline";
import { usePlanGeocode, type AnchorResolution } from "./_usePlanGeocode";
import { useMapTabMovementDisplay } from "./_useMapTabMovementDisplay";
import { useMapTabFeasibilityDisplay } from "./_useMapTabFeasibilityDisplay";
import {
  applyDisclosureAction,
  getDisclosureStateForIndex,
  resetAllDisclosures,
  type ExpandedTransitionIndices,
} from "@/lib/plan/feasibility/feasibilityDisclosureAdapter";
import {
  computeLivedGeographyFallback,
  type LivedGeographyFallback,
} from "@/lib/plan/livedGeographyFallback";

// ── Phase 3-N Map impl 9 closeout: flag 削除済み、 単一 path 化 (= 常に新 surface) ──
//   旧 UI (SelectedAnchorCard / CategoryGrid / UnresolvedAnchorsSection / StaticAlterSuggestionCard /
//   DaySwitcher / FAB) は本 file から物理削除済み。 PlanMapView 内 CIRCLE marker logic も削除。
import { MapBottomSheet } from "@/components/plan/map/MapBottomSheet";
import {
  convertExternalAnchorToMapSheet,
  resolveCategory as resolveMapEventCategory,
} from "@/lib/plan/map/adapters/externalAnchorMapAdapter";
import type { MapSheetViewModel } from "@/lib/plan/map/types";
// Step γ: 独自 pin (= 涙型 SVG data URI + 白抜き icon、 newMode 時のみ)
import { generatePinSvgDataUri, getPinSize } from "@/lib/plan/map/pinSvg";
// Step δ: 左下 当日リスト / 凡例 hybrid (= newMode 時のみ)
import { DayItemsPanel, type DayItem } from "@/components/plan/map/DayItemsPanel";
// 9b-1 carry: selected pin title overlay (= sheet で隠れない map 上部固定)
// 9b-2 carry-2: pin に水平追従 + Y clamp の動的 position 計算
import {
  MapSelectedPinLabel,
  type PinScreenPosition,
} from "@/components/plan/map/MapSelectedPinLabel";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * CategoryGrid (= 9 categories 集計) 用の window 日数。
 *
 * CEO 補正 (2026-05-20): MapTab の **主視点は selectedDate (= 1 日)** に shift。
 * CategoryGrid の window は anchor 集計の context として 14 日 default を維持
 * (= "私の地理の全体傾向" を見るための meta view)。
 */
const CATEGORY_AGGREGATE_WINDOW_DAYS = 14;
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
  onAddRequest?: (req: AddRequest) => void;
  /** W1-X5: anchor 行クリック / Enter / Space で detail modal を開く */
  onAnchorClick?: (anchor: ExternalAnchor) => void;
  /**
   * K-2 接続層: PlanClient で計算した DayGraph。
   * 9 closeout: DayGraphTimeline section 削除済み、 本 prop は backward compat のため受領のみ。
   */
  dayGraphByDate?: Readonly<Record<string, import("@/lib/plan/dayGraph/dayGraphTypes").BuildDayGraphResult>>;
} & CalendarProposalProps) {
  const baseNow = now ?? new Date();
  const todayDate = utcMidnight(baseNow);

  // 9 closeout: selectedDate は 「今日」 固定 (= DaySwitcher 削除済み)
  //   将来 day 切替再導入時は新設計で作り直す (= CEO Q3 判定)
  const selectedDate = todayDate;

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
  //   5. なし → noPin (= pin 不能、 anchorsWithoutPinCount で count)
  const { allPins, anchorsWithoutPin } = useMemo(() => {
    const pins: AnchorWithCoord[] = [];
    const noPin: ExternalAnchor[] = [];
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
      } else {
        noPin.push(anchor);
      }
    }
    return { allPins: pins, anchorsWithoutPin: noPin };
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

  // ── render (= 9 closeout: 単一 path、 flag check / 旧 UI なし) ──
  return (
    <div data-testid="plan-map-tab" className="relative">
      <PlanMapView
        pins={allPins}
        baselineCoords={baselineCoords}
        loading={loading}
        apiAvailable={apiAvailable}
        anchorsWithoutPinCount={anchorsWithoutPin.length}
        selectedAnchorId={selectedPinId}
        onPinClick={handlePinTap}
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
  anchorsWithoutPinCount,
  selectedAnchorId,
  onPinClick,
  onBackgroundClick,
  newMode = false,
  dayItemsForPanel,
  onDayItemTap,
  selectedSheetForLabel,
}: {
  pins: AnchorWithCoord[];
  baselineCoords: BaselineCoords | null;
  loading: boolean;
  apiAvailable: boolean;
  /** Map に pin 化されていない anchor の件数 (baseline なし → pin 不能) */
  anchorsWithoutPinCount: number;
  /** 現在 selected な anchor id (= bottom card で表示中)、pin marker emphasis 用 */
  selectedAnchorId: string | null;
  onPinClick?: (anchor: ExternalAnchor) => void;
  /**
   * 9a-impl-fix1: background tap handler (= 8 場面表 #7 「map 余白 tap → selected 解除」)
   *   newMode 専用、 OFF path では undefined のまま (= 既存挙動完全不変)。
   *   marker click は別 listener で消費されるため、 本 handler は marker 外 tap のみ発火。
   */
  onBackgroundClick?: () => void;
  /**
   * 9a-impl: 新 surface mode flag (= MAP_NEW_SURFACE_ENABLED 由来)
   * - false (default): 既存挙動完全維持 (= disableDefaultUI=true、 既存 marker scale)
   * - true: zoomControl 有効 + 現在地 button + marker visual 弱補正 (= scale+2 + shadow + z-index)
   */
  newMode?: boolean;
  /**
   * Step δ: DayItemsPanel 用 当日 item list (= 時刻順、 newMode 時のみ非空、 OFF 時 []) 。
   *   panel は map div 内 absolute 左下、 newMode かつ非空のみ render。
   */
  dayItemsForPanel?: ReadonlyArray<DayItem>;
  /**
   * Step δ: DayItemsPanel row tap handler (= 該 anchorId を newSelectedPinId に同期)。
   *   newMode 専用、 OFF 時 undefined。
   */
  onDayItemTap?: (anchorId: string) => void;
  /**
   * 9b-1 carry: selected pin の sheet view model (= map 上部 overlay label 用)。
   *   newMode + selected の時のみ非 null、 sheet で隠れない位置に title + 時刻表示。
   */
  selectedSheetForLabel?: MapSheetViewModel | null;
}) {
  const { ready, keyAvailable } = useGoogleMapsScript();
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<GmapsMap | null>(null);
  const onPinClickRef = useRef(onPinClick);
  onPinClickRef.current = onPinClick;
  // 9a-impl-fix1: background click handler ref (= Effect 1 内 listener が prop 変化に追従)
  const onBackgroundClickRef = useRef(onBackgroundClick);
  onBackgroundClickRef.current = onBackgroundClick;

  // ── selected day の active categories (legend 用、hooks rule で early return 前に declare) ──
  const activeCategories = useMemo(() => {
    const set = new Set<LocationGroupKey>();
    for (const pin of pins) {
      // sensitive は legend にも表示しない (privacy)
      if (pin.anchor.sensitiveCategory) continue;
      set.add(categoryOf(pin.anchor));
    }
    // LOCATION_GROUP_ORDER 順で並べる
    return LOCATION_GROUP_ORDER.filter((c) => set.has(c));
  }, [pins]);

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

    // 9a-impl: newMode の時のみ zoomControl 有効化 (= CEO + GPT 着手条件 B 「controls 維持」)
    //   既存 OFF path は disableDefaultUI=true で全 controls 非表示 (= 不変)
    //   ON path は zoom +/- を残す (= 最小限 map 体験を担保)、 current location は別 button で実装
    const map: GmapsMap = new maps.Map(el, {
      gestureHandling: "cooperative",
      disableDefaultUI: true,
      ...(newMode ? { zoomControl: true } : {}),
      clickableIcons: false,
      center: TEMPORARY_FALLBACK_MAP_CENTER,
      zoom: TEMPORARY_FALLBACK_MAP_ZOOM,
    });
    mapInstanceRef.current = map;

    // 9a-impl-fix1: background tap → selected 解除 (= 8 場面表 #7、 仕様確定済み実装漏れ補強)
    //   newMode 専用、 OFF path では listener 不 attach (= 既存挙動完全不変)。
    //   Google Maps の `click` event は marker click を消費した後のみ発火 (= marker tap で誤発火しない)。
    //   handler は ref 経由で prop 変化に追従 (= Effect 1 は 1 度だけ実行されるため)。
    //
    //   型注記: GmapsMap interface に addListener が未公開のため、 実 Google Maps Map class の
    //   公開 method として local cast (= googleMapsLoader.ts 不触、 frozen file 制約遵守)。
    type MapWithListener = GmapsMap & {
      addListener: (event: string, handler: () => void) => { remove: () => void };
    };
    let backgroundClickListener: { remove: () => void } | null = null;
    if (newMode) {
      backgroundClickListener = (map as MapWithListener).addListener("click", () => {
        onBackgroundClickRef.current?.();
      });
    }

    return () => {
      backgroundClickListener?.remove();
      mapInstanceRef.current = null;
    };
  }, [keyAvailable, ready, newMode]);

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

    // ── route polyline (時刻順 pin を dashed 線で connect、CEO mockup 整合) ──
    //
    // 設計:
    //   - sortedPath は anchor.startTime ascending、pin.kind 不問
    //   - 1 pin 以下は polyline 描画しない
    //   - dashed style: strokeOpacity=0 で solid 線を隠し、icons で dashed pattern を repeat
    //   - polyline は pin marker の下層 (z-index 自動、marker が上に重なる)
    //
    // 注: baseline pin が混在すると line が baseline 経由になる (= "今日この順で動く" 視覚化)。
    // CEO 補正「予定→pin guarantee」 整合: baseline pin も日程の一部として line に含める。
    const sortedPins = [...pins].sort((a, b) =>
      a.anchor.startTime.localeCompare(b.anchor.startTime),
    );
    let polyline: GmapsPolyline | null = null;
    if (sortedPins.length >= 2 && !isSamePointCluster(sortedPins.map((p) => p.coord))) {
      polyline = new maps.Polyline({
        map,
        path: sortedPins.map((p) => p.coord),
        strokeOpacity: 0, // solid 線を隠す
        strokeColor: "#94a3b8", // slate-400 (subtle)
        icons: [
          {
            icon: {
              path: "M 0,-1 0,1", // 1px の縦線
              strokeOpacity: 0.8,
              strokeColor: "#94a3b8",
              scale: 3,
            },
            offset: "0",
            repeat: "12px", // 12px 毎に縦線を打つ → dashed 風
          },
        ],
      });
    }

    // 9a-impl: 番号 label 用 (= 時刻順、 selected ラベルに "1·09:00" 形式で含む)
    //   sortedPins は polyline 用と同じく時刻 ascending、 pin id → order map で marker 内引き
    const orderById = new Map<string, number>();
    sortedPins.forEach((p, i) => orderById.set(p.anchor.id, i + 1));

    // ── markers (pin label 含む) ──
    const markers: GmapsMarker[] = [];
    for (const pin of pins) {
      const markerSpec = pin.anchor.sensitiveCategory
        ? MAP_SENSITIVE_MARKER
        : MAP_CATEGORY_MARKER[categoryOf(pin.anchor)];

      const isSelected = pin.anchor.id === selectedAnchorId;
      // selected pin は scale 大きめで強調 (mockup の "tap で詳細" UX 整合)
      //   - OFF path (legacy): selected = baseScale + 4 (大きく強調)
      //   - ON path (9a-impl): selected = baseScale + 2 (= CEO + GPT 「強すぎない first-pass」、 軽い scale up)
      const baseScale = pin.kind === "resolved" ? 12 : 10;
      const selectedOffset = newMode ? 2 : 4;
      const scale = isSelected ? baseScale + selectedOffset : baseScale;

      // 9a-impl: ON path で selected pin に shadow 強化 substitute (= strokeWeight bump)
      //   Google Maps Marker は直接 box-shadow 不可、 stroke 太さで「際立ち」 を演出
      const baseStrokeResolved = newMode && isSelected ? 3 : 2;
      const baseStrokeBaseline = newMode && isSelected ? 3.5 : 2.5;

      // Step γ: newMode の時、 既存 CIRCLE marker の代わりに 涙型 SVG data URI を使う
      //   (= 独自 pin、 涙型 + カテゴリ色 + 白抜き icon、 mock fidelity)
      //   既存 OFF path は CIRCLE のまま (= legacy 完全不変)
      const useCustomPin = newMode;
      const eventCategory = useCustomPin
        ? resolveMapEventCategory(pin.anchor)
        : null;
      // GmapsIcon 拡張型 (= url field、 GmapsIcon に未公開、 local cast pattern)
      type IconWithUrl = {
        url?: string;
        anchor?: ReturnType<typeof maps.Point extends abstract new (...args: never) => infer R ? () => R : never>;
      };

      // resolved = filled circle、baseline = hollow circle (approximate)
      const iconStyle: IconWithUrl & Record<string, unknown> = useCustomPin && eventCategory
        ? (() => {
            const pinSize = getPinSize(isSelected);
            // Step γ: time label を SVG 内に embed (= 全 pin 時刻表示、 mock 白カード)
            const timeLabel = formatTime(pin.anchor.startTime);
            return {
              url: generatePinSvgDataUri(eventCategory, isSelected, timeLabel),
              // anchor = pin 尖り先 (= 下端中央) で coord に attach、 label 部分は anchor より下
              anchor: new maps.Point(pinSize.width / 2, pinSize.pinTipY),
            };
          })()
        : pin.kind === "resolved"
          ? {
              path: maps.SymbolPath.CIRCLE,
              scale,
              fillColor: markerSpec.color,
              fillOpacity: 1,
              strokeColor: "#ffffff",
              strokeWeight: baseStrokeResolved,
              // label を pin の下に表示 (mockup の "time + name" box style に近い)
              labelOrigin: new maps.Point(0, scale + 12),
            }
          : {
              path: maps.SymbolPath.CIRCLE,
              scale,
              fillColor: "#ffffff",
              fillOpacity: 0.95,
              strokeColor: markerSpec.color,
              strokeWeight: baseStrokeBaseline,
              labelOrigin: new maps.Point(0, scale + 12),
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

      // pin label = 時刻 ("09:00")。
      //   OFF path (legacy): 全 pin 時刻表示 (= 既存挙動)
      //   ON path (Step γ): **全 pin 時刻表示** (= CEO Q3 採用、 mock 整合)、 selected 強調
      //     - unselected: 時刻のみ (= "09:00")
      //     - selected: 時刻のみ太字大 (= "09:00"、 fontSize / weight で強調)
      //     - title 含む白カードラベルは Step γ 後段 or 9b で OverlayView 導入時
      const labelText = newMode
        ? formatTime(pin.anchor.startTime)
        : formatTime(pin.anchor.startTime);

      const marker = new maps.Marker({
        map,
        position: pin.coord,
        title: markerTitle,
        icon: iconStyle,
        // Step γ: newMode (= custom SVG pin) では time label を SVG 内 embed 済み、
        //   marker.label 不使用 (= 二重表示防止、 視覚 clean)。 OFF path は既存 label 維持。
        ...(useCustomPin
          ? {}
          : {
              label: {
                text: labelText,
                color: isSelected ? "#1e1b4b" : "#374151",
                fontSize: isSelected ? "12px" : "11px",
                fontWeight: "600",
              },
            }),
        // 9a-impl: ON path + selected で z-index 上昇 (= CEO/GPT 「z-index 上昇」)
        ...(newMode && isSelected ? { zIndex: 100 } : {}),
      });
      marker.addListener("click", () => {
        onPinClickRef.current?.(pin.anchor);
      });
      markers.push(marker);
    }

    return () => {
      // pin / baseline / selected 変化で markers + polyline 破棄、Map instance は keep alive
      for (const m of markers) m.setMap(null);
      polyline?.setMap(null);
    };
  }, [pins, baselineCoords, selectedAnchorId, newMode]);

  // ─── Effect 3 (9b-2): pin screen position 計算 (= label spatial binding 用、 newMode 専用) ───
  //   selectedAnchorId 変化 + bounds_changed event で再計算、 setState で MapSelectedPinLabel に流す。
  //   bounds 取得 API は GmapsMap interface 未公開のため local cast (= 9a-impl-fix1 と同 pattern)。
  //
  //   ★ Rules of Hooks 厳守: 早期 return より **前** に declare (= fix2 と同 pattern)。
  const [selectedPinScreenPos, setSelectedPinScreenPos] = useState<PinScreenPosition | null>(null);
  useEffect(() => {
    const map = mapInstanceRef.current;
    const mapDiv = mapRef.current;
    if (!newMode || !map || !mapDiv || !selectedAnchorId) {
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
        // sheet 表示中かどうか = selectedAnchorId set かつ newMode (= MapTab で newSheet が flow される)
        sheetVisible: true,
      });
    };

    // 初回計算 + bounds_changed listener
    updatePosition();
    const listener = mapExt.addListener("bounds_changed", updatePosition);
    return () => listener.remove();
  }, [newMode, selectedAnchorId, pins]);

  // 9a-impl: 現在地 button handler (= newMode 専用、 navigator.geolocation で center 移動)
  //   CEO + GPT 着手条件 B 「controls 維持」 整合: zoom (= Maps native) + current location (= 自前) を 9a でも残す
  //   失敗時は silent (= permission denied / unavailable で UI 不変)
  //
  //   ★ Rules of Hooks 厳守: 早期 return (= keyAvailable / ready) より **前** に useCallback を declare。
  //     ready=false → ready=true 遷移時に hook 数が変わって 「Rendered more hooks than during the previous render」
  //     error が出るのを防ぐ (= 9a-impl-fix1 後に判明、 fix2 で修正)。
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
    <div
      className={
        newMode
          ? "relative w-full" // Step δ-corrective: full-bleed (= mb なし、 card 化撤去)
          : "relative w-full mb-4"
      }
    >
      <div
        ref={mapRef}
        data-testid="plan-map-view"
        role="region"
        aria-label="地図 (選択日の予定の場所)"
        className={
          newMode
            ? "w-full overflow-hidden" // Step δ-corrective: 角丸 / 枠なし (= map が画面いっぱい)
            : "w-full rounded-2xl overflow-hidden border border-slate-200"
        }
        style={{
          // Step δ-corrective: newMode は dvh-based で画面下端まで (= header + tab area 約 130px 引く)
          //   OFF path は既存 380px 固定
          height: newMode
            ? "calc(100dvh - 130px)"
            : `${MAP_HEIGHT_PX}px`,
        }}
      />
      {/* 9a-impl Step α: 現在地 button (= newMode のみ、 右上 absolute、 zoom default position [BOTTOM_RIGHT] と分離)
       *   重なり解消: Google Maps default zoom = 右下 → 現在地 button を 右上 に移動 (= CEO 補正 #5「重なり解消」 厳守)
       *   mock fidelity 改善は Step γ/δ で検討 (= 右中央 zoom + 右下 location などへ）
       */}
      {newMode && (
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
      )}
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

      {/* Step δ: DayItemsPanel (= 左下 当日リスト / 凡例 hybrid、 newMode 時のみ)
       *   旧 Category legend (= 下) を newMode で置換、 panel は機能 + 視覚で凡例を兼ねる
       *
       *   9b-4 layout: sheet 表示中は panel hide (= 視線競合解消、 CEO 残課題 C)
       *     - sheet 閉じる (= ✕ or 余白 tap、 8 場面表 #4/#7) で panel 再表示
       *     - pin 切替は map pin tap で行う (= 8 場面表 #8、 panel 不在でも操作可)
       */}
      {newMode && dayItemsForPanel && onDayItemTap && !selectedSheetForLabel && (
        <DayItemsPanel
          items={dayItemsForPanel}
          selectedId={selectedAnchorId}
          onItemTap={onDayItemTap}
        />
      )}

      {/* 9b-1 carry → 9b-2 carry-2: MapSelectedPinLabel (= 動的 pin 追従 + Y clamp)
       *   - sheet null なら自動非表示 (= 既存挙動)
       *   - newMode + selectedPinScreenPos set → pin 真上寄り + sheet で隠れない Y clamp
       *   - newMode + selectedPinScreenPos null → top-center fallback (= 9b-1 旧挙動)
       */}
      {newMode && (
        <MapSelectedPinLabel
          sheet={selectedSheetForLabel ?? null}
          pinPosition={selectedPinScreenPos}
        />
      )}

      {/* Category legend overlay (mockup: bottom-left、active categories のみ)
       *  9a-impl: newMode では非表示 (= 「map 上は軽く」 spec v3 §0、 sheet が主戦場)
       */}
      {!newMode && activeCategories.length > 0 && (
        <div
          data-testid="plan-map-legend"
          aria-label="カテゴリ凡例"
          className="absolute bottom-3 left-3 max-w-[60%] pointer-events-none"
        >
          <ul className="bg-white/95 backdrop-blur-sm rounded-xl px-3 py-2 shadow-sm border border-slate-200 flex flex-wrap gap-x-3 gap-y-1">
            {activeCategories.map((cat) => {
              const meta = CATEGORY_META[cat];
              const marker = MAP_CATEGORY_MARKER[cat];
              return (
                <li
                  key={cat}
                  className="flex items-center gap-1.5 text-xs text-slate-700"
                >
                  <span
                    aria-hidden="true"
                    className="inline-block w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: marker.color }}
                  />
                  <span>
                    {meta.emoji} {meta.label}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
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
