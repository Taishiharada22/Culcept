/**
 * staging/dev 限定 fixture host の guard + fixture cells（pure / testable）— SR E2a
 *
 * 目的: fixture cells で「ShiftImportModal → 保存 → staging DB → /plan 表示」の決定論ループを
 *       検証する dev/staging 限定 host。**製品本流入口ではない**。
 *
 * 不変原則（CEO 補正 2026-05-31）:
 *   - guard は **明示 flag + staging allowlist + production deny** が主軸。
 *     `NODE_ENV !== "production"` は使わない（staging/preview でも NODE_ENV=production になりうるため）。
 *   - fixture は **現在月の匿名 synthetic**（/plan は FlowTab=today..+6 / CalendarTab=今月のみ表示、
 *     date query なし → 2099 等の遠未来は表示不可。現在月にすることで visual smoke 可能）。
 *   - raw 画像 / private-eval / 個人特定情報は使わない。
 */

import type { ShiftReviewCell } from "./shiftReviewClassification";

/** staging project ref（許可）。 */
export const STAGING_PROJECT_REF = "hjcrvndumgiovyfdacwc";
/**
 * legacy production project ref（拒否）。
 * ★注意（2026-06-27）: これは **旧 production**（fashion/EC legacy・clean-rebuild 前）。
 *   plan/reality/lifeops/capture の production-deny gate 群が canonical production 識別子として
 *   今もこれを参照している（system 全体が aljav→plod 移行に未追従＝ref drift）。
 *   **global に変更すると全 gate に波及するため、ここは変更しない**。
 *   clean production（plod）を対象にする lane は下の CLEAN_PRODUCTION_PROJECT_REF を使う。
 */
export const PRODUCTION_PROJECT_REF = "aljavfujeqcwnqryjmhl";
/**
 * clean production project ref（現行の本番・clean-rebuild 後）。
 * NEXT_PUBLIC_SUPABASE_URL が指す現行 production。shift-import 本保存の **production-canary lane**
 * （flag + auth + allowlist で本番保存を許可する経路）が「本番に接続しているか」を判定するのに使う。
 * legacy PRODUCTION_PROJECT_REF（aljav）とは別物。混同しない。
 */
export const CLEAN_PRODUCTION_PROJECT_REF = "plodugvgmdkusifdrdfz";

export interface FixtureHostEnv {
  /** PLAN_SHIFT_FIXTURE_HOST（明示 opt-in） */
  fixtureMode: string | undefined;
  /** NEXT_PUBLIC_SUPABASE_URL / SUPABASE_URL（staging allowlist + production deny の照合元） */
  supabaseUrl: string | undefined;
}

/**
 * fixture host を表示してよいか（三重ガード）:
 *   ① fixtureMode === "true"（明示 opt-in）
 *   ② supabase URL が staging ref を含む（allowlist）
 *   ③ supabase URL が production ref を含まない（deny）
 * いずれか欠ければ false → 呼び出し側は notFound()。NODE_ENV は判定に使わない。
 */
export function isShiftFixtureHostAllowed(env: FixtureHostEnv): boolean {
  const fixtureMode = env.fixtureMode === "true";
  const url = env.supabaseUrl ?? "";
  const isStaging = url.includes(STAGING_PROJECT_REF);
  const isProduction = url.includes(PRODUCTION_PROJECT_REF);
  return fixtureMode && isStaging && !isProduction;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// fixture cells（現在月の匿名 synthetic）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 匿名 synthetic コード列（勤務 / 公休 / 希望休 = anchor + 休みバッジ両方を /plan に出す）。
 * 個人特定情報なし。B1a/B1a-v4 で検証済みのコード体系（HARADA_SPRIX 辞書）に基づく。
 */
const FIXTURE_CODES = ["E-18", "H", "HREQ"] as const;

export interface ShiftFixture {
  year: number;
  month: number;
  cells: ShiftReviewCell[];
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * 現在月の fixture cells を作る（pure・now 注入で deterministic）。
 *   - 月 = now の UTC 月。
 *   - 連続 N 日（FIXTURE_CODES 数）を現在月内に収める（importRange = 当月 [start,end) を満たす）。
 *   - 開始日 = min(今日, monthLen - (N-1))。今日が月初〜中なら今日起点 → FlowTab(today..+6) にも出る。
 */
export function buildShiftFixture(now: Date): ShiftFixture {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1; // 1–12
  const monthLen = new Date(Date.UTC(year, month, 0)).getUTCDate(); // 当月末日
  const todayDay = now.getUTCDate();
  const startDay = Math.max(
    1,
    Math.min(todayDay, monthLen - (FIXTURE_CODES.length - 1))
  );
  const cells: ShiftReviewCell[] = FIXTURE_CODES.map((rawCode, i) => {
    const day = startDay + i;
    return {
      day,
      date: `${year}-${pad2(month)}-${pad2(day)}`,
      rawCode,
      confidence: 1,
    };
  });
  return { year, month, cells };
}
