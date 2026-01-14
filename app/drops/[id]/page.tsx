import Link from "next/link";
import type { Metadata } from "next";
import { supabaseServer } from "@/lib/supabase/server";
import { deleteDropAction } from "./actions";
import ImageModalGallery from "@/app/drops/ImageModalGallery";
import DropCard from "@/app/drops/DropCard";
import OutboundLink from "@/app/components/OutboundLink";
import ReportButton from "@/app/components/ReportButton";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

type DropRow = {
    id: string;
    created_at: string;
    title: string;
    brand: string | null;
    size: string | null;
    condition: string | null;
    price: number | null;
    url: string | null;
    purchase_url: string | null;
    description: string | null;
    user_id: string | null;
    tags: string[] | null;
    cover_image_url: string | null;
};

type DropImage = { id: string; sort: number; public_url: string };

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
    const supabase = await supabaseServer();
    const { data: drop } = await supabase
        .from("drops")
        .select("id,title,description,cover_image_url,tags")
        .eq("id", params.id)
        .maybeSingle();

    if (!drop) return { title: "Drop not found", robots: { index: false, follow: false } };

    const title = String(drop.title ?? "Drop");
    const desc = String(drop.description ?? "").slice(0, 160) || "View this drop on Culcept.";
    const img = drop.cover_image_url ? [drop.cover_image_url] : [];

    return {
        title,
        description: desc,
        alternates: { canonical: `/drops/${params.id}` },
        openGraph: { type: "article", title, description: desc, url: `/drops/${params.id}`, images: img },
        twitter: { card: "summary_large_image", title, description: desc, images: img },
    };
}

export default async function DropDetailPage({ params }: { params: { id: string } }) {
    const supabase = await supabaseServer();

    const [{ data: auth }, { data: drop, error: dropErr }, { data: images, error: imgErr }] =
        await Promise.all([
            supabase.auth.getUser(),
            supabase
                .from("drops")
                .select("id,created_at,title,brand,size,condition,price,url,purchase_url,description,user_id,tags,cover_image_url")
                .eq("id", params.id)
                .single(),
            supabase.from("drop_images").select("id,sort,public_url").eq("drop_id", params.id).order("sort", { ascending: true }),
        ]);

    if (dropErr || !drop) {
        return (
            <div className="grid gap-3">
                <Link href="/drops" className="text-sm font-extrabold text-zinc-700 hover:text-zinc-950">
                    ← Back
                </Link>
                <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
                    {dropErr?.message ?? "Not found"}
                </p>
            </div>
        );
    }

    if (imgErr) {
        return (
            <div className="grid gap-3">
                <Link href="/drops" className="text-sm font-extrabold text-zinc-700 hover:text-zinc-950">
                    ← Back
                </Link>
                <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
                    {imgErr.message}
                </p>
            </div>
        );
    }

    const d = drop as DropRow;
    const imgs = (images ?? []) as DropImage[];
    const tags = Array.isArray(d.tags) ? d.tags : [];
    const isOwner = !!auth?.user && !!d.user_id && auth.user.id === d.user_id;

    // Similar
    let simQuery = supabase
        .from("drops")
        .select("id,created_at,title,brand,size,condition,price,cover_image_url,tags,purchase_url,user_id")
        .neq("id", d.id)
        .limit(6)
        .order("created_at", { ascending: false });

    if (tags.length > 0) simQuery = simQuery.overlaps("tags", tags);
    else if (d.brand) simQuery = simQuery.ilike("brand", `%${d.brand}%`);

    const { data: similar } = await simQuery;
    const simRows = (similar ?? []) as any[];

    // JSON-LD (Product)
    const jsonLd: Record<string, any> = {
        "@context": "https://schema.org",
        "@type": "Product",
        name: d.title,
        image: imgs.map((x) => x.public_url).slice(0, 8),
        description: d.description ?? undefined,
        brand: d.brand ? { "@type": "Brand", name: d.brand } : undefined,
        url: `${siteUrl}/drops/${d.id}`,
    };
    if (d.price != null) {
        jsonLd.offers = {
            "@type": "Offer",
            priceCurrency: "JPY",
            price: String(d.price),
            url: d.purchase_url ?? `${siteUrl}/drops/${d.id}`,
            availability: "https://schema.org/InStock",
        };
    }

    return (
        <div className="grid gap-4">
            <div className="flex items-center justify-between gap-3">
                <Link href="/drops" className="text-sm font-extrabold text-zinc-700 hover:text-zinc-950">
                    ← Back
                </Link>

                <div className="flex items-center gap-2">
                    {!isOwner ? <ReportButton dropId={d.id} /> : null}

                    {isOwner ? (
                        <div className="flex items-center gap-3">
                            <Link href={`/drops/${d.id}/edit`} className="text-sm font-extrabold text-zinc-700 hover:text-zinc-950">
                                Edit
                            </Link>
                            <form action={deleteDropAction.bind(null, d.id)}>
                                <button
                                    type="submit"
                                    className="rounded-md border border-red-200 px-3 py-2 text-sm font-extrabold text-red-700 hover:bg-red-50"
                                >
                                    Delete
                                </button>
                            </form>
                        </div>
                    ) : null}
                </div>
            </div>

            <h1 className="text-3xl font-extrabold tracking-tight">{d.title}</h1>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-semibold text-zinc-700">
                {d.brand && <span>{d.brand}</span>}
                {d.size && <span>{d.size}</span>}
                {d.condition && <span>{d.condition}</span>}
                {d.price != null && <span className="font-extrabold text-zinc-950">¥{d.price}</span>}
                <span className="text-xs font-semibold text-zinc-500">{new Date(d.created_at).toLocaleString()}</span>

                {d.purchase_url ? (
                    <OutboundLink
                        dropId={d.id}
                        kind="buy"
                        href={d.purchase_url}
                        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-extrabold text-white no-underline hover:bg-zinc-800"
                    >
                        Buy
                    </OutboundLink>
                ) : null}

                {d.url ? (
                    <OutboundLink
                        dropId={d.id}
                        kind="link"
                        href={d.url}
                        className="text-sm font-extrabold text-zinc-800 no-underline hover:text-zinc-950"
                    >
                        Link
                    </OutboundLink>
                ) : null}
            </div>

            {tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {tags.map((t) => (
                        <Link
                            key={t}
                            href={`/drops?tags=${encodeURIComponent(t)}`}
                            className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-extrabold text-zinc-900 no-underline hover:bg-zinc-50"
                        >
                            {t}
                        </Link>
                    ))}
                </div>
            )}

            <ImageModalGallery title={d.title} images={imgs.map((x) => ({ id: x.id, public_url: x.public_url }))} />

            {d.description ? <p className="leading-8 text-zinc-800">{d.description}</p> : null}

            {simRows.length > 0 && (
                <section className="mt-6 grid gap-3">
                    <h2 className="text-lg font-extrabold tracking-tight">Similar</h2>
                    <ul className="grid list-none gap-4 p-0 md:grid-cols-2 lg:grid-cols-3">
                        {simRows.map((x) => (
                            <DropCard key={x.id} d={x} />
                        ))}
                    </ul>
                </section>
            )}

            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        </div>
    );
}
