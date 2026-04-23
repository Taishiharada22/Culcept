/**
 * timeLabel — 予定行の時刻ラベル算出（PR-11 Step 2b 最小根治）
 *
 * 位置づけ:
 *   MorningPlanCard の PlanItemRow が時刻 slot を描画する際、
 *   通常行では開始–終了の range を、1日の開始点/終点では単一時刻を
 *   表示したい（CEO 確定 2026-04-24）。
 *
 *   "use client" な React コンポーネントファイル内に置くと vitest の
 *   node 環境で framer-motion 等の side-effect import が走り test
 *   困難になるため、pure helper を本 module に分離。
 *
 * 不変項:
 *   - "HH:MM" → number / number → "HH:MM" の双方向変換は厳密
 *   - 24:00 以上は invalid 扱い（clamp せず undefined を返し caller が fallback）
 *   - isDayBoundary=true → range 化しない（単一時刻を返す）
 *   - durationMin ≤ 0 → range が 0 幅になる退化を避け単一時刻
 *   - 不正 input（NaN / 負数 / 形式不一致）→ 単一時刻 or undefined（range 化しない）
 *
 * 非責務:
 *   - 日跨ぎ表示 / タイムゾーン調整 / 24h mod 表示
 *   - travel 行（= 独自表示、本 helper は呼ばない）
 *   - whenSharpness≠"fixed" の表示（caller が [時間未確定] ラベル等を出す）
 */

export function timeToMinutes(time: string): number | undefined {
  if (typeof time !== "string") return undefined;
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) return undefined;
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return undefined;
  if (h < 0 || h >= 24 || m < 0 || m >= 60) return undefined;
  return h * 60 + m;
}

export function minutesToTimeHHMM(minutes: number): string | undefined {
  if (!Number.isFinite(minutes) || minutes < 0 || minutes >= 24 * 60) return undefined;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export interface FormatStartEndLabelOpts {
  /** PlanItem.startTime — 未確定時は undefined */
  startTime: string | undefined;
  /** PlanItem.durationMin — 0 以下や NaN は range 非生成 */
  durationMin: number;
  /**
   * 1日の開始点/終点（= 非 travel の先頭/末尾）の時 true。
   * CEO 確定 2026-04-24: 開始点/終点は range 対象外、単一時刻を保つ。
   */
  isDayBoundary: boolean;
}

/**
 * 時刻ラベル文字列を返す。
 *
 * - startTime undefined → undefined（caller が「時間未確定」等を描画）
 * - isDayBoundary=true → `startTime` 単一値
 * - durationMin ≤ 0 / invalid start / 24h 越え end → `startTime` 単一値 fallback
 * - 通常 → "HH:MM–HH:MM"（en dash U+2013）
 */
export function formatStartEndLabel(
  opts: FormatStartEndLabelOpts,
): string | undefined {
  const { startTime, durationMin, isDayBoundary } = opts;
  if (!startTime) return undefined;
  if (isDayBoundary) return startTime;
  if (!(durationMin > 0)) return startTime;

  const startMin = timeToMinutes(startTime);
  if (startMin === undefined) return startTime;
  const endHHMM = minutesToTimeHHMM(startMin + durationMin);
  if (endHHMM === undefined) return startTime;
  return `${startTime}–${endHHMM}`;
}
