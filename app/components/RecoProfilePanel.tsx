"use client";

import * as React from "react";

type TopTag = { tag: string; score: number };
type Profile = { topTags?: TopTag[] } | null;

export default function RecoProfilePanel() {
    const [profile, setProfile] = React.useState<Profile>(null);

    React.useEffect(() => {
        fetch("/api/recommendations/profile", { cache: "no-store" })
            .then((r) => r.json())
            .then((d) => setProfile(d?.profile ?? null))
            .catch((e) => console.warn("[RecoProfilePanel] fetch failed:", e));
    }, []);

    if (!profile?.topTags?.length) return null;

    return (
        <div className="space-y-2">
            <h3 className="font-extrabold">あなたのスタイル傾向</h3>

            {profile.topTags.map(({ tag, score }) => {
                const pct = Math.max(0, Math.min(100, score * 10));
                return (
                    <div key={tag} className="flex items-center gap-2">
                        <span className="text-sm w-28 truncate">{tag}</span>

                        <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500" style={{ width: `${pct}%` }} />
                        </div>

                        <span className="text-xs text-zinc-500 w-10 text-right">
                            {score}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}
