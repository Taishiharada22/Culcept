// app/feed/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import ActivityFeed from "@/components/activities/ActivityFeed";
import SwipeFeed from "@/components/feed/SwipeFeed";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;

function spStr(sp: SP, key: string) {
    const v = sp[key];
    if (Array.isArray(v)) return v[0] ?? "";
    return typeof v === "string" ? v : "";
}

export default async function FeedPage({ searchParams }: { searchParams: Promise<SP> }) {
    const sp = await searchParams;
    const tab = (spStr(sp, "tab") || "activity").toLowerCase(); // activity | swipe

    const supabase = await supabaseServer();
    const { data: auth, error: authErr } = await supabase.auth.getUser();

    if (authErr || !auth?.user) {
        redirect(`/login?next=/feed${tab !== "activity" ? `?tab=${encodeURIComponent(tab)}` : ""}`);
    }

    // Activityタブの時だけ取得（Swipeタブでは不要）
    let activities: any[] = [];
    let activityError: string | null = null;

    if (tab !== "swipe") {
        const { data, error } = await supabase.from("v_following_feed").select("*").limit(50);
        if (error) activityError = error.message;
        activities = data || [];
    }

    return (
        <div className="max-w-4xl mx-auto px-6 py-10">
            <div className="flex items-end justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-4xl font-black">Feed</h1>
                    <p className="text-sm text-gray-600 mt-1">Activity / Swipe</p>
                </div>

                <div className="flex gap-2">
                    <Link
                        href="/feed?tab=activity"
                        className={`rounded-full border px-4 py-2 text-sm font-semibold ${tab !== "swipe" ? "bg-black text-white border-black" : "bg-white"
                            }`}
                    >
                        Activity
                    </Link>
                    <Link
                        href="/feed?tab=swipe"
                        className={`rounded-full border px-4 py-2 text-sm font-semibold ${tab === "swipe" ? "bg-black text-white border-black" : "bg-white"
                            }`}
                    >
                        Swipe
                    </Link>
                </div>
            </div>

            {tab === "swipe" ? (
                <SwipeFeed />
            ) : activityError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
                    {activityError}
                </div>
            ) : (
                <ActivityFeed activities={activities || []} />
            )}
        </div>
    );
}
