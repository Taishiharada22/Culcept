"use client";

/**
 * RealityContextCards — 周辺カード 7 枚（人体内部の水位ではないことを構図で明確に）
 *
 * 正本: docs/alter-tab-visual-contract.md §3.3
 *  - 外出耐性 / 夜の余白 / 睡眠 / 昨日の負荷 / 回復の質 / 明日への持ち越し / 今日の成立見込み
 *  - 帯語のみ（% なし）。夜の余白の時間量（2.5h）は予定由来の事実のため表示可
 *  - 昨日の負荷は小バー可（数値なし）
 *  - 睡眠: 取得経路なし → 本人チップ入力 or 「まだ読めていません」（偽データ禁止）
 */

import type { AlterBatteryViewModel } from "@/lib/plan/dayState/dayStateTypes";
import {
  BAND_BAR_FRACTION,
  CARRY_OVER_LABEL,
  RECOVERY_QUALITY_LABEL,
  UNKNOWN_TEXT,
  YESTERDAY_LOAD_LABEL,
} from "./bandDisplay";

export type ContextSheetTarget = "outingTolerance" | "sleep";

export interface RealityContextCardsProps {
  cards: AlterBatteryViewModel["contextCards"];
  onCardTap?: (target: ContextSheetTarget) => void;
}

function MitateBadge() {
  return (
    <span className="ml-auto shrink-0 rounded-full border border-slate-200 bg-slate-50 px-1.5 py-px text-[9px] font-medium text-slate-500">
      見立て
    </span>
  );
}

function HonninBadge() {
  return (
    <span className="ml-auto shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-px text-[9px] font-medium text-emerald-600">
      本人
    </span>
  );
}

function CardShell({
  children,
  onClick,
  ariaLabel,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  ariaLabel?: string;
}) {
  const base =
    "rounded-2xl border border-white/90 bg-white/72 p-3 text-left shadow-sm backdrop-blur-sm";
  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-label={ariaLabel} className={`${base} transition-colors hover:bg-white`}>
        {children}
      </button>
    );
  }
  return <div className={base}>{children}</div>;
}

function EvidenceChips({ evidence }: { evidence: string[] }) {
  if (evidence.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {evidence.slice(0, 2).map((ev) => (
        <span key={ev} className="rounded-full bg-slate-100/90 px-1.5 py-px text-[10px] text-slate-500">
          {ev}
        </span>
      ))}
    </div>
  );
}

export function RealityContextCards({ cards, onCardTap }: RealityContextCardsProps) {
  const { outingTolerance, eveningSlack, sleep, yesterdayLoad, recoveryQuality, carryOver, feasibility } = cards;

  return (
    <section aria-label="今日の周辺の見立て">
      <div className="grid grid-cols-2 gap-2.5">
        {/* 外出耐性（見立て・補正可） */}
        <CardShell onClick={() => onCardTap?.("outingTolerance")} ariaLabel="外出耐性の補正シートを開く">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-300" />
            <span className="text-[11px] font-medium text-slate-500">{outingTolerance.label}</span>
            <MitateBadge />
          </div>
          <div className={`mt-1 text-sm font-semibold ${outingTolerance.band === "unknown" ? "text-slate-400" : "text-slate-700"}`}>
            {outingTolerance.text}
          </div>
          <EvidenceChips evidence={outingTolerance.evidence} />
        </CardShell>

        {/* 夜の余白（予定由来の事実 — 時間量表示可） */}
        <CardShell>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-indigo-300" />
            <span className="text-[11px] font-medium text-slate-500">{eveningSlack.label}</span>
          </div>
          <div className="mt-1 text-sm font-semibold text-slate-700">{eveningSlack.text}</div>
          <EvidenceChips evidence={eveningSlack.evidence} />
        </CardShell>

        {/* 睡眠（本人入力のみ。偽データ禁止） */}
        <CardShell onClick={() => onCardTap?.("sleep")} ariaLabel="昨夜の眠りを入力する">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-violet-300" />
            <span className="text-[11px] font-medium text-slate-500">{sleep.label}</span>
            {sleep.source === "user_reported" && <HonninBadge />}
          </div>
          <div className={`mt-1 text-sm font-semibold ${sleep.band === "unknown" ? "text-slate-400" : "text-slate-700"}`}>
            {sleep.text}
          </div>
          {sleep.source !== "user_reported" && (
            <div className="mt-1 text-[10px] text-slate-400">タップで教えてください</div>
          )}
        </CardShell>

        {/* 昨日の負荷（前日 facts の事実表示。小バー可・数値なし） */}
        <CardShell>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-300" />
            <span className="text-[11px] font-medium text-slate-500">{yesterdayLoad.label}</span>
          </div>
          <div className={`mt-1 text-sm font-semibold ${yesterdayLoad.band === "unknown" ? "text-slate-400" : "text-slate-700"}`}>
            {YESTERDAY_LOAD_LABEL[yesterdayLoad.band]}
          </div>
          {yesterdayLoad.band !== "unknown" && (
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-amber-300"
                style={{ width: `${BAND_BAR_FRACTION[yesterdayLoad.band] * 100}%` }}
              />
            </div>
          )}
        </CardShell>

        {/* 回復の質（弱導出 or unknown 許容） */}
        <CardShell>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-teal-300" />
            <span className="text-[11px] font-medium text-slate-500">{recoveryQuality.label}</span>
            {recoveryQuality.band !== "unknown" && <MitateBadge />}
          </div>
          <div className={`mt-1 text-sm font-semibold ${recoveryQuality.band === "unknown" ? "text-slate-400" : "text-slate-700"}`}>
            {RECOVERY_QUALITY_LABEL[recoveryQuality.band]}
          </div>
        </CardShell>

        {/* 明日への持ち越し */}
        <CardShell>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-sky-300" />
            <span className="text-[11px] font-medium text-slate-500">{carryOver.label}</span>
            {carryOver.band !== "unknown" && <MitateBadge />}
          </div>
          <div className={`mt-1 text-sm font-semibold ${carryOver.band === "unknown" ? "text-slate-400" : "text-slate-700"}`}>
            {CARRY_OVER_LABEL[carryOver.band]}
          </div>
        </CardShell>
      </div>

      {/* 今日の成立見込み（帯語のみ・横長） */}
      <div className="mt-2.5 rounded-2xl border border-white/90 bg-white/72 p-3 shadow-sm backdrop-blur-sm">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-purple-300" />
          <span className="text-[11px] font-medium text-slate-500">{feasibility.label}</span>
          <MitateBadge />
        </div>
        <div className={`mt-1 text-sm font-semibold ${feasibility.band === "unknown" ? "text-slate-400" : "text-slate-700"}`}>
          {feasibility.band === "unknown" ? UNKNOWN_TEXT : feasibility.text}
        </div>
      </div>
    </section>
  );
}
