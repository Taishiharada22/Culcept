// app/saved/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function money(v: any) {
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    return new Intl.NumberFormat("ja-JP").format(n);
}

export default async function SavedPage() {
    const supabase = await supabaseServer();
    const { data } = await supabase.auth.getUser();
    const user = data?.user;
    if (!user) redirect("/login?next=/saved");

    const { data: acts } = await supabase
        .from("recommendation_actions")
        .select("id, created_at, impression_id, action, meta")
        .eq("user_id", user.id)
        .eq("action", "save")
        .order("created_at", { ascending: false })
        .limit(100);

    const impIds = (acts ?? [])
        .map((a: any) => String(a.impression_id ?? ""))
        .filter(Boolean);

    const { data: imps } = impIds.length
        ? await supabase
            .from("recommendation_impressions")
            .select("id, target_type, target_id, rec_type, explain, payload, created_at")
            .in("id", impIds)
        : { data: [] as any[] };

    const impMap = new Map<string, any>();
    for (const x of imps ?? []) impMap.set(String(x.id), x);

    const rows = (acts ?? []).map((a: any) => {
        const imp = impMap.get(String(a.impression_id));
        return { a, imp };
    });

    return (
        <div className="space-y-8">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold">Saved</h1>
                    <p className="text-sm text-neutral-600 mt-1">♡保存したもの</p>
                </div>
                <div className="flex gap-2">
                    <Link href="/start" className="rounded-xl border px-4 py-2 hover:bg-neutral-50">
                        Start
                    </Link>
                    <Link href="/drops" className="rounded-xl border px-4 py-2 hover:bg-neutral-50">
                        Products
                    </Link>
                </div>
            </div>

            {rows.length ? (
                <div className="grid gap-4 lg:grid-cols-2">
                    {rows.map(({ a, imp }: any) => {
                        const p = imp?.payload ?? {};
                        const t = String(imp?.target_type ?? "");
                        const dropId = String(p.id ?? imp?.target_id ?? "");
                        const shopSlug = String(p.shop_slug ?? "");
                        const title = String(p.title ?? p.kind ?? "(saved)");
                        const price = money(p.display_price ?? p.price);

                        const href =
                            t === "drop" && dropId ? `/drops/${dropId}` :
                                t === "shop" && shopSlug ? `/shops/${shopSlug}` :
                                    null;

                        return (
                            <div key={String(a.id)} className="rounded-2xl border bg-white p-5 space-y-3">
                                <div className="text-xs text-neutral-500">
                                    saved_at: {String(a.created_at ?? "")}
                                </div>

                                <div className="flex gap-4">
                                    <div className="h-20 w-20 rounded-xl bg-neutral-100 overflow-hidden shrink-0 flex items-center justify-center">
                                        {p.cover_image_url ? (
                                            <img src={String(p.cover_image_url)} alt="" className="h-full w-full object-cover" />
                                        ) : (
                                            <div className="text-xs font-semibold text-neutral-500">No Image</div>
                                        )}
                                    </div>

                                    <div className="min-w-0 space-y-1">
                                        <div className="font-semibold break-words">{title}</div>
                                        <div className="text-sm text-neutral-600 flex flex-wrap gap-x-3 gap-y-1">
                                            {p.brand ? <span>{p.brand}</span> : null}
                                            {p.size ? <span>Size: {p.size}</span> : null}
                                            {p.condition ? <span>{p.condition}</span> : null}
                                            {price ? <span>¥{price}</span> : null}
                                        </div>
                                        {imp?.explain ? <div className="text-xs text-neutral-500">理由: {String(imp.explain)}</div> : null}
                                        <div className="text-xs text-neutral-400">type: {t || "?"}</div>
                                    </div>
                                </div>

                                <div className="flex justify-end gap-2">
                                    {href ? (
                                        <Link href={href} className="rounded-xl bg-black text-white px-4 py-2 text-sm hover:opacity-90">
                                            開く
                                        </Link>
                                    ) : (
                                        <div className="text-sm text-neutral-500">リンク先が特定できない</div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="rounded-2xl border bg-white p-5 text-sm text-neutral-600">
                    まだ保存がない。<Link className="underline" href="/drops">/Products</Link> で ♡保存してみて。
                </div>
            )}
        </div>
    );
}
