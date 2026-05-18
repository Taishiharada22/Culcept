"use client";

/**
 * MapTab — 地理レンズ（自分の聖地マップ）(W1-5)
 *
 * 設計書: docs/alter-plan-w15-ui-mini-design.md §2, §4
 *
 * 表示:
 *   - 地図 API を使わない（CEO 制約 + 独自体験）
 *   - location_category 別に anchor を group-by
 *   - 各 group に「次の N 日間の訪問予定回数」を出す
 *
 * 範囲外:
 *   - Google Maps / Mapbox 追加
 *   - 動的地図 / pin
 *   - 編集 UI
 */

import { useMemo } from "react";

import { GlassBadge, GlassCard } from "@/components/ui/glassmorphism-design";
import type { ExternalAnchor } from "@/lib/plan/external-anchor";

import {
  CATEGORY_META,
  SENSITIVE_LABEL,
  addDays,
  groupAnchorsByLocation,
  utcMidnight,
} from "./_helpers";

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
        <h2 className="text-sm font-semibold text-slate-900">あなたの聖地マップ</h2>
        <p className="text-xs text-slate-500">今後 {windowDays} 日間で訪れる場所</p>
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
                          <span className="text-xs text-slate-500">×{count}</span>
                        </div>
                        {anchor.locationText && (
                          <p className="text-xs text-slate-500">{anchor.locationText}</p>
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
