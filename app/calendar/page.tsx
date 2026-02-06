// app/calendar/page.tsx
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import CalendarPageClient from "./CalendarPageClient";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();

    if (!auth?.user) {
        redirect("/login?next=/calendar");
    }

    return <CalendarPageClient />;
}
