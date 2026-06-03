import { computeColorPrefs } from "./colorPrefs";
import {
    ELEMENT_GROUPS,
    IMPRESSION_OPTIONS,
    getElementLabel,
    getSetupMoodLabel,
    getStyleLaneLabel,
    normalizeElementId,
    normalizeStyleLaneId,
} from "./catalog";
import type {
    BecomePair,
    ColorPrefs,
    IAmState,
    IBecomeState,
    ISeekState,
    MyStyleProfile,
    MyStyleSelfProfile,
    PreferenceTagGroup,
    SavedSetup,
    SavedState,
    SeekContextKey,
    SeekContextProfile,
    SelectedPreferenceTag,
    SelectedStyleLane,
    SetupMoodCode,
    SimilarityPreference,
    StyleDepthBucket,
    StyleLaneCode,
    StyleTimelineSnapshot,
    UnexpectedStyleLane,
    WardrobeItem,
    WearRecord,
} from "./types";
import { SEEK_CONTEXT_KEYS } from "./types";

export const STORAGE_KEY = "culcept_my_style_v3";
export const BACKUP_STORAGE_KEY = "culcept_my_style_v3_backup";
export const LEGACY_STORAGE_KEY = "culcept_my_style_v1";
const PREVIOUS_STORAGE_KEY = "culcept_my_style_v2";
// M1-2A (2026-06-01): PREVIOUS_BACKUP_STORAGE_KEY ("culcept_my_style_v2_backup") は loadStateBundle から
//   読込停止済（v2 race の素因を断つため）。 宣言ごと削除して unused にしない。 文字列値は
//   lib/stargazer/localStorageHelper.ts の EXPENDABLE_EXACT_KEYS に列挙されており、 次回 ensureStorageSpace
//   実行時に物理削除されるため、 ここに定数として保持する必要はない。
// const PREVIOUS_BACKUP_STORAGE_KEY = "culcept_my_style_v2_backup";  // [removed by M1-2A]

const MAX_SIGNAL_COUNT = 6;
const ZERO_DATE = new Date(0).toISOString();
const IMPRESSION_LABELS = new Set(IMPRESSION_OPTIONS);
const STYLE_GROUP_LABELS = new Set(ELEMENT_GROUPS.flatMap((group) => group.options.map((option) => option.label)));

function createEmptyIAmState(): IAmState {
    return {
        likedTags: [],
        dislikedTags: [],
        desiredImpressions: [],
        naturalSelfTags: [],
        memo: "",
    };
}

function createEmptyISeekState(): ISeekState {
    return {
        attractedWorldviews: [],
        attractedElements: [],
        unexpectedPulls: [],
        avoidedElements: [],
        memo: "",
    };
}

function createEmptyIBecomeState(): IBecomeState {
    return { pairs: [] };
}

function createEmptySeekContext(): SeekContextProfile {
    return {
        preferredLanes: [],
        preferredElements: [],
        avoidedElements: [],
        similarityPreference: "mixed",
        memo: "",
    };
}

export const EMPTY_STATE: SavedState = {
    wardrobe: [],
    setups: [],
    styleSelections: [],
    unexpectedStyleLanes: [],
    iam: createEmptyIAmState(),
    iseek: createEmptyISeekState(),
    ibecome: createEmptyIBecomeState(),
    timelineSnapshots: [],
    colorPrefs: { dominant: [] },
    seek: {
        romance: createEmptySeekContext(),
        friend: createEmptySeekContext(),
        cocreation: createEmptySeekContext(),
        orbiter: createEmptySeekContext(),
    },
    stylePrefs: {},
    memo: "",
    _revision: 0,
    styles: [],
    primaryLanes: [],
    secondaryLanes: [],
    exploringLanes: [],
    iAmLanes: [],
    favoriteElements: [],
    avoidElements: [],
    likedElements: [],
    dislikedElements: [],
    moodKeywords: [],
    silhouettePrefs: [],
    colorTones: [],
    materialPrefs: [],
    desiredImpressions: [],
    iAmNote: "",
    iSeekNote: "",
    seekPersonas: [],
    seekCategories: [],
    seekSubcategories: [],
};

export type SelfFormingItemSignal = {
    itemId: string;
    score: number;
    coreContribution: number;
    rareContribution: number;
    secretContribution: number;
    setupCount: number;
    memoryCount: number;
    impressionLabels: string[];
    timelinePeriods: string[];
    reasons: string[];
};

export type DerivedMyStyleSignals = {
    primaryLanes: StyleLaneCode[];
    coreLanes: StyleLaneCode[];
    rareLanes: StyleLaneCode[];
    secretLanes: StyleLaneCode[];
    unexpectedStyleLanes: StyleLaneCode[];
    dominantImpressions: string[];
    dominantWorldviews: string[];
    repeatedBecomeResults: string[];
    selfFormingItems: SelfFormingItemSignal[];
    dominantSetupMoods: SetupMoodCode[];
    timelineTrend: string[];
    timelineSnapshots: StyleTimelineSnapshot[];
    currentSnapshot: StyleTimelineSnapshot | null;
    currentContourText: string;
    discoveries: string[];
    nextActions: string[];
};

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function uniqueList(values: string[]) {
    return Array.from(new Set(values.filter(Boolean)));
}

function cleanNumber(value: unknown) {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
}

function clampUnit(value: number) {
    return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function safeTimestamp(value: unknown, fallback = ZERO_DATE) {
    const raw = String(value ?? "").trim();
    if (!raw) return fallback;
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function normalizeSimilarityPreference(value: unknown): SimilarityPreference {
    const raw = String(value ?? "").trim() as SimilarityPreference;
    return raw === "similar" || raw === "slightly-different" || raw === "very-different" || raw === "mixed" ? raw : "mixed";
}

function toStringArray(value: unknown, normalize?: (entry: string) => string): string[] {
    if (!Array.isArray(value)) return [];
    return Array.from(
        new Set(
            value
                .filter((entry): entry is string => typeof entry === "string")
                .map((entry) => entry.trim())
                .map((entry) => (normalize ? normalize(entry) : entry))
                .filter(Boolean)
        )
    );
}

function cleanWardrobe(value: unknown): WardrobeItem | null {
    if (!isRecord(value)) return null;
    const id = String(value.id ?? "").trim();
    const name = String(value.name ?? "").trim();
    const category = String(value.category ?? "").trim() as WardrobeItem["category"];
    const color = String(value.color ?? "").trim();
    if (!id || !name || !category || !color) {
        console.warn(`[cleanWardrobe] dropped item — id=${id || "(empty)"} name=${name || "(empty)"} category=${category || "(empty)"} color=${color || "(empty)"}`);
        return null;
    }
    return value as WardrobeItem;
}

function normalizeSelectedTags(
    raw: unknown,
    fallbackGroup: PreferenceTagGroup,
    normalize: (value: unknown) => string = normalizeElementId,
): SelectedPreferenceTag[] {
    if (!Array.isArray(raw)) return [];
    const normalized: SelectedPreferenceTag[] = [];
    const seen = new Set<string>();

    raw.forEach((entry, index) => {
        if (typeof entry === "string") {
            const code = normalize(entry);
            if (!code || seen.has(code)) return;
            seen.add(code);
            normalized.push({
                code,
                group: fallbackGroup,
                priority: normalized.length,
                createdAt: ZERO_DATE,
            });
            return;
        }

        if (!isRecord(entry)) return;
        const code = normalize(entry.code ?? entry.id ?? entry.label ?? "");
        if (!code || seen.has(code)) return;
        seen.add(code);
        const group = String(entry.group ?? fallbackGroup) as PreferenceTagGroup;
        normalized.push({
            code,
            group,
            priority: Number.isFinite(Number(entry.priority)) ? Number(entry.priority) : index,
            note: typeof entry.note === "string" ? entry.note : "",
            createdAt: safeTimestamp(entry.createdAt),
        });
    });

    return normalized
        .sort((a, b) => a.priority - b.priority)
        .map((entry, index) => ({ ...entry, priority: index }));
}

function normalizeStyleSelectionList(raw: unknown, fallbackBucket: StyleDepthBucket): SelectedStyleLane[] {
    if (!Array.isArray(raw)) return [];
    const normalized: SelectedStyleLane[] = [];
    const seen = new Set<string>();

    raw.forEach((entry, index) => {
        if (typeof entry === "string") {
            const laneCode = normalizeStyleLaneId(entry) as StyleLaneCode;
            if (!laneCode || seen.has(laneCode)) return;
            seen.add(laneCode);
            normalized.push({
                laneCode,
                bucket: fallbackBucket,
                priority: normalized.length,
                createdAt: ZERO_DATE,
            });
            return;
        }

        if (!isRecord(entry)) return;
        const laneCode = normalizeStyleLaneId(entry.laneCode ?? entry.id ?? entry.value ?? "");
        if (!laneCode || seen.has(laneCode)) return;
        seen.add(laneCode);
        normalized.push({
            laneCode: laneCode as StyleLaneCode,
            bucket: (String(entry.bucket ?? fallbackBucket) as StyleDepthBucket) || fallbackBucket,
            priority: Number.isFinite(Number(entry.priority)) ? Number(entry.priority) : index,
            note: typeof entry.note === "string" ? entry.note : "",
            createdAt: safeTimestamp(entry.createdAt),
        });
    });

    return normalized
        .sort((a, b) => a.priority - b.priority)
        .map((entry, index) => ({ ...entry, priority: index }));
}

function normalizeUnexpectedStyleLanes(raw: unknown): UnexpectedStyleLane[] {
    if (!Array.isArray(raw)) return [];
    const normalized: UnexpectedStyleLane[] = [];
    const seen = new Set<string>();

    raw.forEach((entry, index) => {
        if (typeof entry === "string") {
            const laneCode = normalizeStyleLaneId(entry);
            if (!laneCode || seen.has(laneCode)) return;
            seen.add(laneCode);
            normalized.push({
                laneCode: laneCode as StyleLaneCode,
                priority: normalized.length,
                createdAt: ZERO_DATE,
            });
            return;
        }
        if (!isRecord(entry)) return;
        const laneCode = normalizeStyleLaneId(entry.laneCode ?? entry.id ?? entry.value ?? "");
        if (!laneCode || seen.has(laneCode)) return;
        seen.add(laneCode);
        normalized.push({
            laneCode: laneCode as StyleLaneCode,
            priority: Number.isFinite(Number(entry.priority)) ? Number(entry.priority) : index,
            note: typeof entry.note === "string" ? entry.note : "",
            createdAt: safeTimestamp(entry.createdAt),
        });
    });

    return normalized
        .sort((a, b) => a.priority - b.priority)
        .map((entry, index) => ({ ...entry, priority: index }));
}

function cleanSetupMoodCodes(raw: unknown): SetupMoodCode[] {
    const codes = toStringArray(raw);
    const allowed = new Set<SetupMoodCode>(["calm", "bold", "soft", "clean", "natural", "sharp", "composed", "playful"]);
    return codes.filter((entry): entry is SetupMoodCode => allowed.has(entry as SetupMoodCode));
}

function cleanSavedSetup(value: unknown): SavedSetup | null {
    if (!isRecord(value)) return null;
    const id = String(value.id ?? "").trim();
    const title = String(value.title ?? value.name ?? "").trim();
    const itemIds = toStringArray(value.itemIds ?? value.items);
    if (!id || !title) return null;

    const memoryNote =
        isRecord(value.memory) && typeof value.memory.note === "string"
            ? value.memory.note
            : typeof value.note === "string"
              ? value.note
              : "";

    const memoryMoodTags =
        isRecord(value.memory) && Array.isArray(value.memory.moodTags)
            ? cleanSetupMoodCodes(value.memory.moodTags)
            : cleanSetupMoodCodes(value.moodTags);

    const memory =
        memoryNote.trim() || memoryMoodTags.length > 0
            ? {
                  note: memoryNote.trim(),
                  moodTags: memoryMoodTags,
                  createdAt: safeTimestamp(isRecord(value.memory) ? value.memory.createdAt : value.createdAt, safeTimestamp(value.createdAt)),
              }
            : undefined;

    return {
        id,
        title,
        itemIds,
        moodTags: cleanSetupMoodCodes(value.moodTags),
        impressionTags: toStringArray(value.impressionTags ?? value.tpoTags ?? value.tags),
        memory,
        createdAt: safeTimestamp(value.createdAt),
        updatedAt: safeTimestamp(value.updatedAt ?? value.createdAt),
    };
}

function cleanTimelineSnapshot(value: unknown): StyleTimelineSnapshot | null {
    if (!isRecord(value)) return null;
    const id = String(value.id ?? "").trim();
    const periodKey = String(value.periodKey ?? "").trim();
    if (!id || !periodKey) return null;
    return {
        id,
        periodKey,
        primaryLanes: toStringArray(value.primaryLanes, normalizeStyleLaneId) as StyleLaneCode[],
        coreLanes: toStringArray(value.coreLanes, normalizeStyleLaneId) as StyleLaneCode[],
        rareLanes: toStringArray(value.rareLanes, normalizeStyleLaneId) as StyleLaneCode[],
        secretLanes: toStringArray(value.secretLanes, normalizeStyleLaneId) as StyleLaneCode[],
        topColors: toStringArray(value.topColors),
        topImpressions: toStringArray(value.topImpressions),
        topUnexpectedPulls: toStringArray(value.topUnexpectedPulls),
        topBecomeResults: toStringArray(value.topBecomeResults),
        dominantMoodTags: toStringArray(value.dominantMoodTags),
        summary: typeof value.summary === "string" ? value.summary : "",
        createdAt: safeTimestamp(value.createdAt),
    };
}

function cleanBecomePair(value: unknown, index: number): BecomePair | null {
    if (!isRecord(value)) return null;
    const id = String(value.id ?? "").trim();
    if (!id) return null;
    return {
        id,
        triggerTags: normalizeSelectedTags(value.triggerTags, "become-trigger"),
        resultTags: normalizeSelectedTags(value.resultTags, "become-result"),
        note: typeof value.note === "string" ? value.note : "",
        priority: Number.isFinite(Number(value.priority)) ? Number(value.priority) : index,
        createdAt: safeTimestamp(value.createdAt),
    };
}

function inferIAmState(parsed: Record<string, unknown>): IAmState {
    if (isRecord(parsed.iam)) {
        return {
            likedTags: normalizeSelectedTags(parsed.iam.likedTags, "composition"),
            dislikedTags: normalizeSelectedTags(parsed.iam.dislikedTags, "tension"),
            desiredImpressions: normalizeSelectedTags(parsed.iam.desiredImpressions, "impression"),
            naturalSelfTags: normalizeSelectedTags(parsed.iam.naturalSelfTags, "mood"),
            memo: typeof parsed.iam.memo === "string" ? parsed.iam.memo : typeof parsed.iAmNote === "string" ? parsed.iAmNote : "",
        };
    }

    return {
        likedTags: normalizeSelectedTags(parsed.likedElements ?? parsed.favoriteElements, "composition"),
        dislikedTags: normalizeSelectedTags(parsed.dislikedElements ?? parsed.avoidElements, "tension"),
        desiredImpressions: normalizeSelectedTags(parsed.desiredImpressions, "impression", (value) => {
            const raw = String(value ?? "").trim();
            const normalized = normalizeElementId(raw);
            return normalized || raw;
        }),
        naturalSelfTags: normalizeSelectedTags(parsed.moodKeywords, "mood"),
        memo: typeof parsed.iAmNote === "string" ? parsed.iAmNote : "",
    };
}

function buildSeekFromLegacy(parsed: Record<string, unknown>): ISeekState {
    const legacySeek = isRecord(parsed.seek) ? parsed.seek : {};
    const worldviewLaneCodes = uniqueList([
        ...toStringArray(parsed.seekPersonas, normalizeStyleLaneId),
        ...SEEK_CONTEXT_KEYS.flatMap((key) => toStringArray(isRecord(legacySeek[key]) ? legacySeek[key].preferredLanes : [], normalizeStyleLaneId)),
    ]);
    const elementCodes = uniqueList([
        ...toStringArray(parsed.seekSubcategories, normalizeElementId),
        ...SEEK_CONTEXT_KEYS.flatMap((key) => toStringArray(isRecord(legacySeek[key]) ? legacySeek[key].preferredElements : [], normalizeElementId)),
    ]);
    const avoidedCodes = uniqueList(SEEK_CONTEXT_KEYS.flatMap((key) => toStringArray(isRecord(legacySeek[key]) ? legacySeek[key].avoidedElements : [], normalizeElementId)));
    const memo =
        typeof parsed.iSeekNote === "string"
            ? parsed.iSeekNote
            : SEEK_CONTEXT_KEYS.map((key) => (isRecord(legacySeek[key]) && typeof legacySeek[key].memo === "string" ? legacySeek[key].memo : "")).find(Boolean) ?? "";

    return {
        attractedWorldviews: worldviewLaneCodes.map((laneCode, index) => ({
            code: laneCode,
            group: "worldview",
            priority: index,
            createdAt: ZERO_DATE,
        })),
        attractedElements: elementCodes.map((code, index) => ({
            code,
            group: "worldview",
            priority: index,
            createdAt: ZERO_DATE,
        })),
        unexpectedPulls: [],
        avoidedElements: avoidedCodes.map((code, index) => ({
            code,
            group: "tension",
            priority: index,
            createdAt: ZERO_DATE,
        })),
        memo,
    };
}

function inferISeekState(parsed: Record<string, unknown>): ISeekState {
    if (isRecord(parsed.iseek)) {
        return {
            attractedWorldviews: normalizeSelectedTags(parsed.iseek.attractedWorldviews, "worldview", (value) => normalizeStyleLaneId(value) || normalizeElementId(value)),
            attractedElements: normalizeSelectedTags(parsed.iseek.attractedElements, "worldview"),
            unexpectedPulls: normalizeSelectedTags(parsed.iseek.unexpectedPulls, "tension"),
            avoidedElements: normalizeSelectedTags(parsed.iseek.avoidedElements, "tension"),
            memo: typeof parsed.iseek.memo === "string" ? parsed.iseek.memo : "",
        };
    }
    return buildSeekFromLegacy(parsed);
}

function inferIBecomeState(parsed: Record<string, unknown>): IBecomeState {
    if (!isRecord(parsed.ibecome) || !Array.isArray(parsed.ibecome.pairs)) return createEmptyIBecomeState();
    return {
        pairs: parsed.ibecome.pairs
            .map((entry, index) => cleanBecomePair(entry, index))
            .filter((entry): entry is BecomePair => Boolean(entry))
            .sort((a, b) => a.priority - b.priority)
            .map((entry, index) => ({ ...entry, priority: index })),
    };
}

function normalizeSeekContext(raw: unknown, fallback: SeekContextProfile): SeekContextProfile {
    const parsed = isRecord(raw) ? raw : {};
    return {
        preferredLanes: toStringArray(parsed.preferredLanes, normalizeStyleLaneId) as StyleLaneCode[],
        preferredElements: toStringArray(parsed.preferredElements, normalizeElementId),
        avoidedElements: toStringArray(parsed.avoidedElements, normalizeElementId),
        similarityPreference: normalizeSimilarityPreference(parsed.similarityPreference ?? fallback.similarityPreference),
        memo: typeof parsed.memo === "string" ? parsed.memo : fallback.memo,
    };
}

function buildSeekContextFromISeek(iseek: ISeekState): SeekContextProfile {
    return {
        preferredLanes: uniqueList(
            iseek.attractedWorldviews
                .map((tag) => normalizeStyleLaneId(tag.code))
                .filter(Boolean)
        ) as StyleLaneCode[],
        preferredElements: uniqueList([
            ...iseek.attractedElements.map((tag) => normalizeElementId(tag.code)),
            ...iseek.unexpectedPulls.map((tag) => normalizeElementId(tag.code)),
        ]).filter(Boolean),
        avoidedElements: uniqueList(iseek.avoidedElements.map((tag) => normalizeElementId(tag.code))).filter(Boolean),
        similarityPreference: "mixed",
        memo: iseek.memo ?? "",
    };
}

function itemUsageCount(setups: SavedSetup[], itemId: string) {
    return setups.reduce((count, setup) => count + (setup.itemIds.includes(itemId) ? 1 : 0), 0);
}

function itemMemoryCount(setups: SavedSetup[], itemId: string) {
    return setups.reduce((count, setup) => count + (setup.itemIds.includes(itemId) && setup.memory?.note ? 1 : 0), 0);
}

function laneAffinityForItem(item: WardrobeItem): Partial<Record<StyleLaneCode, number>> {
    const affinity: Partial<Record<StyleLaneCode, number>> = {};
    const push = (lane: StyleLaneCode, value: number) => {
        affinity[lane] = (affinity[lane] ?? 0) + value;
    };

    if (item.formality === "smart" || item.formality === "dress") {
        push("clean", 1.4);
        push("elegant", 1.5);
        push("classic", 1.2);
        push("trad", 1.1);
        push("officecasual", 1.1);
        push("smart-casual", 0.8);
    }
    if (item.formality === "casual") {
        push("natural", 0.9);
        push("smart-casual", 0.7);
        push("americancasual", 0.8);
    }

    const materialSet = new Set(item.materialFamily ?? []);
    if (materialSet.has("material.leather") || materialSet.has("material.suede")) {
        push("mode", 1.8);
        push("rock", 1.8);
        push("luxury", 0.9);
    }
    if (materialSet.has("material.denim")) {
        push("americancasual", 1.5);
        push("workwear", 1.2);
        push("vintage", 0.9);
    }
    if (materialSet.has("material.tech_nylon")) {
        push("techwear", 2.2);
        push("sporty", 1.5);
        push("outdoor", 1.4);
    }
    if (materialSet.has("material.wool") || materialSet.has("material.tweed") || materialSet.has("material.silk")) {
        push("classic", 1.3);
        push("elegant", 1.1);
        push("luxury", 1.0);
        push("trad", 1.0);
    }
    if (materialSet.has("material.cotton") || materialSet.has("material.linen")) {
        push("natural", 1.0);
        push("westcoast", 0.8);
        push("smart-casual", 0.6);
        push("resort", 0.6);
    }

    const color = item.color;
    if (["black", "white", "gray", "charcoal", "navy"].includes(color)) {
        push("minimal", 1.0);
        push("clean", 0.9);
        push("classic", 0.7);
        push("mode", color === "black" ? 0.8 : 0.3);
    }
    if (["beige", "cream", "camel", "khaki", "olive"].includes(color)) {
        push("natural", 0.9);
        push("smart-casual", 0.6);
        push("resort", 0.6);
        push("westcoast", 0.5);
    }
    if (["burgundy", "red"].includes(color)) {
        push("rock", 0.8);
        push("mode", 0.7);
        push("elegant", 0.4);
    }

    if (item.category === "outerwear") {
        push("clean", 0.7);
        push("classic", 0.5);
        push("mode", 0.4);
    }
    if (item.category === "shoes") {
        push("smart-casual", 0.6);
        push("rock", 0.4);
        push("classic", 0.4);
    }

    if (String(item.pattern ?? "").includes("plain")) {
        push("minimal", 0.7);
        push("clean", 0.4);
    }

    return affinity;
}

function getStyleSelectionsByBucket(state: SavedState, bucket: StyleDepthBucket) {
    return state.styleSelections.filter((entry) => entry.bucket === bucket).sort((a, b) => a.priority - b.priority);
}

function buildStyleSelectionWeights(state: SavedState) {
    const weights: Record<string, number> = {};
    getStyleSelectionsByBucket(state, "core").forEach((entry, index) => {
        weights[entry.laneCode] = Math.max(weights[entry.laneCode] ?? 0, 4 - index * 0.6);
    });
    getStyleSelectionsByBucket(state, "rare").forEach((entry, index) => {
        weights[entry.laneCode] = Math.max(weights[entry.laneCode] ?? 0, 2.6 - index * 0.3);
    });
    getStyleSelectionsByBucket(state, "secret").forEach((entry, index) => {
        weights[entry.laneCode] = Math.max(weights[entry.laneCode] ?? 0, 1.8 - index * 0.2);
    });
    for (const [key, score] of Object.entries(state.stylePrefs ?? {})) {
        weights[key] = Math.max(weights[key] ?? 0, Math.round(score) / 35);
    }
    return weights;
}

function countBy<T extends string>(values: T[]) {
    const counts: Record<string, number> = {};
    values.forEach((value) => {
        counts[value] = (counts[value] ?? 0) + 1;
    });
    return counts;
}

function topKeys(source: Record<string, number>, limit: number) {
    return Object.entries(source)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([key]) => key);
}

function buildWardrobeSignals(state: SavedState) {
    const colors = (state.colorPrefs?.dominant ?? []).slice(0, 3).map((entry) => entry.value);
    const categories = countBy(state.wardrobe.map((item) => item.category));
    const materials = countBy(state.wardrobe.flatMap((item) => item.materialFamily ?? []));
    const lines = [
        colors.length > 0 ? `${colors.join(" / ")} がワードローブの中心です` : "",
        topKeys(categories, 2).length > 0 ? `${topKeys(categories, 2).join(" / ")} が主力カテゴリです` : "",
        topKeys(materials, 1)[0] ? `${topKeys(materials, 1)[0]} 系の質感が目立ちます` : "",
    ];
    return uniqueList(lines.filter(Boolean)).slice(0, MAX_SIGNAL_COUNT);
}

function buildOutfitSignals(state: SavedState) {
    const moodCounts = countBy(state.setups.flatMap((setup) => setup.moodTags));
    const impressionCounts = countBy(state.setups.flatMap((setup) => setup.impressionTags));
    const memoryNotes = state.setups.flatMap((setup) => (setup.memory?.note ? [setup.memory.note] : []));
    const lines = [
        state.setups.length > 0 ? `${state.setups.length} 件のセットアップが保存されています` : "",
        topKeys(moodCounts, 2).length > 0 ? `${topKeys(moodCounts, 2).map((key) => getSetupMoodLabel(key as SetupMoodCode)).join(" / ")} を繰り返し選んでいます` : "",
        topKeys(impressionCounts, 2).length > 0 ? `${topKeys(impressionCounts, 2).join(" / ")} が組み方の印象として残っています` : "",
        memoryNotes[0] ? `最近の Setup Memory: 「${memoryNotes[0]}」` : "",
    ];
    return uniqueList(lines.filter(Boolean)).slice(0, MAX_SIGNAL_COUNT);
}

function buildCurrentContourSummary(
    primaryLanes: StyleLaneCode[],
    rareLanes: StyleLaneCode[],
    secretLanes: StyleLaneCode[],
    dominantImpressions: string[],
    dominantWorldviews: string[],
    repeatedBecomeResults: string[],
) {
    if (primaryLanes.length === 0) {
        const impressionPart = dominantImpressions[0] ? `いまは「${dominantImpressions.slice(0, 2).join(" / ")}」を残したい方向が見えています。` : "";
        const worldviewPart = dominantWorldviews[0] ? `${dominantWorldviews[0]} に心が動く兆しがあります。` : "";
        const becomePart = repeatedBecomeResults[0] ? `変化としては ${repeatedBecomeResults[0]} が先に出ています。` : "";
        return `${impressionPart}${worldviewPart}${becomePart}`.trim() || "まだ輪郭は途中ですが、静かな整いと自然体のあいだを探っている段階です。";
    }
    const main = primaryLanes.slice(0, 3).map(getStyleLaneLabel).join(" / ");
    const impression = dominantImpressions.slice(0, 2).join(" / ") || "静かな整い";
    const rarePart = rareLanes[0] ? `Rare では少し ${getStyleLaneLabel(rareLanes[0])} が前に出ています。` : "";
    const secretPart = secretLanes[0] ? `Secret には ${getStyleLaneLabel(secretLanes[0])} への反応が残っています。` : "";
    const worldviewPart = dominantWorldviews[0] ? `惹かれる世界観は ${dominantWorldviews.slice(0, 2).join(" / ")} に寄っています。` : "";
    const becomePart = repeatedBecomeResults[0] ? `I BECOME では ${repeatedBecomeResults[0]} の変化が見られます。` : "";
    return `いまは「${main}」が主軸で、${impression} を大切にする方向が強く出ています。${rarePart}${secretPart}${worldviewPart}${becomePart}`.trim();
}

function buildTimelineSummary(snapshot: Omit<StyleTimelineSnapshot, "id" | "createdAt" | "summary">) {
    if (snapshot.rareLanes[0] && snapshot.coreLanes[0]) {
        return `${getStyleLaneLabel(snapshot.coreLanes[0])} を軸にしながら、少し ${getStyleLaneLabel(snapshot.rareLanes[0])} へ揺れ始めた時期`;
    }
    if (snapshot.topUnexpectedPulls[0] && snapshot.topImpressions[0]) {
        return `${snapshot.topImpressions[0]} を保ちながら、${snapshot.topUnexpectedPulls[0]} が静かに前に出てきた時期`;
    }
    if (snapshot.topBecomeResults[0] && snapshot.topImpressions[0]) {
        return `${snapshot.topImpressions[0]} を残しつつ、${snapshot.topBecomeResults[0]} を選び始めた時期`;
    }
    if (snapshot.dominantMoodTags[0] && snapshot.topImpressions[0]) {
        return `${snapshot.dominantMoodTags[0]} を軸に、${snapshot.topImpressions[0]} を微調整していた時期`;
    }
    if (snapshot.topColors[0]) {
        return `${snapshot.topColors.join(" / ")} に寄せながら、輪郭を微調整していた時期`;
    }
    return "大きく振るのではなく、輪郭の微調整が続いている時期";
}

function buildCurrentSnapshot(state: SavedState): StyleTimelineSnapshot | null {
    const coreLanes = getStyleSelectionsByBucket(state, "core").map((entry) => entry.laneCode);
    const rareLanes = getStyleSelectionsByBucket(state, "rare").map((entry) => entry.laneCode);
    const secretLanes = getStyleSelectionsByBucket(state, "secret").map((entry) => entry.laneCode);
    const topColors = (state.colorPrefs?.dominant ?? []).slice(0, 3).map((entry) => entry.value);
    const topImpressions = state.iam.desiredImpressions.slice(0, 3).map((tag) => getElementLabel(tag.code));
    const topUnexpectedPulls = uniqueList([
        ...state.unexpectedStyleLanes.slice(0, 3).map((entry) => getStyleLaneLabel(entry.laneCode)),
        ...state.iseek.unexpectedPulls.slice(0, 3).map((tag) => getElementLabel(tag.code)),
    ]).slice(0, 3);
    const topBecomeResults = state.ibecome.pairs
        .flatMap((pair) => pair.resultTags.map((tag) => getElementLabel(tag.code)))
        .slice(0, 3);
    const dominantMoodTags = topKeys(countBy(state.setups.flatMap((setup) => setup.moodTags)), 3).map((key) => getSetupMoodLabel(key as SetupMoodCode));
    const periodDate = new Date();
    if (Number.isNaN(periodDate.getTime())) return null;
    const periodKey = `${periodDate.getFullYear()}-${String(periodDate.getMonth() + 1).padStart(2, "0")}`;

    const payload = {
        periodKey,
        primaryLanes: coreLanes.slice(0, 3),
        coreLanes,
        rareLanes,
        secretLanes,
        topColors,
        topImpressions,
        topUnexpectedPulls,
        topBecomeResults,
        dominantMoodTags,
    };

    return {
        id: `snapshot_${periodKey}`,
        ...payload,
        summary: buildTimelineSummary(payload),
        createdAt: new Date().toISOString(),
    };
}

function buildTimelineSignals(snapshots: StyleTimelineSnapshot[]) {
    const latest = snapshots[0];
    const previous = snapshots[1];
    if (!latest) return [];

    const signals: string[] = [];
    if (latest.rareLanes[0] && !latest.coreLanes.includes(latest.rareLanes[0])) {
        signals.push(`Rare に ${getStyleLaneLabel(latest.rareLanes[0])} が残っています`);
    }
    if (latest.topUnexpectedPulls[0]) {
        signals.push(`惹かれる違和感として ${latest.topUnexpectedPulls[0]} が見えます`);
    }
    if (latest.topBecomeResults[0]) {
        signals.push(`${latest.topBecomeResults[0]} 方向の変化が繰り返されています`);
    }
    if (previous && latest.coreLanes[0] !== previous.coreLanes[0] && latest.coreLanes[0]) {
        signals.push(`${getStyleLaneLabel(latest.coreLanes[0])} が最近の主軸に近づいています`);
    }
    return uniqueList(signals).slice(0, MAX_SIGNAL_COUNT);
}

function buildSeekMap(iseek: ISeekState, rawSeek: unknown) {
    const fallback = buildSeekContextFromISeek(iseek);
    const parsed = isRecord(rawSeek) ? rawSeek : {};
    return Object.fromEntries(
        SEEK_CONTEXT_KEYS.map((key) => [key, normalizeSeekContext(parsed[key], fallback)])
    ) as Record<SeekContextKey, SeekContextProfile>;
}

function normalizeBaseState(raw: unknown): SavedState {
    const parsed = isRecord(raw) ? raw : {};
    const wardrobe = Array.isArray(parsed.wardrobe)
        ? parsed.wardrobe.map(cleanWardrobe).filter((item): item is WardrobeItem => Boolean(item))
        : [];
    const setups = Array.isArray(parsed.setups)
        ? parsed.setups.map(cleanSavedSetup).filter((setup): setup is SavedSetup => Boolean(setup))
        : [];

    const directSelections = Array.isArray(parsed.styleSelections)
        ? normalizeStyleSelectionList(parsed.styleSelections, "core")
        : [];
    const legacyCore = normalizeStyleSelectionList(parsed.primaryLanes, "core");
    const legacyRare = normalizeStyleSelectionList(parsed.secondaryLanes, "rare");
    const legacySecret = normalizeStyleSelectionList(parsed.exploringLanes, "secret");
    const legacyStyles = normalizeStyleSelectionList(parsed.styles, "core");
    const styleSelections = directSelections.length > 0
        ? directSelections
        : legacyCore.length + legacyRare.length + legacySecret.length > 0
            ? [...legacyCore, ...legacyRare, ...legacySecret]
            : legacyStyles;

    const unexpectedStyleLanes = normalizeUnexpectedStyleLanes(parsed.unexpectedStyleLanes);
    const iam = inferIAmState(parsed);
    const iseek = inferISeekState(parsed);
    const ibecome = inferIBecomeState(parsed);
    const timelineSnapshots = Array.isArray(parsed.timelineSnapshots)
        ? parsed.timelineSnapshots.map(cleanTimelineSnapshot).filter((snapshot): snapshot is StyleTimelineSnapshot => Boolean(snapshot))
        : [];
    const colorPrefsRecord = isRecord(parsed.colorPrefs) ? (parsed.colorPrefs as ColorPrefs) : null;
    const colorPrefs = colorPrefsRecord?.dominant?.length ? colorPrefsRecord : computeColorPrefs(wardrobe);

    const wearHistory: Record<string, import("./types").WearRecord> = {};
    if (isRecord(parsed.wearHistory)) {
        for (const [key, val] of Object.entries(parsed.wearHistory)) {
            if (isRecord(val) && typeof (val as Record<string, unknown>).count === "number") {
                const v = val as Record<string, unknown>;
                wearHistory[key] = {
                    count: Number(v.count) || 0,
                    lastWornAt: typeof v.lastWornAt === "string" ? v.lastWornAt : "",
                    setupIds: Array.isArray(v.setupIds) ? v.setupIds.filter((s): s is string => typeof s === "string") : [],
                };
            }
        }
    }

    const next: SavedState = {
        ...EMPTY_STATE,
        wardrobe,
        setups,
        styleSelections,
        unexpectedStyleLanes,
        iam,
        iseek,
        ibecome,
        timelineSnapshots,
        colorPrefs,
        wearHistory,
        styleSnapshots: Array.isArray(parsed.styleSnapshots)
            ? (parsed.styleSnapshots as unknown[]).filter(
                  (s): s is import("./types").StyleSnapshot =>
                      isRecord(s as Record<string, unknown>) &&
                      typeof (s as Record<string, unknown>).timestamp === "string",
              )
            : [],
        seek: buildSeekMap(iseek, parsed.seek),
        stylePrefs: isRecord(parsed.stylePrefs)
            ? Object.fromEntries(
                  Object.entries(parsed.stylePrefs)
                      .filter((entry): entry is [string, number] => typeof entry[1] === "number")
                      .map(([key, value]) => [normalizeStyleLaneId(key), cleanNumber(value)])
                      .filter(([key]) => Boolean(key))
              )
            : {},
        memo: typeof parsed.memo === "string" ? parsed.memo : "",
        moodKeywords: toStringArray(parsed.moodKeywords),
        silhouettePrefs: toStringArray(parsed.silhouettePrefs),
        colorTones: toStringArray(parsed.colorTones),
        materialPrefs: toStringArray(parsed.materialPrefs),
        seekPersonas: toStringArray(parsed.seekPersonas),
        seekCategories: toStringArray(parsed.seekCategories),
        seekSubcategories: toStringArray(parsed.seekSubcategories),
        _revision: typeof parsed._revision === "number" && Number.isFinite(parsed._revision) ? parsed._revision : 0,
    };

    return next;
}

export function finalizeSavedState(raw: SavedState): SavedState {
    const next = normalizeBaseState(raw);
    const coreLanes = getStyleSelectionsByBucket(next, "core").map((entry) => entry.laneCode);
    const rareLanes = getStyleSelectionsByBucket(next, "rare").map((entry) => entry.laneCode);
    const secretLanes = getStyleSelectionsByBucket(next, "secret").map((entry) => entry.laneCode);
    const styles = uniqueList([...coreLanes, ...rareLanes, ...secretLanes]) as StyleLaneCode[];

    const stylePrefs = { ...(next.stylePrefs ?? {}) };
    styles.forEach((lane) => {
        const bucketWeight = coreLanes.includes(lane) ? 90 : rareLanes.includes(lane) ? 68 : 52;
        stylePrefs[lane] = Math.max(stylePrefs[lane] ?? 0, bucketWeight);
    });

    const currentSnapshot = buildCurrentSnapshot(next);
    const timelineSnapshots = currentSnapshot
        ? [
              currentSnapshot,
              ...next.timelineSnapshots.filter((snapshot) => snapshot.periodKey !== currentSnapshot.periodKey),
          ]
        : next.timelineSnapshots;

    return {
        ...next,
        timelineSnapshots,
        styles,
        primaryLanes: coreLanes,
        secondaryLanes: rareLanes,
        exploringLanes: secretLanes,
        iAmLanes: coreLanes,
        likedElements: next.iam.likedTags.map((tag) => tag.code),
        dislikedElements: next.iam.dislikedTags.map((tag) => tag.code),
        favoriteElements: next.iam.likedTags.map((tag) => tag.code),
        avoidElements: next.iam.dislikedTags.map((tag) => tag.code),
        desiredImpressions: next.iam.desiredImpressions.map((tag) => getElementLabel(tag.code)),
        iAmNote: next.iam.memo ?? "",
        iSeekNote: next.iseek.memo ?? "",
        moodKeywords: uniqueList([
            ...next.iam.naturalSelfTags.map((tag) => getElementLabel(tag.code)),
            ...next.setups.flatMap((setup) => setup.moodTags.map((tag) => getSetupMoodLabel(tag))),
        ]),
        seekPersonas: next.iseek.attractedWorldviews
            .map((tag) => normalizeStyleLaneId(tag.code))
            .filter(Boolean),
        seekSubcategories: uniqueList([
            ...next.iseek.attractedElements.map((tag) => tag.code),
            ...next.iseek.unexpectedPulls.map((tag) => tag.code),
        ]),
        stylePrefs,
        seek: buildSeekMap(next.iseek, next.seek),
    };
}

export function readJsonStorage(key: string): unknown | null {
    if (typeof window === "undefined") return null;
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
    } catch (err) {
        console.error(`[my-style] readJsonStorage failed for key="${key}":`, err);
        return null;
    }
}

export function normalizeSavedState(raw: unknown): SavedState {
    return finalizeSavedState(normalizeBaseState(raw));
}

export function normalizeLegacyState(raw: unknown): SavedState | null {
    const parsed = isRecord(raw) ? raw : null;
    if (!parsed) return null;

    const legacyCloset = Array.isArray(parsed.closet)
        ? parsed.closet.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        : [];
    const styles = Array.isArray(parsed.styles)
        ? parsed.styles.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        : [];
    const memo = typeof parsed.memo === "string" ? parsed.memo : "";
    if (!legacyCloset.length && !styles.length && !memo.trim()) return null;

    const wardrobe = legacyCloset.map((name, index) => ({
        id: `legacy_${index}_${name.trim().toLowerCase().replace(/\s+/g, "_")}`,
        name: name.trim(),
        category: "other" as const,
        color: "gray",
        addedAt: ZERO_DATE,
    }));

    return normalizeSavedState({
        ...EMPTY_STATE,
        wardrobe,
        styles: styles.map((style) => normalizeStyleLaneId(style)).filter(Boolean) as StyleLaneCode[],
        memo,
        colorPrefs: computeColorPrefs(wardrobe),
    });
}

function hasText(value: unknown) {
    return String(value ?? "").trim().length > 0;
}

function hasSeekSignal(seek: Record<SeekContextKey, SeekContextProfile> | undefined) {
    if (!seek) return false;
    return SEEK_CONTEXT_KEYS.some((key) => {
        const entry = seek[key];
        return (
            (entry?.preferredLanes.length ?? 0) > 0 ||
            (entry?.preferredElements.length ?? 0) > 0 ||
            (entry?.avoidedElements.length ?? 0) > 0 ||
            hasText(entry?.memo)
        );
    });
}

export function hasMeaningfulState(state: SavedState | null | undefined) {
    if (!state) return false;
    return (
        state.wardrobe.length > 0 ||
        state.setups.length > 0 ||
        state.styleSelections.length > 0 ||
        state.unexpectedStyleLanes.length > 0 ||
        state.iam.likedTags.length > 0 ||
        state.iam.dislikedTags.length > 0 ||
        state.iam.desiredImpressions.length > 0 ||
        state.iseek.attractedWorldviews.length > 0 ||
        state.iseek.attractedElements.length > 0 ||
        state.iseek.unexpectedPulls.length > 0 ||
        state.iseek.avoidedElements.length > 0 ||
        state.ibecome.pairs.length > 0 ||
        hasSeekSignal(state.seek) ||
        hasText(state.iam.memo) ||
        hasText(state.iseek.memo) ||
        hasText(state.memo)
    );
}

/**
 * Fix D（削除復活の停止）: remote(server) state を local に採用してよいか判定する pure helper。
 *
 * **revision-aware**（2026-05-31 改訂）:
 *   - localStorage が quota で **古い revision に stale 固定**され（書込失敗）、 それが reload で current に
 *     なる一方、 IDB / server は新しい revision に進む——という非対称が起きる。 current が meaningful という
 *     だけで remote を弾くと、 **古い current が新しい remote の削除結果を巻き戻す**（実ログ: current 24/rev1 が
 *     server 23/rev2 を adopt:false で拒否）。 そこで **revision を比較**する。
 *
 * 判定:
 *   1. `remoteRev > currentRev` → **採用**（remote が新しい。 delete-all＝空 wardrobe でも新しければ反映）。
 *   2. revision 同等以下で current が active（rev>0）/ meaningful → **維持**（古い remote で上書きしない）。
 *   3. current が完全 virgin（rev0 かつ非 meaningful）→ 中身のある remote のみ **採用**（新規端末の復元）。
 *
 * ※ 呼び出し側は **stale な initialBundle ではなく「現在の state」**（functional setState の prev）を
 *    current として渡すこと。
 */
export function shouldAdoptRemoteState(
    current: SavedState | null | undefined,
    remote: SavedState | null | undefined,
): boolean {
    if (!remote) return false;
    const currentRev = current?._revision ?? 0;
    const remoteRev = remote?._revision ?? 0;
    if (remoteRev > currentRev) return true;
    if (currentRev > 0 || hasMeaningfulState(current)) return false;
    return hasMeaningfulState(remote);
}

export function getStateRichness(state: SavedState | null | undefined) {
    if (!state) return 0;
    return (
        state.wardrobe.length * 3 +
        state.setups.length * 3 +
        getStyleSelectionsByBucket(state, "core").length * 4 +
        getStyleSelectionsByBucket(state, "rare").length * 3 +
        getStyleSelectionsByBucket(state, "secret").length * 2 +
        state.unexpectedStyleLanes.length * 2 +
        state.iam.likedTags.length +
        state.iam.desiredImpressions.length * 2 +
        state.iseek.attractedWorldviews.length * 2 +
        state.iseek.attractedElements.length +
        state.iseek.unexpectedPulls.length * 2 +
        state.ibecome.pairs.length * 3 +
        (hasText(state.iam.memo) ? 2 : 0) +
        (hasText(state.iseek.memo) ? 2 : 0)
    );
}

export function mergeWithBackup(current: SavedState, backup: SavedState | null) {
    if (!backup) return { state: current, usedBackup: false };

    const currentRev = current._revision ?? 0;
    const backupRev = backup._revision ?? 0;

    // If current has a higher or equal revision, it is authoritative — never resurrect backup data.
    // This prevents deleted items from reappearing via an older backup.
    if (currentRev >= backupRev) {
        return { state: current, usedBackup: false };
    }

    // Backup has a strictly newer revision — use it entirely (replace semantics)
    console.log(`[mergeWithBackup] backup revision ${backupRev} > current ${currentRev} — using backup`);
    return { state: normalizeSavedState(backup), usedBackup: true };
}

function collectStyleSignalWeights(state: SavedState) {
    const weights = buildStyleSelectionWeights(state);
    for (const item of state.wardrobe) {
        const affinity = laneAffinityForItem(item);
        for (const [lane, value] of Object.entries(affinity)) {
            weights[lane] = Math.max(weights[lane] ?? 0, Number(value));
        }
    }
    return weights;
}

function deriveSelfFormingItems(state: SavedState, snapshots: StyleTimelineSnapshot[]) {
    const coreLanes = getStyleSelectionsByBucket(state, "core").map((entry) => entry.laneCode);
    const rareLanes = getStyleSelectionsByBucket(state, "rare").map((entry) => entry.laneCode);
    const secretLanes = getStyleSelectionsByBucket(state, "secret").map((entry) => entry.laneCode);
    const desiredImpressions = state.iam.desiredImpressions.map((tag) => getElementLabel(tag.code));

    return state.wardrobe
        .map((item) => {
            const affinity = laneAffinityForItem(item);
            const setupCount = itemUsageCount(state.setups, item.id);
            const memoryCount = itemMemoryCount(state.setups, item.id);
            const coreContribution = coreLanes.reduce((sum, lane) => sum + (affinity[lane] ?? 0), 0);
            const rareContribution = rareLanes.reduce((sum, lane) => sum + (affinity[lane] ?? 0), 0);
            const secretContribution = secretLanes.reduce((sum, lane) => sum + (affinity[lane] ?? 0), 0);
            const impressionLabels = uniqueList(
                desiredImpressions.filter((label) => {
                    if (label.includes("清潔") && ["smart", "dress"].includes(item.formality ?? "")) return true;
                    if (label.includes("上品") && ["smart", "dress"].includes(item.formality ?? "")) return true;
                    if (label.includes("自然体") && ["casual"].includes(item.formality ?? "")) return true;
                    if (label.includes("都会") && ["black", "navy", "charcoal"].includes(item.color)) return true;
                    return false;
                })
            );
            const recency = item.addedAt ? clampUnit((Date.now() - new Date(item.addedAt).getTime()) < 1000 * 60 * 60 * 24 * 90 ? 1 : 0.3) : 0.4;
            const score = Number(
                (
                    setupCount * 2.6 +
                    memoryCount * 2.2 +
                    coreContribution * 2.1 +
                    rareContribution * 1.4 +
                    secretContribution * 1.2 +
                    impressionLabels.length * 1.3 +
                    recency
                ).toFixed(2)
            );
            const timelinePeriods = snapshots
                .filter((snapshot) => snapshot.primaryLanes.some((lane) => (affinity[lane] ?? 0) > 0))
                .slice(0, 3)
                .map((snapshot) => snapshot.periodKey);
            const reasons = uniqueList([
                setupCount > 0 ? `セットアップで ${setupCount} 回使われています` : "",
                memoryCount > 0 ? `Setup Memory に ${memoryCount} 回登場しています` : "",
                coreContribution > 0 ? `${getStyleLaneLabel(coreLanes[0] ?? "")} 軸への寄与が強いです` : "",
                rareContribution > 0 ? `Rare の方向にも反応しています` : "",
                impressionLabels[0] ? `${impressionLabels[0]} を支える役割があります` : "",
            ]).slice(0, 3);
            return {
                itemId: item.id,
                score,
                coreContribution: Number(coreContribution.toFixed(2)),
                rareContribution: Number(rareContribution.toFixed(2)),
                secretContribution: Number(secretContribution.toFixed(2)),
                setupCount,
                memoryCount,
                impressionLabels,
                timelinePeriods,
                reasons,
            };
        })
        .sort((a, b) => b.score - a.score);
}

export function deriveMyStyleSignals(state: SavedState): DerivedMyStyleSignals {
    const normalized = normalizeSavedState(state);
    const coreLanes = getStyleSelectionsByBucket(normalized, "core").map((entry) => entry.laneCode);
    const rareLanes = getStyleSelectionsByBucket(normalized, "rare").map((entry) => entry.laneCode);
    const secretLanes = getStyleSelectionsByBucket(normalized, "secret").map((entry) => entry.laneCode);
    const unexpectedStyleLanes = normalized.unexpectedStyleLanes.map((entry) => entry.laneCode);
    const dominantImpressions = normalized.iam.desiredImpressions.slice(0, 4).map((tag) => getElementLabel(tag.code));
    const dominantWorldviews = uniqueList([
        ...normalized.iseek.attractedWorldviews.slice(0, 4).map((tag) => {
            const laneLabel = getStyleLaneLabel(tag.code);
            return laneLabel && laneLabel !== tag.code ? laneLabel : getElementLabel(tag.code);
        }),
        ...normalized.iseek.attractedElements.slice(0, 2).map((tag) => getElementLabel(tag.code)),
    ]).slice(0, 4);
    const repeatedBecomeResults = topKeys(
        countBy(normalized.ibecome.pairs.flatMap((pair) => pair.resultTags.map((tag) => getElementLabel(tag.code)))),
        4
    );
    const dominantSetupMoods = topKeys(countBy(normalized.setups.flatMap((setup) => setup.moodTags)), 4) as SetupMoodCode[];
    const currentSnapshot = buildCurrentSnapshot(normalized);
    const timelineSnapshots = currentSnapshot
        ? [currentSnapshot, ...normalized.timelineSnapshots.filter((snapshot) => snapshot.periodKey !== currentSnapshot.periodKey)]
        : normalized.timelineSnapshots;
    const timelineTrend = buildTimelineSignals(timelineSnapshots);
    const selfFormingItems = deriveSelfFormingItems(normalized, timelineSnapshots);
    const discoveries = uniqueList([
        rareLanes[0] ? `最近、${getStyleLaneLabel(coreLanes[0] ?? rareLanes[0])} の中に少し ${getStyleLaneLabel(rareLanes[0])} を混ぜたがっています` : "",
        dominantImpressions[0] && dominantWorldviews[0] ? `いまは ${dominantImpressions[0]} を残しながら、${dominantWorldviews[0]} に向かいたい気配があります` : "",
        dominantWorldviews[0] ? `思っていたより、${dominantWorldviews[0]} に惹かれる傾向があります` : "",
        repeatedBecomeResults[0] ? `I BECOME では「${repeatedBecomeResults[0]}」の変化が繰り返し見られます` : "",
        unexpectedStyleLanes[0] ? `主軸とは別に ${getStyleLaneLabel(unexpectedStyleLanes[0])} への違和感が残っています` : "",
        selfFormingItems[0]?.reasons[0] ? `${selfFormingItems[0].reasons[0]} アイテムが、いまの輪郭を下から支えています` : "",
    ]).slice(0, 4);
    const nextActions = uniqueList([
        secretLanes[0] ? `Secret にある ${getStyleLaneLabel(secretLanes[0])} を 1 つだけセットアップで試してみる` : "",
        normalized.ibecome.pairs.length < 2 ? "I BECOME を 2 件以上に増やして、変化の癖を深める" : "",
        rareLanes[0] ? `Rare の方向で保存済みセットアップを 1 つ作る` : "",
        normalized.setups.filter((setup) => setup.memory?.note).length < 2 ? "Setup Memory を増やして、その時の自分を残す" : "",
    ]).slice(0, 4);

    return {
        primaryLanes: coreLanes.slice(0, 3),
        coreLanes,
        rareLanes,
        secretLanes,
        unexpectedStyleLanes,
        dominantImpressions,
        dominantWorldviews,
        repeatedBecomeResults,
        selfFormingItems,
        dominantSetupMoods,
        timelineTrend,
        timelineSnapshots,
        currentSnapshot,
        currentContourText: buildCurrentContourSummary(coreLanes, rareLanes, secretLanes, dominantImpressions, dominantWorldviews, repeatedBecomeResults),
        discoveries,
        nextActions,
    };
}

export function buildMyStyleSelfProfileExport(state: SavedState): MyStyleSelfProfile {
    const normalized = normalizeSavedState(state);
    const derived = deriveMyStyleSignals(normalized);
    return {
        primaryLanes: derived.primaryLanes,
        coreLanes: derived.coreLanes,
        rareLanes: derived.rareLanes,
        secretLanes: derived.secretLanes,
        unexpectedPulls: uniqueList([
            ...derived.unexpectedStyleLanes.map(getStyleLaneLabel),
            ...normalized.iseek.unexpectedPulls.map((tag) => getElementLabel(tag.code)),
        ]).slice(0, 6),
        desiredImpressions: derived.dominantImpressions,
        attractedWorldviews: derived.dominantWorldviews,
        repeatedBecomeResults: derived.repeatedBecomeResults,
        wardrobeSignals: buildWardrobeSignals(normalized),
        outfitSignals: buildOutfitSignals(normalized),
        timelineSignals: derived.timelineTrend,
    };
}

export function buildMyStyleProfile(state: SavedState): MyStyleProfile {
    const normalized = normalizeSavedState(state);
    const derived = deriveMyStyleSignals(normalized);
    const exportProfile = buildMyStyleSelfProfileExport(normalized);
    const selectionCount =
        normalized.styleSelections.length +
        normalized.unexpectedStyleLanes.length +
        normalized.iam.likedTags.length +
        normalized.iam.dislikedTags.length +
        normalized.iam.desiredImpressions.length +
        normalized.iseek.attractedWorldviews.length +
        normalized.iseek.attractedElements.length +
        normalized.iseek.unexpectedPulls.length +
        normalized.iseek.avoidedElements.length +
        normalized.ibecome.pairs.reduce((count, pair) => count + pair.triggerTags.length + pair.resultTags.length, 0);
    const memoSignals =
        (hasText(normalized.iam.memo) ? 1 : 0) +
        (hasText(normalized.iseek.memo) ? 1 : 0) +
        normalized.ibecome.pairs.filter((pair) => hasText(pair.note)).length +
        normalized.setups.filter((setup) => hasText(setup.memory?.note)).length;

    return {
        self: {
            primaryLanes: derived.primaryLanes,
            secondaryLanes: derived.rareLanes.slice(0, 3),
            coreLanes: derived.coreLanes,
            rareLanes: derived.rareLanes,
            secretLanes: derived.secretLanes,
            unexpectedPulls: exportProfile.unexpectedPulls,
            likedElements: normalized.iam.likedTags.map((tag) => tag.code),
            dislikedElements: normalized.iam.dislikedTags.map((tag) => tag.code),
            desiredImpressions: normalized.iam.desiredImpressions.map((tag) => getElementLabel(tag.code)),
            naturalSelfTags: normalized.iam.naturalSelfTags.map((tag) => getElementLabel(tag.code)),
            attractedWorldviews: exportProfile.attractedWorldviews,
            repeatedBecomeResults: exportProfile.repeatedBecomeResults,
            wardrobeSignals: exportProfile.wardrobeSignals,
            outfitSignals: exportProfile.outfitSignals,
            timelineSignals: exportProfile.timelineSignals,
        },
        seek: normalized.seek ?? EMPTY_STATE.seek!,
        identity: {
            iam: normalized.iam,
            iseek: normalized.iseek,
            ibecome: normalized.ibecome,
        },
        evidence: {
            wardrobeStrength: clampUnit(normalized.wardrobe.length / 24),
            outfitStrength: clampUnit(normalized.setups.length / 12),
            selectionStrength: clampUnit(selectionCount / 36),
            memoStrength: clampUnit(memoSignals / 8),
        },
        exportProfile,
    };
}

export function deriveSyncSignals(state: SavedState) {
    const normalized = normalizeSavedState(state);
    const wardrobeCategories = countBy(normalized.wardrobe.map((item) => item.category));
    const silhouette = countBy(normalized.wardrobe.map((item) => item.silhouette ?? "").filter(Boolean));
    const material = countBy(normalized.wardrobe.flatMap((item) => item.materialFamily ?? []));
    const detail = countBy(normalized.wardrobe.flatMap((item) => item.surfaceFinish ?? []));
    const pattern = countBy(normalized.wardrobe.map((item) => item.pattern ?? "").filter(Boolean));
    const styleSignalWeights = collectStyleSignalWeights(normalized);
    const dominantColors = normalized.colorPrefs?.dominant ?? computeColorPrefs(normalized.wardrobe).dominant;
    const wardrobeColors = dominantColors.map((entry) => String(entry.value ?? "").trim().toLowerCase()).filter(Boolean).slice(0, 8);
    const favoriteColors = wardrobeColors.slice(0, 5);
    const profile = buildMyStyleProfile(normalized);
    const styleTags = uniqueList([
        ...profile.exportProfile.primaryLanes,
        ...profile.exportProfile.rareLanes,
        ...profile.exportProfile.secretLanes,
        ...topKeys(styleSignalWeights, 6).map((key) => normalizeStyleLaneId(key)).filter(Boolean),
    ]).slice(0, 12);
    const moodKeywords = uniqueList([
        ...profile.exportProfile.desiredImpressions,
        ...profile.exportProfile.attractedWorldviews,
        ...profile.exportProfile.repeatedBecomeResults,
    ]).slice(0, 10);

    return {
        normalizedState: normalized,
        summary: {
            styleTags,
            moodKeywords,
            favoriteColors,
            wardrobeColors,
            wardrobeCategories,
        },
        prefProfile: {
            silhouette,
            material,
            detail,
            pattern,
        },
        profile,
    };
}

/**
 * Strip base64 data: URLs from wardrobe image fields.
 * Keeps external URLs (https:// etc.) under 2048 chars; drops everything else.
 *
 * C1L-1: imageUrl と同一ポリシーを originalUrl / cutoutUrl にも適用する
 * （base64 data: の重い cutout / original を server snapshot に載せない）。
 * cutoutStatus / cutoutConfidence / cutoutMethod は軽量メタなので `...item` で保持する。
 * imageUrl の既存挙動は変えない（同じ述語を共有）。 export はテスト用（挙動は不変）。
 */
export function stripHeavyImageUrls(wardrobe: WardrobeItem[]): WardrobeItem[] {
    const keepLight = (url: string | undefined): string | undefined =>
        typeof url === "string" && url.trim() !== "" && !url.startsWith("data:") && url.length < 2048
            ? url
            : undefined;
    return wardrobe.map((item) => ({
        ...item,
        imageUrl: keepLight(item.imageUrl),
        originalUrl: keepLight(item.originalUrl),
        cutoutUrl: keepLight(item.cutoutUrl),
    }));
}

/**
 * C1L-6 fix: 再読込時に IDB(cached full state) から **heavy 画像フィールド**を
 * current(localStorage は stripHeavyImageUrls 済) へ id 一致で復元する。
 *
 * 背景:
 *   - localStorage は quota 対策で imageUrl / originalUrl / cutoutUrl(base64 data:) を除去する。
 *   - 再読込時に **imageUrl だけ**復元すると cutoutUrl / originalUrl が戻らず、 直後の自動 persist が
 *     IDB を cutoutUrl 無しで上書きして、 /plan + My-Style の **背景透過表示が壊れる**。
 *   - 本 helper は 3 つの heavy 画像フィールドを復元し、 cutout を保つ。
 *
 * 規約（壊さないための不変条件）:
 *   - 復元対象は **imageUrl / cutoutUrl / originalUrl のみ**。
 *   - cutoutStatus / cutoutConfidence / cutoutMethod など軽量 metadata は current を保持
 *     （current を spread の base にするため自動で残る）。
 *   - cached 側に**非空値がある時だけ**復元。 **undefined で current の既存値を上書きしない**。
 *   - current 側に既に値があるフィールドは維持（cached で上書きしない）。
 *   - id 不一致の cached は無視。 並び順・他フィールドは current のまま。
 *   - pure: 副作用なし・入力を mutate しない。 何も復元しなければ **同じ配列参照**を返す（再描画ゼロ）。
 */
export function mergeRestoredWardrobeImageFields(
    currentWardrobe: WardrobeItem[],
    cachedWardrobe: WardrobeItem[],
): WardrobeItem[] {
    const isNonEmpty = (v: unknown): v is string => typeof v === "string" && v.length > 0;

    const heavyById = new Map<string, Pick<WardrobeItem, "imageUrl" | "cutoutUrl" | "originalUrl">>();
    for (const item of cachedWardrobe) {
        if (!item || !item.id) continue;
        const heavy: Pick<WardrobeItem, "imageUrl" | "cutoutUrl" | "originalUrl"> = {};
        if (isNonEmpty(item.imageUrl)) heavy.imageUrl = item.imageUrl;
        if (isNonEmpty(item.cutoutUrl)) heavy.cutoutUrl = item.cutoutUrl;
        if (isNonEmpty(item.originalUrl)) heavy.originalUrl = item.originalUrl;
        if (heavy.imageUrl || heavy.cutoutUrl || heavy.originalUrl) heavyById.set(item.id, heavy);
    }
    if (heavyById.size === 0) return currentWardrobe;

    let changed = false;
    const next = currentWardrobe.map((item) => {
        const heavy = heavyById.get(item.id);
        if (!heavy) return item;
        // current に欠けている heavy 値だけを cached から補う（既存値・undefined は触らない）。
        const patch: Partial<WardrobeItem> = {};
        if (!isNonEmpty(item.imageUrl) && heavy.imageUrl) patch.imageUrl = heavy.imageUrl;
        if (!isNonEmpty(item.cutoutUrl) && heavy.cutoutUrl) patch.cutoutUrl = heavy.cutoutUrl;
        if (!isNonEmpty(item.originalUrl) && heavy.originalUrl) patch.originalUrl = heavy.originalUrl;
        if (Object.keys(patch).length === 0) return item;
        changed = true;
        return { ...item, ...patch };
    });
    return changed ? next : currentWardrobe;
}

/**
 * Fix（写真消失の停止・2026-05-31）: revision-aware remote-adopt で remote(server) を採用する際に、
 * prev(IDB 復元済) の **heavy 画像フィールド** を保持して合成する pure helper。
 *
 * 背景:
 *   - server snapshot は `createPortableStateSnapshot → stripHeavyImageUrls` で送られるため
 *     imageUrl / cutoutUrl / originalUrl が **全く無い**（画像の正本は IDB のみ）。
 *   - revision-aware fix で remote が新しいとき adopt するようになったが、 そのまま
 *     `finalizeSavedState(remoteState)` で state を置換すると、 IDB から復元されていた画像が消える
 *     （= reload 後に My-Style / /plan の写真が白抜き化）。
 *   - そこで remote の wardrobe を base にして、 prev(IDB 復元済) の画像で **id 一致**だけを補完する。
 *
 * 不変原則:
 *   - **削除は remote に従う**: remote に無い id は復活させない（id 一致のみ補完）。
 *   - **画像は prev から保持**: 同じ id の item は imageUrl/cutoutUrl/originalUrl を prev から戻す。
 *   - **metadata は remote 優先**: name / category / colorHex 等は remote の値を使う（最新版が server）。
 *   - **_revision は remote のものを採用**: rawSetState 経由なので setState wrapper の bump はかからない。
 *   - pure: 入力を mutate しない。 補完すべき画像が無ければ `finalizeSavedState(remoteState)` と同等を返す。
 */
export function mergeRemoteStateWithLocalImages(
    remoteState: SavedState,
    prevWardrobe: WardrobeItem[],
): SavedState {
    const finalized = finalizeSavedState(remoteState);
    const wardrobe = mergeRestoredWardrobeImageFields(finalized.wardrobe, prevWardrobe);
    return wardrobe === finalized.wardrobe ? finalized : { ...finalized, wardrobe };
}

/**
 * Fix（IDB 正本化・2026-05-31）: mount-once restore で IDB cache を current の正本として採用する pure helper。
 *
 * 背景:
 *   - 旧設計は branch3 を「prev(localStorage 由来) を base に cached(IDB) の画像を id 一致で patch」していた。
 *   - 一方で PREVIOUS_BACKUP_STORAGE_KEY="culcept_my_style_v2_backup" を loadStateBundle が読むため、
 *     localStorage v3 が quota で消えると **v2 時代の古い 24件 (画像込み、stripHeavyImageUrls 適用前)** が
 *     initialBundle になり得る。 prev の id 集合 ≠ IDB の id 集合（新規 add の id）。
 *   - 結果 1: 旧 merge は id 不一致で何も patch しない → state = prev(v2_backup 24件 古い id)
 *   - 結果 2: その state が persist で IDB を上書き → IDB が古い state で壊れる
 *   - 結果 3: remote-load が adopt しても prev の画像（古い id）と remote(server 新しい id)の id 不一致で
 *     画像補完が効かず、 写真が reload 後に白抜きで残る。
 *
 * 設計:
 *   - **IDB cache が current の正本**（id 集合・rev・画像）。 persist effect で常に最新が IDB に書かれる
 *     ため、 IDB こそが信頼できる。
 *   - cached を base にして、 prev の同 id のみで画像補完（IDB が稀に画像欠落のケースの保険）。
 *   - 削除は cached に従う（cached に無い id は復活させない）。
 *   - rev は cached を採用 — caller は **rawSetState** で適用し、 setState wrapper の rev bump を避けること。
 *   - cached.wardrobe が空 → `null`（caller は prev を維持）。
 */
export function mergeCachedStateWithLocalImages(
    cachedRaw: unknown,
    prevWardrobe: WardrobeItem[],
): SavedState | null {
    if (!cachedRaw || typeof cachedRaw !== "object") return null;
    const normalized = normalizeSavedState(cachedRaw);
    if (normalized.wardrobe.length === 0) return null;
    const wardrobe = mergeRestoredWardrobeImageFields(normalized.wardrobe, prevWardrobe);
    return wardrobe === normalized.wardrobe ? normalized : { ...normalized, wardrobe };
}

/**
 * Legacy field names that are fully derivable from canonical fields
 * (styleSelections, iam, iseek, ibecome, etc.) via finalizeSavedState.
 * Stripping them from the portable snapshot saves significant bytes
 * without information loss — loadStateBundle normalizes on load.
 */
const LEGACY_SNAPSHOT_KEYS: ReadonlySet<string> = new Set([
    "styles",
    "primaryLanes",
    "secondaryLanes",
    "exploringLanes",
    "iAmLanes",
    "favoriteElements",
    "avoidElements",
    "likedElements",
    "dislikedElements",
    "moodKeywords",
    "silhouettePrefs",
    "colorTones",
    "materialPrefs",
    "desiredImpressions",
    "iAmNote",
    "iSeekNote",
    "seekPersonas",
    "seekCategories",
    "seekSubcategories",
]);

export function createPortableStateSnapshot(state: SavedState) {
    const normalized = normalizeSavedState(state);

    // Build snapshot without legacy duplicate fields
    const snapshot: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(normalized)) {
        if (!LEGACY_SNAPSHOT_KEYS.has(key)) {
            snapshot[key] = value;
        }
    }

    // Overwrite wardrobe with image-stripped version
    snapshot.wardrobe = stripHeavyImageUrls(normalized.wardrobe);

    return snapshot as Omit<SavedState, "styles" | "primaryLanes" | "secondaryLanes" | "exploringLanes" | "iAmLanes" | "favoriteElements" | "avoidElements" | "likedElements" | "dislikedElements" | "moodKeywords" | "silhouettePrefs" | "colorTones" | "materialPrefs" | "desiredImpressions" | "iAmNote" | "iSeekNote" | "seekPersonas" | "seekCategories" | "seekSubcategories">;
}

export type LoadBundle = {
    state: SavedState;
    recoveryMessage: string | null;
};

export function loadStateBundle(): LoadBundle {
    const currentRaw = readJsonStorage(STORAGE_KEY) ?? readJsonStorage(PREVIOUS_STORAGE_KEY);
    const current = normalizeSavedState(currentRaw);
    // M1-2A (2026-06-01): PREVIOUS_BACKUP_STORAGE_KEY (= "culcept_my_style_v2_backup") の読込を停止。
    //   D2 で確定した「v2_backup race」の素因（quota 失敗で v3/v3_backup 消失 → 古い v2_backup を読んで
    //   復活 → 自動 persist が IDB を v2 時代 state で上書き）を構造的に消す。 IDB 正本化 (D2-3, a77c8933)
    //   と組み合わせて、 削除済 item が「過去の v2 snapshot」由来で蘇る経路を断つ。
    //   v2 本体 (PREVIOUS_STORAGE_KEY = culcept_my_style_v2) は legacy migration source として残す
    //   （CEO 補正：M1-2B で別途判断）。
    const backupRaw = readJsonStorage(BACKUP_STORAGE_KEY);
    const backup = backupRaw ? normalizeSavedState(backupRaw) : null;
    const merged = mergeWithBackup(current, backup);

    // If revision > 0, the user has actively used my-style — respect their state even if empty.
    // Only fall through to legacy when revision is 0 (never-used) AND state is empty.
    const hasRevision = (merged.state._revision ?? 0) > 0;
    if (hasRevision || hasMeaningfulState(merged.state)) {
        return {
            state: merged.state,
            recoveryMessage: merged.usedBackup ? "my-style のバックアップを補完して復元しました。" : null,
        };
    }

    const legacy = normalizeLegacyState(readJsonStorage(LEGACY_STORAGE_KEY));
    if (legacy) {
        return {
            state: legacy,
            recoveryMessage: "旧バージョンの my-style を読み込みました。",
        };
    }

    return { state: current, recoveryMessage: null };
}
