// app/visual-search/page.tsx
import Link from "next/link";
import VisualSearch from "@/components/search/VisualSearch";

export default function VisualSearchPage() {
    return (
        <div className="min-h-screen bg-[#0a0a0f] text-white">
            {/* ヘッダー */}
            <header className="border-b border-white/[0.06]">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4">
                    <div className="flex items-center gap-3">
                        <Link
                            href="/"
                            className="w-9 h-9 rounded-lg bg-white/[0.05] flex items-center justify-center text-white/60 hover:bg-white/10 hover:text-white transition-all"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </Link>
                        <div>
                            <h1 className="text-lg font-semibold">Visual Search</h1>
                            <p className="text-xs text-white/40">画像から似たアイテムを検索</p>
                        </div>
                    </div>
                </div>
            </header>

            <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
                <VisualSearch />
            </main>
        </div>
    );
}
