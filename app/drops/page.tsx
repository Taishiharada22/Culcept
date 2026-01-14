import Link from "next/link";
import type { Metadata } from "next";
import { supabaseServer } from "@/lib/supabase/server";
import DropsFilters from "./DropsFilters";
import { requireUser } from "@/lib/auth/requireUser";
import DropCard from "./DropCard";
import Pagination from "./Pagination";

export const metadata: Metadata = {
    title: "Drops",
    description: "Browse curated drops. Filter by tags, price, brand, and more.",
    openGraph: { title: "Drops | Culcept", url: "/drops" },
};

type DropRow = {
    id: string;
    created_at: string;
    title: string;
    brand: string | null;
    size: string | null;
    condition: string | null;
    price: number | null;
    cover_image_url: string | null;
    tags: string[] | null;
    purchase_url: string | null;
    user_id: string | null;
};

function s(v: unknown) {
    return typeof v === "string" ? v : "";
}
function parsePage(v: string) {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 1) return 1;
    return Math.floor(n);
}
function normalizeTag(s0: string) {
    return s0.trim().replace(/\s+/g, " ").toLowerCase();
}

export default async function DropsPage({
    searchParams,
}: {
    searchParams: Record<string, string | string[] | undefined>;
}) {
    const q = s(searchParams.q);
    const brand = s(searchParams.brand);
    const size = s(searchParams.size);
    const condition = s(searchParams.condition);
    const tagsParam = s(searchParams.tags);
    const min = s(searchParams.min);
    const max = s(searchParams.max);
    const hasImage = s(searchParams.hasImage);
    const hasBuy = s(searchParams.hasBuy);
    const sort = s(searchParams.sort) || "new";
    const mine = s(searchParams.mine);
    const page = parsePage(s(searchParams.page));

    const tags = tagsParam
        ? tagsParam.split(",").map(normalizeTag).filter(Boolean).slice(0, 10)
        : [];

    const PAGE_SIZE = 24;
    const supabase = await supabaseServer();

    let currentUserId: string | null = null;
    if (mine === "1") {
        const { user } = await requireUser("/drops?mine=1");
        currentUserId = user.id;
    }

    let query = supabase
        .from("drops")
        .select(
            "id,created_at,title,brand,size,condition,price,cover_image_url,tags,purchase_url,user_id",
            { count: "exact" }
        )
        .limit(PAGE_SIZE);

    if (q) {
        const like = `%${q}%`;
        query = query.or(`title.ilike.${like},description.ilike.${like}`);
    }
    if (brand) query = query.ilike("brand", `%${brand}%`);
    if (size) query = query.ilike("size", `%${size}%`);
    if (condition) query = query.ilike("condition", `%${condition}%`);
    if (tags.length > 0) query = query.contains("tags", tags);

    if (min) {
        const n = Number(min);
        if (Number.isFinite(n)) query = query.gte("price", Math.floor(n));
    }
    if (max) {
        const n = Number(max);
        if (Number.isFinite(n)) query = query.lte("price", Math.floor(n));
    }
    if (hasImage === "1") query = query.not("cover_image_url", "is", null);
    if (hasBuy === "1") query = query.not("purchase_url", "is", null);
    if (currentUserId) query = query.eq("user_id", currentUserId);

    if (sort === "old") query = query.order("created_at", { ascending: true });
    else if (sort === "price_asc")
        query = query.order("price", { ascending: true, nullsFirst: false });
    else if (sort === "price_desc")
        query = query.order("price", { ascending: false, nullsFirst: false });
    else query = query.order("created_at", { ascending: false });

    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;
    const rows = (data ?? []) as DropRow[];
    const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

    const qs = new URLSearchParams();
    if (q) qs.set("q", q);
    if (brand) qs.set("brand", brand);
    if (size) qs.set("size", size);
    if (condition) qs.set("condition", condition);
    if (tagsParam) qs.set("tags", tagsParam);
    if (min) qs.set("min", min);
    if (max) qs.set("max", max);
    if (hasImage) qs.set("hasImage", hasImage);
    if (hasBuy) qs.set("hasBuy", hasBuy);
    if (sort && sort !== "new") qs.set("sort", sort);
    if (mine) qs.set("mine", mine);
    const queryString = qs.toString() ? `&${qs.toString()}` : "";

    return (
        <div className="grid gap-4">
            <div className="flex items-center justify-between gap-3">
                <h1 className="text-2xl font-extrabold tracking-tight">Drops</h1>
                <Link
                    href="/drops/new"
                    className="rounded-md border border-zinc-200 px-4 py-2 text-sm font-extrabold no-underline hover:bg-zinc-50"
                >
                    + New
                </Link>
            </div>

            <DropsFilters
                q={q}
                brand={brand}
                size={size}
                condition={condition}
                tags={tagsParam}
                min={min}
                max={max}
                hasImage={hasImage}
                hasBuy={hasBuy}
                sort={sort}
                mine={mine}
            />

            {error && (
                <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
                    {error.message}
                </p>
            )}

            <ul className="grid list-none gap-4 p-0 md:grid-cols-2 lg:grid-cols-3">
                {rows.map((d) => (
                    <DropCard key={d.id} d={d} />
                ))}
            </ul>

            <Pagination
                basePath="/drops"
                page={page}
                totalPages={totalPages}
                queryString={queryString}
            />
        </div>
    );
}
