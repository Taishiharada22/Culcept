"use client";

/**
 * MapTab — 地理レンズ（自分の聖地マップ）(W1-5 + W1-X3)
 *
 * 設計書:
 *   - docs/alter-plan-w15-ui-mini-design.md §2, §4
 *   - docs/alter-plan-w1x3-cell-add-mini-design.md §2 (category add 導線)
 *
 * 表示:
 *   - 地図 API を使わない（CEO 制約 + 独自体験）
 *   - location_category 別に anchor を group-by
 *   - 各 group に「次の N 日間の訪問予定回数」を出す
 *   - W1-X3: 各 group カードに「+ <カテゴリ>での予定を教える」link
 *     (locationCategory のみ pre-fill、locationText は自動入力しない — CEO 補正 3)
 *
 * 範囲外:
 *   - Google Maps / Mapbox 追加
 *   - 動的地図 / pin
 *   - 編集 UI
 */

import { useMemo } from "react";

import { GlassBadge, GlassCard } from "@/components/ui/glassmorphism-design";
import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import type { AnchorFormState } from "@/lib/plan/anchor-input-form";

import type { AddRequest } from "../PlanClient";
import {
  CATEGORY_META,
  type LocationGroupKey,
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

  const groups = useMemo(
    () => groupAnchorsByLocation(anchors, today, end),
    [anchors, today, end]
  );

  const handleCategoryAdd = (category: LocationGroupKey) => {
    if (!onAddRequest) return;
    // CEO 補正 3: locationCategory のみ pre-fill、locationText 自動入力しない
    // "none" カテゴリの場合は locationCategory を空にして起動
    const initial: Partial<AnchorFormState> = {};
    if (category !== "none") {
      initial.locationCategory = category;
    }
    const meta = CATEGORY_META[category];
    onAddRequest({
      initial,
      subtitle: `${meta.emoji} ${meta.label}での予定を教える`,
    });
  };

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
            const isAddable = g.category !== "none"; // none は locationCategory を pre-fill しない
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
                    {g.anchors.map(({ anchor, count }) => {
                      const clickable = !!onAnchorClick;
                      const handleClick = (
                        e:
                          | React.MouseEvent<HTMLLIElement>
                          | React.KeyboardEvent<HTMLLIElement>
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
                              onKeyDown: (
                                e: React.KeyboardEvent<HTMLLIElement>
                              ) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  handleClick(e);
                                }
                              },
                            }
                          : {})}
                        data-testid={`plan-map-anchor-${anchor.id}`}
                        className={
                          "rounded-lg border border-slate-200 bg-white/60 p-2 " +
                          (clickable
                            ? "cursor-pointer transition hover:border-indigo-300 hover:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                            : "")
                        }
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
                      );
                    })}
                  </ul>
                  {isAddable && onAddRequest && (
                    <div className="mt-3 flex justify-end">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCategoryAdd(g.category);
                        }}
                        aria-label={`${meta.label}での予定を教える`}
                        data-testid={`plan-map-add-${g.category}`}
                        className="rounded-full border border-indigo-200 px-3 py-1 text-xs font-medium text-indigo-600 transition hover:border-indigo-500 hover:bg-indigo-50"
                      >
                        + {meta.label}での予定を教える
                      </button>
                    </div>
                  )}
                </GlassCard>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
