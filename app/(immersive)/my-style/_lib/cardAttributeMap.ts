// app/my-style/_lib/cardAttributeMap.ts
// curated_cards の tags[] → 学習軸のdeltaマッピング

export type AxisDelta = {
  axis: string;
  delta: number; // -1.0 ~ +1.0
};

export type TagAxisMap = Record<string, AxisDelta[]>;

/**
 * 各タグがどの軸にどの方向で影響するか。
 * delta > 0 → poleBLabel 側 (右)
 * delta < 0 → poleALabel 側 (左)
 */
export const TAG_AXIS_MAP: TagAxisMap = {
  // ── カテゴリ / シーン ────────────────────
  casual:       [{ axis: "casual_mode", delta: -0.6 }],
  formal:       [{ axis: "casual_mode", delta: 0.6 }, { axis: "kirei_street", delta: -0.4 }],
  business:     [{ axis: "casual_mode", delta: 0.4 }, { axis: "kirei_street", delta: -0.5 }, { axis: "mature_youthful", delta: -0.3 }],
  office:       [{ axis: "casual_mode", delta: 0.3 }, { axis: "kirei_street", delta: -0.3 }],
  party:        [{ axis: "simple_decorative", delta: 0.5 }, { axis: "minimal_maximal", delta: 0.4 }],
  date:         [{ axis: "kirei_street", delta: -0.3 }, { axis: "feminine_sharp", delta: -0.3 }],

  // ── スタイルレーン ──────────────────────
  streetwear:   [{ axis: "kirei_street", delta: 0.7 }, { axis: "casual_mode", delta: -0.4 }],
  street:       [{ axis: "kirei_street", delta: 0.6 }, { axis: "casual_mode", delta: -0.3 }],
  minimalist:   [{ axis: "simple_decorative", delta: -0.7 }, { axis: "minimal_maximal", delta: -0.7 }, { axis: "achromatic_chromatic", delta: -0.3 }],
  minimal:      [{ axis: "simple_decorative", delta: -0.6 }, { axis: "minimal_maximal", delta: -0.6 }],
  vintage:      [{ axis: "classic_trend", delta: -0.4 }, { axis: "clean_distressed", delta: 0.3 }],
  retro:        [{ axis: "classic_trend", delta: -0.3 }, { axis: "mature_youthful", delta: -0.2 }],
  sporty:       [{ axis: "casual_mode", delta: -0.5 }, { axis: "light_heavy", delta: -0.4 }],
  athletic:     [{ axis: "casual_mode", delta: -0.5 }, { axis: "light_heavy", delta: -0.3 }],
  elegant:      [{ axis: "kirei_street", delta: -0.6 }, { axis: "feminine_sharp", delta: -0.4 }, { axis: "mature_youthful", delta: -0.3 }],
  luxury:       [{ axis: "kirei_street", delta: -0.5 }, { axis: "casual_mode", delta: 0.4 }, { axis: "mature_youthful", delta: -0.3 }],
  workwear:     [{ axis: "casual_mode", delta: -0.2 }, { axis: "structured_drapey", delta: -0.4 }, { axis: "light_heavy", delta: 0.3 }],
  military:     [{ axis: "feminine_sharp", delta: 0.5 }, { axis: "structured_drapey", delta: -0.4 }, { axis: "light_heavy", delta: 0.3 }],
  bohemian:     [{ axis: "feminine_sharp", delta: -0.3 }, { axis: "simple_decorative", delta: 0.4 }, { axis: "nukenkan", delta: -0.4 }],
  boho:         [{ axis: "feminine_sharp", delta: -0.3 }, { axis: "simple_decorative", delta: 0.3 }, { axis: "nukenkan", delta: -0.4 }],
  preppy:       [{ axis: "classic_trend", delta: -0.4 }, { axis: "kirei_street", delta: -0.3 }, { axis: "mature_youthful", delta: 0.3 }],
  grunge:       [{ axis: "kirei_street", delta: 0.5 }, { axis: "clean_distressed", delta: 0.6 }, { axis: "nukenkan", delta: -0.5 }],
  punk:         [{ axis: "feminine_sharp", delta: 0.6 }, { axis: "simple_decorative", delta: 0.5 }, { axis: "clean_distressed", delta: 0.5 }],
  rock:         [{ axis: "feminine_sharp", delta: 0.5 }, { axis: "light_heavy", delta: 0.3 }],
  gothic:       [{ axis: "warm_cool", delta: 0.5 }, { axis: "feminine_sharp", delta: 0.4 }, { axis: "achromatic_chromatic", delta: -0.5 }],
  romantic:     [{ axis: "feminine_sharp", delta: -0.7 }, { axis: "sweet_spicy", delta: -0.5 }, { axis: "simple_decorative", delta: 0.3 }],
  feminine:     [{ axis: "feminine_sharp", delta: -0.6 }, { axis: "sweet_spicy", delta: -0.3 }],
  mannish:      [{ axis: "feminine_sharp", delta: 0.6 }, { axis: "structured_drapey", delta: -0.3 }],
  unisex:       [{ axis: "feminine_sharp", delta: 0.2 }],
  androgynous:  [{ axis: "feminine_sharp", delta: 0.3 }],
  korean:       [{ axis: "classic_trend", delta: 0.4 }, { axis: "slim_wide", delta: -0.3 }, { axis: "pale_vivid", delta: -0.3 }],
  french:       [{ axis: "kirei_street", delta: -0.3 }, { axis: "nukenkan", delta: -0.4 }, { axis: "simple_decorative", delta: -0.3 }],
  american:     [{ axis: "casual_mode", delta: -0.4 }, { axis: "tight_oversized", delta: 0.2 }],
  scandinavian: [{ axis: "simple_decorative", delta: -0.5 }, { axis: "minimal_maximal", delta: -0.4 }, { axis: "warm_cool", delta: 0.2 }],
  japanese:     [{ axis: "nukenkan", delta: -0.3 }, { axis: "simple_decorative", delta: -0.2 }],
  italian:      [{ axis: "kirei_street", delta: -0.4 }, { axis: "mature_youthful", delta: -0.3 }],
  british:      [{ axis: "classic_trend", delta: -0.5 }, { axis: "structured_drapey", delta: -0.3 }],
  normcore:     [{ axis: "simple_decorative", delta: -0.6 }, { axis: "classic_trend", delta: -0.3 }, { axis: "minimal_maximal", delta: -0.5 }],
  techwear:     [{ axis: "casual_mode", delta: 0.3 }, { axis: "natural_synthetic", delta: 0.6 }, { axis: "feminine_sharp", delta: 0.3 }],

  // ── シルエット / サイズ感 ────────────────
  oversized:    [{ axis: "tight_oversized", delta: 0.7 }, { axis: "slim_wide", delta: 0.5 }],
  oversize:     [{ axis: "tight_oversized", delta: 0.7 }, { axis: "slim_wide", delta: 0.5 }],
  loose:        [{ axis: "tight_oversized", delta: 0.5 }, { axis: "slim_wide", delta: 0.3 }, { axis: "nukenkan", delta: -0.3 }],
  relaxed:      [{ axis: "tight_oversized", delta: 0.3 }, { axis: "nukenkan", delta: -0.3 }],
  slim:         [{ axis: "tight_oversized", delta: -0.5 }, { axis: "slim_wide", delta: -0.5 }],
  skinny:       [{ axis: "tight_oversized", delta: -0.7 }, { axis: "slim_wide", delta: -0.6 }],
  fitted:       [{ axis: "tight_oversized", delta: -0.4 }, { axis: "structured_drapey", delta: -0.2 }],
  boxy:         [{ axis: "tight_oversized", delta: 0.3 }, { axis: "structured_drapey", delta: -0.3 }],
  wide:         [{ axis: "slim_wide", delta: 0.6 }],
  flare:        [{ axis: "slim_wide", delta: 0.4 }, { axis: "feminine_sharp", delta: -0.2 }],
  tapered:      [{ axis: "slim_wide", delta: -0.3 }],
  cropped:      [{ axis: "short_long", delta: -0.5 }],
  longline:     [{ axis: "short_long", delta: 0.5 }],
  maxi:         [{ axis: "short_long", delta: 0.7 }, { axis: "feminine_sharp", delta: -0.2 }],
  midi:         [{ axis: "short_long", delta: 0.3 }],
  mini:         [{ axis: "short_long", delta: -0.6 }, { axis: "mature_youthful", delta: 0.3 }],

  // ── 色 ──────────────────────────────────
  black:        [{ axis: "warm_cool", delta: 0.2 }, { axis: "achromatic_chromatic", delta: -0.5 }, { axis: "high_low_contrast", delta: 0.3 }],
  white:        [{ axis: "achromatic_chromatic", delta: -0.5 }, { axis: "clean_distressed", delta: -0.3 }],
  gray:         [{ axis: "achromatic_chromatic", delta: -0.6 }, { axis: "high_low_contrast", delta: -0.2 }],
  grey:         [{ axis: "achromatic_chromatic", delta: -0.6 }],
  navy:         [{ axis: "warm_cool", delta: 0.3 }, { axis: "kirei_street", delta: -0.2 }],
  blue:         [{ axis: "warm_cool", delta: 0.3 }],
  red:          [{ axis: "warm_cool", delta: -0.3 }, { axis: "achromatic_chromatic", delta: 0.5 }, { axis: "pale_vivid", delta: 0.5 }],
  pink:         [{ axis: "warm_cool", delta: -0.2 }, { axis: "feminine_sharp", delta: -0.4 }, { axis: "sweet_spicy", delta: -0.3 }],
  beige:        [{ axis: "warm_cool", delta: -0.2 }, { axis: "pale_vivid", delta: -0.4 }, { axis: "nukenkan", delta: -0.2 }],
  cream:        [{ axis: "warm_cool", delta: -0.2 }, { axis: "pale_vivid", delta: -0.5 }],
  brown:        [{ axis: "warm_cool", delta: -0.3 }, { axis: "natural_synthetic", delta: -0.2 }],
  camel:        [{ axis: "warm_cool", delta: -0.2 }, { axis: "mature_youthful", delta: -0.2 }],
  khaki:        [{ axis: "warm_cool", delta: -0.2 }, { axis: "casual_mode", delta: -0.2 }],
  olive:        [{ axis: "warm_cool", delta: -0.1 }, { axis: "achromatic_chromatic", delta: 0.2 }],
  green:        [{ axis: "achromatic_chromatic", delta: 0.3 }],
  yellow:       [{ axis: "warm_cool", delta: -0.4 }, { axis: "achromatic_chromatic", delta: 0.5 }, { axis: "pale_vivid", delta: 0.3 }],
  orange:       [{ axis: "warm_cool", delta: -0.5 }, { axis: "achromatic_chromatic", delta: 0.4 }],
  purple:       [{ axis: "warm_cool", delta: 0.2 }, { axis: "achromatic_chromatic", delta: 0.3 }],
  lavender:     [{ axis: "warm_cool", delta: 0.1 }, { axis: "pale_vivid", delta: -0.4 }, { axis: "feminine_sharp", delta: -0.3 }],
  pastel:       [{ axis: "pale_vivid", delta: -0.6 }, { axis: "sweet_spicy", delta: -0.3 }],
  vivid:        [{ axis: "pale_vivid", delta: 0.6 }, { axis: "high_low_contrast", delta: 0.3 }],
  neon:         [{ axis: "pale_vivid", delta: 0.8 }, { axis: "classic_trend", delta: 0.5 }],
  monotone:     [{ axis: "achromatic_chromatic", delta: -0.7 }, { axis: "high_low_contrast", delta: 0.2 }],
  monochrome:   [{ axis: "achromatic_chromatic", delta: -0.7 }],
  earth:        [{ axis: "warm_cool", delta: -0.3 }, { axis: "pale_vivid", delta: -0.3 }, { axis: "natural_synthetic", delta: -0.3 }],
  earthtone:    [{ axis: "warm_cool", delta: -0.3 }, { axis: "pale_vivid", delta: -0.3 }],
  colorful:     [{ axis: "achromatic_chromatic", delta: 0.7 }, { axis: "pale_vivid", delta: 0.3 }, { axis: "minimal_maximal", delta: 0.3 }],
  multicolor:   [{ axis: "achromatic_chromatic", delta: 0.6 }, { axis: "minimal_maximal", delta: 0.3 }],

  // ── 素材 / テクスチャ ───────────────────
  leather:      [{ axis: "matte_shiny", delta: 0.3 }, { axis: "light_heavy", delta: 0.4 }, { axis: "natural_synthetic", delta: -0.3 }],
  suede:        [{ axis: "matte_shiny", delta: -0.5 }, { axis: "natural_synthetic", delta: -0.3 }],
  denim:        [{ axis: "casual_mode", delta: -0.4 }, { axis: "natural_synthetic", delta: -0.2 }],
  cotton:       [{ axis: "natural_synthetic", delta: -0.4 }, { axis: "light_heavy", delta: -0.2 }],
  linen:        [{ axis: "natural_synthetic", delta: -0.5 }, { axis: "light_heavy", delta: -0.3 }, { axis: "season_ss_aw", delta: -0.4 }],
  silk:         [{ axis: "matte_shiny", delta: 0.4 }, { axis: "natural_synthetic", delta: -0.3 }, { axis: "structured_drapey", delta: 0.5 }],
  satin:        [{ axis: "matte_shiny", delta: 0.6 }, { axis: "structured_drapey", delta: 0.4 }],
  wool:         [{ axis: "natural_synthetic", delta: -0.4 }, { axis: "light_heavy", delta: 0.3 }, { axis: "season_ss_aw", delta: 0.4 }],
  cashmere:     [{ axis: "natural_synthetic", delta: -0.5 }, { axis: "matte_shiny", delta: -0.2 }, { axis: "mature_youthful", delta: -0.2 }],
  knit:         [{ axis: "light_heavy", delta: 0.2 }, { axis: "season_ss_aw", delta: 0.3 }],
  fleece:       [{ axis: "casual_mode", delta: -0.3 }, { axis: "light_heavy", delta: 0.2 }, { axis: "natural_synthetic", delta: 0.3 }],
  nylon:        [{ axis: "natural_synthetic", delta: 0.5 }, { axis: "matte_shiny", delta: 0.3 }],
  polyester:    [{ axis: "natural_synthetic", delta: 0.4 }],
  mesh:         [{ axis: "natural_synthetic", delta: 0.3 }, { axis: "light_heavy", delta: -0.4 }],
  sheer:        [{ axis: "light_heavy", delta: -0.5 }, { axis: "feminine_sharp", delta: -0.3 }],
  velvet:       [{ axis: "matte_shiny", delta: -0.2 }, { axis: "light_heavy", delta: 0.2 }, { axis: "simple_decorative", delta: 0.2 }],
  corduroy:     [{ axis: "matte_shiny", delta: -0.4 }, { axis: "classic_trend", delta: -0.3 }, { axis: "season_ss_aw", delta: 0.3 }],
  tweed:        [{ axis: "classic_trend", delta: -0.5 }, { axis: "mature_youthful", delta: -0.3 }],
  fur:          [{ axis: "simple_decorative", delta: 0.4 }, { axis: "light_heavy", delta: 0.4 }],
  down:         [{ axis: "light_heavy", delta: 0.5 }, { axis: "season_ss_aw", delta: 0.5 }],

  // ── パターン / ディテール ───────────────
  stripe:       [{ axis: "simple_decorative", delta: 0.2 }, { axis: "classic_trend", delta: -0.2 }],
  check:        [{ axis: "simple_decorative", delta: 0.2 }, { axis: "classic_trend", delta: -0.3 }],
  plaid:        [{ axis: "simple_decorative", delta: 0.3 }, { axis: "classic_trend", delta: -0.3 }],
  floral:       [{ axis: "simple_decorative", delta: 0.4 }, { axis: "feminine_sharp", delta: -0.4 }, { axis: "sweet_spicy", delta: -0.3 }],
  print:        [{ axis: "simple_decorative", delta: 0.3 }, { axis: "minimal_maximal", delta: 0.2 }],
  graphic:      [{ axis: "simple_decorative", delta: 0.4 }, { axis: "casual_mode", delta: -0.3 }],
  logo:         [{ axis: "simple_decorative", delta: 0.3 }, { axis: "casual_mode", delta: -0.2 }, { axis: "classic_trend", delta: 0.2 }],
  solid:        [{ axis: "simple_decorative", delta: -0.4 }],
  plain:        [{ axis: "simple_decorative", delta: -0.5 }],
  embroidery:   [{ axis: "simple_decorative", delta: 0.5 }, { axis: "sweet_spicy", delta: -0.2 }],
  lace:         [{ axis: "feminine_sharp", delta: -0.6 }, { axis: "simple_decorative", delta: 0.4 }, { axis: "sweet_spicy", delta: -0.4 }],
  ruffle:       [{ axis: "feminine_sharp", delta: -0.5 }, { axis: "simple_decorative", delta: 0.4 }],
  pleats:       [{ axis: "kirei_street", delta: -0.3 }, { axis: "feminine_sharp", delta: -0.2 }],
  fringe:       [{ axis: "simple_decorative", delta: 0.4 }, { axis: "nukenkan", delta: -0.3 }],
  zipper:       [{ axis: "feminine_sharp", delta: 0.2 }, { axis: "casual_mode", delta: 0.1 }],
  button:       [{ axis: "classic_trend", delta: -0.1 }],
  pocket:       [{ axis: "casual_mode", delta: -0.1 }],
  hood:         [{ axis: "casual_mode", delta: -0.4 }, { axis: "kirei_street", delta: 0.2 }],
  collar:       [{ axis: "kirei_street", delta: -0.2 }],
  turtleneck:   [{ axis: "kirei_street", delta: -0.2 }, { axis: "season_ss_aw", delta: 0.3 }],
  vneck:        [{ axis: "kirei_street", delta: -0.2 }, { axis: "feminine_sharp", delta: -0.2 }],

  // ── アイテムカテゴリ ────────────────────
  jacket:       [{ axis: "structured_drapey", delta: -0.3 }],
  blazer:       [{ axis: "casual_mode", delta: 0.4 }, { axis: "kirei_street", delta: -0.4 }, { axis: "structured_drapey", delta: -0.4 }],
  coat:         [{ axis: "short_long", delta: 0.4 }, { axis: "light_heavy", delta: 0.3 }, { axis: "season_ss_aw", delta: 0.4 }],
  trench:       [{ axis: "classic_trend", delta: -0.4 }, { axis: "kirei_street", delta: -0.3 }],
  parka:        [{ axis: "casual_mode", delta: -0.4 }, { axis: "light_heavy", delta: 0.3 }],
  hoodie:       [{ axis: "casual_mode", delta: -0.6 }, { axis: "kirei_street", delta: 0.3 }],
  sweater:      [{ axis: "light_heavy", delta: 0.2 }, { axis: "season_ss_aw", delta: 0.3 }],
  cardigan:     [{ axis: "nukenkan", delta: -0.3 }, { axis: "feminine_sharp", delta: -0.2 }],
  shirt:        [{ axis: "kirei_street", delta: -0.3 }, { axis: "structured_drapey", delta: -0.2 }],
  tshirt:       [{ axis: "casual_mode", delta: -0.5 }, { axis: "light_heavy", delta: -0.3 }],
  tank:         [{ axis: "casual_mode", delta: -0.3 }, { axis: "light_heavy", delta: -0.4 }, { axis: "season_ss_aw", delta: -0.4 }],
  blouse:       [{ axis: "feminine_sharp", delta: -0.4 }, { axis: "structured_drapey", delta: 0.2 }],
  dress:        [{ axis: "feminine_sharp", delta: -0.4 }, { axis: "kirei_street", delta: -0.2 }],
  skirt:        [{ axis: "feminine_sharp", delta: -0.4 }],
  pants:        [],
  jeans:        [{ axis: "casual_mode", delta: -0.4 }, { axis: "natural_synthetic", delta: -0.2 }],
  shorts:       [{ axis: "casual_mode", delta: -0.3 }, { axis: "short_long", delta: -0.6 }, { axis: "season_ss_aw", delta: -0.4 }],
  sneakers:     [{ axis: "casual_mode", delta: -0.5 }, { axis: "kirei_street", delta: 0.2 }],
  boots:        [{ axis: "light_heavy", delta: 0.3 }, { axis: "season_ss_aw", delta: 0.3 }],
  heels:        [{ axis: "kirei_street", delta: -0.4 }, { axis: "feminine_sharp", delta: -0.4 }],
  sandals:      [{ axis: "casual_mode", delta: -0.3 }, { axis: "season_ss_aw", delta: -0.5 }, { axis: "nukenkan", delta: -0.3 }],
  loafers:      [{ axis: "kirei_street", delta: -0.3 }, { axis: "classic_trend", delta: -0.3 }],

  // ── 季節 / 温度感 ──────────────────────
  summer:       [{ axis: "season_ss_aw", delta: -0.6 }, { axis: "light_heavy", delta: -0.4 }],
  spring:       [{ axis: "season_ss_aw", delta: -0.3 }, { axis: "light_heavy", delta: -0.2 }],
  autumn:       [{ axis: "season_ss_aw", delta: 0.3 }, { axis: "warm_cool", delta: -0.2 }],
  winter:       [{ axis: "season_ss_aw", delta: 0.6 }, { axis: "light_heavy", delta: 0.4 }],
  layered:      [{ axis: "minimal_maximal", delta: 0.3 }, { axis: "light_heavy", delta: 0.2 }],
  layering:     [{ axis: "minimal_maximal", delta: 0.3 }],

  // ── 雰囲気 ─────────────────────────────
  clean:        [{ axis: "clean_distressed", delta: -0.5 }, { axis: "kirei_street", delta: -0.3 }],
  edgy:         [{ axis: "feminine_sharp", delta: 0.4 }, { axis: "spicy_sweet", delta: 0.4 }],
  chic:         [{ axis: "kirei_street", delta: -0.4 }, { axis: "mature_youthful", delta: -0.3 }],
  cute:         [{ axis: "sweet_spicy", delta: -0.5 }, { axis: "mature_youthful", delta: 0.4 }],
  cool:         [{ axis: "feminine_sharp", delta: 0.3 }, { axis: "warm_cool", delta: 0.2 }],
  sophisticated:[{ axis: "mature_youthful", delta: -0.5 }, { axis: "kirei_street", delta: -0.3 }],
  simple:       [{ axis: "simple_decorative", delta: -0.6 }],
  basic:        [{ axis: "simple_decorative", delta: -0.5 }, { axis: "classic_trend", delta: -0.3 }],
  trendy:       [{ axis: "classic_trend", delta: 0.6 }],
  classic:      [{ axis: "classic_trend", delta: -0.6 }, { axis: "mature_youthful", delta: -0.2 }],
  modern:       [{ axis: "classic_trend", delta: 0.3 }],
  traditional:  [{ axis: "classic_trend", delta: -0.5 }],
  artistic:     [{ axis: "simple_decorative", delta: 0.5 }, { axis: "minimal_maximal", delta: 0.4 }],
  avant_garde:  [{ axis: "casual_mode", delta: 0.6 }, { axis: "minimal_maximal", delta: 0.5 }],
  distressed:   [{ axis: "clean_distressed", delta: 0.6 }],
  washed:       [{ axis: "clean_distressed", delta: 0.3 }, { axis: "nukenkan", delta: -0.3 }],
  raw:          [{ axis: "clean_distressed", delta: 0.4 }],
};

/**
 * カードのtags配列から、各軸への影響deltaリストを計算する。
 * タグはlowercaseに正規化してマッチ。
 */
export function getCardAxisDeltas(tags: string[]): AxisDelta[] {
  const result: AxisDelta[] = [];
  for (const tag of tags) {
    const normalized = tag.toLowerCase().replace(/[\s-]/g, "_");
    const deltas = TAG_AXIS_MAP[normalized];
    if (deltas) {
      result.push(...deltas);
    }
  }
  return result;
}
