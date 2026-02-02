// app/loading.tsx
export default function Loading() {
    return (
        <main className="mx-auto max-w-5xl px-4 py-10">
            <div className="h-7 w-40 animate-pulse rounded-md bg-zinc-200" />
            <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 9 }).map((_, i) => (
                    <div key={i} className="overflow-hidden rounded-lg border border-zinc-200">
                        <div className="h-56 w-full animate-pulse bg-zinc-200" />
                        <div className="p-5">
                            <div className="h-5 w-3/4 animate-pulse rounded bg-zinc-200" />
                            <div className="mt-3 h-4 w-1/2 animate-pulse rounded bg-zinc-200" />
                        </div>
                    </div>
                ))}
            </div>
        </main>
    );
}
