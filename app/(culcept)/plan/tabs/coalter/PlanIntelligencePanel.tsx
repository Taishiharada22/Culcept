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
  CloseIcon,
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
  /** プラン側は完全に畳める（CEO ③）。ピンチのアクセシブルな代替操作 */
  readonly onCollapse: () => void;
  /** ドック状態（ピンチで極小化）からタップで既定幅へ戻す */
  readonly onExpand: () => void;
  /**
   * 面の見せ方（CEO 2026-06-21）:
   *   - "solid"（既定）= 白いパネル（従来）。
   *   - "floating" = **地（背景）を透過**し、各情報カードがフロスト気味に浮かぶ。
   *     チャットが隙間から自然に見え隠れする overlay 用。中身/構成は不変・容器の chrome のみ。
   */
  readonly surface?: "solid" | "floating";
  /** overlay が自前のヘッダ（ドラッグ/閉じる）を持つ場合、パネル内ヘッダを隠す（既定 true）。 */
  readonly showHeader?: boolean;
}

export function PlanIntelligencePanel({
  session,
  selectedCandidateId,
  onSelectCandidate,
  appliedAdjustmentIds,
  onToggleAdjustment,
  confirmedCandidateId,
  onCollapse,
  onExpand,
  surface = "solid",
  showHeader = true,
}: PlanIntelligencePanelProps) {
  const floating = surface === "floating";
  const selected =
    session.candidates.find((c) => c.id === selectedCandidateId) ?? session.candidates[0];
  const appliedAdjustments = session.adjustments.filter((a) => appliedAdjustmentIds.has(a.id));
  const display = deriveDisplayStats(selected, appliedAdjustments);
  const slack = SLACK_META[selected.stats.slack];
  const visibleAdjustments = session.adjustments.filter((a) => a.appliesTo === selected.id);

  // ── floating（Talk overlay・mobile 固定幅）= talk.png 準拠の **コンパクト構図** ──
  //   地図 → 横3列 stat → 共有コンディション chips → 候補プラン横スクロール。
  //   各枠は白カードとして overlay のフロスト面に「浮かび上がる」（CEO 2026-06-21）。
  if (floating) {
    return (
      <section
        aria-label="プランインテリジェンス"
        className="flex h-full min-h-0 flex-col overflow-hidden bg-transparent"
      >
        <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-contain px-3 pb-2 pt-0.5">
          {/* ── 地図（浮かぶ白カード） ── */}
          <div className="h-28 overflow-hidden rounded-2xl bg-white shadow-[0_4px_16px_rgba(15,23,42,0.08)] ring-1 ring-white/80">
            <RoutePreviewMap
              nodes={selected.route.nodes}
              variant="hero"
              areaLabels={session.areaLabels}
            />
          </div>

          {/* ── 横3列の stat（移動 / 着予定 / 予定の余裕） ── */}
          <div className="grid grid-cols-3 rounded-2xl bg-white py-2.5 shadow-[0_4px_16px_rgba(15,23,42,0.08)] ring-1 ring-white/80">
            <FloatingStat
              icon={<WalkIcon size={11} className="text-emerald-500" />}
              label="移動"
              value={`${display.walkKm.toFixed(1)} km`}
              sub={session.statLabels.distanceSub}
            />
            <FloatingStat
              divided
              icon={<ClockIcon size={11} className="text-sky-500" />}
              label="着予定"
              value={`${display.returnEta}着`}
            />
            <FloatingStat
              divided
              icon={<CheckIcon size={11} className="text-violet-500" />}
              label={session.statLabels.slack}
              value={slack.label}
            />
          </div>

          {/* ── 共有コンディション ── */}
          <div>
            <h3 className="px-0.5 text-[11px] font-bold text-slate-700">共有コンディション</h3>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {session.conditions.map((condition) => (
                <ConditionChip key={condition.id} condition={condition} size="sm" />
              ))}
            </div>
          </div>

          {/* ── 候補プラン（横スクロール・各カードが浮かぶ） ── */}
          <div>
            <div className="flex items-center justify-between px-0.5">
              <h3 className="text-[11px] font-bold text-slate-700">候補プラン</h3>
              <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-violet-500">
                すべてのプランを見る
                <ChevronRightIcon size={10} />
              </span>
            </div>
            <div className="-mx-3 mt-1.5 flex gap-2 overflow-x-auto px-3 pb-1">
              {session.candidates.map((candidate) => (
                <FloatingCandidateCard
                  key={candidate.id}
                  candidate={candidate}
                  isSelected={candidate.id === selected.id}
                  isConfirmed={candidate.id === confirmedCandidateId}
                  appliedAdjustments={appliedAdjustments}
                  onSelect={() => onSelectCandidate(candidate.id)}
                />
              ))}
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label="プランインテリジェンス"
      className={`@container flex h-full min-h-0 flex-col overflow-hidden rounded-3xl ${
        floating
          ? // 地は透明（フロストは overlay が提供）。白い各カードが overlay のフロスト面に浮かぶ。
            "bg-transparent"
          : "border border-slate-200/70 bg-white shadow-sm"
      }`}
    >
      {/* ── ドック面（ピンチで極小化した時のみ・タップで既定幅へ復帰） ── */}
      <button
        type="button"
        onClick={onExpand}
        aria-label="プランを広げる"
        className="flex h-full w-full flex-col items-center justify-end gap-1.5 p-2 @min-[120px]:hidden"
      >
        <span className="h-14 w-full overflow-hidden rounded-xl border border-slate-200/60">
          <RoutePreviewMap nodes={selected.route.nodes} variant="mini" />
        </span>
        <span className="text-[10px] font-bold text-slate-600">プラン</span>
      </button>

      {/* ── パネルヘッダ（pinned）: タイトル + たたむ。overlay 時は showHeader=false で非表示 ── */}
      <div className={`${showHeader ? "hidden @min-[120px]:flex" : "hidden"} shrink-0 items-center justify-between gap-2 px-3.5 pb-1 pt-3 @xl:px-5 @xl:pt-4`}>
        <h2 className="min-w-0 truncate text-[13px] font-bold text-slate-900 @xl:text-sm">
          プランインテリジェンス
        </h2>
        <button
          type="button"
          onClick={onCollapse}
          aria-label="プランをたたむ"
          className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 shadow-sm transition-colors hover:text-slate-600"
        >
          <CloseIcon size={10} />
        </button>
      </div>

      {/* ── 本文（内部スクロール＝1画面フィット・CEO ③） ── */}
      <div className="hidden min-h-0 flex-1 overflow-y-auto overscroll-contain px-3.5 pb-3.5 @min-[120px]:block @xl:px-5 @xl:pb-5">
        {/* ── 地図 + 統計 ── */}
        <div className="mt-2 flex flex-col gap-3 @xl:flex-row">
          <div className="h-40 min-w-0 flex-1 overflow-hidden rounded-2xl border border-slate-200/60 @lg:h-52 @3xl:h-64">
            <RoutePreviewMap
              nodes={selected.route.nodes}
              variant="hero"
              areaLabels={session.areaLabels}
            />
          </div>
          <div className="flex shrink-0 flex-col gap-3 rounded-2xl border border-slate-200/60 bg-white p-3 @md:flex-row @xl:w-44 @xl:flex-col @xl:justify-between @xl:p-4">
            <div className="min-w-0 flex-1 @xl:flex-none">
              <p className="text-[11px] text-slate-500">{session.statLabels.distance}</p>
              <p className="mt-0.5 text-lg font-bold tracking-tight text-slate-900">
                {display.walkKm.toFixed(1)} km
              </p>
              <p className="text-[11px] text-slate-400">{session.statLabels.distanceSub}</p>
            </div>
            <div className="min-w-0 flex-1 border-slate-100 @xl:flex-none @xl:border-t @xl:pt-3">
              <p className="text-[11px] text-slate-500">{session.statLabels.slack}</p>
              <p className="mt-0.5 text-base font-bold text-slate-900">{slack.label}</p>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full bg-gradient-to-r ${slack.bar}`}
                  style={{ width: `${Math.round(slack.ratio * 100)}%` }}
                />
              </div>
            </div>
            <div className="min-w-0 flex-1 border-slate-100 @xl:flex-none @xl:border-t @xl:pt-3">
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
        <h3 className="mt-4 text-xs font-bold text-slate-900 @xl:mt-5">共有コンディション</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {session.conditions.map((condition) => (
            <ConditionChip key={condition.id} condition={condition} />
          ))}
        </div>

        {/* ── 候補プラン ── */}
        <div className="mt-4 flex flex-wrap items-center gap-2 @xl:mt-5">
          <h3 className="text-xs font-bold text-slate-900">候補プラン</h3>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
            CoAlter が複数案を提案中
          </span>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 @2xl:grid-cols-3">
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
        <h3 className="mt-4 text-xs font-bold text-slate-900 @xl:mt-5">おすすめの調整</h3>
        {visibleAdjustments.length === 0 ? (
          <p className="mt-2 text-[11px] text-slate-400">
            案{candidateLetter(session.candidates.findIndex((c) => c.id === selected.id))}
            への調整候補はまだありません
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-3 @2xl:grid-cols-3">
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
      </div>
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

// ── floating overlay 専用の compact 部品（talk.png 準拠） ──

function FloatingStat({
  icon,
  label,
  value,
  sub,
  divided,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  divided?: boolean;
}) {
  return (
    <div className={`px-2.5 ${divided ? "border-l border-slate-100" : ""}`}>
      <p className="flex items-center gap-1 text-[10px] font-medium text-slate-400">
        {icon}
        <span className="truncate">{label}</span>
      </p>
      <p className="mt-1 truncate text-[15px] font-bold leading-none tracking-tight text-slate-900">
        {value}
      </p>
      {sub && <p className="mt-1 truncate text-[10px] text-slate-400">{sub}</p>}
    </div>
  );
}

function FloatingCandidateCard({
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
    <button
      type="button"
      aria-pressed={isSelected}
      onClick={onSelect}
      className={`relative w-[150px] shrink-0 rounded-2xl bg-white p-2 text-left shadow-[0_4px_16px_rgba(15,23,42,0.08)] transition-all ${
        isSelected ? "ring-2 ring-violet-300" : "ring-1 ring-white/80 hover:ring-slate-200"
      }`}
    >
      <div className="h-16 overflow-hidden rounded-xl ring-1 ring-slate-100">
        <RoutePreviewMap nodes={candidate.route.nodes} variant="mini" />
      </div>
      {candidate.recommended && (
        <span className="absolute left-3 top-3 rounded-full bg-gradient-to-r from-amber-400 to-orange-400 px-1.5 py-0.5 text-[9px] font-bold text-white shadow-sm">
          おすすめ
        </span>
      )}
      {isConfirmed && (
        <span className="absolute right-3 top-3 inline-flex items-center gap-0.5 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[9px] font-bold text-white shadow-sm">
          <CheckIcon size={9} />
          進行中
        </span>
      )}
      <p className="mt-1.5 truncate text-[11px] font-bold leading-snug text-slate-900">
        {candidate.title}
      </p>
      <div className="mt-1 flex gap-1">
        <span className="truncate rounded-full bg-violet-100/80 px-1.5 py-0.5 text-[9px] font-medium text-violet-700">
          {candidate.tags[0]}
        </span>
        <span className="truncate rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium text-slate-600">
          {candidate.tags[1]}
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-2 text-[10px] text-slate-500">
        <span className="inline-flex items-center gap-0.5">
          <WalkIcon size={10} className="text-slate-400" />
          {display.walkKm.toFixed(1)}km
        </span>
        <span className="inline-flex items-center text-slate-600">
          <YenIcon size={9} className="text-slate-400" />
          {"¥".repeat(candidate.stats.budgetBand)}
        </span>
        <span className="inline-flex items-center gap-0.5">
          <ClockIcon size={10} className="text-slate-400" />
          {display.returnEta}
        </span>
      </div>
    </button>
  );
}

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
