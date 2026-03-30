import type { ReactNode } from "react";
import { TAG_LABELS } from "./presenceDefaults";
import type { Tab } from "./presenceTypes";

/* ── Navigation ── */
export { MAIN_NAV as NAV_ITEMS } from "@/lib/navigation";

/* ── Tabs ── */

export const TABS: { key: Tab; label: string; icon: string }[] = [
    { key: "mirror", label: "いまの像", icon: "🪞" },
    { key: "depth", label: "深層", icon: "🔮" },
    { key: "change", label: "変化", icon: "🦋" },
    { key: "relations", label: "関係", icon: "💫" },
    { key: "self", label: "わたし", icon: "✧" },
];

export const TAB_KEYS: Tab[] = TABS.map((t) => t.key);

/* ── Tone classes for TonePanel ── */

export type ToneKey = "violet" | "indigo" | "blue" | "emerald" | "amber" | "rose" | "slate";

export const TONE_CLASSES: Record<ToneKey, { light: string; dark: string }> = {
    violet: {
        light: "border-violet-200/80 bg-gradient-to-br from-violet-50 to-fuchsia-50",
        dark: "dark:border-violet-700/50 dark:bg-gradient-to-br dark:from-violet-950/60 dark:to-fuchsia-950/40",
    },
    indigo: {
        light: "border-indigo-200/80 bg-gradient-to-br from-indigo-50 to-violet-50",
        dark: "dark:border-indigo-700/50 dark:bg-gradient-to-br dark:from-indigo-950/60 dark:to-violet-950/40",
    },
    blue: {
        light: "border-sky-200/80 bg-gradient-to-br from-sky-50 to-cyan-50",
        dark: "dark:border-sky-700/50 dark:bg-gradient-to-br dark:from-sky-950/60 dark:to-cyan-950/40",
    },
    emerald: {
        light: "border-emerald-200/80 bg-gradient-to-br from-emerald-50 to-teal-50",
        dark: "dark:border-emerald-700/50 dark:bg-gradient-to-br dark:from-emerald-950/60 dark:to-teal-950/40",
    },
    amber: {
        light: "border-amber-200/80 bg-gradient-to-br from-amber-50 to-yellow-50",
        dark: "dark:border-amber-700/50 dark:bg-gradient-to-br dark:from-amber-950/60 dark:to-yellow-950/40",
    },
    rose: {
        light: "border-rose-200/80 bg-gradient-to-br from-rose-50 to-pink-50",
        dark: "dark:border-rose-700/50 dark:bg-gradient-to-br dark:from-rose-950/60 dark:to-pink-950/40",
    },
    slate: {
        light: "border-slate-200/90 bg-gradient-to-br from-slate-50 to-white",
        dark: "dark:border-slate-700/50 dark:bg-gradient-to-br dark:from-slate-900/60 dark:to-slate-800/40",
    },
};

/* ── Shared animation easing ── */

export const EASE_OUT_EXPO = [0.22, 1, 0.36, 1] as const;

/* ── Layout helpers ── */

export const GRID_2 = "grid gap-4 sm:grid-cols-2";
export const GRID_3 = "grid gap-4 sm:grid-cols-3";

/* ── Utilities ── */

export function cx(...values: Array<string | false | null | undefined>) {
    return values.filter(Boolean).join(" ");
}

export function uniq(values: string[]) {
    return Array.from(new Set(values.filter((v) => v.trim().length > 0)));
}

export function labelTag(value: string) {
    return TAG_LABELS[value] ?? value.replace(/_/g, " ");
}
