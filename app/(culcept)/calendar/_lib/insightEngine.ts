/**
 * インサイトエンジン v2
 *
 * 設計原則:
 * - 毎日3秒で答えが見える（practical tier）
 * - 時々だけ「たしかに」と刺さる（self-understanding tier, データ裏付けが強い時だけ）
 * - イベント日は印象示唆が添えられる（impression tier）
 * - 相手不在で関係性を匂わせない
 * - 根拠の弱い気づきを出さない
 */

import type { WardrobeItem } from "@/app/my-style/_lib/types";
import type { WeatherDaily, SatisfactionProfile, SeasonBlend, Insight, InsightType, InsightTier } from "./types";
import type { CalendarPersonaProfile } from "./personaBoost";
import { pcColorBoost, inferPersonaStyleDirection } from "./personaBoost";
import { loadWornHistory } from "./rotationTracker";
import type { TemporalProfile } from "./temporalPatterns";
import type { ComboGraph } from "./comboGraph";
import { getBestPartners } from "./comboGraph";
import type { ExtendedWeatherContext } from "./materialWeather";
import { inferMaterial, scoreMaterialWeather } from "./materialWeather";
import type { ObservationContext, OutfitAdaptation } from "./aneurasyncIntegration";
import type { GenomeRelationshipContext } from "./genomeRelationship";
import { generateGenomeRelationshipInsight } from "./genomeRelationship";

/* ── 定数 ── */

const PC_NAMES: Record<string, string> = {
  spring: "スプリング",
  summer: "サマー",
  autumn: "オータム",
  winter: "ウィンター",
};

const STYLE_DIRECTION_DESC: Record<string, { label: string; short: string }> = {
  minimal: { label: "シンプル派", short: "引き算" },
  bold: { label: "大胆派", short: "攻め" },
  classic: { label: "定番派", short: "安定" },
  expressive: { label: "表現派", short: "個性" },
  neutral: { label: "バランス型", short: "柔軟" },
};

/* ── ヘルパー ── */

function ins(
  type: InsightType,
  tier: InsightTier,
  icon: string,
  label: string,
  text: string,
  priority: number,
  confidence: number,
): Insight {
  return { type, tier, icon, label, text, priority, confidence };
}

/* ═══════════════════════════════════════════
   PRACTICAL TIER — 実用（毎日表示）
   ═══════════════════════════════════════════ */

/* ── 1. リスクインサイト ── */
function generateRiskInsight(weather: WeatherDaily | null): Insight | null {
  if (!weather) return null;

  const tempRange = (weather.temp_max ?? 0) - (weather.temp_min ?? 0);

  if (tempRange >= 12) {
    return ins("risk", "practical", "🌡️", "寒暖差", `朝晩で${tempRange}°の差。脱ぎ着できる構成にしました`, 85, 1);
  }

  if (weather.weather_icon === "rain" || weather.weather_icon === "storm") {
    const msg = weather.pop_max && weather.pop_max >= 70
      ? `降水確率${weather.pop_max}%。汚れにくい暗色系＋撥水素材を優先`
      : "雨予報。撥水性のあるアイテムを選んでいます";
    return ins("risk", "practical", "☔", "雨対策", msg, 80, 1);
  }

  if (weather.temp_max != null && weather.temp_max >= 30) {
    return ins("risk", "practical", "🔥", "暑さ対策", "猛暑日。通気性のある薄手素材を中心に", 75, 1);
  }

  if (weather.temp_min != null && weather.temp_min <= 0) {
    return ins("risk", "practical", "🥶", "防寒", "氷点下の予報。保温性を最優先", 75, 1);
  }

  return null;
}

/* ── 1b. 天候コンフォートインサイト（リスクがない日の実用理由） ── */
function generateWeatherComfortInsight(
  weather: WeatherDaily | null,
  items: WardrobeItem[],
): Insight {
  // 天気データがある場合
  if (weather) {
    const temp = weather.temp_max ?? weather.temp_min ?? null;
    const icon = weather.weather_icon;

    if (icon === "snow") {
      return ins("risk", "practical", "❄️", "雪の日",
        "レイヤードで温度調整。暖かさを確保しつつ動きやすく", 60, 1);
    }
    if (temp !== null) {
      if (temp >= 30) {
        return ins("risk", "practical", "🔥", "暑さ対策",
          "通気性のいい素材を中心に。淡色で涼しげな印象", 60, 1);
      }
      if (temp >= 25) {
        return ins("risk", "practical", "🌿", "気温に合わせて",
          `最高${temp}°。軽めの素材でリラックスできる構成`, 45, 1);
      }
      if (temp >= 15) {
        return ins("risk", "practical", "🍂", "気温に合わせて",
          `最高${temp}°。薄手アウターの重ね着がちょうどいい気温帯`, 45, 1);
      }
      if (temp >= 5) {
        return ins("risk", "practical", "🧥", "気温に合わせて",
          `最高${temp}°。コートと暖かめのインナーで快適に`, 50, 1);
      }
      return ins("risk", "practical", "🥶", "防寒",
        `最高${temp}°。最大限の防寒構成`, 55, 1);
    }
    // 気温データなし、天気アイコンのみ
    if (icon === "sun") {
      return ins("risk", "practical", "☀️", "今日の天気",
        "晴れの日。好きなスタイルを楽しめる一日", 30, 0.8);
    }
    if (icon === "cloud") {
      return ins("risk", "practical", "☁️", "今日の天気",
        "曇り空。急な天候変化に備えて、羽織れるものがあると安心", 35, 0.8);
    }
  }

  // 天気データなし → アイテム構成から理由を生成
  const categories = items.map(i => i.categoryMain || i.category).filter(Boolean);
  const hasOuter = categories.some(c => c === "outer" || c === "outerwear");
  if (hasOuter) {
    return ins("risk", "practical", "🧥", "今日のスタイル",
      "アウターを含めた重ね着構成。温度調整しやすいバランス", 25, 0.7);
  }

  return ins("risk", "practical", "👔", "今日のスタイル",
    "手持ちのアイテムからバランスの良い組み合わせを選びました", 20, 0.7);
}

/* ── 2. 素材×天候インサイト ── */
function generateMaterialInsight(
  items: WardrobeItem[],
  extWeather: ExtendedWeatherContext | null,
): Insight | null {
  if (!extWeather) return null;

  const materialJaMap: Record<string, string> = {
    cotton: "コットン", linen: "リネン", wool: "ウール", cashmere: "カシミヤ",
    silk: "シルク", polyester: "ポリエステル", nylon: "ナイロン", denim: "デニム",
    leather: "レザー", down: "ダウン", fleece: "フリース", "gore-tex": "ゴアテックス",
    mesh: "メッシュ", knit: "ニット", tweed: "ツイード",
  };

  let worstItem: { name: string; material: string; score: number; reason: string } | null = null;
  let bestItem: { name: string; material: string; score: number } | null = null;

  for (const item of items) {
    const material = inferMaterial(item);
    if (material === "unknown") continue;
    const { score, reasons } = scoreMaterialWeather(material, extWeather);
    if (score <= -2 && (!worstItem || score < worstItem.score)) {
      worstItem = { name: item.name ?? item.category, material: materialJaMap[material] ?? material, score, reason: reasons[0] ?? "" };
    }
    if (score >= 2 && (!bestItem || score > bestItem.score)) {
      bestItem = { name: item.name ?? item.category, material: materialJaMap[material] ?? material, score };
    }
  }

  if (worstItem) {
    return ins("material", "practical", "🧵", "素材注意",
      worstItem.reason || `${worstItem.name}の${worstItem.material}、今日の天候だと不快かも`,
      72, 0.9);
  }

  if (bestItem) {
    return ins("material", "practical", "🧵", "素材◎",
      `${bestItem.name}の${bestItem.material}、今日の湿度・気温にぴったり`,
      35, 0.8);
  }

  return null;
}

/* ── 3. 季節遷移インサイト ── */
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
    ? weather.temp_max - weather.temp_min : 0;

  if (tempRange >= 10) {
    return ins("seasonal_transition", "practical", "🌸", "季節の変わり目",
      `${from}→${to}の移行期。朝はアウター必要、昼は脱いでも成立する構成`,
      70, 0.9);
  }

  return ins("seasonal_transition", "practical", "🌸", "季節の変わり目",
    `${from}と${to}のアイテムを混ぜて、今の気候に合わせました`,
    45, 0.8);
}

/* ── 4. カラーインサイト ── */
function generateColorInsight(
  items: WardrobeItem[],
  persona: CalendarPersonaProfile | null,
): Insight | null {
  if (!persona?.pcSeason4) return null;

  const boosts = items.map(i => pcColorBoost(persona.pcSeason4, i));
  const avgBoost = boosts.length > 0 ? boosts.reduce((a, b) => a + b, 0) / boosts.length : 0;
  if (avgBoost < 1) return null;

  const pcName = PC_NAMES[persona.pcSeason4] ?? persona.pcSeason4;

  return ins("color", "practical", "🎨", "パーソナルカラー",
    avgBoost >= 2
      ? `${pcName}タイプの肌に映える配色。顔色が明るく見えます`
      : `${pcName}の色味を取り入れた構成`,
    avgBoost >= 2 ? 55 : 30, 0.7);
}

/* ═══════════════════════════════════════════
   SELF-UNDERSTANDING TIER — 自己理解（条件付き）

   表示条件:
   - confidence >= 0.6 でないと表示しない
   - データポイントが十分でないと生成しない
   ═══════════════════════════════════════════ */

/* ── 5. ペルソナインサイト ── */
function generatePersonaInsight(
  items: WardrobeItem[],
  events: Array<{ event_type: string }>,
  persona: CalendarPersonaProfile | null,
): Insight | null {
  // 厳格化: completeness 40以上で初めて出す（旧: 20）
  if (!persona || persona.completeness < 40) return null;

  const direction = inferPersonaStyleDirection(persona);
  const dirInfo = STYLE_DIRECTION_DESC[direction];
  if (!dirInfo || direction === "neutral") return null;

  const conf = Math.min(1, persona.completeness / 80); // 80で確信度1.0

  const formalities = items.map(i => i.formality).filter(Boolean);
  const hasDress = formalities.includes("dress");
  const hasCasual = formalities.includes("casual");

  // ミニマル派なのにdressy → 意図的な格上げ（矛盾＝気づき）
  if (direction === "minimal" && hasDress) {
    return ins("persona", "self-understanding", "🪞", "あなたらしさ",
      "ふだんは引き算が得意なあなた。今日はあえて足し算してみる提案",
      65, conf);
  }

  // ボールド派なのにcasual → リラックスモード
  if (direction === "bold" && hasCasual && !hasDress) {
    return ins("persona", "self-understanding", "🪞", "あなたらしさ",
      "攻めたスタイルが多いあなたに、今日はあえてリラックス寄り",
      50, conf);
  }

  // 通常: 傾向一致 → priority低め（当たり前のことは言わない）
  return ins("persona", "self-understanding", "🪞", "あなたらしさ",
    `${dirInfo.label}のあなたに合わせた構成。${dirInfo.short}が活きています`,
    25, conf);
}

/* ── 6. 学習インサイト ── */
function generateLearningInsight(
  items: WardrobeItem[],
  weather: WeatherDaily | null,
  satisfactionProfile: SatisfactionProfile | null,
): Insight | null {
  // 厳格化: 7日以上のデータで初めて出す（旧: 3）
  if (!satisfactionProfile || satisfactionProfile.dataPoints < 7) return null;

  const conf = Math.min(1, satisfactionProfile.dataPoints / 21); // 3週間で確信度1.0

  // 高評価アイテムが含まれている（回数も厳格化: 3回以上）
  let bestItem: { name: string; avg: number; count: number } | null = null;
  for (const item of items) {
    const data = satisfactionProfile.itemScores.get(item.id);
    if (data && data.avg >= 4 && data.count >= 3) {
      if (!bestItem || data.avg > bestItem.avg) {
        bestItem = { name: item.name ?? item.category, avg: data.avg, count: data.count };
      }
    }
  }

  if (bestItem) {
    return ins("learning", "self-understanding", "📊", "学んだこと",
      `${bestItem.name}、着るたびに満足度が高い。あなたの鉄板アイテム`,
      75, conf);
  }

  // 低評価アイテム警告（こちらは回数3回以上で確度高い）
  for (const item of items) {
    const data = satisfactionProfile.itemScores.get(item.id);
    if (data && data.avg <= 2 && data.count >= 3) {
      return ins("learning", "self-understanding", "📊", "学んだこと",
        `${item.name ?? item.category}、過去の着用で満足度が低め。別アイテムも検討を`,
        80, conf);
    }
  }

  // 十分なデータ蓄積の実感（14日以上）
  if (satisfactionProfile.dataPoints >= 14) {
    return ins("learning", "self-understanding", "📊", "学習中",
      `${satisfactionProfile.dataPoints}日分のあなたの好みを学んだ提案`,
      20, conf);
  }

  return null;
}

/* ── 7. ローテーションインサイト ── */
function generateRotationInsight(
  items: WardrobeItem[],
  satisfactionProfile: SatisfactionProfile | null,
): Insight | null {
  const history = loadWornHistory();
  if (history.length < 7) return null;

  const today = new Date().toISOString().split("T")[0];

  for (const item of items) {
    let lastWorn: string | null = null;
    for (const record of history) {
      if (record.itemIds.includes(item.id)) {
        if (!lastWorn || record.date > lastWorn) lastWorn = record.date;
      }
    }
    if (!lastWorn) continue;

    const daysSinceWorn = Math.floor((new Date(today).getTime() - new Date(lastWorn).getTime()) / (1000 * 60 * 60 * 24));
    if (daysSinceWorn >= 14) {
      const satData = satisfactionProfile?.itemScores.get(item.id);
      const isHighRated = satData && satData.avg >= 4;

      return ins("rotation", "practical", "🔄", "ローテーション",
        isHighRated
          ? `${item.name ?? item.category}、${daysSinceWorn}日ぶり。好きなアイテムの出番`
          : `${item.name ?? item.category}、${daysSinceWorn}日ぶり。眠っていたアイテムを活用`,
        isHighRated ? 60 : 35, 0.8);
    }
  }

  return null;
}

/* ── 8. 矛盾インサイト（新しい一面） ── */
function generateContradictionInsight(
  items: WardrobeItem[],
  events: Array<{ event_type: string }>,
  persona: CalendarPersonaProfile | null,
): Insight | null {
  // 厳格化: completeness 40以上
  if (!persona || persona.completeness < 40) return null;

  const direction = inferPersonaStyleDirection(persona);
  const hasDate = events.some(e => e.event_type === "date");
  const hasParty = events.some(e => e.event_type === "party");
  const conf = Math.min(1, persona.completeness / 80);

  if (direction === "minimal" && (hasDate || hasParty)) {
    return ins("contradiction", "self-understanding", "✨", "いつもと違う面",
      hasDate
        ? "ふだんシンプル派のあなたが、少し華やかさを足す日"
        : "ミニマルをベースに、パーティ向けのアクセントを1点",
      55, conf);
  }

  if (direction === "bold" && events.some(e => e.event_type === "meeting" || e.event_type === "work")) {
    return ins("contradiction", "self-understanding", "✨", "いつもと違う面",
      "大胆派のあなたが、さりげなく個性を出すビジネススタイル",
      50, conf);
  }

  return null;
}

/* ── 9. 時間パターンインサイト ── */
function generateTemporalInsight(
  temporal: TemporalProfile | null,
  dayOfWeek: number,
): Insight | null {
  if (!temporal) return null;

  const dayLabel = ["日", "月", "火", "水", "木", "金", "土"][dayOfWeek];

  // 曜日別（厳格化: 6回以上で初めて出す）
  const dowProfile = temporal.dayOfWeekProfiles[dayOfWeek];
  if (dowProfile && dowProfile.sampleCount >= 6 && dowProfile.avgSatisfaction >= 4) {
    const conf = Math.min(1, dowProfile.sampleCount / 12);
    return ins("temporal", "self-understanding", "📅", "あなたのパターン",
      `${dayLabel}曜日、コーデの調子がいい傾向。この流れに乗った提案`,
      35, conf);
  }

  // 上昇トレンド（厳格化: 3.8以上）
  if (temporal.recentTrendDirection === "improving" && temporal.recentAvgSatisfaction >= 3.8) {
    return ins("temporal", "self-understanding", "📈", "上昇中",
      "最近の満足度が上がっている。スタイルが定まってきた証拠",
      50, 0.7);
  }

  // 下降トレンド
  if (temporal.recentTrendDirection === "declining") {
    return ins("temporal", "self-understanding", "📉", "マンネリ気味",
      "最近同じパターンが続いている。いつもと違うスタイルを試してみては",
      55, 0.6);
  }

  // 平日 vs 週末ギャップ（厳格化）
  const { weekdayAvg, weekendAvg } = temporal.weekdayVsWeekend;
  if (weekdayAvg > 0 && weekendAvg > 0 && Math.abs(weekdayAvg - weekendAvg) >= 1.2) {
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const better = weekdayAvg > weekendAvg ? "平日" : "週末";
    if ((isWeekend && weekendAvg < weekdayAvg) || (!isWeekend && weekdayAvg < weekendAvg)) {
      return ins("temporal", "self-understanding", "📅", "あなたのパターン",
        `${better}の方がコーデの満足度が高い傾向。今日は${better}モードを意識`,
        30, 0.6);
    }
  }

  return null;
}

/* ── 10. コンボインサイト ── */
function generateComboInsight(
  items: WardrobeItem[],
  comboGraph: ComboGraph | null,
): Insight | null {
  if (!comboGraph || comboGraph.totalEdges < 5) return null; // 厳格化: 5エッジ以上

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const key = items[i].id < items[j].id ? `${items[i].id}|${items[j].id}` : `${items[j].id}|${items[i].id}`;
      const edge = comboGraph.edges.get(key);

      // 黄金コンビ（厳格化: 3回以上 + 親和性60以上）
      if (edge && edge.affinity >= 60 && edge.wearCount >= 3) {
        const conf = Math.min(1, edge.wearCount / 6);
        return ins("combo", "self-understanding", "💎", "鉄板の組み合わせ",
          `${items[i].name ?? items[i].category} × ${items[j].name ?? items[j].category}、着るたびに好評な組み合わせ`,
          65, conf);
      }

      // 相性注意（厳格化: 3回以上）
      if (edge && edge.affinity <= -30 && edge.wearCount >= 3) {
        const conf = Math.min(1, edge.wearCount / 6);
        return ins("combo", "self-understanding", "⚡", "相性注意",
          `${items[i].name ?? items[i].category} × ${items[j].name ?? items[j].category}、過去に満足度が低かった組み合わせ`,
          70, conf);
      }
    }
  }

  return null;
}

/* ── 11. Aneurasync 深層インサイト ── */
function generateAneurasyncInsight(
  observation: ObservationContext | null,
  adaptation: OutfitAdaptation | null,
): Insight | null {
  // 厳格化: confidence 0.4以上で初めて出す（旧: 0.2）
  if (!observation || observation.confidence < 0.4 || !adaptation || !adaptation.reason) return null;

  return ins("aneurasync", "self-understanding", "🔮", "内面からの提案",
    adaptation.reason,
    observation.confidence >= 0.6 ? 60 : 35,
    observation.confidence);
}

/* ═══════════════════════════════════════════
   IMPRESSION TIER — 印象示唆（イベント日のみ）

   ルール:
   - イベント型がある日にのみ表示
   - 相手が不在の場合、関係性は匂わせない
   - 場面に合った自分の出し方として表現
   ═══════════════════════════════════════════ */

/** イベント型ごとの印象示唆 */
const EVENT_IMPRESSION: Record<string, { icon: string; text: string; priority: number }> = {
  date:      { icon: "💐", text: "清潔感と柔らかさのバランスを意識した提案。自然体で好印象が残る構成", priority: 62 },
  interview: { icon: "🤝", text: "信頼感を前面に出す構成。落ち着きと誠実さが伝わるように", priority: 65 },
  meeting:   { icon: "💼", text: "ビジネスの場にふさわしい信頼感。個性は控えめに、清潔感を主役に", priority: 58 },
  formal:    { icon: "🎩", text: "格式に合わせつつ、あなたらしさを1点だけ。品格のある構成", priority: 63 },
  party:     { icon: "🥂", text: "少し攻めた華やかさ。場を楽しむ気持ちが表に出る構成", priority: 55 },
  friends:   { icon: "☕", text: "あなたらしさ全開の日。気負わず、でも手は抜かない", priority: 45 },
  outdoor:   { icon: "🏕️", text: "動きやすさ最優先。機能的だけど、だらしなく見えない構成", priority: 50 },
  sports:    { icon: "🏃", text: "パフォーマンス重視。通気性と動きやすさを最大化", priority: 48 },
  travel:    { icon: "✈️", text: "長時間快適に過ごせて、到着先でもそのまま動ける構成", priority: 52 },
};

function generateImpressionInsight(
  events: Array<{ event_type: string }>,
): Insight | null {
  if (events.length === 0) return null;

  // 最もフォーマリティが高いイベントを優先
  const priorityOrder = ["formal", "interview", "date", "meeting", "party", "travel", "outdoor", "friends", "sports"];
  let bestEvent: string | null = null;
  for (const order of priorityOrder) {
    if (events.some(e => e.event_type === order)) {
      bestEvent = order;
      break;
    }
  }
  if (!bestEvent) return null;

  const imp = EVENT_IMPRESSION[bestEvent];
  if (!imp) return null;

  return ins("impression", "impression", imp.icon, "今日の場面",
    imp.text, imp.priority, 0.9);
}

/* ═══════════════════════════════════════════
   メイン: インサイト生成 & フィルタリング
   ═══════════════════════════════════════════ */

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
    genomeRelationship?: GenomeRelationshipContext | null;
  } | null,
): Insight[] {
  const ext = extendedOptions ?? {};

  /* ── 全候補を生成 ── */
  const candidates: (Insight | null)[] = [
    // Practical
    generateRiskInsight(weather),
    generateMaterialInsight(items, ext.extWeather ?? null),
    generateSeasonalInsight(seasonBlend, weather),
    generateColorInsight(items, persona),
    generateRotationInsight(items, satisfactionProfile),
    // Self-understanding
    generatePersonaInsight(items, events, persona),
    generateLearningInsight(items, weather, satisfactionProfile),
    generateContradictionInsight(items, events, persona),
    generateTemporalInsight(ext.temporal ?? null, ext.dayOfWeek ?? new Date().getDay()),
    generateComboInsight(items, ext.comboGraph ?? null),
    generateAneurasyncInsight(ext.observation ?? null, ext.adaptation ?? null),
    // Impression
    generateImpressionInsight(events),
    // Layer 3: Genome連携（条件付き — 全条件を満たした時のみ発火）
    generateGenomeRelationshipInsight(events, ext.genomeRelationship ?? null),
  ];

  const candidateCount = candidates.filter(c => c !== null).length;

  /* ── フィルタリング ── */
  const insights: Insight[] = [];
  for (const c of candidates) {
    if (!c) continue;

    // self-understanding tier は confidence 0.6 未満をカット
    if (c.tier === "self-understanding" && c.confidence < 0.6) continue;

    insights.push(c);
  }

  /* ── practical が0件なら天候コンフォートをフォールバック ── */
  const hasPractical = insights.some(i => i.tier === "practical");
  if (!hasPractical) {
    insights.push(generateWeatherComfortInsight(weather, items));
  }

  /* ── ソート: priority降順 ── */
  insights.sort((a, b) => b.priority - a.priority);

  /* ── 上限: practical無制限、self-understanding最大2、impression最大1、genome_relationship最大1 ── */
  const result: Insight[] = [];
  let selfCount = 0;
  let impCount = 0;
  let genomeCount = 0;

  for (const insight of insights) {
    if (insight.tier === "self-understanding") {
      if (selfCount >= 2) continue;
      selfCount++;
    }
    if (insight.tier === "impression") {
      // genome_relationship はimpression層だが独立カウント（上乗せ設計）
      if (insight.type === "genome_relationship") {
        if (genomeCount >= 1) continue;
        genomeCount++;
      } else {
        if (impCount >= 1) continue;
        impCount++;
      }
    }
    result.push(insight);
    if (result.length >= 7) break; // genome_relationship枠で+1
  }

  // Shadow log 用メタデータを結果に添付
  (result as InsightResult).__candidateCount = candidateCount;
  return result;
}

/** Shadow log 用: candidateCount を取得するヘルパー */
export type InsightResult = Insight[] & { __candidateCount?: number };

export function getInsightCandidateCount(insights: Insight[]): number {
  return (insights as InsightResult).__candidateCount ?? insights.length;
}
