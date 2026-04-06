// app/calendar/page.tsx
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { requireBaseline } from "@/lib/baseline/requireBaseline";
import CalendarPageClient from "./CalendarPageClient";
import AnonymousRegistrationPage from "@/components/auth/AnonymousRegistrationPage";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();

    if (!auth?.user) {
        redirect("/login?next=/calendar");
    }

    if (auth.user.is_anonymous) {
        return <AnonymousRegistrationPage featureName="コーデ" />;
    }

    await requireBaseline(supabase, auth.user.id);

    return <CalendarPageClient />;
}
