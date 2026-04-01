// app/components/SiteHeader.tsx
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { signOutAction } from "@/app/(culcept)/login/actions";

export default async function SiteHeader() {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user ?? null;

    return (
        <header className="border-b border-slate-100/80 bg-white/70 backdrop-blur-xl sticky top-0 z-40">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
                <Link href="/" className="text-lg font-black tracking-tight no-underline" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
                    <span className="bg-gradient-to-r from-violet-600 via-indigo-500 to-cyan-500 bg-clip-text text-transparent">
                        Aneurasync
                    </span>
                </Link>

                <div className="flex items-center gap-2">
                    {user ? (
                        <form action={signOutAction}>
                            <button
                                type="submit"
                                className="rounded-full border border-slate-200/60 px-4 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors"
                            >
                                ログアウト
                            </button>
                        </form>
                    ) : (
                        <Link
                            href="/login"
                            className="rounded-full bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white no-underline hover:bg-slate-700 transition-all"
                        >
                            ログイン
                        </Link>
                    )}
                </div>
            </div>
        </header>
    );
}
