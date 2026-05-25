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

// ── Phase 3-N Map impl sub-phase 9a-impl: flag + 新 surface ──
//   既存 OFF path は不変、 flag ON 時のみ 新 BottomSheet 表示 + 旧 UI 群非表示。
//   state は完全分離 (= newSelectedPinId 専用、 legacy selectedAnchorId と相互参照禁止)。
import { MAP_NEW_SURFACE_ENABLED } from "@/lib/plan/map/featureFlags";
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
  onAddRequest,
  onAnchorClick,
  // ── Phase 3-J-6d: Proposal hint 導線 (= presentational 寄り) ──
  // 全 optional。 未指定なら Phase 2 と完全同じ表示 (= backward compat 100%)。
  // 実 proposal 生成 + state 接続は J-6e で PlanClient が担当。
  proposalsByDate,
  proposalTemplateVariables,
  onProposalAccept,
  onProposalModify,
  onProposalDismiss,
  // ── Phase 3-J-6e-3 ──
  acceptingProposalIds,
  recentUndoRecords,
  onProposalUndo,
  // ── Phase 3-K-3c-i: DayGraph UI 接続 (= SelectedAnchorCard 下に静かに追加) ──
  // K-2 から受領していた dayGraphByDate を、 ここで active 利用。
  // 既存 SelectedAnchorCard / proposal hint / CategoryGrid 等は不変、 timeline を静かに追加。
  dayGraphByDate,
}: {
  anchors: ExternalAnchor[];
  now?: Date;
  onAddRequest?: (req: AddRequest) => void;
  /** W1-X5: anchor 行クリック / Enter / Space で detail modal を開く */
  onAnchorClick?: (anchor: ExternalAnchor) => void;
  /**
   * K-2 接続層: PlanClient で計算した DayGraph。
   * K-2 では tab 側は使用しない (= K-3 以降で UI 接続予定)。
   */
  dayGraphByDate?: Readonly<Record<string, import("@/lib/plan/dayGraph/dayGraphTypes").BuildDayGraphResult>>;
} & CalendarProposalProps) {
  const baseNow = now ?? new Date();
  const todayDate = utcMidnight(baseNow);

  // ── selectedDate state (CEO 補正: MapTab は selectedDate-centric) ──
  // default は今日。前日 / 翌日 切替で変更。
  const [selectedDate, setSelectedDate] = useState<Date>(todayDate);
  const isToday = isoDate(selectedDate) === isoDate(todayDate);

  // ── selectedAnchorId state (mockup の "tap で詳細" UX、bottom card で表示中の anchor) ──
  const [selectedAnchorId, setSelectedAnchorId] = useState<string | null>(null);

  // ── Phase 3-N 9a-impl: 新 selected pin state (= 完全分離、 default null、 legacy fallback 漏れ込み禁止) ──
  // legacy `selectedAnchorId` は default fallback で dayAnchors[0] に auto-set される (旧 UX)。
  // 新 `newSelectedPinId` は 8 場面表準拠で 「初期 = なし」 を厳守 (= CEO + GPT 着手判断条件 A)。
  const [newSelectedPinId, setNewSelectedPinId] = useState<string | null>(null);

  // ── CategoryGrid 用 window (14 日固定、anchor 集計 context) ──
  const aggregateEnd = useMemo(
    () => addDays(todayDate, CATEGORY_AGGREGATE_WINDOW_DAYS - 1),
    [todayDate],
  );

  // ── selectedDate 当日の anchor を取得 (recurring 展開 + exception_dates 全継承) ──
  const dayAnchors = useMemo(
    () => anchorsForDay(anchors, selectedDate),
    [anchors, selectedDate],
  );

  // ── Geocode は selectedDate 当日 anchor のみ (lazy resolve) ──
  const { resolutions, loading: geocodeLoading, apiAvailable } =
    usePlanGeocode(dayAnchors);

  // ── L-4d MapTab-only: bridge → pipeline で MovementDisplayView を取得 ──
  //    既存 resolutions を読むだけ (= 新規 geocode call なし、 fetch なし、 localStorage なし)。
  //    結果は下の DayGraphTimeline.movementDisplayByTransitionIndex に渡す。
  //    pipeline 解決前 / エラー時は空 Map で、 K view fallback (= 「→ 移動」) が維持される。
  const movementDisplayByTransitionIndex = useMapTabMovementDisplay(
    dayAnchors,
    isoDate(selectedDate),
    resolutions,
  );

  // ── M-3c-ui MapTab-only: feasibility display + per-transition disclosure ──
  //    既存 resolutions を読むだけ (= 新規 fetch なし、 localStorage なし、 telemetry なし)。
  //    pipeline は parallel computation (= L-4c-pure の result が overlay を露出しないため)。
  //    結果は DayGraphTimeline.feasibilityDisplayByTransitionIndex に渡す。
  //    not_applicable は M-2a で map から除外済 (= sensitive / unresolved / location_unknown 対策)。
  const feasibilityDisplayByTransitionIndex = useMapTabFeasibilityDisplay(
    dayAnchors,
    isoDate(selectedDate),
    resolutions,
  );

  // M-3c-ui disclosure state — default 全 hidden (= M-3c-pure-harden 規約)
  //   React lazy initial state pattern (= `resetAllDisclosures` 関数 ref を渡す)。
  //   - 初期 state は必ず新規 empty Set (= mutation 攻撃面 0)
  //   - re-render 時に再計算されない (= function ref が安定)
  const [expandedTransitionIndices, setExpandedTransitionIndices] = useState<
    ExpandedTransitionIndices
  >(resetAllDisclosures);

  // M-3c-ui: selectedDate 変化で reset (= 「観測の幕間」、 革新 5)
  //   localStorage 禁止と整合: persist なし、 日切替で fresh observation 再起動。
  useEffect(() => {
    setExpandedTransitionIndices(resetAllDisclosures());
  }, [selectedDate]);

  // M-3c-ui: per-transition disclosure toggle handler
  //   transition line tap / Enter / Space で呼ばれる。
  //   M-3c-pure-harden の applyDisclosureAction (= idempotency 同参照保持) 経由で状態更新。
  const handleToggleFeasibilityDisclosure = useCallback(
    (transitionIndex: number) => {
      setExpandedTransitionIndices((current) => {
        const currentState = getDisclosureStateForIndex(current, transitionIndex);
        const action = currentState === "expanded" ? "request_collapse" : "request_expand";
        return applyDisclosureAction(current, transitionIndex, action);
      });
    },
    [],
  );

  const { baselineCoords, loading: baselineLoading } = usePlanBaseline();
  const loading = geocodeLoading || baselineLoading;

  // ── visibleAnchors = dayAnchors (day-centric) ──
  const visibleAnchors = dayAnchors;

  // ── Category groups (CategoryGrid 用、aggregateEnd window で集計) ──
  const groups = useMemo(
    () => groupAnchorsByLocation(anchors, todayDate, aggregateEnd),
    [anchors, todayDate, aggregateEnd],
  );

  // ── day switcher handlers (day 切替で selected anchor リセット) ──
  // 9a-impl: legacy `selectedAnchorId` + 新 `newSelectedPinId` 両方 reset (= 8 場面表 #5 「day switch → 解除」)
  const handlePrevDay = () => {
    setSelectedDate((d) => addDays(d, -1));
    setSelectedAnchorId(null);
    setNewSelectedPinId(null);
  };
  const handleNextDay = () => {
    setSelectedDate((d) => addDays(d, 1));
    setSelectedAnchorId(null);
    setNewSelectedPinId(null);
  };
  const handleGoToday = () => {
    setSelectedDate(todayDate);
    setSelectedAnchorId(null);
    setNewSelectedPinId(null);
  };

  // ── pin tap → bottom card 表示切替 (and AnchorDetailModal は別 button から起動) ──
  const handlePinTap = (anchor: ExternalAnchor) => {
    setSelectedAnchorId(anchor.id);
  };

  // ── 9a-impl: 新 pin tap handler (= 8 場面表準拠、 同 pin = no-op / 別 pin = 切替) ──
  // legacy `handlePinTap` とは別。 state も `newSelectedPinId` 専用、 fallback なし。
  const handleNewPinTap = (anchor: ExternalAnchor) => {
    setNewSelectedPinId((prev) => {
      if (prev === anchor.id) return prev; // 場面 #3: 同 pin 再 tap → no-op
      return anchor.id; // 場面 #2/#8: pin tap (= 初回 or 別 pin) → 切替
    });
  };

  // ── 9a-impl: sheet close handler (= 場面 #4 「sheet close → 解除」) ──
  const handleNewSheetClose = () => {
    setNewSelectedPinId(null);
  };

  // ── 9a-impl: 新 sheet view model (= newSelectedPinId 由来、 default null、 legacy fallback 不参照) ──
  // newSelectedPinId が dayAnchors に存在しない場合は null (= sheet 非表示)。
  const newSheet = useMemo<MapSheetViewModel | null>(() => {
    if (!MAP_NEW_SURFACE_ENABLED) return null;
    if (!newSelectedPinId) return null;
    const anchor = dayAnchors.find((a) => a.id === newSelectedPinId);
    if (!anchor) return null;
    return convertExternalAnchorToMapSheet(anchor);
  }, [newSelectedPinId, dayAnchors]);

  // ── Step β: selected pin の anchor (= CTA wire-up 用) ──
  const newSelectedAnchor = useMemo<ExternalAnchor | null>(() => {
    if (!MAP_NEW_SURFACE_ENABLED) return null;
    if (!newSelectedPinId) return null;
    return dayAnchors.find((a) => a.id === newSelectedPinId) ?? null;
  }, [newSelectedPinId, dayAnchors]);

  // ── Step β: 「ここへの経路」 用 Google Maps dir URL (= CEO Q2 採用 B、 lat/lng 不在なら null = disabled) ──
  const newRouteUrl = useMemo<string | null>(() => {
    if (!MAP_NEW_SURFACE_ENABLED) return null;
    if (!newSelectedAnchor) return null;
    const r = resolutions.get(newSelectedAnchor.id);
    if (!r || !isValidLatLng(r.lat, r.lng)) return null;
    return `https://www.google.com/maps/dir/?api=1&destination=${r.lat},${r.lng}`;
  }, [newSelectedAnchor, resolutions]);

  // ── Step β: 「詳細を見る」 handler (= 既存 onAnchorClick 経由で AnchorDetailModal 起動) ──
  const handleNewOpenDetail = useCallback(() => {
    if (!newSelectedAnchor || !onAnchorClick) return;
    onAnchorClick(newSelectedAnchor);
  }, [newSelectedAnchor, onAnchorClick]);

  // ── Step δ: DayItemsPanel 用 当日 item list (= 時刻順、 category 解決) ──
  const dayItemsForPanel = useMemo<DayItem[]>(() => {
    if (!MAP_NEW_SURFACE_ENABLED) return [];
    return [...dayAnchors]
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
      .map((a) => ({
        anchorId: a.id,
        category: resolveMapEventCategory(a),
      }));
  }, [dayAnchors]);

  // ── Step δ: DayItemsPanel row tap handler (= anchorId → anchor 解決 → handleNewPinTap 経由) ──
  const handleDayItemTap = useCallback(
    (anchorId: string) => {
      const anchor = dayAnchors.find((a) => a.id === anchorId);
      if (anchor) handleNewPinTap(anchor);
    },
    [dayAnchors],
  );

  // ── 現在 bottom card で表示する anchor (default = day の最初の anchor) ──
  const selectedAnchorForCard = useMemo<ExternalAnchor | null>(() => {
    if (selectedAnchorId) {
      const found = dayAnchors.find((a) => a.id === selectedAnchorId);
      if (found) return found;
    }
    // default fallback: 日の最初の anchor (時刻順 先頭)
    return dayAnchors[0] ?? null;
  }, [selectedAnchorId, dayAnchors]);

  // ── Phase 2-E: 時刻重なり気付き indicator 用、dayAnchors の overlap Set を pre-compute ──
  // 判定は detectTimedAnchorOverlaps (Cross-tab 単一仕様) のみ使用、独自判定なし
  // CEO 補正 3 第一候補: MapTab で pre-compute、SelectedAnchorCard に hasOverlap prop で渡す
  const dayAnchorsOverlapSet = useMemo(
    () => detectTimedAnchorOverlaps(dayAnchors),
    [dayAnchors],
  );

  // ── 全 anchor を pin 化 (CEO 補正: 予定 → pin guarantee) ──
  //
  // 戦略:
  //   1. resolution あり (locationText 解決済) → resolved pin (具体 coord、category color filled)
  //   2. resolution なし + baselineCoords あり → baseline pin (baseline coord、outline-only、approximate)
  //   3. resolution なし + baselineCoords なし → no pin、semantic fallback list のみ
  //
  // sensitive anchor は server 側で resolution=null (unresolved_sensitive) のため自動的に
  // baselineCoords / lived_geography に流れる (privacy: 具体 location は外送信されない、 fallback は user 既知 area)。
  //
  // Phase 2-G: Lived Geography Confidence Fallback を baseline 優先順位に挿入。
  // 優先順位 (= mini design §2.2):
  //   1. resolved anchor (= place_resolution_cache hit、 最高信頼)
  //   2. baseline.source === "home" → home pin (= user 明示・安定 base、 最優先)
  //   3. lived_geography (= confidence gate 通過時のみ)
  //   4. baseline.source === "city" / "prefecture" → 既存 baseline pin
  //   5. なし → noPin
  const livedGeography: LivedGeographyFallback | null = useMemo(
    () => computeLivedGeographyFallback(anchors, resolutions, new Date()),
    [anchors, resolutions],
  );

  const { allPins, anchorsWithoutPin } = useMemo(() => {
    const pins: AnchorWithCoord[] = [];
    const noPin: ExternalAnchor[] = [];
    for (const anchor of visibleAnchors) {
      const r = resolutions.get(anchor.id);
      if (r && isValidLatLng(r.lat, r.lng)) {
        // 1. resolved (= 最優先)
        pins.push({
          anchor,
          coord: { lat: r.lat, lng: r.lng },
          resolvedName: r.resolvedName,
          kind: "resolved",
        });
      } else if (baselineCoords && baselineCoords.source === "home") {
        // 2. home baseline 優先 (= user 明示拠点)
        pins.push({
          anchor,
          coord: { lat: baselineCoords.lat, lng: baselineCoords.lng },
          resolvedName: baselineCoords.label ?? "自宅 周辺",
          kind: "baseline",
        });
      } else if (livedGeography) {
        // 3. lived_geography (= 信頼度 gate 通過時、 city/prefecture より上位)
        pins.push({
          anchor,
          coord: { lat: livedGeography.lat, lng: livedGeography.lng },
          resolvedName: "最近の場所傾向",
          kind: "lived_geography",
        });
      } else if (baselineCoords) {
        // 4. city / prefecture baseline (= 既存 fallback)
        pins.push({
          anchor,
          coord: { lat: baselineCoords.lat, lng: baselineCoords.lng },
          resolvedName: baselineCoords.label ?? "baseline 周辺",
          kind: "baseline",
        });
      } else {
        // 5. no pin
        noPin.push(anchor);
      }
    }
    return { allPins: pins, anchorsWithoutPin: noPin };
  }, [visibleAnchors, resolutions, baselineCoords, livedGeography]);

  // ── Map 上に pin 化されていない anchor (= baseline すらない) ──
  // UnresolvedAnchorsSection に表示する (transparency: user が "何が pin にならない" を理解)
  const unresolvedAnchors = useMemo(() => {
    // baseline ありなら全 unresolved が baseline pin になるが、user に「これは具体場所ではなく
    // baseline pin」 と明示するため、resolution=null の anchor を section にも残す
    const out: ExternalAnchor[] = [];
    for (const anchor of visibleAnchors) {
      const r = resolutions.get(anchor.id);
      if (!r || !isValidLatLng(r.lat, r.lng)) out.push(anchor);
    }
    return out;
  }, [visibleAnchors, resolutions]);

  // ── handlers ──
  const handleAddFab = () => {
    onAddRequest?.({
      initial: {},
      subtitle: "地理 / カテゴリ未指定 から",
    });
  };

  const handleCategoryAdd = (category: LocationGroupKey) => {
    if (!onAddRequest) return;
    const meta = CATEGORY_META[category];
    // AnchorFormState.locationCategory は LocationCategory | "" 型。
    // "none" カテゴリの場合は空文字 (= 未選択) で起動、それ以外は category を pre-fill。
    const initial =
      category === "none"
        ? {}
        : { locationCategory: category as LocationCategory };
    onAddRequest({
      initial,
      subtitle: `${meta.emoji} ${meta.label}での予定を教える`,
    });
  };

  // ── render ──
  return (
    <div data-testid="plan-map-tab" className="relative pb-24">
      {/* 9a-impl Step α: PlanClient header に統一されたため、 旧 「あなたの地理」 内 header は flag ON 時 hide */}
      {!MAP_NEW_SURFACE_ENABLED && (
        <header className="mb-3">
          <h2 className="text-sm font-semibold text-slate-900">あなたの地理</h2>
          <p className="text-xs text-slate-500">
            {isToday ? "今日の予定がある場所" : "選択日の予定がある場所"}
          </p>
        </header>
      )}

      {/* 9a-impl Step α: mock fidelity (= map がタブ直下に埋め込み)、 flag ON 時 DaySwitcher 非表示
       *   day 切替機能は別 step 候補、 mock では「今日」 のみ */}
      {!MAP_NEW_SURFACE_ENABLED && (
        <DaySwitcher
          selectedDate={selectedDate}
          todayDate={todayDate}
          onPrev={handlePrevDay}
          onNext={handleNextDay}
          onGoToday={handleGoToday}
        />
      )}

      <PlanMapView
        pins={allPins}
        baselineCoords={baselineCoords}
        loading={loading}
        apiAvailable={apiAvailable}
        anchorsWithoutPinCount={anchorsWithoutPin.length}
        // 9a-impl: state 完全分離 (= flag ON path は newSelectedPinId、 OFF path は legacy)
        selectedAnchorId={
          MAP_NEW_SURFACE_ENABLED
            ? newSelectedPinId
            : selectedAnchorForCard?.id ?? null
        }
        // 9a-impl: 8 場面表準拠 handler を flag ON 時のみ差し替え
        onPinClick={MAP_NEW_SURFACE_ENABLED ? handleNewPinTap : handlePinTap}
        // 9a-impl-fix1: background tap (= 場面 #7、 newMode 専用) → selected 解除
        onBackgroundClick={MAP_NEW_SURFACE_ENABLED ? handleNewSheetClose : undefined}
        // 9a-impl: PlanMapView 内 controls + visual 補正用 flag
        newMode={MAP_NEW_SURFACE_ENABLED}
        // Step δ: 左下 当日リスト panel data (= flag ON 時のみ非空、 OFF 時 []) + tap handler
        dayItemsForPanel={dayItemsForPanel}
        onDayItemTap={MAP_NEW_SURFACE_ENABLED ? handleDayItemTap : undefined}
      />

      {/* 9a-impl Step β 新 BottomSheet (= flag ON、 8 段構造、 CTA 2 + image slot β) */}
      {MAP_NEW_SURFACE_ENABLED && (
        <MapBottomSheet
          sheet={newSheet}
          onClose={handleNewSheetClose}
          onOpenDetail={onAnchorClick ? handleNewOpenDetail : undefined}
          routeUrl={newRouteUrl}
        />
      )}

      {/* 9a-impl: flag ON 時は 旧 UI 群 (= SelectedAnchorCard / DayGraph / CategoryGrid /
       *   UnresolvedAnchorsSection / StaticAlterSuggestionCard / FAB) を非表示。
       *   sheet が主戦場、 map 上は軽く、 の spec v3 §0 整合。
       *   旧 file 本体は残し、 描画のみ flag で gate (= 9 closeout で一括削除予定)。
       */}
      {!MAP_NEW_SURFACE_ENABLED && (
        <>
      {/* mockup の bottom sheet 相当: 選択 anchor の詳細 + 詳細 button
       *
       * Phase 3-J-6d: proposal hint props pass-through。
       * Phase 3-J-6e-3: accept transaction + Quiet Undo Window 関連 props も pass-through。
       */}
      {selectedAnchorForCard && (
        <SelectedAnchorCard
          anchor={selectedAnchorForCard}
          pinKind={
            allPins.find((p) => p.anchor.id === selectedAnchorForCard.id)?.kind ??
            "baseline"
          }
          baselineCoords={baselineCoords}
          hasOverlap={dayAnchorsOverlapSet.has(selectedAnchorForCard.id)}
          onOpenDetail={onAnchorClick}
          proposalsByDate={proposalsByDate}
          proposalTemplateVariables={proposalTemplateVariables}
          onProposalAccept={onProposalAccept}
          onProposalModify={onProposalModify}
          onProposalDismiss={onProposalDismiss}
          acceptingProposalIds={acceptingProposalIds}
          recentUndoRecords={recentUndoRecords}
          onProposalUndo={onProposalUndo}
        />
      )}

      {/*
       * Phase 3-K-3c-i: DayGraphTimeline を **selected day の 1 日構造**として
       * SelectedAnchorCard 直後に静かに追加。
       *
       * 不変原則:
       *   - 既存 Map / SelectedAnchorCard / CategoryGrid / FAB 等は不変
       *   - selectedDate (= MapTab state) から ISO date string 化 (= isoDate helper)
       *   - dayGraphByDate[isoDate] が undefined / null なら何も render しない
       *   - 「場所文脈 → 時間文脈」 の自然な bridge (= where + when)
       *   - warnings / duration / mode / risk 表示なし
       *   - onEventClick → dayAnchors.find → 既存 onAnchorClick bridge
       */}
      {dayGraphByDate?.[isoDate(selectedDate)] && (
        <div
          className="mt-6 pt-4 border-t border-slate-100"
          data-testid="plan-map-day-graph-section"
        >
          <h4 className="text-xs font-medium text-slate-500 italic mb-2">
            1 日の構造
          </h4>
          <DayGraphTimeline
            result={dayGraphByDate[isoDate(selectedDate)] ?? null}
            view="user_self"
            onEventClick={(anchorId: string) => {
              if (!onAnchorClick) return;
              const anchor = dayAnchors.find((a) => a.id === anchorId);
              if (anchor) onAnchorClick(anchor);
            }}
            dataTestId="plan-map-day-graph-timeline"
            movementDisplayByTransitionIndex={movementDisplayByTransitionIndex}
            feasibilityDisplayByTransitionIndex={feasibilityDisplayByTransitionIndex}
            expandedTransitionIndices={expandedTransitionIndices}
            onToggleFeasibilityDisclosure={handleToggleFeasibilityDisclosure}
          />
        </div>
      )}

      <CategoryGrid
        groups={groups}
        windowDays={CATEGORY_AGGREGATE_WINDOW_DAYS}
        onAddCategory={onAddRequest ? handleCategoryAdd : undefined}
        onAnchorClick={onAnchorClick}
      />

      <UnresolvedAnchorsSection
        anchors={unresolvedAnchors}
        loading={loading}
        baselineCoords={baselineCoords}
        onAnchorClick={onAnchorClick}
      />

      <StaticAlterSuggestionCard />

      {onAddRequest && (
        <button
          type="button"
          onClick={handleAddFab}
          aria-label="場所カテゴリ未指定で予定を追加"
          data-testid="plan-map-fab"
          className="
            fixed bottom-20 right-6 z-30
            w-14 h-14 rounded-full
            bg-gradient-to-br from-indigo-500 to-purple-500
            text-white text-3xl font-light leading-none
            shadow-lg hover:shadow-xl active:scale-95
            transition-all
            flex items-center justify-center
          "
          style={{ marginBottom: "env(safe-area-inset-bottom, 0px)" }}
        >
          +
        </button>
      )}
        </>
      )}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DaySwitcher (CEO 補正: MapTab は selectedDate-centric、前日/今日/翌日 切替)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function DaySwitcher({
  selectedDate,
  todayDate,
  onPrev,
  onNext,
  onGoToday,
}: {
  selectedDate: Date;
  todayDate: Date;
  onPrev: () => void;
  onNext: () => void;
  onGoToday: () => void;
}) {
  const isToday = isoDate(selectedDate) === isoDate(todayDate);
  const dateLabel = isToday ? `今日 · ${formatJpDate(selectedDate)}` : formatJpDate(selectedDate);
  const prevDate = addDays(selectedDate, -1);
  const nextDate = addDays(selectedDate, 1);

  return (
    <div
      data-testid="plan-map-day-switcher"
      className="mb-3 flex items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-2 py-2"
    >
      <button
        type="button"
        onClick={onPrev}
        aria-label={`前日 (${formatJpDate(prevDate)}) を表示`}
        data-testid="plan-map-prev-day"
        className="flex h-10 w-10 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M15 18l-6-6 6-6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <div className="flex flex-1 flex-col items-center text-center">
        <p
          className={
            "text-sm font-semibold " + (isToday ? "text-indigo-700" : "text-slate-900")
          }
          data-testid="plan-map-selected-date-label"
        >
          {dateLabel}
        </p>
        {!isToday && (
          <button
            type="button"
            onClick={onGoToday}
            aria-label="今日へ戻る"
            data-testid="plan-map-go-today"
            className="text-xs font-medium text-indigo-600 hover:underline"
          >
            今日へ戻る
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={onNext}
        aria-label={`翌日 (${formatJpDate(nextDate)}) を表示`}
        data-testid="plan-map-next-day"
        className="flex h-10 w-10 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M9 18l6-6-6-6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
}

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
    <div className="relative w-full mb-4">
      <div
        ref={mapRef}
        data-testid="plan-map-view"
        role="region"
        aria-label="地図 (選択日の予定の場所)"
        className="w-full rounded-2xl overflow-hidden border border-slate-200"
        style={{ height: `${MAP_HEIGHT_PX}px` }}
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
       */}
      {newMode && dayItemsForPanel && onDayItemTap && (
        <DayItemsPanel
          items={dayItemsForPanel}
          selectedId={selectedAnchorId}
          onItemTap={onDayItemTap}
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
// SelectedAnchorCard (mockup の bottom sheet 相当、day-centric の詳細 panel)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function SelectedAnchorCard({
  anchor,
  pinKind,
  // Phase 2-G で type 拡張、 prop name 不変
  baselineCoords,
  hasOverlap,
  onOpenDetail,
  // ── Phase 3-J-6d: Proposal hint 導線 ──
  proposalsByDate,
  proposalTemplateVariables,
  onProposalAccept,
  onProposalModify,
  onProposalDismiss,
  // ── Phase 3-J-6e-3: accept transaction + Quiet Undo ──
  acceptingProposalIds,
  recentUndoRecords,
  onProposalUndo,
}: {
  anchor: ExternalAnchor;
  /** Phase 2-G: "lived_geography" を追加 (= 信頼度つき生活圏 fallback) */
  pinKind: "resolved" | "baseline" | "lived_geography";
  baselineCoords: BaselineCoords | null;
  /**
   * Phase 2-E: 同日内で時刻が他 anchor と重なるか。
   * 判定は MapTab 側の detectTimedAnchorOverlaps (Cross-tab 単一仕様) のみ使用、
   * SelectedAnchorCard 内で独自判定しない。
   * sensitive anchor でも `true` の場合は表示 (= 外部送信でも内容開示でもない、文言固定)。
   */
  hasOverlap: boolean;
  onOpenDetail?: (anchor: ExternalAnchor) => void;
} & CalendarProposalProps) {
  const cat = categoryOf(anchor);
  const meta = CATEGORY_META[cat];
  const marker = anchor.sensitiveCategory
    ? MAP_SENSITIVE_MARKER
    : MAP_CATEGORY_MARKER[cat];
  const isSensitive = !!anchor.sensitiveCategory;

  // Phase 2-F: Compact density (primary only)、title に fullLabel
  // sensitive 配慮は既存の `!isSensitive` gate で gate される (= 場所表示自体 sensitive 時非表示)
  const { primary: locationPrimary, fullLabel: locationFullLabel } =
    formatLocationDisplayParts(anchor);

  // sensitive は title を masked 表示 (privacy preserve、modal で実 title 開示)
  const displayTitle = isSensitive
    ? `[${SENSITIVE_LABEL[anchor.sensitiveCategory!]}] (詳細は modal で)`
    : anchor.title;

  // baseline source 透明性 (CEO 補正: 「成田市 中心 付近」 等で具体性を伝達)
  // Phase 2-G: pinKind="lived_geography" の場合は信頼度 fallback 文言を表示
  const baselineSourceLabel = (() => {
    if (pinKind === "lived_geography") {
      // GPT 補正 5 採用文言 (= 断定回避、 「仮置き」 で暫定を明示)
      return "場所未定 — 最近の場所傾向をもとに仮置きしています";
    }
    if (pinKind !== "baseline" || !baselineCoords) return null;
    const granularity =
      baselineCoords.source === "home"
        ? "自宅"
        : baselineCoords.source === "city"
          ? "市区町村中心"
          : "県中心"; // prefecture
    const where = baselineCoords.label ?? granularity;
    return `場所未定 — ${where} (${granularity}) 付近に置いています`;
  })();

  return (
    <section
      data-testid="plan-map-selected-card"
      role="region"
      aria-label="選択中の予定の詳細"
      className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="flex items-start gap-3">
        {/*
         * Phase 2-I 拡張: brand-specific icon を最優先
         * 優先順位: sensitive > brand > category
         * - sensitive: pickCategoryIcon が CategorySensitiveIcon を返す、 brand 露出させない
         * - brand: filled style、 brand color (= white background container)
         * - category fallback: outlined + category color
         */}
        {(() => {
          if (isSensitive) {
            const Icon = pickCategoryIcon({ sensitive: true });
            return (
              <div
                className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full"
                style={{ backgroundColor: marker.color + "20" }}
                aria-hidden="true"
              >
                <Icon className="w-6 h-6 text-slate-500" />
              </div>
            );
          }
          const brandHit = pickBrandIcon(anchor.locationText);
          if (brandHit) {
            const BrandIcon = brandHit.icon;
            return (
              <div
                className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full overflow-hidden bg-white border border-slate-200"
                aria-hidden="true"
                title={brandHit.displayName}
              >
                <BrandIcon className="w-10 h-10" />
              </div>
            );
          }
          const Icon = pickCategoryIcon({ category: cat });
          const colorClass = pickCategoryColorClass({ category: cat });
          return (
            <div
              className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full"
              style={{ backgroundColor: marker.color + "20" }}
              aria-hidden="true"
            >
              <Icon className={`w-6 h-6 ${colorClass}`} title={meta.hint} />
            </div>
          );
        })()}

        <div className="flex-1 min-w-0">
          {/* time + title (mockup の "09:00 / 甲府駅近くのカフェ" 構造) */}
          <p className="text-sm font-mono text-indigo-700">
            {formatTime(anchor.startTime)}
            {anchor.endTime ? ` – ${formatTime(anchor.endTime)}` : ""}
          </p>
          <h3 className="text-base font-semibold text-slate-900 truncate">
            {displayTitle}
          </h3>

          {/*
           * Phase 2-F: Compact density (primary only)
           * title 属性に fullLabel (= mouse hover で full 情報)
           * 非 interactive な <p> なので aria-label は付けない (W3C ARIA 1.2)
           * 既存 SelectedAnchorCard 全体の `role="region" aria-label="選択中の予定の詳細"` は完全不変
           * sensitive 配慮は既存の `!isSensitive` gate (= 場所表示自体 sensitive 時非表示) 完全維持
           */}
          {locationPrimary && !isSensitive && (
            <p
              className="text-xs text-slate-500 mt-1 truncate"
              title={locationFullLabel}
            >
              📍 {locationPrimary}
            </p>
          )}
          {/*
           * Phase 2-D C3: 場所未確定 banner (subtle muted、tap で行動誘導しない)
           * 判定は Cross-tab 単一仕様の isPlaceUnconfirmed のみ使用
           *
           * pinKind="baseline" の baselineSourceLabel とは異なる概念:
           *   - baseline: 完全に座標なし、baseline 中心に置いている (= 既存表示)
           *   - unconfirmed: locationText は入っているが canonical でない (= 本 banner)
           * 両者が重なるケース (baseline + unconfirmed) は baseline label を優先
           * (より具体的な状態説明なので)。
           */}
          {/* Phase 2-G: pinKind !== "resolved" の場合は fallback、 unconfirmed indicator を非表示 (= baseline / lived_geography の透明性表示で十分) */}
          {!isSensitive &&
            pinKind === "resolved" &&
            isPlaceUnconfirmed(anchor.locationText) && (
              <p
                data-testid="plan-map-selected-unconfirmed-banner"
                className="text-xs text-slate-500 mt-1 italic"
              >
                場所未確定 — もっと具体的にできます
              </p>
            )}
          {/*
           * Phase 2-G: pinKind が baseline / lived_geography の場合に baselineSourceLabel を表示
           * - baseline: 「自宅 / 市区町村中心 / 県中心 付近に置いています」 (= 既存 text-amber-600 維持)
           * - lived_geography: 「最近の場所傾向をもとに仮置きしています」 (= muted slate、 警告色なし)
           */}
          {pinKind === "baseline" && !isSensitive && baselineSourceLabel && (
            <p
              className="text-xs text-amber-600 mt-1 italic"
              data-testid="plan-map-selected-baseline-source"
            >
              {baselineSourceLabel}
            </p>
          )}
          {pinKind === "lived_geography" && !isSensitive && baselineSourceLabel && (
            <p
              className="text-xs text-slate-500 mt-1 italic"
              data-testid="plan-map-selected-lived-geography-source"
            >
              {baselineSourceLabel}
            </p>
          )}
          {isSensitive && (
            <p className="text-xs text-slate-500 mt-1 italic">
              敏感カテゴリのため場所は外部に送信されません
              {baselineCoords &&
                ` (${baselineCoords.label ?? "baseline"} 付近に置いています)`}
            </p>
          )}
          {/*
           * Phase 2-E: 時刻重なり気付き banner (場所未確定 banner / sensitive 説明の下、muted slate)
           * - 警告ではなく「気付き」(muted slate のみ、警告色禁止)
           * - sensitive anchor でも表示 (= 外部送信でも内容開示でもない、Cross-tab 一貫性、GPT 補正 1)
           * - 文言固定、他 anchor 名・件数・内容は出さない
           * - 既存場所未確定 banner と同 tone / 同 余白 (mt-1 italic text-xs slate-500) で並ぶ
           */}
          {hasOverlap && (
            <p
              data-testid="plan-map-selected-overlap-banner"
              className="text-xs text-slate-500 mt-1 italic"
            >
              この時刻に他の予定があります
            </p>
          )}
        </div>
      </div>

      {/* Action button: 詳細 (AnchorDetailModal 起動、W1-X5 既存) */}
      {onOpenDetail && (
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={() => onOpenDetail(anchor)}
            aria-label={`${displayTitle} の詳細を見る`}
            data-testid="plan-map-selected-detail"
            className="rounded-full border border-indigo-200 px-4 py-1.5 text-sm font-medium text-indigo-600 transition hover:border-indigo-500 hover:bg-indigo-50"
          >
            詳細を見る
          </button>
        </div>
      )}

      {/*
       * Phase 3-J-6d / J-6e-3: Proposal hint chip + Quiet Undo 「戻す」 link
       *
       * 配置: 「詳細を見る」 button の **更に下**、 SelectedAnchorCard 全体の最末尾。
       *       Phase 2-G の lived_geography banner / Phase 2-I の icon と物理分離。
       *
       * 表示優先 (= mutually exclusive):
       *   1. active undo record (= 5 分以内 accept 直後) → 「戻す」 link
       *   2. それ以外 + proposal 存在 → ProposalChip (= accept in-flight 中は subtle pending)
       *
       * 条件:
       *   - anchor が one_off (= MVP 範囲、 recurring は次 phase)
       *   - 「戻す」 link / chip の選択は anchor.date 基準
       *
       * 視覚規約:
       *   - 「戻す」 link: text-xs italic text-slate-400 underline (= 警告色なし)
       *   - chip: Memory Chip style 維持
       *   - subtle pending: opacity-60 + pointer-events-none + aria-busy (= 二重 tap 防止)
       */}
      {(() => {
        if (anchor.anchorKind !== "one_off") return null;
        const anchorDate = anchor.date;

        // [1] active undo for anchor.date
        const activeUndo = recentUndoRecords
          ? selectActiveUndoForDate(
              recentUndoRecords,
              anchorDate,
              new Date().toISOString(),
            )
          : null;
        if (activeUndo) {
          return (
            <div
              className="mt-3"
              data-testid={`plan-map-undo-${activeUndo.proposalId}`}
            >
              <button
                type="button"
                className="text-xs italic text-slate-400 underline transition hover:text-slate-500 motion-reduce:transition-none"
                onClick={() => onProposalUndo?.(activeUndo.proposalId)}
                aria-label="提案を戻す"
              >
                戻す
              </button>
            </div>
          );
        }

        // [2] proposal chip (= 通常)
        const proposalForAnchor = selectFirstProposalForDate(
          proposalsByDate,
          anchorDate,
        );
        if (!proposalForAnchor) return null;
        const variables = buildVariablesForProposal(
          proposalForAnchor,
          proposalTemplateVariables,
        );
        const isAccepting =
          acceptingProposalIds?.has(proposalForAnchor.id) ?? false;
        return (
          <div
            className={
              "mt-3 " +
              (isAccepting
                ? "opacity-60 pointer-events-none motion-reduce:transition-none"
                : "")
            }
            aria-busy={isAccepting || undefined}
            data-testid={`plan-map-proposal-${anchorDate}`}
          >
            <ProposalChip
              proposal={proposalForAnchor}
              variables={variables}
              onTap={isAccepting ? undefined : onProposalAccept}
              onModify={onProposalModify}
              onDismiss={onProposalDismiss}
            />
          </div>
        );
      })()}
    </section>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CategoryGrid (v1 で設計、v3 で維持、aggregateEnd window で集計)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function CategoryGrid({
  groups,
  windowDays,
  onAddCategory,
  onAnchorClick,
}: {
  groups: CategoryGroup[];
  windowDays: number;
  onAddCategory?: (category: LocationGroupKey) => void;
  onAnchorClick?: (anchor: ExternalAnchor) => void;
}) {
  // groups は active のみ。empty も含めて 9 categories 全表示 (Phase 2-C §11.10 empty as silence)
  const groupByCategory = new Map<LocationGroupKey, CategoryGroup>();
  for (const g of groups) groupByCategory.set(g.category, g);

  return (
    <section
      role="region"
      aria-label="カテゴリ別の地理"
      className="mb-4"
    >
      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
        カテゴリ別
      </h3>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {LOCATION_GROUP_ORDER.map((cat) => {
          const g = groupByCategory.get(cat);
          const isActive = g !== undefined && g.totalCount > 0;
          return (
            <li key={cat}>
              <CategoryCard
                category={cat}
                group={g}
                isActive={isActive}
                windowDays={windowDays}
                onAdd={
                  onAddCategory && cat !== "none"
                    ? () => onAddCategory(cat)
                    : undefined
                }
                onAnchorClick={onAnchorClick}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CategoryCard
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function CategoryCard({
  category,
  group,
  isActive,
  windowDays,
  onAdd,
  onAnchorClick,
}: {
  category: LocationGroupKey;
  group: CategoryGroup | undefined;
  isActive: boolean;
  windowDays: number;
  onAdd?: () => void;
  onAnchorClick?: (anchor: ExternalAnchor) => void;
}) {
  const meta = CATEGORY_META[category];
  const count = group?.totalCount ?? 0;
  const frequencyVoice = categoryFrequencyVoice(count, windowDays);
  const timeSig = useMemo(
    () =>
      group
        ? categoryTimeSignature(group.anchors.map(({ anchor }) => anchor))
        : null,
    [group],
  );

  return (
    <article
      data-testid={`plan-map-card-${category}`}
      aria-label={`${meta.label} · ${meta.hint} · ${frequencyVoice}`}
      className={
        "rounded-2xl border border-slate-200 bg-white p-4 " +
        (isActive ? "" : "opacity-60")
      }
    >
      <header className="mb-3 flex items-start gap-3">
        {/*
         * Phase 2-I 拡張: CategoryCard header の emoji → category-specific colored SVG
         * 細線 SVG (stroke 1.5px) + category color で識別性追加
         */}
        {(() => {
          const Icon = pickCategoryIcon({ category });
          const colorClass = pickCategoryColorClass({ category });
          return <Icon className={`w-9 h-9 ${colorClass} flex-shrink-0`} />;
        })()}
        <div className="flex-1 min-w-0">
          <h4 className="text-base font-semibold text-slate-900">
            {meta.label}
          </h4>
          <p className="text-xs italic text-slate-500">{meta.hint}</p>
          <p className="text-xs text-indigo-600 mt-1">
            {frequencyVoice}
            {timeSig && ` · ${timeSig}`}
          </p>
        </div>
      </header>

      {isActive && group && (
        <ul className="space-y-2 mb-3">
          {group.anchors.map(({ anchor, count: c }) => {
            const clickable = !!onAnchorClick;
            const handleClick = (
              e:
                | React.MouseEvent<HTMLLIElement>
                | React.KeyboardEvent<HTMLLIElement>,
            ) => {
              if (!onAnchorClick) return;
              e.stopPropagation();
              onAnchorClick(anchor);
            };
            return (
              <li
                key={anchor.id}
                {...(clickable
                  ? {
                      role: "button" as const,
                      tabIndex: 0,
                      "aria-label": `${anchor.title} の詳細を見る`,
                      onClick: handleClick,
                      onKeyDown: (e: React.KeyboardEvent<HTMLLIElement>) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleClick(e);
                        }
                      },
                    }
                  : {})}
                data-testid={`plan-map-anchor-${anchor.id}`}
                className={
                  "rounded-lg border border-slate-100 bg-white/60 p-2 " +
                  (clickable
                    ? "cursor-pointer transition hover:border-indigo-300 hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                    : "")
                }
              >
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-medium text-slate-900 truncate">
                    {anchor.title}
                  </p>
                  <span className="text-xs text-slate-500">×{c}</span>
                </div>
                {anchor.locationText && (
                  <p className="text-xs text-slate-500 truncate">
                    {anchor.locationText}
                  </p>
                )}
                {anchor.sensitiveCategory && (
                  <p className="mt-1">
                    <GlassBadge variant="default" size="sm">
                      {SENSITIVE_LABEL[anchor.sensitiveCategory]}
                    </GlassBadge>
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {onAdd && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAdd();
            }}
            aria-label={`${meta.label}での予定を教える`}
            data-testid={`plan-map-add-${category}`}
            className="rounded-full border border-indigo-200 px-3 py-1 text-xs font-medium text-indigo-600 transition hover:border-indigo-500 hover:bg-indigo-50"
          >
            + {meta.label}での予定を教える
          </button>
        </div>
      )}
    </article>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UnresolvedAnchorsSection (semantic fallback list)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function UnresolvedAnchorsSection({
  anchors,
  loading,
  baselineCoords,
  onAnchorClick,
}: {
  anchors: ExternalAnchor[];
  loading: boolean;
  baselineCoords: BaselineCoords | null;
  onAnchorClick?: (anchor: ExternalAnchor) => void;
}) {
  // loading 中は section を隠す (optimistic UI: 確定後に表示)
  if (loading || anchors.length === 0) return null;

  // baseline あり → これら anchor は baseline pin として地図に出ている (transparency 表示)
  // baseline なし → これら anchor は地図に出ていない (locationText 入力 or baseline 設定が必要)
  const hasBaseline = baselineCoords !== null;
  const headerText = hasBaseline ? "📍 場所未確定の予定" : "📂 場所が曖昧 / 未指定";
  const headerSub = hasBaseline
    ? `これらは ${baselineCoords.label ?? "baseline"} 周辺の概算 pin として地図に表示されています — 具体的な場所を予定に追加すると正確な pin になります`
    : "地図に出せなかった予定 — 予定に場所 (locationText) を追加するか、/baseline で居住地を設定すると pin に出ます";

  return (
    <section
      role="region"
      aria-label={
        hasBaseline
          ? "場所未確定の予定 (baseline 周辺で表示中)"
          : "場所が曖昧 / 未指定の予定"
      }
      data-testid="plan-map-unresolved"
      className="mb-4 rounded-2xl bg-slate-50 p-4"
    >
      <header className="mb-2">
        <h3 className="text-sm font-semibold text-slate-700">{headerText}</h3>
        <p className="text-xs italic text-slate-500">{headerSub}</p>
      </header>
      <ul className="space-y-2">
        {anchors.map((anchor) => {
          const clickable = !!onAnchorClick;
          const handleClick = (
            e:
              | React.MouseEvent<HTMLLIElement>
              | React.KeyboardEvent<HTMLLIElement>,
          ) => {
            if (!onAnchorClick) return;
            e.stopPropagation();
            onAnchorClick(anchor);
          };
          const meta = CATEGORY_META[categoryOf(anchor)];
          return (
            <li
              key={anchor.id}
              {...(clickable
                ? {
                    role: "button" as const,
                    tabIndex: 0,
                    "aria-label": `${anchor.title} の詳細を見る`,
                    onClick: handleClick,
                    onKeyDown: (e: React.KeyboardEvent<HTMLLIElement>) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleClick(e);
                      }
                    },
                  }
                : {})}
              data-testid={`plan-map-unresolved-anchor-${anchor.id}`}
              className={
                "rounded-lg border border-slate-200 bg-white p-2 " +
                (clickable
                  ? "cursor-pointer transition hover:border-indigo-300 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                  : "")
              }
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-medium text-slate-900 truncate">
                  {anchor.title}
                </p>
                <span className="text-xs text-slate-400">
                  {meta.emoji} {meta.label}
                </span>
              </div>
              {anchor.locationText && (
                <p className="text-xs text-slate-500 truncate">
                  {`"${anchor.locationText}"`}
                </p>
              )}
              {anchor.sensitiveCategory && (
                <p className="mt-1">
                  <GlassBadge variant="default" size="sm">
                    {SENSITIVE_LABEL[anchor.sensitiveCategory]}
                  </GlassBadge>
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// StaticAlterSuggestionCard (Phase 2-B 整合、CEO 補正 #2、ボタン風禁止)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function StaticAlterSuggestionCard() {
  return (
    <section
      role="region"
      aria-label="ALTER 提案 (今後の機能、Phase 3 で実装予定)"
      data-testid="plan-map-static-alter-card"
      className="
        rounded-2xl
        bg-gradient-to-br from-indigo-50/60 to-purple-50/60
        p-4 mb-4
        select-none
      "
      style={{ cursor: "default" }}
    >
      <p className="text-xs text-slate-500 mb-3 italic">
        あなたの地理を、ALTER が読みに来る予定です
      </p>
      <div className="rounded-xl bg-white/70 px-4 py-3 border border-slate-100">
        <p className="text-sm text-slate-700">
          あなたの場所のパターン、見てみますか?
        </p>
        <p className="text-xs text-slate-400 mt-1">
          (Phase 3 で動作予定 — 今は説明だけ)
        </p>
      </div>
    </section>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Pure helpers (Map 描画前提条件チェック)
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
