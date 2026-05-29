/**
 * Slice 2 (Option B-5A) — 「このコーデが似合う理由」を実データ寄りに生成 (pure)
 *
 * 役割:
 *   - mock 固定だった理由カードを、 weather(B-2) × OutfitDayContext(B-4A) × engine SYNC(B-4B)
 *     から **構造化生成**する。 ユーザーが「予定・天気・移動・TPO に紐づいて」納得できる状態にする。
 *
 * 設計判断 (CEO/GPT B-5A・privacy 最優先):
 *   - **engine の free-text (`OutfitProposal.reason` / `sync.reasons`) は verbatim で出さない**。
 *       理由: ① engine reason は event 由来で組み立てられ (buildReason)、 将来 event_name を含む変更が
 *             入ると機微予定名が漏れ得る (現状は event_type のみだが防御的に避ける)。
 *             ② 構造化生成の方が安全・安定・温かいトーンにできる。
 *   - 代わりに **構造化シグナルのみ**から 5 因子・headline・body・chips を作る:
 *       weather(数値)・dayContext(B-3 で機微サニタイズ済み reasonTags / has* / maxFormality / mobility)・
 *       engine sync.band(enum、 free-text でない)。
 *   - privacy: 機微カテゴリ(医療/法務/試験)の生値・推測は一切出さない。 formality は「きちんとした場」へ丸める。
 *
 * 不変原則: pure。 副作用 / I/O / engine / DB なし。 5 因子構造を維持 (UI grid-cols-5)。
 */

import type {
  OutfitActivityKind,
  OutfitFormality,
  OutfitMobility,
} from "./anchorsToOutfitEvents";
import type { OutfitDayContext } from "./outfitEventProjection";
import type {
  CalendarOutfitReasonFactor,
  CalendarOutfitReasonVM,
  CalendarOutfitStatusTone,
  CalendarOutfitSyncVM,
  CalendarOutfitWeatherVM,
} from "./types";

interface ReasonInput {
  weather: CalendarOutfitWeatherVM | null;
  dayContext: OutfitDayContext;
  sync: CalendarOutfitSyncVM | null;
}

// ── 気温の快適さラベル ──
function tempComfort(tempMax: number): { label: string; tone: CalendarOutfitStatusTone } {
  if (tempMax >= 30) return { label: "暑い", tone: "caution" };
  if (tempMax >= 25) return { label: "快適", tone: "good" };
  if (tempMax >= 18) return { label: "心地よい", tone: "good" };
  if (tempMax >= 10) return { label: "肌寒い", tone: "caution" };
  return { label: "寒い", tone: "caution" };
}

function mobilityValue(m: OutfitMobility): { value: string; tone: CalendarOutfitStatusTone } {
  switch (m) {
    case "high":
      return { value: "多め", tone: "caution" };
    case "medium":
      return { value: "やや多め", tone: "caution" };
    case "low":
      return { value: "少なめ", tone: "good" };
    case "none":
      return { value: "ほぼなし", tone: "neutral" };
    default:
      return { value: "標準", tone: "neutral" };
  }
}

const ACTIVITY_JA: Record<OutfitActivityKind, string> = {
  meeting: "会議",
  work: "作業",
  meal: "食事",
  social: "お出かけ",
  exercise: "運動",
  move: "移動",
  errand: "用事",
  rest: "休息",
  unknown: "予定",
};

function scheduleValue(ctx: OutfitDayContext): { value: string; tone: CalendarOutfitStatusTone } {
  if (ctx.hasMeeting) return { value: "会議あり", tone: "accent" };
  if (ctx.eventCount === 0) return { value: "予定なし", tone: "neutral" };
  if (ctx.dominantActivity !== "unknown")
    return { value: `${ACTIVITY_JA[ctx.dominantActivity]}中心`, tone: "neutral" };
  return { value: "予定に合わせて", tone: "neutral" };
}

function environmentValue(ctx: OutfitDayContext): { value: string; tone: CalendarOutfitStatusTone } {
  if (ctx.hasCafeWork) return { value: "カフェ作業", tone: "accent" };
  if (ctx.hasMeal) return { value: "外食あり", tone: "neutral" };
  if (ctx.hasOutdoor) return { value: "屋外あり", tone: "neutral" };
  if (ctx.eventCount === 0) return { value: "おうち中心", tone: "neutral" };
  return { value: "屋内中心", tone: "neutral" };
}

function formalityValue(f: OutfitFormality): { value: string; tone: CalendarOutfitStatusTone } {
  switch (f) {
    case "formal":
    case "office":
      return { value: "きちんと感", tone: "accent" };
    case "smart_casual":
      return { value: "程よくきれいめ", tone: "good" };
    case "casual":
      return { value: "リラックス", tone: "neutral" };
    default:
      return { value: "予定に合わせて", tone: "neutral" };
  }
}

// ── headline / body の生成（構造化のみ・機微なし・温かいトーン） ──
function weatherPhrase(weather: CalendarOutfitWeatherVM | null): string {
  if (!weather) return "";
  const rainy = weather.pop >= 50 || weather.label.includes("雨") || weather.label.includes("雷");
  if (rainy) return `${weather.label}模様の一日`;
  if (weather.tempMax >= 28) return `${weather.tempMax}°の暑い一日`;
  if (weather.tempMax >= 20) return `${weather.label}の過ごしやすい一日`;
  if (weather.tempMax >= 10) return `${weather.tempMax}°の少し肌寒い一日`;
  return `${weather.tempMax}°の冷える一日`;
}

function formalityPhrase(f: OutfitFormality): string {
  switch (f) {
    case "formal":
    case "office":
      return "きちんと感を残しつつ";
    case "smart_casual":
      return "程よくきれいめに";
    case "casual":
      return "肩の力を抜いて";
    default:
      return "予定に馴染むように";
  }
}

function schedulePhrase(ctx: OutfitDayContext): string {
  if (ctx.hasMeeting && ctx.hasCafeWork) return "会議とカフェ作業があるので";
  if (ctx.hasMeeting) return "会議があるので";
  if (ctx.hasCafeWork) return "カフェ作業があるので";
  if (ctx.hasMeal) return "外食があるので";
  if (ctx.eventCount > 0 && ctx.dominantActivity !== "unknown")
    return `${ACTIVITY_JA[ctx.dominantActivity]}の予定に合わせて`;
  return "";
}

/**
 * engine 非バック時の「今日の文脈」一文（断定せず参考情報に留める）。
 * mock / 画像ハイドレートの提案を「予定から推薦された」と誤認させないため。
 */
function scheduleContextPhrase(ctx: OutfitDayContext): string {
  if (ctx.hasMeeting) return "会議の予定があります";
  if (ctx.hasCafeWork) return "カフェ作業の予定があります";
  if (ctx.hasMeal) return "外食の予定があります";
  if (ctx.eventCount > 0) return "予定に合わせた装いの参考に";
  return "今日の天気に合わせた装いの参考に";
}

function buildHeadline(input: ReasonInput): string {
  const wp = weatherPhrase(input.weather);
  const lead = wp ? `${wp}。` : "";
  // engine 提案があるとき **だけ**「このコーデを整えた」と言い切る。
  if (input.sync) {
    const sp = schedulePhrase(input.dayContext);
    const fp = formalityPhrase(input.dayContext.maxFormality);
    return sp ? `${lead}${sp}、${fp}整えました。` : `${lead}${fp}整えました。`;
  }
  // mock / 画像ハイドレートの提案時は断定せず、 今日の文脈提示に留める（誤認防止）。
  return `${lead}${scheduleContextPhrase(input.dayContext)}。`;
}

function buildBody(input: ReasonInput): string {
  const wp = weatherPhrase(input.weather);

  // engine 非バック: 「選びました」と言い切らず、 今日の文脈メモに留める。
  if (!input.sync) {
    const bits: string[] = [];
    if (wp) bits.push(wp);
    const sp = schedulePhrase(input.dayContext);
    if (sp) bits.push(sp.replace(/ので$/, "")); // "会議があるので" → "会議がある"
    const detail = bits.length > 0 ? `${bits.join("、")}。` : "";
    return `${detail}今日の予定と天気をまとめました。装いの参考にどうぞ。`;
  }

  // engine バック: 提案として説明してよい。
  const parts: string[] = [];
  if (wp) parts.push(`${wp}の天気に合わせています`);
  const sp = schedulePhrase(input.dayContext);
  if (sp)
    parts.push(
      `${sp}、${input.dayContext.mobility === "high" || input.dayContext.mobility === "medium" ? "動きやすさも意識し" : "TPO に馴染むよう"}選びました`,
    );
  parts.push(`手持ちのアイテムとの相性は「${input.sync.bandLabel}」です`);
  return `${parts.join("。")}。`;
}

function buildAxisChips(input: ReasonInput): Array<{ label: string }> {
  const labels: string[] = [];
  if (input.weather) labels.push(`気温 ${input.weather.tempMax}°に対応`);
  // dayContext.reasonTags は B-3 で機微サニタイズ済み（「会議あり」「きちんとした場」等）
  for (const tag of input.dayContext.reasonTags) labels.push(tag);
  if (input.sync) labels.push(`相性 ${input.sync.bandLabel}`);
  return Array.from(new Set(labels))
    .slice(0, 5)
    .map((label) => ({ label }));
}

/**
 * weather × dayContext × engine sync から理由 VM を生成する。
 *   - 予定も engine も天気も無い → `null`（呼び出し側は mock 理由を維持）。
 *   - それ以外 → 5 因子 + headline + body + chips（すべて構造化・privacy-safe）。
 */
export function buildOutfitReasonVM(input: ReasonInput): CalendarOutfitReasonVM | null {
  const { weather, dayContext, sync } = input;

  // gate: 予定なし AND engine なし AND 天気なし → 生成材料が無い → mock 維持
  if (dayContext.eventCount === 0 && !sync && !weather) return null;

  const tempFactor: CalendarOutfitReasonFactor = weather
    ? (() => {
        const c = tempComfort(weather.tempMax);
        return { id: "rf-temp", icon: "🌡️", label: "気温", value: `${weather.tempMax}° ${c.label}`, tone: c.tone };
      })()
    : { id: "rf-temp", icon: "🌡️", label: "気温", value: "標準", tone: "neutral" };

  const mob = mobilityValue(dayContext.mobility);
  const sched = scheduleValue(dayContext);
  const env = environmentValue(dayContext);
  const form = formalityValue(dayContext.maxFormality);

  const factors: CalendarOutfitReasonFactor[] = [
    tempFactor,
    { id: "rf-move", icon: "🚶", label: "移動量", value: mob.value, tone: mob.tone },
    { id: "rf-tpo", icon: "🤝", label: "予定", value: sched.value, tone: sched.tone },
    { id: "rf-place", icon: "☕", label: "環境", value: env.value, tone: env.tone },
    { id: "rf-mood", icon: "✨", label: "雰囲気", value: form.value, tone: form.tone },
  ];

  return {
    headline: buildHeadline(input),
    body: buildBody(input),
    factors,
    axisChips: buildAxisChips(input),
  };
}
