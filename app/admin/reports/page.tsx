// app/admin/reports/page.tsx
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isAdminEmail } from "@/lib/admin";
import { notFound, redirect } from "next/navigation";
import { setReportStatusAction } from "./actions";

type ReportRow = {
    id: string;
    created_at: string;
    target_type: string;
    target_id: string;
    reporter_id: string | null;
    reason: string;
    details: string | null;
    status: string;
};

export default async function AdminReportsPage() {
    const supabase = await supabaseServer();
    const { data } = await supabase.auth.getUser();
    const user = data.user;

    if (!user) redirect("/login?next=/admin/reports");
    if (!isAdminEmail(user.email)) return notFound();

    const { data: rows, error } = await supabaseAdmin
        .from("reports")
        .select("id,created_at,target_type,target_id,reporter_id,reason,details,status")
        .order("created_at", { ascending: false })
        .limit(200);

    if (error) {
        return (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
                {error.message}
            </div>
        );
    }

    const items = (rows ?? []) as ReportRow[];

    return (
        <main className="mx-auto max-w-5xl px-4 py-10">
            <div className="mb-6 flex items-center justify-between">
                <h1 className="text-2xl font-extrabold tracking-tight">Admin: Reports</h1>
                <Link href="/drops" className="text-sm font-extrabold text-zinc-700 no-underline hover:text-zinc-950">
                    ← Products
                </Link>
            </div>

            <div className="grid gap-3">
                {items.map((r) => (
                    <div key={r.id} className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="text-xs font-semibold text-zinc-500">
                                {new Date(r.created_at).toLocaleString()} / <span className="font-black">{r.status}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <form action={setReportStatusAction.bind(null, r.id, "reviewing")}>
                                    <button className="rounded-md border border-zinc-200 bg-white px-3 py-1 text-xs font-extrabold text-zinc-700 hover:bg-zinc-50">
                                        Reviewing
                                    </button>
                                </form>
                                <form action={setReportStatusAction.bind(null, r.id, "resolved")}>
                                    <button className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-extrabold text-emerald-700 hover:bg-emerald-100">
                                        Resolved
                                    </button>
                                </form>
                                <form action={setReportStatusAction.bind(null, r.id, "dismissed")}>
                                    <button className="rounded-md border border-zinc-200 bg-white px-3 py-1 text-xs font-extrabold text-zinc-700 hover:bg-zinc-50">
                                        Dismiss
                                    </button>
                                </form>
                            </div>
                        </div>

                        <div className="mt-2 grid gap-1">
                            <div className="text-sm font-black text-zinc-900">
                                {r.target_type} /{" "}
                                <Link
                                    href={`/drops/${r.target_id}`}
                                    className="text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-900"
                                >
                                    {r.target_id}
                                </Link>
                            </div>

                            <div className="text-xs font-semibold text-zinc-600">
                                reason: <span className="font-black">{r.reason}</span> / reporter:{" "}
                                <span className="font-mono">{r.reporter_id ?? "anonymous"}</span>
                            </div>

                            {r.details ? (
                                <div className="mt-2 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm font-semibold text-zinc-800">
                                    {r.details}
                                </div>
                            ) : null}
                        </div>
                    </div>
                ))}

                {items.length === 0 ? (
                    <div className="rounded-xl border border-zinc-200 bg-white p-6 text-sm font-semibold text-zinc-600">
                        No reports.
                    </div>
                ) : null}
            </div>
        </main>
    );
}
