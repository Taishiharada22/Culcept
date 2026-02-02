// app/my/page.tsx
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function MyPage() {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();

    if (!auth?.user) {
        return (
            <main className="mx-auto max-w-2xl px-4 py-16">
                <h1 className="text-2xl font-extrabold">My Page</h1>
                <p className="mt-3 text-sm text-zinc-600">ログインしてください。</p>
                <Link className="mt-6 inline-block underline" href="/login">
                    Login
                </Link>
            </main>
        );
    }

    return (
        <main className="mx-auto max-w-2xl px-4 py-16">
            <h1 className="text-2xl font-extrabold">My Page</h1>

            <div className="mt-8 grid gap-3">
                <Link className="rounded-lg border p-4 hover:bg-zinc-50 flex items-center gap-3" href="/my/orders?tab=purchases">
                    <span className="text-2xl">🛒</span>
                    <div>
                        <div className="font-medium">購入履歴</div>
                        <div className="text-sm text-zinc-500">過去の購入を確認</div>
                    </div>
                </Link>
                <Link className="rounded-lg border p-4 hover:bg-zinc-50 flex items-center gap-3" href="/my/orders?tab=sales">
                    <span className="text-2xl">💰</span>
                    <div>
                        <div className="font-medium">販売履歴</div>
                        <div className="text-sm text-zinc-500">売上を確認</div>
                    </div>
                </Link>
                <Link className="rounded-lg border p-4 hover:bg-zinc-50 flex items-center gap-3" href="/favorites">
                    <span className="text-2xl">❤️</span>
                    <div>
                        <div className="font-medium">お気に入り</div>
                        <div className="text-sm text-zinc-500">いいねした商品</div>
                    </div>
                </Link>
                <Link className="rounded-lg border p-4 hover:bg-zinc-50 flex items-center gap-3" href="/my-page/notifications">
                    <span className="text-2xl">🔔</span>
                    <div>
                        <div className="font-medium">通知</div>
                        <div className="text-sm text-zinc-500">お知らせを確認</div>
                    </div>
                </Link>
                <Link className="rounded-lg border p-4 hover:bg-zinc-50 flex items-center gap-3" href="/settings/notifications">
                    <span className="text-2xl">⚙️</span>
                    <div>
                        <div className="font-medium">通知設定</div>
                        <div className="text-sm text-zinc-500">通知のカスタマイズ</div>
                    </div>
                </Link>
            </div>
        </main>
    );
}
