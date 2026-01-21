// app/drops/[id]/edit/page.tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth/requireUser";

import DropMetaForm from "./DropMetaForm";
import AddImagesForm from "./AddImagesForm";
import ImageManager from "./ImageManager";

export default async function EditDropPage({ params }: { params: Promise<{ id: string }> }) {
    const p = await params;
    const dropId = String(p?.id ?? "");

    // ここで弾く（undefined対策）
    if (!dropId || dropId === "undefined") return notFound();

    const { supabase, user } = await requireUser(`/login?next=/drops/${dropId}/edit`);

    const { data: drop, error: dErr } = await supabase
        .from("drops")
        .select("id,user_id,title,brand,size,condition,price,url,purchase_url,description,tags,sale_mode,auction_floor_price,auction_end_at,auction_allow_buy_now")
        .eq("id", dropId)
        .eq("user_id", user.id)
        .maybeSingle();

    // 開発中はエラー原因を潰しやすくするため、dErrは握りつぶさず throw 推奨
    if (dErr) throw dErr;
    if (!drop) return notFound();

    const { data: images, error: iErr } = await supabase
        .from("drop_images")
        .select("id,public_url,sort")
        .eq("drop_id", dropId)
        .eq("user_id", user.id)
        .order("sort", { ascending: true });

    if (iErr) throw iErr;

    const imgs = (images ?? []) as { id: string; public_url: string; sort: number }[];

    return (
        <main className="mx-auto max-w-5xl px-4 py-10">
            <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Link href="/drops" className="text-sm font-extrabold text-zinc-700 no-underline hover:text-zinc-950">
                        ← Drops
                    </Link>
                    <span className="text-xs font-semibold text-zinc-400">/</span>
                    <Link href={`/drops/${dropId}`} className="text-sm font-extrabold text-zinc-700 no-underline hover:text-zinc-950">
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
                        <DropMetaForm
                            dropId={dropId}
                            defaults={{
                                title: drop.title ?? "",
                                brand: drop.brand ?? "",
                                size: drop.size ?? "",
                                condition: drop.condition ?? "",
                                price: drop.price ?? "",
                                url: drop.url ?? "",
                                purchase_url: drop.purchase_url ?? "",
                                description: drop.description ?? "",
                                tags: Array.isArray(drop.tags) ? drop.tags : [],
                                sale_mode: (drop.sale_mode ?? "fixed") as any,
                                auction_floor_price: drop.auction_floor_price ?? "",
                                auction_end_at: drop.auction_end_at ?? null,
                                auction_allow_buy_now: drop.auction_allow_buy_now ?? true,

                            }}
                        />
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
