// app/(culcept)/calendar/_lib/travel/tripDayDerive.ts
// ════════════════════════════════════════════════════════════════════════
// Phase E-2 foundation: TripDay の「派生フィールド」を source-of-truth から算出する純粋関数。
//
// 設計判断（docs/travel-tripday-data-classification-e2-plan.md）:
//   reservationStats / move.summary / routeStops は **派生データ**＝DB に持たず算出する。
//   （テーブル化＝非正規化・整合性負債を避ける。Supabase getTripDay 組み立てで本関数を使う。）
//
// 本ファイルは DB 非依存・副作用なしの pure functions のみ。fixture 照合でテスト済。
// ════════════════════════════════════════════════════════════════════════

import type {
  MoveLeg,
  MoveSummary,
  MoveSummaryMode,
  Reservation,
  ReservationStats,
  RouteStop,
  ScheduleItem,
  TransportMode,
} from "./types";

// ── パース補助（fixture/DB のテキスト表記 → 数値）─────────────────────────
/** "約20分" / "20分" → 20。数字が無ければ 0。 */
export function parseDurationMin(text: string | undefined | null): number {
  if (!text) return 0;
  const m = text.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

/** "7.2 km" → 7.2 / "850 m" → 0.85。単位 m は km へ換算。数字が無ければ 0。 */
export function parseDistanceKm(text: string | undefined | null): number {
  if (!text) return 0;
  const m = text.match(/([\d.]+)/);
  if (!m) return 0;
  const value = parseFloat(m[1]);
  if (Number.isNaN(value)) return 0;
  // "km" を含まず "m" のみ → メートル表記とみなし km 換算
  return /km/i.test(text) ? value : /\bm\b|ｍ|m\s*$/i.test(text) ? value / 1000 : value;
}

/** "¥2,650" → 2650 / null → 0。 */
export function parseFareYen(text: string | undefined | null): number {
  if (!text) return 0;
  const digits = text.replace(/[^\d]/g, "");
  return digits ? parseInt(digits, 10) : 0;
}

/** mode → 既定の日本語ラベル（perMode 表示用・leg.modeLabel は路線番号付きのため使わない）。 */
const MODE_LABEL_JA: Record<TransportMode, string> = {
  walk: "徒歩",
  taxi: "タクシー",
  train: "電車",
  bus: "バス",
  bike: "自転車",
  car: "車",
};

function formatYen(n: number): string {
  // 3 桁区切り（"4,860"）。Intl 依存を避け手実装（環境ロケール非依存）。
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// ── reservationStats（reservations の集計）────────────────────────────────
/**
 * 予約の集計。getTripDay では **trip 全体の reservations** を渡す想定
 * （fixture の reservationStats は trip 全体集計＝day の reservations と一致しないことに注意）。
 */
export function computeReservationStats(reservations: readonly Reservation[]): ReservationStats {
  let confirmed = 0;
  let changeable = 0;
  let needsAction = 0;
  for (const r of reservations) {
    if (r.status === "確定済み") confirmed++;
    if (r.changeable) changeable++;
    if (r.needsAction) needsAction++;
  }
  return { total: reservations.length, confirmed, changeable, needsAction };
}

// ── move.summary（legs の集計）────────────────────────────────────────────
/**
 * 移動 legs から mode 別＋全体の集計を算出。
 * - mode 別: 出現順（first-appearance）に duration/distance を合算。
 * - 全体: 総時間 "約N分" / 総距離 "X.Y km" / 概算運賃 "概算 ¥N"。
 * 目的地（mode 無し）の leg は集計から除外。
 */
export function computeMoveSummary(legs: readonly MoveLeg[]): MoveSummary {
  const order: TransportMode[] = [];
  const byMode = new Map<TransportMode, { min: number; km: number }>();
  let totalMin = 0;
  let totalKm = 0;
  let totalFare = 0;

  for (const leg of legs) {
    const min = parseDurationMin(leg.durationText);
    const km = parseDistanceKm(leg.distanceText);
    const fare = parseFareYen(leg.fareText);
    totalMin += min;
    totalKm += km;
    totalFare += fare;
    if (!leg.mode) continue; // 目的地（mode 無し）は per-mode 集計外
    if (!byMode.has(leg.mode)) {
      byMode.set(leg.mode, { min: 0, km: 0 });
      order.push(leg.mode);
    }
    const acc = byMode.get(leg.mode)!;
    acc.min += min;
    acc.km += km;
  }

  const perMode: MoveSummaryMode[] = order.map((mode) => {
    const acc = byMode.get(mode)!;
    return {
      mode,
      label: MODE_LABEL_JA[mode],
      durationText: `約${acc.min}分`,
      distanceText: `${acc.km.toFixed(1)} km`,
    };
  });

  return {
    perMode,
    totalDurationText: `約${totalMin}分`,
    totalDistanceText: `${totalKm.toFixed(1)} km`,
    totalFareText: `概算 ¥${formatYen(totalFare)}`,
  };
}

// ── routeStops（schedule の投影）──────────────────────────────────────────
/**
 * ROUTE MAP の停留点を schedule から投影。
 * order=1..N / name=schedule.name / coords=schedule.coords / modeToNext=transportToNext.mode。
 * 末尾は modeToNext 無し。
 * 注: fixture の routeStops は表示用に name/mode が手調整されている（座標・順序・件数は schedule と一致）。
 *     正本は schedule なので、本投影が long-term の routeStops 算出ロジック。
 */
export function deriveRouteStops(schedule: readonly ScheduleItem[]): RouteStop[] {
  return schedule.map((item, idx) => {
    const stop: RouteStop = { order: idx + 1, name: item.name };
    if (item.coords) stop.coords = item.coords;
    const mode = item.transportToNext?.mode;
    if (mode) stop.modeToNext = mode;
    return stop;
  });
}
