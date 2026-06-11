"use client";

/**
 * RealityContextCards — 周辺カード群（v2: 参照画像構図）
 *
 * 正本: docs/alter-tab-visual-contract.md §3.3
 * 2 グループに分割（参照画像のレイアウト準拠・人体内部の水位ではないことを構図で明確に）:
 *  - StateBackgroundColumn: 「状態の背景（昨日までの影響）」縦カラム = 睡眠 / 昨日の負荷 / 回復の質
 *  - ContextCardGrid: 今日に向く 4 枚 = 外出耐性 / 夜の余白 / 明日への持ち越し / 今日の成立見込み
 * 帯語のみ（% なし）。夜の余白の時間量（2.5h）は予定由来の事実のため表示可。昨日の負荷は小バー可（数値なし）。
 */

import type { AlterBatteryViewModel } from "@/lib/plan/dayState/dayStateTypes";
import {
  BAND_BAR_FRACTION,
  CARRY_OVER_LABEL,
  RECOVERY_QUALITY_LABEL,
  UNKNOWN_TEXT,
  YESTERDAY_LOAD_LABEL,
} from "./bandDisplay";
import { CarryIcon, LeafIcon, MoonIcon, PulseIcon, TargetIcon, WalkIcon } from "./alterIcons";

export type ContextSheetTarget = "outingTolerance" | "sleep";

function MitateBadge() {
  return (
    <span className="ml-auto shrink-0 rounded-full border border-slate-200 bg-white/80 px-1 py-px text-[8px] font-medium text-slate-400">
      見立て
    </span>
  );
}

function IconChip({ icon, tint }: { icon: React.ReactNode; tint: string }) {
  return <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md ${tint}`}>{icon}</span>;
}

function BandBar({ fraction, barClass }: { fraction: number; barClass: string }) {
  if (fraction <= 0) return null;
  return (
    <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-slate-100">
      <div className={`h-full rounded-full ${barClass}`} style={{ width: `${fraction * 100}%` }} />
    </div>
  );
}

/** 状態の背景（昨日までの影響）— 3 連カード */
export function StateBackgroundColumn({
  cards,
  onCardTap,
}: {
  cards: AlterBatteryViewModel["contextCards"];
  onCardTap?: (target: ContextSheetTarget) => void;
}) {
  const { sleep, yesterdayLoad, recoveryQuality } = cards;
  return (
    <div>
      <p className="px-1 pb-1 text-[9px] font-medium text-slate-400">
        状態の背景 <span className="text-slate-300">（昨日までの影響）</span>
      </p>
      <div className="grid grid-cols-3 gap-1.5">
        {/* 睡眠（本人入力のみ。偽データ禁止） */}
        <button
          type="button"
          onClick={() => onCardTap?.("sleep")}
          aria-label="昨夜の眠りを入力する"
          className="rounded-2xl border border-white bg-white/85 p-2 text-left shadow-sm backdrop-blur-sm transition-colors hover:bg-white"
        >
          <div className="flex items-center gap-1">
            <IconChip icon={<MoonIcon size={11} />} tint="bg-violet-100/90 text-violet-500" />
            <span className="text-[9.5px] font-medium text-slate-500">{sleep.label}</span>
            {sleep.source === "user_reported" && (
              <span className="ml-auto rounded-full border border-emerald-200 bg-emerald-50 px-1 py-px text-[8px] text-emerald-600">本人</span>
            )}
          </div>
          <div className={`mt-1 text-[10.5px] font-bold leading-tight ${sleep.band === "unknown" ? "text-slate-400" : "text-slate-700"}`}>
            {sleep.text}
          </div>
          {sleep.source !== "user_reported" && <div className="mt-0.5 text-[8px] text-slate-400">タップで教えてください</div>}
        </button>

        {/* 昨日の負荷（事実表示・小バー可/数値なし） */}
        <div className="rounded-2xl border border-white bg-white/85 p-2 shadow-sm backdrop-blur-sm">
          <div className="flex items-center gap-1">
            <IconChip icon={<PulseIcon size={11} />} tint="bg-amber-100/90 text-amber-500" />
            <span className="text-[9.5px] font-medium text-slate-500">{yesterdayLoad.label}</span>
          </div>
          <div className={`mt-1 font-bold leading-tight ${yesterdayLoad.band === "unknown" ? "text-[10.5px] text-slate-400" : "text-[13px] text-slate-700"}`}>
            {YESTERDAY_LOAD_LABEL[yesterdayLoad.band]}
          </div>
          <BandBar fraction={BAND_BAR_FRACTION[yesterdayLoad.band]} barClass="bg-gradient-to-r from-amber-300 to-orange-300" />
        </div>

        {/* 回復の質（弱導出 or unknown 許容） */}
        <div className="rounded-2xl border border-white bg-white/85 p-2 shadow-sm backdrop-blur-sm">
          <div className="flex items-center gap-1">
            <IconChip icon={<LeafIcon size={11} />} tint="bg-teal-100/90 text-teal-500" />
            <span className="text-[9.5px] font-medium text-slate-500">{recoveryQuality.label}</span>
            {recoveryQuality.band !== "unknown" && <MitateBadge />}
          </div>
          <div className={`mt-1 font-bold leading-tight ${recoveryQuality.band === "unknown" ? "text-[10.5px] text-slate-400" : "text-[13px] text-slate-700"}`}>
            {RECOVERY_QUALITY_LABEL[recoveryQuality.band]}
          </div>
        </div>
      </div>
    </div>
  );
}

/** 下段グリッド: 外出耐性 / 夜の余白 / 明日への持ち越し / 今日の成立見込み */
export function ContextCardGrid({
  cards,
  onCardTap,
}: {
  cards: AlterBatteryViewModel["contextCards"];
  onCardTap?: (target: ContextSheetTarget) => void;
}) {
  const { outingTolerance, eveningSlack, carryOver, feasibility } = cards;
  const cellBase = "rounded-2xl border border-white bg-white/85 p-2.5 shadow-sm backdrop-blur-sm";
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {/* 外出耐性（見立て・補正可・根拠つき） */}
      <button
        type="button"
        onClick={() => onCardTap?.("outingTolerance")}
        aria-label="外出耐性の補正シートを開く"
        className={`${cellBase} text-left transition-colors hover:bg-white`}
      >
        <div className="flex items-center gap-1">
          <IconChip icon={<WalkIcon size={11} />} tint="bg-emerald-100/90 text-emerald-500" />
          <span className="text-[10px] font-medium text-slate-500">{outingTolerance.label}</span>
          <MitateBadge />
        </div>
        <div className={`mt-1 text-[12px] font-bold leading-tight ${outingTolerance.band === "unknown" ? "text-slate-400" : "text-slate-700"}`}>
          {outingTolerance.text}
        </div>
        {outingTolerance.evidence.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {outingTolerance.evidence.slice(0, 2).map((ev) => (
              <span key={ev} className="rounded-full bg-slate-100/90 px-1 py-px text-[8px] text-slate-500">
                {ev}
              </span>
            ))}
          </div>
        )}
      </button>

      {/* 夜の余白（予定由来の事実 — 時間量表示可） */}
      <div className={cellBase}>
        <div className="flex items-center gap-1">
          <IconChip icon={<MoonIcon size={11} />} tint="bg-indigo-100/90 text-indigo-500" />
          <span className="text-[10px] font-medium text-slate-500">{eveningSlack.label}</span>
        </div>
        <div className="mt-1 text-[12px] font-bold leading-tight text-slate-700">{eveningSlack.text}</div>
        {eveningSlack.evidence.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {eveningSlack.evidence.slice(0, 1).map((ev) => (
              <span key={ev} className="rounded-full bg-slate-100/90 px-1 py-px text-[8px] text-slate-500">
                {ev}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 明日への持ち越し */}
      <div className={cellBase}>
        <div className="flex items-center gap-1">
          <IconChip icon={<CarryIcon size={11} />} tint="bg-sky-100/90 text-sky-500" />
          <span className="text-[10px] font-medium text-slate-500">{carryOver.label}</span>
          {carryOver.band !== "unknown" && <MitateBadge />}
        </div>
        <div className={`mt-1 text-[12px] font-bold leading-tight ${carryOver.band === "unknown" ? "text-slate-400" : "text-slate-700"}`}>
          {CARRY_OVER_LABEL[carryOver.band]}
        </div>
      </div>

      {/* 今日の成立見込み（帯語のみ） */}
      <div className={cellBase}>
        <div className="flex items-center gap-1">
          <IconChip icon={<TargetIcon size={11} />} tint="bg-purple-100/90 text-purple-500" />
          <span className="text-[10px] font-medium text-slate-500">{feasibility.label}</span>
          <MitateBadge />
        </div>
        <div className={`mt-1 text-[12px] font-bold leading-tight ${feasibility.band === "unknown" ? "text-slate-400" : "text-slate-700"}`}>
          {feasibility.band === "unknown" ? UNKNOWN_TEXT : feasibility.text}
        </div>
      </div>
    </div>
  );
}
