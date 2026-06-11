"use client";

/**
 * HumanBatteryCard — メインカード「あなたのバッテリー」（v2: 参照画像構図）
 *
 * 正本: docs/alter-tab-visual-contract.md §3.2 / 設計書 §9
 * 構図: 中央に人体シルエット、周囲にコールアウト小カードが浮かび、点線コネクタで部位に接続（参照画像準拠）。
 * 規律: タイトル「あなたのバッテリー」/ サブコピーは契約候補から 1 行 / % 数値なし。
 */

import { GlassCard } from "@/components/ui/glassmorphism-design";
import type { AlterBatteryViewModel } from "@/lib/plan/dayState/dayStateTypes";
import { BatteryCallout } from "./BatteryCallout";
import { HumanBatteryFigure } from "./HumanBatteryFigure";
import type { ZoneKey } from "./bandDisplay";

export interface HumanBatteryCardProps {
  battery: AlterBatteryViewModel["battery"];
  onZoneTap?: (zone: ZoneKey) => void;
  pulseZone?: ZoneKey | null;
}

/** 点線コネクタ（カード→部位。水平の点線 + 部位側の端点ドット） */
function Connector({
  side,
  top,
  fromPx,
  toCenterOffset,
  dotClass,
}: {
  side: "left" | "right";
  top: number;
  fromPx: number;
  toCenterOffset: number; // 人体中心からの距離（px）。この位置まで線を引く
  dotClass: string;
}) {
  const style: React.CSSProperties =
    side === "left"
      ? { left: fromPx, width: `calc(50% - ${fromPx + toCenterOffset}px)`, top }
      : { right: fromPx, width: `calc(50% - ${fromPx + toCenterOffset}px)`, top };
  return (
    <div className="pointer-events-none absolute" style={style} aria-hidden="true">
      <div className="border-t-[1.5px] border-dotted border-slate-300/90" />
      <span
        className={`absolute top-[-2.5px] h-[6px] w-[6px] rounded-full ${dotClass} ${side === "left" ? "right-[-3px]" : "left-[-3px]"}`}
      />
    </div>
  );
}

export function HumanBatteryCard({ battery, onZoneTap, pulseZone = null }: HumanBatteryCardProps) {
  return (
    <GlassCard variant="gradient" padding="none" hoverEffect={false} className="p-3">
      <h2 className="text-[15px] font-bold tracking-tight text-slate-800">あなたのバッテリー</h2>
      <p className="mt-0.5 text-[9.5px] leading-tight text-slate-400">
        昨日・睡眠・予定の影響を引き継いで見ています
      </p>

      {/* 人体ステージ（人体が主役。中央大きく・左右にコールアウト・点線コネクタ） */}
      <div className="relative mx-auto mt-1.5 h-[340px] max-w-[372px]">
        <HumanBatteryFigure
          className="absolute left-1/2 top-0 h-full w-auto -translate-x-1/2"
          brainFill={battery.brain.visualFill}
          heartFill={battery.heart.visualFill}
          bodyFill={battery.body.visualFill}
          brainUnknown={battery.brain.band === "unknown"}
          heartUnknown={battery.heart.band === "unknown"}
          bodyUnknown={battery.body.band === "unknown"}
          pulseZone={pulseZone}
        />

        {/* コネクタ（脳: 左上 → 頭 / 心: 右 → 胸 / 体: 左下 → 液面） */}
        <Connector side="left" top={32} fromPx={106} toCenterOffset={22} dotClass="bg-violet-400" />
        <Connector side="right" top={106} fromPx={106} toCenterOffset={14} dotClass="bg-rose-300" />
        <Connector side="left" top={212} fromPx={106} toCenterOffset={16} dotClass="bg-sky-400" />

        <BatteryCallout
          zoneKey="brain"
          zone={battery.brain}
          onTap={onZoneTap}
          className="absolute left-0 top-0 z-10 w-[104px]"
        />
        <BatteryCallout
          zoneKey="heart"
          zone={battery.heart}
          onTap={onZoneTap}
          className="absolute right-0 top-[72px] z-10 w-[104px]"
        />
        <BatteryCallout
          zoneKey="body"
          zone={battery.body}
          onTap={onZoneTap}
          className="absolute left-0 top-[176px] z-10 w-[104px]"
        />
      </div>

      <p className="mt-1.5 text-[9px] text-slate-400">タップで補正できます</p>
    </GlassCard>
  );
}
