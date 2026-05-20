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

import { useEffect, useMemo, useRef, useState } from "react";

import { GlassBadge } from "@/components/ui/glassmorphism-design";
import type { ExternalAnchor } from "@/lib/plan/external-anchor";

import type { AddRequest } from "../PlanClient";
import {
  CATEGORY_META,
  LOCATION_GROUP_ORDER,
  MAP_CATEGORY_MARKER,
  MAP_SENSITIVE_MARKER,
  SENSITIVE_LABEL,
  addDays,
  categoryFrequencyVoice,
  categoryOf,
  categoryTimeSignature,
  countOccurrences,
  groupAnchorsByLocation,
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
} from "@/lib/shared/googleMapsLoader";
import { usePlanBaseline, type BaselineCoords } from "./_usePlanBaseline";
import { usePlanGeocode, type AnchorResolution } from "./_usePlanGeocode";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const DEFAULT_WINDOW_DAYS = 14;
const MAP_HEIGHT_PX = 280;
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
  kind: "resolved" | "baseline";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function MapTab({
  anchors,
  now,
  windowDays = DEFAULT_WINDOW_DAYS,
  onAddRequest,
  onAnchorClick,
}: {
  anchors: ExternalAnchor[];
  now?: Date;
  windowDays?: number;
  onAddRequest?: (req: AddRequest) => void;
  /** W1-X5: anchor 行クリック / Enter / Space で detail modal を開く */
  onAnchorClick?: (anchor: ExternalAnchor) => void;
}) {
  const today = utcMidnight(now ?? new Date());
  const end = addDays(today, windowDays - 1);

  // ── Lazy resolve: window 内 occurrence のある anchor のみ geocode 対象 (§5.9.1) ──
  const visibleAnchors = useMemo(
    () => anchors.filter((a) => countOccurrences(a, today, end) > 0),
    [anchors, today, end],
  );

  const { resolutions, loading: geocodeLoading, apiAvailable } =
    usePlanGeocode(visibleAnchors);
  const { baselineCoords, loading: baselineLoading } = usePlanBaseline();
  const loading = geocodeLoading || baselineLoading;

  // ── Category groups (v1 設計の core、CategoryGrid + UnresolvedAnchorsSection に流用) ──
  const groups = useMemo(
    () => groupAnchorsByLocation(anchors, today, end),
    [anchors, today, end],
  );

  // ── 全 anchor を pin 化 (CEO 補正: 予定 → pin guarantee) ──
  //
  // 戦略:
  //   1. resolution あり (locationText 解決済) → resolved pin (具体 coord、category color filled)
  //   2. resolution なし + baselineCoords あり → baseline pin (baseline coord、outline-only、approximate)
  //   3. resolution なし + baselineCoords なし → no pin、semantic fallback list のみ
  //
  // sensitive anchor は server 側で resolution=null (unresolved_sensitive) のため自動的に
  // baselineCoords に流れる (privacy: 具体 location は外送信されない、baseline は user 既知 area)。
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
  }, [visibleAnchors, resolutions, baselineCoords]);

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
      <header className="mb-3">
        <h2 className="text-sm font-semibold text-slate-900">あなたの地理</h2>
        <p className="text-xs text-slate-500">今後 {windowDays} 日間で訪れる場所</p>
      </header>

      <PlanMapView
        pins={allPins}
        baselineCoords={baselineCoords}
        loading={loading}
        apiAvailable={apiAvailable}
        anchorsWithoutPinCount={anchorsWithoutPin.length}
        onPinClick={onAnchorClick}
      />

      <CategoryGrid
        groups={groups}
        windowDays={windowDays}
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
  onPinClick,
}: {
  pins: AnchorWithCoord[];
  baselineCoords: BaselineCoords | null;
  loading: boolean;
  apiAvailable: boolean;
  /** Map に pin 化されていない anchor の件数 (baseline なし → pin 不能) */
  anchorsWithoutPinCount: number;
  onPinClick?: (anchor: ExternalAnchor) => void;
}) {
  const { ready, keyAvailable } = useGoogleMapsScript();
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<GmapsMap | null>(null);
  const onPinClickRef = useRef(onPinClick);
  onPinClickRef.current = onPinClick;

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

    const map: GmapsMap = new maps.Map(el, {
      gestureHandling: "cooperative",
      disableDefaultUI: true,
      clickableIcons: false,
      center: TEMPORARY_FALLBACK_MAP_CENTER,
      zoom: TEMPORARY_FALLBACK_MAP_ZOOM,
    });
    mapInstanceRef.current = map;

    return () => {
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

    // markers
    const markers: GmapsMarker[] = [];
    for (const pin of pins) {
      const markerSpec = pin.anchor.sensitiveCategory
        ? MAP_SENSITIVE_MARKER
        : MAP_CATEGORY_MARKER[categoryOf(pin.anchor)];

      // resolved = filled circle (具体 location)、baseline = hollow circle (approximate)
      const iconStyle =
        pin.kind === "resolved"
          ? {
              path: maps.SymbolPath.CIRCLE,
              scale: 12,
              fillColor: markerSpec.color,
              fillOpacity: 1,
              strokeColor: "#ffffff",
              strokeWeight: 2,
            }
          : {
              // baseline: outline-only (hollow)、scale 小さめ、approximate を visual に表現
              path: maps.SymbolPath.CIRCLE,
              scale: 10,
              fillColor: "#ffffff",
              fillOpacity: 0.95,
              strokeColor: markerSpec.color,
              strokeWeight: 2.5,
            };

      const baseTitle = pin.anchor.sensitiveCategory
        ? `[${SENSITIVE_LABEL[pin.anchor.sensitiveCategory]}] (詳細は modal で)`
        : pin.anchor.title;
      const markerTitle =
        pin.kind === "baseline"
          ? `${baseTitle} (場所未定 — baseline 周辺の概算)`
          : baseTitle;

      const marker = new maps.Marker({
        map,
        position: pin.coord,
        title: markerTitle,
        icon: iconStyle,
      });
      marker.addListener("click", () => {
        onPinClickRef.current?.(pin.anchor);
      });
      markers.push(marker);
    }

    return () => {
      // pin / baseline 変化で markers 破棄、Map instance は keep alive
      for (const m of markers) m.setMap(null);
    };
  }, [pins, baselineCoords]);

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
        aria-label="地図 (今後の予定の場所)"
        className="w-full rounded-2xl overflow-hidden border border-slate-200"
        style={{ height: `${MAP_HEIGHT_PX}px` }}
      />
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
// CategoryGrid (v1 で設計、v3 で維持)
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
        <span className="text-4xl leading-none" aria-hidden="true">
          {meta.emoji}
        </span>
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
                    ? "cursor-pointer transition hover:border-indigo-300 hover:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
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
                  ? "cursor-pointer transition hover:border-indigo-300 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
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
