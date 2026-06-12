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
  /** 人体メーターの数値 = visualFill×100（人体水位と完全同源）。unknown 系統は null（数値を出さない） */
  meterPct: { brain: number | null; heart: number | null; body: number | null; outing: number | null };
  /** 状態の背景 4 セル */
  stateBg: {
    sleep: { value: string; band: Band; note: string; barPct: number; userReported?: boolean };
    yesterdayLoad: { pct: number | null; note: string };
    recoveryQuality: { pct: number | null; note: string };
    stamina: { value: string; note: string };
  };
  /** 今日の消耗予測（負荷予定 = 予定実分数から導出） */
  consumption: { energy: number; focus: number; loadPlanned: number };
  /** 夜の回復見込み（時間 = 夜の余白セグメント実分数。回復後 % は基点メーター unknown 時 null） */
  nightRecovery: { hours: string; energyAfter: number | null; focusAfter: number | null };
  /** 明日への持ち越し（% = band 写像。unknown は null） */
  carryOver: { pct: number | null; note: string };
  /** 今日の成立見込み（% = band 写像。unknown は null） */
  feasibility: { pct: number | null; note: string };
  /** 今日の推移予測（flowTimeline + メーター値から決定論生成） */
  trend: { points: TrendPoint[]; nowMarker: string; recoveryBand: [string, string] };
}

// ── band → % の固定写像（vm_derived の正式表示規則 — visual-contract §4.1）。
//    unknown は数値を持たない（W1: unknown→0% 禁止。null = 表示側で「—」/「まだ読めていません」） ──
type KnownBand = Exclude<Band, "unknown">;
const RESERVE_PCT: Record<KnownBand, number> = { very_low: 14, low: 33, medium: 56, high: 78 };
const LOAD_PCT: Record<KnownBand, number> = { very_low: 18, low: 30, medium: 52, high: 72 };
const QUALITY_PCT: Record<KnownBand, number> = { very_low: 22, low: 38, medium: 64, high: 82 };
const CARRY_PCT: Record<KnownBand, number> = { very_low: 14, low: 28, medium: 48, high: 66 };
const FEAS_PCT: Record<KnownBand, number> = { very_low: 20, low: 34, medium: 55, high: 78 };

function pctFor(table: Record<KnownBand, number>, band: Band): number | null {
  return band === "unknown" ? null : table[band];
}

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

/** 負荷の「滑らかな」瞬間値: ±60 分窓で loadAt を 15 分刻みに平均（段差→ランプ化。B14・指示⑤） */
function smoothLoadAt(min: number, segs: Seg[]): number {
  let sum = 0;
  let n = 0;
  for (let d = -60; d <= 60; d += 15) {
    sum += loadAt(min + d, segs);
    n++;
  }
  return sum / n;
}

/**
 * 今日の推移予測を flowTimeline + メーター値から決定論生成する。
 *  - 始点(06:00): 体力 = meter.body+12 / 集中 = meter.brain+10（朝は現在値より高い想定の検証用見込み式）
 *  - 30 分刻みで、負荷に比例して減少。夜の余白帯（実セグメント）で回復。
 *  - 負荷線は ±60 分窓平均 + 端点平滑化で「異常値スパイク」に見えないよう整える（flowTimeline 由来は維持）。
 *  - 回復帯 = flowTimeline の isEveningSlack セグメントの実時刻。
 *  - now マーカー = 引数の現在 JST 分（呼び出し側で注入。日本時間で動く）。
 */
function deriveTrend(
  base: AlterBatteryViewModel,
  meter: { body: number; brain: number },
  nowMinJst: number,
): AlterScreenViewModel["trend"] {
  const segs = base.flowTimeline.segments;
  const slack = segs.find((s) => s.kind === "gap" && s.isEveningSlack);
  const recoveryBand: [string, string] = slack ? [slack.startHHMM, slack.endHHMM] : ["21:00", "22:30"];
  const [rb0, rb1] = recoveryBand.map(toMin);

  const STEP = 30;
  const rawLoad: number[] = [];
  const points: TrendPoint[] = [];
  let e = clamp(meter.body + 12, 5, 95);
  let f = clamp(meter.brain + 10, 5, 95);
  for (let t = 360; t <= 1440; t += STEP) {
    const L = smoothLoadAt(t, segs);
    if (t > 360) {
      // 負荷比例の消耗（30 分あたり）。回復帯では加算。
      e = clamp(e - (L - 18) / 22 - 0.4, 5, 95);
      f = clamp(f - (L - 14) / 20 - 0.5, 5, 95);
      if (t >= rb0 && t < rb1) {
        e = clamp(e + 3.2, 5, 95);
        f = clamp(f + 2.9, 5, 95);
      }
    }
    rawLoad.push(L);
    points.push({ t: toHHMM(t), energy: Math.round(e), focus: Math.round(f), load: 0 });
  }
  // 負荷の端点平滑化（3 点移動平均）→ 異常値・ジグザグ除去
  for (let i = 0; i < points.length; i++) {
    const a = rawLoad[Math.max(0, i - 1)];
    const b = rawLoad[i];
    const c = rawLoad[Math.min(rawLoad.length - 1, i + 1)];
    points[i].load = clamp((a + b + c) / 3, 5, 95);
  }
  const nowMarker = toHHMM(Math.min(Math.max(nowMinJst, 360), 1440));
  return { points, nowMarker, recoveryBand };
}

/** 現在の日本時間（分・00:00 起点）。Date を引数注入しない簡易版（呼び出し側 server で評価） */
export function jstNowMinutes(now: Date): number {
  // UTC からの JST(+9h) 換算
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const jst = new Date(utc + 9 * 3600000);
  return jst.getHours() * 60 + jst.getMinutes();
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
  opts?: { nowMinJst?: number; overrides?: Partial<Omit<AlterScreenViewModel, "base">> },
): AlterScreenViewModel {
  const nowMinJst = opts?.nowMinJst ?? 14 * 60; // 注入なし時のフォールバック
  const overrides = opts?.overrides;
  const meterPct = {
    brain: base.battery.brain.band === "unknown" ? null : Math.round(base.battery.brain.visualFill * 100),
    heart: base.battery.heart.band === "unknown" ? null : Math.round(base.battery.heart.visualFill * 100),
    body: base.battery.body.band === "unknown" ? null : Math.round(base.battery.body.visualFill * 100),
    outing: pctFor(RESERVE_PCT, base.contextCards.outingTolerance.band),
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
    // 基点メーターが unknown（null）の系統は回復後も数値を出さない（捏造禁止）
    energyAfter: meterPct.body === null ? null : clamp(meterPct.body + (slackMin / 60) * 9),
    focusAfter: meterPct.brain === null ? null : clamp(meterPct.brain + (slackMin / 60) * 8),
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
      yesterdayLoad: { pct: pctFor(LOAD_PCT, loadBand), note: loadBand === "unknown" ? "まだ読めていません" : "前日の予定から" },
      recoveryQuality: { pct: pctFor(QUALITY_PCT, rqBand), note: rqBand === "unknown" ? "まだ読めていません" : "夜の答え合わせ由来" },
      // 体質スタミナ: VM に源なし（軸不在）。over.png 準拠の検証用 mock 表示。
      stamina: { value: "高い", note: "持久力タイプ" },
    },
    consumption,
    nightRecovery,
    carryOver: { pct: pctFor(CARRY_PCT, carryBand), note: carryBand === "unknown" ? "まだ読めていません" : "夜以降に確定" },
    feasibility: { pct: pctFor(FEAS_PCT, feasBand), note: feasBand === "unknown" ? "まだ読めていません" : base.contextCards.feasibility.text },
    // trend は mock_reference（参考値）。unknown 系統は中位の既定値から描く（数値セルと違い「実測風の 0」にならない）
    trend: deriveTrend(base, { body: meterPct.body ?? 50, brain: meterPct.brain ?? 50 }, nowMinJst),
    ...overrides,
  };
}
