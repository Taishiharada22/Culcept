/**
 * Reality Control OS — R3-1 World State Input Contract（**pure・no-DB/route/UI**・barrel 非 export）
 *
 * 設計: docs/r3-world-state-asset-audit-and-boundary.md（R3-0）/ docs/reality-secretary-os-unbuilt-roadmap.md（R3）
 *
 * 役割: 「今の現実」を統合する `WorldState`（**R2 empty-day と R4 trigger 双方が消費する単一表現**）。
 *   既存正本（ContextSnapshot/DayGraph/HardConstraint）を **consume**（再実装しない）。
 *   energy/weather は ContextSnapshot から取り出す。availableWindows は caller が DayGraph gap から導出して渡す。
 *
 * 厳守: 既存正本を保持/参照するだけ（再計算しない）・MAP/mobility 不可侵（placeholder）・Plan 本線非接続・
 *   正本型を作らない・捏造しない（不明は null）・pure・**Date.now しない**（nowMinute は caller が渡す）。
 */

import type { ContextSnapshot, WeatherKind } from "../../context/contextModifier";
import type { AvailableWindow, EmptyDayPermissionLevel, HardConstraint, MobilityPlaceholder } from "../empty-day/empty-day-input";

/** 「今の現実」の統合表現（external reality・memory=内部モデルは別 arg で derive に渡す）。 */
export interface WorldState {
  readonly date: string;
  /** 現在時刻（分・0..1440・null=不明）。**pure: caller が渡す**（Date.now しない）。 */
  readonly nowMinute: number | null;
  /** 固定予定（→ hardConstraints・HardConstraint を reuse）。 */
  readonly todaySchedule: readonly HardConstraint[];
  /** 空き窓（caller が DayGraph gap から導出して渡す）。 */
  readonly availableWindows: readonly AvailableWindow[];
  /** 既存 context 集約を **consume**（energy/weather/density）。null=未取得。 */
  readonly context: ContextSnapshot | null;
  readonly mobility: MobilityPlaceholder | null;
  readonly permissionLevel: EmptyDayPermissionLevel;
}

const DAY_MAX = 24 * 60;

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
function validRange(w: { startMinute: number; endMinute: number }): boolean {
  return Number.isFinite(w.startMinute) && Number.isFinite(w.endMinute) && w.startMinute >= 0 && w.endMinute <= DAY_MAX && w.startMinute < w.endMinute;
}

/** WorldState から energy を 0..1 で取り出す（context.energy は 0..1 前提・context 層が正規化済・防御 clamp）。null=未取得。 */
export function worldStateEnergy(ws: WorldState): number | null {
  const v = ws.context?.energy?.value;
  return typeof v === "number" && Number.isFinite(v) ? clamp(v, 0, 1) : null;
}

/** WorldState から weather を取り出す（consume）。null=未取得。 */
export function worldStateWeather(ws: WorldState): WeatherKind | null {
  return ws.context?.weather?.value ?? null;
}

/** WorldState の正規化（nowMinute/permission clamp・無効 window/schedule 除外）。 */
export function normalizeWorldState(ws: WorldState): WorldState {
  return {
    ...ws,
    nowMinute: typeof ws.nowMinute === "number" && Number.isFinite(ws.nowMinute) ? clamp(ws.nowMinute, 0, DAY_MAX) : null,
    todaySchedule: ws.todaySchedule.filter(validRange),
    availableWindows: ws.availableWindows.filter(validRange),
    permissionLevel: clamp(ws.permissionLevel, 0, 5) as EmptyDayPermissionLevel,
  };
}
