import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

export async function requireUser(nextPath: string) {
    const supabase = await supabaseServer();
    const { data } = await supabase.auth.getUser();

    if (!data.user) {
        redirect(`/login?next=${encodeURIComponent(nextPath)}`);
    }

    return { supabase, user: data.user };
}
