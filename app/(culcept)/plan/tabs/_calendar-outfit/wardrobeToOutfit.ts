/**
 * Slice 2 (Option B-1) — Wardrobe → Outfit VM の **表示用ハイドレーション** (pure)
 *
 * 役割:
 *   - mock のコーデ提案 (枠・タイトル・SYNC・バッジ) は維持しつつ、
 *     各 item スロットを「画像を持つ実 wardrobe アイテム」で **可能な範囲だけ置き換える**。
 *   - これは **推薦ロジックではない** (generateTodayProposal / scoring / engine 不使用)。
 *     あくまで「手持ちの服画像をカードに載せる」表示ハイドレーション。
 *
 * 不変原則 (CEO/GPT Option B-1):
 *   - **upgrade-only**: 置き換えは「実画像があるスロット」だけ。 画像が無ければ mock のまま (退化ゼロ)。
 *   - 空 wardrobe / 画像ゼロ / 何も変わらない場合は **元の mock を同じ参照で返す** (再描画も起きない)。
 *   - pure: 副作用 / I/O / 現在時刻参照なし。 engine / DB / weather / AI に触れない。
 *   - 画像 URL は受け取った値をそのまま使う (外部取得しない)。
 *
 * 証拠ベースの対応 (調査済み):
 *   - WardrobeItem: name / category(legacy) / categoryMain / color / colorHex / imageUrl
 *     (my-style/_lib/types.ts)。 categoryMain は bag と accessory を区別できるため優先。
 *   - imageUrl は base64 `data:` URL (アップロード写真)。 → OutfitItemView の <img> で表示。
 */

import type { WardrobeItem } from "@/lib/shared/wardrobe";

import type {
  CalendarOutfitItemShape,
  CalendarOutfitItemVM,
  CalendarOutfitProposalVM,
  CalendarOutfitVM,
} from "./types";

/** flat-lay の粗いスロット種別 (mock の shape と wardrobe の category を突き合わせる単位) */
type OutfitSlot = "tops" | "bottoms" | "outer" | "shoes" | "bag" | "accessory";

/** CategoryMain (優先) → silhouette shape。 画像なし placeholder のときだけ意味を持つ。 */
const CATEGORY_MAIN_TO_SHAPE: Record<string, CalendarOutfitItemShape | undefined> = {
  outer: "outer",
  tops: "top",
  bottoms: "bottom",
  shoes: "shoes",
  bag: "bag",
  accessory: "watch",
  other: undefined,
};

/** legacy category (fallback) → silhouette shape */
const LEGACY_CATEGORY_TO_SHAPE: Record<string, CalendarOutfitItemShape | undefined> = {
  outerwear: "outer",
  tops: "top",
  bottoms: "bottom",
  shoes: "shoes",
  accessories: "bag",
  hat: undefined,
  other: undefined,
};

/** mock item の shape → 粗いスロット (top/blouse はどちらも tops、 等) */
const SHAPE_TO_SLOT: Record<CalendarOutfitItemShape, OutfitSlot> = {
  top: "tops",
  blouse: "tops",
  bottom: "bottoms",
  skirt: "bottoms",
  outer: "outer",
  shoes: "shoes",
  heels: "shoes",
  bag: "bag",
  watch: "accessory",
};

/** スロット → 日本語表示カテゴリ (sr-only / alt 用) */
const SLOT_DISPLAY: Record<OutfitSlot, string> = {
  tops: "トップス",
  bottoms: "ボトムス",
  outer: "アウター",
  shoes: "シューズ",
  bag: "バッグ",
  accessory: "小物",
};

/** wardrobe item → silhouette shape (placeholder 用)。 不明なら undefined。 */
export function shapeOfWardrobe(item: WardrobeItem): CalendarOutfitItemShape | undefined {
  if (item.categoryMain) {
    const mapped = CATEGORY_MAIN_TO_SHAPE[item.categoryMain];
    if (mapped !== undefined) return mapped;
  }
  return LEGACY_CATEGORY_TO_SHAPE[item.category];
}

/** wardrobe item → 粗いスロット (bucket 化に使用)。 該当なしは undefined。 */
export function slotOfWardrobe(item: WardrobeItem): OutfitSlot | undefined {
  switch (item.categoryMain) {
    case "outer":
      return "outer";
    case "tops":
      return "tops";
    case "bottoms":
      return "bottoms";
    case "shoes":
      return "shoes";
    case "bag":
      return "bag";
    case "accessory":
      return "accessory";
    default:
      break;
  }
  switch (item.category) {
    case "outerwear":
      return "outer";
    case "tops":
      return "tops";
    case "bottoms":
      return "bottoms";
    case "shoes":
      return "shoes";
    case "accessories":
      return "accessory";
    // D3-3: legacy "hat" を accessory slot に migration。 engine 側 (calendar/_lib/outfitEngine.ts.categorize)
    //   が D2-1 で "hat" → accessory pool に migrate 済のため、 hydrate fallback path もここで揃える。
    //   slotOfWardrobe で hat が undefined だと engine_padded / hydrated_mock path で旧 "hat" item が
    //   実画像 hydrate されない。 D3-3 audit で発見した唯一のギャップ。
    case "hat":
      return "accessory";
    default:
      return undefined; // other → スロットなし
  }
}

/**
 * C1L-5: /plan の表示画像を選ぶ。 **確定 cutout（cutoutStatus==="success"）を最優先**、
 * それ以外（needs_review / failed / skipped / cutout 無し）は原画 imageUrl にフォールバック。
 * manual は status=success なので採用対象。 needs_review の甘い cutout は /plan に出さない。
 */
export function getWardrobeDisplayImageUrl(item: WardrobeItem): string | undefined {
  if (
    item.cutoutStatus === "success" &&
    typeof item.cutoutUrl === "string" &&
    item.cutoutUrl.trim().length > 0
  ) {
    return item.cutoutUrl;
  }
  return item.imageUrl;
}

/** 使える表示画像 (cutout success or imageUrl) を持つか */
export function hasUsableImage(item: WardrobeItem): boolean {
  const url = getWardrobeDisplayImageUrl(item);
  return typeof url === "string" && url.trim().length > 0;
}

function firstNonEmpty(...vals: Array<string | undefined>): string | undefined {
  for (const v of vals) {
    if (typeof v === "string" && v.trim().length > 0) return v;
  }
  return undefined;
}

/**
 * 画像を持つ wardrobe item で mock スロットを埋めた VM item を作る。
 *   - スロットの識別 (id) は mock のものを維持 (= proposal 内のユニーク性を壊さない)。
 *   - shape は wardrobe 由来 → 不明なら mock の shape を継承 (画像ありなので表示には無影響)。
 */
function wardrobeItemToSlotVM(
  item: WardrobeItem,
  slotMock: CalendarOutfitItemVM,
): CalendarOutfitItemVM {
  const slot = slotOfWardrobe(item);
  return {
    id: slotMock.id,
    category: slot ? SLOT_DISPLAY[slot] : slotMock.category,
    label: firstNonEmpty(item.name) ?? slotMock.label,
    shape: shapeOfWardrobe(item) ?? slotMock.shape,
    color: firstNonEmpty(item.colorHex, item.color) ?? slotMock.color,
    imageUrl: getWardrobeDisplayImageUrl(item),
  };
}

/**
 * mock VM のコーデ提案を、 画像付き wardrobe で **可能な範囲だけ** ハイドレートする。
 *   - 画像を持つ item のみがスロットを埋める資格を持つ (upgrade-only)。
 *   - スロットに合う実 item が無ければ mock のまま (退化ゼロ)。
 *   - 何も置き換わらなければ、 元の mock を **同じ参照で** 返す。
 */
export function hydrateOutfitVM(
  mock: CalendarOutfitVM,
  wardrobe: WardrobeItem[],
): CalendarOutfitVM {
  // 画像ありアイテムだけをスロット別に bucket 化する。
  const buckets = new Map<OutfitSlot, WardrobeItem[]>();
  for (const item of wardrobe) {
    if (!hasUsableImage(item)) continue;
    const slot = slotOfWardrobe(item);
    if (!slot) continue;
    const arr = buckets.get(slot);
    if (arr) arr.push(item);
    else buckets.set(slot, [item]);
  }
  if (buckets.size === 0) return mock; // 実画像なし → mock を一切変えない

  // スロット別カーソル (提案をまたいで実 item を分配 → 同じ写真の重複を減らす)。
  const cursor = new Map<OutfitSlot, number>();
  let changed = false;

  const proposals: CalendarOutfitProposalVM[] = mock.proposals.map((proposal) => {
    const items = proposal.items.map((mockItem) => {
      const slot = SHAPE_TO_SLOT[mockItem.shape];
      const bucket = buckets.get(slot);
      if (!bucket || bucket.length === 0) return mockItem;
      const i = cursor.get(slot) ?? 0;
      cursor.set(slot, i + 1);
      const picked = bucket[i % bucket.length];
      changed = true;
      return wardrobeItemToSlotVM(picked, mockItem);
    });
    return { ...proposal, items };
  });

  return changed ? { ...mock, proposals } : mock;
}
