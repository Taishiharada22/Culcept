export type HairCategory = "length" | "bangs" | "silhouette" | "texture" | "color";

export const HAIR_CATEGORY_LABELS: Record<HairCategory, string> = {
  length: "髪の長さ",
  bangs: "前髪",
  silhouette: "シルエット",
  texture: "質感",
  color: "髪色",
};

export const HAIR_CATEGORY_ORDER: HairCategory[] = [
  "length",
  "bangs",
  "silhouette",
  "texture",
  "color",
];

export type HairOption = {
  id: string;
  label: string;
  category: HairCategory;
  file?: string;
  hex?: string;
};

export const HAIR_OPTIONS: HairOption[] = [
  // Length
  { id: "veryshort", label: "ベリーショート", category: "length", file: "very.png" },
  { id: "short", label: "ショート", category: "length", file: "short.png" },
  { id: "bob", label: "ボブ", category: "length", file: "bob.png" },
  { id: "medium", label: "ミディアム", category: "length", file: "mid.png" },
  { id: "semilong", label: "セミロング", category: "length", file: "semilong.png" },
  { id: "long", label: "ロング", category: "length", file: "long.png" },
  // Bangs
  { id: "maegaminashi", label: "前髪なし", category: "bangs", file: "maegaminashi.png" },
  { id: "throw", label: "シースルー", category: "bangs", file: "throw.png" },
  { id: "omome", label: "重め", category: "bangs", file: "omome.png" },
  { id: "nagashi", label: "流し前髪", category: "bangs", file: "nagashi.png" },
  { id: "center", label: "センターパート", category: "bangs", file: "center.png" },
  { id: "up", label: "アップバング", category: "bangs", file: "up.png" },
  // Silhouette
  { id: "straight", label: "ストレート", category: "silhouette", file: "straight.png" },
  { id: "layer", label: "レイヤー", category: "silhouette", file: "layerd.png" },
  { id: "wolf", label: "ウルフ", category: "silhouette", file: "wolf.png" },
  { id: "uchimaki", label: "内巻き", category: "silhouette", file: "uchimaki.png" },
  { id: "sotohane", label: "外ハネ", category: "silhouette", file: "sotohane.png" },
  { id: "volume", label: "トップボリューム", category: "silhouette", file: "volume.png" },
  // Texture
  { id: "tyokumou", label: "直毛", category: "texture", file: "tyokumou.png" },
  { id: "yuru", label: "ゆる巻き", category: "texture", file: "yuru.png" },
  { id: "shikkari", label: "しっかり巻き", category: "texture", file: "shikkari.png" },
  { id: "carl", label: "カール", category: "texture", file: "carl.png" },
  { id: "airy", label: "エアリー", category: "texture", file: "airy.png" },
  { id: "tight", label: "タイト", category: "texture", file: "tight.png" },
  // Color
  { id: "black", label: "ブラック", category: "color", hex: "#1F1714" },
  { id: "dark_brown", label: "ダークブラウン", category: "color", hex: "#4E382E" },
  { id: "brown", label: "ブラウン", category: "color", hex: "#6B4A3A" },
  { id: "light_brown", label: "ライトブラウン", category: "color", hex: "#9A6C52" },
  { id: "ash", label: "アッシュ系", category: "color", hex: "#6E6B73" },
  { id: "red_brown", label: "赤み系", category: "color", hex: "#7F4338" },
  { id: "beige", label: "ベージュ系", category: "color", hex: "#B28D62" },
  { id: "bright", label: "明るめ", category: "color", hex: "#C89657" },
];

export type HairRecipe = Partial<Record<HairCategory, HairOption>>;

export const STORAGE_KEY = "culcept_hair_recipe_v1";

export function getOptionsByCategory(category: HairCategory): HairOption[] {
  return HAIR_OPTIONS.filter((o) => o.category === category);
}

export function hairImageSrc(file: string): string {
  const aliasMap: Record<string, string> = {
    "veryshort.png": "very.png",
    "medium.png": "mid.png",
    "layer.png": "layerd.png",
    "airy.png": "airly.png",
    "wolf.png": "woulf.png",
    "sotohane.png": "soto.png",
    "tyokumou.png": "chokumou.png",
    "yuru.png": "yuruweave.png",
    "shikkari.png": "shikkariweave.png",
  };
  return `/samples/genome/hair/${aliasMap[file] ?? file}`;
}
