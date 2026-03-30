// Origin v8 — Memory Dive カード選択データ
// 5フェーズの記憶ダイブフローで使用するカードオプション配列

/* ─── 共通カード型 ─── */

export type DiveCard = {
  id: string;
  label: string;
  icon: string;
};

/* ─── Phase 1: Scene (情景) ─── */

export const SEASON_CARDS: DiveCard[] = [
  { id: "spring", label: "春", icon: "🌸" },
  { id: "summer", label: "夏", icon: "☀️" },
  { id: "autumn", label: "秋", icon: "🍂" },
  { id: "winter", label: "冬", icon: "❄️" },
];

export const TIME_OF_DAY_CARDS: DiveCard[] = [
  { id: "dawn", label: "明け方", icon: "🌅" },
  { id: "morning", label: "朝", icon: "🌤️" },
  { id: "afternoon", label: "昼", icon: "☀️" },
  { id: "evening", label: "夕方", icon: "🌇" },
  { id: "night", label: "夜", icon: "🌙" },
  { id: "late_night", label: "深夜", icon: "🌃" },
];

export const ATMOSPHERE_CARDS: DiveCard[] = [
  { id: "sunny", label: "晴れ", icon: "☀️" },
  { id: "cloudy", label: "曇り", icon: "☁️" },
  { id: "rainy", label: "雨", icon: "🌧️" },
  { id: "snowy", label: "雪", icon: "🌨️" },
  { id: "hot", label: "暑い", icon: "🔥" },
  { id: "cold", label: "寒い", icon: "🧊" },
  { id: "humid", label: "湿気", icon: "💧" },
  { id: "windy", label: "風", icon: "🌬️" },
];

export const PLACE_CARDS: DiveCard[] = [
  { id: "home", label: "自宅", icon: "🏠" },
  { id: "school", label: "学校", icon: "🏫" },
  { id: "workplace", label: "職場", icon: "🏢" },
  { id: "park", label: "公園・広場", icon: "🌳" },
  { id: "station", label: "駅・バス停", icon: "🚉" },
  { id: "cafe", label: "カフェ・飲食店", icon: "☕" },
  { id: "hospital", label: "病院", icon: "🏥" },
  { id: "temple", label: "寺社・教会", icon: "⛩️" },
  { id: "sea", label: "海・川・湖", icon: "🌊" },
  { id: "mountain", label: "山・森", icon: "🏔️" },
  { id: "road", label: "道・通り", icon: "🛤️" },
  { id: "room", label: "誰かの部屋", icon: "🚪" },
  { id: "shop", label: "お店", icon: "🛍️" },
  { id: "abroad", label: "海外", icon: "✈️" },
  { id: "other", label: "その他", icon: "📍" },
];

export const PEOPLE_CARDS: DiveCard[] = [
  { id: "alone", label: "一人", icon: "🧍" },
  { id: "family", label: "家族", icon: "👨‍👩‍👧" },
  { id: "friend", label: "友人", icon: "🤝" },
  { id: "partner", label: "恋人・パートナー", icon: "💑" },
  { id: "teacher", label: "先生・師匠", icon: "👩‍🏫" },
  { id: "stranger", label: "知らない人", icon: "👤" },
  { id: "crowd", label: "大勢", icon: "👥" },
];

/* ─── Phase 2: Senses (五感) ─── */

export const SIGHT_CARDS: DiveCard[] = [
  { id: "bright_light", label: "まぶしい光", icon: "✨" },
  { id: "colors", label: "鮮やかな色", icon: "🎨" },
  { id: "face", label: "誰かの顔", icon: "😶" },
  { id: "landscape", label: "風景", icon: "🏞️" },
  { id: "text", label: "文字・書物", icon: "📖" },
  { id: "dark", label: "暗闇", icon: "🌑" },
];

export const SOUND_CARDS: DiveCard[] = [
  { id: "voice", label: "声", icon: "🗣️" },
  { id: "music", label: "音楽", icon: "🎵" },
  { id: "nature", label: "自然の音", icon: "🌿" },
  { id: "machine", label: "機械音", icon: "⚙️" },
  { id: "silence", label: "静寂", icon: "🤫" },
  { id: "laughter", label: "笑い声", icon: "😄" },
];

export const SMELL_CARDS: DiveCard[] = [
  { id: "food", label: "食べ物の匂い", icon: "🍳" },
  { id: "nature", label: "草木の匂い", icon: "🌿" },
  { id: "rain", label: "雨の匂い", icon: "🌧️" },
  { id: "perfume", label: "香水・石鹸", icon: "🧴" },
  { id: "sweat", label: "汗の匂い", icon: "💦" },
  { id: "smoke", label: "煙の匂い", icon: "🌫️" },
];

export const TEMPERATURE_CARDS: DiveCard[] = [
  { id: "cold", label: "冷たい", icon: "🧊" },
  { id: "cool", label: "涼しい", icon: "🌬️" },
  { id: "warm", label: "温かい", icon: "🌡️" },
  { id: "hot", label: "熱い", icon: "🔥" },
  { id: "mixed", label: "入り混じった", icon: "🌀" },
];

export const TOUCH_CARDS: DiveCard[] = [
  { id: "skin", label: "肌の感触", icon: "🤲" },
  { id: "fabric", label: "布・衣服", icon: "🧵" },
  { id: "earth", label: "土・地面", icon: "🌍" },
  { id: "water", label: "水", icon: "💧" },
  { id: "wind", label: "風", icon: "🍃" },
  { id: "paper", label: "紙", icon: "📄" },
];

/* ─── Phase 3: Events (出来事) ─── */

export const EVENT_TYPE_CARDS: DiveCard[] = [
  { id: "everyday", label: "日常の一コマ", icon: "📅" },
  { id: "surprise", label: "驚き・予想外", icon: "😲" },
  { id: "conflict", label: "衝突・葛藤", icon: "⚡" },
  { id: "achievement", label: "達成・成功", icon: "🏆" },
  { id: "loss", label: "喪失・別れ", icon: "🕊️" },
  { id: "encounter", label: "出会い", icon: "🤝" },
  { id: "departure", label: "旅立ち", icon: "🚀" },
  { id: "discovery", label: "発見", icon: "🔍" },
];

/* ─── Phase 4: Inner (内面) ─── */

export const EMOTION_CARDS: DiveCard[] = [
  { id: "joy", label: "喜び", icon: "😊" },
  { id: "sadness", label: "悲しみ", icon: "😢" },
  { id: "anger", label: "怒り", icon: "😠" },
  { id: "fear", label: "恐れ", icon: "😨" },
  { id: "surprise", label: "驚き", icon: "😳" },
  { id: "disgust", label: "嫌悪", icon: "😣" },
  { id: "relief", label: "安堵", icon: "😌" },
  { id: "pride", label: "誇り", icon: "💪" },
  { id: "shame", label: "恥ずかしさ", icon: "😳" },
  { id: "loneliness", label: "孤独", icon: "🌙" },
  { id: "love", label: "愛情", icon: "❤️" },
  { id: "nostalgia", label: "懐かしさ", icon: "🕰️" },
  { id: "confusion", label: "混乱", icon: "🌀" },
  { id: "numbness", label: "無感覚", icon: "😶" },
];

/* ─── Phase 5: Ripple (波紋) ─── */

export const IMPACT_TYPE_CARDS: DiveCard[] = [
  { id: "belief_formed", label: "信念が生まれた", icon: "💎" },
  { id: "behavior_changed", label: "行動が変わった", icon: "🔄" },
  { id: "relationship_shifted", label: "人間関係が変わった", icon: "🔗" },
  { id: "fear_born", label: "恐れが生まれた", icon: "🛡️" },
  { id: "strength_found", label: "強さを見つけた", icon: "⚔️" },
  { id: "pattern_started", label: "パターンが始まった", icon: "🔁" },
  { id: "wound_healed", label: "傷が癒えた", icon: "🩹" },
  { id: "identity_shifted", label: "自分像が変わった", icon: "🪞" },
];

/* ─── Phase Meta (5フェーズの定義) ─── */

export type DivePhaseMeta = {
  phase: string;
  label: string;
  icon: string;
  hint: string;
};

export const DIVE_PHASE_META: DivePhaseMeta[] = [
  {
    phase: "scene",
    label: "情景",
    icon: "🎬",
    hint: "その記憶の舞台を思い出してみよう",
  },
  {
    phase: "senses",
    label: "五感",
    icon: "👁️",
    hint: "そのとき何を感じていたか、五感で辿ろう",
  },
  {
    phase: "events",
    label: "出来事",
    icon: "📖",
    hint: "何が起きていたか、物語を紡いでみよう",
  },
  {
    phase: "inner",
    label: "内面",
    icon: "💭",
    hint: "そのとき心の中で何が起きていたか",
  },
  {
    phase: "ripple",
    label: "波紋",
    icon: "🌊",
    hint: "その記憶が今の自分にどう影響しているか",
  },
];
