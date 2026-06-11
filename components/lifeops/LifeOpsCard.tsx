"use client";
/**
 * Life Ops L-8b — Life Ops カード（React・glassmorphism・**表示専用**）
 *
 * 設計: docs/life-ops-l8-ui-mini-design.md §6 / card-presenter(L-8a ViewModel) / components/ui/glassmorphism-design
 *
 * 役割: L-8a `LifeOpsCardViewModel`（非断定 VM）を glassmorphism で描画する presentational component。
 *   **props 注入のみ**（データ取得・実データ源・横エンジン・通知・予約実行なし）。実行は L-6（onAction は任意の差し込み口）。
 *
 * 厳守: 表示専用・no-fetch・no-DB・横エンジン非 import・日本語ラベル・断定しないトーン（VM 側で担保）。
 */

import { GlassCard, GlassBadge, GlassButton } from "@/components/ui/glassmorphism-design";
import type { LifeOpsCardViewModel } from "@/lib/lifeops/card-presenter";

type BadgeVariant = "default" | "secondary" | "success" | "warning" | "danger" | "info";

const URGENCY_BADGE: Record<LifeOpsCardViewModel["urgency"], { label: string; variant: BadgeVariant } | null> = {
  overdue: { label: "期日を過ぎています", variant: "warning" },
  high: { label: "お早めに", variant: "info" },
  normal: null,
};

export function LifeOpsCard({ vm, onAction }: { vm: LifeOpsCardViewModel; onAction?: () => void }) {
  const badge = URGENCY_BADGE[vm.urgency];
  return (
    <GlassCard variant={vm.urgency === "overdue" ? "elevated" : "default"} padding="md" hoverEffect={false}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold text-slate-900">{vm.title}</h3>
        {badge && (
          <GlassBadge variant={badge.variant} size="sm">
            {badge.label}
          </GlassBadge>
        )}
      </div>

      <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{vm.reasonText}</p>
      {vm.timingHint && <p className="mt-0.5 text-xs text-slate-500">{vm.timingHint}</p>}

      {vm.riskNotes.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {vm.riskNotes.map((note) => (
            <GlassBadge key={note} variant="secondary" size="sm">
              {note}
            </GlassBadge>
          ))}
        </div>
      )}

      {vm.confirmationNote && <p className="mt-2 text-xs text-amber-700">{vm.confirmationNote}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        {vm.bookingLinks.length > 0 ? (
          // L-6 deep-link を実外部リンクで描画（新規タブ・noopener）。外部ページを開くだけ＝action 記録/DB/A-4 rail に触れない。
          vm.bookingLinks.map((link) => (
            <a
              key={link.platform}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-sm font-medium text-slate-700 backdrop-blur-lg transition hover:border-slate-300 hover:bg-white"
            >
              {link.label}
            </a>
          ))
        ) : (
          // deep-link なし（通知/候補/医療 cap/placeQuery なし）→ 純表示ラベル（外部遷移しない）
          <GlassButton variant="secondary" size="sm" onClick={onAction}>
            {vm.actionLabel}
          </GlassButton>
        )}
      </div>
    </GlassCard>
  );
}
