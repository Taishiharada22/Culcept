// app/drops/new/page.tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import NewDropForm from "./NewDropForm";
import { createDropAction } from "./actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SP = Record<string, string | string[] | undefined>;

function spStr(v: unknown) {
    return String(Array.isArray(v) ? v[0] : v ?? "").trim();
}

function addQuery(url: string, params: Record<string, string | null | undefined>) {
    const qs = Object.entries(params)
        .filter(([, v]) => v != null && String(v).trim() !== "")
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join("&");
    if (!qs) return url;
    return url + (url.includes("?") ? "&" : "?") + qs;
}

type PageProps = {
    searchParams?: Promise<SP>;
};

export default async function NewDropPage({ searchParams }: PageProps) {
    const sp = (await searchParams) ?? {};
    const imp = spStr(sp.imp ?? sp.impressionId ?? sp.impression_id) || null;

    const supabase = await supabaseServer();
    const { data } = await supabase.auth.getUser();
    const user = data?.user;

    if (!user) {
        const nextUrl = addQuery("/drops/new", { imp });
        redirect(`/login?next=${encodeURIComponent(nextUrl)}`);
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-orange-50/20 to-purple-50/20">
            {/* Hero Header */}
            <div className="border-b-2 border-slate-200 bg-gradient-to-r from-white via-orange-50/30 to-purple-50/30 py-12">
                <div className="mx-auto max-w-4xl px-6">
                    <div className="flex items-end justify-between gap-6">
                        <div>
                            <h1
                                className="text-6xl font-black tracking-tight text-slate-900 mb-3"
                                style={{ fontFamily: "'Cormorant Garamond', serif" }}
                            >
                                New Drop
                            </h1>
                            <div className="text-sm font-bold text-slate-600">新しい商品を出品する</div>
                        </div>

                        <Link
                            href={addQuery("/shops/me", { imp })}
                            className="rounded-xl bg-white border-2 border-slate-300 px-6 py-3 text-sm font-black text-slate-700 shadow-lg transition-all duration-200 hover:shadow-xl hover:scale-105 no-underline"
                        >
                            ← Back to Seller
                        </Link>
                    </div>
                </div>
            </div>

            {/* Form */}
            <div className="mx-auto max-w-4xl px-6 py-12">
                <div className="rounded-3xl border-2 border-slate-200 bg-white p-8 shadow-2xl">
                    <NewDropForm action={createDropAction as any} />
                </div>
            </div>
        </div>
    );
}
