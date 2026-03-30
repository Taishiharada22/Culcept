"use client";

import * as React from "react";
import { GlassCard } from "@/components/ui/glassmorphism-design";
import type { SavedState, WardrobeItem } from "../_lib/types";
import { CATEGORIES, COLOR_OPTIONS, resizeImage, uid } from "../_lib/constants";
import { computeColorPrefs } from "../_lib/colorPrefs";
import { SubcategorySampleBackground } from "../../../../src/components/item-editor/SubcategorySampleBackground";
import WardrobeCard from "./WardrobeCard";
import {
    CARE_OPTIONS,
    CATEGORY_MAIN_OPTIONS,
    DRAPE_OPTIONS,
    FORMALITY_OPTIONS,
    KNIT_GAUGE_OPTIONS,
    KNIT_TYPE_OPTIONS,
    MATERIAL_FAMILY_OPTIONS,
    PATTERN_OPTIONS,
    SEASON_OPTIONS,
    SILHOUETTE_OPTIONS,
    STRETCH_OPTIONS,
    SURFACE_FINISH_OPTIONS,
    THICKNESS_OPTIONS,
    TRANSPARENCY_OPTIONS,
    WATER_OPTIONS,
    FOOTWEAR_UPPER_MATERIAL_OPTIONS,
    FOOTWEAR_SOLE_TYPE_OPTIONS,
    FOOTWEAR_SURFACE_FINISH_OPTIONS,
    FOOTWEAR_CONSTRUCTION_OPTIONS,
    FOOTWEAR_TOE_SHAPE_OPTIONS,
    FOOTWEAR_SILHOUETTE_OPTIONS,
    FOOTWEAR_FIT_OPTIONS,
    FOOTWEAR_HEEL_HEIGHT_OPTIONS,
    isFootwearCategory,
    calcWardrobeQuality,
    defaultSubcategory,
    getSubcategoryOptionsByMain,
    inferCategoryMainFromLegacy,
    inferLegacyCategory,
    isKnitSubcategory,
    optionLabel,
    qualityLabel,
    type CareCode,
    type CategoryMain,
    type DrapeCode,
    type FormalityCode,
    type KnitGaugeCode,
    type KnitTypeCode,
    type PatternCode,
    type SeasonCode,
    type SilhouetteCode,
    type StretchCode,
    type ThicknessCode,
    type TransparencyCode,
    type WaterCode,
} from "../_lib/taxonomy";
import { inferItemHintsFromImage, type ItemInferenceHints } from "../_lib/inferItemHints";

interface WardrobeTabProps {
    state: SavedState;
    setState: React.Dispatch<React.SetStateAction<SavedState>>;
    showAddFormDefault?: boolean;
    onAddToSetup?: (itemId: string) => void;
}

type RowConfig = {
    category: WardrobeItem["category"];
    label: string;
    icon: string;
    direction: "rtl" | "ltr";
    layer: "back" | "front" | "base";
    optional?: boolean;
};

type DraftState = {
    imageUrl: string | null;
    categoryMain: CategoryMain;
    subcategory: string;
    color: string;
    colorName: string;
    colorHex: string;
    season: SeasonCode;
    thickness: ThicknessCode;
    formality: FormalityCode;
    materialFamily: string[];
    surfaceFinish: string[];
    drape?: DrapeCode;
    silhouette?: SilhouetteCode;
    pattern?: PatternCode;
    knitGauge?: KnitGaugeCode;
    knitType?: KnitTypeCode;
    stretch?: StretchCode;
    warmth?: 1 | 2 | 3;
    water?: WaterCode;
    transparency?: TransparencyCode;
    care?: CareCode;
    memo: string;
};

const SHOWCASE_ROWS: RowConfig[] = [
    { category: "outerwear", label: "アウター", icon: "🧥", direction: "rtl", layer: "front" },
    { category: "tops", label: "トップス", icon: "👕", direction: "ltr", layer: "back" },
    { category: "bottoms", label: "ボトムス", icon: "👖", direction: "rtl", layer: "front" },
    { category: "shoes", label: "靴", icon: "👟", direction: "ltr", layer: "back" },
    { category: "other", label: "その他", icon: "📦", direction: "rtl", layer: "base", optional: true },
];

const ROW_HIGHLIGHT: Record<WardrobeItem["category"], { border: string; fill: string; glow: string; accent: string }> = {
    hat: { border: "#cfe2ff", fill: "rgba(224,236,255,0.62)", glow: "rgba(113,145,214,0.35)", accent: "#3b82f6" },
    outerwear: { border: "#cfead8", fill: "rgba(227,244,236,0.64)", glow: "rgba(82,164,125,0.35)", accent: "#10b981" },
    tops: { border: "#ffe2cb", fill: "rgba(255,241,230,0.66)", glow: "rgba(216,145,78,0.35)", accent: "#f59e0b" },
    bottoms: { border: "#d9dcff", fill: "rgba(233,235,255,0.62)", glow: "rgba(111,121,214,0.35)", accent: "#6366f1" },
    shoes: { border: "#ffe3e3", fill: "rgba(255,236,236,0.62)", glow: "rgba(202,116,116,0.35)", accent: "#ef4444" },
    accessories: { border: "#f2defd", fill: "rgba(247,236,255,0.62)", glow: "rgba(171,115,198,0.34)", accent: "#a855f7" },
    other: { border: "#e6e9f1", fill: "rgba(240,243,250,0.62)", glow: "rgba(129,141,171,0.32)", accent: "#64748b" },
};

// Section step indicator colors
const SECTION_COLORS = {
    A: { bg: "bg-indigo-600", light: "bg-indigo-50", border: "border-indigo-200", text: "text-indigo-700", ring: "ring-indigo-500" },
    B: { bg: "bg-cyan-600", light: "bg-cyan-50", border: "border-cyan-200", text: "text-cyan-700", ring: "ring-cyan-500" },
    C: { bg: "bg-slate-600", light: "bg-slate-50", border: "border-slate-200", text: "text-slate-700", ring: "ring-slate-500" },
};

function createEmptyDraft(main: CategoryMain = "tops"): DraftState {
    const colorDefault = COLOR_OPTIONS[0] ?? { value: "black", label: "ブラック", hex: "#1a1a1a" };
    return {
        imageUrl: null,
        categoryMain: main,
        subcategory: defaultSubcategory(main),
        color: colorDefault.value,
        colorName: colorDefault.label,
        colorHex: colorDefault.hex,
        season: "all",
        thickness: "mid",
        formality: "casual",
        materialFamily: [],
        surfaceFinish: [],
        memo: "",
    };
}

function normalizeHex(v: string) {
    const trimmed = String(v ?? "").trim();
    if (!trimmed) return "";
    const prefixed = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
    return /^#[0-9a-fA-F]{6}$/.test(prefixed) ? prefixed : "";
}

function toDraft(item: WardrobeItem): DraftState {
    const categoryMain = item.categoryMain ?? inferCategoryMainFromLegacy(item.category);
    const colorOption = COLOR_OPTIONS.find((x) => x.value === item.color);
    const subcategory = item.subcategory && item.subcategory.startsWith("subcategory.")
        ? item.subcategory
        : defaultSubcategory(categoryMain);
    return {
        imageUrl: item.imageUrl ?? null,
        categoryMain,
        subcategory,
        color: item.color || colorOption?.value || "black",
        colorName: item.colorName ?? colorOption?.label ?? item.color ?? "",
        colorHex: item.colorHex ?? colorOption?.hex ?? "",
        season: item.season ?? "all",
        thickness: item.thickness ?? "mid",
        formality: item.formality ?? "casual",
        materialFamily: Array.isArray(item.materialFamily) ? item.materialFamily : [],
        surfaceFinish: Array.isArray(item.surfaceFinish) ? item.surfaceFinish : [],
        drape: item.drape,
        silhouette: item.silhouette,
        pattern: item.pattern,
        knitGauge: item.knitProfile?.gauge,
        knitType: item.knitProfile?.type,
        stretch: item.attributes?.stretch,
        warmth: item.attributes?.warmth,
        water: item.attributes?.water,
        transparency: item.attributes?.transparency,
        care: item.attributes?.care,
        memo: item.memo ?? "",
    };
}

function pickColorByHex(hex: string) {
    const normalized = normalizeHex(hex).toLowerCase();
    if (!normalized) return null;
    return COLOR_OPTIONS.find((x) => x.hex.toLowerCase() === normalized) ?? null;
}

function toggleArrayItem(list: string[], value: string) {
    return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}

// Chip button component for consistent styling
function ChipButton({
    selected,
    onClick,
    color = "slate",
    size = "sm",
    children,
}: {
    selected: boolean;
    onClick: () => void;
    color?: "slate" | "indigo" | "cyan" | "violet" | "emerald";
    size?: "sm" | "xs";
    children: React.ReactNode;
}) {
    const colorMap = {
        slate: selected ? "bg-slate-900 text-white shadow-sm" : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300",
        indigo: selected ? "bg-indigo-600 text-white shadow-sm" : "border border-indigo-200 bg-white text-indigo-700 hover:border-indigo-300",
        cyan: selected ? "bg-cyan-600 text-white shadow-sm" : "border border-cyan-200 bg-white text-cyan-700 hover:border-cyan-300",
        violet: selected ? "bg-violet-600 text-white shadow-sm" : "border border-violet-200 bg-white text-violet-700 hover:border-violet-300",
        emerald: selected ? "bg-emerald-600 text-white shadow-sm" : "border border-emerald-200 bg-white text-emerald-700 hover:border-emerald-300",
    };
    const sizeClass = size === "xs" ? "px-2 py-0.5 text-[10px]" : "px-3 py-1 text-xs";
    return (
        <button
            type="button"
            onClick={onClick}
            className={`rounded-lg font-bold transition-all duration-150 ${sizeClass} ${colorMap[color]}`}
        >
            {children}
        </button>
    );
}

// Section header for form
function SectionHeader({ section, label, description }: { section: "A" | "B" | "C"; label: string; description: string }) {
    const sc = SECTION_COLORS[section];
    return (
        <div className="flex items-center gap-3 mb-3">
            <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${sc.bg} text-white text-xs font-black shadow-sm`}>
                {section}
            </div>
            <div>
                <div className="text-sm font-black text-slate-900">{label}</div>
                <div className="text-[10px] text-slate-400">{description}</div>
            </div>
        </div>
    );
}

// Field label
function FieldLabel({ children }: { children: React.ReactNode }) {
    return <div className="mb-1.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider">{children}</div>;
}

// ── B section sample image mapping ──
// Maps taxonomy option values → image filenames in /public/samples/B/
// 説明テキストを追加する場合は、各エントリの desc フィールドに日本語で記載してください。
const B_SAMPLE_IMAGE_MAP: Record<string, { file: string; desc: string }> = {
    // 素材ファミリー
    "material.knit": { file: "knit.png", desc: "編み地の立体感で季節感と上品さが出る素材。ハイゲージはきれいめ、ローゲージはカジュアル寄り。" },
    "material.wool": { file: "wool.png", desc: "保温性と弾力のある天然素材。冬の上品さが出る一方、毛羽・チクチク感は混率や織りで差が出る。" },
    "material.cotton": { file: "cotton.png", desc: "肌当たりが良く通年使える定番素材。シワは出やすいが扱いやすく、清潔感が作りやすい。" },
    "material.denim": { file: "denim.png", desc: "綾織りの丈夫な素材。色落ちやアタリで表情が育ち、カジュアルの主役になりやすい。" },
    "material.leather": { file: "leather.png", desc: "重厚で高級感が出る素材。シボ/艶で印象が変わり、経年変化も魅力（ケア前提）。" },
    "material.suede": { file: "suede.png", desc: "起毛した革でマットで柔らかな表情。上品に見えるが、水・擦れ・汚れに弱いので注意。" },
    "material.tech_nylon": { file: "tech.png", desc: "軽量で撥水・防風など機能性が出る素材。スポーティ〜モードまで振れ幅が広い。" },
    "material.silk": { file: "silk.png", desc: "なめらかな光沢と落ち感が出る上品素材。肌触りが良いが、水ジミや摩擦に弱め。" },
    "material.linen": { file: "linen.png", desc: "通気性が高く涼しい夏素材。ネップやシワが“味”になり、抜け感が出る。" },
    "material.fleece": { file: "fleece.png", desc: "起毛で暖かく軽い素材。カジュアル/アウトドア感が出やすい（毛玉はケアで差）。" },
    "material.down": { file: "down.png", desc: "中綿で高い保温性。ボリュームが出やすく、シルエットが大きく変わる主張素材。" },
    "material.polyester": { file: "polyester.png", desc: "シワに強く乾きやすい実用素材。形状安定で機能服〜きれいめまで幅広く対応。" },
    "material.cashmere": { file: "cashmere.png", desc: "繊細でとろける肌触り。軽く暖かいが、毛玉・摩耗には注意（優しく扱うと長持ち）。" },

    // 表面仕上げ
    "surface.matte": { file: "matte.png", desc: "光沢を抑えた落ち着いた質感。大人っぽく、色が締まって見えやすい。" },
    "surface.subtle_sheen": { file: "lustrous.png", desc: "控えめな艶で上品さを足す仕上げ。光が当たると“ふわっ”と光る程度。" },
    "surface.satin_like": { file: "satinstyle.png", desc: "サテン調の滑らかな光沢。ドレッシー/フェミニン寄りに見せたい時に強い。" },
    "surface.brushed": { file: "brushed.png", desc: "表面を起毛させた柔らかい触感。暖かさと季節感が出る（秋冬向き）。" },
    "surface.fuzzy": { file: "fuzzy.png", desc: "毛足が長めでふわ感が強い。見た目にボリュームと“可愛さ/やさしさ”が出る。" },
    "surface.smooth": { file: "smooth.png", desc: "凹凸が少なくつるっとした表面。クリーンでミニマル、きれいめに寄る。" },
    "surface.grainy": { file: "grain.png", desc: "細かな凹凸（シボ/粒感）がある質感。奥行きが出て、傷や汚れも目立ちにくい。" },
    "surface.washed": { file: "wash.png", desc: "洗い加工のこなれた表情。色ムラやアタリでラフさ・古着感を作れる。" },
    "surface.wrinkled": { file: "wrinkles.png", desc: "シワ感のある表面。抜け感・リラックス感が出て、固さを和らげられる。" },

    // 落ち感
    "structured": { file: "stiff.png", desc: "ハリがあり形が立つ。直線的でクリーン、構築的な印象になりやすい。" },
    "balanced": { file: "balance.png", desc: "ハリと落ち感のバランス型。扱いやすく、きれいめ〜カジュアルまで対応。" },
    "drapey": { file: "fluiddrape.png", desc: "とろみがあり流れる落ち感。動きと上品さ（色気）が出やすい。" },

    // シルエット
    "slim": { file: "slim.png", desc: "身体に沿う細身シルエット。シャープで大人っぽく、きれいめに見せやすい。" },
    "regular": { file: "regular.png", desc: "標準シルエット。最も汎用性が高く、合わせるアイテムを選びにくい。" },
    "loose": { file: "loose.png", desc: "程よいゆとりのリラックスシルエット。今っぽさと抜け感が出る。" },
    "oversized": { file: "oversize.png", desc: "大きめで布量が出る。ストリート/モード寄りの存在感が作れる。" },

    // 柄
    "solid": { file: "plain.png", desc: "無地。素材とシルエットが主役になり、コーデの汎用性が高い。" },
    "stripe": { file: "stripe.png", desc: "ストライプ柄。縦はすっきり見えやすく、太ピッチは主張が強くなる。" },
    "check": { file: "check.png", desc: "チェック柄。トラッド感や温かみが出る。細かいほど上品、粗いほどカジュアル。" },
    "jacquard": { file: "Jacquard.png", desc: "織りで柄を出す立体感のある表情。無地より奥行きが出て高級感が出やすい。" },
    "allover": { file: "alloverprint.png", desc: "全面プリント柄。華やかで主役級。合わせは“引き算”するとまとまりやすい。" },

    // その他
    "thick": { file: "thick.png", desc: "厚手で透けにくい。保温性と存在感が出て、シルエットも安定しやすい。" },
    "thin": { file: "thin.png", desc: "薄手で軽い。レイヤード向きで、空気感・繊細さが出る（透けは注意）。" },
    "heavy": { file: "heavy.png", desc: "重みのある生地感。落ち感や高級感、無骨さが出やすい（夏は暑め）。" },
    "fluffy": { file: "fluffy.png", desc: "ふわっと空気を含む質感。柔らかく優しい印象で、季節感も出しやすい。" },
};

function getBSampleImage(optionValue: string): { src: string; desc: string } | null {
    const entry = B_SAMPLE_IMAGE_MAP[optionValue];
    if (entry) return { src: `/samples/B/${entry.file}`, desc: entry.desc };
    // Try stripping prefix (e.g. "material.cotton" → "cotton")
    const short = optionValue.split(".").pop();
    if (short) {
        const byShort = Object.values(B_SAMPLE_IMAGE_MAP).find((e) => e.file.replace(".png", "").toLowerCase() === short.toLowerCase());
        if (byShort) return { src: `/samples/B/${byShort.file}`, desc: byShort.desc };
    }
    return null;
}

// Attribute Card for Section B selected items
function AttributeCard({
    label,
    category,
    color,
    optionValue,
    onRemove,
}: {
    label: string;
    category: string;
    color: "cyan" | "violet" | "slate";
    optionValue?: string;
    onRemove: () => void;
}) {
    const colorMap = {
        cyan: "from-cyan-400 to-cyan-600",
        violet: "from-violet-400 to-violet-600",
        slate: "from-slate-400 to-slate-600",
    };

    const sampleImg = optionValue ? getBSampleImage(optionValue) : null;

    return (
        <div className="relative flex-shrink-0 w-24 group">
            <div className={`relative w-full aspect-[3/4] rounded-xl overflow-hidden ${sampleImg ? "" : `bg-gradient-to-br ${colorMap[color]}`} shadow-md group-hover:shadow-lg transition-all`}>
                {/* Sample image background */}
                {sampleImg ? (
                    <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={sampleImg.src}
                            alt={label}
                            className="absolute inset-0 w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                    </>
                ) : null}

                {/* Content */}
                <div className="absolute inset-0 flex flex-col items-end justify-end p-2 text-right">
                    <div className="text-white text-xs font-bold mb-0.5 drop-shadow-sm">{label}</div>
                    <div className="text-white/80 text-[9px] drop-shadow-sm">{category}</div>
                    {sampleImg?.desc && (
                        <div className="text-white/60 text-[8px] mt-0.5 leading-tight drop-shadow-sm">{sampleImg.desc}</div>
                    )}
                </div>

                {/* Remove button */}
                <button
                    type="button"
                    onClick={onRemove}
                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-rose-500 text-white flex items-center justify-center text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity shadow-lg hover:bg-rose-600"
                >
                    ✕
                </button>
            </div>
        </div>
    );
}

export default function WardrobeTab({ state, setState, showAddFormDefault, onAddToSetup }: WardrobeTabProps) {
    const [showAddForm, setShowAddForm] = React.useState(showAddFormDefault ?? false);
    const [editingItemId, setEditingItemId] = React.useState<string | null>(null);
    const [draft, setDraft] = React.useState<DraftState>(() => createEmptyDraft("tops"));
    const [addImagePreview, setAddImagePreview] = React.useState<string | null>(null);
    const [uploading, setUploading] = React.useState(false);
    const [saveError, setSaveError] = React.useState<string | null>(null);
    const [inference, setInference] = React.useState<ItemInferenceHints | null>(null);
    const [expandedSection, setExpandedSection] = React.useState<"A" | "B" | "C" | null>("A");
    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const rowRefs = React.useRef<Record<string, HTMLDivElement | null>>({});

    React.useEffect(() => {
        if (showAddFormDefault) setShowAddForm(true);
    }, [showAddFormDefault]);

    const quality = React.useMemo(() => calcWardrobeQuality(draft), [draft]);
    const canSave = quality.requiredMissing.length === 0 && !uploading;
    const subcategoryOptions = React.useMemo(() => getSubcategoryOptionsByMain(draft.categoryMain), [draft.categoryMain]);
    const isKnit = isKnitSubcategory(draft.subcategory);

    const itemsByCategory = React.useMemo(() => {
        const grouped: Record<WardrobeItem["category"], WardrobeItem[]> = {
            tops: [],
            bottoms: [],
            outerwear: [],
            shoes: [],
            accessories: [],
            hat: [],
            other: [],
        };
        for (const item of state.wardrobe) grouped[item.category].push(item);
        return grouped;
    }, [state.wardrobe]);

    React.useEffect(() => {
        const cleanups: Array<() => void> = [];
        for (const row of SHOWCASE_ROWS) {
            const source = row.category === "other"
                ? [
                    ...(itemsByCategory.hat ?? []),
                    ...(itemsByCategory.accessories ?? []),
                    ...(itemsByCategory.other ?? []),
                ]
                : itemsByCategory[row.category];
            if (!source || source.length < 2) continue;
            const el = rowRefs.current[row.category];
            if (!el) continue;

            let raf = 0;
            let running = true;
            const speed = 0.35;
            const getMax = () => Math.max(0, el.scrollWidth - el.clientWidth);
            let position = row.direction === "rtl" ? 0 : getMax();

            const tick = () => {
                if (!running) return;
                const max = getMax();
                if (max <= 0) {
                    raf = requestAnimationFrame(tick);
                    return;
                }
                if (row.direction === "rtl") {
                    position += speed;
                    if (position >= max) position = 0;
                } else {
                    position -= speed;
                    if (position <= 0) position = max;
                }
                el.scrollLeft = position;
                raf = requestAnimationFrame(tick);
            };

            const pause = () => {
                running = false;
                cancelAnimationFrame(raf);
            };
            const resume = () => {
                if (running) return;
                running = true;
                raf = requestAnimationFrame(tick);
            };

            raf = requestAnimationFrame(tick);
            el.addEventListener("mouseenter", pause);
            el.addEventListener("mouseleave", resume);
            el.addEventListener("touchstart", pause, { passive: true });
            el.addEventListener("touchend", resume, { passive: true });

            cleanups.push(() => {
                cancelAnimationFrame(raf);
                el.removeEventListener("mouseenter", pause);
                el.removeEventListener("mouseleave", resume);
                el.removeEventListener("touchstart", pause);
                el.removeEventListener("touchend", resume);
            });
        }

        return () => {
            cleanups.forEach((fn) => fn());
        };
    }, [itemsByCategory]);

    const resetForm = React.useCallback((main: CategoryMain = "tops") => {
        setDraft(createEmptyDraft(main));
        setAddImagePreview(null);
        setEditingItemId(null);
        setInference(null);
        setSaveError(null);
        setExpandedSection("A");
        if (fileInputRef.current) fileInputRef.current.value = "";
    }, []);

    const runInference = React.useCallback(async (imageUrl: string, categoryMain: CategoryMain) => {
        try {
            const hints = await inferItemHintsFromImage({
                imageUrl,
                categoryMain,
                palette: COLOR_OPTIONS.map((x) => ({ value: x.value, hex: x.hex })),
            });
            setInference(hints);
        } catch {
            setInference(null);
        }
    }, []);

    const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !file.type.startsWith("image/")) return;
        setUploading(true);
        setSaveError(null);
        try {
            const base64 = await resizeImage(file, 640, 960);
            setAddImagePreview(base64);
            setDraft((prev) => ({ ...prev, imageUrl: base64 }));
            void runInference(base64, draft.categoryMain);
        } catch {
            setSaveError("画像処理に失敗しました");
        } finally {
            setUploading(false);
        }
    };

    const clearImagePreview = () => {
        setAddImagePreview(null);
        setDraft((prev) => ({ ...prev, imageUrl: null }));
        setInference(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const applyInferenceChip = (kind: "subcategory" | "material" | "surface" | "season" | "thickness" | "formality" | "drape" | "silhouette" | "pattern", value: string) => {
        setDraft((prev) => {
            if (kind === "subcategory") return { ...prev, subcategory: value };
            if (kind === "material") return { ...prev, materialFamily: toggleArrayItem(prev.materialFamily, value) };
            if (kind === "surface") return { ...prev, surfaceFinish: toggleArrayItem(prev.surfaceFinish, value) };
            if (kind === "season") return { ...prev, season: value as SeasonCode };
            if (kind === "thickness") return { ...prev, thickness: value as ThicknessCode };
            if (kind === "formality") return { ...prev, formality: value as FormalityCode };
            if (kind === "drape") return { ...prev, drape: value as DrapeCode };
            if (kind === "silhouette") return { ...prev, silhouette: value as SilhouetteCode };
            return { ...prev, pattern: value as PatternCode };
        });
    };

    const buildAutoName = React.useCallback((category: WardrobeItem["category"]) => {
        const label = CATEGORIES.find((cat) => cat.value === category)?.label ?? "アイテム";
        return `${label}アイテム`;
    }, []);

    const saveItem = () => {
        const q = calcWardrobeQuality(draft);
        if (q.requiredMissing.length > 0) {
            setSaveError(`必須項目が不足しています: ${q.requiredMissing.join(" / ")}`);
            return;
        }
        if (!draft.imageUrl) {
            setSaveError("画像を追加してください");
            return;
        }

        const legacyCategory = inferLegacyCategory(draft.categoryMain, draft.subcategory);
        const colorFromHex = pickColorByHex(draft.colorHex);
        const colorValue = colorFromHex?.value ?? draft.color ?? "black";
        const colorLabel = draft.colorName.trim() || colorFromHex?.label || colorValue;
        const colorHex = normalizeHex(draft.colorHex) || colorFromHex?.hex || "";

        const nextItemBase = {
            name: buildAutoName(legacyCategory),
            category: legacyCategory,
            categoryMain: draft.categoryMain,
            subcategory: draft.subcategory,
            color: colorValue,
            colorName: colorLabel,
            colorHex,
            imageUrl: draft.imageUrl ?? undefined,
            season: draft.season,
            thickness: draft.thickness,
            formality: draft.formality,
            materialFamily: [...new Set(draft.materialFamily)],
            surfaceFinish: [...new Set(draft.surfaceFinish)],
            drape: draft.drape,
            silhouette: draft.silhouette,
            pattern: draft.pattern,
            knitProfile: isKnit
                ? {
                    gauge: draft.knitGauge,
                    type: draft.knitType,
                }
                : undefined,
            attributes: {
                stretch: draft.stretch,
                warmth: draft.warmth,
                water: draft.water,
                transparency: draft.transparency,
                care: draft.care,
            },
            memo: draft.memo.trim(),
            qualityScore: q.score,
            missingBadges: q.badges,
        };

        setState((prev) => {
            let wardrobe: WardrobeItem[];
            if (editingItemId) {
                wardrobe = prev.wardrobe.map((w) => {
                    if (w.id !== editingItemId) return w;
                    return {
                        ...w,
                        ...nextItemBase,
                    };
                });
            } else {
                const item: WardrobeItem = {
                    id: uid(),
                    ...nextItemBase,
                    addedAt: new Date().toISOString(),
                };
                wardrobe = [...prev.wardrobe, item];
            }
            return {
                ...prev,
                wardrobe,
                colorPrefs: computeColorPrefs(wardrobe),
            };
        });

        setShowAddForm(false);
        resetForm();
    };

    const startEdit = (item: WardrobeItem) => {
        setEditingItemId(item.id);
        const d = toDraft(item);
        setDraft(d);
        setAddImagePreview(item.imageUrl ?? null);
        setInference(null);
        setShowAddForm(true);
        setSaveError(null);
        setExpandedSection("A");
    };

    const removeItem = (id: string) => {
        setState((prev) => {
            const wardrobe = prev.wardrobe.filter((w) => w.id !== id);
            return {
                ...prev,
                wardrobe,
                setups: prev.setups.map((s) => ({ ...s, itemIds: s.itemIds.filter((itemId) => itemId !== id) })),
                colorPrefs: computeColorPrefs(wardrobe),
            };
        });
    };

    // Quality score color
    const qualityColor = quality.score >= 90
        ? "from-emerald-500 to-teal-500"
        : quality.score >= 70
            ? "from-sky-500 to-blue-500"
            : quality.score >= 40
                ? "from-amber-500 to-orange-500"
                : "from-slate-400 to-slate-500";

    const qualityTextColor = quality.score >= 90
        ? "text-emerald-700"
        : quality.score >= 70
            ? "text-sky-700"
            : quality.score >= 40
                ? "text-amber-700"
                : "text-slate-600";

    return (
        <GlassCard className="p-5">
            {/* Header */}
            <div className="mb-5 flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-black text-slate-900">ワードローブ</h3>
                    <p className="text-[11px] text-slate-400">{state.wardrobe.length} アイテム登録済み</p>
                </div>
                <button
                    onClick={() => {
                        if (showAddForm) {
                            setShowAddForm(false);
                            resetForm(draft.categoryMain);
                            return;
                        }
                        setShowAddForm(true);
                        setEditingItemId(null);
                        setSaveError(null);
                        setExpandedSection("A");
                    }}
                    className={`rounded-xl px-5 py-2.5 text-xs font-bold transition-all duration-200 ${showAddForm
                            ? "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                            : "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-200/50 hover:shadow-xl hover:-translate-y-0.5"
                        }`}
                >
                    {showAddForm ? (editingItemId ? "編集を閉じる" : "閉じる") : "+ アイテム追加"}
                </button>
            </div>

            {/* ======== EDIT FORM ======== */}
            {showAddForm && (
                <div className="mb-6 rounded-2xl border border-indigo-200/60 bg-gradient-to-br from-indigo-50/80 via-white/90 to-violet-50/60 p-5 shadow-sm">
                    {/* Form header with quality */}
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${qualityColor} shadow-sm`}>
                                <span className="text-sm font-black text-white">{quality.score}</span>
                            </div>
                            <div>
                                <div className="text-sm font-black text-slate-900">
                                    {editingItemId ? "アイテム編集" : "新しいアイテム"}
                                </div>
                                <div className={`text-[11px] font-bold ${qualityTextColor}`}>
                                    品質: {qualityLabel(quality.score)}
                                </div>
                            </div>
                        </div>
                        {/* Section quick-nav */}
                        <div className="flex gap-1.5">
                            {(["A", "B", "C"] as const).map((s) => {
                                const sc = SECTION_COLORS[s];
                                const labels = { A: "必須", B: "推奨", C: "任意" };
                                return (
                                    <button
                                        key={s}
                                        onClick={() => setExpandedSection(expandedSection === s ? null : s)}
                                        className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition-all ${expandedSection === s
                                                ? `${sc.bg} text-white shadow-sm`
                                                : `${sc.light} ${sc.border} border ${sc.text}`
                                            }`}
                                    >
                                        {s}. {labels[s]}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Quality progress bar */}
                    <div className="mb-4 h-1.5 rounded-full bg-white overflow-hidden shadow-inner">
                        <div
                            className={`h-full rounded-full bg-gradient-to-r ${qualityColor} transition-all duration-500`}
                            style={{ width: `${quality.score}%` }}
                        />
                    </div>

                    {/* Missing badges */}
                    {quality.badges.length > 0 && (
                        <div className="mb-4 flex flex-wrap gap-1.5">
                            {quality.badges.map((badge) => (
                                <span key={badge} className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[10px] font-bold text-amber-700">
                                    {badge}
                                </span>
                            ))}
                        </div>
                    )}

                    {/* ═══ Section A: Essential ═══ */}
                    <section
                        className={`rounded-xl border transition-all duration-200 ${expandedSection === "A" ? "border-indigo-200 bg-white/80 shadow-sm" : "border-transparent bg-white/40"
                            }`}
                    >
                        <button
                            type="button"
                            onClick={() => setExpandedSection(expandedSection === "A" ? null : "A")}
                            className="w-full p-4 text-left"
                        >
                            <SectionHeader section="A" label="必須（MVP）" description="画像・カテゴリ・色 — まずここだけ埋めれば保存OK" />
                        </button>

                        {expandedSection === "A" && (
                            <SubcategorySampleBackground subcategory={draft.subcategory} className="px-4 pb-4">
                                <div className="space-y-4">
                                    {/* Image + Category row */}
                                    <div className="flex gap-4">
                                        {/* Image upload */}
                                        <div className="shrink-0">
                                            <FieldLabel>画像</FieldLabel>
                                            {addImagePreview ? (
                                                <div className="relative">
                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                    <img
                                                        src={addImagePreview}
                                                        alt="プレビュー"
                                                        className="h-32 w-32 rounded-xl border-2 border-indigo-300 bg-white p-1 object-contain object-center shadow-sm"
                                                    />
                                                    <button
                                                        onClick={clearImagePreview}
                                                        className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white shadow hover:bg-red-600"
                                                    >
                                                        ×
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => fileInputRef.current?.click()}
                                                    className="flex h-32 w-32 flex-col items-center justify-center rounded-xl border-2 border-dashed border-indigo-300 bg-indigo-50/60 text-indigo-500 transition hover:border-indigo-500 hover:bg-indigo-50"
                                                >
                                                    {uploading ? (
                                                        <span className="text-xs font-bold">処理中...</span>
                                                    ) : (
                                                        <>
                                                            <span className="text-2xl">📷</span>
                                                            <span className="mt-1 text-[10px] font-bold">画像を追加</span>
                                                        </>
                                                    )}
                                                </button>
                                            )}
                                            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageSelect} className="hidden" />
                                        </div>

                                        {/* Category + Subcategory */}
                                        <div className="flex-1 min-w-0 space-y-3">
                                            <div>
                                                <FieldLabel>メインカテゴリ</FieldLabel>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {CATEGORY_MAIN_OPTIONS.map((opt) => (
                                                        <ChipButton
                                                            key={opt.value}
                                                            selected={draft.categoryMain === opt.value}
                                                            onClick={() => {
                                                                setDraft((prev) => {
                                                                    const sub = getSubcategoryOptionsByMain(opt.value)[0]?.value ?? "subcategory.other";
                                                                    return {
                                                                        ...prev,
                                                                        categoryMain: opt.value,
                                                                        subcategory: getSubcategoryOptionsByMain(opt.value).some((x) => x.value === prev.subcategory) ? prev.subcategory : sub,
                                                                    };
                                                                });
                                                                if (addImagePreview) void runInference(addImagePreview, opt.value);
                                                            }}
                                                        >
                                                            {opt.label}
                                                        </ChipButton>
                                                    ))}
                                                </div>
                                            </div>

                                            <div>
                                                <FieldLabel>サブカテゴリ</FieldLabel>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {subcategoryOptions.map((opt) => (
                                                        <ChipButton
                                                            key={opt.value}
                                                            selected={draft.subcategory === opt.value}
                                                            color="indigo"
                                                            onClick={() => setDraft((prev) => ({ ...prev, subcategory: opt.value }))}
                                                        >
                                                            {opt.label}
                                                        </ChipButton>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Color section */}
                                    <div>
                                        <FieldLabel>カラー</FieldLabel>
                                        <div className="flex flex-wrap gap-1.5 mb-2">
                                            {COLOR_OPTIONS.map((col) => (
                                                <button
                                                    key={col.value}
                                                    type="button"
                                                    onClick={() => setDraft((prev) => ({ ...prev, color: col.value, colorName: col.label, colorHex: col.hex }))}
                                                    className={`h-8 w-8 rounded-full border-2 transition-all duration-150 ${draft.color === col.value
                                                            ? "scale-110 border-slate-900 ring-2 ring-slate-300"
                                                            : "border-transparent hover:scale-105 hover:border-slate-300"
                                                        }`}
                                                    style={{ backgroundColor: col.hex }}
                                                    title={col.label}
                                                />
                                            ))}
                                        </div>
                                        <div className="grid gap-2 grid-cols-2">
                                            <input
                                                value={draft.colorName}
                                                onChange={(e) => setDraft((prev) => ({ ...prev, colorName: e.target.value.slice(0, 30) }))}
                                                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-indigo-500 transition"
                                                placeholder="例: ブラック"
                                            />
                                            <input
                                                value={draft.colorHex}
                                                onChange={(e) => {
                                                    const value = e.target.value.slice(0, 7);
                                                    setDraft((prev) => ({ ...prev, colorHex: value }));
                                                    const matched = pickColorByHex(value);
                                                    if (matched) {
                                                        setDraft((prev) => ({
                                                            ...prev,
                                                            color: matched.value,
                                                            colorName: prev.colorName.trim() ? prev.colorName : matched.label,
                                                            colorHex: matched.hex,
                                                        }));
                                                    }
                                                }}
                                                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-indigo-500 transition"
                                                placeholder="#1A1A1A"
                                            />
                                        </div>
                                    </div>

                                    {/* Season / Thickness / Formality in a row */}
                                    <div className="grid gap-3 sm:grid-cols-3">
                                        <div>
                                            <FieldLabel>シーズン</FieldLabel>
                                            <div className="flex flex-wrap gap-1.5">
                                                {SEASON_OPTIONS.map((opt) => (
                                                    <ChipButton
                                                        key={opt.value}
                                                        selected={draft.season === opt.value}
                                                        onClick={() => setDraft((prev) => ({ ...prev, season: opt.value }))}
                                                    >
                                                        {opt.label}
                                                    </ChipButton>
                                                ))}
                                            </div>
                                        </div>
                                        <div>
                                            <FieldLabel>厚み</FieldLabel>
                                            <div className="flex flex-wrap gap-1.5">
                                                {THICKNESS_OPTIONS.map((opt) => (
                                                    <ChipButton
                                                        key={opt.value}
                                                        selected={draft.thickness === opt.value}
                                                        onClick={() => setDraft((prev) => ({ ...prev, thickness: opt.value }))}
                                                    >
                                                        {opt.label}
                                                    </ChipButton>
                                                ))}
                                            </div>
                                        </div>
                                        <div>
                                            <FieldLabel>TPO</FieldLabel>
                                            <div className="flex flex-wrap gap-1.5">
                                                {FORMALITY_OPTIONS.map((opt) => (
                                                    <ChipButton
                                                        key={opt.value}
                                                        selected={draft.formality === opt.value}
                                                        onClick={() => setDraft((prev) => ({ ...prev, formality: opt.value }))}
                                                    >
                                                        {opt.label}
                                                    </ChipButton>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </SubcategorySampleBackground>
                        )}
                    </section>

                    {/* ═══ Section B: Recommended ═══ */}
                    <section
                        className={`relative mt-2 rounded-xl border transition-all duration-200 overflow-visible ${expandedSection === "B" ? "border-cyan-200 bg-white/80 shadow-sm" : "border-transparent bg-white/40"
                            }`}
                    >
                        {/* Floating Selected Cards (above section) */}
                        {expandedSection === "B" && (
                            <div className="absolute -top-20 left-0 right-0 z-30 px-4">
                                {(draft.materialFamily.length > 0 || draft.surfaceFinish.length > 0 || draft.drape || draft.silhouette || draft.pattern) && (
                                    <div className="flex gap-0 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-300">
                                        {/* Material cards */}
                                        {draft.materialFamily.map((mat, idx) => {
                                            const opt = MATERIAL_FAMILY_OPTIONS.find((o) => o.value === mat);
                                            return (
                                                <div key={mat} className={idx > 0 ? "-ml-8" : ""} style={{ zIndex: 20 - idx }}>
                                                    <AttributeCard
                                                        label={opt?.label || mat}
                                                        category="素材"
                                                        color="cyan"
                                                        optionValue={mat}
                                                        onRemove={() => setDraft((prev) => ({ ...prev, materialFamily: prev.materialFamily.filter((m) => m !== mat) }))}
                                                    />
                                                </div>
                                            );
                                        })}
                                        {/* Surface cards */}
                                        {draft.surfaceFinish.map((surf, idx) => {
                                            const opt = SURFACE_FINISH_OPTIONS.find((o) => o.value === surf);
                                            const absIdx = draft.materialFamily.length + idx;
                                            return (
                                                <div key={surf} className="-ml-8" style={{ zIndex: 20 - absIdx }}>
                                                    <AttributeCard
                                                        label={opt?.label || surf}
                                                        category="仕上げ"
                                                        color="violet"
                                                        optionValue={surf}
                                                        onRemove={() => setDraft((prev) => ({ ...prev, surfaceFinish: prev.surfaceFinish.filter((s) => s !== surf) }))}
                                                    />
                                                </div>
                                            );
                                        })}
                                        {/* Drape */}
                                        {draft.drape && (() => {
                                            const opt = DRAPE_OPTIONS.find((o) => o.value === draft.drape);
                                            const absIdx = draft.materialFamily.length + draft.surfaceFinish.length;
                                            return (
                                                <div key="drape" className="-ml-8" style={{ zIndex: 20 - absIdx }}>
                                                    <AttributeCard
                                                        label={opt?.label || draft.drape}
                                                        category="落ち感"
                                                        color="slate"
                                                        optionValue={draft.drape}
                                                        onRemove={() => setDraft((prev) => ({ ...prev, drape: undefined }))}
                                                    />
                                                </div>
                                            );
                                        })()}
                                        {/* Silhouette */}
                                        {draft.silhouette && (() => {
                                            const opt = SILHOUETTE_OPTIONS.find((o) => o.value === draft.silhouette);
                                            const absIdx = draft.materialFamily.length + draft.surfaceFinish.length + (draft.drape ? 1 : 0);
                                            return (
                                                <div key="silhouette" className="-ml-8" style={{ zIndex: 20 - absIdx }}>
                                                    <AttributeCard
                                                        label={opt?.label || draft.silhouette}
                                                        category="シルエット"
                                                        color="slate"
                                                        optionValue={draft.silhouette}
                                                        onRemove={() => setDraft((prev) => ({ ...prev, silhouette: undefined }))}
                                                    />
                                                </div>
                                            );
                                        })()}
                                        {/* Pattern */}
                                        {draft.pattern && (() => {
                                            const opt = PATTERN_OPTIONS.find((o) => o.value === draft.pattern);
                                            const absIdx = draft.materialFamily.length + draft.surfaceFinish.length + (draft.drape ? 1 : 0) + (draft.silhouette ? 1 : 0);
                                            return (
                                                <div key="pattern" className="-ml-8" style={{ zIndex: 20 - absIdx }}>
                                                    <AttributeCard
                                                        label={opt?.label || draft.pattern}
                                                        category="柄"
                                                        color="slate"
                                                        optionValue={draft.pattern}
                                                        onRemove={() => setDraft((prev) => ({ ...prev, pattern: undefined }))}
                                                    />
                                                </div>
                                            );
                                        })()}
                                    </div>
                                )}
                            </div>
                        )}

                        <button
                            type="button"
                            onClick={() => setExpandedSection(expandedSection === "B" ? null : "B")}
                            className={`w-full p-4 text-left transition-all ${expandedSection === "B" && (draft.materialFamily.length > 0 || draft.surfaceFinish.length > 0 || draft.drape || draft.silhouette || draft.pattern) ? "pt-28" : ""}`}
                        >
                            <SectionHeader section="B" label="推奨（AI精度ブースト）" description="素材・質感・シルエット — 入力するほどAI精度アップ" />
                        </button>

                        {expandedSection === "B" && (
                            <div className="px-4 pb-4 space-y-4">
                                {/* Category-specific B section */}
                                {isFootwearCategory(draft.categoryMain) ? (
                                    <>
                                        {/* Footwear: Upper Material */}
                                        <div>
                                            <FieldLabel>アッパー素材（複数OK）</FieldLabel>
                                            <div className="flex flex-wrap gap-1.5">
                                                {FOOTWEAR_UPPER_MATERIAL_OPTIONS.map((opt) => (
                                                    <ChipButton
                                                        key={opt.value}
                                                        selected={draft.materialFamily.includes(opt.value)}
                                                        color="cyan"
                                                        onClick={() => setDraft((prev) => ({ ...prev, materialFamily: toggleArrayItem(prev.materialFamily, opt.value) }))}
                                                    >
                                                        {opt.label}
                                                    </ChipButton>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Footwear: Sole Type */}
                                        <div>
                                            <FieldLabel>ソールタイプ</FieldLabel>
                                            <div className="flex flex-wrap gap-1.5">
                                                {FOOTWEAR_SOLE_TYPE_OPTIONS.map((opt) => (
                                                    <ChipButton
                                                        key={opt.value}
                                                        selected={draft.surfaceFinish.includes(opt.value)}
                                                        color="violet"
                                                        onClick={() => setDraft((prev) => ({ ...prev, surfaceFinish: toggleArrayItem(prev.surfaceFinish, opt.value) }))}
                                                    >
                                                        {opt.label}
                                                    </ChipButton>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Footwear: Surface Finish */}
                                        <div>
                                            <FieldLabel>表面仕上げ（複数OK）</FieldLabel>
                                            <div className="flex flex-wrap gap-1.5">
                                                {FOOTWEAR_SURFACE_FINISH_OPTIONS.map((opt) => (
                                                    <ChipButton
                                                        key={opt.value}
                                                        selected={draft.surfaceFinish.includes(opt.value)}
                                                        color="violet"
                                                        onClick={() => setDraft((prev) => ({ ...prev, surfaceFinish: toggleArrayItem(prev.surfaceFinish, opt.value) }))}
                                                    >
                                                        {opt.label}
                                                    </ChipButton>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="grid gap-3 sm:grid-cols-3">
                                            {/* Footwear: Construction */}
                                            <div>
                                                <FieldLabel>構造</FieldLabel>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {FOOTWEAR_CONSTRUCTION_OPTIONS.map((opt) => (
                                                        <ChipButton
                                                            key={opt.value}
                                                            selected={draft.drape === opt.value}
                                                            onClick={() => setDraft((prev) => ({ ...prev, drape: opt.value as DrapeCode }))}
                                                        >
                                                            {opt.label}
                                                        </ChipButton>
                                                    ))}
                                                </div>
                                            </div>
                                            {/* Footwear: Toe Shape */}
                                            <div>
                                                <FieldLabel>トゥ形状</FieldLabel>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {FOOTWEAR_TOE_SHAPE_OPTIONS.map((opt) => (
                                                        <ChipButton
                                                            key={opt.value}
                                                            selected={draft.silhouette === opt.value}
                                                            onClick={() => setDraft((prev) => ({ ...prev, silhouette: opt.value as SilhouetteCode }))}
                                                        >
                                                            {opt.label}
                                                        </ChipButton>
                                                    ))}
                                                </div>
                                            </div>
                                            {/* Footwear: Silhouette */}
                                            <div>
                                                <FieldLabel>シルエット</FieldLabel>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {FOOTWEAR_SILHOUETTE_OPTIONS.map((opt) => (
                                                        <ChipButton
                                                            key={opt.value}
                                                            selected={draft.pattern === opt.value}
                                                            onClick={() => setDraft((prev) => ({ ...prev, pattern: opt.value as PatternCode }))}
                                                        >
                                                            {opt.label}
                                                        </ChipButton>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Footwear: Optional Fit & Heel */}
                                        <div className="grid gap-3 sm:grid-cols-2">
                                            <div>
                                                <FieldLabel>フィット感（任意）</FieldLabel>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {FOOTWEAR_FIT_OPTIONS.map((opt) => (
                                                        <ChipButton
                                                            key={opt.value}
                                                            selected={draft.knitGauge === opt.value}
                                                            size="xs"
                                                            onClick={() => setDraft((prev) => ({ ...prev, knitGauge: opt.value as KnitGaugeCode }))}
                                                        >
                                                            {opt.label}
                                                        </ChipButton>
                                                    ))}
                                                </div>
                                            </div>
                                            <div>
                                                <FieldLabel>ヒール高（任意）</FieldLabel>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {FOOTWEAR_HEEL_HEIGHT_OPTIONS.map((opt) => (
                                                        <ChipButton
                                                            key={opt.value}
                                                            selected={draft.knitType === opt.value}
                                                            size="xs"
                                                            onClick={() => setDraft((prev) => ({ ...prev, knitType: opt.value as KnitTypeCode }))}
                                                        >
                                                            {opt.label}
                                                        </ChipButton>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        {/* Apparel: Original Material/Finish/etc */}
                                        <div>
                                            <FieldLabel>素材ファミリー（複数OK）</FieldLabel>
                                            <div className="flex flex-wrap gap-1.5">
                                                {MATERIAL_FAMILY_OPTIONS.map((opt) => (
                                                    <ChipButton
                                                        key={opt.value}
                                                        selected={draft.materialFamily.includes(opt.value)}
                                                        color="cyan"
                                                        onClick={() => setDraft((prev) => ({ ...prev, materialFamily: toggleArrayItem(prev.materialFamily, opt.value) }))}
                                                    >
                                                        {opt.label}
                                                    </ChipButton>
                                                ))}
                                            </div>
                                        </div>

                                        <div>
                                            <FieldLabel>表面仕上げ（複数OK）</FieldLabel>
                                            <div className="flex flex-wrap gap-1.5">
                                                {SURFACE_FINISH_OPTIONS.map((opt) => (
                                                    <ChipButton
                                                        key={opt.value}
                                                        selected={draft.surfaceFinish.includes(opt.value)}
                                                        color="violet"
                                                        onClick={() => setDraft((prev) => ({ ...prev, surfaceFinish: toggleArrayItem(prev.surfaceFinish, opt.value) }))}
                                                    >
                                                        {opt.label}
                                                    </ChipButton>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="grid gap-3 sm:grid-cols-3">
                                            <div>
                                                <FieldLabel>落ち感</FieldLabel>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {DRAPE_OPTIONS.map((opt) => (
                                                        <ChipButton
                                                            key={opt.value}
                                                            selected={draft.drape === opt.value}
                                                            onClick={() => setDraft((prev) => ({ ...prev, drape: opt.value }))}
                                                        >
                                                            {opt.label}
                                                        </ChipButton>
                                                    ))}
                                                </div>
                                            </div>
                                            <div>
                                                <FieldLabel>シルエット</FieldLabel>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {SILHOUETTE_OPTIONS.map((opt) => (
                                                        <ChipButton
                                                            key={opt.value}
                                                            selected={draft.silhouette === opt.value}
                                                            onClick={() => setDraft((prev) => ({ ...prev, silhouette: opt.value }))}
                                                        >
                                                            {opt.label}
                                                        </ChipButton>
                                                    ))}
                                                </div>
                                            </div>
                                            <div>
                                                <FieldLabel>柄</FieldLabel>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {PATTERN_OPTIONS.map((opt) => (
                                                        <ChipButton
                                                            key={opt.value}
                                                            selected={draft.pattern === opt.value}
                                                            onClick={() => setDraft((prev) => ({ ...prev, pattern: opt.value }))}
                                                        >
                                                            {opt.label}
                                                        </ChipButton>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Knit profile */}
                                        {isKnit && (
                                            <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3">
                                                <div className="mb-2 text-[11px] font-bold text-indigo-700">ニットプロファイル</div>
                                                <div className="grid gap-3 sm:grid-cols-2">
                                                    <div>
                                                        <FieldLabel>ゲージ</FieldLabel>
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {KNIT_GAUGE_OPTIONS.map((opt) => (
                                                                <ChipButton
                                                                    key={opt.value}
                                                                    selected={draft.knitGauge === opt.value}
                                                                    color="indigo"
                                                                    onClick={() => setDraft((prev) => ({ ...prev, knitGauge: opt.value }))}
                                                                >
                                                                    {opt.label}
                                                                </ChipButton>
                                                            ))}
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <FieldLabel>編みタイプ</FieldLabel>
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {KNIT_TYPE_OPTIONS.map((opt) => (
                                                                <ChipButton
                                                                    key={opt.value}
                                                                    selected={draft.knitType === opt.value}
                                                                    color="indigo"
                                                                    onClick={() => setDraft((prev) => ({ ...prev, knitType: opt.value }))}
                                                                >
                                                                    {opt.label}
                                                                </ChipButton>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* Micro questions */}
                                        <div className="rounded-xl border border-slate-200 bg-white/70 p-3">
                                            <div className="text-[11px] font-bold text-slate-700 mb-2">クイック質問</div>
                                            <div className="flex flex-wrap items-center gap-2 text-[11px]">
                                                <span className="font-bold text-slate-600">起毛感あり？</span>
                                                <ChipButton
                                                    selected={draft.surfaceFinish.includes("surface.brushed")}
                                                    color="emerald"
                                                    size="xs"
                                                    onClick={() => setDraft((prev) => ({ ...prev, surfaceFinish: Array.from(new Set([...prev.surfaceFinish, "surface.brushed"])) }))}
                                                >
                                                    Yes
                                                </ChipButton>
                                                <ChipButton
                                                    selected={!draft.surfaceFinish.includes("surface.brushed")}
                                                    size="xs"
                                                    onClick={() => setDraft((prev) => ({ ...prev, surfaceFinish: prev.surfaceFinish.filter((x) => x !== "surface.brushed" && x !== "surface.fuzzy") }))}
                                                >
                                                    No
                                                </ChipButton>
                                                <span className="ml-3 font-bold text-slate-600">厚手？</span>
                                                {THICKNESS_OPTIONS.map((opt) => (
                                                    <ChipButton
                                                        key={`micro-${opt.value}`}
                                                        selected={draft.thickness === opt.value}
                                                        size="xs"
                                                        onClick={() => setDraft((prev) => ({ ...prev, thickness: opt.value }))}
                                                    >
                                                        {opt.label}
                                                    </ChipButton>
                                                ))}
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </section>

                    {/* ═══ Section C: Optional ═══ */}
                    <section
                        className={`mt-2 rounded-xl border transition-all duration-200 ${expandedSection === "C" ? "border-slate-200 bg-white/80 shadow-sm" : "border-transparent bg-white/40"
                            }`}
                    >
                        <button
                            type="button"
                            onClick={() => setExpandedSection(expandedSection === "C" ? null : "C")}
                            className="w-full p-4 text-left"
                        >
                            <SectionHeader section="C" label="任意（こだわり）" description="伸縮性・保温性・ケア — こだわりがあれば" />
                        </button>

                        {expandedSection === "C" && (
                            <div className="px-4 pb-4 space-y-4">
                                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                    <div>
                                        <FieldLabel>伸縮性</FieldLabel>
                                        <div className="flex flex-wrap gap-1.5">
                                            {STRETCH_OPTIONS.map((opt) => (
                                                <ChipButton
                                                    key={opt.value}
                                                    selected={draft.stretch === opt.value}
                                                    size="xs"
                                                    onClick={() => setDraft((prev) => ({ ...prev, stretch: opt.value }))}
                                                >
                                                    {opt.label}
                                                </ChipButton>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <FieldLabel>保温レベル</FieldLabel>
                                        <div className="flex gap-1.5">
                                            {[1, 2, 3].map((lv) => (
                                                <ChipButton
                                                    key={`warmth-${lv}`}
                                                    selected={draft.warmth === lv}
                                                    size="xs"
                                                    onClick={() => setDraft((prev) => ({ ...prev, warmth: lv as 1 | 2 | 3 }))}
                                                >
                                                    {"❄️".repeat(lv)}
                                                </ChipButton>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <FieldLabel>防水性</FieldLabel>
                                        <div className="flex flex-wrap gap-1.5">
                                            {WATER_OPTIONS.map((opt) => (
                                                <ChipButton
                                                    key={opt.value}
                                                    selected={draft.water === opt.value}
                                                    size="xs"
                                                    onClick={() => setDraft((prev) => ({ ...prev, water: opt.value }))}
                                                >
                                                    {opt.label}
                                                </ChipButton>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <FieldLabel>透け感</FieldLabel>
                                        <div className="flex flex-wrap gap-1.5">
                                            {TRANSPARENCY_OPTIONS.map((opt) => (
                                                <ChipButton
                                                    key={opt.value}
                                                    selected={draft.transparency === opt.value}
                                                    size="xs"
                                                    onClick={() => setDraft((prev) => ({ ...prev, transparency: opt.value }))}
                                                >
                                                    {opt.label}
                                                </ChipButton>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <FieldLabel>ケア方法</FieldLabel>
                                        <div className="flex flex-wrap gap-1.5">
                                            {CARE_OPTIONS.map((opt) => (
                                                <ChipButton
                                                    key={opt.value}
                                                    selected={draft.care === opt.value}
                                                    size="xs"
                                                    onClick={() => setDraft((prev) => ({ ...prev, care: opt.value }))}
                                                >
                                                    {opt.label}
                                                </ChipButton>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    <FieldLabel>メモ</FieldLabel>
                                    <textarea
                                        value={draft.memo}
                                        onChange={(e) => {
                                            const memo = e.currentTarget.value.slice(0, 400);
                                            setDraft((prev) => ({ ...prev, memo }));
                                        }}
                                        className="min-h-[72px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold outline-none focus:ring-2 focus:ring-indigo-500 transition"
                                        placeholder="TPOや苦手要素、合わせたい気分など"
                                    />
                                </div>
                            </div>
                        )}
                    </section>

                    {/* AI inference results */}
                    {inference && (
                        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-600 text-white text-[10px] font-black">AI</div>
                                <span className="text-xs font-black text-emerald-700">自動推定候補</span>
                                <span className="text-[10px] font-bold text-emerald-500 ml-auto">
                                    confidence: {Math.round(inference.confidence * 100)}%
                                </span>
                            </div>
                            <div className="space-y-2">
                                {inference.subcategories.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5">
                                        <span className="text-[10px] font-bold text-emerald-700 self-center">subcategory:</span>
                                        {inference.subcategories.slice(0, 3).map((x) => (
                                            <button
                                                key={`sub-${x.value}`}
                                                type="button"
                                                onClick={() => applyInferenceChip("subcategory", x.value)}
                                                className="rounded-full border border-emerald-200 bg-white px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 hover:bg-emerald-50 transition"
                                            >
                                                {x.label || x.value}
                                            </button>
                                        ))}
                                    </div>
                                )}
                                {inference.materials.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5">
                                        <span className="text-[10px] font-bold text-emerald-700 self-center">material:</span>
                                        {inference.materials.slice(0, 3).map((x) => (
                                            <button
                                                key={`mat-${x.value}`}
                                                type="button"
                                                onClick={() => applyInferenceChip("material", x.value)}
                                                className="rounded-full border border-emerald-200 bg-white px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 hover:bg-emerald-50 transition"
                                            >
                                                {x.label || x.value}
                                            </button>
                                        ))}
                                    </div>
                                )}
                                {inference.surfaces.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5">
                                        <span className="text-[10px] font-bold text-emerald-700 self-center">surface:</span>
                                        {inference.surfaces.slice(0, 3).map((x) => (
                                            <button
                                                key={`sur-${x.value}`}
                                                type="button"
                                                onClick={() => applyInferenceChip("surface", x.value)}
                                                className="rounded-full border border-emerald-200 bg-white px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 hover:bg-emerald-50 transition"
                                            >
                                                {x.label || x.value}
                                            </button>
                                        ))}
                                    </div>
                                )}
                                <div className="flex flex-wrap gap-1.5">
                                    {inference.thickness && (
                                        <button type="button" onClick={() => applyInferenceChip("thickness", inference.thickness as string)} className="rounded-full border border-emerald-200 bg-white px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 hover:bg-emerald-50 transition">
                                            thickness: {optionLabel(THICKNESS_OPTIONS, inference.thickness)}
                                        </button>
                                    )}
                                    {inference.season && (
                                        <button type="button" onClick={() => applyInferenceChip("season", inference.season as string)} className="rounded-full border border-emerald-200 bg-white px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 hover:bg-emerald-50 transition">
                                            season: {optionLabel(SEASON_OPTIONS, inference.season)}
                                        </button>
                                    )}
                                    {inference.formality && (
                                        <button type="button" onClick={() => applyInferenceChip("formality", inference.formality as string)} className="rounded-full border border-emerald-200 bg-white px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 hover:bg-emerald-50 transition">
                                            formality: {optionLabel(FORMALITY_OPTIONS, inference.formality)}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Error */}
                    {saveError && (
                        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs font-bold text-red-600">
                            {saveError}
                        </div>
                    )}

                    {/* Save / Cancel buttons */}
                    <div className="mt-4 flex gap-3">
                        <button
                            onClick={saveItem}
                            disabled={!canSave}
                            className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-200/50 transition-all hover:shadow-xl hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none disabled:translate-y-0"
                        >
                            {editingItemId ? "更新する" : "追加する"}
                        </button>
                        <button
                            onClick={() => {
                                setShowAddForm(false);
                                resetForm(draft.categoryMain);
                            }}
                            className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50 transition"
                        >
                            キャンセル
                        </button>
                    </div>
                </div>
            )}

            {/* ======== ITEM LIST (Showcase Rows) ======== */}
            <div className="relative space-y-3">
                {SHOWCASE_ROWS.map((row) => {
                    const items = row.category === "other"
                        ? [
                            ...(itemsByCategory.hat ?? []),
                            ...(itemsByCategory.accessories ?? []),
                            ...(itemsByCategory.other ?? []),
                        ]
                        : (itemsByCategory[row.category] ?? []);
                    if (row.optional && items.length === 0) return null;
                    const slideItems = items.length > 1 ? [...items, ...items] : items;
                    const tone = ROW_HIGHLIGHT[row.category];

                    return (
                        <section
                            key={row.category}
                            aria-label={row.label}
                            className="rounded-2xl overflow-hidden"
                            style={{
                                borderLeft: `3px solid ${tone.accent}`,
                                background: `linear-gradient(135deg, rgba(255,255,255,0.95), ${tone.fill})`,
                                boxShadow: `0 2px 12px -4px ${tone.glow}`,
                            }}
                        >
                            {/* Row header */}
                            <div className="flex items-center gap-2 px-4 pt-3 pb-1">
                                <span className="text-base">{row.icon}</span>
                                <span className="text-xs font-black text-slate-800">{row.label}</span>
                                <span className="text-[10px] font-bold text-slate-400 ml-1">{items.length}</span>
                                {items.length === 0 && (
                                    <button
                                        onClick={() => {
                                            setShowAddForm(true);
                                            setEditingItemId(null);
                                            setSaveError(null);
                                            setExpandedSection("A");
                                        }}
                                        className="ml-auto text-[10px] font-bold text-indigo-500 hover:text-indigo-700 transition"
                                    >
                                        + 追加
                                    </button>
                                )}
                            </div>

                            {items.length > 0 ? (
                                <div
                                    ref={(el) => {
                                        rowRefs.current[row.category] = el;
                                    }}
                                    className="flex gap-3 overflow-x-auto px-4 pb-3 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                                    style={{ scrollBehavior: "auto" }}
                                >
                                    {slideItems.map((item, i) => (
                                        <WardrobeCard
                                            key={`${row.category}-${item.id}-${i}`}
                                            item={item}
                                            onEdit={() => startEdit(item)}
                                            onRemove={() => removeItem(item.id)}
                                            onAddToSetup={onAddToSetup ? () => onAddToSetup(item.id) : undefined}
                                        />
                                    ))}
                                </div>
                            ) : (
                                <div className="mx-4 mb-3 rounded-xl border border-dashed border-slate-200 bg-white/60 px-4 py-4 text-center">
                                    <div className="text-2xl mb-1 opacity-40">{row.icon}</div>
                                    <div className="text-[11px] text-slate-400">まだ{row.label}がありません</div>
                                </div>
                            )}
                        </section>
                    );
                })}
            </div>

            {/* Empty state */}
            {state.wardrobe.length === 0 && (
                <div className="py-14 text-center">
                    <div className="mb-4 text-5xl opacity-60">👗</div>
                    <div className="text-base font-bold text-slate-600">ワードローブが空です</div>
                    <div className="mt-2 text-xs text-slate-400">
                        「+ アイテム追加」からあなたの服を登録しましょう
                    </div>
                    <button
                        onClick={() => {
                            setShowAddForm(true);
                            setEditingItemId(null);
                            setSaveError(null);
                            setExpandedSection("A");
                        }}
                        className="mt-5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-200/50 hover:shadow-xl transition"
                    >
                        + 最初のアイテムを追加
                    </button>
                </div>
            )}
        </GlassCard>
    );
}
