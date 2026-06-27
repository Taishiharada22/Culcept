"use client";

/**
 * components/plan/map/MobilityLegCard.tsx — leg tap で開く移動手段カード (FH から忠実復元)。
 * mode chips(squircle/active色) / recall「前回」/ readOnly(過去=実績) / 所要時間「目安」パネル(乗換数)。
 *   ★推薦しない・偽数字なし(取れなければ「—」)・距離→mode 推定なし。
 */
import { useState } from "react";
import {
  ROUTE_MODE_COLORS, MOBILITY_MAIN_MODES, MOBILITY_LIMITED_MODES, MOBILITY_MODE_META,
  mobilitySquircleDataUri, type RouteTransportMode,
} from "@/lib/plan/map/routeMode";
import type { LegDurState, LegInfo } from "@/lib/plan/map/directionsService";
import type { ExplanationCopy } from "@/lib/plan/mobility/explanationCopy";
import { MOBILITY_REASONS, MOBILITY_REASON_LABELS, type MobilityReason } from "@/lib/plan/mobility/hypothesisFeedbackStore";

export interface MobilityLegCardProps {
  legKey: string;
  fromTitle: string;
  toTitle: string;
  selectedMode: RouteTransportMode | null;
  recallMode?: RouteTransportMode | null;
  /** v0-D: 「今日のあなたなら」仮説 copy（v0-C 生成・surface 時のみ描画・未指定/null は従来同等） */
  hypothesisCopy?: ExplanationCopy | null;
  /** 所要時間/乗換数 (= client DirectionsService の実測。推薦せず判断材料・偽数字なし) */
  durations?: LegDurState | null;
  readOnly: boolean;
  onSelect: (legKey: string, mode: RouteTransportMode) => void;
  onClose: () => void;
  /**
   * ★A0 理由観測: explicitCorrection（仮説と違う選択）時だけ MapTab が true。
   * inline chip 行を出す（任意・可逆・dismissible・modal でない）。readOnly では出さない。
   */
  reasonPromptVisible?: boolean;
  /** 現在保存済の reason（chip の active 表示・collapse 兼用）。 */
  selectedReason?: MobilityReason | null;
  onReasonSelect?: (legKey: string, reason: MobilityReason) => void;
  onReasonDismiss?: () => void;
  /**
   * ★A0-2 reason reflection: established insight の時だけ MapTab が 1 行 copy を渡す（null=沈黙）。
   * 観測の穏やかな反映（仮説トーン・per-leg・trait でない）。reason chip とは別。readOnly では出さない。
   */
  reasonReflection?: string | null;
  /**
   * ★Movement Tolerance reason-only（CEO 2026-06-09・flag OFF/dev-only）: 移動耐性の観測 1 行（null=沈黙）。
   * read-only（mode/ranking/friction を変えない）・観測トーン・trait でない（copy は pure helper 由来）。readOnly では出さない。
   */
  movementToleranceReason?: string | null;
  /**
   * ★Energy Rhythm reason-only（CEO 2026-06-09・flag OFF/dev-only）: 活動時間帯の観測 1 行（null=沈黙）。
   * read-only・観測トーン・trait（朝型/夜型）でない。★movementToleranceReason がある時は出さない（AT MOST 1 行）。readOnly では出さない。
   */
  energyRhythmReason?: string | null;
  /**
   * ★A1-6a 手動ログ: この区間の「実際の所要（分）」。記録済なら数値・未記録は null。
   * onLogActual 不在 or readOnly では affordance を出さない（任意・GPS 不要・MapTab が sensitive 等を除外して渡す）。
   */
  loggedActualMin?: number | null;
  onLogActual?: (legKey: string, actualDurationMin: number) => void;
  onClearActual?: (legKey: string) => void;
}

export function MobilityLegCard({
  legKey, fromTitle, toTitle, selectedMode, recallMode, durations, readOnly, onSelect, onClose, hypothesisCopy,
  reasonPromptVisible = false, selectedReason = null, onReasonSelect, onReasonDismiss, reasonReflection = null,
  movementToleranceReason = null, energyRhythmReason = null,
  loggedActualMin = null, onLogActual, onClearActual,
}: MobilityLegCardProps) {
  // ★A0-2: reflection の軽い dismiss（local state のみ・永続化しない・leg ごとに key で reset）。
  const [reflectionDismissed, setReflectionDismissed] = useState(false);
  // ★A1-6a: 手動ログ入力の開閉 + 値（local state のみ・永続化は MapTab の store）。
  const [logOpen, setLogOpen] = useState(false);
  const [logValue, setLogValue] = useState("");
  const logCaptureAvailable = !readOnly && !!onLogActual;
  const chipBg = (mode: RouteTransportMode) => ({
    backgroundImage: `url("${mobilitySquircleDataUri(mode)}")`,
    backgroundSize: "contain",
  });

  const durLine = (label: string, info: LegInfo | null, isTransit = false) => (
    <div className="flex items-baseline justify-between text-sm">
      <span className="text-slate-600">{label}</span>
      {info ? (
        <span className="font-bold text-slate-900">
          {info.minutes}分
          {isTransit && info.transfers != null ? (
            <span className="ml-1 text-[11px] font-medium text-slate-400">乗換{info.transfers}回</span>
          ) : null}
        </span>
      ) : (
        <span className="text-xs text-slate-400">—</span>
      )}
    </div>
  );

  const modeButton = (mode: RouteTransportMode, limited: boolean) => {
    const active = selectedMode === mode;
    const color = ROUTE_MODE_COLORS[mode];
    return (
      <button
        key={mode}
        type="button"
        disabled={readOnly}
        aria-pressed={active}
        onClick={() => onSelect(legKey, mode)}
        className={`relative flex flex-col items-center gap-1 rounded-2xl border-2 px-1 py-2 transition ${readOnly ? "cursor-default" : "hover:bg-slate-50"} ${limited ? "opacity-60" : ""}`}
        style={active ? { borderColor: color, backgroundColor: `${color}14` } : { borderColor: "transparent", backgroundColor: "transparent" }}
      >
        <span aria-hidden className="block h-11 w-11 bg-center bg-no-repeat" style={chipBg(mode)} />
        <span className="text-[11px] font-semibold text-slate-700">{MOBILITY_MODE_META[mode].label}</span>
        {limited && (<span className="absolute right-1 top-1 rounded-md bg-slate-300 px-1 text-[8px] font-bold tracking-wide text-white">β</span>)}
      </button>
    );
  };

  return (
    <div data-testid="mobility-leg-card" className="absolute inset-x-3 bottom-3 z-20">
      <div className="rounded-3xl border border-slate-200/90 bg-white p-4 shadow-[0_18px_50px_-12px_rgba(15,23,42,0.28)]">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-[15px] font-bold text-slate-900">
            {fromTitle} <span className="font-medium text-slate-300">→</span> {toTitle}
          </p>
          <button type="button" onClick={onClose} aria-label="閉じる" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400 hover:bg-slate-200">✕</button>
        </div>
        {/*
         * ★A0-2 reason reflection: established insight の穏やかな 1 行（observation の鏡）。
         * readOnly では出さない・modal/toast でない・小さい inline・1 行・local dismiss。trait/断定でない（copy は pure helper 由来）。
         */}
        {!readOnly && reasonReflection && !reflectionDismissed && (
          <div data-testid="mobility-reason-reflection" className="mt-2 flex items-start gap-2 text-[11px] italic text-slate-400">
            <span className="min-w-0 flex-1">{reasonReflection}</span>
            <button
              type="button"
              aria-label="閉じる"
              onClick={() => setReflectionDismissed(true)}
              className="shrink-0 text-slate-300 hover:text-slate-500"
            >
              ✕
            </button>
          </div>
        )}
        {/*
         * ★Movement Tolerance reason-only（CEO 2026-06-09・flag OFF/dev-only）: 移動耐性の観測 1 行。
         * read-only（mode/ranking/friction を変えない）・小さい inline・1 行・dismiss なし。null/readOnly は沈黙。
         */}
        {!readOnly && movementToleranceReason && (
          <p data-testid="mobility-movement-tolerance" className="mt-2 text-[11px] text-slate-400">
            <span className="text-slate-400">移動のクセ · </span>{movementToleranceReason}
          </p>
        )}
        {/*
         * ★Energy Rhythm reason-only（CEO 2026-06-09・flag OFF/dev-only）: 活動時間帯の観測 1 行。
         * ★movementToleranceReason がある時は出さない（AT MOST 1 行・stacking 回避）。null/readOnly は沈黙。
         */}
        {!readOnly && !movementToleranceReason && energyRhythmReason && (
          <p data-testid="mobility-energy-rhythm" className="mt-2 text-[11px] text-slate-400">
            <span className="text-slate-400">活動の波 · </span>{energyRhythmReason}
          </p>
        )}
        {hypothesisCopy && hypothesisCopy.surface && (
          <div data-testid="mobility-hypothesis" className="mt-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-3.5 py-3">
            {hypothesisCopy.headline && <p className="text-sm font-bold text-slate-800">{hypothesisCopy.headline}</p>}
            {hypothesisCopy.rationale && <p className="mt-1 text-xs text-slate-500">{hypothesisCopy.rationale}</p>}
            {hypothesisCopy.contextNoteText && <p className="mt-1 text-xs text-slate-500">{hypothesisCopy.contextNoteText}</p>}
            {hypothesisCopy.correctionPrompt && <p className="mt-1.5 text-[11px] text-slate-400">{hypothesisCopy.correctionPrompt}</p>}
          </div>
        )}
        {durations && (
          <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-3.5 py-3">
            <div className="text-[11px] font-bold tracking-wide text-slate-500">この区間の移動・所要時間の目安</div>
            {durations.loading ? (
              <p className="mt-2 text-xs text-slate-400">所要時間を計算中…</p>
            ) : (
              <div className="mt-2 space-y-1.5">
                {durLine("徒歩", durations.walk)}
                {durLine("車・タクシー", durations.drive)}
                {durLine("電車・バス", durations.transit, true)}
                <p className="pt-1 text-[10px] text-slate-400">自転車・飛行機・新幹線は経路目安なし（未対応）</p>
              </div>
            )}
            <p className="mt-1.5 text-[10px] text-slate-400">Google の実測目安。おすすめではなく判断材料です。</p>
          </div>
        )}
        {!readOnly && recallMode && (
          <button type="button" onClick={() => onSelect(legKey, recallMode)} className="mt-3 flex w-full items-center gap-2.5 rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-left transition hover:bg-slate-100">
            <span aria-hidden className="block h-9 w-9 shrink-0 bg-center bg-no-repeat" style={chipBg(recallMode)} />
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-semibold tracking-wide text-slate-400">前回この区間</span>
              <span className="block text-sm font-bold text-slate-800">{MOBILITY_MODE_META[recallMode].label}</span>
            </span>
            <span className="shrink-0 rounded-full bg-slate-800 px-3 py-1 text-[11px] font-bold text-white">適用</span>
          </button>
        )}
        <div className="mt-4">
          <div className="mb-2 text-[11px] font-semibold tracking-wider text-slate-400">主な手段{readOnly ? "（過去の移動・実績／編集不可）" : ""}</div>
          <div className="grid grid-cols-5 gap-2">{MOBILITY_MAIN_MODES.map((m) => modeButton(m, false))}</div>
        </div>
        <div className="mt-4">
          <div className="mb-2 text-[11px] font-semibold tracking-wider text-slate-400">制限あり</div>
          <div className="grid grid-cols-5 gap-2">{MOBILITY_LIMITED_MODES.map((m) => modeButton(m, true))}</div>
          <p className="mt-2 text-[10px] text-slate-400">β＝経路は概念表示／地域により未対応の場合あり</p>
        </div>
        {/*
         * ★A0 理由観測（local reason capture）: explicitCorrection 時だけ inline で出す控えめな 1 行。
         * 任意・可逆（別 chip で変更・✕ で閉じる）・modal でない・必須でない。人格ラベルにしない（この区間の文脈のみ）。
         */}
        {!readOnly && reasonPromptVisible && (
          <div data-testid="mobility-reason-prompt" className="mt-3 flex flex-wrap items-center gap-1.5 rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-2.5">
            <span className="mr-0.5 text-[11px] text-slate-500">なぜ変えた？</span>
            {MOBILITY_REASONS.map((r) => {
              const active = selectedReason === r;
              return (
                <button
                  key={r}
                  type="button"
                  aria-pressed={active}
                  data-reason={r}
                  onClick={() => onReasonSelect?.(legKey, r)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] transition ${active ? "border-slate-700 bg-slate-700 font-semibold text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100"}`}
                >
                  {MOBILITY_REASON_LABELS[r]}
                </button>
              );
            })}
            <button
              type="button"
              aria-label="閉じる"
              onClick={() => onReasonDismiss?.()}
              className="ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-slate-300 hover:bg-slate-200 hover:text-slate-500"
            >
              ✕
            </button>
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-slate-100 pt-3 text-[11px] text-slate-400">
          <span>現在表示：<b className="text-slate-700">{selectedMode ? MOBILITY_MODE_META[selectedMode].label : "未設定"}</b></span>
          {loggedActualMin != null ? (
            <span className="flex items-center gap-1.5">
              実績：<b className="text-slate-700">{loggedActualMin}分</b>
              {logCaptureAvailable && onClearActual && (
                <button type="button" onClick={() => onClearActual(legKey)} className="text-slate-300 underline hover:text-slate-500">取消</button>
              )}
            </span>
          ) : logCaptureAvailable ? (
            <button
              type="button"
              data-testid="mobility-log-actual-toggle"
              onClick={() => { setLogOpen((v) => !v); setLogValue(""); }}
              className="text-slate-500 underline hover:text-slate-700"
            >
              実際の所要を記録
            </button>
          ) : (
            <span>実績：<b className="text-slate-700">未記録</b></span>
          )}
        </div>
        {/*
         * ★A1-6a 手動ログ inline 入力（GPS 不要・modal でない・任意・可逆）。
         * 「実際に N 分くらいかかった」= derived movement event(source=manual) を保存。
         */}
        {logCaptureAvailable && logOpen && loggedActualMin == null && (
          <div data-testid="mobility-log-actual-input" className="mt-2 flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-2.5">
            <span className="text-[11px] text-slate-500">実際に</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={logValue}
              onChange={(e) => setLogValue(e.target.value)}
              placeholder="分"
              aria-label="実際の所要（分）"
              className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-sm text-slate-800"
            />
            <span className="text-[11px] text-slate-500">分くらいかかった</span>
            <button
              type="button"
              disabled={!(Number(logValue) > 0)}
              onClick={() => {
                const n = Math.round(Number(logValue));
                if (n > 0) {
                  onLogActual?.(legKey, n);
                  setLogOpen(false);
                  setLogValue("");
                }
              }}
              className="ml-auto rounded-full bg-slate-800 px-3 py-1 text-[11px] font-bold text-white disabled:opacity-40"
            >
              記録
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
