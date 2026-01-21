import Link from "next/link";

export const revalidate = 60;

function Tile({ href, title, desc, badge }: { href: string; title: string; desc: string; badge?: string }) {
    return (
        <Link href={href} className="group rounded-2xl border bg-white p-6 shadow-sm transition hover:shadow-md">
            <div className="flex items-center justify-between gap-3">
                <div className="text-xs font-black tracking-wide text-zinc-500">Explore</div>
                {badge ? (
                    <span className="rounded-full border border-zinc-200 bg-white px-2 py-1 text-[11px] font-black text-zinc-700">
                        {badge}
                    </span>
                ) : null}
            </div>

            <div className="mt-2 text-2xl font-extrabold tracking-tight text-zinc-900">{title}</div>
            <p className="mt-3 text-sm font-semibold leading-7 text-zinc-600">{desc}</p>
            <div className="mt-6 text-sm font-black text-zinc-900 group-hover:underline">Open →</div>
        </Link>
    );
}

export default function ExplorePage() {
    return (
        <main className="mx-auto max-w-5xl px-4 py-10">
            <h1 className="text-3xl font-extrabold tracking-tight">Explore</h1>
            <p className="mt-2 text-sm font-semibold text-zinc-600">
                入口は <span className="font-black">商品</span> / <span className="font-black">ショップ</span> /{" "}
                <span className="font-black">MY PAGE</span> の3つ。
            </p>

            <div className="mt-8 grid gap-4 md:grid-cols-3">
                <Tile href="/drops" title="服で探す" desc="Hot / Top / New で回遊。比較→購入まで。" />
                <Tile href="/shops" title="店で探す" desc="世界観から入る。店→商品へ落とす。" />
                <Tile href="/me" title="MY PAGE" badge="Create / Edit" desc="自分のブランドショップを作る・編集する。出品/管理もここに集約。" />
            </div>
        </main>
    );
}
