// app/drops/[id]/edit/page.tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import type { ComponentProps } from "react";
import { requireUser } from "@/lib/auth/requireUser";

import DropMetaForm from "./DropMetaForm";
import AddImagesForm from "./AddImagesForm";
import ImageManager from "./ImageManager";

// ✅ 追加（Auto Pricing Widget）
import AutoPricingWidget from "@/components/pricing/AutoPricingWidget";

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

function isColumnMissingError(err: any) {
    const code = String(err?.code ?? "");
    const msg = String(err?.message ?? "");
    return code === "42703" || (msg.includes("column") && msg.includes("does not exist"));
}

function normalizeSaleMode(v: unknown): "fixed" | "auction" {
    const s = String(v ?? "").trim().toLowerCase();
    return s === "auction" ? "auction" : "fixed";
}

type DropMetaDefaults = ComponentProps<typeof DropMetaForm>["defaults"];

function buildDefaults(rawDrop: any): DropMetaDefaults {
    const sale_mode = normalizeSaleMode(rawDrop?.sale_mode);

    // 旧実装: auction時に price を buy now として使っていた可能性があるのでフォールバック
    const buyNowFallback = rawDrop?.buy_now_price ?? rawDrop?.price ?? "";

    return {
        title: rawDrop?.title ?? "",
        brand: rawDrop?.brand ?? "",
        size: rawDrop?.size ?? "",
        condition: rawDrop?.condition ?? "",
        price: rawDrop?.price ?? "",
        buy_now_price: buyNowFallback ?? "",

        url: rawDrop?.url ?? "",
        purchase_url: rawDrop?.purchase_url ?? "",
        description: rawDrop?.description ?? "",
        tags: Array.isArray(rawDrop?.tags) ? rawDrop.tags : [],

        sale_mode,
        auction_floor_price: rawDrop?.auction_floor_price ?? "",
        auction_end_at: rawDrop?.auction_end_at ?? null,
        auction_allow_buy_now: rawDrop?.auction_allow_buy_now ?? true,
    };
}

export default async function EditDropPage({
    params,
    searchParams,
}: {
    params: { id: string };
    searchParams?: SP;
}) {
    const dropId = spStr(params?.id);
    const sp = searchParams ?? ({} as SP);

    const imp = spStr(sp.imp || sp.impressionId || sp.impression_id) || null;

    if (!dropId || dropId === "undefined") return notFound();

    const nextPath = addQuery(`/drops/${dropId}/edit`, { imp });
    const { supabase, user } = await requireUser(`/login?next=${encodeURIComponent(nextPath)}`);

    // ✅ drops select（buy_now_price が無いDBでも動くようにフォールバック）
    const baseCols =
        "id,user_id,title,brand,size,condition,price,url,purchase_url,description,tags,sale_mode,auction_floor_price,auction_end_at,auction_allow_buy_now";
    let rawDrop: any = null;

    const r1 = await supabase
        .from("drops")
        .select(`${baseCols},buy_now_price`)
        .eq("id", dropId)
        .maybeSingle();

    if (!r1.error) {
        rawDrop = r1.data;
    } else if (isColumnMissingError(r1.error)) {
        const r2 = await supabase.from("drops").select(baseCols).eq("id", dropId).maybeSingle();
        if (r2.error) throw r2.error;
        rawDrop = r2.data;
    } else {
        throw r1.error;
    }

    if (!rawDrop) return notFound();

    // ownership
    const isOwner = !!rawDrop.user_id && String(rawDrop.user_id) === user.id;

    if (!isOwner) {
        return (
            <main className="mx-auto max-w-2xl px-4 py-10">
                <div className="mb-6 flex items-center justify-between">
                    <Link
                        href={addQuery("/drops", { imp })}
                        className="text-sm font-extrabold text-zinc-700 no-underline hover:text-zinc-950"
                    >
                        ← Products
                    </Link>
                    <div className="text-xs font-semibold text-zinc-500">Edit</div>
                </div>

                <div className="rounded-xl border border-red-200 bg-red-50 p-5">
                    <div className="text-sm font-extrabold text-red-700">編集権限がありません（または user_id が未設定）</div>
                    <div className="mt-2 text-xs font-semibold text-red-700">
                        drop.id: {rawDrop.id}
                        <br />
                        drop.user_id: {String(rawDrop.user_id ?? "null")}
                        <br />
                        login.user.id: {user.id}
                    </div>

                    <div className="mt-4 text-xs font-semibold text-zinc-700">
                        よくある原因：
                        <ul className="mt-2 list-disc pl-5">
                            <li>Drop作成時に drops.user_id が入っていない</li>
                            <li>別アカウントで作ったDropを開いている</li>
                            <li>RLS/ポリシーで owner 判定がズレている</li>
                        </ul>
                    </div>

                    <div className="mt-4">
                        <Link
                            href={addQuery(`/drops/${dropId}`, { imp })}
                            className="text-sm font-extrabold text-zinc-800 no-underline hover:text-zinc-950"
                        >
                            View に戻る →
                        </Link>
                    </div>
                </div>
            </main>
        );
    }

    // images（user_id列が無い構成でも動くように：まず drop_id のみで取得）
    const { data: images, error: iErr } = await supabase
        .from("drop_images")
        .select("id,public_url,sort")
        .eq("drop_id", dropId)
        .order("sort", { ascending: true });

    if (iErr) throw iErr;

    const imgs = (images ?? []) as { id: string; public_url: string; sort: number }[];
    const defaults = buildDefaults(rawDrop);

    return (
        <main className="mx-auto max-w-5xl px-4 py-10">
            <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Link
                        href={addQuery("/drops", { imp })}
                        className="text-sm font-extrabold text-zinc-700 no-underline hover:text-zinc-950"
                    >
                        ← Products
                    </Link>
                    <span className="text-xs font-semibold text-zinc-400">/</span>
                    <Link
                        href={addQuery(`/drops/${dropId}`, { imp })}
                        className="text-sm font-extrabold text-zinc-700 no-underline hover:text-zinc-950"
                    >
                        View
                    </Link>
                </div>

                <div className="text-xs font-semibold text-zinc-500">Edit</div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
                    <h2 className="text-lg font-black tracking-tight">Meta</h2>
                    <p className="mt-1 text-xs font-semibold text-zinc-500">タイトル / URL / タグ / 説明など</p>

                    <div className="mt-5">
                        <DropMetaForm dropId={dropId} defaults={defaults} />
                    </div>
                </section>

                <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
                    <h2 className="text-lg font-black tracking-tight">Add Images</h2>
                    <p className="mt-1 text-xs font-semibold text-zinc-500">既存は残したまま追加（合計10枚まで）</p>

                    <div className="mt-5">
                        <AddImagesForm dropId={dropId} currentCount={imgs.length} />
                    </div>
                </section>
            </div>

            {/* ✅ Auto-Pricing Widget（統合） */}
            <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-black tracking-tight">Auto Pricing</h2>
                <p className="mt-1 text-xs font-semibold text-zinc-500">
                    類似商品の相場から、価格提案を自動で出します
                </p>

                <div className="mt-5">
                    <AutoPricingWidget
                        productId={rawDrop.id}
                        currentPrice={rawDrop.price}
                        title={rawDrop.title}
                        brand={rawDrop.brand}
                        condition={rawDrop.condition}
                    />
                </div>
            </section>

            <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-black tracking-tight">Images</h2>
                <p className="mt-1 text-xs font-semibold text-zinc-500">ドラッグで並び替え → Save order。削除もここ。</p>

                <div className="mt-5">
                    <ImageManager dropId={dropId} images={imgs} />
                </div>
            </section>
        </main>
    );
}
