"use client";

/**
 * BatteryCallout — 系統コールアウト（人体の周囲に浮かぶ小カード・v2）
 *
 * 正本: docs/alter-tab-visual-contract.md §3.2 / 設計書 §9.2
 * 参照画像準拠: アイコンチップ + ラベル + 帯語（大きめ・系統色）+「見立て」バッジ + 根拠チップ 1-2。
 * % 数値は置かない。タップ → 補正シート。
 */

import type { BatteryZoneVM } from "@/lib/plan/dayState/dayStateTypes";
import { BAND_LABEL, UNKNOWN_TEXT, ZONE_STYLE, type ZoneKey } from "./bandDisplay";
import { BatteryIcon, BrainIcon, HeartIcon } from "./alterIcons";

const ZONE_ICON: Record<ZoneKey, (p: { size?: number; className?: string }) => React.ReactNode> = {
  brain: BrainIcon,
  heart: HeartIcon,
  body: BatteryIcon,
};

const ZONE_CHIP_BG: Record<ZoneKey, string> = {
  brain: "bg-violet-100/90 text-violet-500",
  heart: "bg-rose-100/90 text-rose-400",
  body: "bg-sky-100/90 text-sky-500",
};

export interface BatteryCalloutProps {
  zoneKey: ZoneKey;
  zone: BatteryZoneVM;
  onTap?: (zoneKey: ZoneKey) => void;
  className?: string;
}

export function BatteryCallout({ zoneKey, zone, onTap, className }: BatteryCalloutProps) {
  const style = ZONE_STYLE[zoneKey];
  const Icon = ZONE_ICON[zoneKey];
  const isUnknown = zone.band === "unknown";

  return (
    <button
      type="button"
      onClick={() => onTap?.(zoneKey)}
      className={`rounded-2xl border bg-white/88 px-2 py-2 text-left shadow-[0_4px_14px_rgba(99,102,241,0.10)] backdrop-blur-md transition-shadow hover:shadow-lg ${
        isUnknown ? "border-slate-200/80" : "border-white"
      } ${className ?? ""}`}
      aria-label={`${zone.label}の補正シートを開く`}
    >
      <div className="flex items-center gap-1">
        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md ${isUnknown ? "bg-slate-100 text-slate-400" : ZONE_CHIP_BG[zoneKey]}`}>
          <Icon size={12} />
        </span>
        <span className="min-w-0 truncate text-[9.5px] font-medium text-slate-500">{zone.label}</span>
      </div>
      <div className={`mt-1 text-[13px] font-bold leading-tight ${isUnknown ? "text-slate-400" : style.textClass}`}>
        {isUnknown ? UNKNOWN_TEXT : BAND_LABEL[zone.band]}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1">
        <span
          className={`rounded-full border px-1 py-px text-[8px] font-medium ${
            zone.source === "本人" ? "border-emerald-200 bg-emerald-50 text-emerald-600" : "border-slate-200 bg-slate-50 text-slate-400"
          }`}
        >
          {zone.source}
        </span>
        {zone.evidence.slice(0, 2).map((ev) => (
          <span key={ev} className="rounded-full bg-slate-100/90 px-1 py-px text-[8px] text-slate-500">
            {ev}
          </span>
        ))}
      </div>
      {isUnknown && <div className="mt-0.5 text-[8.5px] text-slate-400">今日の様子から学びます</div>}
    </button>
  );
}
