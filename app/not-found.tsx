// app/not-found.tsx
import Link from "next/link";

export default function NotFound() {
    return (
        <main className="mx-auto max-w-2xl px-4 py-16">
            <h1 className="text-3xl font-extrabold tracking-tight">Not found</h1>
            <p className="mt-3 text-sm font-semibold text-zinc-600">
                ページが見つからないか、削除された可能性があります。
            </p>
            <Link
                href="/drops"
                className="mt-6 inline-block rounded-md border border-zinc-200 px-4 py-2 text-sm font-extrabold no-underline hover:bg-zinc-50"
            >
                Go to Products
            </Link>
        </main>
    );
}
