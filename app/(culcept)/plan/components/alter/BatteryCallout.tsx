"use client";

/**
 * BatteryCallout — 人体の周囲に浮かぶコールアウト小カード（v4: over.png 密度準拠の超コンパクト）
 *
 * 正本: docs/alter-tab-visual-contract.md §3.2 / §3.3（周辺カードは「人体の周囲または下」配置可）
 *  - BatteryCallout: 3 系統（タップ → 補正シート・コネクタあり）
 *  - FloatingContextCard: 外出耐性 / 夜の余白（人体の周囲に浮かべる周辺カード。人体水位ではないためコネクタなし）
 * 数値は出自付きで表示可（visual-contract §0.1・2026-06-11 CEO 緩和）。帯語 + source バッジ + 根拠チップ 1 個。unknown に数値を出さない。
 */

import type { AlterBatteryViewModel, BatteryZoneVM } from "@/lib/plan/dayState/dayStateTypes";
import { BAND_LABEL, UNKNOWN_TEXT, ZONE_STYLE, type ZoneKey } from "./bandDisplay";
import { BatteryIcon, BrainIcon, HeartIcon, MoonIcon, WalkIcon } from "./alterIcons";

const ZONE_ICON: Record<ZoneKey, (p: { size?: number; className?: string }) => React.ReactNode> = {
  brain: BrainIcon,
  heart: HeartIcon,
  body: BatteryIcon,
};

const ZONE_CHIP_BG: Record<ZoneKey, string> = {
  brain: "bg-blue-100/90 text-blue-500",
  heart: "bg-pink-100/90 text-pink-400",
  body: "bg-emerald-100/90 text-emerald-500",
};

const cardBase =
  "rounded-xl border border-white bg-white/95 px-1.5 py-1.5 text-left shadow-[0_6px_20px_rgba(99,102,241,0.18)] ring-1 ring-indigo-50/70 backdrop-blur-md";

function MitateBadge({ source = "見立て", confidence }: { source?: "見立て" | "本人"; confidence?: "low" | "medium" | "high" }) {
  // W1-5: zone.source を固定表示から配線（本人補正後は「本人」）。confidence は title で保持（表示発明はしない）
  return (
    <span
      title={confidence ? `confidence: ${confidence}` : undefined}
      className={`rounded-full border px-1 py-px text-[7.5px] font-medium ${
        source === "本人" ? "border-indigo-200 bg-indigo-50 text-indigo-500" : "border-slate-200 bg-slate-50 text-slate-400"
      }`}
    >
      {source}
    </span>
  );
}

export interface BatteryCalloutProps {
  zoneKey: ZoneKey;
  zone: BatteryZoneVM;
  /** over.png 準拠の % 数値（CEO 2026-06-11 契約緩和で解禁）。null/省略時は帯語のみ（unknown に数値を出さない） */
  pct?: number | null;
  onTap?: (zoneKey: ZoneKey) => void;
  className?: string;
}

export function BatteryCallout({ zoneKey, zone, pct, onTap, className }: BatteryCalloutProps) {
  const style = ZONE_STYLE[zoneKey];
  const Icon = ZONE_ICON[zoneKey];
  const isUnknown = zone.band === "unknown";

  return (
    <button
      type="button"
      onClick={() => onTap?.(zoneKey)}
      className={`${cardBase} transition-shadow hover:shadow-lg ${className ?? ""}`}
      aria-label={`${zone.label}の補正シートを開く`}
    >
      <div className="flex items-center gap-1">
        <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] ${isUnknown ? "bg-slate-100 text-slate-400" : ZONE_CHIP_BG[zoneKey]}`}>
          <Icon size={10} />
        </span>
        <span className="min-w-0 truncate text-[8.5px] font-medium text-slate-500">{zone.label}</span>
      </div>
      {isUnknown ? (
        <div className="mt-0.5 text-[10px] font-bold leading-tight text-slate-400">{UNKNOWN_TEXT}</div>
      ) : pct !== undefined && pct !== null ? (
        <div className={`mt-0.5 flex items-baseline gap-0.5 leading-none ${style.textClass}`}>
          <span className="text-[20px] font-bold tabular-nums">{pct}</span>
          <span className="text-[10px] font-semibold">%</span>
          <span className="ml-auto text-[8.5px] font-medium text-slate-500">{BAND_LABEL[zone.band]}</span>
        </div>
      ) : (
        <div className={`mt-0.5 text-[12px] font-bold leading-tight ${style.textClass}`}>{BAND_LABEL[zone.band]}</div>
      )}
      <div className="mt-0.5 flex flex-wrap items-center gap-0.5">
        <MitateBadge source={zone.source} confidence={zone.confidence} />
        {zone.evidence.slice(0, 1).map((ev) => (
          <span key={ev} className="truncate rounded-full bg-slate-100/90 px-1 py-px text-[7.5px] text-slate-500">
            {ev}
          </span>
        ))}
      </div>
      {isUnknown && <div className="mt-0.5 text-[7.5px] text-slate-400">今日の様子から学びます</div>}
    </button>
  );
}

/** 外出耐性 / 夜の余白 — 人体の周囲に浮かべる周辺カード（コネクタなし・人体水位ではない） */
export function FloatingContextCard({
  kind,
  card,
  pct,
  onTap,
  className,
}: {
  kind: "outing" | "evening";
  card:
    | AlterBatteryViewModel["contextCards"]["outingTolerance"]
    | AlterBatteryViewModel["contextCards"]["eveningSlack"];
  /** 外出耐性の % 数値（over.png）。null/省略時は帯語のみ。evening は時間量テキストなので不要 */
  pct?: number | null;
  onTap?: () => void;
  className?: string;
}) {
  const icon =
    kind === "outing" ? (
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] bg-emerald-100/90 text-emerald-500">
        <WalkIcon size={10} />
      </span>
    ) : (
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] bg-indigo-100/90 text-indigo-500">
        <MoonIcon size={10} />
      </span>
    );
  const isEstimate = kind === "outing";
  const inner = (
    <>
      <div className="flex items-center gap-1">
        {icon}
        <span className="min-w-0 truncate text-[8.5px] font-medium text-slate-500">{card.label}</span>
      </div>
      {kind === "outing" && pct !== undefined && pct !== null ? (
        <div className="mt-0.5 flex items-baseline gap-0.5 leading-none text-emerald-600">
          <span className="text-[20px] font-bold tabular-nums">{pct}</span>
          <span className="text-[10px] font-semibold">%</span>
          <span className="ml-auto truncate text-[8.5px] font-medium text-slate-500">{card.text}</span>
        </div>
      ) : (
        <div className="mt-0.5 text-[12px] font-bold leading-snug text-slate-800">{card.text}</div>
      )}
      <div className="mt-0.5 flex flex-wrap items-center gap-0.5">
        {isEstimate && <MitateBadge />}
        {card.evidence.slice(0, 1).map((ev) => (
          <span key={ev} className="truncate rounded-full bg-slate-100/90 px-1 py-px text-[7.5px] text-slate-500">
            {ev}
          </span>
        ))}
      </div>
    </>
  );
  if (onTap) {
    return (
      <button type="button" onClick={onTap} aria-label={`${card.label}の補正シートを開く`} className={`${cardBase} transition-shadow hover:shadow-lg ${className ?? ""}`}>
        {inner}
      </button>
    );
  }
  return <div className={`${cardBase} ${className ?? ""}`}>{inner}</div>;
}
