/**
 * AlterScreenViewModel — over.png 準拠の画面表示 VM（Session B 拡張・CEO 2026-06-11 契約緩和）
 *
 * 背景: CEO 指示で visual-contract §2 の「% / グラフ / 消耗予測 / 体質スタミナ 不採用」を解除し、
 *       over.png 通りの数値・グラフ UI を実装する。ただし `AlterBatteryViewModel`（lib/plan/dayState・
 *       Session A 領域）の型は変更しない。基底 VM を内包し、over.png 固有の表示フィールドを Session B 側で足す。
 *
 * 規律:
 *  - 基底（battery / contextCards / flowTimeline / morningReveal / nightCheck / quickReplies / alterMessage）は
 *    AlterBatteryViewModel をそのまま参照（ViewModel 接続維持）。
 *  - over.png 固有の数値・系列（meterPct / consumption / nightRecovery / trend / stamina / sparkline）は
 *    **mock 表示値**。Stage 1+ では実導出が必要（消耗予測等は元々「採点不能」指摘あり = closeout に残課題記録）。
 *  - meterPct は基底 visualFill から導出（捏造でなく VM 連動）。
 */

import type { AlterBatteryViewModel, Band } from "@/lib/plan/dayState/dayStateTypes";

export interface TrendPoint {
  t: string; // "HH:MM"
  energy: number; // 0-100
  focus: number;
  load: number;
}

export interface AlterScreenViewModel {
  base: AlterBatteryViewModel;
  /** 人体メーターの数値（over.png: 集中余力 / 心の余力 / からだの余力 / 外出耐性） */
  meterPct: { brain: number; heart: number; body: number; outing: number };
  /** 状態の背景 4 セル（1 枠に内包） */
  stateBg: {
    sleep: { value: string; band: Band; note: string };
    yesterdayLoad: { pct: number; note: string };
    recoveryQuality: { pct: number; note: string };
    stamina: { value: string; note: string };
  };
  /** 今日の消耗予測 */
  consumption: { energy: number; focus: number; loadPlanned: number };
  /** 夜の回復見込み */
  nightRecovery: { hours: string; energyAfter: number; focusAfter: number };
  /** 明日への持ち越し（% + スパークライン） */
  carryOver: { pct: number; note: string; spark: number[] };
  /** 今日の成立見込み（% + スパークライン） */
  feasibility: { pct: number; note: string; spark: number[] };
  /** 今日のリソース推移予測 */
  trend: { points: TrendPoint[]; nowMarker: string; recoveryBand: [string, string] };
}

function bandToPct(band: Band, lowHigh: "reserve" | "load" = "reserve"): number {
  // 余力方向: high=高%, 負荷方向: high=高%
  const map: Record<Band, number> = { very_low: 14, low: 33, medium: 56, high: 78, unknown: 0 };
  return lowHigh === "load" ? map[band] : map[band];
}

/** over.png の推移カーブ（事実 + 予測の見え方。mock。朝〜夜で体力/集中が下降、負荷が予定帯で上昇、夜に回復帯） */
const MOCK_TREND: AlterScreenViewModel["trend"] = {
  points: [
    { t: "06:00", energy: 70, focus: 66, load: 40 },
    { t: "07:30", energy: 74, focus: 72, load: 46 },
    { t: "09:00", energy: 76, focus: 74, load: 52 },
    { t: "10:30", energy: 72, focus: 70, load: 58 },
    { t: "12:00", energy: 66, focus: 62, load: 60 },
    { t: "13:30", energy: 60, focus: 54, load: 64 },
    { t: "15:00", energy: 54, focus: 47, load: 60 },
    { t: "16:30", energy: 48, focus: 42, load: 52 },
    { t: "18:00", energy: 42, focus: 38, load: 44 },
    { t: "19:30", energy: 38, focus: 34, load: 36 },
    { t: "21:00", energy: 36, focus: 33, load: 26 },
    { t: "22:30", energy: 44, focus: 40, load: 20 },
    { t: "24:00", energy: 52, focus: 47, load: 16 },
  ],
  nowMarker: "14:00",
  recoveryBand: ["20:30", "22:00"],
};

/**
 * 基底 VM から AlterScreenViewModel を構築。over.png 固有部は mock 既定値（overrides で variant 差分可）。
 */
export function buildScreenViewModel(
  base: AlterBatteryViewModel,
  overrides?: Partial<Omit<AlterScreenViewModel, "base">>,
): AlterScreenViewModel {
  const meterPct = {
    brain: Math.round(base.battery.brain.visualFill * 100),
    heart: Math.round(base.battery.heart.visualFill * 100),
    body: Math.round(base.battery.body.visualFill * 100),
    outing: bandToPct(base.contextCards.outingTolerance.band),
  };
  return {
    base,
    meterPct,
    stateBg: {
      sleep: { value: "5.8h", band: "low", note: "やや少なめ" },
      yesterdayLoad: { pct: 72, note: "高め" },
      recoveryQuality: { pct: 64, note: "ふつう" },
      stamina: { value: "高い", note: "持久力タイプ" },
    },
    consumption: { energy: -39, focus: -42, loadPlanned: 65 },
    nightRecovery: { hours: "2.5h", energyAfter: 75, focusAfter: 64 },
    carryOver: { pct: 28, note: "やや少なめ", spark: [30, 26, 32, 24, 28, 22, 28] },
    feasibility: { pct: 78, note: "計画どおり進む見込み", spark: [60, 64, 62, 70, 68, 74, 78] },
    trend: MOCK_TREND,
    ...overrides,
  };
}
