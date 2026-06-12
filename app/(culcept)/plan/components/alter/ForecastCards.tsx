"use client";

/**
 * ForecastCards — over.png の数値カード群（CEO 2026-06-11 契約緩和で % / グラフ解禁）
 *  - StateBackgroundPanel: 「状態の背景」1 枠に 4 セル（睡眠 / 昨日の負荷 / 回復の質 / 体質スタミナ）
 *  - ForecastGrid: 今日の消耗予測 / 夜の回復見込み / 明日への持ち越し / 今日の成立見込み（2x2）
 */

import type { AlterScreenViewModel } from "./screenViewModel";
import { BatteryIcon, BrainIcon, CarryIcon, LeafIcon, MoonIcon, PulseIcon, TargetIcon, WalkIcon } from "./alterIcons";

/** mock_reference の明示（visual-contract §0.1: 実導出が未設計の参考値・実測断定禁止） */
export function RefBadge({ className }: { className?: string }) {
  return (
    <span className={`rounded-full border border-slate-200/90 bg-white/80 px-1 py-px text-[7px] font-medium text-slate-400 ${className ?? ""}`}>
      参考値
    </span>
  );
}

/** unknown（数値の出自なし）の正規表示 — 0% を出さない（visual-contract §0.1） */
const NO_VALUE = "—";

/** % バー（B13: スパークラインは「存在しない履歴」を示唆するため廃止し、現在値のバーに置換） */
function PctBar({ pct, barClass }: { pct: number; barClass: string }) {
  return (
    <div className="h-1.5 w-14 overflow-hidden rounded-full bg-slate-100">
      <div className={`h-full rounded-full ${barClass}`} style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }} />
    </div>
  );
}

function IconChip({ icon, tint }: { icon: React.ReactNode; tint: string }) {
  return <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md ${tint}`}>{icon}</span>;
}

/** 状態の背景（昨日までの影響）— 1 枠に 4 セル。睡眠セルはタップで入力シート（W1: H-1 導線復旧） */
export function StateBackgroundPanel({
  stateBg,
  onSleepTap,
}: {
  stateBg: AlterScreenViewModel["stateBg"];
  onSleepTap?: () => void;
}) {
  const cell = "rounded-xl border border-white/90 bg-white/80 px-2 py-1.5 shadow-sm";
  return (
    <div className="flex h-full flex-col rounded-2xl border border-white bg-gradient-to-b from-white/70 to-indigo-50/40 p-2 shadow-[0_6px_18px_rgba(99,102,241,0.10)] backdrop-blur-sm">
      <p className="px-0.5 pb-1.5 text-[9px] font-medium leading-tight text-slate-500">
        状態の背景<br />
        <span className="text-[8px] text-slate-400">昨日までの影響</span>
      </p>
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 [&>*]:flex-1">
        <button
          type="button"
          onClick={onSleepTap}
          aria-label="昨夜の眠りを入力する"
          className={`${cell} text-left transition-colors hover:border-indigo-200`}
        >
          <div className="flex items-center gap-1">
            <IconChip icon={<MoonIcon size={11} />} tint="bg-indigo-100/90 text-indigo-500" />
            <span className="text-[9px] font-medium text-slate-500">睡眠</span>
            {stateBg.sleep.value !== "—" && !stateBg.sleep.userReported && <RefBadge />}
            {stateBg.sleep.userReported && (
              <span className="rounded-full border border-indigo-200 bg-indigo-50 px-1 py-px text-[7px] font-medium text-indigo-500">本人</span>
            )}
            <span className="ml-auto text-[14px] font-bold tabular-nums text-slate-800">{stateBg.sleep.value}</span>
          </div>
          <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-gradient-to-r from-indigo-300 to-blue-400" style={{ width: `${stateBg.sleep.barPct}%` }} />
          </div>
          <div className="mt-0.5 text-right text-[8.5px] text-slate-400">{stateBg.sleep.note}</div>
        </button>
        <div className={cell}>
          <div className="flex items-center gap-1">
            <IconChip icon={<PulseIcon size={11} />} tint="bg-amber-100/90 text-amber-500" />
            <span className="text-[9px] font-medium text-slate-500">昨日の負荷</span>
            <span className="ml-auto text-[14px] font-bold tabular-nums text-slate-800">
              {stateBg.yesterdayLoad.pct === null ? NO_VALUE : (
                <>
                  {stateBg.yesterdayLoad.pct}
                  <span className="text-[9px] font-medium text-slate-400">%</span>
                </>
              )}
            </span>
          </div>
          <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-gradient-to-r from-amber-300 to-orange-400" style={{ width: `${stateBg.yesterdayLoad.pct ?? 0}%` }} />
          </div>
          {stateBg.yesterdayLoad.pct === null && (
            <div className="mt-0.5 text-right text-[8.5px] text-slate-400">{stateBg.yesterdayLoad.note}</div>
          )}
        </div>
        <div className={cell}>
          <div className="flex items-center gap-1">
            <IconChip icon={<LeafIcon size={11} />} tint="bg-teal-100/90 text-teal-500" />
            <span className="text-[9px] font-medium text-slate-500">回復の質</span>
            <span className="ml-auto text-[14px] font-bold tabular-nums text-slate-800">
              {stateBg.recoveryQuality.pct === null ? NO_VALUE : (
                <>
                  {stateBg.recoveryQuality.pct}
                  <span className="text-[9px] font-medium text-slate-400">%</span>
                </>
              )}
            </span>
          </div>
          <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-gradient-to-r from-teal-300 to-emerald-400" style={{ width: `${stateBg.recoveryQuality.pct ?? 0}%` }} />
          </div>
          {stateBg.recoveryQuality.pct === null && (
            <div className="mt-0.5 text-right text-[8.5px] text-slate-400">{stateBg.recoveryQuality.note}</div>
          )}
        </div>
        <div className={cell}>
          <div className="flex items-center gap-1">
            <IconChip icon={<WalkIcon size={11} />} tint="bg-violet-100/90 text-violet-500" />
            <span className="whitespace-nowrap text-[9px] font-medium text-slate-500">体質スタミナ</span>
            <RefBadge />
            <span className="ml-auto whitespace-nowrap text-[12px] font-bold text-slate-800">{stateBg.stamina.value}</span>
          </div>
          <div className="mt-0.5 text-right text-[8px] text-slate-400">{stateBg.stamina.note}</div>
        </div>
      </div>
    </div>
  );
}

const forecastCell = "rounded-2xl border border-white bg-gradient-to-b from-white to-indigo-50/30 p-2.5 shadow-[0_5px_16px_rgba(99,102,241,0.10)] backdrop-blur-sm";

function MetricRow({ icon, label, value, valueClass = "text-slate-800" }: { icon: React.ReactNode; label: string; value: React.ReactNode; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-1 text-[9.5px] text-slate-500">
        {icon}
        {label}
      </span>
      <span className={`text-[12px] font-bold tabular-nums ${valueClass}`}>{value}</span>
    </div>
  );
}

/** 今日の消耗予測 / 夜の回復見込み / 明日への持ち越し / 今日の成立見込み（2x2） */
export function ForecastGrid({
  consumption,
  nightRecovery,
  carryOver,
  feasibility,
}: {
  consumption: AlterScreenViewModel["consumption"];
  nightRecovery: AlterScreenViewModel["nightRecovery"];
  carryOver: AlterScreenViewModel["carryOver"];
  feasibility: AlterScreenViewModel["feasibility"];
}) {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {/* 今日の消耗予測 */}
      <div className={forecastCell}>
        <div className="flex items-center gap-1">
          <IconChip icon={<PulseIcon size={11} />} tint="bg-rose-100/90 text-rose-400" />
          <span className="text-[10px] font-bold text-slate-600">今日の消耗予測</span>
          <RefBadge className="ml-auto" />
        </div>
        <div className="mt-1.5 space-y-1">
          <MetricRow icon={<BatteryIcon size={10} className="text-sky-500" />} label="体力" value={`${consumption.energy}%`} valueClass="text-rose-500" />
          <MetricRow icon={<BrainIcon size={10} className="text-violet-500" />} label="集中" value={`${consumption.focus}%`} valueClass="text-rose-500" />
          <div className="mt-1 border-t border-slate-100 pt-1">
            <MetricRow icon={<TargetIcon size={10} className="text-orange-400" />} label="負荷予定" value={`${consumption.loadPlanned}%`} />
          </div>
        </div>
      </div>

      {/* 夜の回復見込み */}
      <div className={forecastCell}>
        <div className="flex items-center gap-1">
          <IconChip icon={<MoonIcon size={11} />} tint="bg-indigo-100/90 text-indigo-500" />
          <span className="text-[10px] font-bold text-slate-600">夜の回復見込み</span>
          <RefBadge className="ml-auto" />
        </div>
        <div className="mt-1 text-[18px] font-bold tabular-nums leading-none text-slate-800">{nightRecovery.hours}</div>
        <div className="mt-1.5 space-y-1">
          <div className="flex items-center gap-1.5">
            <span className="w-7 text-[8.5px] text-slate-400">体力</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-gradient-to-r from-sky-300 to-blue-400" style={{ width: `${nightRecovery.energyAfter ?? 0}%` }} />
            </div>
            <span className="text-[8.5px] font-semibold tabular-nums text-slate-500">
              {nightRecovery.energyAfter === null ? NO_VALUE : `${nightRecovery.energyAfter}%`}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-7 text-[8.5px] text-slate-400">集中</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-gradient-to-r from-violet-300 to-purple-400" style={{ width: `${nightRecovery.focusAfter ?? 0}%` }} />
            </div>
            <span className="text-[8.5px] font-semibold tabular-nums text-slate-500">
              {nightRecovery.focusAfter === null ? NO_VALUE : `${nightRecovery.focusAfter}%`}
            </span>
          </div>
        </div>
      </div>

      {/* 明日への持ち越し */}
      <div className={forecastCell}>
        <div className="flex items-center gap-1">
          <IconChip icon={<CarryIcon size={11} />} tint="bg-sky-100/90 text-sky-500" />
          <span className="text-[10px] font-bold text-slate-600">明日への持ち越し</span>
        </div>
        <div className="mt-1 flex items-end justify-between">
          <span className="text-[20px] font-bold tabular-nums leading-none text-slate-800">
            {carryOver.pct === null ? NO_VALUE : (
              <>
                {carryOver.pct}
                <span className="text-[11px] font-medium text-slate-400">%</span>
              </>
            )}
          </span>
          {carryOver.pct !== null && <PctBar pct={carryOver.pct} barClass="bg-gradient-to-r from-sky-300 to-blue-400" />}
        </div>
        <div className="mt-0.5 text-[8.5px] text-slate-400">{carryOver.note}</div>
      </div>

      {/* 今日の成立見込み */}
      <div className={forecastCell}>
        <div className="flex items-center gap-1">
          <IconChip icon={<TargetIcon size={11} />} tint="bg-purple-100/90 text-purple-500" />
          <span className="text-[10px] font-bold text-slate-600">今日の成立見込み</span>
        </div>
        <div className="mt-1 flex items-end justify-between">
          <span className="text-[20px] font-bold tabular-nums leading-none text-slate-800">
            {feasibility.pct === null ? NO_VALUE : (
              <>
                {feasibility.pct}
                <span className="text-[11px] font-medium text-slate-400">%</span>
              </>
            )}
          </span>
          {feasibility.pct !== null && <PctBar pct={feasibility.pct} barClass="bg-gradient-to-r from-violet-300 to-purple-400" />}
        </div>
        <div className="mt-0.5 text-[8.5px] text-slate-400">{feasibility.note}</div>
      </div>
    </div>
  );
}
