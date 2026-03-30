/**
 * コンテクスト・ペルソナ — Persona Engine
 *
 * Builds persona profiles per context (romance/friend/cocreation/orbiter),
 * analyzes cross-persona commonalities, and suggests daily persona.
 */

import type { SavedState, SeekContextKey, StyleLaneCode, WardrobeItem } from "./types";
import { SEEK_CONTEXT_KEYS } from "./types";
import { getStyleLaneLabel } from "./catalog";

export type PersonaProfile = {
    contextKey: SeekContextKey;
    label: string;
    styleLanes: StyleLaneCode[];
    colorPalette: Array<{ value: string; hex: string }>;
    keyItemIds: string[];
    signature: string;
};

export type CrossPersonaAnalysis = {
    commonItems: string[];
    commonLanes: StyleLaneCode[];
    uniqueByPersona: Record<SeekContextKey, { lanes: StyleLaneCode[]; items: string[] }>;
    coreRatio: number; // 0-1: how much is shared vs unique
};

const PERSONA_LABELS: Record<SeekContextKey, string> = {
    romance: "ロマンス",
    friend: "フレンド",
    cocreation: "共創",
    orbiter: "オービター",
};

export function buildPersonaProfile(
    state: SavedState,
    context: SeekContextKey,
): PersonaProfile {
    const seekProfile = state.seek?.[context];
    const styleLanes = (seekProfile?.preferredLanes ?? []) as StyleLaneCode[];
    const colorPalette = seekProfile?.colorPalette ?? state.colorPrefs.dominant.slice(0, 4).map((c) => ({ value: c.value, hex: c.hex }));
    const keyItemIds = seekProfile?.keyItemIds ?? [];

    // Generate signature
    const laneLabels = styleLanes.slice(0, 2).map(getStyleLaneLabel);
    const signature = laneLabels.length > 0
        ? `${laneLabels.join(" × ")} で魅せる`
        : "まだ定義されていません";

    return {
        contextKey: context,
        label: PERSONA_LABELS[context],
        styleLanes,
        colorPalette,
        keyItemIds,
        signature,
    };
}

export function buildAllPersonaProfiles(state: SavedState): PersonaProfile[] {
    return SEEK_CONTEXT_KEYS.map((key) => buildPersonaProfile(state, key));
}

export function findCrossPersonaCommon(
    profiles: PersonaProfile[],
): CrossPersonaAnalysis {
    const allLanes = profiles.flatMap((p) => p.styleLanes);
    const allItems = profiles.flatMap((p) => p.keyItemIds);

    const laneCounts = new Map<string, number>();
    for (const lane of allLanes) {
        laneCounts.set(lane, (laneCounts.get(lane) ?? 0) + 1);
    }

    const itemCounts = new Map<string, number>();
    for (const item of allItems) {
        itemCounts.set(item, (itemCounts.get(item) ?? 0) + 1);
    }

    const commonLanes = [...laneCounts.entries()]
        .filter(([, count]) => count >= 2)
        .map(([lane]) => lane as StyleLaneCode);

    const commonItems = [...itemCounts.entries()]
        .filter(([, count]) => count >= 2)
        .map(([item]) => item);

    const uniqueByPersona: Record<string, { lanes: StyleLaneCode[]; items: string[] }> = {};
    for (const profile of profiles) {
        uniqueByPersona[profile.contextKey] = {
            lanes: profile.styleLanes.filter((l) => !commonLanes.includes(l)),
            items: profile.keyItemIds.filter((i) => !commonItems.includes(i)),
        };
    }

    const totalLanes = new Set(allLanes).size;
    const coreRatio = totalLanes > 0 ? commonLanes.length / totalLanes : 0;

    return {
        commonItems,
        commonLanes,
        uniqueByPersona: uniqueByPersona as CrossPersonaAnalysis["uniqueByPersona"],
        coreRatio,
    };
}

export function suggestPersonaForDay(dayOfWeek: number): SeekContextKey {
    // Mon-Fri → orbiter (work/general), Sat → cocreation, Sun → friend
    if (dayOfWeek === 6) return "cocreation";
    if (dayOfWeek === 0) return "friend";
    return "orbiter";
}
