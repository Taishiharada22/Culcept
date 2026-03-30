// app/shops/me/drafts/page.tsx
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DraftDropsPage() {
    const sb = await supabaseServer();
    const { data: userRes } = await sb.auth.getUser();
    const user = userRes?.user;
    if (!user) return <div className="p-6">Unauthorized</div>;

    const { data: drops } = await sb
        .from("drops")
        .select("id, title, price, currency, image_urls, external_source_url, external_imported_at")
        .eq("owner_user_id", user.id)
        .eq("is_public", false)
        .order("external_imported_at", { ascending: false })
        .limit(200);

    return (
        <div className="p-6 space-y-4">
            <h1 className="text-xl font-semibold">Draft Drops</h1>

            {(!drops || drops.length === 0) ? (
                <div className="opacity-70">下書きDropがありません。</div>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {drops.map((d) => (
                        <div key={d.id} className="rounded-xl border p-4 space-y-2">
                            {Array.isArray(d.image_urls) && d.image_urls[0] ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={d.image_urls[0]} alt="" className="w-full aspect-square object-cover rounded-lg border" />
                            ) : null}

                            <div className="font-medium line-clamp-2">
                                <Link className="underline" href={`/drops/${d.id}`}>{d.title ?? "(no title)"}</Link>
                            </div>

                            <div className="text-sm opacity-80">
                                {d.price != null ? `${d.price} ${d.currency ?? ""}` : "price: -"}
                            </div>

                            {d.external_source_url ? (
                                <div className="text-xs opacity-60 break-all">
                                    source:{" "}
                                    <a className="underline" href={d.external_source_url} target="_blank" rel="noreferrer">
                                        {d.external_source_url}
                                    </a>
                                </div>
                            ) : null}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
