"use client";

/**
 * AnchorDetailModal — anchor 単位の詳細表示 + 操作 modal (W1-X5)
 *
 * 設計書: docs/alter-plan-w1x5-anchor-detail-mini-design.md §3
 *
 * 機能:
 *   - 表示: title / kind / 日付 or 曜日 / 例外日 / 開始-終了 / 動かせなさ /
 *           場所 / sensitive / validity / 登録元 (source)
 *   - 「教え直す」 → onEditRequest callback (EditAnchorModal 起動)
 *   - 「この登録元ごと忘れさせる」 → 2 段 confirm（件数 + 代表タイトル +
 *      「同じ登録元の予定も消える」旨）→ deleteAnchorSource → onDeleteSuccess
 *
 * 不変原則:
 *   1. anchor 単独 DELETE API は呼ばない（source 単位削除のみ）
 *   2. 削除影響の透明化（buildDeleteImpactSummary で件数・代表タイトル）
 *   3. close 時に confirm state を必ず reset
 */

import { useEffect, useMemo, useState } from "react";

import { registerHomeSwipeModalOpen } from "@/lib/home-swipe-modal-lock";
import {
  GlassBadge,
  GlassButton,
  GlassCard,
  GlassModal,
} from "@/components/ui/glassmorphism-design";
import {
  buildDeleteImpactSummary,
  formatExceptionDates,
  formatJpDateLong,
  formatLocationDisplayParts,
  formatRRuleJp,
  formatTimeRange,
  formatValidityRange,
  RIGIDITY_LABEL,
  SENSITIVE_LABEL,
  SOURCE_TYPE_LABEL,
} from "@/lib/plan/anchor-detail-format";
import { pickCategoryIcon } from "@/lib/plan/categoryIconMap";
import { pickCategoryColorClass } from "@/lib/plan/categoryColorMap";
import { pickBrandIcon } from "@/lib/plan/brandIconMap";
import { deleteAnchorSource } from "@/lib/plan/anchor-fetch";
import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import type { ExternalAnchorSource } from "@/lib/plan/external-anchor-source";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type DeleteState =
  | { kind: "idle" }
  | { kind: "confirming" }
  | { kind: "deleting" }
  | { kind: "error"; message: string };

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function AnchorDetailModal({
  isOpen,
  onClose,
  anchor,
  allAnchors,
  source,
  onEditRequest,
  onDeleteSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  /** 表示対象の anchor (null なら non-render) */
  anchor: ExternalAnchor | null;
  /** 削除影響計算用：全 anchor list（PlanClient から） */
  allAnchors: ReadonlyArray<ExternalAnchor>;
  /** 登録元 source 情報（あれば表示） */
  source: ExternalAnchorSource | null;
  /** 「教え直す」tap で呼ばれる */
  onEditRequest: (anchor: ExternalAnchor) => void;
  /** 削除成功時に呼ばれる（PlanClient で refetch + close） */
  onDeleteSuccess: () => void;
}) {
  const [deleteState, setDeleteState] = useState<DeleteState>({ kind: "idle" });

  // Modal close 時に confirm state 必ず reset
  useEffect(() => {
    if (!isOpen) setDeleteState({ kind: "idle" });
  }, [isOpen]);

  // Phase 1 C3 (2026-05-20): Home swipe lock register (CEO 補正 #3)
  useEffect(() => {
    if (!isOpen) return;
    return registerHomeSwipeModalOpen();
  }, [isOpen]);

  const impact = useMemo(
    () =>
      anchor
        ? buildDeleteImpactSummary(allAnchors, anchor.sourceId)
        : { totalCount: 0, representativeTitles: [], remaining: 0 },
    [anchor, allAnchors]
  );

  function closeAndReset() {
    setDeleteState({ kind: "idle" });
    onClose();
  }

  async function performDelete() {
    if (!anchor) return;
    setDeleteState({ kind: "deleting" });
    const r = await deleteAnchorSource(anchor.sourceId);
    if (!r.ok) {
      setDeleteState({ kind: "error", message: r.error });
      return;
    }
    setDeleteState({ kind: "idle" });
    onDeleteSuccess();
  }

  if (!anchor) return null;

  const title = `${anchor.title} の詳細`;
  const deleting = deleteState.kind === "deleting";
  const confirming = deleteState.kind === "confirming";
  const errorMsg = deleteState.kind === "error" ? deleteState.message : null;

  return (
    <GlassModal isOpen={isOpen} onClose={closeAndReset} title={title} size="md">
      <div className="space-y-3" data-testid="plan-anchor-detail-body">
        {/* Kind */}
        <DetailRow label="種類">
          <GlassBadge variant="default" size="sm">
            {anchor.anchorKind === "one_off" ? "1 回だけ" : "毎週繰り返し"}
          </GlassBadge>
        </DetailRow>

        {/* 日付 or 曜日 */}
        {anchor.anchorKind === "one_off" ? (
          <DetailRow label="日付">{formatJpDateLong(anchor.date)}</DetailRow>
        ) : (
          <>
            <DetailRow label="繰り返し">
              {formatRRuleJp(anchor.recurrenceRule)}
            </DetailRow>
            <DetailRow label="期間">
              {formatValidityRange(anchor.validFrom, anchor.validUntil)}
            </DetailRow>
            <DetailRow label="例外日">
              {formatExceptionDates(anchor.exceptionDates)}
            </DetailRow>
          </>
        )}

        {/* 時刻 */}
        <DetailRow label="時刻">
          {formatTimeRange(anchor.startTime, anchor.endTime)}
        </DetailRow>

        {/* 動かせなさ */}
        <DetailRow label="動かせなさ">
          <GlassBadge variant="default" size="sm">
            {RIGIDITY_LABEL[anchor.rigidity]}
          </GlassBadge>
        </DetailRow>

        {/*
         * Phase 2-F: Detail density (= displayCategoryLabel + primary + secondary 3 段)
         * - displayCategoryLabel: 補正 6 で重複抑制済 (categoryLabel === primary なら undefined)
         * - primary: 主名 (canonical の displayName / 補正 2 fallback で保存情報消えない)
         * - secondary: 補助 (canonical の address のみ)
         * - 全空 → 「場所未指定」 既存文言維持
         * - DetailRow 構造不変、children 内で段組
         * - sensitive masking は既存仕様 (AnchorDetailModal は user 自身のみ開ける modal、内部 UI で開示は設計通り)
         */}
        <DetailRow label="場所">
          {(() => {
            const parts = formatLocationDisplayParts(anchor);
            if (!parts.displayCategoryLabel && !parts.primary) {
              return <span className="text-slate-400">場所未指定</span>;
            }
            // Phase 2-I 拡張: brand 優先 (= 「スタバなら スタバ icon」)
            // 優先順位: sensitive > brand > category
            const isSensitive = !!anchor.sensitiveCategory;
            const brandHit = !isSensitive
              ? pickBrandIcon(anchor.locationText)
              : null;
            const CategoryIcon = pickCategoryIcon({
              category: anchor.locationCategory,
              sensitive: isSensitive,
            });
            const colorClass = pickCategoryColorClass({
              category: anchor.locationCategory,
              sensitive: isSensitive,
            });
            return (
              <div className="flex flex-col gap-0.5">
                {parts.displayCategoryLabel && (
                  <span className="text-xs text-slate-500 inline-flex items-center gap-1">
                    {brandHit ? (
                      <brandHit.icon className="w-3.5 h-3.5" />
                    ) : (
                      <CategoryIcon className={`w-3.5 h-3.5 ${colorClass}`} />
                    )}
                    {parts.displayCategoryLabel}
                  </span>
                )}
                {parts.primary && (
                  <span className="text-sm font-medium text-slate-900">
                    {parts.primary}
                  </span>
                )}
                {parts.secondary && (
                  <span className="text-xs text-slate-500">
                    {parts.secondary}
                  </span>
                )}
              </div>
            );
          })()}
        </DetailRow>

        {/* sensitive */}
        {anchor.sensitiveCategory && (
          <DetailRow label="敏感カテゴリ">
            <GlassBadge variant="default" size="sm">
              {SENSITIVE_LABEL[anchor.sensitiveCategory]}
            </GlassBadge>
          </DetailRow>
        )}

        {/* 登録元 (source) */}
        {source && (
          <DetailRow label="登録元">
            {SOURCE_TYPE_LABEL[source.sourceType]} ·{" "}
            {source.capturedAt.slice(0, 10)} に登録
            {source.notes ? ` · ${source.notes}` : ""}
          </DetailRow>
        )}

        {/* Confirm dialog */}
        {confirming && (
          <GlassCard className="border-rose-200 bg-rose-50 p-3">
            <p className="text-sm font-medium text-rose-900">
              この予定を Alter から忘れさせますか？
            </p>
            <p className="mt-2 text-sm text-rose-800">
              ただし、これは <strong>登録元ごと</strong> 忘れさせるため、
              同じ登録元から登録された{" "}
              <strong>合計 {impact.totalCount} 件</strong> の予定が
              同時に消えます。
            </p>
            {impact.representativeTitles.length > 0 && (
              <div className="mt-2 text-xs text-rose-700">
                <p className="font-medium">消える予定:</p>
                <ul className="ml-4 list-disc">
                  {impact.representativeTitles.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                  {impact.remaining > 0 && (
                    <li>他 {impact.remaining} 件</li>
                  )}
                </ul>
              </div>
            )}
            <div className="mt-3 flex justify-end gap-2">
              <GlassButton
                size="sm"
                variant="secondary"
                onClick={() => setDeleteState({ kind: "idle" })}
                disabled={deleting}
              >
                やめる
              </GlassButton>
              <GlassButton
                size="sm"
                variant="primary"
                onClick={() => void performDelete()}
                disabled={deleting}
                data-testid="plan-anchor-detail-delete-confirm"
              >
                {deleting ? "忘れさせています…" : "はい、登録元ごと忘れさせる"}
              </GlassButton>
            </div>
          </GlassCard>
        )}

        {errorMsg && (
          <p className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">
            {errorMsg}
          </p>
        )}

        {/* Actions */}
        {!confirming && !deleting && (
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <GlassButton
              size="sm"
              variant="secondary"
              onClick={() => setDeleteState({ kind: "confirming" })}
              data-testid="plan-anchor-detail-delete-trigger"
            >
              この登録元ごと忘れさせる
            </GlassButton>
            <GlassButton
              size="sm"
              variant="primary"
              onClick={() => onEditRequest(anchor)}
              data-testid="plan-anchor-detail-edit"
            >
              教え直す
            </GlassButton>
          </div>
        )}
      </div>
    </GlassModal>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="w-24 shrink-0 text-xs font-medium text-slate-500">
        {label}
      </span>
      <span className="text-sm text-slate-900">{children}</span>
    </div>
  );
}
