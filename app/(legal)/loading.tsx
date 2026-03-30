export default function LegalLoading() {
    return (
        <main
            className="min-h-screen px-5 py-14 text-slate-700"
            style={{
                background:
                    "linear-gradient(180deg, #fbfaf7 0%, #f1eadc 100%)",
            }}
        >
            <div className="mx-auto max-w-[920px]">
                <div className="mb-5 h-5 w-28 animate-pulse rounded-full bg-white/70" />
                <section className="rounded-[28px] border border-[#e7e1d6] bg-white p-8 shadow-[0_24px_60px_rgba(15,23,42,0.08)]">
                    <div className="h-3 w-32 animate-pulse rounded-full bg-[#f3e4d8]" />
                    <div className="mt-5 h-10 w-1/2 animate-pulse rounded-2xl bg-slate-200" />
                    <div className="mt-4 h-4 w-full animate-pulse rounded-full bg-slate-100" />
                    <div className="mt-2 h-4 w-5/6 animate-pulse rounded-full bg-slate-100" />
                    <div className="mt-10 space-y-5">
                        {Array.from({ length: 4 }).map((_, index) => (
                            <div key={index} className="space-y-3">
                                <div className="h-6 w-48 animate-pulse rounded-full bg-slate-200" />
                                <div className="h-4 w-full animate-pulse rounded-full bg-slate-100" />
                                <div className="h-4 w-11/12 animate-pulse rounded-full bg-slate-100" />
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        </main>
    );
}
