// app/shops/new/page.tsx
import "server-only";

import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import NewShopForm from "./NewShopForm";

export const dynamic = "force-dynamic";

export default async function NewShopPage() {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;

    if (!user) {
        // login導線はあなたの実装に合わせて
        return notFound();
    }

    return (
        <main className="mx-auto max-w-3xl px-4 py-10">
            <div className="mb-6 flex items-center justify-between">
                <div className="grid gap-1">
                    <h1 className="text-2xl font-extrabold tracking-tight">Create Shop</h1>
                    <p className="text-xs font-semibold text-zinc-600">
                        「自分の店」を作って、プロフィール/スタイル/世界観を出せるようにする。
                    </p>
                </div>

                <Link
                    href="/shops"
                    className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs font-black text-zinc-800 no-underline hover:bg-zinc-50"
                >
                    ← Shops
                </Link>
            </div>

            <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
                <NewShopForm />
            </section>
        </main>
    );
}
