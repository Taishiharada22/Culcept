/**
 * Slice 2 (Option B-4B) — Outfit Engine Adapter（client-direct via shared facade）
 *
 * 役割:
 *   - B-1 wardrobe ＋ B-2 weather ＋ B-3/B-4A events を材料に、 正本 `generateTodayProposal`
 *     を**安全に**呼び、 engine の提案を `CalendarOutfitVM` の proposal 形へ変換する。
 *   - これが「登録アイテム × 天気 × 予定文脈 → コーデ提案」の初接続。
 *
 * 設計判断 (CEO/GPT B-4B):
 *   - **必ず facade `@/lib/shared/outfitEngine` 経由**。 `/calendar/_lib` を直接 import しない。
 *   - **dynamic import** にする (`await import(...)`)。 理由:
 *       ① 重い engine chain (/calendar/_lib 透過) を /plan の static bundle から外す (code-split)。
 *       ② import 失敗を catch して mock fallback にできる (= 退化ゼロ)。
 *       ③ engine を呼ばない限り読み込まれない (契約テストの node import を汚さない)。
 *   - engine 呼び出しは **read-only**（generateTodayProposal は worn 履歴を read のみ。 write しない）。
 *   - 失敗・null・throw・空 wardrobe は **すべて `null`** を返し、 呼び出し側で mock を維持する。
 *
 * 不変原則:
 *   - throw を UI へ漏らさない。 DB/Supabase/AI/anchors 保存に触れない。 wardrobe を mutate しない。
 */

import type { OutfitProposal, WeatherDaily } from "@/lib/shared/outfitEngine";
import type { WardrobeItem } from "@/lib/shared/wardrobe";
import {
  WORN_HISTORY_FLAGS,
  buildWornHistoryEngineInput,
  type WornHistoryEngineInput,
} from "@/lib/shared/wornHistory";

import type {
  CalendarOutfitItemVM,
  CalendarOutfitProposalSource,
  CalendarOutfitProposalVM,
  CalendarOutfitSyncVM,
  CalendarOutfitWeatherVM,
} from "./types";
import { SYNC_BAND_VM } from "./_palette";
import { shapeOfWardrobe, getWardrobeDisplayImageUrl } from "./wardrobeToOutfit";
import type { ProjectedCalendarEvent } from "./outfitEventProjection";
import { ensureThreeProposals, type ThreeProposals } from "./ensureThreeProposals";
import { MOCK_CALENDAR_OUTFIT_VM } from "./mockCalendarOutfit";

export interface OutfitEngineInput {
  wardrobe: WardrobeItem[];
  weather: CalendarOutfitWeatherVM | null;
  events: ProjectedCalendarEvent[];
  date: string; // YYYY-MM-DD
}

export interface OutfitEnginePatch {
  /** D1-2: 必ず 3 件並び `[relaxed, main, smart]`。 既存 Carousel の initialIndex=1（count=3）が中央=main を選ぶ。 */
  proposals: ThreeProposals;
  sync: CalendarOutfitSyncVM;
  /** D1-2: 3 件の出所（"engine" = 全部 engine 由来 / "engine_padded" = swap 派生 or mock pad が混じる） */
  source: Extract<CalendarOutfitProposalSource, "engine" | "engine_padded">;
}

/** B-2 weather VM emoji → engine WeatherDaily.weather_icon */
const EMOJI_TO_WEATHER_ICON: Record<string, WeatherDaily["weather_icon"]> = {
  "☀️": "sun",
  "⛅": "cloud",
  "☁️": "cloud",
  "🌧️": "rain",
  "🌨️": "snow",
  "⛈️": "storm",
  "🌫️": "fog",
};

/** categoryMain / legacy category → 日本語表示カテゴリ */
const CATEGORY_MAIN_JA: Record<string, string> = {
  outer: "アウター",
  tops: "トップス",
  bottoms: "ボトムス",
  shoes: "シューズ",
  bag: "バッグ",
  accessory: "小物",
  other: "アイテム",
};
const CATEGORY_LEGACY_JA: Record<string, string> = {
  outerwear: "アウター",
  tops: "トップス",
  bottoms: "ボトムス",
  shoes: "シューズ",
  accessories: "小物",
  hat: "帽子",
  other: "アイテム",
};

/** ProposalVariant → 表示タイトル (moodTag が無いとき) */
const VARIANT_TITLE: Record<string, string> = {
  main: "今日のおすすめ",
  casual: "リラックス",
  dressy: "きれいめ",
  rain: "雨の日に",
  cold: "あたたかく",
};

/** CalendarOutfitWeatherVM → engine WeatherDaily（null は素通し） */
export function weatherVmToDaily(w: CalendarOutfitWeatherVM | null): WeatherDaily | null {
  if (!w) return null;
  const icon = EMOJI_TO_WEATHER_ICON[w.icon] ?? "unknown";
  return {
    weather_icon: icon,
    pop_max: w.pop,
    temp_min: w.tempMin,
    temp_max: w.tempMax,
    pop_blocks: null,
    outfit_tag: icon === "rain" || icon === "storm" || w.pop >= 40 ? "rain" : "normal",
  };
}

/**
 * D1-2: wardrobe item → VM 写像。 D1-1 の ensureThreeProposals が swap-by-axis 派生 VM を作る際に
 * `deps.itemToVM` callback として注入される。 内部ロジックは不変、 export 化のみ。
 */
export function wardrobeItemToVM(item: WardrobeItem): CalendarOutfitItemVM {
  const category =
    (item.categoryMain && CATEGORY_MAIN_JA[item.categoryMain]) ||
    CATEGORY_LEGACY_JA[item.category] ||
    "アイテム";
  return {
    id: item.id,
    category,
    label: item.name && item.name.trim().length > 0 ? item.name : "アイテム",
    // shape は画像なし placeholder 用。 画像があれば withImage で無関係。 不明は安全な "top"。
    shape: shapeOfWardrobe(item) ?? "top",
    color:
      (item.colorHex && item.colorHex.trim()) ||
      (item.color && item.color.trim()) ||
      "#cbd5e1",
    ...(() => {
      const url = getWardrobeDisplayImageUrl(item); // C1L-5: 確定 cutout(success) を優先、 他は imageUrl
      return url && url.trim().length > 0 ? { imageUrl: url } : {};
    })(),
  };
}

/** engine OutfitProposal → CalendarOutfitProposalVM */
export function proposalToVM(p: OutfitProposal): CalendarOutfitProposalVM {
  return {
    id: p.id,
    title: (p.moodTag && p.moodTag.trim()) || VARIANT_TITLE[p.variant] || "おすすめ",
    items: p.items.map(wardrobeItemToVM),
    syncScore: p.sync.total,
    syncBandKey: p.sync.band, // "excellent"|"good"|"caution"|"risk" — VM と同一語彙
    ...(p.moodTag && p.moodTag.trim() ? { moodTag: p.moodTag } : {}),
  };
}

/**
 * 正本 engine を facade 経由で安全に呼び、 提案 VM へ変換する。
 * 失敗・null・throw・空 wardrobe・提案ゼロ は **すべて `null`**（呼び出し側は mock 維持）。
 */
export async function generateCalendarOutfitProposal(
  input: OutfitEngineInput,
): Promise<OutfitEnginePatch | null> {
  try {
    if (!input.wardrobe || input.wardrobe.length === 0) return null;

    // facade のみを dynamic import（/calendar/_lib を直接触らない / static bundle に載せない）
    const mod = await import("@/lib/shared/outfitEngine");

    // Phase 5-C2: flag on のときだけ shared WornHistory 由来 input を構築して facade へ渡す（A 側）。
    //   - flag off（既定）→ builder を呼ばず、 現行 loadWornHistory path（挙動完全維持）。
    //   - builder が null（read 失敗 / known 空 / 両空）→ wornHistoryInput 無しで現行 path へ fallback。
    //   - activation はまだ禁止（A/B 不一致回避。 5-C3 + 5-D まで flag は off 運用）。
    let wornHistoryInput: WornHistoryEngineInput | undefined;
    if (WORN_HISTORY_FLAGS.engineReadsCorpus()) {
      const knownWardrobeIds = input.wardrobe.map((w) => w.id);
      const bundle = await buildWornHistoryEngineInput({ knownWardrobeIds });
      if (bundle) wornHistoryInput = bundle;
    }

    const result = mod.generateTodayProposal({
      wardrobe: input.wardrobe,
      date: input.date,
      weather: weatherVmToDaily(input.weather),
      events: input.events,
      ...(wornHistoryInput ? { wornHistoryInput } : {}),
    });

    if (!result || !result.main) return null;

    const rawProposals: OutfitProposal[] = [result.main, ...(result.alternatives ?? [])].slice(0, 3);
    const engineVMs = rawProposals
      .map(proposalToVM)
      .filter((p) => p.items.length > 0);
    if (engineVMs.length === 0) return null;

    // D1-2: ensureThreeProposals に通して `[relaxed, main, smart]` の 3 件並びを保証する。
    //   - proposals[1] = engine.main を厳守（既存 Carousel.initialIndex=1 で中央表示）
    //   - 不足は wardrobe pool から swap-by-axis 派生、 それでも埋まらなければ mock pad
    //   - 完全同一ペアは mock pad で置換（diffScore < 1 の差分なし回避）
    //   - engineVMs 0 件は上で早期 return 済み → ここでは必ず 3 件出る前提
    const ensured = ensureThreeProposals({
      engineVMs,
      wardrobe: input.wardrobe,
      mockProposals: MOCK_CALENDAR_OUTFIT_VM.proposals,
      deps: { itemToVM: wardrobeItemToVM },
    });
    if (!ensured) return null;

    const band = result.main.sync.band;
    const sync: CalendarOutfitSyncVM = {
      score: result.main.sync.total,
      bandKey: band,
      bandLabel: SYNC_BAND_VM[band]?.label ?? "良好",
    };

    return { proposals: ensured.proposals, sync, source: ensured.source };
  } catch {
    // import 失敗 / engine throw / 想定外 → mock 維持
    return null;
  }
}
