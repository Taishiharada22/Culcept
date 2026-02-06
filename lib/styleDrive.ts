export type StyleDrive = {
    id: string;
    name: string;
    description: string;
    icon: string;
    gradient: string;
    accent: string;
};

export const STYLE_DRIVES: StyleDrive[] = [
    {
        id: "street",
        name: "ストリートドライブ",
        description: "ストリートファッションを愛する人たちの集まり",
        icon: "🧢",
        gradient: "from-orange-500 to-red-500",
        accent: "#F97316",
    },
    {
        id: "minimal",
        name: "ミニマルドライブ",
        description: "シンプルで洗練されたスタイルを追求",
        icon: "⬜",
        gradient: "from-slate-600 to-gray-800",
        accent: "#64748B",
    },
    {
        id: "vintage",
        name: "ヴィンテージドライブ",
        description: "レトロ・ヴィンテージスタイルの愛好家",
        icon: "🎸",
        gradient: "from-amber-500 to-yellow-600",
        accent: "#F59E0B",
    },
    {
        id: "sporty",
        name: "スポーティドライブ",
        description: "スポーティなスタイルをカジュアルに",
        icon: "🏃",
        gradient: "from-green-500 to-emerald-500",
        accent: "#10B981",
    },
    {
        id: "luxury",
        name: "ラグジュアリードライブ",
        description: "高級ブランドとハイファッション",
        icon: "💎",
        gradient: "from-purple-600 to-pink-500",
        accent: "#A855F7",
    },
    {
        id: "casual",
        name: "デイリードライブ",
        description: "毎日のおしゃれを楽しむ",
        icon: "👕",
        gradient: "from-blue-500 to-cyan-500",
        accent: "#3B82F6",
    },
];

export function getStyleDrive(id: string) {
    return STYLE_DRIVES.find((drive) => drive.id === id);
}
