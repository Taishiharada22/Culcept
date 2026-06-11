/**
 * AlterScreenViewModel — over.png 準拠の画面表示 VM（Session B 拡張・CEO 2026-06-11 契約緩和）
 *
 * B13 改訂（CEO 指示「数値は具体的に。ただし嘘でないこと・確実な根拠に載っていること」）:
 *  - 表示数値・グラフは **基底 AlterBatteryViewModel からの導出**に統一した。
 *    ・チャートの時刻・回復帯 = flowTimeline の実セグメント（予定/移動/夜の余白）
 *    ・体力/集中カーブの始点 = 人体メーター（visualFill）と同源
 *    ・負荷予定 = 予定+移動の実分数 / 稼働帯
 *    ・持ち越し/成立見込み/負荷/回復の質 = 基底 band からの固定写像（band→% 対応表）
 *  - 導出式は全て本ファイルに文書化（mock 見込み式 = Stage 1+ で実導出に差し替える前提の検証用）
 *  - VM に源が存在しない 2 項目（睡眠時間 h / 体質スタミナ）のみ明示 mock（コメント参照）
 *  - スパークライン（履歴の捏造になる）は廃止 → バー表示（ForecastCards 側）
 *
 * 規律: 基底 VM 不変更 / 実データ・保存に進まない / 医療・診断風にしない。
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
  /** 人体メーターの数値 = visualFill×100（人体水位と完全同源） */
  meterPct: { brain: number; heart: number; body: number; outing: number };
  /** 状態の背景 4 セル */
  stateBg: {
    sleep: { value: string; band: Band; note: string; barPct: number };
    yesterdayLoad: { pct: number; note: string };
    recoveryQuality: { pct: number; note: string };
    stamina: { value: string; note: string };
  };
  /** 今日の消耗予測（負荷予定 = 予定実分数から導出） */
  consumption: { energy: number; focus: number; loadPlanned: number };
  /** 夜の回復見込み（時間 = 夜の余白セグメント実分数） */
  nightRecovery: { hours: string; energyAfter: number; focusAfter: number };
  /** 明日への持ち越し（% = band 写像） */
  carryOver: { pct: number; note: string };
  /** 今日の成立見込み（% = band 写像） */
  feasibility: { pct: number; note: string };
  /** 今日の推移予測（flowTimeline + メーター値から決定論生成） */
  trend: { points: TrendPoint[]; nowMarker: string; recoveryBand: [string, string] };
}

// ── band → % の固定写像（導出表。閲覧者が水位帯と数値の対応を検証できるよう一意） ──
const RESERVE_PCT: Record<Band, number> = { very_low: 14, low: 33, medium: 56, high: 78, unknown: 0 };
const LOAD_PCT: Record<Band, number> = { very_low: 18, low: 30, medium: 52, high: 72, unknown: 0 };
const QUALITY_PCT: Record<Band, number> = { very_low: 22, low: 38, medium: 64, high: 82, unknown: 0 };
const CARRY_PCT: Record<Band, number> = { very_low: 14, low: 28, medium: 48, high: 66, unknown: 0 };
const FEAS_PCT: Record<Band, number> = { very_low: 20, low: 34, medium: 55, high: 78, unknown: 0 };

const clamp = (v: number, lo = 4, hi = 96) => Math.min(hi, Math.max(lo, Math.round(v)));

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}
function toHHMM(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

type Seg = AlterBatteryViewModel["flowTimeline"]["segments"][number];

/** 負荷の瞬間値（予定中 65 / 移動中 48 / 空き 18 — 検証用の固定基準値） */
function loadAt(min: number, segs: Seg[]): number {
  for (const s of segs) {
    if (toMin(s.startHHMM) <= min && min < toMin(s.endHHMM)) {
      if (s.kind === "event") return 65;
      if (s.kind === "travel") return 48;
    }
  }
  return 18;
}

/**
 * 今日の推移予測を flowTimeline + メーター値から決定論生成する。
 *  - 始点(06:00): 体力 = meter.body+12 / 集中 = meter.brain+10（朝は現在値より高い想定の検証用見込み式）
 *  - 90 分刻みで、負荷に比例して減少。夜の余白帯（実セグメント）で回復。
 *  - 回復帯 = flowTimeline の isEveningSlack セグメントの実時刻。
 */
function deriveTrend(base: AlterBatteryViewModel, meter: { body: number; brain: number }): AlterScreenViewModel["trend"] {
  const segs = base.flowTimeline.segments;
  const slack = segs.find((s) => s.kind === "gap" && s.isEveningSlack);
  const recoveryBand: [string, string] = slack ? [slack.startHHMM, slack.endHHMM] : ["21:00", "22:30"];
  const [rb0, rb1] = recoveryBand.map(toMin);

  const points: TrendPoint[] = [];
  let e = clamp(meter.body + 12, 5, 95);
  let f = clamp(meter.brain + 10, 5, 95);
  for (let t = 360; t <= 1440; t += 90) {
    const mid = t - 45;
    const L = loadAt(mid, segs);
    if (t > 360) {
      // 負荷比例の消耗（90 分あたり）。回復帯では加算。
      e = clamp(e - (L - 18) / 7 - 1.2, 5, 95);
      f = clamp(f - (L - 14) / 6.5 - 1.4, 5, 95);
      if (mid >= rb0 && mid < rb1) {
        e = clamp(e + 9, 5, 95);
        f = clamp(f + 8, 5, 95);
      }
    }
    points.push({ t: toHHMM(t), energy: e, focus: f, load: clamp(L + (mid >= rb0 && mid < rb1 ? -6 : 0), 5, 95) });
  }
  // now マーカー: VM に「現在時刻」は存在しないため検証用固定（最初の午後予定の開始 or 14:00）
  const firstAfternoonEvent = segs.find((s) => s.kind === "event" && toMin(s.startHHMM) >= 12 * 60);
  const nowMarker = firstAfternoonEvent ? firstAfternoonEvent.startHHMM : "14:00";
  return { points, nowMarker, recoveryBand };
}

/** 夜の余白の実分数（isEveningSlack セグメント合計） */
function slackMinutes(base: AlterBatteryViewModel): number {
  return base.flowTimeline.segments
    .filter((s) => s.kind === "gap" && s.isEveningSlack)
    .reduce((acc, s) => acc + Math.max(0, toMin(s.endHHMM) - toMin(s.startHHMM)), 0);
}

/** 予定+移動の実分数 */
function bookedMinutes(base: AlterBatteryViewModel): number {
  return base.flowTimeline.segments
    .filter((s) => s.kind === "event" || s.kind === "travel")
    .reduce((acc, s) => acc + Math.max(0, toMin(s.endHHMM) - toMin(s.startHHMM)), 0);
}

function fmtHours(min: number): string {
  return `${Math.round((min / 60) * 10) / 10}h`;
}

/**
 * 基底 VM から AlterScreenViewModel を構築（B13: 全数値を導出）。
 */
export function buildScreenViewModel(
  base: AlterBatteryViewModel,
  overrides?: Partial<Omit<AlterScreenViewModel, "base">>,
): AlterScreenViewModel {
  const meterPct = {
    brain: Math.round(base.battery.brain.visualFill * 100),
    heart: Math.round(base.battery.heart.visualFill * 100),
    body: Math.round(base.battery.body.visualFill * 100),
    outing: RESERVE_PCT[base.contextCards.outingTolerance.band],
  };

  // 負荷予定 = 予定+移動の実分数 / 稼働帯 10h（600 分）
  const booked = bookedMinutes(base);
  const loadPlanned = clamp((booked / 600) * 100, 0, 99);
  // 消耗見込み（検証用 mock 式: 負荷予定に比例。Stage 1+ で実導出に差し替え）
  const consumption = {
    energy: -clamp(loadPlanned * 0.6 + 8, 1, 99),
    focus: -clamp(loadPlanned * 0.66 + 10, 1, 99),
    loadPlanned,
  };

  // 夜の回復見込み = 夜の余白の実分数。回復後 = 現在メーター + 余白時間×係数（検証用 mock 式）
  const slackMin = slackMinutes(base);
  const nightRecovery = {
    hours: fmtHours(slackMin),
    energyAfter: clamp(meterPct.body + (slackMin / 60) * 9),
    focusAfter: clamp(meterPct.brain + (slackMin / 60) * 8),
  };

  const carryBand = base.contextCards.carryOver.band;
  const feasBand = base.contextCards.feasibility.band;
  const loadBand = base.contextCards.yesterdayLoad.band;
  const rqBand = base.contextCards.recoveryQuality.band;

  return {
    base,
    meterPct,
    stateBg: {
      // 睡眠時間(h)は VM に源が無い → 本人申告がある場合のみ表示する検証用 mock 値（5.8h 固定）。
      // 申告なし（source unknown）は数値を出さない（実測でないものを実測のように見せない）。
      sleep:
        base.contextCards.sleep.source === "user_reported"
          ? { value: "5.8h", band: base.contextCards.sleep.band, note: "やや少なめ", barPct: 70 }
          : { value: "—", band: "unknown", note: "まだ読めていません", barPct: 0 },
      yesterdayLoad: { pct: LOAD_PCT[loadBand], note: loadBand === "unknown" ? "まだ読めていません" : "前日の予定から" },
      recoveryQuality: { pct: QUALITY_PCT[rqBand], note: rqBand === "unknown" ? "まだ読めていません" : "夜の答え合わせ由来" },
      // 体質スタミナ: VM に源なし（軸不在）。over.png 準拠の検証用 mock 表示。
      stamina: { value: "高い", note: "持久力タイプ" },
    },
    consumption,
    nightRecovery,
    carryOver: { pct: CARRY_PCT[carryBand], note: carryBand === "unknown" ? "まだ読めていません" : "夜以降に確定" },
    feasibility: { pct: FEAS_PCT[feasBand], note: feasBand === "unknown" ? "まだ読めていません" : base.contextCards.feasibility.text },
    trend: deriveTrend(base, { body: meterPct.body, brain: meterPct.brain }),
    ...overrides,
  };
}
