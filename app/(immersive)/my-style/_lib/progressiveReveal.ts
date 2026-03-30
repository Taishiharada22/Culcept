/**
 * 段階的開示 — Progressive Revelation Engine
 *
 * Lock deeper insights behind data thresholds.
 * Not gamification, but honest "we need more data to see this."
 */

import type { SavedState } from "./types";
import type { SwipeLearningState } from "./swipeLearningAxes";
import { getCompletedSessions } from "./contradictionDialogue";

/* ── Types ── */

export type RequirementType =
    | "wardrobe_count"
    | "wear_logs"
    | "observation_logs"
    | "swipe_phases"
    | "identity_tags"
    | "setups"
    | "days_active"
    | "contradiction_sessions";

export interface RevealRequirement {
    type: RequirementType;
    current: number;
    required: number;
    label: string;
}

export interface RevealableInsight {
    id: string;
    title: string;
    description: string;
    category: "pattern" | "prediction" | "deep_self" | "evolution" | "relationship";
    requirements: RevealRequirement[];
    currentProgress: number;
    isUnlocked: boolean;
    unlockedAt?: string;
    content?: string;
}

const REVEAL_STORAGE_KEY = "culcept_progressive_reveal_v1";

/* ── Tier definitions ── */

interface TierDefinition {
    id: string;
    title: string;
    description: string;
    category: RevealableInsight["category"];
    requirements: Array<{ type: RequirementType; required: number; label: string }>;
    generateContent: (state: SavedState, swipe: SwipeLearningState | null) => string;
}

const REVEAL_TIERS: TierDefinition[] = [
    {
        id: "basic_dna",
        title: "\u30B9\u30BF\u30A4\u30EBDNA\u306E\u8F2A\u90ED",
        description: "\u3042\u306A\u305F\u306E\u30B9\u30BF\u30A4\u30EB\u306E\u5927\u307E\u304B\u306A\u8F2A\u90ED\u304C\u898B\u3048\u3066\u304D\u307E\u3059",
        category: "pattern",
        requirements: [
            { type: "wardrobe_count", required: 3, label: "\u30EF\u30FC\u30C9\u30ED\u30FC\u30D6\u306B3\u30A2\u30A4\u30C6\u30E0\u767B\u9332" },
        ],
        generateContent: (state) => {
            const cats = new Set(state.wardrobe.map((i) => i.category));
            const topColor = state.colorPrefs.dominant[0]?.value ?? "\u4E0D\u660E";
            return `\u3042\u306A\u305F\u306E\u30EF\u30FC\u30C9\u30ED\u30FC\u30D6\u306F${cats.size}\u30AB\u30C6\u30B4\u30EA\u306B\u5E83\u304C\u308A\u3001\u300C${topColor}\u300D\u304C\u57FA\u8ABF\u8272\u3067\u3059\u3002\u3053\u3053\u304B\u3089\u3042\u306A\u305F\u306EDNA\u306E\u89E3\u8AAD\u304C\u59CB\u307E\u308A\u307E\u3059\u3002`;
        },
    },
    {
        id: "color_tendency",
        title: "\u7121\u610F\u8B58\u306E\u8272\u5F69\u50BE\u5411",
        description: "\u3042\u306A\u305F\u304C\u7121\u610F\u8B58\u306B\u9078\u3093\u3067\u3044\u308B\u8272\u306E\u30D1\u30BF\u30FC\u30F3\u304C\u898B\u3048\u3066\u304D\u307E\u3059",
        category: "pattern",
        requirements: [
            { type: "wardrobe_count", required: 7, label: "\u30EF\u30FC\u30C9\u30ED\u30FC\u30D6\u306B7\u30A2\u30A4\u30C6\u30E0\u767B\u9332" },
            { type: "days_active", required: 3, label: "3\u65E5\u9593\u30A2\u30AF\u30C6\u30A3\u30D6" },
        ],
        generateContent: (state) => {
            const colors = state.colorPrefs.dominant.slice(0, 3);
            if (colors.length === 0) return "\u307E\u3060\u8272\u5F69\u30C7\u30FC\u30BF\u304C\u4E0D\u8DB3\u3057\u3066\u3044\u307E\u3059";
            const colorNames = colors.map((c) => c.value).join("\u3001");
            const ratio = Math.round((colors.reduce((s, c) => s + c.count, 0) / state.wardrobe.length) * 100);
            return `\u3042\u306A\u305F\u306E\u8272\u5F69\u306E\u4E2D\u5FC3\u306F\u300C${colorNames}\u300D\u3067\u3001\u5168\u4F53\u306E${ratio}%\u3092\u5360\u3081\u3066\u3044\u307E\u3059\u3002\u3053\u306E\u8272\u9078\u3073\u306B\u306F\u3001\u3042\u306A\u305F\u306E\u5FC3\u7406\u7684\u306A\u5B89\u5168\u57FA\u5730\u304C\u53CD\u6620\u3055\u308C\u3066\u3044\u307E\u3059\u3002`;
        },
    },
    {
        id: "decision_pattern",
        title: "\u5224\u65AD\u30D1\u30BF\u30FC\u30F3\u306E\u6CD5\u5247",
        description: "\u3042\u306A\u305F\u304C\u670D\u3092\u9078\u3076\u3068\u304D\u306E\u5224\u65AD\u57FA\u6E96\u304C\u660E\u3089\u304B\u306B\u306A\u308A\u307E\u3059",
        category: "pattern",
        requirements: [
            { type: "wardrobe_count", required: 10, label: "\u30EF\u30FC\u30C9\u30ED\u30FC\u30D6\u306B10\u30A2\u30A4\u30C6\u30E0\u767B\u9332" },
            { type: "observation_logs", required: 5, label: "5\u56DE\u306E\u89B3\u5BDF\u8A18\u9332" },
        ],
        generateContent: (state, swipe) => {
            const hasSwipe = swipe && swipe.totalSwipes >= 10;
            const core = state.styleSelections.filter((s) => s.bucket === "core");
            const coreLabel = core.map((s) => s.laneCode).join("\u30FB") || "\u672A\u8A2D\u5B9A";
            if (hasSwipe) {
                const topAxes = Object.entries(swipe.axes)
                    .filter(([, v]) => v.confidence > 0.4)
                    .sort((a, b) => Math.abs(b[1].value) - Math.abs(a[1].value))
                    .slice(0, 2);
                const axisDesc = topAxes.map(([k, v]) => `${k}: ${v.value > 0 ? "+\u5074" : "-\u5074"}`).join("\u3001");
                return `\u3042\u306A\u305F\u306E\u5224\u65AD\u306F\u300C${coreLabel}\u300D\u3092\u8EF8\u306B\u3001${axisDesc}\u306E\u65B9\u5411\u3078\u50BE\u304F\u50BE\u5411\u304C\u3042\u308A\u307E\u3059\u3002\u610F\u8B58\u7684\u306A\u9078\u629E\u3068\u76F4\u611F\u306E\u6574\u5408\u6027\u304C\u898B\u3048\u59CB\u3081\u3066\u3044\u307E\u3059\u3002`;
            }
            return `\u3042\u306A\u305F\u306E\u5224\u65AD\u306E\u4E2D\u5FC3\u306F\u300C${coreLabel}\u300D\u3067\u3059\u3002\u30B9\u30EF\u30A4\u30D7\u30C7\u30FC\u30BF\u304C\u589E\u3048\u308B\u3068\u3001\u3055\u3089\u306B\u7CBE\u5BC6\u306A\u30D1\u30BF\u30FC\u30F3\u304C\u898B\u3048\u3066\u304D\u307E\u3059\u3002`;
        },
    },
    {
        id: "hidden_preference",
        title: "\u96A0\u3055\u308C\u305F\u597D\u307F",
        description: "\u610F\u8B58\u3057\u3066\u3044\u306A\u3044\u3001\u3067\u3082\u78BA\u304B\u306B\u5B58\u5728\u3059\u308B\u597D\u307F\u304C\u898B\u3048\u3066\u304D\u307E\u3059",
        category: "deep_self",
        requirements: [
            { type: "swipe_phases", required: 2, label: "\u30B9\u30EF\u30A4\u30D7\u5B66\u7FD2\u30D5\u30A7\u30FC\u30BA2\u5B8C\u4E86" },
            { type: "observation_logs", required: 10, label: "10\u56DE\u306E\u89B3\u5BDF\u8A18\u9332" },
        ],
        generateContent: (state, swipe) => {
            if (!swipe) return "\u30B9\u30EF\u30A4\u30D7\u30C7\u30FC\u30BF\u304C\u4E0D\u8DB3\u3057\u3066\u3044\u307E\u3059";
            const topLikes = Object.entries(swipe.tagLikes)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(([tag]) => tag);
            const stated = state.iam.likedTags.map((t) => t.code);
            const hidden = topLikes.filter((t) => !stated.includes(t));
            if (hidden.length > 0) {
                return `\u30B9\u30EF\u30A4\u30D7\u304B\u3089\u300C${hidden.join("\u3001")}\u300D\u3078\u306E\u5F37\u3044\u60F9\u304B\u308C\u304C\u691C\u51FA\u3055\u308C\u307E\u3057\u305F\u304C\u3001\u81EA\u5DF1\u7533\u544A\u306B\u306F\u542B\u307E\u308C\u3066\u3044\u307E\u305B\u3093\u3002\u3053\u308C\u304C\u3042\u306A\u305F\u306E\u300C\u96A0\u3055\u308C\u305F\u597D\u307F\u300D\u3067\u3059\u3002`;
            }
            return `\u3042\u306A\u305F\u306E\u610F\u8B58\u3068\u76F4\u611F\u306F\u9AD8\u3044\u4E00\u8CAB\u6027\u3092\u793A\u3057\u3066\u3044\u307E\u3059\u3002\u81EA\u5DF1\u7406\u89E3\u304C\u6DF1\u3044\u8A3C\u62E0\u3067\u3059\u3002`;
        },
    },
    {
        id: "prediction_unlock",
        title: "\u660E\u65E5\u306E\u3042\u306A\u305F\u3092\u4E88\u6E2C",
        description: "\u3042\u306A\u305F\u306E\u884C\u52D5\u30D1\u30BF\u30FC\u30F3\u304B\u3089\u660E\u65E5\u306E\u30B9\u30BF\u30A4\u30EB\u3092\u4E88\u6E2C\u3057\u307E\u3059",
        category: "prediction",
        requirements: [
            { type: "wardrobe_count", required: 15, label: "\u30EF\u30FC\u30C9\u30ED\u30FC\u30D6\u306B15\u30A2\u30A4\u30C6\u30E0\u767B\u9332" },
            { type: "wear_logs", required: 20, label: "20\u56DE\u306E\u7740\u7528\u8A18\u9332" },
            { type: "identity_tags", required: 10, label: "10\u500B\u306E\u30A2\u30A4\u30C7\u30F3\u30C6\u30A3\u30C6\u30A3\u30BF\u30B0" },
        ],
        generateContent: (state) => {
            const day = new Date().getDay();
            const moods = state.setups.flatMap((s) => s.moodTags);
            const topMood = moods.length > 0
                ? [...new Map(moods.map((m) => [m, moods.filter((x) => x === m).length])).entries()]
                    .sort((a, b) => b[1] - a[1])[0]?.[0] ?? "calm"
                : "calm";
            const dayLabel = ["\u65E5\u66DC\u65E5", "\u6708\u66DC\u65E5", "\u706B\u66DC\u65E5", "\u6C34\u66DC\u65E5", "\u6728\u66DC\u65E5", "\u91D1\u66DC\u65E5", "\u571F\u66DC\u65E5"][day];
            return `${dayLabel}\u306E\u3042\u306A\u305F\u306F\u300C${topMood}\u300D\u306A\u6C17\u5206\u3067\u670D\u3092\u9078\u3076\u50BE\u5411\u304C\u3042\u308A\u307E\u3059\u3002\u904E\u53BB\u306E\u30D1\u30BF\u30FC\u30F3\u304B\u3089\u3001\u660E\u65E5\u3082\u540C\u69D8\u306E\u6C17\u5206\u3067\u59CB\u307E\u308B\u53EF\u80FD\u6027\u304C\u9AD8\u3044\u3067\u3059\u3002`;
        },
    },
    {
        id: "deep_self",
        title: "\u6DF1\u5C64\u306E\u81EA\u5DF1\u50CF",
        description: "\u3042\u306A\u305F\u306E\u30B9\u30BF\u30A4\u30EB\u306E\u6839\u5E95\u306B\u3042\u308B\u6DF1\u5C64\u5FC3\u7406\u304C\u898B\u3048\u3066\u304D\u307E\u3059",
        category: "deep_self",
        requirements: [
            { type: "days_active", required: 30, label: "30\u65E5\u9593\u30A2\u30AF\u30C6\u30A3\u30D6" },
            { type: "contradiction_sessions", required: 5, label: "5\u56DE\u306E\u77DB\u76FE\u30C0\u30A4\u30A2\u30ED\u30B0\u5B8C\u4E86" },
        ],
        generateContent: (state) => {
            const liked = state.iam.likedTags.length;
            const disliked = state.iam.dislikedTags.length;
            const becomeCount = state.ibecome.pairs.length;
            if (liked > disliked * 2) {
                return `\u3042\u306A\u305F\u306F\u300C\u907F\u3051\u308B\u300D\u3088\u308A\u300C\u8FD1\u3065\u304F\u300D\u3053\u3068\u3067\u81EA\u5206\u3092\u5B9A\u7FA9\u3059\u308B\u4EBA\u3067\u3059\u3002\u30DD\u30B8\u30C6\u30A3\u30D6\u306A\u81EA\u5DF1\u50CF\u304C\u3042\u306A\u305F\u306E\u6839\u5E95\u306B\u3042\u308A\u307E\u3059\u3002\u5909\u5316\u306E\u30D1\u30BF\u30FC\u30F3\u304C${becomeCount}\u4EF6\u78BA\u8A8D\u3055\u308C\u3001\u300C\u6210\u9577\u3057\u7D9A\u3051\u308B\u81EA\u5206\u300D\u3078\u306E\u6E21\u671B\u304C\u898B\u3048\u307E\u3059\u3002`;
            }
            return `\u3042\u306A\u305F\u306F\u300C\u3053\u308C\u3060\u3051\u306F\u5ACC\u300D\u3068\u3044\u3046\u5883\u754C\u7DDA\u304C\u660E\u78BA\u306A\u4EBA\u3067\u3059\u3002\u305D\u306E\u58C1\u304C\u3042\u306A\u305F\u3092\u5B88\u308A\u3001\u540C\u6642\u306B\u300C\u672C\u5F53\u306E\u597D\u304D\u300D\u3092\u969B\u7ACB\u305F\u305B\u3066\u3044\u307E\u3059\u3002`;
        },
    },
    {
        id: "metamorphosis_law",
        title: "\u5909\u5BB9\u306E\u6CD5\u5247",
        description: "\u3042\u306A\u305F\u306E\u30B9\u30BF\u30A4\u30EB\u304C\u3069\u3046\u5909\u5316\u3057\u3066\u304D\u305F\u304B\u3001\u305D\u306E\u6CD5\u5247\u304C\u898B\u3048\u3066\u304D\u307E\u3059",
        category: "evolution",
        requirements: [
            { type: "days_active", required: 60, label: "60\u65E5\u9593\u30A2\u30AF\u30C6\u30A3\u30D6" },
            { type: "observation_logs", required: 50, label: "50\u56DE\u306E\u89B3\u5BDF\u8A18\u9332" },
            { type: "setups", required: 10, label: "10\u500B\u306E\u30BB\u30C3\u30C8\u30A2\u30C3\u30D7\u4FDD\u5B58" },
        ],
        generateContent: (state) => {
            const snapshots = state.timelineSnapshots;
            if (snapshots.length >= 2) {
                const oldest = snapshots[snapshots.length - 1];
                const newest = snapshots[0];
                const oldLanes = oldest.primaryLanes.join("\u30FB") || "\u672A\u8A2D\u5B9A";
                const newLanes = newest.primaryLanes.join("\u30FB") || "\u672A\u8A2D\u5B9A";
                return `\u3042\u306A\u305F\u306E\u30B9\u30BF\u30A4\u30EB\u306F\u300C${oldLanes}\u300D\u304B\u3089\u300C${newLanes}\u300D\u3078\u3068\u5909\u5316\u3057\u307E\u3057\u305F\u3002\u3053\u306E\u5909\u5316\u306E\u4E2D\u306B\u3001\u3042\u306A\u305F\u306E\u6210\u9577\u306E\u6CD5\u5247\u304C\u96A0\u3055\u308C\u3066\u3044\u307E\u3059\u3002`;
            }
            return `60\u65E5\u9593\u306E\u89B3\u5BDF\u304B\u3089\u3001\u3042\u306A\u305F\u306E\u30B9\u30BF\u30A4\u30EB\u306F\u5E38\u306B\u5FAE\u7D30\u306B\u5909\u5316\u3057\u7D9A\u3051\u3066\u3044\u307E\u3059\u3002\u305D\u306E\u5909\u5316\u306E\u30EA\u30BA\u30E0\u304C\u300C\u5909\u5BB9\u306E\u6CD5\u5247\u300D\u3067\u3059\u3002`;
        },
    },
];

/* ── Compute current data counts ── */

function computeCurrentValues(
    state: SavedState,
    swipeState: SwipeLearningState | null,
): Record<RequirementType, number> {
    const wearLogCount = state.wearHistory
        ? Object.values(state.wearHistory).reduce((s, r) => s + r.count, 0)
        : 0;

    const identityTags =
        state.iam.likedTags.length +
        state.iam.dislikedTags.length +
        state.iam.desiredImpressions.length +
        state.iam.naturalSelfTags.length +
        state.iseek.attractedWorldviews.length +
        state.iseek.attractedElements.length;

    // Observation logs = swipe total + setup memos + identity tags
    const observationLogs =
        (swipeState?.totalSwipes ?? 0) +
        state.setups.filter((s) => s.memory?.note).length;

    // Days active estimate from timestamps
    const allDates = new Set<string>();
    for (const item of state.wardrobe) {
        if (item.addedAt) allDates.add(item.addedAt.slice(0, 10));
    }
    for (const setup of state.setups) {
        allDates.add(setup.createdAt.slice(0, 10));
    }
    if (swipeState?.lastSwipedAt) {
        allDates.add(swipeState.lastSwipedAt.slice(0, 10));
    }

    const contradictionSessions = getCompletedSessions().length;

    return {
        wardrobe_count: state.wardrobe.length,
        wear_logs: wearLogCount,
        observation_logs: observationLogs,
        swipe_phases: swipeState?.currentPhase ?? 0,
        identity_tags: identityTags,
        setups: state.setups.length,
        days_active: allDates.size,
        contradiction_sessions: contradictionSessions,
    };
}

/* ── Load/save unlock state ── */

type UnlockState = Record<string, { unlockedAt: string; content: string }>;

function loadUnlockState(): UnlockState {
    if (typeof window === "undefined") return {};
    try {
        const raw = localStorage.getItem(REVEAL_STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

function saveUnlockState(unlockState: UnlockState): void {
    if (typeof window === "undefined") return;
    try {
        localStorage.setItem(REVEAL_STORAGE_KEY, JSON.stringify(unlockState));
    } catch {
        // silent fail
    }
}

/* ── Public API ── */

/**
 * Compute reveal status for all tiers.
 */
export function computeRevealStatus(
    state: SavedState,
    swipeState: SwipeLearningState | null,
): RevealableInsight[] {
    const currentValues = computeCurrentValues(state, swipeState);
    const unlockState = loadUnlockState();

    return REVEAL_TIERS.map((tier) => {
        const requirements: RevealRequirement[] = tier.requirements.map(
            (req) => ({
                type: req.type,
                current: currentValues[req.type],
                required: req.required,
                label: req.label,
            }),
        );

        const progress =
            requirements.length > 0
                ? requirements.reduce(
                      (sum, r) => sum + Math.min(1, r.current / r.required),
                      0,
                  ) / requirements.length
                : 0;

        const isUnlocked = requirements.every(
            (r) => r.current >= r.required,
        );

        const existing = unlockState[tier.id];
        let content: string | undefined;
        let unlockedAt: string | undefined;

        if (isUnlocked) {
            if (existing) {
                content = existing.content;
                unlockedAt = existing.unlockedAt;
            } else {
                // Newly unlocked -- generate content and save
                content = tier.generateContent(state, swipeState);
                unlockedAt = new Date().toISOString();
                unlockState[tier.id] = { unlockedAt, content };
                saveUnlockState(unlockState);
            }
        }

        return {
            id: tier.id,
            title: tier.title,
            description: tier.description,
            category: tier.category,
            requirements,
            currentProgress: progress,
            isUnlocked,
            unlockedAt,
            content,
        };
    });
}

/**
 * Check for newly unlocked insights by comparing with previous status.
 */
export function checkNewUnlocks(
    previousStatus: RevealableInsight[],
    currentStatus: RevealableInsight[],
): RevealableInsight[] {
    const previousUnlocked = new Set(
        previousStatus.filter((i) => i.isUnlocked).map((i) => i.id),
    );

    return currentStatus.filter(
        (i) => i.isUnlocked && !previousUnlocked.has(i.id),
    );
}

/**
 * Get the next milestone insight to work toward.
 */
export function getNextMilestone(
    status: RevealableInsight[],
): {
    insight: RevealableInsight;
    closestRequirement: RevealRequirement;
} | null {
    const locked = status.filter((i) => !i.isUnlocked);
    if (locked.length === 0) return null;

    // Sort by progress (closest to unlock first)
    locked.sort((a, b) => b.currentProgress - a.currentProgress);

    const next = locked[0];
    // Find the requirement closest to being met
    const unmet = next.requirements.filter((r) => r.current < r.required);
    unmet.sort(
        (a, b) => b.current / b.required - a.current / a.required,
    );

    return {
        insight: next,
        closestRequirement: unmet[0] ?? next.requirements[0],
    };
}

/**
 * Get total unlock progress across all tiers.
 */
export function getOverallProgress(status: RevealableInsight[]): {
    unlocked: number;
    total: number;
    percentage: number;
} {
    const unlocked = status.filter((i) => i.isUnlocked).length;
    return {
        unlocked,
        total: status.length,
        percentage: status.length > 0 ? Math.round((unlocked / status.length) * 100) : 0,
    };
}
