"use client";

/**
 * AlterCtaRow — CTA 2 つまで
 *
 * 正本: docs/alter-tab-visual-contract.md §3.7
 *  - 第 1: 「今日を組む」（既存 compose を開く — Stage 1 配線。mock コールバック）
 *  - 第 2: 「調整案を見る」（A3 soft connection 接続までモック導線）
 *  - フルラウンド・淡いグラデーション（GlassButton variant="gradient" 系）
 */

import { GlassButton } from "@/components/ui/glassmorphism-design";

export interface AlterCtaRowProps {
  onCompose?: () => void;
  onViewAdjustments?: () => void;
}

export function AlterCtaRow({ onCompose, onViewAdjustments }: AlterCtaRowProps) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      <GlassButton variant="gradient" size="sm" fullWidth className="rounded-full" onClick={onCompose}>
        今日を組む
      </GlassButton>
      <GlassButton
        variant="default"
        size="sm"
        fullWidth
        className="rounded-full border-indigo-100 bg-gradient-to-r from-indigo-50/90 to-purple-50/90 text-indigo-600"
        onClick={onViewAdjustments}
      >
        調整案を見る
      </GlassButton>
    </div>
  );
}
