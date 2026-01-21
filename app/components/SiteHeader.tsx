// app/components/SiteHeader.tsx
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { signOutAction } from "@/app/actions/auth";

export default async function SiteHeader() {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user ?? null;

    return (
        <header className="border-b border-zinc-200 bg-white">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
                <div className="flex items-center gap-6">
                    <Link href="/" className="text-lg font-black tracking-tight text-zinc-950 no-underline">
                        Culcept
                    </Link>

                    <nav className="flex items-center gap-4 text-sm font-extrabold text-zinc-800">
                        <Link href="/drops" className="no-underline hover:text-zinc-950">
                            Drops
                        </Link>
                        <Link href="/shops" className="no-underline hover:text-zinc-950">
                            Shops
                        </Link>
                        <Link href="/shops/me" className="no-underline hover:text-zinc-950">
                            My Page
                        </Link>
                        <Link href="/drops/new" className="no-underline hover:text-zinc-950">
                            New
                        </Link>
                    </nav>
                </div>

                <div className="flex items-center gap-2">
                    {user ? (
                        <form action={signOutAction}>
                            <button
                                type="submit"
                                className="rounded-md border border-zinc-200 px-4 py-2 text-sm font-extrabold text-zinc-900 hover:bg-zinc-50"
                            >
                                Logout
                            </button>
                        </form>
                    ) : (
                        <Link
                            href="/login"
                            className="rounded-md border border-zinc-200 px-4 py-2 text-sm font-extrabold text-zinc-900 no-underline hover:bg-zinc-50"
                        >
                            Login
                        </Link>
                    )}
                </div>
            </div>
        </header>
    );
}
