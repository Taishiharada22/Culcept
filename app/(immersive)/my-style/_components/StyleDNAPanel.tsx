"use client";

import { useMemo, type ReactNode } from "react";
import { getStyleLaneLabel } from "../_lib/catalog";
import { buildMyStyleProfile, deriveMyStyleSignals } from "../_lib/state";
import type { SavedState } from "../_lib/types";

/* ─────────────────────── shared utils (inline) ─────────────────────── */

function cx(...values: Array<string | false | null | undefined>) {
    return values.filter(Boolean).join(" ");
}

function formatPercent(value: number) {
    return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

type SyncStatus = "idle" | "syncing" | "synced" | "error" | "unauthorized";

function formatDateLabel(value: string | null | undefined) {
    if (!value) return "未保存";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "未保存";
    return date.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
}

function getSyncLabel(syncStatus: SyncStatus, syncedAt: string | null) {
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

/* ─────────────────────── Badge (local copy) ─────────────────────── */

function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "ink" | "sky" | "emerald" | "amber" }) {
    const tones = {
        slate: "border-slate-200 bg-slate-50 text-slate-600",
        ink: "border-slate-800 bg-slate-900 text-white",
        sky: "border-sky-200 bg-sky-50 text-sky-700",
        emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
        amber: "border-amber-200 bg-amber-50 text-amber-700",
    };
    return <span className={cx("inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold tracking-wide", tones[tone])}>{children}</span>;
}

/* ─────────────────────── EvidenceMeter ─────────────────────── */

export function EvidenceMeter({
    label,
    value,
    detail,
    tone = "slate",
}: {
    label: string;
    value: number;
    detail: string;
    tone?: "slate" | "sky" | "emerald" | "amber";
}) {
    const tones = {
        slate: {
            text: "text-white",
            sub: "text-white/45",
            track: "bg-white/10",
            fill: "bg-white",
        },
        sky: {
            text: "text-sky-900",
            sub: "text-sky-600/70",
            track: "bg-sky-100",
            fill: "bg-sky-500",
        },
        emerald: {
            text: "text-emerald-900",
            sub: "text-emerald-600/70",
            track: "bg-emerald-100",
            fill: "bg-emerald-500",
        },
        amber: {
            text: "text-amber-900",
            sub: "text-amber-600/70",
            track: "bg-amber-100",
            fill: "bg-amber-500",
        },
    };
    const palette = tones[tone];

    return (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <div className={cx("text-[11px] font-bold uppercase tracking-[0.22em]", palette.sub)}>{label}</div>
                    <div className={cx("mt-1 text-sm font-bold", palette.text)}>{detail}</div>
                </div>
                <div className={cx("text-sm font-black", palette.text)}>{formatPercent(value)}</div>
            </div>
            <div className={cx("mt-3 h-2 overflow-hidden rounded-full", palette.track)}>
                <div className={cx("h-full rounded-full transition-all duration-500", palette.fill)} style={{ width: formatPercent(value) }} />
            </div>
        </div>
    );
}

/* ─────────────────────── StyleDNA ─────────────────────── */

export default function StyleDNA({ state, syncStatus, syncedAt }: { state: SavedState; syncStatus: SyncStatus; syncedAt: string | null }) {
    const derived = useMemo(() => deriveMyStyleSignals(state), [state]);
    const totalTags = state.iam.likedTags.length + state.iam.naturalSelfTags.length + state.iseek.attractedWorldviews.length;
    const syncLabel = getSyncLabel(syncStatus, syncedAt);

    return (
        <div>
            <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-300/60 bg-slate-50/92 p-3">
                    <div className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Core</div>
                    <div className="mt-1.5 text-[16px] font-bold text-slate-950">{derived.coreLanes.length > 0 ? derived.coreLanes.map(getStyleLaneLabel).join(" · ") : "未設定"}</div>
                    <p className="mt-1 text-[12px] text-slate-600">普段の自分を最も強く表す</p>
                </div>
                <div className="rounded-xl border border-sky-300/60 bg-sky-100/70 p-3">
                    <div className="text-[11px] font-bold uppercase tracking-widest text-sky-600">Rare</div>
                    <div className="mt-1.5 text-[16px] font-bold text-slate-950">{derived.rareLanes.length > 0 ? derived.rareLanes.map(getStyleLaneLabel).join(" · ") : "未設定"}</div>
                    <p className="mt-1 text-[12px] text-slate-600">時々強く前に出る自分</p>
                </div>
                <div className="rounded-xl border border-amber-300/60 bg-amber-100/70 p-3">
                    <div className="text-[11px] font-bold uppercase tracking-widest text-amber-600">Secret</div>
                    <div className="mt-1.5 text-[16px] font-bold text-slate-950">{derived.secretLanes.length > 0 ? derived.secretLanes.map(getStyleLaneLabel).join(" · ") : "未設定"}</div>
                    <p className="mt-1 text-[12px] text-slate-600">まだ言い切れない惹かれ</p>
                </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-[12px] text-slate-500">
                <span className="font-bold text-slate-700">{state.wardrobe.length}</span> アイテム
                <span className="text-slate-300">|</span>
                <span className="font-bold text-slate-700">{state.setups.length}</span> セットアップ
                <span className="text-slate-300">|</span>
                <span className="font-bold text-slate-700">{totalTags}</span> タグ
                {syncLabel ? (<><span className="text-slate-300">|</span><span>{syncLabel}</span></>) : null}
            </div>
        </div>
    );
}
