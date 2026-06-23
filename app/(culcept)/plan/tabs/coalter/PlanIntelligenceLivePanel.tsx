"use client";

/**
 * C6-A-1 — Plan Intelligence Live パネル（**engine 駆動・display-safe・flag ON 時のみ**）
 *
 * 役割: `buildPlanIntelligenceLiveVM` の VM を、CoAlter overlay の floating 面に描画する。
 *   主役は **合意形成知性**: 5 角度の提案 / 各案が 2 人にどう適合・衝突するか / なぜこの案か /
 *   今回外した案とその理由 / 不確実性 / 決めるための確認・質問。
 *
 * honest（捏造ゼロ）:
 *   - 距離 / 経路 / 到着時刻は engine が持たない（solver 未実装）→ 地図/距離を描かず「場所が決まると算出」と明示。
 *   - private（本人 rationale）は VM が型レベルで持たない＝表示不能（M5）。
 *   - glass/overlay の世界観は floating fixture パネルを踏襲（CEO 2026-06-21）。
 */

import type { FitLabel } from "@/lib/shared/travel/proposal-types";
import type {
  CandidateVM,
  ConflictForecastVM,
  MomentSurfaceVM,
  PersonalizationReadoutVM,
  PlanIntelligenceLiveReadyVM,
  PlanIntelligenceLiveVM,
} from "./planIntelligenceLiveViewModel";
import { CheckIcon, ChevronRightIcon } from "./coalterIcons";

const CARD = "rounded-2xl bg-white shadow-[0_4px_16px_rgba(15,23,42,0.08)] ring-1 ring-white/80";
const CHIP =
  "inline-flex rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 shadow-sm ring-1 ring-slate-200/60";

const FIT_TONE: Record<FitLabel, string> = {
  fit: "bg-emerald-50 text-emerald-600 ring-emerald-200/70",
  stretch: "bg-amber-50 text-amber-600 ring-amber-200/70",
  conflict: "bg-rose-50 text-rose-600 ring-rose-200/70",
};

function FitBadge({ kind, label, fit }: { kind: string; label: string; fit: FitLabel }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${FIT_TONE[fit]}`}>
      {kind}: {label}
    </span>
  );
}

function LiveCandidateCard({ c }: { c: CandidateVM }) {
  return (
    <div className={`w-56 shrink-0 ${CARD} p-3`}>
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 px-2 py-0.5 text-[10px] font-bold text-white">
          {c.angleLabel}
        </span>
        {c.recommended && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-gradient-to-r from-amber-400 to-orange-400 px-2 py-0.5 text-[10px] font-bold text-white">
            <CheckIcon size={9} /> おすすめ
          </span>
        )}
      </div>
      <h4 className="mt-1.5 text-sm font-bold text-slate-800">{c.title}</h4>
      {c.why && <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{c.why}</p>}
      <div className="mt-2 flex flex-wrap gap-1">
        <FitBadge kind="ペース" label={c.paceFitLabel} fit={c.paceFit} />
        <FitBadge kind="移動" label={c.mobilityFitLabel} fit={c.mobilityFit} />
      </div>
      {c.softMatchLabels.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {c.softMatchLabels.map((s) => (
            <span key={s} className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
              #{s}
            </span>
          ))}
        </div>
      )}
      <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400">
        <span>{c.area}</span>
        <span>{c.uncertaintyLabel}</span>
      </div>
      {c.budgetBandLabel && <div className="mt-0.5 text-[10px] text-slate-400">予算 {c.budgetBandLabel}</div>}
      {c.missingLabels.length > 0 && (
        <div className="mt-1 text-[10px] text-amber-600">未定: {c.missingLabels.join("・")}</div>
      )}
    </div>
  );
}

function PersonalizationCard({ p }: { p: PersonalizationReadoutVM }) {
  return (
    <div className={`${CARD} p-3`}>
      <div className="flex items-center gap-1.5">
        <span className={CHIP}>あなたの観測</span>
        {p.demo && (
          <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-400 ring-1 ring-slate-200/60">
            デモ
          </span>
        )}
      </div>
      {p.selfReadout.length > 0 && (
        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-600">
          あなたは<span className="font-bold text-violet-600">{p.selfReadout.join("・")}</span>
        </p>
      )}
      {p.pairReadout.length > 0 && (
        <div className="mt-2 border-t border-slate-100 pt-2">
          <span className="text-[10px] font-bold text-slate-400">お二人の噛み合わせ</span>
          <ul className="mt-1 space-y-1">
            {p.pairReadout.map((line, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[11px] leading-relaxed text-slate-600">
                <ChevronRightIcon size={11} className="mt-0.5 shrink-0 text-rose-300" />
                {line}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ConflictForecastCard({ f }: { f: ConflictForecastVM }) {
  return (
    <div className={`${CARD} p-3`}>
      <div className="flex items-center gap-1.5">
        <span className={CHIP}>先にすり合わせたい点</span>
        {f.demo && (
          <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-400 ring-1 ring-slate-200/60">
            デモ
          </span>
        )}
      </div>
      <ul className="mt-2 space-y-2">
        {f.items.map((item, i) => (
          <li key={i} className="rounded-xl bg-slate-50/80 p-2.5 ring-1 ring-slate-200/50">
            <div className="flex items-center gap-1.5">
              <span className="inline-flex rounded-full bg-gradient-to-r from-rose-400 to-orange-400 px-2 py-0.5 text-[10px] font-bold text-white">
                {item.decisionLabel}
              </span>
              <span className="text-[11px] leading-relaxed text-slate-600">{item.tension}</span>
            </div>
            <div className="mt-1.5 flex items-start gap-1.5">
              <CheckIcon size={11} className="mt-0.5 shrink-0 text-emerald-400" />
              <span className="text-[11px] leading-relaxed text-slate-500">{item.bridge}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MomentSurfaceCard({ m }: { m: MomentSurfaceVM }) {
  return (
    <div className={`${CARD} border-l-4 border-sky-300 p-3`}>
      <div className="flex items-center gap-1.5">
        <span className={CHIP}>当日のサポート</span>
        {m.demo && (
          <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-400 ring-1 ring-slate-200/60">
            デモ
          </span>
        )}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-sm font-bold text-sky-500">{m.timeLabel}</span>
        <span className="text-[11px] text-slate-500">{m.momentLabel}</span>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-slate-700">{m.nudge}</p>
    </div>
  );
}

function ReadyView({ vm }: { vm: PlanIntelligenceLiveReadyVM }) {
  return (
    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-1 pb-2 pt-0.5">
      {/* CoAlter の見立て（おすすめ理由・次の一手） */}
      <div className={`${CARD} p-3`}>
        <div className="flex items-center gap-1.5">
          <span className={CHIP}>CoAlter の見立て</span>
          <span className="text-[10px] text-slate-400">{vm.decision.nextActionLabel}</span>
        </div>
        {vm.decision.why && <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{vm.decision.why}</p>}
      </div>

      {/* あなたの観測 + 2 人の一致点（S2 personalization・demo 明示） */}
      {vm.personalization && <PersonalizationCard p={vm.personalization} />}

      {/* 先にすり合わせたい点（S3-1 衝突先回り・摩擦順・橋渡し付き・demo 明示） */}
      {vm.conflictForecast && <ConflictForecastCard f={vm.conflictForecast} />}

      {/* 当日のサポート（S3-2 Moment surface・次の負荷を先回りケア・demo 明示） */}
      {vm.momentSurface && <MomentSurfaceCard m={vm.momentSurface} />}

      {/* 候補プラン（角度別・横スクロール） */}
      <div>
        <h3 className={CHIP}>候補プラン</h3>
        <div className="-mx-1 mt-1.5 flex gap-2 overflow-x-auto px-1 pb-1">
          {vm.candidates.length > 0 ? (
            vm.candidates.map((c) => <LiveCandidateCard key={c.candidateId} c={c} />)
          ) : (
            <p className="px-1 text-[11px] text-slate-400">条件を満たす案がまだありません。</p>
          )}
        </div>
      </div>

      {/* 決めるために（確認・質問） */}
      {(vm.confirmations.length > 0 || vm.questions.length > 0) && (
        <div className={`${CARD} p-3`}>
          <span className={CHIP}>決めるために</span>
          <ul className="mt-1.5 space-y-1">
            {vm.questions.map((q, i) => (
              <li key={`q${i}`} className="flex items-start gap-1.5 text-[11px] text-slate-600">
                <ChevronRightIcon size={11} className="mt-0.5 shrink-0 text-violet-400" />
                {q.label}
              </li>
            ))}
            {vm.confirmations.map((c, i) => (
              <li key={`c${i}`} className="flex items-start gap-1.5 text-[11px] text-slate-600">
                <CheckIcon size={11} className="mt-0.5 shrink-0 text-sky-400" />
                {c.label}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 気をつける点（リスク） */}
      {vm.risks.length > 0 && (
        <div>
          <h3 className={CHIP}>気をつける点</h3>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {vm.risks.map((r, i) => (
              <span
                key={i}
                className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-700 ring-1 ring-amber-200/70"
              >
                {r.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 今回外した案（なぜ選ばなかったか・透明性） */}
      {vm.rejected.length > 0 && (
        <div>
          <h3 className={CHIP}>今回は外した案</h3>
          <div className="mt-1.5 space-y-1">
            {vm.rejected.map((r, i) => (
              <div key={i} className="text-[10px] text-slate-400">
                <span className="font-bold text-slate-500">{r.angleLabel}</span>：{r.reason}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 物理未確定（地図/距離の代わり・honest） */}
      <div className="rounded-2xl bg-slate-50 px-3 py-2 text-[10px] leading-relaxed text-slate-400 ring-1 ring-slate-200/60">
        {vm.physical.note}
      </div>
    </div>
  );
}

export function PlanIntelligenceLivePanel({ vm }: { vm: PlanIntelligenceLiveVM }) {
  return (
    <section aria-label="プランインテリジェンス" className="flex h-full min-h-0 flex-col bg-transparent">
      {vm.status === "ready" && <ReadyView vm={vm} />}
      {vm.status === "needs_input" && (
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-1 pb-2 pt-0.5">
          <div className={`${CARD} p-3`}>
            <span className={CHIP}>まず教えてください</span>
            <ul className="mt-1.5 space-y-1">
              {vm.asks.map((a, i) => (
                <li key={i} className="flex items-start gap-1.5 text-[11px] text-slate-600">
                  <ChevronRightIcon size={11} className="mt-0.5 shrink-0 text-violet-400" />
                  {a.label}を決めましょう
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {vm.status === "unavailable" && (
        <div className="flex h-full items-center justify-center px-4 text-center text-[11px] text-slate-400">
          いま提案を準備できませんでした。
        </div>
      )}
    </section>
  );
}
