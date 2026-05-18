"use client";

/**
 * MapTab — 地理レンズ（自分の聖地マップ）(W1-5)
 *
 * 設計書: docs/alter-plan-w15-ui-mini-design.md §2, §4
 *
 * 表示:
 *   - 地図 API を使わない（CEO 制約 + 独自体験）
 *   - location_category 別に anchor を group-by
 *   - 各 group に「次の 14 日間の訪問予定回数」を出す
 *   - location_text も場所キーとして補助グループ化
 *
 * 範囲外:
 *   - Google Maps / Mapbox 追加
 *   - 動的地図 / pin
 *   - 編集 UI
 */

import { useMemo } from "react";

import { GlassCard, GlassBadge } from "@/components/ui/glassmorphism-design";
import type {
  ExternalAnchor,
  AnchorSensitiveCategory,
} from "@/lib/plan/external-anchor";
import { expandOneOff, expandRecurrence } from "@/lib/plan/recurrence-expander";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// LocationCategory は lib/plan/location-category.ts と一致
type LocationCategory =
  | "home"
  | "office"
  | "school"
  | "cafe"
  | "outdoor"
  | "public"
  | "transit"
  | "unknown";

const CATEGORY_META: Record<
  LocationCategory | "none",
  { label: string; emoji: string; hint: string }
> = {
  home: { label: "家", emoji: "🏠", hint: "自分の聖域" },
  office: { label: "職場", emoji: "🏢", hint: "労働の場" },
  school: { label: "学校", emoji: "🎓", hint: "学びの場" },
  cafe: { label: "カフェ", emoji: "☕", hint: "ひと息の場" },
  outdoor: { label: "屋外", emoji: "🌿", hint: "外の空気" },
  public: { label: "公共", emoji: "🏛️", hint: "市民の場" },
  transit: { label: "移動", emoji: "🚃", hint: "通り道" },
  unknown: { label: "未分類", emoji: "📍", hint: "場所カテゴリ未設定" },
  none: { label: "場所なし", emoji: "·", hint: "場所が指定されていない予定" },
};

// 表示順（家 → 職場/学校 → 公共/カフェ → 屋外/移動 → 未分類 → 場所なし）
const CATEGORY_ORDER: Array<LocationCategory | "none"> = [
  "home",
  "office",
  "school",
  "cafe",
  "public",
  "outdoor",
  "transit",
  "unknown",
  "none",
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function utcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCDate(d.getUTCDate() + n);
  return r;
}

/** anchor が指定範囲で何日該当するかをカウント */
function countOccurrences(
  anchor: ExternalAnchor,
  start: Date,
  end: Date
): number {
  const range = { start, end };
  if (anchor.anchorKind === "one_off") {
    return expandOneOff({ date: anchor.date }, range).length;
  }
  return expandRecurrence(
    {
      validFrom: anchor.validFrom,
      ...(anchor.validUntil !== undefined ? { validUntil: anchor.validUntil } : {}),
      recurrenceRule: anchor.recurrenceRule,
      ...(anchor.exceptionDates !== undefined
        ? { exceptionDates: anchor.exceptionDates }
        : {}),
    },
    range
  ).length;
}

interface CategoryGroup {
  category: LocationCategory | "none";
  totalCount: number; // 範囲内の総訪問回数
  anchors: Array<{
    anchor: ExternalAnchor;
    count: number;
  }>;
}

function categoryOf(a: ExternalAnchor): LocationCategory | "none" {
  return (a.locationCategory ?? null) === null
    ? a.locationText
      ? "unknown"
      : "none"
    : (a.locationCategory as LocationCategory);
}

function groupAnchorsByLocation(
  anchors: ExternalAnchor[],
  start: Date,
  end: Date
): CategoryGroup[] {
  const map = new Map<LocationCategory | "none", CategoryGroup>();
  for (const a of anchors) {
    const cat = categoryOf(a);
    const c = countOccurrences(a, start, end);
    if (c === 0) continue;
    if (!map.has(cat)) {
      map.set(cat, { category: cat, totalCount: 0, anchors: [] });
    }
    const g = map.get(cat)!;
    g.totalCount += c;
    g.anchors.push({ anchor: a, count: c });
  }
  // anchors を count 降順、同 count なら title でソート
  for (const g of map.values()) {
    g.anchors.sort((x, y) =>
      x.count !== y.count ? y.count - x.count : x.anchor.title.localeCompare(y.anchor.title)
    );
  }
  // CATEGORY_ORDER に従って並べる
  return CATEGORY_ORDER.map((cat) => map.get(cat)).filter(
    (g): g is CategoryGroup => g !== undefined && g.totalCount > 0
  );
}

const SENSITIVE_LABEL: Record<AnchorSensitiveCategory, string> = {
  medical: "医療",
  legal: "法務",
  exam: "試験",
  other: "敏感",
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const DEFAULT_WINDOW_DAYS = 14;

export function MapTab({
  anchors,
  now,
  windowDays = DEFAULT_WINDOW_DAYS,
}: {
  anchors: ExternalAnchor[];
  now?: Date;
  windowDays?: number;
}) {
  const today = utcMidnight(now ?? new Date());
  const end = addDays(today, windowDays - 1);

  const groups = useMemo(
    () => groupAnchorsByLocation(anchors, today, end),
    [anchors, today, end]
  );

  return (
    <div data-testid="plan-map-tab" className="space-y-4">
      <header>
        <h2 className="text-sm font-semibold text-slate-900">
          あなたの聖地マップ
        </h2>
        <p className="text-xs text-slate-500">
          今後 {windowDays} 日間で訪れる場所
        </p>
      </header>

      {groups.length === 0 ? (
        <GlassCard className="p-6 text-center">
          <p className="text-sm text-slate-500">
            今後 {windowDays} 日間に予定された場所がありません。
          </p>
        </GlassCard>
      ) : (
        <ul className="space-y-3">
          {groups.map((g) => {
            const meta = CATEGORY_META[g.category];
            return (
              <li key={g.category} data-testid={`plan-map-group-${g.category}`}>
                <GlassCard className="p-4">
                  <header className="mb-3 flex items-baseline justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold text-slate-900">
                        <span className="mr-2">{meta.emoji}</span>
                        {meta.label}
                      </p>
                      <p className="text-xs text-slate-400">{meta.hint}</p>
                    </div>
                    <GlassBadge variant="default" size="sm">
                      {windowDays} 日で {g.totalCount} 回
                    </GlassBadge>
                  </header>
                  <ul className="space-y-2">
                    {g.anchors.map(({ anchor, count }) => (
                      <li
                        key={anchor.id}
                        className="rounded-lg border border-slate-200 bg-white/60 p-2"
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="text-sm font-medium text-slate-900">
                            {anchor.title}
                          </p>
                          <span className="text-xs text-slate-500">
                            ×{count}
                          </span>
                        </div>
                        {anchor.locationText && (
                          <p className="text-xs text-slate-500">
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
                    ))}
                  </ul>
                </GlassCard>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
