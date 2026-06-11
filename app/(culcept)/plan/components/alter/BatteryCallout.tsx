"use client";

/**
 * BatteryCallout — 系統コールアウト小カード（人体の脇）
 *
 * 正本: docs/alter-tab-visual-contract.md §3.2
 * 内容: ラベル + 帯語 + 「見立て」/「本人」バッジ + 根拠チップ 1-2 個。% 数値は置かない。
 * タップ → 補正シート（もっと低い / 合ってる / もっと高い）— シート本体は AlterTabBody が持つ。
 */

import type { BatteryZoneVM } from "@/lib/plan/dayState/dayStateTypes";
import { BAND_LABEL, UNKNOWN_TEXT, ZONE_STYLE, type ZoneKey } from "./bandDisplay";

export interface BatteryCalloutProps {
  zoneKey: ZoneKey;
  zone: BatteryZoneVM;
  onTap?: (zoneKey: ZoneKey) => void;
}

export function BatteryCallout({ zoneKey, zone, onTap }: BatteryCalloutProps) {
  const style = ZONE_STYLE[zoneKey];
  const isUnknown = zone.band === "unknown";

  return (
    <button
      type="button"
      onClick={() => onTap?.(zoneKey)}
      className={`w-full rounded-2xl border bg-white/75 px-3 py-2.5 text-left shadow-sm backdrop-blur-sm transition-colors hover:bg-white ${
        isUnknown ? "border-slate-200/80 opacity-80" : "border-white/90"
      }`}
      aria-label={`${zone.label}の補正シートを開く`}
    >
      <div className="flex items-center gap-1.5">
        <span className={`h-2 w-2 shrink-0 rounded-full ${isUnknown ? "bg-slate-300" : style.dotClass}`} />
        <span className="text-[11px] font-medium text-slate-500">{zone.label}</span>
        <span
          className={`ml-auto shrink-0 rounded-full border px-1.5 py-px text-[9px] font-medium ${
            zone.source === "本人"
              ? "border-emerald-200 bg-emerald-50 text-emerald-600"
              : "border-slate-200 bg-slate-50 text-slate-500"
          }`}
        >
          {zone.source}
        </span>
      </div>
      <div className={`mt-1 text-sm font-semibold ${isUnknown ? "text-slate-400" : style.textClass}`}>
        {isUnknown ? UNKNOWN_TEXT : BAND_LABEL[zone.band]}
      </div>
      {zone.evidence.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {zone.evidence.slice(0, 2).map((ev) => (
            <span
              key={ev}
              className="rounded-full bg-slate-100/90 px-1.5 py-px text-[10px] text-slate-500"
            >
              {ev}
            </span>
          ))}
        </div>
      )}
      {isUnknown && (
        <div className="mt-1 text-[10px] text-slate-400">今日の様子から学びます</div>
      )}
    </button>
  );
}
