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
                <Link className="rounded-lg border p-4 hover:bg-zinc-50" href="/my/orders?tab=purchases">
                    購入履歴
                </Link>
                <Link className="rounded-lg border p-4 hover:bg-zinc-50" href="/my/orders?tab=sales">
                    販売履歴
                </Link>
                <Link className="rounded-lg border p-4 hover:bg-zinc-50" href="/my/notifications">
                    通知
                </Link>
            </div>
        </main>
    );
}
