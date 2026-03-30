import { ELEMENTS, STYLE_LANES } from "@/lib/profile/registry";

import type {
    PreferenceTag,
    PreferenceTagGroup,
    SeekContextKey,
    SetupMoodCode,
    SimilarityPreference,
    StyleLaneCode,
} from "./types";

export type StyleLaneOption = {
    id: StyleLaneCode;
    label: string;
    description: string;
    gradient: string;
    icon?: string;
    images: string[];
    aliases?: string[];
};

export type ElementOption = PreferenceTag & {
    aliases?: string[];
    image?: string;
};

type StyleLaneSeed = Omit<StyleLaneOption, "icon" | "images"> & {
    registryId?: string;
};

type ElementSeed = Omit<ElementOption, "image"> & {
    registryId?: string;
};

function normalizeToken(value: unknown) {
    return String(value ?? "").trim().toLowerCase();
}

const STYLE_LANE_SEEDS: StyleLaneSeed[] = [
    { id: "minimal", label: "ミニマル", description: "無駄を削ぎ落とし、整った印象で魅せるスタイル", gradient: "from-slate-700 to-zinc-900", registryId: "minimal" },
    { id: "clean", label: "クリーン", description: "清潔感と透明感を大切にした、素直で好印象なスタイル", gradient: "from-sky-500 to-cyan-500", registryId: "clean" },
    { id: "smart-casual", label: "綺麗めカジュアル", description: "気取りすぎず、日常で使いやすい上品さを持つスタイル", gradient: "from-indigo-500 to-sky-500", registryId: "clean_casual", aliases: ["clean-casual", "clean_casual"] },
    { id: "elegant", label: "エレガント", description: "上品さと美しい所作が映える、大人っぽいスタイル", gradient: "from-rose-400 to-pink-500", registryId: "elegant" },
    { id: "luxury", label: "ラグジュアリー", description: "質の高さと格のある空気感で魅せるスタイル", gradient: "from-fuchsia-500 to-pink-600", registryId: "luxury" },
    { id: "mode", label: "モード", description: "輪郭や構成の強さで印象を作る、感度の高いスタイル", gradient: "from-zinc-800 to-slate-950", registryId: "mode" },
    { id: "street", label: "ストリート", description: "自由さと個性、抜け感を楽しむスタイル", gradient: "from-orange-500 to-rose-500", registryId: "street" },
    { id: "vintage", label: "ヴィンテージ", description: "味わいと時代感を楽しむ、深みのあるスタイル", gradient: "from-amber-500 to-yellow-700", registryId: "vintage" },
    { id: "americancasual", label: "アメカジ", description: "ラフさと親しみやすさを軸にした王道カジュアル", gradient: "from-red-500 to-blue-600", registryId: "amekaji", aliases: ["amekaji"] },
    { id: "workwear", label: "ワークウェア", description: "無骨さと実用性を魅力として着こなすスタイル", gradient: "from-amber-700 to-yellow-700", registryId: "workwear" },
    { id: "outdoor", label: "アウトドア", description: "機能性と軽快さを街でも自然に活かすスタイル", gradient: "from-lime-600 to-green-700", registryId: "outdoor" },
    { id: "sporty", label: "スポーティ", description: "動きやすさと軽さを都会的に見せるスタイル", gradient: "from-emerald-500 to-green-600", registryId: "sporty" },
    { id: "techwear", label: "テックウェア", description: "機能美と近未来感を日常に落とし込むスタイル", gradient: "from-slate-800 to-cyan-700", registryId: "techwear" },
    { id: "trad", label: "トラッド", description: "品のある定番アイテムをベースにした、きちんと感のあるスタイル", gradient: "from-amber-600 to-yellow-700", registryId: "trad" },
    { id: "preppy", label: "プレッピー", description: "知的さと若々しさが共存する、爽やかなスタイル", gradient: "from-teal-500 to-emerald-600", registryId: "preppy" },
    { id: "frenchcasual", label: "フレンチカジュアル", description: "さりげない上品さと抜け感を持つ、洗練されたスタイル", gradient: "from-blue-500 to-slate-700", registryId: "french_casual", aliases: ["french-casual", "french_casual"] },
    { id: "westcoast", label: "西海岸", description: "開放感と自然体の明るさを感じる、爽やかなスタイル", gradient: "from-cyan-500 to-blue-500", registryId: "west_coast", aliases: ["west-coast", "west_coast", "西海岸系"] },
    { id: "koreanclean", label: "韓国クリーン", description: "抜け感と今っぽさを意識した、洗練された韓国系スタイル", gradient: "from-slate-600 to-sky-600", registryId: "korean_fashion", aliases: ["korean-clean", "korean_clean", "korean_fashion", "韓国ファッション"] },
    { id: "feminine", label: "フェミニン", description: "柔らかさと華やかさで、女性らしい印象を作るスタイル", gradient: "from-pink-400 to-rose-500", registryId: "feminine" },
    { id: "mannish", label: "マニッシュ", description: "直線的で凛とした空気感を持つ、ハンサムなスタイル", gradient: "from-slate-700 to-zinc-800", registryId: "mannish" },
    { id: "conservative", label: "コンサバ", description: "上品で無難、好印象を作りやすい王道きれいめスタイル", gradient: "from-rose-500 to-pink-600", registryId: "conservative" },
    { id: "officecasual", label: "オフィスカジュアル", description: "通勤にもなじむ、清潔感と実用性を両立したスタイル", gradient: "from-slate-500 to-blue-600", registryId: "office_casual", aliases: ["office-casual", "office_casual"] },
    { id: "natural", label: "ナチュラル", description: "力みすぎず、やさしさと自然体を感じるスタイル", gradient: "from-emerald-500 to-lime-600", registryId: "daily", aliases: ["daily"] },
    { id: "resort", label: "リゾート", description: "軽やかさと余裕感をまとった、開放的なスタイル", gradient: "from-amber-300 to-cyan-500", registryId: "resort" },
    { id: "rock", label: "ロック", description: "強さとエッジ、少しの反骨心を感じるスタイル", gradient: "from-slate-800 to-rose-700", registryId: "rock" },
    { id: "classic", label: "クラシック", description: "時代に左右されにくい、端正で落ち着いたスタイル", gradient: "from-stone-600 to-neutral-800", registryId: "classic" },
];

const ELEMENT_SEEDS: ElementSeed[] = [
    { code: "oversize", label: "オーバーサイズ", group: "silhouette", description: "余白のあるサイズ感", registryId: "oversize" },
    { code: "justsize", label: "ジャストサイズ", group: "silhouette", description: "整って見える標準のサイズ感", registryId: "justsize" },
    { code: "tightfit", label: "タイトフィット", group: "silhouette", description: "身体に沿うシャープなサイズ感", registryId: "tightfit" },
    { code: "straight-lines", label: "直線的", group: "silhouette", description: "輪郭にシャープさがある構成" },
    { code: "soft-outline", label: "柔らかい輪郭", group: "silhouette", description: "角を立てすぎないやわらかな印象" },
    { code: "roomy-composition", label: "余白のある構成", group: "silhouette", description: "詰め込みすぎず抜け感がある" },
    { code: "monotone", label: "モノトーン", group: "color", description: "白黒グレーを軸にした配色", registryId: "monotone" },
    { code: "earthcolor", label: "アースカラー", group: "color", description: "自然な色味で落ち着く配色", registryId: "earthcolor" },
    { code: "pale-tone", label: "淡色", group: "color", description: "軽さとやわらかさのある淡い色味", aliases: ["pale_tone"] },
    { code: "vividcolor", label: "ビビッド", group: "color", description: "強い色を効かせる配色", registryId: "vividcolor" },
    { code: "colorful", label: "カラフル", group: "color", description: "複数色で遊び心を出す", registryId: "colorfull", aliases: ["colorfull"] },
    { code: "deepcolor", label: "深色", group: "color", description: "深く落ち着いた色が中心" },
    { code: "neutral", label: "ニュートラル", group: "color", description: "偏りすぎない中庸の色バランス" },
    { code: "crisp-texture", label: "張りのある質感", group: "texture", description: "輪郭をきれいに立たせる素材感" },
    { code: "soft-texture", label: "やわらかい質感", group: "texture", description: "肩の力が抜けた質感" },
    { code: "dry-texture", label: "ドライな質感", group: "texture", description: "乾いた空気感を作る" },
    { code: "gloss-texture", label: "艶のある質感", group: "texture", description: "上品さや色気を足す" },
    { code: "structured-texture", label: "構築的な質感", group: "texture", description: "芯のある見え方を作る" },
    { code: "layered", label: "レイヤード", group: "composition", description: "重なりで奥行きを作る", registryId: "layerd", aliases: ["layerd"] },
    { code: "simple", label: "シンプル", group: "composition", description: "足し算しすぎない構成", registryId: "simple" },
    { code: "onepoint", label: "ワンポイント", group: "composition", description: "一点で印象を作る", registryId: "onepoint" },
    { code: "minimal-detail", label: "装飾少なめ", group: "composition", description: "余計なディテールを削いだ見せ方" },
    { code: "color-led", label: "配色で魅せる", group: "composition", description: "色の組み合わせが主役" },
    { code: "material-led", label: "素材感で魅せる", group: "composition", description: "布や革の質感が主役" },
    { code: "clean-impression", label: "清潔感", group: "impression", description: "整っていて澄んだ印象" },
    { code: "calm-impression", label: "落ち着き", group: "impression", description: "穏やかで安心感がある" },
    { code: "elegant-impression", label: "上品さ", group: "impression", description: "大人っぽく丁寧に見える" },
    { code: "approachable-impression", label: "親しみやすさ", group: "impression", description: "近づきやすく自然体" },
    { code: "soft-impression", label: "柔らかさ", group: "impression", description: "やさしく角のない印象" },
    { code: "urban-impression", label: "都会的", group: "impression", description: "洗練されていて今っぽい" },
    { code: "relaxed-impression", label: "余裕感", group: "impression", description: "頑張りすぎず落ち着いている" },
    { code: "sincere-impression", label: "誠実さ", group: "impression", description: "信頼感がある" },
    { code: "strong-core-impression", label: "芯の強さ", group: "impression", description: "凛とした強さを感じる" },
    { code: "natural-impression", label: "自然体", group: "impression", description: "無理をしていない自然な印象" },
    { code: "intellectual-impression", label: "知的さ", group: "impression", description: "考えが整って見える" },
    { code: "calm-mood", label: "静けさ", group: "mood", description: "余白と静かな重心を感じる" },
    { code: "soft-mood", label: "やわらかさ", group: "mood", description: "丸みと緊張の低さを感じる" },
    { code: "sharp-mood", label: "鋭さ", group: "mood", description: "少し強い輪郭に惹かれる" },
    { code: "playful-mood", label: "遊び心", group: "mood", description: "少し崩した楽しさがある" },
    { code: "composed-mood", label: "整い", group: "mood", description: "背筋が伸びる整い方" },
    { code: "worldview-effortless-order", label: "頑張りすぎない整い", group: "worldview", description: "無理をしていないのに整って見える世界観" },
    { code: "worldview-shadowy-calm", label: "少し影のある静けさ", group: "worldview", description: "静かな深さや余韻に惹かれる" },
    { code: "worldview-city-composure", label: "静かな都会感", group: "worldview", description: "都会的なのに張りつめすぎない世界観" },
    { code: "worldview-soft-refinement", label: "やわらかな上品さ", group: "worldview", description: "やさしさと上品さが両立した方向" },
    { code: "worldview-natural-balance", label: "自然体の均整", group: "worldview", description: "きちんとしすぎず崩れすぎない均衡" },
    { code: "tension-mode-accent", label: "少しモード", group: "tension", description: "主軸とは違う少し強い輪郭" },
    { code: "tension-rugged-edge", label: "少し無骨", group: "tension", description: "無骨さが少し混ざる違和感" },
    { code: "tension-broken-elegance", label: "少し崩した上品さ", group: "tension", description: "整いの中に崩しがある" },
    { code: "tension-soft-darkness", label: "少し暗さのある柔らかさ", group: "tension", description: "柔らかいのに甘すぎない" },
    { code: "detail-highbrand-feel", label: "ハイブランド感", group: "detail", description: "格やラグジュアリーさを感じる", registryId: "highbrand" },
    { code: "detail-vintage-feel", label: "古着感", group: "detail", description: "味や時間の経過を楽しむ", registryId: "used" },
    { code: "detail-standard", label: "定番重視", group: "detail", description: "長く使える王道を重視", registryId: "standard" },
    { code: "detail-trend", label: "今っぽさ重視", group: "detail", description: "旬の空気感を優先", registryId: "trend" },
    { code: "detail-practical", label: "実用性重視", group: "detail", description: "使いやすさと機能性を重視", registryId: "practical" },
    { code: "detail-curated", label: "こだわり感あり", group: "detail", description: "選びに意図や審美眼がある", registryId: "curated" },
    { code: "trigger-quiet-composure", label: "整った静けさに触れると", group: "become-trigger", description: "静かな整いを見ると" },
    { code: "trigger-strong-mode", label: "少し強いモードを見ると", group: "become-trigger", description: "強い輪郭を見ると" },
    { code: "trigger-soft-atmosphere", label: "柔らかい雰囲気に入ると", group: "become-trigger", description: "やわらかな空気に触れると" },
    { code: "trigger-rugged-element", label: "無骨な要素を感じると", group: "become-trigger", description: "少し粗さのある要素に触れると" },
    { code: "trigger-refined-world", label: "上品な世界観に触れると", group: "become-trigger", description: "静かな上品さに触れると" },
    { code: "trigger-loose-balance", label: "抜け感のある構成を見ると", group: "become-trigger", description: "力の抜けた均衡を見ると" },
    { code: "trigger-muted-color", label: "静かな色の組み合わせを見ると", group: "become-trigger", description: "落ち着いた色合わせに触れると" },
    { code: "result-composed", label: "少し整いたくなる", group: "become-result", description: "自分もきちんとしたくなる" },
    { code: "result-bold", label: "大胆になる", group: "become-result", description: "少し踏み込みたくなる" },
    { code: "result-soft", label: "柔らかくなる", group: "become-result", description: "自分もやわらかくなっていく" },
    { code: "result-calm", label: "静かになる", group: "become-result", description: "気持ちが落ち着いていく" },
    { code: "result-playful", label: "遊びたくなる", group: "become-result", description: "少し崩したくなる" },
    { code: "result-polished", label: "きちんとしたくなる", group: "become-result", description: "整いを強めたくなる" },
    { code: "result-strong-core", label: "芯が前に出る", group: "become-result", description: "内側の強さが前に出る" },
    { code: "result-loosen", label: "力を抜きたくなる", group: "become-result", description: "肩の力を抜きたくなる" },
];

const GROUP_LABELS: Record<PreferenceTagGroup, string> = {
    silhouette: "シルエット",
    color: "色感",
    texture: "質感",
    mood: "ムード",
    impression: "印象",
    composition: "構成",
    detail: "ディテール",
    worldview: "世界観",
    tension: "惹かれる違和感",
    "become-trigger": "I BECOME トリガー",
    "become-result": "I BECOME 変化",
};

const styleRegistryIndex = new Map(STYLE_LANES.map((lane) => [normalizeToken(lane.id), lane]));
const styleRegistryLabelIndex = new Map(STYLE_LANES.map((lane) => [normalizeToken(lane.label), lane]));
const elementRegistryIndex = new Map(ELEMENTS.map((element) => [normalizeToken(element.id), element]));

export const STYLE_LANE_OPTIONS: StyleLaneOption[] = STYLE_LANE_SEEDS.map((seed) => {
    const registryLane =
        styleRegistryIndex.get(normalizeToken(seed.registryId ?? seed.id)) ??
        styleRegistryLabelIndex.get(normalizeToken(seed.label));
    const images = registryLane?.imgs ? [...registryLane.imgs] : registryLane?.img ? [registryLane.img] : [];
    return {
        id: seed.id,
        label: seed.label,
        description: seed.description,
        gradient: seed.gradient,
        icon: registryLane?.icon,
        images,
        aliases: seed.aliases,
    };
});

export const ELEMENT_OPTIONS: ElementOption[] = ELEMENT_SEEDS.map((seed) => {
    const registryElement = elementRegistryIndex.get(normalizeToken(seed.registryId ?? seed.code));
    return {
        code: seed.code,
        label: seed.label,
        group: seed.group,
        description: seed.description,
        image: registryElement?.img,
        aliases: seed.aliases,
    };
});

export const ELEMENT_GROUPS = Array.from(
    ELEMENT_OPTIONS.reduce((map, option) => {
        const existing = map.get(option.group) ?? [];
        existing.push(option);
        map.set(option.group, existing);
        return map;
    }, new Map<PreferenceTagGroup, ElementOption[]>())
).map(([group, options]) => ({ id: group, label: GROUP_LABELS[group], options }));

const styleLaneAliasMap = new Map<string, StyleLaneCode>();
for (const lane of STYLE_LANE_OPTIONS) {
    for (const alias of [lane.id, lane.label, ...(lane.aliases ?? [])]) {
        styleLaneAliasMap.set(normalizeToken(alias), lane.id);
    }
}

const elementAliasMap = new Map<string, string>();
for (const element of ELEMENT_OPTIONS) {
    for (const alias of [element.code, element.label, ...(element.aliases ?? [])]) {
        elementAliasMap.set(normalizeToken(alias), element.code);
    }
}

const styleLaneIndex = new Map(STYLE_LANE_OPTIONS.map((lane) => [lane.id, lane]));
const elementIndex = new Map(ELEMENT_OPTIONS.map((element) => [element.code, element]));

export function normalizeStyleLaneId(value: unknown) {
    const raw = String(value ?? "").trim();
    if (!raw) return "";
    return styleLaneAliasMap.get(normalizeToken(raw)) ?? "";
}

export function normalizeElementId(value: unknown) {
    const raw = String(value ?? "").trim();
    if (!raw) return "";
    return elementAliasMap.get(normalizeToken(raw)) ?? raw;
}

export function getStyleLaneMeta(value: unknown) {
    const normalized = normalizeStyleLaneId(value);
    return normalized ? styleLaneIndex.get(normalized) : undefined;
}

export function getElementMeta(value: unknown) {
    return elementIndex.get(normalizeElementId(value));
}

export function getStyleLaneLabel(value: unknown) {
    return getStyleLaneMeta(value)?.label ?? String(value ?? "").trim();
}

export function getElementLabel(value: unknown) {
    return getElementMeta(value)?.label ?? String(value ?? "").trim();
}

export function getPreferenceTagGroupLabel(group: PreferenceTagGroup) {
    return GROUP_LABELS[group];
}

export const IMPRESSION_OPTIONS = ELEMENT_OPTIONS.filter((option) => option.group === "impression").map((option) => option.label);

export const WORLDVIEW_OPTIONS = ELEMENT_OPTIONS.filter((option) => option.group === "worldview");
export const TENSION_OPTIONS = ELEMENT_OPTIONS.filter((option) => option.group === "tension");
export const BECOME_TRIGGER_OPTIONS = ELEMENT_OPTIONS.filter((option) => option.group === "become-trigger");
export const BECOME_RESULT_OPTIONS = ELEMENT_OPTIONS.filter((option) => option.group === "become-result");

export const SEEK_CONTEXT_OPTIONS: Array<{ id: SeekContextKey; label: string; description: string }> = [
    { id: "romance", label: "Romance", description: "恋愛として惹かれる相手" },
    { id: "friend", label: "Friend", description: "友達として一緒にいて心地よい相手" },
    { id: "cocreation", label: "Co-creation", description: "一緒に発想や制作を広げたくなる相手" },
    { id: "orbiter", label: "Orbiter", description: "近づきたいというより、見ていたくなる相手" },
];

export const SIMILARITY_OPTIONS: Array<{ id: SimilarityPreference; label: string; description: string }> = [
    { id: "similar", label: "近い方が心地いい", description: "自分と近い空気感に安心感がある" },
    { id: "slightly-different", label: "少し違う方が惹かれる", description: "近さの中に差分があると魅力的" },
    { id: "very-different", label: "かなり違っていても魅力", description: "自分にない魅力へ強く惹かれる" },
    { id: "mixed", label: "一部は近く、一部は違う", description: "共通点と差分の両方が必要" },
];

export const SETUP_MOOD_OPTIONS: Array<{ id: SetupMoodCode; label: string; description: string }> = [
    { id: "calm", label: "落ち着きたい", description: "静かな重心を取り戻したい時" },
    { id: "bold", label: "少し大胆になりたい", description: "いつもより一歩前に出たい時" },
    { id: "soft", label: "柔らかく見せたい", description: "角を立てずに見せたい時" },
    { id: "clean", label: "きちんとしたい", description: "整いを優先したい時" },
    { id: "natural", label: "自然体でいたい", description: "力みすぎずにいたい時" },
    { id: "sharp", label: "芯を出したい", description: "少し強さを出したい時" },
    { id: "composed", label: "力を抜きたい", description: "静かに整えたい時" },
    { id: "playful", label: "遊びたくなる", description: "少し軽さを足したい時" },
];

export function getSetupMoodLabel(value: SetupMoodCode) {
    return SETUP_MOOD_OPTIONS.find((option) => option.id === value)?.label ?? value;
}
