"use client";

/**
 * HumanBatteryCard — メインカード「あなたのバッテリー」（v4: over.png static clone）
 *
 * 正本: docs/alter-tab-visual-contract.md §3.2-3.3 / CEO 指示 B2-static-clone
 * over.png 構図: 人体中央 + 浮遊カード 5 枚（左 3: 集中/からだ/外出耐性、右 2: 心/夜の余白）+ 点線コネクタ。
 * 3 系統のみコネクタあり。外出耐性・夜の余白は周辺カード（人体水位ではない — コネクタなし）。
 * タイトルは契約置換: 「今日の開始残量」→「あなたのバッテリー」。% は出さない。
 */

import { GlassCard } from "@/components/ui/glassmorphism-design";
import type { AlterBatteryViewModel } from "@/lib/plan/dayState/dayStateTypes";
import { BatteryCallout, FloatingContextCard } from "./BatteryCallout";
import { HumanBatteryFigure } from "./HumanBatteryFigure";
import type { ZoneKey } from "./bandDisplay";

export interface HumanBatteryCardProps {
  battery: AlterBatteryViewModel["battery"];
  outingTolerance: AlterBatteryViewModel["contextCards"]["outingTolerance"];
  eveningSlack: AlterBatteryViewModel["contextCards"]["eveningSlack"];
  onZoneTap?: (zone: ZoneKey) => void;
  onOutingTap?: () => void;
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
  toCenterOffset: number;
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

export function HumanBatteryCard({
  battery,
  outingTolerance,
  eveningSlack,
  onZoneTap,
  onOutingTap,
  pulseZone = null,
}: HumanBatteryCardProps) {
  return (
    <GlassCard variant="gradient" padding="none" hoverEffect={false} className="p-2">
      <h2 className="text-[12.5px] font-bold tracking-tight text-slate-800">あなたのバッテリー</h2>
      <p className="mt-px text-[8.5px] leading-tight text-slate-400">
        昨日・睡眠・予定の影響を引き継いで見ています
      </p>

      {/* 人体ステージ: 人体中央 + 浮遊カード 5 枚（over.png 配置）。
          薄いラベンダー/ブルーの色面 + halo を敷き、白い人体が背景に溶けないようにする（B3） */}
      <div className="relative mt-1 h-[330px] overflow-hidden rounded-2xl">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, rgba(224,231,255,0.65), rgba(237,233,254,0.5) 45%, rgba(239,246,255,0.35))",
          }}
        />
        {/* 足元のグラウンドシャドウ（接地感） */}
        <div
          className="pointer-events-none absolute left-1/2 top-[296px] h-4 w-[120px] -translate-x-1/2 rounded-[100%]"
          style={{ background: "radial-gradient(ellipse, rgba(129,140,248,0.28), rgba(129,140,248,0))" }}
        />
        <HumanBatteryFigure
          className="absolute left-1/2 top-1 h-[318px] -translate-x-1/2"
          brainFill={battery.brain.visualFill}
          heartFill={battery.heart.visualFill}
          bodyFill={battery.body.visualFill}
          brainUnknown={battery.brain.band === "unknown"}
          heartUnknown={battery.heart.band === "unknown"}
          bodyUnknown={battery.body.band === "unknown"}
          pulseZone={pulseZone}
        />

        {/* コネクタ（3 系統のみ。脳: 左上 → 頭 / 心: 右 → 胸 / 体: 左中 → 胴） */}
        <Connector side="left" top={23} fromPx={86} toCenterOffset={12} dotClass="bg-violet-400" />
        <Connector side="right" top={86} fromPx={86} toCenterOffset={16} dotClass="bg-rose-300" />
        <Connector side="left" top={132} fromPx={86} toCenterOffset={15} dotClass="bg-sky-400" />

        {/* 左列: 集中の余力 / からだの余力 / 外出耐性 */}
        <BatteryCallout zoneKey="brain" zone={battery.brain} onTap={onZoneTap} className="absolute left-0 top-0 z-10 w-[88px]" />
        <BatteryCallout zoneKey="body" zone={battery.body} onTap={onZoneTap} className="absolute left-0 top-[100px] z-10 w-[88px]" />
        <FloatingContextCard kind="outing" card={outingTolerance} onTap={onOutingTap} className="absolute left-0 top-[200px] z-10 w-[88px]" />

        {/* 右列: 心の余力 / 夜の余白 */}
        <BatteryCallout zoneKey="heart" zone={battery.heart} onTap={onZoneTap} className="absolute right-0 top-[54px] z-10 w-[88px]" />
        <FloatingContextCard kind="evening" card={eveningSlack} className="absolute right-0 top-[176px] z-10 w-[88px]" />
      </div>

      <p className="mt-1 text-[8px] text-slate-400">※ 見立ては体調や予定により変動します。タップで補正できます</p>
    </GlassCard>
  );
}
