"use client";

/**
 * HumanBatteryCard — メインカード（over.png static clone・CEO 2026-06-11 契約緩和で % 解禁）
 *
 * over.png 構図: 人体中央 + 浮遊カード 5 枚（左 3: 集中/心/外出耐性、右 2: からだ/夜の余白）+ 点線コネクタ。
 * 各メーターに % 数値。人体カード背景に色面 + halo（白背景に溶けない）。
 * タイトルは「あなたのバッテリー」を維持（過去 CEO 確定。over.png の「今日の開始残量」は毎朝リセット誤解のため不採用継続 — 要 CEO 確認）。
 */

import { GlassCard } from "@/components/ui/glassmorphism-design";
import type { AlterBatteryViewModel } from "@/lib/plan/dayState/dayStateTypes";
import type { AlterScreenViewModel } from "./screenViewModel";
import { BatteryCallout, FloatingContextCard } from "./BatteryCallout";
import { HumanBatteryFigure } from "./HumanBatteryFigure";
import type { ZoneKey } from "./bandDisplay";

export interface HumanBatteryCardProps {
  battery: AlterBatteryViewModel["battery"];
  outingTolerance: AlterBatteryViewModel["contextCards"]["outingTolerance"];
  eveningSlack: AlterBatteryViewModel["contextCards"]["eveningSlack"];
  meterPct: AlterScreenViewModel["meterPct"];
  onZoneTap?: (zone: ZoneKey) => void;
  onOutingTap?: () => void;
  pulseZone?: ZoneKey | null;
}

/** 点線コネクタ（カード→部位） */
function Connector({
  side,
  top,
  fromPx,
  toCenterOffset,
  dotClass,
  lineClass = "border-slate-300/90",
  glow,
}: {
  side: "left" | "right";
  top: number;
  fromPx: number;
  toCenterOffset: number;
  dotClass: string;
  /** 系統色の点線（視認性強化・B12） */
  lineClass?: string;
  /** 端点ドットのソフトグロー色 */
  glow?: string;
}) {
  const style: React.CSSProperties =
    side === "left"
      ? { left: fromPx, width: `calc(50% - ${fromPx + toCenterOffset}px)`, top }
      : { right: fromPx, width: `calc(50% - ${fromPx + toCenterOffset}px)`, top };
  return (
    <div className="pointer-events-none absolute" style={style} aria-hidden="true">
      <div className={`border-t-[1.5px] border-dotted ${lineClass}`} />
      <span
        className={`absolute top-[-2.5px] h-[6px] w-[6px] rounded-full ring-1 ring-white ${dotClass} ${side === "left" ? "right-[-3px]" : "left-[-3px]"}`}
        style={glow ? { boxShadow: `0 0 6px ${glow}` } : undefined}
      />
    </div>
  );
}

export function HumanBatteryCard({
  battery,
  outingTolerance,
  eveningSlack,
  meterPct,
  onZoneTap,
  onOutingTap,
  pulseZone = null,
}: HumanBatteryCardProps) {
  const known = (b: { band: string }) => b.band !== "unknown";
  return (
    <GlassCard variant="gradient" padding="none" hoverEffect={false} className="p-2">
      <h2 className="text-[12.5px] font-bold tracking-tight text-slate-800">あなたのバッテリー</h2>
      <p className="mt-px text-[8.5px] leading-tight text-slate-400">昨日・睡眠・予定の影響を引き継いで見ています</p>

      {/* 人体ステージ: 色面 + halo + 人体中央 + 浮遊カード 5 枚 */}
      <div className="relative mt-1 h-[330px] overflow-hidden rounded-2xl">
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: "linear-gradient(to bottom, rgba(224,231,255,0.7), rgba(237,233,254,0.52) 45%, rgba(239,246,255,0.38))" }}
        />
        <div
          className="pointer-events-none absolute left-1/2 top-[296px] h-4 w-[120px] -translate-x-1/2 rounded-[100%]"
          style={{ background: "radial-gradient(ellipse, rgba(129,140,248,0.3), rgba(129,140,248,0))" }}
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

        {/* 中央の人体メーターを直接タップして補正シートを開く導線（FAIL 1: 左右バッジだけでは
          * 「どこを押せば水位を直せるか」が不明瞭だった）。透明オーバーレイ＝絵は不変・z はバッジ(z-10)の下。 */}
        {onZoneTap && (
          <div className="pointer-events-none absolute left-1/2 top-1 z-[5] h-[318px] w-[120px] -translate-x-1/2">
            <button
              type="button"
              aria-label={`${battery.brain.label}を補正`}
              onClick={() => onZoneTap("brain")}
              className="pointer-events-auto absolute left-1/2 top-0 h-[72px] w-[88px] -translate-x-1/2 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/60"
            />
            <button
              type="button"
              aria-label={`${battery.heart.label}を補正`}
              onClick={() => onZoneTap("heart")}
              className="pointer-events-auto absolute left-1/2 top-[78px] h-[66px] w-[96px] -translate-x-1/2 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-300/60"
            />
            <button
              type="button"
              aria-label={`${battery.body.label}を補正`}
              onClick={() => onZoneTap("body")}
              className="pointer-events-auto absolute left-1/2 top-[150px] h-[150px] w-[104px] -translate-x-1/2 rounded-3xl focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60"
            />
          </div>
        )}

        {/* コネクタ（3 系統のみ。脳: 左上 → 頭 / 心: 左中 → 胸 / 外出は周辺で接続なし。体: 右 → 胴） */}
        <Connector side="left" top={23} fromPx={86} toCenterOffset={12} dotClass="bg-blue-400" lineClass="border-blue-300/80" glow="rgba(59,130,246,0.7)" />
        <Connector side="left" top={116} fromPx={86} toCenterOffset={15} dotClass="bg-pink-400" lineClass="border-pink-300/80" glow="rgba(236,72,153,0.7)" />
        <Connector side="right" top={64} fromPx={86} toCenterOffset={14} dotClass="bg-emerald-400" lineClass="border-emerald-300/80" glow="rgba(16,185,129,0.7)" />

        {/* 左列: 集中の余力 / 心の余力 / 外出耐性 */}
        <BatteryCallout zoneKey="brain" zone={battery.brain} pct={known(battery.brain) ? meterPct.brain : undefined} onTap={onZoneTap} className="absolute left-0 top-0 z-10 w-[90px]" />
        <BatteryCallout zoneKey="heart" zone={battery.heart} pct={known(battery.heart) ? meterPct.heart : undefined} onTap={onZoneTap} className="absolute left-0 top-[96px] z-10 w-[90px]" />
        <FloatingContextCard kind="outing" card={outingTolerance} pct={known(outingTolerance) ? meterPct.outing : undefined} onTap={onOutingTap} className="absolute left-0 top-[200px] z-10 w-[90px]" />

        {/* 右列: からだの余力 / 夜の余白 */}
        <BatteryCallout zoneKey="body" zone={battery.body} pct={known(battery.body) ? meterPct.body : undefined} onTap={onZoneTap} className="absolute right-0 top-[34px] z-10 w-[90px]" />
        <FloatingContextCard kind="evening" card={eveningSlack} className="absolute right-0 top-[150px] z-10 w-[90px]" />
      </div>

      <p className="mt-1 text-[8px] text-slate-400">※ 数値は見立ての目安です。体調や予定により変動します。タップで補正できます</p>
    </GlassCard>
  );
}
