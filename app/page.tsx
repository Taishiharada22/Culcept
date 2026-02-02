// app/page.tsx
import Link from "next/link";
import AISearchBar from "@/components/search/AISearchBar";

export const dynamic = "force-dynamic";

export default function HomePage() {
    return (
        <main className="mx-auto max-w-5xl px-4 py-8 grid gap-8">
            {/* Hero / Branding */}
            <header className="grid gap-3 text-center">
                <h1
                    className="text-5xl md:text-6xl font-black tracking-tight text-slate-900"
                    style={{ fontFamily: "'Cormorant Garamond', serif" }}
                >
                    Culcept
                </h1>
                <p className="text-sm md:text-base font-semibold text-slate-600">
                    商品で探すか。ショップで探すか。&quot;誰の店か&quot;が見える体験へ。
                </p>
                <p className="text-sm font-bold text-slate-500">Powered by AI</p>

                {/* ✅ AI Search Bar */}
                <div className="max-w-3xl mx-auto mt-4">
                    <AISearchBar />
                </div>

                {/* ✅ Visual Search Link */}
                <div className="mt-2">
                    <Link
                        href="/visual-search"
                        className="inline-block rounded-xl border-2 border-purple-300 bg-purple-50 px-6 py-3 text-sm font-black text-purple-700 transition-all hover:bg-purple-100 no-underline"
                    >
                        🔍 Try Visual Search
                    </Link>
                </div>
            </header>

            {/* 2つの入口 */}
            <section className="grid gap-4 md:grid-cols-2">
                {/* ① 店舗入口 */}
                <Link
                    href="/shops"
                    className="group rounded-2xl border-2 border-purple-200 bg-gradient-to-br from-purple-50 to-white p-6 shadow-sm no-underline hover:shadow-xl hover:border-purple-400 transition-all duration-300 hover:-translate-y-1"
                >
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <div className="text-xs font-black text-purple-600">Entrance ①</div>
                            <div
                                className="mt-1 text-xl font-extrabold text-slate-900"
                                style={{ fontFamily: "'Cormorant Garamond', serif" }}
                            >
                                店舗から入る
                            </div>
                            <p className="mt-2 text-sm font-semibold text-slate-600 leading-7">
                                古着屋の入口。まずは <span className="font-black text-purple-600">店のURL</span> と紹介から。
                            </p>
                        </div>
                        <span className="shrink-0 rounded-full bg-purple-100 px-3 py-1 text-xs font-black text-purple-700 group-hover:bg-purple-200">
                            Shops →
                        </span>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                        <span className="rounded-full border border-purple-200 bg-white px-3 py-1 text-xs font-black text-purple-700">
                            店の一覧
                        </span>
                        <span className="rounded-full border border-purple-200 bg-white px-3 py-1 text-xs font-black text-purple-700">
                            店URLへ誘導
                        </span>
                        <span className="rounded-full border border-purple-200 bg-white px-3 py-1 text-xs font-black text-purple-700">
                            店/タグから探す
                        </span>
                    </div>
                </Link>

                {/* ② 個人入口 */}
                <Link
                    href="/drops"
                    className="group rounded-2xl border-2 border-orange-200 bg-gradient-to-br from-orange-50 to-white p-6 shadow-sm no-underline hover:shadow-xl hover:border-orange-400 transition-all duration-300 hover:-translate-y-1"
                >
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <div className="text-xs font-black text-orange-600">Entrance ②</div>
                            <div
                                className="mt-1 text-xl font-extrabold text-slate-900"
                                style={{ fontFamily: "'Cormorant Garamond', serif" }}
                            >
                                個人として入る
                            </div>
                            <p className="mt-2 text-sm font-semibold text-slate-600 leading-7">
                                おすすめ・検索・保存など、<span className="font-black text-orange-600">買い手側の入口</span>。
                            </p>
                        </div>
                        <span className="shrink-0 rounded-full bg-orange-100 px-3 py-1 text-xs font-black text-orange-700 group-hover:bg-orange-200">
                            Products →
                        </span>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                        <span className="rounded-full border border-orange-200 bg-white px-3 py-1 text-xs font-black text-orange-700">
                            おすすめ
                        </span>
                        <span className="rounded-full border border-orange-200 bg-white px-3 py-1 text-xs font-black text-orange-700">
                            タグ検索
                        </span>
                        <span className="rounded-full border border-orange-200 bg-white px-3 py-1 text-xs font-black text-orange-700">
                            保存
                        </span>
                    </div>
                </Link>
            </section>

            {/* 最低限の共通導線 */}
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-sm font-extrabold text-slate-900">Quick links</div>
                <div className="mt-3 flex flex-wrap gap-2">
                    <Link
                        href="/shops"
                        className="rounded-md border border-purple-200 bg-purple-50 px-3 py-2 text-sm font-extrabold text-purple-700 no-underline hover:bg-purple-100"
                    >
                        Browse shops
                    </Link>
                    <Link
                        href="/drops"
                        className="rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-extrabold text-orange-700 no-underline hover:bg-orange-100"
                    >
                        Browse Products
                    </Link>
                    <Link
                        href="/shops/me"
                        className="rounded-md border border-teal-600 bg-teal-600 px-3 py-2 text-sm font-extrabold text-white no-underline hover:bg-teal-700"
                    >
                        オーナー：Shop設定
                    </Link>
                    {/* ✅ 追加リンク（ナビに合わせて） */}
                    <Link
                        href="/search"
                        className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-extrabold text-emerald-800 no-underline hover:bg-emerald-100"
                    >
                        AI Search
                    </Link>
                    <Link
                        href="/visual-search"
                        className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-extrabold text-emerald-800 no-underline hover:bg-emerald-100"
                    >
                        Visual Search
                    </Link>
                </div>
            </section>

            {/* 既存コンテンツ...（ここに続けてOK） */}
        </main>
    );
}
