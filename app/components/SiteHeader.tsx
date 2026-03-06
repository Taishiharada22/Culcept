// app/components/SiteHeader.tsx
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { signOutAction } from "@/app/actions/auth";

export default async function SiteHeader() {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user ?? null;

    return (
        <header className="border-b border-slate-200 bg-white">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
                <div className="flex items-center gap-6">
                    <Link href="/" className="text-lg font-black tracking-tight no-underline" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
                        <span className="bg-gradient-to-r from-purple-600 via-orange-500 to-teal-500 bg-clip-text text-transparent">
                            Culcept
                        </span>
                    </Link>

                    <nav className="flex items-center gap-4 text-sm font-extrabold text-slate-800">
                        <Link href="/drops" className="no-underline hover:text-orange-600 transition-colors">
                            Products
                        </Link>
                        <Link href="/shops" className="no-underline hover:text-purple-600 transition-colors">
                            Shops
                        </Link>
                        <Link href="/shops/me" className="no-underline hover:text-teal-600 transition-colors">
                            My Page
                        </Link>
                        <Link href="/drops/new" className="no-underline hover:text-orange-600 transition-colors">
                            New
                        </Link>
                    </nav>
                </div>

                <div className="flex items-center gap-2">
                    {user ? (
                        <form action={signOutAction}>
                            <button
                                type="submit"
                                className="rounded-md border border-slate-200 px-4 py-2 text-sm font-extrabold text-slate-900 hover:bg-slate-50 transition-colors"
                            >
                                Logout
                            </button>
                        </form>
                    ) : (
                        <Link
                            href="/login"
                            className="rounded-md bg-gradient-to-r from-orange-500 to-orange-600 px-4 py-2 text-sm font-extrabold text-white no-underline hover:from-orange-600 hover:to-orange-700 transition-all shadow-sm"
                        >
                            Login
                        </Link>
                    )}
                </div>
            </div>
        </header>
    );
}
