"use client";

/**
 * components/plan/map/GpsArrivalPrompt.tsx — A1-6b: 到着の確認 prompt（控えめ・非 modal）
 *
 * ★GPS は候補・manual log が正本。自動保存しない＝user が [記録]/[ちがう] を選ぶ。
 *   modal/heavy にしない（小さい inline banner・1 行・dismissible）。raw 数値の断定をしない（「約N分」目安）。
 */

export interface GpsArrivalPromptProps {
  readonly fromTitle: string;
  readonly toTitle: string;
  /** detector 推定の所要（分・null なら出さない）。 */
  readonly durationMin: number | null;
  readonly onConfirm: () => void;
  readonly onDismiss: () => void;
}

export function GpsArrivalPrompt({ fromTitle, toTitle, durationMin, onConfirm, onDismiss }: GpsArrivalPromptProps) {
  return (
    <div data-testid="gps-arrival-prompt" className="absolute inset-x-3 bottom-3 z-30">
      <div className="flex items-center gap-2 rounded-2xl border border-slate-200/90 bg-white/95 px-3.5 py-2.5 shadow-[0_12px_36px_-12px_rgba(15,23,42,0.28)] backdrop-blur">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-semibold text-slate-700">
            {fromTitle} <span className="font-medium text-slate-300">→</span> {toTitle}
          </p>
          <p className="text-[11px] text-slate-500">
            この区間、到着したようです。記録しますか？
            {durationMin != null ? <span className="text-slate-400">（約{durationMin}分）</span> : null}
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded-full border border-slate-200 px-3 py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-50"
        >
          ちがう
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="shrink-0 rounded-full bg-slate-800 px-3 py-1 text-[11px] font-bold text-white hover:bg-slate-700"
        >
          記録
        </button>
      </div>
    </div>
  );
}
