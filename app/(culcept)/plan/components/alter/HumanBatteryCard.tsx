"use client";

/**
 * HumanBatteryCard — メインカード「あなたのバッテリー」
 *
 * 正本: docs/alter-tab-visual-contract.md §3.2 / 設計書 §9
 *  - タイトル「あなたのバッテリー」（推奨案・「今日の開始残量」は不採用確定）
 *  - 中央: 人体シルエット（HumanBatteryFigure）/ 脇: 3 系統コールアウト
 *  - % 数値なし・帯語のみ・「見立て」バッジ・根拠チップ
 */

import { GlassCard } from "@/components/ui/glassmorphism-design";
import type { AlterBatteryViewModel } from "@/lib/plan/dayState/dayStateTypes";
import { BatteryCallout } from "./BatteryCallout";
import { HumanBatteryFigure } from "./HumanBatteryFigure";
import type { ZoneKey } from "./bandDisplay";

export interface HumanBatteryCardProps {
  battery: AlterBatteryViewModel["battery"];
  onZoneTap?: (zone: ZoneKey) => void;
  /** 補正シート選択直後の柔らかい視覚フィードバック対象 */
  pulseZone?: ZoneKey | null;
}

export function HumanBatteryCard({ battery, onZoneTap, pulseZone = null }: HumanBatteryCardProps) {
  return (
    <GlassCard variant="gradient" padding="sm" hoverEffect={false}>
      <h2 className="text-base font-bold text-slate-800">あなたのバッテリー</h2>
      <p className="mt-0.5 text-[11px] text-slate-500">
        昨日・睡眠・予定の影響を引き継いで見ています
      </p>

      <div className="mt-3 flex items-stretch gap-3">
        <HumanBatteryFigure
          className="w-[44%] shrink-0 self-center"
          brainFill={battery.brain.visualFill}
          heartFill={battery.heart.visualFill}
          bodyFill={battery.body.visualFill}
          brainUnknown={battery.brain.band === "unknown"}
          heartUnknown={battery.heart.band === "unknown"}
          bodyUnknown={battery.body.band === "unknown"}
          pulseZone={pulseZone}
        />
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
          <BatteryCallout zoneKey="brain" zone={battery.brain} onTap={onZoneTap} />
          <BatteryCallout zoneKey="heart" zone={battery.heart} onTap={onZoneTap} />
          <BatteryCallout zoneKey="body" zone={battery.body} onTap={onZoneTap} />
        </div>
      </div>

      <p className="mt-2 text-[10px] text-slate-400">
        これは診断ではなく、今日を組むための見立てです。タップで補正できます。
      </p>
    </GlassCard>
  );
}
