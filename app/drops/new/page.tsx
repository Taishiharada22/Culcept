// app/drops/new/page.tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import NewDropForm from "./NewDropForm";
import { createDropAction } from "./actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // ✅ Buffer/crypto を確実にNodeで

export default async function NewDropPage() {
    const supabase = await supabaseServer();
    const { data } = await supabase.auth.getUser();
    const user = data?.user;

    if (!user) redirect("/login?next=/drops/new");

    return (
        <div className="grid gap-4">
            <div className="flex items-center justify-between gap-3">
                <h1 className="text-2xl font-extrabold tracking-tight">New Drop</h1>
                <Link href="/shops/me" className="text-sm font-extrabold text-zinc-700 no-underline hover:text-zinc-950">
                    ← Back to Seller
                </Link>
            </div>

            {/* ✅ フォームはこれ1つに統一 */}
            <NewDropForm action={createDropAction as any} />
        </div>
    );
}
