// app/components/SiteHeader.tsx
import Link from "next/link";

type SiteHeaderProps = {
    isAuthenticated: boolean;
    unreadCount: number;
    userName?: string | null;
};

export default async function SiteHeader({
    isAuthenticated,
    unreadCount,
    userName,
}: SiteHeaderProps) {
    const initial = (userName?.trim()?.[0] || "U").toUpperCase();

    return (
        <header className="sticky top-0 z-40 border-b border-slate-200/60 bg-white/70 backdrop-blur-2xl">
            <div className="mx-auto max-w-6xl px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <Link href="/" className="flex items-center gap-3 no-underline">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500 via-purple-500 to-indigo-500 flex items-center justify-center text-white font-bold shadow-lg shadow-purple-500/30">
                                C
                            </div>
                            <span
                                className="text-xl font-bold text-slate-900"
                                style={{ fontFamily: "'Cormorant Garamond', serif" }}
                            >
                                Culcept
                            </span>
                        </Link>
                        <div className="hidden sm:flex items-center gap-2 rounded-full border border-white/70 bg-white/60 px-3 py-1 text-xs text-slate-500">
                            <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
                            AI Fashion Marketplace
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {isAuthenticated && (
                            <Link
                                href="/messages"
                                className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/70 bg-white/60 text-slate-600 transition hover:bg-white"
                                aria-label="Messages"
                            >
                                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                </svg>
                                {unreadCount > 0 && (
                                    <span className="absolute -top-1 -right-1 rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">
                                        {unreadCount}
                                    </span>
                                )}
                            </Link>
                        )}

                        {isAuthenticated ? (
                            <Link
                                href="/my"
                                className="relative inline-flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white font-semibold shadow-lg shadow-fuchsia-500/20"
                                aria-label="My Page"
                            >
                                {initial}
                                <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-400 border-2 border-white" />
                            </Link>
                        ) : (
                            <Link
                                href="/login"
                                className="rounded-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-fuchsia-500/20 transition hover:opacity-90"
                            >
                                Login
                            </Link>
                        )}
                    </div>
                </div>

            </div>
        </header>
    );
}
