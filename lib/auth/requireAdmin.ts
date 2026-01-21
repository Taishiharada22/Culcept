import "server-only";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/requireUser";
import { isAdminEmail } from "@/lib/auth/isAdmin";

export async function requireAdmin(nextPath: string) {
    const { supabase, user } = await requireUser(`/login?next=${encodeURIComponent(nextPath)}`);

    if (!isAdminEmail(user.email)) {
        redirect("/");
    }

    return { supabase, user };
}
