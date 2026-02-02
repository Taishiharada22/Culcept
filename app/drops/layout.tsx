// app/drops/layout.tsx
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import LogoutButton from "@/app/components/LogoutButton";
import { Button } from "@/components/ui/button";

export default async function DropsLayout({ children }: { children: React.ReactNode }) {
    const supabase = await supabaseServer();
    const { data } = await supabase.auth.getUser();
    const user = data.user;

    return (
        <div className="min-h-screen bg-white">
            <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/85 backdrop-blur">
                <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-4">
                        <Link href="/drops" className="text-lg font-extrabold tracking-tight no-underline">
                            Culcept
                        </Link>
                        <nav className="hidden items-center gap-3 text-sm font-semibold text-zinc-700 sm:flex">
                            <Link className="no-underline hover:text-zinc-950" href="/drops">
                                Products
                            </Link>
                            <Link className="no-underline hover:text-zinc-950" href="/drops?mine=1">
                                My Products
                            </Link>
                            <Link className="no-underline hover:text-zinc-950" href="/drops/new">
                                New
                            </Link>
                        </nav>
                    </div>

                    <div className="flex items-center gap-3">
                        {user ? (
                            <>
                                <span className="hidden text-xs font-semibold text-zinc-600 md:inline">{user.email}</span>
                                <LogoutButton />
                            </>
                        ) : (
                            <Button as-child="true" variant="outline">
                                <Link className="no-underline" href="/login?next=/drops">
                                    Login
                                </Link>
                            </Button>
                        )}
                    </div>
                </div>
            </header>

            <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
        </div>
    );
}
