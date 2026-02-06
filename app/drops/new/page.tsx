// app/drops/new/page.tsx
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import NewDropPageClient from "./NewDropPageClient";
import { createDropAction } from "./actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SP = Record<string, string | string[] | undefined>;

function spStr(v: unknown) {
    return String(Array.isArray(v) ? v[0] : v ?? "").trim();
}

function addQuery(url: string, params: Record<string, string | null | undefined>) {
    const qs = Object.entries(params)
        .filter(([, v]) => v != null && String(v).trim() !== "")
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join("&");
    if (!qs) return url;
    return url + (url.includes("?") ? "&" : "?") + qs;
}

type PageProps = {
    searchParams?: Promise<SP>;
};

export default async function NewDropPage({ searchParams }: PageProps) {
    const sp = (await searchParams) ?? {};
    const imp = spStr(sp.imp ?? sp.impressionId ?? sp.impression_id) || null;

    const supabase = await supabaseServer();
    const { data } = await supabase.auth.getUser();
    const user = data?.user;

    if (!user) {
        const nextUrl = addQuery("/drops/new", { imp });
        redirect(`/login?next=${encodeURIComponent(nextUrl)}`);
    }

    return (
        <NewDropPageClient
            imp={imp}
            action={createDropAction as any}
        />
    );
}
