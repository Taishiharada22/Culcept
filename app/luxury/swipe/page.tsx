// app/luxury/swipe/page.tsx
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import LuxurySwipeClient from "./LuxurySwipeClient";

export const dynamic = "force-dynamic";

export default async function LuxurySwipePage() {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();

    if (!auth?.user) {
        redirect("/login?next=/luxury/swipe");
    }

    return <LuxurySwipeClient />;
}
