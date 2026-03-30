import type { SeasonChoice, UndertoneChoice, ColorSubtypeOption, ColorPaletteInputs } from "./types";

export const EYE_TYPE_LABELS: Record<string, string> = {
    armond: "アーモンド",
    kirenaga: "切れ長",
    tsurime: "つり目",
    tareme: "たれ目",
    marume: "丸目",
    yanagiba: "柳葉",
};

export const EYE_COLOR_LABELS: Record<string, string> = {
    dark_brown: "ダークブラウン",
    brown: "ブラウン",
    light_brown: "ライトブラウン",
    hazel: "ヘーゼル",
    gray_brown: "グレーブラウン",
    amber: "アンバー",
};

export const FACE_COMPLETION_LABELS: Record<string, string> = {
    eye_shape: "目",
    face_shape: "輪郭",
    brow_shape: "眉",
    nose: "鼻",
    mouth: "口",
    mouth_impression: "口",
    face_impression: "印象",
};

export const DEFAULT_COLOR_PALETTE: ColorPaletteInputs = {
    selectedHex: "#D9B39C",
    hairHex: "#5B4236",
    irisHex: "#6E4F3E",
};

export const SEASON_VISUAL: Record<
    SeasonChoice,
    { label: string; emoji: string; background: string; description: string }
> = {
    spring: {
        label: "Spring",
        emoji: "🌸",
        background: "linear-gradient(135deg, #fcd34d 0%, #fb923c 52%, #f9a8d4 100%)",
        description: "黄み寄りで軽さと透明感が出やすい方向",
    },
    summer: {
        label: "Summer",
        emoji: "🫧",
        background: "linear-gradient(135deg, #bae6fd 0%, #e2e8f0 52%, #fbcfe8 100%)",
        description: "青み寄りで柔らかく明るい方向",
    },
    autumn: {
        label: "Autumn",
        emoji: "🍂",
        background: "linear-gradient(135deg, #d97706 0%, #ea580c 50%, #059669 100%)",
        description: "黄み寄りで深さと落ち着きが出やすい方向",
    },
    winter: {
        label: "Winter",
        emoji: "❄️",
        background: "linear-gradient(135deg, #334155 0%, #4f46e5 50%, #d946ef 100%)",
        description: "青み寄りでコントラストが立つ方向",
    },
};

export const UNDERTONE_VISUAL: Record<
    UndertoneChoice,
    { label: string; color: string; description: string }
> = {
    warm: {
        label: "Warm",
        color: "#F59E0B",
        description: "黄み・赤みのある発色が得意",
    },
    cool: {
        label: "Cool",
        color: "#60A5FA",
        description: "青み・ローズ寄りの発色が得意",
    },
    neutral: {
        label: "Neutral",
        color: "#A78BFA",
        description: "中間で振れ幅を見ながら決める",
    },
};

export const SEASON_RECOMMENDATIONS: Record<
    SeasonChoice,
    { recommended: string[]; avoid: string[] }
> = {
    spring: {
        recommended: ["アイボリー", "コーラル", "アプリコット", "ライトキャメル"],
        avoid: ["青みグレー", "重いチャコール", "冷たいモーブ"],
    },
    summer: {
        recommended: ["ソフトホワイト", "ラベンダー", "スモーキーブルー", "ローズベージュ"],
        avoid: ["黄みオレンジ", "強すぎる黒", "ビビッドキャメル"],
    },
    autumn: {
        recommended: ["オリーブ", "テラコッタ", "ウォームトープ", "ブロンズ"],
        avoid: ["青みピンク", "氷のようなパステル", "真っ白"],
    },
    winter: {
        recommended: ["アイシーホワイト", "ロイヤルブルー", "ボルドー", "チャコール"],
        avoid: ["黄みベージュ", "くすみブラウン", "曖昧なアースカラー"],
    },
};

export const SEASON_AXIS_PRESETS: Record<
    SeasonChoice,
    { undertone: number; value_L: number; chroma_C: number; contrast: number }
> = {
    spring: { undertone: 0.75, value_L: 72, chroma_C: 88, contrast: 0.58 },
    summer: { undertone: -0.58, value_L: 70, chroma_C: 52, contrast: 0.36 },
    autumn: { undertone: 0.7, value_L: 44, chroma_C: 64, contrast: 0.48 },
    winter: { undertone: -0.72, value_L: 38, chroma_C: 92, contrast: 0.86 },
};

export const SEASON_SUBTYPE_OPTIONS: Record<SeasonChoice, ColorSubtypeOption[]> = {
    spring: [
        {
            id: "light_spring",
            season12Id: "light_spring",
            label: "Light Spring",
            nameJa: "ライトスプリング",
            subtitle: "明るさと軽さが主役",
            description: "軽やかな黄みカラーで透明感とやさしい血色感が引き立つタイプ。",
            keywords: ["軽やか", "透明感", "フレッシュ", "ソフト"],
            avoid: ["青みグレー", "重いブラック", "濁ったカーキ"],
            swatches: [
                { name: "バタークリーム", hex: "#F7E4A4" },
                { name: "ピーチベージュ", hex: "#F7C7A5" },
                { name: "ライトアプリコット", hex: "#F9D9C3" },
                { name: "ミントクリーム", hex: "#D6EEDC" },
            ],
        },
        {
            id: "true_spring",
            season12Id: "true_spring",
            label: "True Spring",
            nameJa: "トゥルースプリング",
            subtitle: "春らしい暖かさの中心",
            description: "澄んだ黄みと自然な明るさが似合い、健康的で親しみやすく見えるタイプ。",
            keywords: ["ヘルシー", "明朗", "ナチュラル", "ウォーム"],
            avoid: ["青みローズ", "スモーキーグレー", "冷たいネイビー"],
            swatches: [
                { name: "コーラル", hex: "#F28C6B" },
                { name: "ハニーイエロー", hex: "#F2C94C" },
                { name: "ライトキャメル", hex: "#D6A46B" },
                { name: "アップルグリーン", hex: "#A8D672" },
            ],
        },
        {
            id: "warm_spring",
            season12Id: "true_spring",
            label: "Warm Spring",
            nameJa: "ウォームスプリング",
            subtitle: "黄みと血色感が中心",
            description: "黄みの強い発色と温かいベージュで顔色が安定しやすいタイプ。",
            keywords: ["黄み", "血色感", "陽気", "つや感"],
            avoid: ["青みラベンダー", "クールグレー", "白すぎるモノトーン"],
            swatches: [
                { name: "マリーゴールド", hex: "#F2AE30" },
                { name: "ウォームコーラル", hex: "#F2856D" },
                { name: "カフェラテ", hex: "#C99A6B" },
                { name: "リーフグリーン", hex: "#8FBF5B" },
            ],
        },
        {
            id: "bright_spring",
            season12Id: "bright_spring",
            label: "Bright Spring",
            nameJa: "ブライトスプリング",
            subtitle: "クリアで鮮やか",
            description: "高彩度でも重くならず、シャープな華やかさが出やすいタイプ。",
            keywords: ["鮮やか", "クリア", "華やか", "軽快"],
            avoid: ["くすみベージュ", "鈍いブラウン", "重いオリーブ"],
            swatches: [
                { name: "ブライトコーラル", hex: "#FF7A59" },
                { name: "サンシャイン", hex: "#FFD166" },
                { name: "ターコイズ", hex: "#59C3C3" },
                { name: "クリアアイボリー", hex: "#FAF4E8" },
            ],
        },
    ],
    summer: [
        {
            id: "light_summer",
            season12Id: "light_summer",
            label: "Light Summer",
            nameJa: "ライトサマー",
            subtitle: "淡さと軽さが中心",
            description: "白を混ぜたような淡い青みカラーで、やさしく涼やかに見えるタイプ。",
            keywords: ["淡い", "涼やか", "上品", "エアリー"],
            avoid: ["マスタード", "テラコッタ", "強いブラック"],
            swatches: [
                { name: "ペールブルー", hex: "#D6E6F2" },
                { name: "ミスティローズ", hex: "#EAD6E8" },
                { name: "シェルピンク", hex: "#F4D7DD" },
                { name: "ソフトホワイト", hex: "#F3F1EC" },
            ],
        },
        {
            id: "true_summer",
            season12Id: "true_summer",
            label: "True Summer",
            nameJa: "トゥルーサマー",
            subtitle: "夏らしい青みの中心",
            description: "青みとソフトさのバランスが良く、穏やかで整った印象になるタイプ。",
            keywords: ["品格", "穏やか", "青み", "清潔感"],
            avoid: ["黄みオレンジ", "黄土色", "濃すぎるカーキ"],
            swatches: [
                { name: "スモーキーブルー", hex: "#8CA8C0" },
                { name: "ローズベージュ", hex: "#CFA8B2" },
                { name: "ラベンダーグレー", hex: "#B8AEC6" },
                { name: "ダスティネイビー", hex: "#687A96" },
            ],
        },
        {
            id: "cool_summer",
            season12Id: "true_summer",
            label: "Cool Summer",
            nameJa: "クールサマー",
            subtitle: "青みの整いが中心",
            description: "ローズやブルーの冷たさが映え、シャープすぎず洗練されるタイプ。",
            keywords: ["青み", "端正", "静けさ", "洗練"],
            avoid: ["黄みベージュ", "サーモン", "ウォームブラウン"],
            swatches: [
                { name: "ローズピンク", hex: "#C794B6" },
                { name: "ブルーグレー", hex: "#AAB9D6" },
                { name: "モーヴ", hex: "#B89BC6" },
                { name: "スチールブルー", hex: "#7E95B8" },
            ],
        },
        {
            id: "soft_summer",
            season12Id: "soft_summer",
            label: "Soft Summer",
            nameJa: "ソフトサマー",
            subtitle: "やわらかな灰み",
            description: "くすみを含んだ青みカラーで、静かで知的なムードが出るタイプ。",
            keywords: ["くすみ", "知的", "静穏", "ニュアンス"],
            avoid: ["ビビッドオレンジ", "原色イエロー", "強コントラスト配色"],
            swatches: [
                { name: "グレイッシュローズ", hex: "#C7AAB1" },
                { name: "ダブブルー", hex: "#9EB1BD" },
                { name: "セージミスト", hex: "#AAB6AF" },
                { name: "プラムグレー", hex: "#A89EB5" },
            ],
        },
    ],
    autumn: [
        {
            id: "soft_autumn",
            season12Id: "soft_autumn",
            label: "Soft Autumn",
            nameJa: "ソフトオータム",
            subtitle: "やわらかいアースカラー",
            description: "灰みのある暖色で落ち着きが出やすく、穏やかで自然体に見えるタイプ。",
            keywords: ["穏やか", "アース", "ナチュラル", "くすみ暖色"],
            avoid: ["アイシーピンク", "真っ白", "ビビッドパープル"],
            swatches: [
                { name: "モスベージュ", hex: "#B89C7D" },
                { name: "セージ", hex: "#8F9779" },
                { name: "ウォームグレージュ", hex: "#C3A995" },
                { name: "スモークテラコッタ", hex: "#B47A61" },
            ],
        },
        {
            id: "true_autumn",
            season12Id: "true_autumn",
            label: "True Autumn",
            nameJa: "トゥルーオータム",
            subtitle: "秋らしい深みの中心",
            description: "しっかりとした黄みと深さで、温もりと安定感が出るタイプ。",
            keywords: ["深み", "温もり", "リッチ", "安定感"],
            avoid: ["青みピンク", "クリアホワイト", "冷たいグレー"],
            swatches: [
                { name: "テラコッタ", hex: "#B9643A" },
                { name: "オリーブ", hex: "#7A7F3D" },
                { name: "ブロンズ", hex: "#9F7356" },
                { name: "マスタード", hex: "#C7962F" },
            ],
        },
        {
            id: "warm_autumn",
            season12Id: "true_autumn",
            label: "Warm Autumn",
            nameJa: "ウォームオータム",
            subtitle: "黄みと深みが中心",
            description: "黄みを強く含んだカラーで血色と骨格感がきれいに整うタイプ。",
            keywords: ["黄み", "深色", "活力", "あたたかい"],
            avoid: ["ブルーベースのローズ", "アイスブルー", "モノトーン"],
            swatches: [
                { name: "パンプキン", hex: "#C97334" },
                { name: "ゴールデンオリーブ", hex: "#8E8D3D" },
                { name: "キャメル", hex: "#BC8D5A" },
                { name: "カッパー", hex: "#B86A4F" },
            ],
        },
        {
            id: "deep_autumn",
            season12Id: "deep_autumn",
            label: "Deep Autumn",
            nameJa: "ディープオータム",
            subtitle: "深さと重心が中心",
            description: "暗さとコクのある暖色で輪郭が締まり、重厚感が似合うタイプ。",
            keywords: ["重厚", "陰影", "シック", "ドラマティック"],
            avoid: ["パステルブルー", "ベビーピンク", "軽すぎるアイボリー"],
            swatches: [
                { name: "エスプレッソ", hex: "#6B4226" },
                { name: "フォレスト", hex: "#4A5D23" },
                { name: "ディープラスト", hex: "#8C5A3C" },
                { name: "ボルドーブラウン", hex: "#6F3F3A" },
            ],
        },
    ],
    winter: [
        {
            id: "bright_winter",
            season12Id: "bright_winter",
            label: "Bright Winter",
            nameJa: "ブライトウィンター",
            subtitle: "鮮やかさとコントラスト",
            description: "高彩度の青みカラーで、顔立ちの輪郭と透明感が強く出るタイプ。",
            keywords: ["高彩度", "シャープ", "鮮烈", "高コントラスト"],
            avoid: ["黄みベージュ", "くすみブラウン", "鈍いカーキ"],
            swatches: [
                { name: "コバルト", hex: "#0057B8" },
                { name: "フューシャ", hex: "#E11D48" },
                { name: "アイシーホワイト", hex: "#F8FAFC" },
                { name: "エレクトリックバイオレット", hex: "#6D28D9" },
            ],
        },
        {
            id: "true_winter",
            season12Id: "true_winter",
            label: "True Winter",
            nameJa: "トゥルーウィンター",
            subtitle: "冬らしい冷たさの中心",
            description: "青みと深さのバランスがよく、クリーンで都会的な印象になるタイプ。",
            keywords: ["冷感", "都会的", "クリーン", "端正"],
            avoid: ["黄みブラウン", "オレンジベージュ", "曖昧なアースカラー"],
            swatches: [
                { name: "ロイヤルブルー", hex: "#3155C6" },
                { name: "ワイン", hex: "#7C1F4A" },
                { name: "チャコール", hex: "#2F3545" },
                { name: "クールホワイト", hex: "#F4F7FB" },
            ],
        },
        {
            id: "cool_winter",
            season12Id: "true_winter",
            label: "Cool Winter",
            nameJa: "クールウィンター",
            subtitle: "青みのシャープさ",
            description: "ブルーベースの鋭さがそのまま映え、静かな強さが出るタイプ。",
            keywords: ["青み", "シャープ", "静かな強さ", "モード"],
            avoid: ["黄みアイボリー", "ウォームキャメル", "サーモンピンク"],
            swatches: [
                { name: "インディゴ", hex: "#4F46E5" },
                { name: "プラム", hex: "#7C3AED" },
                { name: "アイスグレー", hex: "#CBD5F5" },
                { name: "クールチェリー", hex: "#BE185D" },
            ],
        },
        {
            id: "deep_winter",
            season12Id: "deep_winter",
            label: "Deep Winter",
            nameJa: "ディープウィンター",
            subtitle: "深さと陰影が中心",
            description: "暗く深い青みカラーで立体感が出やすく、重心の低いモード感が似合うタイプ。",
            keywords: ["深色", "陰影", "モード", "重心低め"],
            avoid: ["黄みキャメル", "ペールピーチ", "ぼんやりしたグレージュ"],
            swatches: [
                { name: "ディープネイビー", hex: "#1E293B" },
                { name: "オーベルジーヌ", hex: "#4C1D95" },
                { name: "バーガンディ", hex: "#7F1D1D" },
                { name: "ブラックチェリー", hex: "#3B0A24" },
            ],
        },
    ],
};
