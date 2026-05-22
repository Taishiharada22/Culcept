"use client";

/**
 * FlowTab — 今後 7 日リスト (Phase 2-B、CEO mock 整合)
 *
 * 設計書: docs/alter-plan-phase2-b-flow-list-mini-design.md
 *
 * 表示 (CEO mock 整合):
 *   - 今後 7 日の縦リスト (各日 sticky section header + anchor list)
 *   - 各 anchor 行: 時刻 + title + sub + 右端 thumbnail (locationCategory emoji)
 *   - 「予定なし ›」 inline button (CEO 補正 #1: tap → AddAnchorModal date prefill)
 *   - 静的 ALTER 提案 card placeholder (CEO 補正 #2: ボタン風 styling 禁止)
 *   - FAB (Phase 2-A CalendarTab と同 pattern、今日 prefill)
 *
 * Beyond 採用 (世界トップアプリ研究、mini design §11):
 *   - sticky section header (iOS Reminders / Apple Calendar / Things 3 / Linear pattern)
 *   - 曜日色 (日=rose / 土=blue、JP locale 標準)
 *   - "今日 ·" / "明日 ·" prefix (quick scan)
 *   - anchor count badge ("3 件" 小さく)
 *   - touch target 44pt 最小 (Apple HIG / WCAG 2.5.5)
 *   - sensitive category は 🔒 generic icon (privacy 配慮)
 *
 * 不変原則 (CEO 補正 #3 遵守):
 *   - 旧 W1-X3 gap add helpers (gapMinutes / formatGap / shouldShowGapAdd /
 *     suggestGapStartTime / FLOW_GAP_MIN_MINUTES) は **削除しない**
 *   - 本 file では import せず render しないだけ。helpers は code-level で残り、
 *     既存 test (calendarWeekStripHelpers.test.ts 等) も継続 PASS
 *
 * 範囲外 (CEO 制約):
 *   - ALTER 提案 flow 動作実装 (Phase 3 預け、本 wave は静的 placeholder のみ)
 *   - 実画像 / Supabase Storage 連携 (別 wave)
 *   - ExternalAnchor 型 imageUrl field 追加 (migration、別 wave)
 *   - long-press による quick action menu (Phase 2-B+)
 *   - MapTab / Google Maps integration (Phase 2-C)
 *   - selectedDate state を持つ設計 (本 wave は今日 prefill で完結)
 *   - AddAnchorModal / PlanClient / HomeSwipeContainer / Modal lock 不可触
 */

import { useMemo } from "react";

import { GlassBadge } from "@/components/ui/glassmorphism-design";
import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import { isPlaceUnconfirmed } from "@/lib/plan/locationConfirmationStatus";
import { detectTimedAnchorOverlaps } from "@/lib/plan/anchorOverlap";
import { formatLocationDisplayParts } from "@/lib/plan/anchor-detail-format";
import { pickCategoryIcon } from "@/lib/plan/categoryIconMap";
import { pickCategoryColorClass } from "@/lib/plan/categoryColorMap";
import { pickBrandIcon } from "@/lib/plan/brandIconMap";

import type { AddRequest } from "../PlanClient";
import {
  CATEGORY_META,
  anchorsForDay,
  buildFlowDateRange,
  categoryOf,
  formatFlowSectionLabel,
  formatJpDate,
  formatTime,
  isoDate,
  utcMidnight,
  weekdayTone,
  type FlowWeekdayTone,
} from "./_helpers";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * weekdayTone → Tailwind class mapping (locale 標準: 日=rose, 土=blue、今日=indigo)
 * Phase 2-A CalendarTab WeekdayLabels と整合 (Sun-first / 日 = rose-500 / 土 = blue-500)
 */
const TONE_CLASS: Record<FlowWeekdayTone, string> = {
  today: "text-indigo-700 font-semibold",
  sunday: "text-rose-500",
  saturday: "text-blue-500",
  weekday: "text-slate-900",
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function FlowTab({
  anchors,
  now,
  onAddRequest,
  onAnchorClick,
  // ── Phase 3-K-2: DayGraph computed projection (= optional、 K-2 では使用しない) ──
  // K-3 以降で UI 接続予定。 K-2 では受け取るが render しない。
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  dayGraphByDate: _dayGraphByDate,
}: {
  anchors: ExternalAnchor[];
  /** test 用 inject、現在時刻 (default: new Date()) */
  now?: Date;
  /** Modal 起動 callback (FAB / 予定なし ›  inline で共通) */
  onAddRequest?: (req: AddRequest) => void;
  /** anchor row click で AnchorDetailModal 起動 (W1-X5 既存) */
  onAnchorClick?: (anchor: ExternalAnchor) => void;
  /**
   * K-2 接続層: PlanClient で計算した DayGraph。
   * K-2 では tab 側は使用しない (= K-3 以降で UI 接続予定)。
   */
  dayGraphByDate?: Readonly<Record<string, import("@/lib/plan/dayGraph/dayGraphTypes").BuildDayGraphResult>>;
}) {
  const baseNow = now ?? new Date();
  const today = useMemo(
    () => utcMidnight(baseNow),
    // baseNow は new Date() の場合 mount 毎に変わるが、UTC midnight 化されると
    // 1 日内では同じ value に丸まる。useMemo の deps として渡しても render 起因の
    // 余計な再生成は起きない (今日が変わった瞬間 = page reload 想定)。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isoDate(baseNow)]
  );

  // 今日含む 7 日分
  const days = useMemo(() => buildFlowDateRange(today), [today]);

  // 各日の anchor を pre-compute (Map<iso, ExternalAnchor[]>)
  // anchorsForDay は recurring 展開 + exception_dates + validity 全継承
  const dayAnchorsMap = useMemo(() => {
    const m = new Map<string, ExternalAnchor[]>();
    for (const d of days) {
      m.set(isoDate(d), anchorsForDay(anchors, d));
    }
    return m;
  }, [anchors, days]);

  // 最初の「予定なし」日 (ALTER 提案 card の文脈表示用)
  const firstEmptyDayLabel = useMemo(() => {
    for (const d of days) {
      const list = dayAnchorsMap.get(isoDate(d)) ?? [];
      if (list.length === 0) return formatJpDate(d);
    }
    return null; // 全日に anchor あり → card 非表示
  }, [days, dayAnchorsMap]);

  /**
   * Phase 2-E: 時刻重なり気付き indicator 用、各日の overlap Set を pre-compute。
   * 判定は detectTimedAnchorOverlaps (Cross-tab 単一仕様) のみ使用、独自判定なし。
   * Map<isoDate, Set<anchorId>> で各 FlowDaySection → AnchorRow に prop drilling。
   */
  const dayOverlapsMap = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const d of days) {
      const iso = isoDate(d);
      const anchorsOfDay = dayAnchorsMap.get(iso) ?? [];
      m.set(iso, detectTimedAnchorOverlaps(anchorsOfDay));
    }
    return m;
  }, [days, dayAnchorsMap]);

  const handleEmptyDayClick = (day: Date) => {
    onAddRequest?.({
      initial: { kind: "one_off", date: isoDate(day) },
      subtitle: `リスト / ${formatJpDate(day)} から`,
    });
  };

  const handleFabClick = () => {
    onAddRequest?.({
      initial: { kind: "one_off", date: isoDate(today) },
      subtitle: `リスト / ${formatJpDate(today)} から`,
    });
  };

  return (
    <div data-testid="plan-flow-tab" className="relative pb-24">
      {/* 7-day list (各日 = FlowDaySection、sticky header 内蔵) */}
      {days.map((day) => {
        const iso = isoDate(day);
        const dayAnchors = dayAnchorsMap.get(iso) ?? [];
        const dayOverlaps = dayOverlapsMap.get(iso) ?? new Set<string>();
        return (
          <FlowDaySection
            key={iso}
            day={day}
            today={today}
            anchors={dayAnchors}
            dayOverlaps={dayOverlaps}
            onEmptyClick={
              onAddRequest ? () => handleEmptyDayClick(day) : undefined
            }
            onAnchorClick={onAnchorClick}
          />
        );
      })}

      {/* 静的 ALTER 提案 card placeholder (CEO 補正 #2、ボタン風 styling 禁止) */}
      {firstEmptyDayLabel !== null && (
        <StaticAlterSuggestionCard firstEmptyDayLabel={firstEmptyDayLabel} />
      )}

      {/* FAB (Phase 2-A 同 pattern、今日 prefill、HomePaneIndicator z-30 と重ねない bottom-20) */}
      {onAddRequest && (
        <button
          type="button"
          onClick={handleFabClick}
          aria-label={`今日 (${formatJpDate(today)}) に予定を追加`}
          data-testid="plan-flow-fab"
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
// FlowDaySection (single day = section with sticky header + anchor list / empty inline)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function FlowDaySection({
  day,
  today,
  anchors,
  dayOverlaps,
  onEmptyClick,
  onAnchorClick,
}: {
  day: Date;
  today: Date;
  anchors: ExternalAnchor[];
  /** Phase 2-E: 同日の overlap anchor id Set (= 親から detectTimedAnchorOverlaps の結果) */
  dayOverlaps: ReadonlySet<string>;
  /** 予定なし日の inline button onClick (onAddRequest あり時のみ undefined でない) */
  onEmptyClick?: () => void;
  onAnchorClick?: (anchor: ExternalAnchor) => void;
}) {
  const iso = isoDate(day);
  const label = formatFlowSectionLabel(day, today);
  const tone = weekdayTone(day, today);
  const hasAnchors = anchors.length > 0;
  const ariaLabel = hasAnchors
    ? `${label} · ${anchors.length} 件`
    : `${label} · 予定なし`;

  return (
    <section
      data-testid={`plan-flow-section-${iso}`}
      aria-label={ariaLabel}
    >
      {/* Sticky header: scroll しても日付見出しが top に残る (Beyond §11.11) */}
      <header
        className="
          sticky top-0 z-10
          bg-white/95 backdrop-blur-sm
          px-4 py-2
          flex items-baseline justify-between gap-2
          border-b border-slate-100
        "
      >
        <h3 className="text-sm">
          <span className={TONE_CLASS[tone]}>{label}</span>
          {hasAnchors && (
            <span
              className="ml-2 text-xs font-normal text-slate-400"
              data-testid={`plan-flow-count-${iso}`}
            >
              {anchors.length} 件
            </span>
          )}
        </h3>

        {/* 予定なし日: header 右に inline button (CEO 補正 #1: AddAnchorModal date prefill) */}
        {!hasAnchors && onEmptyClick !== undefined && (
          <button
            type="button"
            onClick={onEmptyClick}
            aria-label={`${formatJpDate(day)} に予定を追加`}
            data-testid={`plan-flow-empty-${iso}`}
            className="
              text-xs text-slate-400 hover:text-slate-600
              px-3 py-2 -my-2 -mr-2
              rounded-md hover:bg-slate-50
              transition-colors
              min-h-[44px]
              inline-flex items-center
            "
          >
            予定なし ›
          </button>
        )}
        {!hasAnchors && onEmptyClick === undefined && (
          <span
            className="text-xs text-slate-400"
            data-testid={`plan-flow-empty-${iso}-static`}
          >
            予定なし
          </span>
        )}
      </header>

      {/* Anchor list (予定あり日のみ) */}
      {hasAnchors && (
        <ul className="flex flex-col gap-2 px-4 py-3">
          {anchors.map((a) => (
            <AnchorRow
              key={a.id}
              anchor={a}
              hasOverlap={dayOverlaps.has(a.id)}
              onClick={onAnchorClick}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AnchorRow (time + title + sub + right thumbnail)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function AnchorRow({
  anchor,
  hasOverlap,
  onClick,
}: {
  anchor: ExternalAnchor;
  /** Phase 2-E: 同日内で時刻が他 anchor と重なるか */
  hasOverlap: boolean;
  onClick?: (anchor: ExternalAnchor) => void;
}) {
  const clickable = !!onClick;
  // Phase 2-F: Compact density (primary only)、title に fullLabel
  const { primary: locationPrimary, fullLabel: locationFullLabel } =
    formatLocationDisplayParts(anchor);
  const handleClick = (
    e:
      | React.MouseEvent<HTMLLIElement>
      | React.KeyboardEvent<HTMLLIElement>
  ) => {
    if (!onClick) return;
    e.stopPropagation();
    onClick(anchor);
  };

  return (
    <li
      {...(clickable
        ? {
            role: "button" as const,
            tabIndex: 0,
            "aria-label": `${anchor.title} の詳細を見る`,
            onClick: handleClick,
            onKeyDown: (e: React.KeyboardEvent<HTMLLIElement>) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                handleClick(e);
              }
            },
          }
        : {})}
      data-testid={`plan-flow-anchor-${anchor.id}`}
      className={
        "flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3 " +
        (clickable
          ? "cursor-pointer transition hover:border-indigo-300 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          : "")
      }
    >
      {/* Time + title + sub (flex-1、truncate で overflow 防止) */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-sm font-mono text-indigo-700">
            {formatTime(anchor.startTime)}
            {anchor.endTime ? ` – ${formatTime(anchor.endTime)}` : ""}
          </span>
          {anchor.rigidity === "hard" && (
            <GlassBadge variant="default" size="sm">
              固定
            </GlassBadge>
          )}
          {/*
           * Phase 2-E: 時刻重なり気付き indicator (時刻 row 内)
           * - 警告ではなく「気付き」(muted slate のみ、警告色禁止)
           * - sensitive anchor でも表示 (Cross-tab 一貫性、GPT 補正 1 反映)
           * - 文言は固定、他 anchor 名・件数は出さない
           */}
          {hasOverlap && (
            <span
              role="img"
              aria-label="この時刻に他の予定があります"
              title="この時刻に他の予定があります"
              data-testid={`plan-flow-anchor-${anchor.id}-overlap`}
              className="inline-flex items-center gap-1 text-[10px] text-slate-500"
            >
              <span
                aria-hidden="true"
                className="inline-block h-2 w-2 rounded-full bg-slate-400 ring-1 ring-slate-500/30"
              />
              <span>重なり</span>
            </span>
          )}
        </div>
        <p className="mt-1 text-base font-medium text-slate-900 truncate">
          {anchor.title}
        </p>
        {locationPrimary && (
          <div className="flex items-center gap-1.5 mt-0.5">
            {/*
             * Phase 2-F: Compact density (primary only)
             * title 属性に fullLabel (= mouse hover で full 情報)
             * 非 interactive な <p> なので aria-label は付けない (W3C ARIA 1.2)
             * 既存 AnchorRow 全体の aria-label "${anchor.title} の詳細を見る" は完全不変
             */}
            <p
              className="text-xs text-slate-500 truncate flex-1 min-w-0"
              title={locationFullLabel}
            >
              {locationPrimary}
            </p>
            {/*
             * Phase 2-D C3: 場所未確定 indicator (dot + text-xs label)
             * 判定は Cross-tab 単一仕様の isPlaceUnconfirmed のみ使用、
             * 引数は元 anchor.locationText で完全不変 (Phase 2-F の display 整形と判定は分離)
             * リストは情報密度許容、CalendarTab より説明文を 1 段足す
             */}
            {isPlaceUnconfirmed(anchor.locationText) && (
              <span
                data-testid={`plan-flow-anchor-${anchor.id}-unconfirmed`}
                aria-label="場所未確定"
                title="場所未確定 (まだ Places で確定されていません)"
                className="flex-shrink-0 inline-flex items-center gap-1 text-[10px] text-slate-500"
              >
                <span
                  aria-hidden="true"
                  className="inline-block h-2 w-2 rounded-full bg-slate-400 ring-1 ring-slate-500/30"
                />
                <span>場所未確定</span>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Right-end thumbnail (locationCategory emoji、sensitive は 🔒) */}
      <AnchorThumbnail anchor={anchor} />
    </li>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AnchorThumbnail (locationCategory emoji fallback、sensitive privacy 配慮)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * locationCategory ベース fallback thumbnail。
 *
 * 設計原則 (mini design §4):
 *   - 実画像なし (本 wave は migration なし、imageUrl field なし)
 *   - locationCategory → CATEGORY_META[cat].emoji を中央配置
 *   - sensitiveCategory 設定済 anchor は内容を晒さない → 🔒 generic icon
 *   - 将来 imageUrl field 追加時は、本 component で imageUrl > emoji の優先順位で
 *     1 行 switch すれば easy migration
 */
function AnchorThumbnail({ anchor }: { anchor: ExternalAnchor }) {
  // Phase 2-I 拡張: brand-specific icon を最優先 (= ぱっと見でスタバとわかる)
  // 優先順位: sensitive > brand > category fallback
  // 1. sensitive anchor → CategorySensitiveIcon (= privacy 最優先、 brand 露出させない)
  if (anchor.sensitiveCategory) {
    const Icon = pickCategoryIcon({ sensitive: true });
    return (
      <div
        role="img"
        aria-label="敏感カテゴリ"
        className="w-14 h-14 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0"
        data-testid="plan-flow-thumb-sensitive"
      >
        <Icon className="w-7 h-7 text-slate-400" />
      </div>
    );
  }

  // 2. brand-specific icon (= filled style、 brand color)
  const brandHit = pickBrandIcon(anchor.locationText);
  if (brandHit) {
    const BrandIcon = brandHit.icon;
    return (
      <div
        role="img"
        aria-label={brandHit.displayName}
        title={brandHit.displayName}
        className="w-14 h-14 rounded-xl bg-white border border-slate-200 flex items-center justify-center flex-shrink-0 overflow-hidden"
        data-testid={`plan-flow-thumb-brand-${brandHit.brand}`}
      >
        <BrandIcon className="w-12 h-12" />
      </div>
    );
  }

  // 3. category fallback (= outlined SVG、 category color)
  const cat = categoryOf(anchor);
  const meta = CATEGORY_META[cat];
  const Icon = pickCategoryIcon({ category: cat });
  const colorClass = pickCategoryColorClass({ category: cat });
  return (
    <div
      role="img"
      aria-label={`カテゴリ: ${meta.label}`}
      title={meta.hint}
      className="w-14 h-14 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0"
      data-testid={`plan-flow-thumb-${cat}`}
    >
      <Icon className={`w-7 h-7 ${colorClass}`} />
      {/* emoji legacy fallback (= hidden visually、 SVG が render される限り表示されない) */}
      <span className="sr-only" aria-hidden="true">
        {meta.emoji}
      </span>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// StaticAlterSuggestionCard (CEO 補正 #2: ボタン風 styling 禁止)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 静的 ALTER 提案 card placeholder
 *
 * CEO 補正 #2 遵守 (mini design §3.4):
 *   - tap 動作なし (cursor:default、tabIndex なし、onClick なし、role="region")
 *   - ボタン風 styling 禁止 (shadow-md 以上の elevation なし、hover effect なし)
 *   - 文言は CTA 想起を作らない:
 *     "予定のない日には、ALTER が提案を置きにくる予定です"
 *     "(Phase 3 で動作予定 — 今は説明だけ)"
 *   - role="region" で screen reader にも非対話を伝える
 *   - select-none で text 選択を防止 (誤 tap 時の visual feedback も最小化)
 *
 * Phase 3 で動作実装時に button-like styling に切り替える (本 wave では絶対不可)。
 */
function StaticAlterSuggestionCard({
  firstEmptyDayLabel,
}: {
  firstEmptyDayLabel: string;
}) {
  return (
    <section
      role="region"
      aria-label="ALTER 提案 (今後の機能、Phase 3 で実装予定)"
      data-testid="plan-flow-static-alter-card"
      className="
        mx-4 my-6
        rounded-2xl
        bg-gradient-to-br from-indigo-50/60 to-purple-50/60
        p-4
        select-none
      "
      style={{ cursor: "default" }}
    >
      <p className="text-xs text-slate-500 mb-3 italic">
        予定のない日には、ALTER が提案を置きにくる予定です
      </p>
      <div className="rounded-xl bg-white/70 px-4 py-3 border border-slate-100">
        <p className="text-sm text-slate-700">
          {firstEmptyDayLabel} は何する？
        </p>
        <p className="text-xs text-slate-400 mt-1">
          (Phase 3 で動作予定 — 今は説明だけ)
        </p>
      </div>
    </section>
  );
}
