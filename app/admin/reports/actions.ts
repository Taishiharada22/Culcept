// app/admin/reports/actions.ts
"use server";

import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isAdminEmail } from "@/lib/admin";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

type Status = "open" | "reviewing" | "resolved" | "dismissed";

export async function setReportStatusAction(reportId: string, status: Status) {
    const supabase = await supabaseServer();
    const { data } = await supabase.auth.getUser();
    const user = data.user;

    if (!user) redirect("/login?next=/admin/reports");
    if (!isAdminEmail(user.email)) redirect("/drops");

    const { error } = await supabaseAdmin
        .from("reports")
        .update({
            status,
            reviewed_by: user.id,
            reviewed_at: new Date().toISOString(),
        } as any)
        .eq("id", reportId);

    if (error) throw error;

    revalidatePath("/admin/reports");
}
