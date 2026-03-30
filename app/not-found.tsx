// app/not-found.tsx
import Link from "next/link";

export default function NotFound() {
    return (
        <main
            className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center"
            style={{ background: "linear-gradient(170deg, #08061a, #0c0a24, #0a0618)" }}
        >
            <p className="text-5xl">🔭</p>
            <h1 className="mt-4 font-serif text-3xl font-extrabold tracking-tight text-white">
                観測範囲外です
            </h1>
            <p className="mt-3 text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>
                このページは見つからないか、削除された可能性があります。
            </p>
            <Link
                href="/"
                className="mt-8 inline-block rounded-full px-6 py-2.5 text-sm font-semibold text-white no-underline transition hover:opacity-90"
                style={{ background: "linear-gradient(135deg, #8B5CF6, #6366F1)" }}
            >
                ホームに戻る
            </Link>
        </main>
    );
}
