import Link from "next/link";
import DropForm from "./DropForm";

export default function NewDropPage() {
    return (
        <main className="mx-auto max-w-3xl px-4 py-10">
            <div className="mb-6 flex items-center justify-between">
                <Link href="/drops" className="text-sm font-extrabold text-zinc-700 no-underline hover:text-zinc-950">
                    ← Drops
                </Link>
                <div className="text-xs font-semibold text-zinc-500">New</div>
            </div>

            <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
                <h1 className="text-xl font-black tracking-tight">New Drop</h1>
                <p className="mt-1 text-xs font-semibold text-zinc-500">画像は任意。後からEditでも追加できる。</p>

                <div className="mt-5">
                    <DropForm />
                </div>
            </section>
        </main>
    );
}
