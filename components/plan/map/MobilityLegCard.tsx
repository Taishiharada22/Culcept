"use client";

/**
 * components/plan/map/MobilityLegCard.tsx — leg tap で開く移動手段カード (FH から復元移植・A5-1)
 * A5-1: mode chips / squircle / label / active色 / recall「前回」表示の器を復元。
 *   durations(per-mode 所要時間比較) は本 slice では持たない(後 slice / A2 Google)。偽数字・距離→mode 推定なし。
 *   本 component は単体。MapTab 配線=A5-2 / store(A3)・recall(A4)接続=A5-3/A5-4。
 */
import {
  ROUTE_MODE_COLORS, MOBILITY_MAIN_MODES, MOBILITY_LIMITED_MODES, MOBILITY_MODE_META,
  mobilitySquircleDataUri, type RouteTransportMode,
} from "@/lib/plan/map/routeMode";

export interface LegDurations {
  walk: number | null;
  drive: number | null;
  transit: number | null;
  bicycle: number | null;
}

export interface MobilityLegCardProps {
  legKey: string;
  fromTitle: string;
  toTitle: string;
  selectedMode: RouteTransportMode | null;
  recallMode?: RouteTransportMode | null;
  /** A2: 手段別 所要時間(分・Google Routes)。null=未取得/対象外 */
  durations?: LegDurations | null;
  readOnly: boolean;
  onSelect: (legKey: string, mode: RouteTransportMode) => void;
  onClose: () => void;
}

export function MobilityLegCard({
  legKey, fromTitle, toTitle, selectedMode, recallMode, durations, readOnly, onSelect, onClose,
}: MobilityLegCardProps) {
  const chipBg = (mode: RouteTransportMode) => ({
    backgroundImage: `url("${mobilitySquircleDataUri(mode)}")`,
    backgroundSize: "contain",
  });

  const durationText = (mode: RouteTransportMode): string | null => {
    if (!durations) return null;
    let min: number | null = null;
    if (mode === "walk") min = durations.walk;
    else if (mode === "car" || mode === "taxi") min = durations.drive;
    else if (mode === "train" || mode === "bus") min = durations.transit;
    else if (mode === "bicycle") min = durations.bicycle;
    return min != null ? `${min}分` : null;
  };

  const modeButton = (mode: RouteTransportMode, limited: boolean) => {
    const active = selectedMode === mode;
    const color = ROUTE_MODE_COLORS[mode];
    const dt = durationText(mode);
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
        {dt && (<span className="text-[10px] font-bold text-slate-500">{dt}</span>)}
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
        <div className="mt-3 flex gap-4 border-t border-slate-100 pt-3 text-[11px] text-slate-400">
          <span>現在表示：<b className="text-slate-700">{selectedMode ? MOBILITY_MODE_META[selectedMode].label : "未設定"}</b></span>
          <span>実績：<b className="text-slate-700">未記録</b></span>
        </div>
      </div>
    </div>
  );
}
