import {
    getElementLabel,
    getSetupMoodLabel,
    getStyleLaneLabel,
    normalizeStyleLaneId,
} from "./catalog";
import { deriveMyStyleSignals } from "./state";
import type {
    SavedSetup,
    SavedState,
    SelectedPreferenceTag,
    SetupMoodCode,
    StyleDepthBucket,
    StyleLaneCode,
    UnexpectedStyleLane,
    WardrobeItem,
} from "./types";
import type { CrossFeatureData } from "../_components/CrossFeaturePanel";

/* ─────────────────────── types ─────────────────────── */

export type TabId = "today" | "wardrobe" | "setups" | "styles" | "identity" | "insights";
export type IdentityMode = "iam" | "iseek" | "ibecome";
export type SyncStatus = "idle" | "syncing" | "synced" | "error" | "unauthorized";

export type BridgePayload = {
    ok?: boolean;
    remoteState?: SavedState | null;
    syncedAt?: string | null;
    crossFeature?: CrossFeatureData | null;
    pulse?: {
        pcSeason: string | null;
        pcBase: string | null;
        bodyType: string | null;
        bodySubtype: string | null;
    } | null;
};

export type ItemInsight = {
    item: WardrobeItem;
    setupTitles: string[];
    reasons: string[];
    timelinePeriods: string[];
    impressionLabels: string[];
    coreContribution: number;
    rareContribution: number;
    secretContribution: number;
};

export type CandidateChoice = {
    code: string;
    group: SelectedPreferenceTag["group"];
    label?: string;
    description?: string;
};

/* ─────────────────────── constants ─────────────────────── */

export const VALID_TABS: TabId[] = ["today", "wardrobe", "setups", "styles", "identity", "insights"];
export const CORE_LIMITS: Record<StyleDepthBucket, number> = { core: 3, rare: 2, secret: 2 };
export const UNEXPECTED_LANE_LIMIT = 3;

export const CATEGORY_LABELS: Record<WardrobeItem["category"], string> = {
    outerwear: "アウター", tops: "トップス", bottoms: "ボトムス",
    shoes: "靴", accessories: "アクセサリー", hat: "帽子", other: "その他",
};

export const SHELF_TONES = {
    core: { shell: "border-slate-200/60 bg-white/80", chip: "border-slate-900 bg-slate-900 text-white", accent: "text-slate-500", badge: "ink" as const },
    rare: { shell: "border-sky-200/60 bg-sky-50/50", chip: "border-sky-200 bg-sky-100 text-sky-800", accent: "text-sky-600", badge: "sky" as const },
    secret: { shell: "border-amber-200/60 bg-amber-50/50", chip: "border-amber-200 bg-amber-100 text-amber-800", accent: "text-amber-600", badge: "amber" as const },
    unexpected: { shell: "border-rose-200/60 bg-rose-50/50", chip: "border-rose-200 bg-rose-100 text-rose-800", accent: "text-rose-600", badge: "amber" as const },
} as const;

export const IAM_LIKED_GROUPS = new Set(["silhouette", "color", "texture", "composition", "detail", "mood"]);
export const IAM_NATURAL_GROUPS = new Set(["mood", "worldview", "impression"]);
export const ISEEK_ELEMENT_GROUPS = new Set(["impression", "composition", "detail", "mood", "color"]);
export const ISEEK_AVOID_GROUPS = new Set(["tension", "composition", "detail", "impression"]);

export const TAB_CONFIG: Array<{
    id: TabId; icon: string; label: string; personality: string; sub: string;
    accentColor: string; bgClass: string; cardBorder: string;
}> = [
    { id: "today", icon: "☀️", label: "今日", personality: "Mirror", sub: "今日のあなたを映す", accentColor: "#e67e22", bgClass: "bg-gradient-to-b from-orange-50/40 via-amber-50/20 to-white/50", cardBorder: "border-orange-200/40" },
    { id: "wardrobe", icon: "🏛", label: "持ち物", personality: "Showcase", sub: "自分を形作っている物", accentColor: "#c96d4a", bgClass: "bg-gradient-to-b from-amber-50/50 via-orange-50/20 to-stone-50/30", cardBorder: "border-amber-200/40" },
    { id: "setups", icon: "🎛", label: "セットアップ", personality: "Studio", sub: "どう見せたいか", accentColor: "#6366f1", bgClass: "bg-gradient-to-b from-indigo-50/40 via-violet-50/20 to-slate-50/30", cardBorder: "border-indigo-200/40" },
    { id: "styles", icon: "📚", label: "スタイル", personality: "Shelf", sub: "惹かれる世界観", accentColor: "#0d9488", bgClass: "bg-gradient-to-b from-teal-50/40 via-emerald-50/20 to-stone-50/30", cardBorder: "border-teal-200/40" },
    { id: "identity", icon: "📓", label: "アイデンティティ", personality: "Notebook", sub: "自分らしさの深層", accentColor: "#a16207", bgClass: "bg-gradient-to-b from-amber-50/30 via-yellow-50/20 to-stone-50/40", cardBorder: "border-amber-200/30" },
    { id: "insights", icon: "📡", label: "変化の記録", personality: "Timeline", sub: "輪郭の変遷", accentColor: "#2563eb", bgClass: "bg-gradient-to-b from-blue-50/40 via-sky-50/20 to-slate-50/30", cardBorder: "border-blue-200/30" },
];

/* ─────────────────────── utils ─────────────────────── */

export function cx(...values: Array<string | false | null | undefined>) {
    return values.filter(Boolean).join(" ");
}

export function uniqueList(values: string[]) {
    return Array.from(new Set(values.filter(Boolean)));
}

export function formatDateLabel(value: string | null | undefined) {
    if (!value) return "未保存";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "未保存";
    return date.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
}

export function formatPercent(value: number) {
    return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

export function getSyncLabel(syncStatus: SyncStatus, syncedAt: string | null) {
    return syncStatus === "synced"
        ? `同期済 ${formatDateLabel(syncedAt)}`
        : syncStatus === "syncing"
            ? "同期中…"
            : syncStatus === "unauthorized"
                ? "要ログイン"
                : syncStatus === "error"
                    ? "同期エラー"
                    : "";
}

export function monthLabel(periodKey: string) {
    const [year, month] = periodKey.split("-");
    if (!year || !month) return periodKey;
    return `${year}.${month}`;
}

export function differenceList(current: string[], previous: string[]) {
    return current.filter((value) => value && !previous.includes(value));
}

export function joinLabels(values: string[], fallback = "まだ十分な変化はありません") {
    return values.length > 0 ? values.join(" / ") : fallback;
}

export function normalizeTabId(value: string | null): TabId | null {
    if (!value) return null;
    return VALID_TABS.includes(value as TabId) ? (value as TabId) : null;
}

export function scrollToId(id: string) {
    const node = document.getElementById(id);
    if (node) node.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function getDisplayLabel(code: string) {
    const laneId = normalizeStyleLaneId(code);
    if (laneId) return getStyleLaneLabel(laneId);
    return getElementLabel(code);
}

export function reorderByKey<T>(list: T[], sourceKey: string, targetKey: string, getKey: (item: T) => string) {
    const sourceIndex = list.findIndex((item) => getKey(item) === sourceKey);
    const targetIndex = list.findIndex((item) => getKey(item) === targetKey);
    if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) return list;
    const next = [...list];
    const [source] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, source);
    return next;
}

export function createTag(code: string, group: SelectedPreferenceTag["group"], priority: number): SelectedPreferenceTag {
    return { code, group, priority, createdAt: new Date().toISOString() };
}

export function createUnexpectedLane(laneCode: StyleLaneCode, priority: number): UnexpectedStyleLane {
    return { laneCode, priority, createdAt: new Date().toISOString() };
}

export function groupWardrobeByCategory(items: WardrobeItem[]) {
    const grouped: Record<WardrobeItem["category"], WardrobeItem[]> = {
        outerwear: [], tops: [], bottoms: [], shoes: [], accessories: [], hat: [], other: [],
    };
    items.forEach((item) => grouped[item.category].push(item));
    return grouped;
}

export function collectSetupTitlesForItem(setups: SavedSetup[], itemId: string) {
    return setups.filter((setup) => setup.itemIds.includes(itemId)).map((setup) => setup.title);
}

export function buildSetupLaneHints(setup: SavedSetup, items: WardrobeItem[]) {
    const used = setup.itemIds.map((id) => items.find((item) => item.id === id)).filter((item): item is WardrobeItem => Boolean(item));
    const labels = uniqueList(
        used.flatMap((item) => {
            const laneLabels: string[] = [];
            if (["black", "white", "navy", "charcoal"].includes(item.color)) laneLabels.push("クリーン", "ミニマル");
            if (item.formality === "smart" || item.formality === "dress") laneLabels.push("エレガント", "クラシック");
            if ((item.materialFamily ?? []).includes("material.denim")) laneLabels.push("アメカジ", "ワークウェア");
            if ((item.materialFamily ?? []).includes("material.tech_nylon")) laneLabels.push("テックウェア", "スポーティ");
            return laneLabels;
        })
    );
    return labels.slice(0, 3);
}

export function deriveSuggestedSetupTitle(moodTags: SetupMoodCode[], becomeLabel: string | null) {
    const moodLabel = moodTags[0] ? getSetupMoodLabel(moodTags[0]) : "";
    if (becomeLabel) return `${becomeLabel} を試す組み方`;
    if (moodLabel) return `${moodLabel} 日のセット`;
    return "いまの自分を整えるセット";
}

export function buildWardrobeReasonLine(
    signal: { coreContribution: number; rareContribution: number; secretContribution: number; impressionLabels: string[] },
    derived: ReturnType<typeof deriveMyStyleSignals>,
) {
    if (signal.coreContribution >= signal.rareContribution && signal.coreContribution >= signal.secretContribution) {
        return `${getStyleLaneLabel(derived.coreLanes[0] ?? "clean")} 軸を支える`;
    }
    if (signal.rareContribution >= signal.secretContribution) return "普段と少し違う揺れを前に出す";
    if (signal.impressionLabels[0]) return `${signal.impressionLabels[0]} へ寄せる隠し味`;
    return "静かな輪郭の微調整に効く";
}

export function getWardrobeRoleMeta(signal: { coreContribution: number; rareContribution: number; secretContribution: number; impressionLabels: string[] }) {
    if (signal.coreContribution >= signal.rareContribution && signal.coreContribution >= signal.secretContribution) {
        return { label: "軸を作る服", tone: "emerald" as const, description: "普段の印象を支える主力" };
    }
    if (signal.rareContribution >= signal.secretContribution) {
        return { label: "変化を足す服", tone: "sky" as const, description: "少し違う方向へ寄せる" };
    }
    return { label: "隠し味の服", tone: "amber" as const, description: signal.impressionLabels[0] ? `${signal.impressionLabels[0]} を足す` : "静かに輪郭を揺らす" };
}

export function deriveSetupDirection(analysis: { laneHints: string[]; impressionHints: string[] }, moodTags: SetupMoodCode[], focusedBecome: string | null) {
    if (focusedBecome) return `「${focusedBecome}」に寄せる組み方`;
    if (analysis.impressionHints[0] && analysis.impressionHints[1]) return `「${analysis.impressionHints[0]}」を残しつつ「${analysis.impressionHints[1]}」へ`;
    if (analysis.laneHints[0]) return `「${analysis.laneHints[0]}」の空気感`;
    if (moodTags[0]) return `${getSetupMoodLabel(moodTags[0])} を優先した組み方`;
    return "自然体と整いのバランスを探索中";
}
