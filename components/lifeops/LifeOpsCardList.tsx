"use client";
/**
 * Life Ops L-8b — Life Ops カードリスト（React・**表示専用**）
 *
 * 設計: docs/life-ops-l8-ui-mini-design.md §6 / LifeOpsCard / card-presenter(urgency 順)
 * 役割: `LifeOpsCardViewModel[]`（urgency 順済み）を FadeInView で順に描画。空なら穏やかな空状態。props 注入のみ。
 */

import { FadeInView } from "@/components/ui/glassmorphism-design";
import { LifeOpsCard } from "./LifeOpsCard";
import type { LifeOpsCardViewModel } from "@/lib/lifeops/card-presenter";

export function LifeOpsCardList({ items }: { items: readonly LifeOpsCardViewModel[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-slate-500">今日はとくに整えることはなさそうです。</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      {items.map((vm, i) => (
        <FadeInView key={`${vm.category}-${i}`} delay={i * 0.05}>
          <LifeOpsCard vm={vm} />
        </FadeInView>
      ))}
    </div>
  );
}
