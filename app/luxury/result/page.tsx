// app/luxury/result/page.tsx
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import LuxuryResultClient from "./LuxuryResultClient";

export const dynamic = "force-dynamic";

export default async function LuxuryResultPage() {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();

    if (!auth?.user) {
        redirect("/login?next=/luxury/result");
    }

    return <LuxuryResultClient />;
}
