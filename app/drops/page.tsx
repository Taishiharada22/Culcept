// app/drops/page.tsx
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import DropCard from "@/app/drops/DropCard";
import { toggleSavedDropAction } from "@/app/_actions/saved";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;

function spStr(v: unknown) {
    return String(Array.isArray(v) ? v[0] : v ?? "").trim();
}

/** URLにクエリを足す（? があれば & で追記） */
function addQuery(url: string, params: Record<string, string | null | undefined>) {
    const qs = Object.entries(params)
        .filter(([, v]) => v != null && String(v).trim() !== "")
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join("&");
    if (!qs) return url;
    return url + (url.includes("?") ? "&" : "?") + qs;
}

export default async function DropsPage({ searchParams }: { searchParams?: Promise<SP> }) {
    const sp = (await searchParams) ?? {};
    const q = spStr(sp.q);
    const shop = spStr(sp.shop);

    // ✅ imp が無い導線でも計測したいなら生成（リンクで伝搬される）
    const impFromUrl = spStr(sp.imp || sp.impressionId || sp.impression_id) || null;
    const imp = impFromUrl || crypto.randomUUID();

    const supabase = await supabaseServer();

    const [{ data: auth }, { data, error }] = await Promise.all([
        supabase.auth.getUser(),
        (async () => {
            let query = supabase
                .from("v_drops_ranked_30d_v2")
                .select(
                    "id,title,brand,size,condition,price,cover_image_url,display_price,highest_bid_30d,sale_mode,is_auction_live,hot_score,shop_slug,shop_name_ja,shop_name_en,shop_avatar_url,shop_headline"
                )
                .order("hot_score", { ascending: false })
                .limit(90);

            if (shop) query = query.eq("shop_slug", shop);
            if (q) query = query.or(`title.ilike.%${q}%,brand.ilike.%${q}%`);

            return await query;
        })(),
    ]);

    const userId = auth?.user?.id ?? null;

    // Saved 初期状態（まとめて）
    const dropIds = (data ?? []).map((d: any) => d?.id).filter(Boolean) as string[];
    let savedSet = new Set<string>();

    if (userId && dropIds.length) {
        const { data: sd, error: sdErr } = await supabase
            .from("saved_drops")
            .select("drop_id")
            .eq("user_id", userId)
            .in("drop_id", dropIds);

        if (!sdErr) savedSet = new Set((sd ?? []).map((r: any) => r.drop_id));
    }

    const clickMeta = { where: "drops_list_click", where_shop: "drops_list_shop_click" };

    return (
        <div className="grid gap-5">
            <div className="flex items-center justify-between gap-3">
                <div className="grid gap-1">
                    <h1 className="text-2xl font-extrabold">Drops</h1>
                    <div className="text-xs font-semibold text-neutral-500">
                        {shop ? `Shop: ${shop}` : "Hot (30d)"} {q ? ` / q="${q}"` : ""}
                    </div>
                </div>

                <div className="flex gap-2">
                    <Link
                        href={addQuery("/start", { imp })}
                        className="rounded-xl border px-4 py-2 text-sm font-extrabold hover:bg-neutral-50"
                    >
                        Start
                    </Link>
                    <Link
                        href={addQuery("/shops/me", { imp })}
                        className="rounded-xl border px-4 py-2 text-sm font-extrabold hover:bg-neutral-50"
                    >
                        My Shop
                    </Link>
                    <Link
                        href={addQuery("/me/saved", { imp })}
                        className="rounded-xl border px-4 py-2 text-sm font-extrabold hover:bg-neutral-50"
                    >
                        Saved
                    </Link>
                </div>
            </div>

            {error ? (
                <div className="rounded-2xl border bg-white p-5">
                    <div className="text-red-600 font-extrabold">Error</div>
                    <div className="mt-2 text-sm font-semibold text-neutral-700 break-words">{error.message}</div>
                </div>
            ) : null}

            {data?.length ? (
                <ul className="grid list-none gap-4 p-0 md:grid-cols-2 lg:grid-cols-3">
                    {data.map((d: any) => (
                        <DropCard
                            key={d.id}
                            d={d}
                            imp={imp}
                            clickMeta={clickMeta}
                            showSave={!!userId}
                            initialSaved={savedSet.has(d.id)}
                            toggleSaveAction={toggleSavedDropAction}
                        />
                    ))}
                </ul>
            ) : (
                <div className="rounded-2xl border bg-white p-5 text-sm font-semibold text-neutral-600">
                    まだ表示できるDropがありません。
                </div>
            )}
        </div>
    );
}
