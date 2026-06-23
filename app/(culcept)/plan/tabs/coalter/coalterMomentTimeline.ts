/**
 * S3-2 — CoAlter 当日タイムライン fixture（**preview 専用・demo データ・決定論**）
 *
 * 役割: 「確定プランが進行中」の当日を模した moment 列。S3-2 Moment surface が
 *   「今この時刻・状況」で 2 人のどちらが消耗しそうかを先回りするための土台。
 *
 * なぜ fixture か（honesty）:
 *   - solver 未実装＝engine は時刻付き行程を持たない（S1 で確定）。よって当日タイムラインは
 *     **demo fixture** で与える（S1 の条件 fixture / S2 の demo 軸と同じ流儀）。
 *   - 実運用では現在時刻と確定行程から構築する。preview では **固定 nowMin**（Date.now を取らない）。
 *   - VM/UI は必ず `demo: true` を伴って表示する。
 *
 * stressor = その moment が**どの特性に負荷をかけるか**:
 *   social  … 人混み・対人密度（内向側が消耗）
 *   pace    … 詰め込み・移動密度（ゆっくり側が消耗）
 *   novelty … 不慣れ・未知の連続（定番側が消耗）
 *   null    … 負荷の小さい moment（移動・休憩等）
 */

import type { CoAlterPlanMode } from "./coalterPlanSessionFixture";

/** moment がかける負荷の種類。 */
export type MomentStressor = "social" | "pace" | "novelty";

export interface CoAlterDayMoment {
  /** 00:00 起点の分（決定論・固定）。 */
  atMin: number;
  /** 当日の場面ラベル。 */
  label: string;
  /** この moment の負荷種別（null = 負荷小）。 */
  stressor: MomentStressor | null;
}

export interface CoAlterDayTimeline {
  /** preview の固定現在時刻（分）。Date.now を取らない決定論。 */
  nowMin: number;
  /** 時刻昇順の moment 列。 */
  moments: CoAlterDayMoment[];
}

/**
 * Travel demo（箱根日帰り想定）:
 *   now=13:20。次の負荷 moment = 14:00「はじめての路地裏散策」(novelty)。
 *   → travel demo 軸（self 新奇 / partner Mio 定番）から **Mio が不慣れで消耗** を先回り。
 */
const TRAVEL_TIMELINE: CoAlterDayTimeline = {
  nowMin: 800, // 13:20
  moments: [
    { atMin: 600, label: "出発・移動", stressor: null }, //            10:00
    { atMin: 720, label: "名物ランチ（人気店）", stressor: "social" }, // 12:00
    { atMin: 840, label: "はじめての路地裏散策", stressor: "novelty" }, // 14:00 ← 次の負荷
    { atMin: 960, label: "名所めぐり（駆け足）", stressor: "pace" }, //   16:00
    { atMin: 1080, label: "帰路", stressor: null }, //                  18:00
  ],
};

/**
 * Daily demo（都内一日想定）:
 *   now=11:40。次の負荷 moment = 12:00「人気カフェ」(social)。
 *   → daily demo 軸（self 外向 / partner Mio 内向）から **Mio が人疲れ** を先回り。
 */
const DAILY_TIMELINE: CoAlterDayTimeline = {
  nowMin: 700, // 11:40
  moments: [
    { atMin: 600, label: "待ち合わせ・出発", stressor: null }, //       10:00
    { atMin: 720, label: "人気カフェ（混雑）", stressor: "social" }, //  12:00 ← 次の負荷
    { atMin: 840, label: "商店街めぐり（人混み）", stressor: "social" }, // 14:00
    { atMin: 960, label: "公園でゆっくり", stressor: null }, //          16:00
  ],
};

export const COALTER_DEMO_TIMELINE: Record<CoAlterPlanMode, CoAlterDayTimeline> = {
  daily: DAILY_TIMELINE,
  travel: TRAVEL_TIMELINE,
};
