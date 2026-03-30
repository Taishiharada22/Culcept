/**
 * 素材リテラシー — Material Literacy Guide
 *
 * Material database with 4-axis evaluation:
 * warmth × luster × drape × durability
 */

/* ── Types ── */

export type MaterialAxis = {
    warmth: number;    // 0-1: cold → warm
    luster: number;    // 0-1: matte → glossy
    drape: number;     // 0-1: stiff → flowing
    durability: number; // 0-1: delicate → durable
};

export type MaterialEntry = {
    key: string;
    name: string;
    nameJa: string;
    description: string;
    axes: MaterialAxis;
    seasons: string[];
    formality: number; // 0-1: casual → formal
    careLevel: number; // 0-1: easy → demanding
    pairsWith: string[];
    avoidWith: string[];
};

/* ── Material Database ── */

export const MATERIAL_DB: MaterialEntry[] = [
    {
        key: "cotton",
        name: "Cotton",
        nameJa: "コットン",
        description: "通気性が良く、肌触りが優しい万能素材。洗濯にも強い。",
        axes: { warmth: 0.4, luster: 0.2, drape: 0.3, durability: 0.7 },
        seasons: ["spring", "summer", "autumn"],
        formality: 0.3,
        careLevel: 0.2,
        pairsWith: ["denim", "linen", "leather", "wool"],
        avoidWith: [],
    },
    {
        key: "linen",
        name: "Linen",
        nameJa: "リネン",
        description: "夏に最適。独特のシャリ感と経年変化が魅力。シワも味わい。",
        axes: { warmth: 0.2, luster: 0.3, drape: 0.4, durability: 0.6 },
        seasons: ["spring", "summer"],
        formality: 0.3,
        careLevel: 0.4,
        pairsWith: ["cotton", "leather", "suede"],
        avoidWith: ["velvet"],
    },
    {
        key: "wool",
        name: "Wool",
        nameJa: "ウール",
        description: "保温性に優れた冬の定番。上質なドレープと弾力性。",
        axes: { warmth: 0.9, luster: 0.3, drape: 0.5, durability: 0.7 },
        seasons: ["autumn", "winter"],
        formality: 0.6,
        careLevel: 0.5,
        pairsWith: ["cotton", "cashmere", "leather", "silk"],
        avoidWith: ["linen"],
    },
    {
        key: "cashmere",
        name: "Cashmere",
        nameJa: "カシミヤ",
        description: "極上の柔らかさと軽さ。上品な光沢。丁寧なケアが必要。",
        axes: { warmth: 0.95, luster: 0.5, drape: 0.7, durability: 0.3 },
        seasons: ["autumn", "winter"],
        formality: 0.7,
        careLevel: 0.8,
        pairsWith: ["wool", "silk", "cotton"],
        avoidWith: ["denim", "nylon"],
    },
    {
        key: "silk",
        name: "Silk",
        nameJa: "シルク",
        description: "上品な光沢と滑らかな肌触り。ドレッシーなシーンの主役。",
        axes: { warmth: 0.4, luster: 0.9, drape: 0.9, durability: 0.2 },
        seasons: ["spring", "summer", "autumn"],
        formality: 0.8,
        careLevel: 0.9,
        pairsWith: ["wool", "cashmere", "cotton"],
        avoidWith: ["denim", "nylon", "polyester"],
    },
    {
        key: "denim",
        name: "Denim",
        nameJa: "デニム",
        description: "タフで経年変化を楽しめる。カジュアルの王道素材。",
        axes: { warmth: 0.5, luster: 0.1, drape: 0.1, durability: 0.95 },
        seasons: ["spring", "summer", "autumn", "winter"],
        formality: 0.1,
        careLevel: 0.2,
        pairsWith: ["cotton", "leather", "wool", "flannel"],
        avoidWith: ["silk", "chiffon"],
    },
    {
        key: "leather",
        name: "Leather",
        nameJa: "レザー",
        description: "重厚感とエイジングの魅力。スタイルの格上げに。",
        axes: { warmth: 0.6, luster: 0.6, drape: 0.2, durability: 0.9 },
        seasons: ["autumn", "winter", "spring"],
        formality: 0.5,
        careLevel: 0.6,
        pairsWith: ["denim", "cotton", "wool", "cashmere"],
        avoidWith: [],
    },
    {
        key: "suede",
        name: "Suede",
        nameJa: "スウェード",
        description: "起毛の温かみと上品さ。水に弱いので天候に注意。",
        axes: { warmth: 0.7, luster: 0.1, drape: 0.3, durability: 0.4 },
        seasons: ["autumn", "winter"],
        formality: 0.5,
        careLevel: 0.7,
        pairsWith: ["denim", "cotton", "wool", "linen"],
        avoidWith: ["nylon"],
    },
    {
        key: "polyester",
        name: "Polyester",
        nameJa: "ポリエステル",
        description: "シワになりにくく扱いやすい。速乾性もあり機能的。",
        axes: { warmth: 0.3, luster: 0.4, drape: 0.5, durability: 0.8 },
        seasons: ["spring", "summer", "autumn", "winter"],
        formality: 0.3,
        careLevel: 0.1,
        pairsWith: ["cotton", "nylon"],
        avoidWith: ["silk", "cashmere"],
    },
    {
        key: "nylon",
        name: "Nylon",
        nameJa: "ナイロン",
        description: "軽量で強度が高い。アウトドアやスポーツMIXに。",
        axes: { warmth: 0.2, luster: 0.5, drape: 0.3, durability: 0.85 },
        seasons: ["spring", "summer", "autumn"],
        formality: 0.1,
        careLevel: 0.1,
        pairsWith: ["polyester", "cotton"],
        avoidWith: ["silk", "cashmere", "suede"],
    },
    {
        key: "velvet",
        name: "Velvet",
        nameJa: "ベルベット",
        description: "深みのある光沢と立体感。パーティーや秋冬のアクセントに。",
        axes: { warmth: 0.7, luster: 0.7, drape: 0.6, durability: 0.4 },
        seasons: ["autumn", "winter"],
        formality: 0.7,
        careLevel: 0.6,
        pairsWith: ["silk", "wool", "leather"],
        avoidWith: ["denim", "linen", "nylon"],
    },
    {
        key: "chiffon",
        name: "Chiffon",
        nameJa: "シフォン",
        description: "透け感と軽やかさが魅力。フェミニンなスタイルの定番。",
        axes: { warmth: 0.1, luster: 0.5, drape: 0.95, durability: 0.15 },
        seasons: ["spring", "summer"],
        formality: 0.6,
        careLevel: 0.7,
        pairsWith: ["silk", "cotton"],
        avoidWith: ["denim", "leather"],
    },
    {
        key: "flannel",
        name: "Flannel",
        nameJa: "フランネル",
        description: "起毛で温かい。チェック柄が定番。カジュアルの秋冬要素。",
        axes: { warmth: 0.8, luster: 0.1, drape: 0.3, durability: 0.6 },
        seasons: ["autumn", "winter"],
        formality: 0.2,
        careLevel: 0.3,
        pairsWith: ["denim", "leather", "cotton", "wool"],
        avoidWith: ["silk", "chiffon"],
    },
    {
        key: "knit",
        name: "Knit",
        nameJa: "ニット",
        description: "伸縮性があり着心地抜群。ゲージにより印象が大きく変わる。",
        axes: { warmth: 0.7, luster: 0.2, drape: 0.6, durability: 0.5 },
        seasons: ["autumn", "winter", "spring"],
        formality: 0.4,
        careLevel: 0.4,
        pairsWith: ["denim", "wool", "cotton", "leather"],
        avoidWith: [],
    },
    {
        key: "tweed",
        name: "Tweed",
        nameJa: "ツイード",
        description: "クラシックで重厚。英国的な品格。ジャケットやコートに最適。",
        axes: { warmth: 0.85, luster: 0.2, drape: 0.1, durability: 0.85 },
        seasons: ["autumn", "winter"],
        formality: 0.7,
        careLevel: 0.4,
        pairsWith: ["cotton", "leather", "wool", "silk"],
        avoidWith: ["nylon", "polyester"],
    },
];

/* ── Analysis ── */

export type MaterialTendency = {
    avgAxes: MaterialAxis;
    dominantMaterials: MaterialEntry[];
    missingCategories: string[];
    suggestion: string;
};

export function analyzeMaterialTendency(materialKeys: string[]): MaterialTendency {
    const matched = materialKeys
        .map((k) => MATERIAL_DB.find((m) => m.key === k))
        .filter((m): m is MaterialEntry => !!m);

    if (matched.length === 0) {
        return {
            avgAxes: { warmth: 0.5, luster: 0.5, drape: 0.5, durability: 0.5 },
            dominantMaterials: [],
            missingCategories: ["warm", "cool", "formal", "casual"],
            suggestion: "素材を登録すると傾向分析ができます",
        };
    }

    const avgAxes: MaterialAxis = {
        warmth: matched.reduce((s, m) => s + m.axes.warmth, 0) / matched.length,
        luster: matched.reduce((s, m) => s + m.axes.luster, 0) / matched.length,
        drape: matched.reduce((s, m) => s + m.axes.drape, 0) / matched.length,
        durability: matched.reduce((s, m) => s + m.axes.durability, 0) / matched.length,
    };

    const dominantMaterials = [...matched].sort(
        (a, b) =>
            Object.values(b.axes).reduce((s, v) => s + v, 0) -
            Object.values(a.axes).reduce((s, v) => s + v, 0),
    );

    const missing: string[] = [];
    if (avgAxes.warmth > 0.6 && !matched.some((m) => m.axes.warmth < 0.3)) {
        missing.push("涼感素材");
    }
    if (avgAxes.warmth < 0.4 && !matched.some((m) => m.axes.warmth > 0.7)) {
        missing.push("保温素材");
    }
    if (avgAxes.drape < 0.4 && !matched.some((m) => m.axes.drape > 0.7)) {
        missing.push("ドレープ素材");
    }
    if (!matched.some((m) => m.formality > 0.6)) {
        missing.push("フォーマル素材");
    }

    const suggestion =
        missing.length > 0
            ? `${missing.join("・")}を取り入れると幅が広がります`
            : "バランスの良い素材構成です";

    return { avgAxes, dominantMaterials, missingCategories: missing, suggestion };
}

/** Get material by key */
export function getMaterial(key: string): MaterialEntry | undefined {
    return MATERIAL_DB.find((m) => m.key === key);
}

/** Check if two materials pair well */
export function checkMaterialPairing(key1: string, key2: string): {
    compatible: boolean;
    score: number;
    note: string;
} {
    const m1 = getMaterial(key1);
    const m2 = getMaterial(key2);
    if (!m1 || !m2) return { compatible: true, score: 50, note: "" };

    if (m1.avoidWith.includes(key2) || m2.avoidWith.includes(key1)) {
        return { compatible: false, score: 25, note: `${m1.nameJa}と${m2.nameJa}は相性注意` };
    }

    if (m1.pairsWith.includes(key2) || m2.pairsWith.includes(key1)) {
        return { compatible: true, score: 90, note: `${m1.nameJa}×${m2.nameJa}は好相性` };
    }

    return { compatible: true, score: 60, note: "" };
}
