// app/(culcept)/calendar/_lib/travel/repository/travelRepository.ts
// ════════════════════════════════════════════════════════════════════════
// Phase E-0: Travel データアクセスの境界（DataSource / Repository）
//
// 目的: Calendar（CalendarTab）や Travel UI が「fixture を直接 import する」のをやめ、
//   この interface 経由でデータを取得する。実装は差し替え可能:
//     - FixtureTravelRepository  … 現状の fixture を Promise で返す（既定・挙動不変）
//     - SupabaseTravelRepository … 将来 Supabase（Phase D で作成した travel_* テーブル）
//                                   から owner-scoped query（RLS）で返す（E-0 では skeleton）
//
//   消費者（CalendarTab 等）は **interface だけ**に依存する。実装差し替えで
//   consumer のコードは変わらない（Supabase 移行時の blast radius を局所化）。
//
// 設計: docs/travel-calendar-repository-boundary-design.md
// ════════════════════════════════════════════════════════════════════════

import type { Trip, TripDay } from "../types";

/** 旅行 1 日詳細の取得結果（親 trip + その日の day）。 */
export interface TripDayResult {
  trip: Trip;
  day: TripDay;
}

/**
 * Travel ドメインの読み取り境界。
 *
 * - **async（Promise）で固定**: Supabase 実装は必ず非同期になるため、fixture 実装も
 *   Promise を返して signature を揃える（移行時に consumer の型が変わらない）。
 * - **owner スコープは実装側の責務**: Supabase 実装は auth セッション + RLS で
 *   呼び出しユーザーのデータのみ返す。userId は引数に取らない（捏造防止・RLS 一元化）。
 */
export interface TravelRepository {
  /**
   * 指定日（YYYY-MM-DD）の旅行 1 日詳細を返す。該当する trip/day が無ければ null。
   *
   * - fixture 実装: SAMPLE_KYOTO_TRIP の期間内なら getSampleTripDay、期間外は null。
   * - Supabase 実装（将来）: travel_days(user_id, date) を引き、親 travel_trips と
   *   itinerary_items / reservations / photos / movement_legs を束ねて TripDay に組み立てる。
   *   同一日に複数 trip がある場合（C-1）は primary-day を選択（status='active'→start_date→created_at）。
   */
  getTripDay(date: string): Promise<TripDayResult | null>;
}

/** 未実装の repository メソッドが呼ばれたことを示す sentinel エラー。 */
export class TravelRepositoryNotImplementedError extends Error {
  constructor(method: string) {
    super(`TravelRepository.${method} is not implemented yet (Phase E-0 skeleton)`);
    this.name = "TravelRepositoryNotImplementedError";
  }
}
