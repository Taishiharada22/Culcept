// app/shops/me/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import SellerRecoPanel from "./SellerRecoPanel";
import ShopForm from "./shop-form";
import {
    toggleShopActiveAction,
    generateMyShopFromWebsiteAction,
    approveSuggestedTagsAction,
    createShopDraftAction,
    bulkUpdateShopTagsAction,
} from "./actions";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * ✅ TSの <form action> 型問題対策：
 * action は (fd)=>void|Promise<void> を要求するので、
 * ShopActionState を返す action は “voidラッパー” を噛ませる。
 */
async function runGenerateMyShopFromWebsiteAction(formData: FormData): Promise<void> {
    "use server";
    await generateMyShopFromWebsiteAction(formData);
}
async function runApproveSuggestedTagsAction(formData: FormData): Promise<void> {
    "use server";
    await approveSuggestedTagsAction(formData);
}
async function runBulkUpdateShopTagsAction(formData: FormData): Promise<void> {
    "use server";
    await bulkUpdateShopTagsAction(formData);
}

type SP = { shop_id?: string; reset?: string; error?: string; saved?: string; note?: string };

export default async function MyShopPage({
    searchParams,
}: {
    searchParams?: Promise<SP>;
}) {
    const sp = (await searchParams) ?? {};

    const supabase = await supabaseServer();
    const { data } = await supabase.auth.getUser();
    const user = data?.user;
    if (!user) redirect(`/login?next=${encodeURIComponent("/shops/me")}`);

    // ✅ 自分が所有するShop一覧（複数）
    const { data: myShops } = await supabase
        .from("shops")
        .select("id,slug,name_ja,status,is_active,created_at")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);

    const selectedId =
        String((sp as any)?.shop_id ?? "").trim() || (myShops?.[0]?.id ? String(myShops[0].id) : "");

    // ✅ 選択中Shopの詳細
    const { data: shop } = selectedId
        ? await supabase
            .from("shops")
            .select(
                "id,slug,name_ja,name_en,headline,bio,url,external_url,source_url,address_text,suggested_tags,avatar_url,banner_url,style_tags,socials,is_active,status,created_at,tag_scores"
            )
            .eq("id", selectedId)
            .eq("owner_id", user.id)
            .maybeSingle()
        : ({ data: null as any } as any);

    const effectiveUrl = (shop as any)?.external_url ?? (shop as any)?.url ?? "";
    const sourceUrl = String((shop as any)?.source_url ?? "").trim();
    const addressText = String((shop as any)?.address_text ?? "").trim();

    const status = String((shop as any)?.status ?? "").trim();
    const isPublished = status === "published" || !!(shop as any)?.is_active;

    // ✅ reset=1 のときは強制的に “空フォーム表示”（新規作成直後の要件）
    const forceReset = String((sp as any)?.reset ?? "") === "1";

    // ✅ 新規作成直後っぽいなら、フォーム初期値は全部空にする
    const isFreshDraft =
        !isPublished &&
        String((shop as any)?.name_ja ?? "").trim() === "New Shop" &&
        !String((shop as any)?.headline ?? "").trim() &&
        !String((shop as any)?.bio ?? "").trim() &&
        !String(effectiveUrl ?? "").trim() &&
        !(Array.isArray((shop as any)?.style_tags) && (shop as any)?.style_tags.length);

    const formDefaults =
        forceReset || isFreshDraft
            ? {
                slug: "",
                name_ja: "",
                name_en: "",
                headline: "",
                bio: "",
                url: "",
                avatar_url: "",
                banner_url: "",
                style_tags: [] as any,
                socials: {},
                is_active: false,
            }
            : {
                slug: (shop as any)?.slug ?? "",
                name_ja: (shop as any)?.name_ja ?? "",
                name_en: (shop as any)?.name_en ?? "",
                headline: (shop as any)?.headline ?? "",
                bio: (shop as any)?.bio ?? "",
                url: String(effectiveUrl ?? ""),
                avatar_url: (shop as any)?.avatar_url ?? "",
                banner_url: (shop as any)?.banner_url ?? "",
                style_tags: ((shop as any)?.style_tags ?? []) as any,
                socials: (shop as any)?.socials ?? {},
                is_active: !!(shop as any)?.is_active,
            };

    const errMsg = String((sp as any)?.error ?? "").trim();
    const saved = String((sp as any)?.saved ?? "") === "1";

    const viewHref =
        (shop as any)?.slug
            ? isPublished
                ? `/shops/${(shop as any).slug}`
                : `/shops/${(shop as any).slug}?preview=1&shop_id=${encodeURIComponent(String((shop as any).id))}`
            : "";

    return (
        <div className="space-y-10">
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold">My Shops</h1>
                    <p className="text-sm text-neutral-600 mt-1">
                        管理者ダッシュボード（複数Shop管理）
                        <span className="ml-2 text-xs font-semibold text-zinc-500">※ MVPは「URL＋紹介＋タグ」が最優先</span>
                    </p>
                </div>

                <div className="flex gap-2">
                    <form action={createShopDraftAction}>
                        <button className="rounded-xl bg-black text-white px-4 py-2 hover:opacity-90" type="submit">
                            + 新規Shop
                        </button>
                    </form>

                    <Link href="/shops" className="rounded-xl border px-4 py-2 hover:bg-neutral-50">
                        /shops（公開一覧）
                    </Link>
                </div>
            </div>

            {/* ✅ create 失敗が “何も変わらない” になるので必ず見える化 */}
            {errMsg ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{errMsg}</div>
            ) : saved ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">
                    保存しました
                </div>
            ) : null}

            {/* ✅ Bulk tag editor */}
            {myShops?.length ? (
                <section className="space-y-3">
                    <div className="flex items-baseline justify-between">
                        <h2 className="text-lg font-semibold">一括編集（タグ）</h2>
                        <span className="text-xs text-neutral-500">全店 / 選択店にまとめて反映（追加・削除・置換）</span>
                    </div>

                    <form action={runBulkUpdateShopTagsAction} className="rounded-2xl border bg-white p-5 space-y-4">
                        <div className="flex flex-wrap items-center gap-3">
                            <label className="inline-flex items-center gap-2 text-sm font-semibold">
                                <input type="checkbox" name="scope_all" value="1" />
                                全部のShopに適用
                            </label>

                            <span className="text-xs text-neutral-500">※ チェックしない場合は、下の「選択したShop」にだけ適用</span>
                        </div>

                        <div className="rounded-xl border p-3">
                            <div className="text-sm font-semibold mb-2">選択したShop</div>
                            <div className="flex flex-wrap gap-2">
                                {(myShops ?? []).map((s: any) => {
                                    const sid = String(s.id);
                                    const label = String(s.name_ja || s.slug || "Shop").slice(0, 30);
                                    const st = String(s.status ?? "");
                                    return (
                                        <label
                                            key={sid}
                                            className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold hover:bg-neutral-50"
                                        >
                                            <input type="checkbox" name="target_shop_id" value={sid} defaultChecked={sid === selectedId} />
                                            <span>{label}</span>
                                            <span className={st === "published" ? "opacity-90" : "opacity-50"}>{st === "published" ? "●" : "○"}</span>
                                        </label>
                                    );
                                })}
                            </div>

                            <div className="text-xs text-neutral-500 mt-2">
                                ヒント：とりあえず今選択中のShopだけチェックが入る。必要な店だけ追加でチェックして一括反映。
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-4">
                            <label className="inline-flex items-center gap-2 text-sm font-semibold">
                                <input type="radio" name="mode" value="add" defaultChecked />
                                追加（既存に足す）
                            </label>
                            <label className="inline-flex items-center gap-2 text-sm font-semibold">
                                <input type="radio" name="mode" value="remove" />
                                削除（指定を外す）
                            </label>
                            <label className="inline-flex items-center gap-2 text-sm font-semibold">
                                <input type="radio" name="mode" value="replace" />
                                置き換え（全部差し替え）
                            </label>
                        </div>

                        <div className="space-y-2">
                            <div className="text-sm font-semibold">タグ（カンマ区切り or JSON配列）</div>
                            <textarea
                                name="tags"
                                className="w-full rounded-xl border px-3 py-2 text-sm min-h-[90px]"
                                placeholder='例: vintage, street, designer, archive
例(JSON): ["vintage","street","archive"]'
                            />
                            <div className="text-xs text-neutral-500">※ 英小文字推奨。空欄で実行すると何もしない。</div>
                        </div>

                        <input type="hidden" name="return_shop_id" value={selectedId} />

                        <button className="rounded-xl bg-black text-white px-4 py-2 hover:opacity-90" type="submit">
                            一括反映する
                        </button>
                    </form>
                </section>
            ) : null}

            {/* Shop switcher */}
            <section className="space-y-2">
                <div className="text-sm font-semibold">Shop切り替え</div>
                <div className="flex flex-wrap gap-2">
                    {(myShops ?? []).map((s: any) => {
                        const sid = String(s.id);
                        const active = sid === selectedId;
                        const label = String(s.name_ja || s.slug || "Shop").slice(0, 30);
                        const st = String(s.status ?? "");
                        return (
                            <Link
                                key={sid}
                                href={`/shops/me?shop_id=${sid}`}
                                className={
                                    active
                                        ? "rounded-full bg-black text-white px-3 py-1 text-xs font-semibold"
                                        : "rounded-full border px-3 py-1 text-xs font-semibold hover:bg-neutral-50"
                                }
                            >
                                {label} <span className={st === "published" ? "opacity-90" : "opacity-50"}>{st === "published" ? "●" : "○"}</span>
                            </Link>
                        );
                    })}
                    {!myShops?.length ? <div className="text-xs text-neutral-500">まだShopがありません。右上の「+ 新規Shop」から作ってね。</div> : null}
                </div>
            </section>

            {/* Seller reco */}
            <section className="space-y-3">
                <div className="flex items-baseline justify-between">
                    <h2 className="text-lg font-semibold">おすすめ（Insight）</h2>
                    <span className="text-xs text-neutral-500">👍/保存/クリックが次の提案に効く</span>
                </div>
                <SellerRecoPanel />
            </section>

            {/* Shop editor */}
            <section className="space-y-3">
                <div className="flex items-baseline justify-between">
                    <h2 className="text-lg font-semibold">Shop設定</h2>
                    {viewHref ? (
                        <Link href={viewHref} className="text-sm underline text-neutral-700">
                            {isPublished ? "公開ページを見る" : "Previewで見る"}
                        </Link>
                    ) : null}
                </div>

                {(shop as any)?.id ? (
                    <div className="flex items-center gap-3">
                        <div className="text-sm text-neutral-700">
                            Status:{" "}
                            <span className={isPublished ? "text-green-700 font-semibold" : "text-neutral-500 font-semibold"}>
                                {isPublished ? "Published" : "Draft"}
                            </span>
                        </div>

                        <form action={toggleShopActiveAction}>
                            <input type="hidden" name="shop_id" value={(shop as any).id} />
                            <input type="hidden" name="next_active" value={isPublished ? "0" : "1"} />
                            <button className="rounded-xl border px-3 py-2 text-sm hover:bg-neutral-50">
                                {isPublished ? "非公開にする" : "公開する"}
                            </button>
                        </form>
                    </div>
                ) : (
                    <div className="text-sm text-neutral-600">編集対象のShopがありません。「+ 新規Shop」から作ってください。</div>
                )}

                {/* URLが未設定なら軽く促す */}
                {(shop as any)?.id && !String(effectiveUrl || "").trim() ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
                        まずは <span className="font-black">店のURL</span> を設定すると、AI生成が使えます。
                    </div>
                ) : null}

                {/* ✅ AI生成 */}
                {(shop as any)?.id ? (
                    <section className="space-y-3">
                        <h3 className="text-base font-semibold">AIで下書き生成（公式サイトURLから）</h3>

                        <div className="rounded-2xl border bg-white p-5 space-y-3">
                            <div className="text-sm text-neutral-700">
                                URL: <span className="font-semibold">{String(effectiveUrl || "").trim() || "（未設定）"}</span>
                                {sourceUrl ? <span className="ml-2 text-xs text-neutral-500">source: {sourceUrl}</span> : null}
                            </div>

                            {addressText ? (
                                <div className="text-xs text-neutral-600">住所: {addressText}</div>
                            ) : (
                                <div className="text-xs text-neutral-500">住所: （未設定。抽出 or 手入力で埋まる）</div>
                            )}

                            <div className="flex flex-wrap gap-2">
                                <form action={runGenerateMyShopFromWebsiteAction}>
                                    <input type="hidden" name="shop_id" value={(shop as any).id} />
                                    <input type="hidden" name="overwrite" value="0" />
                                    <button className="rounded-xl bg-black text-white px-4 py-2 hover:opacity-90" type="submit">
                                        URLから生成（上書きしない）
                                    </button>
                                </form>

                                <form action={runGenerateMyShopFromWebsiteAction}>
                                    <input type="hidden" name="shop_id" value={(shop as any).id} />
                                    <input type="hidden" name="overwrite" value="1" />
                                    <button className="rounded-xl border px-4 py-2 hover:bg-neutral-50" type="submit">
                                        URLから生成（既存を上書き）
                                    </button>
                                </form>

                                <span className="text-xs text-neutral-500 self-center">※ タグは候補だけ出して、承認して確定</span>
                            </div>

                            {Array.isArray((shop as any)?.suggested_tags) && (shop as any).suggested_tags.length ? (
                                <form action={runApproveSuggestedTagsAction} className="rounded-xl border p-4 space-y-3">
                                    <input type="hidden" name="shop_id" value={String((shop as any).id)} />
                                    <div className="text-sm font-semibold">タグ候補（チェックして承認 → style_tagsに反映）</div>

                                    <div className="flex flex-wrap gap-2">
                                        {(shop as any).suggested_tags.map((t: string) => (
                                            <label key={t} className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold">
                                                <input type="checkbox" name="tag" value={t} defaultChecked />
                                                <span>#{t}</span>
                                            </label>
                                        ))}
                                    </div>

                                    <button className="rounded-xl bg-black text-white px-4 py-2 hover:opacity-90" type="submit">
                                        承認して反映
                                    </button>
                                </form>
                            ) : (
                                <div className="text-xs text-neutral-500">※ 生成するとタグ候補が出ます。</div>
                            )}
                        </div>
                    </section>
                ) : null}

                {/* ShopForm */}
                {(shop as any)?.id ? (
                    <div className="rounded-2xl border bg-white p-5">
                        <ShopForm shopId={String((shop as any).id)} defaults={formDefaults} />
                    </div>
                ) : null}
            </section>
        </div>
    );
}
