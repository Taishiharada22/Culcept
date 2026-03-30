/**
 * インサイトエンジン
 *
 * Aneurasync 思想: 「自分って、そういう人間だったのか」と気づく瞬間を生む。
 * 機械的な理由文ではなく、パーソナルで深いインサイトを生成する。
 */

import type { WardrobeItem } from "@/app/my-style/_lib/types";
import type { WeatherDaily, SatisfactionProfile, SeasonBlend, Insight, InsightType } from "./types";
import type { CalendarPersonaProfile } from "./personaBoost";
import { pcColorBoost, inferPersonaStyleDirection } from "./personaBoost";
import { loadWornHistory } from "./rotationTracker";
import type { TemporalProfile } from "./temporalPatterns";
import type { ComboGraph } from "./comboGraph";
import { getBestPartners } from "./comboGraph";
import type { ExtendedWeatherContext } from "./materialWeather";
import { inferMaterial, scoreMaterialWeather } from "./materialWeather";
import type { ObservationContext, OutfitAdaptation } from "./aneurasyncIntegration";

/* ── PC シーズン名 ── */
const PC_NAMES: Record<string, string> = {
  spring: "Spring（スプリング）",
  summer: "Summer（サマー）",
  autumn: "Autumn（オータム）",
  winter: "Winter（ウィンター）",
};

const PC_COLOR_DESC: Record<string, string> = {
  spring: "暖色系の明るいトーン。黄味のあるベージュやコーラルが肌の透明感を引き出します",
  summer: "寒色系のソフトなトーン。ラベンダーやグレイッシュブルーが上品さを演出します",
  autumn: "暖色系の落ち着いたトーン。テラコッタやカーキがナチュラルな温もりを加えます",
  winter: "寒色系のクリアなトーン。ネイビーやバーガンディーがシャープな印象を与えます",
};

/* ── スタイル軸の日本語記述 ── */
const STYLE_DIRECTION_DESC: Record<string, { label: string; desc: string }> = {
  minimal: { label: "ミニマリスト", desc: "シンプルで洗練された構成が得意" },
  bold: { label: "大胆派", desc: "存在感のあるアイテムや配色を好む" },
  classic: { label: "クラシック派", desc: "時代を超えた定番スタイルを軸にしている" },
  expressive: { label: "表現重視", desc: "自己表現としてのファッションを大切にしている" },
  neutral: { label: "バランス型", desc: "状況に応じた柔軟なスタイリングが強み" },
};

/* ── 1. カラーインサイト ── */
function generateColorInsight(
  items: WardrobeItem[],
  persona: CalendarPersonaProfile | null,
): Insight | null {
  if (!persona?.pcSeason4) return null;

  const boosts = items.map(i => pcColorBoost(persona.pcSeason4, i));
  const avgBoost = boosts.length > 0 ? boosts.reduce((a, b) => a + b, 0) / boosts.length : 0;

  if (avgBoost < 1) return null;

  const pcName = PC_NAMES[persona.pcSeason4] ?? persona.pcSeason4;
  const colorDesc = PC_COLOR_DESC[persona.pcSeason4] ?? "";

  return {
    type: "color",
    icon: "🎨",
    label: "パーソナルカラー",
    text: avgBoost >= 2
      ? `あなたの${pcName}に合った配色で統一。${colorDesc}`
      : `${pcName}の色味を一部取り入れた構成。${colorDesc.split("。")[0]}`,
    priority: avgBoost >= 2 ? 70 : 40,
  };
}

/* ── 2. ペルソナインサイト ── */
function generatePersonaInsight(
  items: WardrobeItem[],
  events: Array<{ event_type: string }>,
  persona: CalendarPersonaProfile | null,
): Insight | null {
  if (!persona || persona.completeness < 20) return null;

  const direction = inferPersonaStyleDirection(persona);
  const dirInfo = STYLE_DIRECTION_DESC[direction];
  if (!dirInfo || direction === "neutral") return null;

  // フォーマリティ分布を確認
  const formalities = items.map(i => i.formality).filter(Boolean);
  const hasDress = formalities.includes("dress");
  const hasCasual = formalities.includes("casual");

  // ミニマル派なのにdressy → 意図的な格上げ
  if (direction === "minimal" && hasDress) {
    return {
      type: "persona",
      icon: "🪞",
      label: "あなたらしさ",
      text: `普段は${dirInfo.label}のあなたに、今日はあえてフォーマリティを上げた提案。${dirInfo.desc}`,
      priority: 65,
    };
  }

  // ボールド派なのにcasual → リラックスモード
  if (direction === "bold" && hasCasual && !hasDress) {
    return {
      type: "persona",
      icon: "🪞",
      label: "あなたらしさ",
      text: `${dirInfo.label}のあなたですが、今日はリラックスモードの提案。オフの日も大切です`,
      priority: 50,
    };
  }

  // 通常: ペルソナに合った提案
  return {
    type: "persona",
    icon: "🪞",
    label: "あなたらしさ",
    text: `${dirInfo.label}の傾向を活かした提案。${dirInfo.desc}`,
    priority: 35,
  };
}

/* ── 3. 学習インサイト ── */
function generateLearningInsight(
  items: WardrobeItem[],
  weather: WeatherDaily | null,
  satisfactionProfile: SatisfactionProfile | null,
): Insight | null {
  if (!satisfactionProfile || satisfactionProfile.dataPoints < 3) return null;

  // 高評価アイテムが含まれているか
  let bestItem: { name: string; avg: number; count: number } | null = null;
  for (const item of items) {
    const data = satisfactionProfile.itemScores.get(item.id);
    if (data && data.avg >= 4 && data.count >= 2) {
      if (!bestItem || data.avg > bestItem.avg) {
        bestItem = { name: item.name ?? item.category, avg: data.avg, count: data.count };
      }
    }
  }

  if (bestItem) {
    return {
      type: "learning",
      icon: "📊",
      label: "学習データ",
      text: `${bestItem.name}は過去${bestItem.count}回の着用で平均満足度${bestItem.avg.toFixed(1)}。お気に入りアイテムです`,
      priority: 75,
    };
  }

  // 低評価アイテム警告
  for (const item of items) {
    const data = satisfactionProfile.itemScores.get(item.id);
    if (data && data.avg <= 2 && data.count >= 2) {
      return {
        type: "learning",
        icon: "📊",
        label: "学習データ",
        text: `${item.name ?? item.category}は過去の着用で低評価が続いています。他のアイテムも検討を`,
        priority: 80,
      };
    }
  }

  // データポイント数に応じた一般メッセージ
  if (satisfactionProfile.dataPoints >= 14) {
    return {
      type: "learning",
      icon: "📊",
      label: "学習データ",
      text: `${satisfactionProfile.dataPoints}日分のデータから最適化された提案です`,
      priority: 25,
    };
  }

  return null;
}

/* ── 4. リスクインサイト ── */
function generateRiskInsight(
  weather: WeatherDaily | null,
): Insight | null {
  if (!weather) return null;

  const tempRange = (weather.temp_max ?? 0) - (weather.temp_min ?? 0);

  if (tempRange >= 12) {
    return {
      type: "risk",
      icon: "🌡️",
      label: "寒暖差対策",
      text: `気温差${tempRange}°あるので、脱ぎ着できるレイヤードを提案。午後は暖かくなります`,
      priority: 85,
    };
  }

  if (weather.weather_icon === "rain" || weather.weather_icon === "storm") {
    return {
      type: "risk",
      icon: "☔",
      label: "天候対策",
      text: weather.pop_max && weather.pop_max >= 70
        ? `降水確率${weather.pop_max}%。防水アイテムと暗色系を優先しました`
        : "雨予報のため、撥水性のあるアイテムを選びました",
      priority: 80,
    };
  }

  if (weather.temp_max != null && weather.temp_max >= 30) {
    return {
      type: "risk",
      icon: "🔥",
      label: "暑さ対策",
      text: "猛暑日の予報。通気性のある薄手素材を中心に構成しました",
      priority: 75,
    };
  }

  if (weather.temp_min != null && weather.temp_min <= 0) {
    return {
      type: "risk",
      icon: "🥶",
      label: "防寒対策",
      text: "氷点下の予報。保温性を最優先した構成です",
      priority: 75,
    };
  }

  return null;
}

/* ── 5. ローテーションインサイト ── */
function generateRotationInsight(
  items: WardrobeItem[],
  satisfactionProfile: SatisfactionProfile | null,
): Insight | null {
  const history = loadWornHistory();
  if (history.length < 7) return null;

  const today = new Date().toISOString().split("T")[0];

  for (const item of items) {
    // 最後に着た日を確認
    let lastWorn: string | null = null;
    for (const record of history) {
      if (record.itemIds.includes(item.id)) {
        if (!lastWorn || record.date > lastWorn) lastWorn = record.date;
      }
    }

    if (!lastWorn) continue;

    // 2週間以上未着用
    const daysSinceWorn = Math.floor((new Date(today).getTime() - new Date(lastWorn).getTime()) / (1000 * 60 * 60 * 24));
    if (daysSinceWorn >= 14) {
      const satData = satisfactionProfile?.itemScores.get(item.id);
      const isHighRated = satData && satData.avg >= 4;

      return {
        type: "rotation",
        icon: "🔄",
        label: "ローテーション",
        text: isHighRated
          ? `${item.name ?? item.category}は${daysSinceWorn}日間未着用。高評価アイテムの出番です`
          : `${item.name ?? item.category}は${daysSinceWorn}日ぶり。ワードローブの幅を活かした提案`,
        priority: isHighRated ? 60 : 35,
      };
    }
  }

  return null;
}

/* ── 6. 矛盾インサイト ── */
function generateContradictionInsight(
  items: WardrobeItem[],
  events: Array<{ event_type: string }>,
  persona: CalendarPersonaProfile | null,
): Insight | null {
  if (!persona || persona.completeness < 30) return null;

  const direction = inferPersonaStyleDirection(persona);
  const hasDate = events.some(e => e.event_type === "date");
  const hasParty = events.some(e => e.event_type === "party");

  // ミニマル派 × デート/パーティ → 華やかさの提案
  if (direction === "minimal" && (hasDate || hasParty)) {
    return {
      type: "contradiction",
      icon: "✨",
      label: "新しい一面",
      text: hasDate
        ? "普段はミニマル派ですが、デートではいつもと違う華やかさが新鮮かも"
        : "ミニマルスタイルをベースに、パーティー向けのアクセントを加えました",
      priority: 55,
    };
  }

  // ボールド派 × 仕事/ミーティング → 抑えめの提案
  if (direction === "bold" && events.some(e => e.event_type === "meeting" || e.event_type === "work")) {
    return {
      type: "contradiction",
      icon: "✨",
      label: "新しい一面",
      text: "大胆派のあなたですが、ビジネスシーンではさりげない個性が光ります",
      priority: 50,
    };
  }

  return null;
}

/* ── 7. 季節遷移インサイト ── */
function generateSeasonalInsight(
  seasonBlend: SeasonBlend,
  weather: WeatherDaily | null,
): Insight | null {
  if (!seasonBlend.shoulderSeason || !seasonBlend.secondary) return null;

  const seasonNames: Record<string, string> = {
    spring: "春", summer: "夏", autumn: "秋", winter: "冬",
  };

  const from = seasonNames[seasonBlend.primary] ?? seasonBlend.primary;
  const to = seasonNames[seasonBlend.secondary] ?? seasonBlend.secondary;

  const tempRange = weather && weather.temp_max != null && weather.temp_min != null
    ? weather.temp_max - weather.temp_min
    : 0;

  if (tempRange >= 10) {
    return {
      type: "seasonal_transition",
      icon: "🌸",
      label: "季節の変わり目",
      text: `${from}から${to}への移行期。朝はアウターが必要ですが、昼は脱いでも成立する構成にしました`,
      priority: 70,
    };
  }

  return {
    type: "seasonal_transition",
    icon: "🌸",
    label: "季節の変わり目",
    text: `${from}→${to}の遷移期。両方の季節のアイテムを混ぜて最適なバランスに`,
    priority: 45,
  };
}

/* ── 8. 時間パターンインサイト ── */
function generateTemporalInsight(
  temporal: TemporalProfile | null,
  dayOfWeek: number,
): Insight | null {
  if (!temporal) return null;

  const dowProfile = temporal.dayOfWeekProfiles[dayOfWeek];
  const dayLabel = ["日", "月", "火", "水", "木", "金", "土"][dayOfWeek];

  // 曜日別の満足度傾向
  if (dowProfile && dowProfile.sampleCount >= 4 && dowProfile.avgSatisfaction >= 4) {
    return {
      type: "temporal",
      icon: "📅",
      label: "曜日パターン",
      text: `${dayLabel}曜日は平均満足度${dowProfile.avgSatisfaction.toFixed(1)}。得意な曜日です`,
      priority: 30,
    };
  }

  // 直近のトレンド
  if (temporal.recentTrendDirection === "improving" && temporal.recentAvgSatisfaction >= 3.5) {
    return {
      type: "temporal",
      icon: "📈",
      label: "成長トレンド",
      text: `最近の満足度が上昇中（平均${temporal.recentAvgSatisfaction.toFixed(1)}）。スタイルが定まってきています`,
      priority: 45,
    };
  }

  if (temporal.recentTrendDirection === "declining") {
    return {
      type: "temporal",
      icon: "📉",
      label: "マンネリ検知",
      text: "最近の満足度が低下傾向。いつもと違うスタイルを試してみては",
      priority: 55,
    };
  }

  // 平日 vs 週末ギャップ
  const { weekdayAvg, weekendAvg } = temporal.weekdayVsWeekend;
  if (weekdayAvg > 0 && weekendAvg > 0 && Math.abs(weekdayAvg - weekendAvg) >= 1) {
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const better = weekdayAvg > weekendAvg ? "平日" : "週末";
    if ((isWeekend && weekendAvg < weekdayAvg) || (!isWeekend && weekdayAvg < weekendAvg)) {
      return {
        type: "temporal",
        icon: "📅",
        label: "週パターン",
        text: `${better}の方が満足度が高い傾向。今日は${better}のスタイルを意識した提案`,
        priority: 25,
      };
    }
  }

  return null;
}

/* ── 9. コンボインサイト ── */
function generateComboInsight(
  items: WardrobeItem[],
  comboGraph: ComboGraph | null,
): Insight | null {
  if (!comboGraph || comboGraph.totalEdges < 3) return null;

  // 今回の提案に含まれるベストペア
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const edge = comboGraph.edges.get(
        items[i].id < items[j].id ? `${items[i].id}|${items[j].id}` : `${items[j].id}|${items[i].id}`
      );
      if (edge && edge.affinity >= 50 && edge.wearCount >= 2) {
        return {
          type: "combo",
          icon: "💎",
          label: "黄金コンビ",
          text: `${items[i].name ?? items[i].category} × ${items[j].name ?? items[j].category} は${edge.wearCount}回着用で平均${edge.avgSatisfaction}の実績ペア`,
          priority: 65,
        };
      }
      if (edge && edge.affinity <= -30 && edge.wearCount >= 2) {
        return {
          type: "combo",
          icon: "⚡",
          label: "相性注意",
          text: `${items[i].name ?? items[i].category} × ${items[j].name ?? items[j].category} は過去に相性が悪かった組み合わせ`,
          priority: 70,
        };
      }
    }
  }

  return null;
}

/* ── 10. 素材インサイト ── */
function generateMaterialInsight(
  items: WardrobeItem[],
  extWeather: ExtendedWeatherContext | null,
): Insight | null {
  if (!extWeather) return null;

  let bestItem: { name: string; material: string; score: number } | null = null;
  let worstItem: { name: string; material: string; score: number; reason: string } | null = null;

  const materialJaMap: Record<string, string> = {
    cotton: "コットン", linen: "リネン", wool: "ウール", cashmere: "カシミヤ",
    silk: "シルク", polyester: "ポリエステル", nylon: "ナイロン", denim: "デニム",
    leather: "レザー", down: "ダウン", fleece: "フリース", "gore-tex": "ゴアテックス",
    mesh: "メッシュ", knit: "ニット", tweed: "ツイード",
  };

  for (const item of items) {
    const material = inferMaterial(item);
    if (material === "unknown") continue;
    const { score, reasons } = scoreMaterialWeather(material, extWeather);

    if (score >= 2 && (!bestItem || score > bestItem.score)) {
      bestItem = { name: item.name ?? item.category, material: materialJaMap[material] ?? material, score };
    }
    if (score <= -2 && (!worstItem || score < worstItem.score)) {
      worstItem = { name: item.name ?? item.category, material: materialJaMap[material] ?? material, score, reason: reasons[0] ?? "" };
    }
  }

  if (worstItem) {
    return {
      type: "material",
      icon: "🧵",
      label: "素材アラート",
      text: worstItem.reason || `${worstItem.name}の${worstItem.material}が今日の天候に合わない可能性`,
      priority: 72,
    };
  }

  if (bestItem) {
    return {
      type: "material",
      icon: "🧵",
      label: "素材マッチ",
      text: `${bestItem.name}の${bestItem.material}は今日の天候に最適な素材`,
      priority: 35,
    };
  }

  return null;
}

/* ── 11. Aneurasync 深層インサイト ── */
function generateAneurasyncInsight(
  observation: ObservationContext | null,
  adaptation: OutfitAdaptation | null,
): Insight | null {
  if (!observation || observation.confidence < 0.2 || !adaptation || !adaptation.reason) return null;

  return {
    type: "aneurasync",
    icon: "🔮",
    label: "内面観測",
    text: adaptation.reason,
    priority: observation.confidence >= 0.5 ? 60 : 35,
  };
}

/* ── メイン: インサイト生成 ── */
export function generateInsights(
  items: WardrobeItem[],
  weather: WeatherDaily | null,
  events: Array<{ event_type: string }>,
  persona: CalendarPersonaProfile | null,
  satisfactionProfile: SatisfactionProfile | null,
  seasonBlend: SeasonBlend,
  extendedOptions?: {
    temporal?: TemporalProfile | null;
    comboGraph?: ComboGraph | null;
    extWeather?: ExtendedWeatherContext | null;
    observation?: ObservationContext | null;
    adaptation?: OutfitAdaptation | null;
    dayOfWeek?: number;
  } | null,
): Insight[] {
  const ext = extendedOptions ?? {};

  const generators = [
    () => generateColorInsight(items, persona),
    () => generatePersonaInsight(items, events, persona),
    () => generateLearningInsight(items, weather, satisfactionProfile),
    () => generateRiskInsight(weather),
    () => generateRotationInsight(items, satisfactionProfile),
    () => generateContradictionInsight(items, events, persona),
    () => generateSeasonalInsight(seasonBlend, weather),
    // Phase 6: 新インサイトジェネレータ
    () => generateTemporalInsight(ext.temporal ?? null, ext.dayOfWeek ?? new Date().getDay()),
    () => generateComboInsight(items, ext.comboGraph ?? null),
    () => generateMaterialInsight(items, ext.extWeather ?? null),
    () => generateAneurasyncInsight(ext.observation ?? null, ext.adaptation ?? null),
  ];

  const insights: Insight[] = [];
  for (const gen of generators) {
    const insight = gen();
    if (insight) insights.push(insight);
  }

  // priority 降順、最大6個 (新インサイトも表示できるよう拡張)
  return insights.sort((a, b) => b.priority - a.priority).slice(0, 6);
}
