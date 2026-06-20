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
import { CarryIcon, LeafIcon, MoonIcon, PulseIcon, TargetIcon } from "./alterIcons";

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

/** 状態の背景（昨日までの影響）— 右カラム縦積み（over.png 構図） */
export function StateBackgroundColumn({
  cards,
  onCardTap,
}: {
  cards: AlterBatteryViewModel["contextCards"];
  onCardTap?: (target: ContextSheetTarget) => void;
}) {
  const { sleep, yesterdayLoad, recoveryQuality } = cards;
  return (
    <div className="flex h-full flex-col">
      <p className="px-1 pb-1 text-[8.5px] font-medium text-slate-400">
        状態の背景 <span className="text-slate-300">（昨日までの影響）</span>
      </p>
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 [&>*]:flex-1">
        {/* 睡眠（本人入力のみ。偽データ禁止。unknown 時は入力チップを内蔵） */}
        <div className="flex flex-col justify-center rounded-2xl border border-white bg-gradient-to-b from-white to-violet-50/40 p-2 shadow-[0_5px_16px_rgba(99,102,241,0.10)] backdrop-blur-sm">
          <div className="flex items-center gap-1">
            <IconChip icon={<MoonIcon size={11} />} tint="bg-violet-100/90 text-violet-500" />
            <span className="text-[9.5px] font-medium text-slate-500">{sleep.label}</span>
            {sleep.source === "user_reported" && (
              <span className="ml-auto rounded-full border border-emerald-200 bg-emerald-50 px-1 py-px text-[8px] text-emerald-600">本人</span>
            )}
          </div>
          <div className={`mt-1 font-bold leading-tight ${sleep.band === "unknown" ? "text-[10.5px] text-slate-400" : "text-[13px] text-slate-700"}`}>
            {sleep.text}
          </div>
          {sleep.source !== "user_reported" && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {(["よく眠れた", "浅い", "短い"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => onCardTap?.("sleep")}
                  className="rounded-full border border-violet-100 bg-white px-1.5 py-0.5 text-[8px] font-medium text-violet-500 shadow-sm transition-colors hover:bg-violet-50"
                >
                  {c}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 昨日の負荷（事実表示・小バー可/数値なし） */}
        <div className="flex flex-col justify-center rounded-2xl border border-white bg-gradient-to-b from-white to-amber-50/40 p-2 shadow-[0_5px_16px_rgba(99,102,241,0.10)] backdrop-blur-sm">
          <div className="flex items-center gap-1">
            <IconChip icon={<PulseIcon size={11} />} tint="bg-amber-100/90 text-amber-500" />
            <span className="text-[9.5px] font-medium text-slate-500">{yesterdayLoad.label}</span>
          </div>
          <div className={`mt-1 font-bold leading-tight ${yesterdayLoad.band === "unknown" ? "text-[10.5px] text-slate-400" : "text-[15px] text-slate-800"}`}>
            {YESTERDAY_LOAD_LABEL[yesterdayLoad.band]}
          </div>
          <BandBar fraction={BAND_BAR_FRACTION[yesterdayLoad.band]} barClass="bg-gradient-to-r from-amber-300 to-orange-400" />
          {yesterdayLoad.band !== "unknown" && <div className="mt-1 text-[8px] text-slate-400">前日の予定からの事実です</div>}
        </div>

        {/* 回復の質（弱導出 or unknown 許容） */}
        <div className="flex flex-col justify-center rounded-2xl border border-white bg-gradient-to-b from-white to-teal-50/40 p-2 shadow-[0_5px_16px_rgba(99,102,241,0.10)] backdrop-blur-sm">
          <div className="flex items-center gap-1">
            <IconChip icon={<LeafIcon size={11} />} tint="bg-teal-100/90 text-teal-500" />
            <span className="text-[9.5px] font-medium text-slate-500">{recoveryQuality.label}</span>
            {recoveryQuality.band !== "unknown" && <MitateBadge />}
          </div>
          <div className={`mt-1 font-bold leading-tight ${recoveryQuality.band === "unknown" ? "text-[10.5px] text-slate-400" : "text-[15px] text-slate-800"}`}>
            {RECOVERY_QUALITY_LABEL[recoveryQuality.band]}
          </div>
          {recoveryQuality.band === "unknown" && <div className="mt-0.5 text-[8px] text-slate-400">夜の答え合わせから学びます</div>}
        </div>
      </div>
    </div>
  );
}

/** 下段ペア: 明日への持ち越し / 今日の成立見込み（外出耐性・夜の余白は人体周囲の浮遊カードへ移動） */
export function ContextCardGrid({
  cards,
}: {
  cards: AlterBatteryViewModel["contextCards"];
  onCardTap?: (target: ContextSheetTarget) => void;
}) {
  const { carryOver, feasibility } = cards;
  const cellBase =
    "rounded-2xl border border-white bg-gradient-to-b from-white to-indigo-50/30 p-2.5 shadow-[0_5px_16px_rgba(99,102,241,0.10)] backdrop-blur-sm";
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {/* 明日への持ち越し */}
      <div className={cellBase}>
        <div className="flex items-center gap-1">
          <IconChip icon={<CarryIcon size={11} />} tint="bg-sky-100/90 text-sky-500" />
          <span className="text-[9.5px] font-medium text-slate-500">{carryOver.label}</span>
          {carryOver.band !== "unknown" && <MitateBadge />}
        </div>
        <div className={`mt-1 text-[13px] font-bold leading-tight ${carryOver.band === "unknown" ? "text-[10.5px] text-slate-400" : "text-slate-800"}`}>
          {CARRY_OVER_LABEL[carryOver.band]}
        </div>
        {carryOver.band !== "unknown" && <div className="mt-0.5 text-[8px] text-slate-400">夜以降に確定します</div>}
      </div>

      {/* 今日の成立見込み（帯語のみ） */}
      <div className={cellBase}>
        <div className="flex items-center gap-1">
          <IconChip icon={<TargetIcon size={11} />} tint="bg-purple-100/90 text-purple-500" />
          <span className="text-[9.5px] font-medium text-slate-500">{feasibility.label}</span>
          <MitateBadge />
        </div>
        <div className={`mt-1 text-[13px] font-bold leading-tight ${feasibility.band === "unknown" ? "text-[10.5px] text-slate-400" : "text-slate-800"}`}>
          {feasibility.band === "unknown" ? UNKNOWN_TEXT : feasibility.text}
        </div>
        {feasibility.band !== "unknown" && <div className="mt-0.5 text-[8px] text-slate-400">夜の答え合わせで採点されます</div>}
      </div>
    </div>
  );
}
