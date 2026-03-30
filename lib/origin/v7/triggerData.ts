import type { TriggerCard } from "./types";

/* ─── 場所 ─── */
const PLACES: TriggerCard[] = [
  { id: "p_classroom", category: "place", label: "教室", icon: "🏫" },
  { id: "p_clubroom", category: "place", label: "部室", icon: "🚪" },
  { id: "p_way_home", category: "place", label: "帰り道", icon: "🛤️" },
  { id: "p_bedroom", category: "place", label: "家の部屋", icon: "🛏️" },
  { id: "p_gym", category: "place", label: "体育館", icon: "🏀" },
  { id: "p_cram_school", category: "place", label: "塾", icon: "📖" },
  { id: "p_part_time", category: "place", label: "バイト先", icon: "🍽️" },
  { id: "p_station", category: "place", label: "駅", icon: "🚉" },
  { id: "p_airport", category: "place", label: "空港", icon: "✈️" },
  { id: "p_convenience", category: "place", label: "夜のコンビニ", icon: "🏪" },
  { id: "p_balcony", category: "place", label: "ベランダ", icon: "🌆" },
  { id: "p_car", category: "place", label: "車の中", icon: "🚗" },
  { id: "p_playground", category: "place", label: "校庭・公園", icon: "🌳" },
  { id: "p_library", category: "place", label: "図書館", icon: "📚" },
  { id: "p_office", category: "place", label: "オフィス", icon: "🏢" },
  { id: "p_cafe", category: "place", label: "カフェ", icon: "☕" },
  { id: "p_rooftop", category: "place", label: "屋上", icon: "🌤️" },
];

/* ─── もの ─── */
const THINGS: TriggerCard[] = [
  { id: "t_uniform", category: "thing", label: "ユニフォーム", icon: "👕" },
  { id: "t_notebook", category: "thing", label: "ノート", icon: "📓" },
  { id: "t_headphones", category: "thing", label: "ヘッドホン", icon: "🎧" },
  { id: "t_smartphone", category: "thing", label: "スマホ", icon: "📱" },
  { id: "t_bicycle", category: "thing", label: "自転車", icon: "🚲" },
  { id: "t_school_uniform", category: "thing", label: "制服", icon: "🎽" },
  { id: "t_sneakers", category: "thing", label: "スニーカー", icon: "👟" },
  { id: "t_textbook", category: "thing", label: "参考書", icon: "📕" },
  { id: "t_earphones", category: "thing", label: "イヤホン", icon: "🎵" },
  { id: "t_pc", category: "thing", label: "パソコン", icon: "💻" },
  { id: "t_book", category: "thing", label: "本", icon: "📖" },
  { id: "t_bag", category: "thing", label: "ランドセル・カバン", icon: "🎒" },
  { id: "t_game", category: "thing", label: "ゲーム機", icon: "🎮" },
  { id: "t_instrument", category: "thing", label: "楽器", icon: "🎸" },
  { id: "t_ball", category: "thing", label: "ボール", icon: "⚽" },
];

/* ─── 人 ─── */
const PEOPLE: TriggerCard[] = [
  { id: "h_family", category: "person", label: "家族", icon: "👨‍👩‍👧" },
  { id: "h_best_friend", category: "person", label: "親友", icon: "🤝" },
  { id: "h_classmate", category: "person", label: "クラスメイト", icon: "👥" },
  { id: "h_senior", category: "person", label: "先輩", icon: "🎓" },
  { id: "h_junior", category: "person", label: "後輩", icon: "🌱" },
  { id: "h_teacher", category: "person", label: "先生", icon: "👩‍🏫" },
  { id: "h_crush", category: "person", label: "好きな人", icon: "💕" },
  { id: "h_rival", category: "person", label: "ライバル", icon: "⚔️" },
  { id: "h_coworker", category: "person", label: "同僚", icon: "🏢" },
  { id: "h_online", category: "person", label: "ネット上の誰か", icon: "🌐" },
  { id: "h_alone", category: "person", label: "一人の時間", icon: "🪶" },
  { id: "h_partner", category: "person", label: "パートナー", icon: "💑" },
];

/* ─── 感覚 ─── */
const SENSATIONS: TriggerCard[] = [
  { id: "s_smell_grass", category: "sensation", label: "草の匂い", icon: "🌿" },
  { id: "s_chime", category: "sensation", label: "チャイムの音", icon: "🔔" },
  { id: "s_sunset", category: "sensation", label: "夕焼けの光", icon: "🌇" },
  { id: "s_rain", category: "sensation", label: "雨の音", icon: "🌧️" },
  { id: "s_cicada", category: "sensation", label: "蝉の声", icon: "🦗" },
  { id: "s_chalk", category: "sensation", label: "チョークの粉", icon: "🖍️" },
  { id: "s_cold_air", category: "sensation", label: "冬の冷たい空気", icon: "❄️" },
  { id: "s_warm_food", category: "sensation", label: "あたたかい食事の匂い", icon: "🍲" },
  { id: "s_music", category: "sensation", label: "あの頃よく聴いた曲", icon: "🎶" },
  { id: "s_sweat", category: "sensation", label: "汗の匂い", icon: "💦" },
  { id: "s_train", category: "sensation", label: "電車の揺れ", icon: "🚃" },
  { id: "s_night_wind", category: "sensation", label: "夜風", icon: "🌬️" },
];

export const ALL_TRIGGER_CARDS: TriggerCard[] = [
  ...PLACES,
  ...THINGS,
  ...PEOPLE,
  ...SENSATIONS,
];

export function getTriggerLabel(id: string): string {
  return ALL_TRIGGER_CARDS.find((c) => c.id === id)?.label ?? id;
}
