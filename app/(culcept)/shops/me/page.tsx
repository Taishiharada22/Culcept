// app/shops/me/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import SellerRecoPanel from "./SellerRecoPanel";
import ShopForm from "./shop-form";
import {
    toggleShopActiveAction,
    createShopDraftAction,
    bulkUpdateShopTagsAction,
} from "./actions";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

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

    const { data: myShops } = await supabase
        .from("shops")
        .select("id,slug,name_ja,status,is_active,created_at")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);

    const selectedId =
        String((sp as any)?.shop_id ?? "").trim() || (myShops?.[0]?.id ? String(myShops[0].id) : "");

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

    const forceReset = String((sp as any)?.reset ?? "") === "1";

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
    const totalShops = (myShops ?? []).length;
    const publishedCount = (myShops ?? []).filter((s: any) => s?.status === "published" || !!s?.is_active).length;
    const draftCount = Math.max(0, totalShops - publishedCount);

    // 記入完了チェック
    const hasName = !!String(formDefaults.name_ja ?? "").trim();
    const hasHeadline = !!String(formDefaults.headline ?? "").trim();
    const hasBio = !!String(formDefaults.bio ?? "").trim();
    const hasAvatar = !!String(formDefaults.avatar_url ?? "").trim();
    const hasTags = Array.isArray(formDefaults.style_tags) && formDefaults.style_tags.length > 0;
    const completedFields = [hasName, hasHeadline, hasBio, hasAvatar, hasTags].filter(Boolean).length;
    const totalFields = 5;
    const completionPct = Math.round((completedFields / totalFields) * 100);

    return (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">
            {/* ヘッダー */}
            <section className="relative overflow-hidden rounded-3xl border border-white/40 bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 p-6 sm:p-8 shadow-xl">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(129,140,248,0.15),transparent_60%)]" />
                <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                    <div>
                        <div className="text-xs font-bold tracking-[0.2em] uppercase text-indigo-300">Seller Studio</div>
                        <h1 className="text-3xl sm:text-4xl font-black text-white mt-1">マイショップ</h1>
                        <p className="text-sm text-slate-300 mt-2 max-w-md">
                            ショップの作成・編集・公開をここで管理。3ステップで開設できます。
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Link
                            href="/shops/open"
                            className="rounded-xl bg-white text-slate-900 px-5 py-2.5 text-sm font-bold hover:bg-slate-100 transition shadow-lg no-underline"
                        >
                            テンプレートで開設
                        </Link>
                        <form action={createShopDraftAction}>
                            <button className="rounded-xl border border-white/30 text-white px-5 py-2.5 text-sm font-bold hover:bg-white/10 transition" type="submit">
                                空白から作成
                            </button>
                        </form>
                        <Link href="/shops/me/products" className="rounded-xl border border-white/30 text-white px-5 py-2.5 text-sm font-bold hover:bg-white/10 transition no-underline">
                            商品管理
                        </Link>
                    </div>
                </div>

                {/* ステップガイド */}
                <div className="relative grid sm:grid-cols-3 gap-3 mt-6">
                    {[
                        { step: 1, title: "ショップを作成", desc: "テンプレ or 空で作成して枠を作る", icon: "🏗️" },
                        { step: 2, title: "プロフィールを整える", desc: "名前・紹介・タグ・バナーを入力", icon: "✏️" },
                        { step: 3, title: "公開する", desc: "プレビュー確認後に公開", icon: "🚀" },
                    ].map((s) => (
                        <div key={s.step} className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-4">
                            <div className="flex items-center gap-2">
                                <span className="text-lg">{s.icon}</span>
                                <span className="text-xs font-bold text-indigo-300">ステップ {s.step}</span>
                            </div>
                            <div className="text-sm font-bold text-white mt-1">{s.title}</div>
                            <div className="text-xs text-slate-400 mt-1">{s.desc}</div>
                        </div>
                    ))}
                </div>
            </section>

            {/* 通知バナー */}
            {errMsg ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700 flex items-center gap-2">
                    <span className="text-lg">⚠️</span> {errMsg}
                </div>
            ) : saved ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700 flex items-center gap-2">
                    <span className="text-lg">✅</span> 保存しました
                </div>
            ) : null}

            {/* ダッシュボード統計 */}
            <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="text-xs font-bold text-slate-400">合計</div>
                    <div className="text-3xl font-black text-slate-900 mt-1">{totalShops}</div>
                    <div className="text-xs text-slate-500 mt-1">作成済みショップ</div>
                </div>
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-sm">
                    <div className="text-xs font-bold text-emerald-600">公開中</div>
                    <div className="text-3xl font-black text-emerald-700 mt-1">{publishedCount}</div>
                    <div className="text-xs text-emerald-600 mt-1">パブリック</div>
                </div>
                <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 shadow-sm">
                    <div className="text-xs font-bold text-amber-600">下書き</div>
                    <div className="text-3xl font-black text-amber-700 mt-1">{draftCount}</div>
                    <div className="text-xs text-amber-600 mt-1">ドラフト</div>
                </div>
                {(shop as any)?.id ? (
                    <div className="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4 shadow-sm">
                        <div className="text-xs font-bold text-indigo-600">入力完了度</div>
                        <div className="text-3xl font-black text-indigo-700 mt-1">{completionPct}%</div>
                        <div className="w-full h-1.5 bg-indigo-100 rounded-full mt-2 overflow-hidden">
                            <div
                                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-500"
                                style={{ width: `${completionPct}%` }}
                            />
                        </div>
                    </div>
                ) : (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4 shadow-sm">
                        <div className="text-xs font-bold text-slate-400">入力完了度</div>
                        <div className="text-3xl font-black text-slate-300 mt-1">--</div>
                        <div className="text-xs text-slate-400 mt-1">ショップ未選択</div>
                    </div>
                )}
            </section>

            {/* ショップ切替タブ */}
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                    <div className="text-sm font-bold text-slate-800">ショップ切り替え</div>
                    <Link href="/shops" className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 no-underline">
                        公開一覧を見る →
                    </Link>
                </div>
                <div className="flex flex-wrap gap-2">
                    {(myShops ?? []).map((s: any) => {
                        const sid = String(s.id);
                        const active = sid === selectedId;
                        const label = String(s.name_ja || s.slug || "Shop").slice(0, 30);
                        const st = String(s.status ?? "");
                        const isPub = st === "published" || !!s.is_active;
                        return (
                            <Link
                                key={sid}
                                href={`/shops/me?shop_id=${sid}`}
                                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition no-underline ${
                                    active
                                        ? "bg-slate-900 text-white shadow-md"
                                        : "border border-slate-200 text-slate-700 hover:bg-slate-50"
                                }`}
                            >
                                <span className={`inline-block w-2 h-2 rounded-full ${isPub ? "bg-emerald-500" : "bg-amber-400"}`} />
                                {label}
                            </Link>
                        );
                    })}
                    {!myShops?.length ? (
                        <div className="text-sm text-slate-500">まだショップがありません。上のボタンから作成してください。</div>
                    ) : null}
                </div>
            </section>

            {/* 公開ステータスカード */}
            {(shop as any)?.id ? (
                <section className={`rounded-2xl border-2 p-5 shadow-sm transition ${
                    isPublished
                        ? "border-emerald-300 bg-gradient-to-r from-emerald-50 to-teal-50"
                        : "border-amber-300 bg-gradient-to-r from-amber-50 to-yellow-50"
                }`}>
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <span className={`inline-flex items-center justify-center w-10 h-10 rounded-xl text-lg ${
                                isPublished ? "bg-emerald-500 text-white" : "bg-amber-500 text-white"
                            }`}>
                                {isPublished ? "🌐" : "📝"}
                            </span>
                            <div>
                                <div className="text-xs font-bold text-slate-500">公開ステータス</div>
                                <div className={`text-lg font-black ${isPublished ? "text-emerald-700" : "text-amber-700"}`}>
                                    {isPublished ? "公開中" : "下書き"}
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            {viewHref ? (
                                <Link
                                    href={viewHref}
                                    className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 no-underline transition"
                                >
                                    {isPublished ? "公開ページを見る" : "プレビュー"}
                                </Link>
                            ) : null}
                            <form action={toggleShopActiveAction}>
                                <input type="hidden" name="shop_id" value={(shop as any).id} />
                                <input type="hidden" name="next_active" value={isPublished ? "0" : "1"} />
                                <button className={`rounded-xl px-5 py-2 text-sm font-bold transition ${
                                    isPublished
                                        ? "border border-red-200 bg-white text-red-600 hover:bg-red-50"
                                        : "bg-emerald-600 text-white hover:bg-emerald-700 shadow-md"
                                }`}>
                                    {isPublished ? "非公開にする" : "公開する"}
                                </button>
                            </form>
                        </div>
                    </div>

                    {/* 入力完了チェックリスト */}
                    <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-2">
                        {[
                            { label: "ショップ名", done: hasName, required: true },
                            { label: "キャッチコピー", done: hasHeadline, required: false },
                            { label: "紹介文", done: hasBio, required: false },
                            { label: "アバター", done: hasAvatar, required: false },
                            { label: "スタイルタグ", done: hasTags, required: false },
                        ].map((item) => (
                            <div
                                key={item.label}
                                className={`rounded-xl px-3 py-2 text-xs font-bold flex items-center gap-1.5 transition ${
                                    item.done
                                        ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                                        : "bg-white/80 text-slate-400 border border-slate-200"
                                }`}
                            >
                                <span>{item.done ? "✅" : "⬜"}</span>
                                {item.label}
                                {item.required && <span className="text-red-400">*</span>}
                            </div>
                        ))}
                    </div>
                </section>
            ) : (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                    <div className="text-4xl mb-3">🏪</div>
                    <div className="text-sm font-bold text-slate-600">編集対象のショップがありません</div>
                    <div className="text-xs text-slate-500 mt-1">上のボタンからショップを作成してください</div>
                </div>
            )}

            {/* ショップ編集フォーム */}
            {(shop as any)?.id ? (
                <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-7 shadow-sm">
                    <div className="flex items-center gap-3 mb-6">
                        <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white text-lg shadow-md">
                            ✏️
                        </span>
                        <div>
                            <h2 className="text-xl font-black text-slate-900">ショップ編集</h2>
                            <div className="text-xs text-slate-500">基本情報・タグ・ソーシャル・画像を設定</div>
                        </div>
                    </div>
                    <ShopForm
                        shopId={String((shop as any).id)}
                        defaults={formDefaults}
                        smartInput={{
                            effectiveUrl: String(effectiveUrl || "").trim(),
                            sourceUrl,
                            addressText,
                            suggestedTags: Array.isArray((shop as any)?.suggested_tags) ? ((shop as any).suggested_tags as string[]) : [],
                        }}
                    />
                </section>
            ) : null}

            {/* 一括タグ編集 */}
            {myShops?.length ? (
                <details className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <summary className="cursor-pointer text-sm font-bold text-slate-700 flex items-center gap-2">
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-slate-100 text-xs">⚙️</span>
                        高度な設定：タグ一括編集
                        <span className="ml-auto text-xs text-slate-400 font-normal">クリックで展開</span>
                    </summary>

                    <form action={runBulkUpdateShopTagsAction} className="mt-4 space-y-4">
                        <div className="flex flex-wrap items-center gap-3">
                            <label className="inline-flex items-center gap-2 text-sm font-bold">
                                <input type="checkbox" name="scope_all" value="1" className="rounded" />
                                すべてのショップに適用
                            </label>
                            <span className="text-xs text-slate-500">※ チェックしない場合は選択したショップのみ</span>
                        </div>

                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                            <div className="text-sm font-bold mb-2">対象ショップ</div>
                            <div className="flex flex-wrap gap-2">
                                {(myShops ?? []).map((s: any) => {
                                    const sid = String(s.id);
                                    const label = String(s.name_ja || s.slug || "Shop").slice(0, 30);
                                    const st = String(s.status ?? "");
                                    return (
                                        <label
                                            key={sid}
                                            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold hover:bg-slate-50 cursor-pointer"
                                        >
                                            <input type="checkbox" name="target_shop_id" value={sid} defaultChecked={sid === selectedId} className="rounded" />
                                            <span>{label}</span>
                                            <span className={`w-2 h-2 rounded-full ${st === "published" ? "bg-emerald-500" : "bg-amber-400"}`} />
                                        </label>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-4">
                            {[
                                { value: "add", label: "追加（既存に足す）", checked: true },
                                { value: "remove", label: "削除（指定を外す）", checked: false },
                                { value: "replace", label: "置き換え（全部差し替え）", checked: false },
                            ].map((opt) => (
                                <label key={opt.value} className="inline-flex items-center gap-2 text-sm font-bold cursor-pointer">
                                    <input type="radio" name="mode" value={opt.value} defaultChecked={opt.checked} />
                                    {opt.label}
                                </label>
                            ))}
                        </div>

                        <div className="space-y-2">
                            <div className="text-sm font-bold">タグ（カンマ区切り or JSON配列）</div>
                            <textarea
                                name="tags"
                                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm min-h-[90px] focus:ring-2 focus:ring-indigo-500 outline-none"
                                placeholder='例: vintage, street, designer, archive'
                            />
                        </div>

                        <input type="hidden" name="return_shop_id" value={selectedId} />

                        <button className="rounded-xl bg-slate-900 text-white px-5 py-2.5 text-sm font-bold hover:bg-slate-800 transition" type="submit">
                            一括反映する
                        </button>
                    </form>
                </details>
            ) : null}

            {/* セラーインサイト */}
            <details className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <summary className="cursor-pointer text-sm font-bold text-slate-700 flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-indigo-100 text-xs">💡</span>
                    セラーインサイト
                    <span className="ml-auto text-xs text-slate-400 font-normal">クリックで展開</span>
                </summary>
                <div className="mt-4">
                    <SellerRecoPanel />
                </div>
            </details>
        </div>
    );
}
