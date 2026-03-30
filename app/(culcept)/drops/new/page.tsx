// app/drops/new/page.tsx
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import NewDropPageClient from "./NewDropPageClient";
import { createDropAction } from "./actions";
import { extractStoredBodyFootReference } from "@/lib/body/footMeasurements";

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

    const [{ data: bodyProfile }, { data: measurementRows }] = await Promise.all([
        supabase.from("user_body_profiles").select("display_labels").eq("user_id", user.id).maybeSingle(),
        supabase
            .from("user_body_measurements")
            .select("measurements")
            .eq("user_id", user.id)
            .order("measured_at", { ascending: false })
            .limit(1),
    ]);

    const userFootReference = extractStoredBodyFootReference({
        measurements: measurementRows?.[0]?.measurements ?? null,
        displayLabels: bodyProfile?.display_labels ?? null,
    });

    return (
        <NewDropPageClient
            imp={imp}
            action={createDropAction as any}
            userFootReference={userFootReference}
        />
    );
}
