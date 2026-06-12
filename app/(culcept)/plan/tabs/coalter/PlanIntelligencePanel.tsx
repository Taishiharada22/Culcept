"use client";

/**
 * PlanIntelligencePanel — CoAlter タブ左側のプラン面
 *
 * 契約 §2「One session, two projections」の **プラン側射影**。
 * 構成（reference overlay = over.png の構図をコードで再構築）:
 *   1. 地図プレビュー + 統計（移動合計 / 予定の余裕ゲージ / 想定帰宅）
 *   2. 共有コンディション chips
 *   3. 候補プラン 2-3 案（ミニ地図 + タグ + stats + 「この案をベースに調整」）
 *   4. おすすめの調整（効果プレビュー付き増分編集・適用は local state のみ）
 *
 * fixture data のみ。fetch / DB / backend 接続なし。
 */

import {
  candidateLetter,
  deriveDisplayStats,
  type AdjustmentSuggestionFixture,
  type CoAlterPlanSessionFixture,
  type PlanCandidateFixture,
  type SharedConditionFixture,
} from "./coalterPlanSessionFixture";
import {
  CheckIcon,
  ChevronRightIcon,
  ClockIcon,
  ConditionKindIcon,
  LeafIcon,
  WalkIcon,
  YenIcon,
} from "./coalterIcons";
import { RoutePreviewMap } from "./RoutePreviewMap";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const SLACK_META: Record<
  PlanCandidateFixture["stats"]["slack"],
  { label: string; ratio: number; bar: string }
> = {
  roomy: { label: "ゆとりあり", ratio: 0.85, bar: "from-emerald-400 to-sky-400" },
  normal: { label: "ふつう", ratio: 0.55, bar: "from-sky-400 to-violet-400" },
  tight: { label: "タイト", ratio: 0.3, bar: "from-amber-400 to-rose-400" },
};

const CONDITION_ICON_TONE: Record<SharedConditionFixture["kind"], string> = {
  mobility: "text-indigo-500",
  time: "text-sky-500",
  place_quality: "text-teal-500",
  budget: "text-slate-500",
  pace: "text-violet-500",
  other: "text-slate-400",
};

export interface PlanIntelligencePanelProps {
  readonly session: CoAlterPlanSessionFixture;
  readonly selectedCandidateId: string;
  readonly onSelectCandidate: (candidateId: string) => void;
  readonly appliedAdjustmentIds: ReadonlySet<string>;
  readonly onToggleAdjustment: (adjustmentId: string) => void;
  /** 「この案で進める」確定済みの候補（local state・stage 投影） */
  readonly confirmedCandidateId: string | null;
}

export function PlanIntelligencePanel({
  session,
  selectedCandidateId,
  onSelectCandidate,
  appliedAdjustmentIds,
  onToggleAdjustment,
  confirmedCandidateId,
}: PlanIntelligencePanelProps) {
  const selected =
    session.candidates.find((c) => c.id === selectedCandidateId) ?? session.candidates[0];
  const appliedAdjustments = session.adjustments.filter((a) => appliedAdjustmentIds.has(a.id));
  const display = deriveDisplayStats(selected, appliedAdjustments);
  const slack = SLACK_META[selected.stats.slack];
  const visibleAdjustments = session.adjustments.filter((a) => a.appliesTo === selected.id);

  return (
    <section
      aria-label="プランインテリジェンス"
      className="flex h-full flex-col rounded-3xl border border-slate-200/70 bg-white p-4 shadow-sm sm:p-5"
    >
      <h2 className="text-sm font-bold text-slate-900">プランインテリジェンス</h2>

      {/* ── 地図 + 統計 ── */}
      <div className="mt-3 flex flex-col gap-3 sm:flex-row">
        <div className="h-52 min-w-0 flex-1 overflow-hidden rounded-2xl border border-slate-200/60 sm:h-64">
          <RoutePreviewMap
            nodes={selected.route.nodes}
            variant="hero"
            areaLabels={session.areaLabels}
          />
        </div>
        <div className="flex shrink-0 flex-row gap-3 rounded-2xl border border-slate-200/60 bg-white p-4 sm:w-44 sm:flex-col sm:justify-between">
          <div className="min-w-0 flex-1 sm:flex-none">
            <p className="text-[11px] text-slate-500">{session.statLabels.distance}</p>
            <p className="mt-0.5 text-lg font-bold tracking-tight text-slate-900">
              {display.walkKm.toFixed(1)} km
            </p>
            <p className="text-[11px] text-slate-400">{session.statLabels.distanceSub}</p>
          </div>
          <div className="min-w-0 flex-1 border-slate-100 sm:flex-none sm:border-t sm:pt-3">
            <p className="text-[11px] text-slate-500">{session.statLabels.slack}</p>
            <p className="mt-0.5 text-base font-bold text-slate-900">{slack.label}</p>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full bg-gradient-to-r ${slack.bar}`}
                style={{ width: `${Math.round(slack.ratio * 100)}%` }}
              />
            </div>
          </div>
          <div className="min-w-0 flex-1 border-slate-100 sm:flex-none sm:border-t sm:pt-3">
            <p className="text-[11px] text-slate-500">{session.statLabels.eta}</p>
            <p className="mt-0.5 text-lg font-bold tracking-tight text-slate-900">
              {display.returnEta}
              <span className="ml-1 text-[11px] font-medium text-slate-400">頃</span>
            </p>
            {display.costPct !== 0 && (
              <p className="text-[11px] font-medium text-emerald-600">
                コスト {Math.abs(display.costPct)}% {display.costPct < 0 ? "減" : "増"}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── 共有コンディション ── */}
      <h3 className="mt-5 text-xs font-bold text-slate-900">共有コンディション</h3>
      <div className="mt-2 flex flex-wrap gap-2">
        {session.conditions.map((condition) => (
          <ConditionChip key={condition.id} condition={condition} />
        ))}
      </div>

      {/* ── 候補プラン ── */}
      <div className="mt-5 flex items-center gap-2">
        <h3 className="text-xs font-bold text-slate-900">候補プラン</h3>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
          CoAlter が複数案を提案中
        </span>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {session.candidates.map((candidate) => (
          <CandidateCard
            key={candidate.id}
            candidate={candidate}
            isSelected={candidate.id === selected.id}
            isConfirmed={candidate.id === confirmedCandidateId}
            appliedAdjustments={appliedAdjustments}
            onSelect={() => onSelectCandidate(candidate.id)}
          />
        ))}
      </div>

      {/* ── おすすめの調整（効果プレビュー付き） ── */}
      <h3 className="mt-5 text-xs font-bold text-slate-900">おすすめの調整</h3>
      {visibleAdjustments.length === 0 ? (
        <p className="mt-2 text-[11px] text-slate-400">
          案{candidateLetter(session.candidates.findIndex((c) => c.id === selected.id))}
          への調整候補はまだありません
        </p>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {visibleAdjustments.map((adjustment) => (
            <AdjustmentCard
              key={adjustment.id}
              adjustment={adjustment}
              isApplied={appliedAdjustmentIds.has(adjustment.id)}
              onToggle={() => onToggleAdjustment(adjustment.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function ConditionChip({
  condition,
  size = "md",
}: {
  condition: SharedConditionFixture;
  size?: "md" | "sm";
}) {
  const tint =
    condition.kind === "place_quality"
      ? "border-teal-100 bg-teal-50/70"
      : "border-slate-200 bg-white";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium text-slate-700 ${tint} ${
        size === "md" ? "px-3 py-1.5 text-xs" : "px-2.5 py-1 text-[11px]"
      }`}
    >
      <ConditionKindIcon
        kind={condition.kind}
        size={size === "md" ? 13 : 12}
        className={CONDITION_ICON_TONE[condition.kind]}
      />
      {condition.label}
    </span>
  );
}

// チャット側の要約 block と共用（同一 session の2射影）
export { ConditionChip };

function CandidateCard({
  candidate,
  isSelected,
  isConfirmed,
  appliedAdjustments,
  onSelect,
}: {
  candidate: PlanCandidateFixture;
  isSelected: boolean;
  isConfirmed: boolean;
  appliedAdjustments: readonly AdjustmentSuggestionFixture[];
  onSelect: () => void;
}) {
  const display = deriveDisplayStats(candidate, appliedAdjustments);
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`relative cursor-pointer rounded-2xl border p-3 transition-all ${
        isSelected
          ? "border-violet-300 bg-violet-50/40 shadow-sm ring-1 ring-violet-200"
          : "border-slate-200 bg-white hover:border-slate-300"
      }`}
    >
      {candidate.recommended && (
        <span className="absolute -top-2.5 left-3 rounded-full bg-gradient-to-r from-amber-400 to-orange-400 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
          おすすめ
        </span>
      )}
      {isConfirmed && (
        <span className="absolute -top-2.5 right-3 inline-flex items-center gap-0.5 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
          <CheckIcon size={10} />
          進行中
        </span>
      )}
      <div className="h-20 overflow-hidden rounded-xl border border-slate-200/50">
        <RoutePreviewMap nodes={candidate.route.nodes} variant="mini" />
      </div>
      <p className="mt-2 text-[13px] font-bold leading-snug text-slate-900">{candidate.title}</p>
      <div className="mt-1.5 flex flex-wrap gap-1">
        <span className="rounded-full bg-violet-100/80 px-2 py-0.5 text-[10px] font-medium text-violet-700">
          {candidate.tags[0]}
        </span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
          {candidate.tags[1]}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1">
          <WalkIcon size={11} className="text-slate-400" />
          徒歩 {display.walkKm.toFixed(1)}km
        </span>
        <span className="inline-flex items-center font-medium text-slate-600">
          <YenIcon size={10} className="text-slate-400" />
          {"¥".repeat(candidate.stats.budgetBand)}
        </span>
        <span className="inline-flex items-center gap-1">
          <ClockIcon size={11} className="text-slate-400" />
          {display.returnEta} 頃
        </span>
      </div>
      <span
        className={`mt-2.5 inline-flex w-full items-center justify-center gap-1 rounded-xl py-1.5 text-xs font-medium transition-colors ${
          isSelected
            ? "bg-violet-100 text-violet-700"
            : "bg-slate-50 text-slate-600"
        }`}
      >
        この案をベースに調整
        <ChevronRightIcon size={11} />
      </span>
    </div>
  );
}

const ADJUSTMENT_ICON_META: Record<
  AdjustmentSuggestionFixture["icon"],
  { tile: string; render: (size: number) => React.ReactElement }
> = {
  route: {
    tile: "bg-emerald-50 text-emerald-600",
    render: (size) => <LeafIcon size={size} />,
  },
  time: {
    tile: "bg-teal-50 text-teal-600",
    render: (size) => <ClockIcon size={size} />,
  },
  budget: {
    tile: "bg-amber-50 text-amber-600",
    render: (size) => <YenIcon size={size} />,
  },
};

function AdjustmentCard({
  adjustment,
  isApplied,
  onToggle,
}: {
  adjustment: AdjustmentSuggestionFixture;
  isApplied: boolean;
  onToggle: () => void;
}) {
  const iconMeta = ADJUSTMENT_ICON_META[adjustment.icon];
  return (
    <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-3">
      <div className="flex items-start gap-2">
        <span
          className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconMeta.tile}`}
        >
          {iconMeta.render(15)}
        </span>
        <div className="min-w-0">
          <p className="text-xs font-bold leading-snug text-slate-900">{adjustment.label}</p>
          <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{adjustment.detail}</p>
        </div>
      </div>
      <div className="mt-2.5 flex justify-end">
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={isApplied}
          className={`inline-flex items-center gap-1 rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
            isApplied
              ? "bg-violet-600 text-white"
              : "border border-slate-200 text-slate-600 hover:bg-slate-50"
          }`}
        >
          {isApplied && <CheckIcon size={11} />}
          {isApplied ? "適用済み" : "適用"}
        </button>
      </div>
    </div>
  );
}
