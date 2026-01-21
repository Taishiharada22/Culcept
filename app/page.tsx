// app/page.tsx
import Link from "next/link";

export default function HomePage() {
    return (
        <main className="mx-auto grid max-w-4xl gap-6 py-6">
            <div className="grid gap-2">
                <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900">Culcept</h1>
                <p className="text-sm font-semibold text-zinc-600">
                    商品で探すか。ショップで探すか。<span className="font-black">“誰の店か”</span>が見える体験へ。
                </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <Link
                    href="/drops"
                    className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm no-underline transition hover:shadow-md"
                >
                    <div className="text-xs font-black text-zinc-500">Option 1</div>
                    <div className="mt-2 text-xl font-extrabold text-zinc-900">商品で探す</div>
                    <div className="mt-2 text-sm font-semibold text-zinc-600">いま熱いDropを見つける。クリックで詳細へ。</div>
                    <div className="mt-4 text-xs font-semibold text-zinc-400">Open →</div>
                </Link>

                <Link
                    href="/shops"
                    className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm no-underline transition hover:shadow-md"
                >
                    <div className="text-xs font-black text-zinc-500">Option 2</div>
                    <div className="mt-2 text-xl font-extrabold text-zinc-900">ショップで探す</div>
                    <div className="mt-2 text-sm font-semibold text-zinc-600">店主の世界観から選ぶ。“個人がブランディングできる”入口。</div>
                    <div className="mt-4 text-xs font-semibold text-zinc-400">Open →</div>
                </Link>

                <Link
                    href="/shops/me"
                    className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm no-underline transition hover:shadow-md"
                >
                    <div className="text-xs font-black text-zinc-500">Option 3</div>
                    <div className="mt-2 text-xl font-extrabold text-zinc-900">My Page</div>
                    <div className="mt-2 text-sm font-semibold text-zinc-600">自分のショップを作る/編集する。出品とブランディングの入口。</div>
                    <div className="mt-4 text-xs font-semibold text-zinc-400">Open →</div>
                </Link>
            </div>
        </main>
    );
}
