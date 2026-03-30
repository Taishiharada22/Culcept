/**
 * 季節遷移ロジック
 *
 * 二値的な「SS/AW」ではなく、4季節のグラデーション遷移を実現する。
 * 各肩シーズンは約6週間かけて0.0→1.0でブレンドされる。
 */

import type { SeasonId, SeasonBlend, DayTemperatureSplit, SeasonalRotationHint, WeatherDaily } from "./types";

/* ── 遷移スケジュール ── */
interface TransitionWindow {
  from: SeasonId;
  to: SeasonId;
  startMd: [number, number]; // [month, day]
  endMd: [number, number];
}

const TRANSITIONS: TransitionWindow[] = [
  { from: "winter", to: "spring", startMd: [2, 15], endMd: [3, 31] },
  { from: "spring", to: "summer", startMd: [5, 25], endMd: [7, 7] },
  { from: "summer", to: "autumn", startMd: [8, 25], endMd: [10, 7] },
  { from: "autumn", to: "winter", startMd: [10, 25], endMd: [12, 7] },
];

/* ── 月日 → 年内日数 ── */
function dayOfYear(month: number, day: number): number {
  const daysInMonth = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let total = 0;
  for (let m = 1; m < month; m++) total += daysInMonth[m];
  return total + day;
}

/* ── 月 → 基本季節 ── */
function baseSeasonForMonth(month: number): SeasonId {
  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  if (month >= 9 && month <= 11) return "autumn";
  return "winter";
}

/* ── SeasonId → アイテムの season タグ ── */
export const SEASON_TO_ITEM_SEASON: Record<SeasonId, "ss" | "aw"> = {
  spring: "ss",
  summer: "ss",
  autumn: "aw",
  winter: "aw",
};

/* ── メイン: 日付から SeasonBlend を取得 ── */
export function getSeasonBlend(date: string): SeasonBlend {
  const parts = date.split("-");
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  const doy = dayOfYear(month, day);

  for (const t of TRANSITIONS) {
    const startDoy = dayOfYear(t.startMd[0], t.startMd[1]);
    const endDoy = dayOfYear(t.endMd[0], t.endMd[1]);

    // 年跨ぎは無いのでシンプル
    if (doy >= startDoy && doy <= endDoy) {
      const totalDays = endDoy - startDoy;
      const elapsed = doy - startDoy;
      const blend = totalDays > 0 ? Math.min(1, elapsed / totalDays) : 0;

      return {
        primary: t.from,
        secondary: t.to,
        blend,
        shoulderSeason: true,
      };
    }
  }

  return {
    primary: baseSeasonForMonth(month),
    secondary: null,
    blend: 0,
    shoulderSeason: false,
  };
}

/* ── 寒暖差に基づく朝/午後分割 ── */
export function getDayTemperatureSplit(weather: WeatherDaily | null): DayTemperatureSplit {
  if (!weather || weather.temp_min == null || weather.temp_max == null) {
    return { needsMorningLayer: false, morningTemp: null, afternoonTemp: null, tempRange: 0 };
  }

  const tempRange = weather.temp_max - weather.temp_min;

  return {
    needsMorningLayer: tempRange >= 10,
    morningTemp: weather.temp_min,
    afternoonTemp: weather.temp_max,
    tempRange,
  };
}

/* ── 衣替え・季節ローテーションヒント ── */
export function getSeasonalRotationHints(date: string): SeasonalRotationHint[] {
  const hints: SeasonalRotationHint[] = [];
  const parts = date.split("-");
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  const doy = dayOfYear(month, day);

  for (const t of TRANSITIONS) {
    const startDoy = dayOfYear(t.startMd[0], t.startMd[1]);

    // 遷移開始の1週間前
    if (doy >= startDoy - 7 && doy < startDoy) {
      const seasonNames: Record<SeasonId, string> = {
        spring: "春", summer: "夏", autumn: "秋", winter: "冬",
      };
      hints.push({
        type: "upcoming",
        season: t.to,
        message: `来週から${seasonNames[t.to]}物の出番です`,
        relevantCategories: t.to === "summer" || t.to === "spring"
          ? ["tops", "bottoms", "shoes"]
          : ["outerwear", "tops", "bottoms"],
      });
    }

    // 遷移が70%以上進んだら旧シーズン終了ヒント
    const endDoy = dayOfYear(t.endMd[0], t.endMd[1]);
    const totalDays = endDoy - startDoy;
    if (doy >= startDoy && doy <= endDoy) {
      const elapsed = doy - startDoy;
      const blend = totalDays > 0 ? elapsed / totalDays : 0;
      if (blend >= 0.7) {
        const seasonNames: Record<SeasonId, string> = {
          spring: "春", summer: "夏", autumn: "秋", winter: "冬",
        };
        hints.push({
          type: "ending",
          season: t.from,
          message: `${seasonNames[t.from]}物はそろそろしまい時です`,
          relevantCategories: t.from === "summer" || t.from === "spring"
            ? ["tops", "shoes"]
            : ["outerwear"],
        });
      }
    }
  }

  return hints;
}

/* ── 季節ブレンド対応の厚み推奨 ── */
export function getBlendedThickness(
  tempMax: number | null,
  blend: SeasonBlend,
): { primaryThickness: string; secondaryThickness: string | null; needsOuter: boolean } {
  if (tempMax === null) {
    return { primaryThickness: "mid", secondaryThickness: null, needsOuter: false };
  }

  const getThicknessForTemp = (t: number) => {
    if (t >= 25) return "thin";
    if (t >= 15) return "mid";
    return "thick";
  };

  const primary = getThicknessForTemp(tempMax);
  const needsOuter = tempMax < 15;

  if (!blend.shoulderSeason || !blend.secondary) {
    return { primaryThickness: primary, secondaryThickness: null, needsOuter };
  }

  // 肩シーズンでは、遷移先季節の一般的気温での厚みも考慮
  const secondaryDefaultTemps: Record<SeasonId, number> = {
    spring: 18, summer: 28, autumn: 18, winter: 5,
  };
  const secondaryTemp = secondaryDefaultTemps[blend.secondary];
  const secondary = getThicknessForTemp(secondaryTemp);

  return { primaryThickness: primary, secondaryThickness: secondary, needsOuter };
}
