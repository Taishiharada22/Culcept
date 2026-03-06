// app/my/notifications/page.tsx
import { supabaseServer } from "@/lib/supabase/server";
import NotificationsClient from "./NotificationsClient";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();

    if (!auth?.user) {
        return <NotificationsClient isLoggedIn={false} notifications={[]} />;
    }

    const { data: rows, error } = await supabase
        .from("notifications")
        .select("id,type,title,body,link,created_at,read_at")
        .order("created_at", { ascending: false })
        .limit(100);

    const notifications = (rows ?? []).map((n: any) => ({
        id: String(n?.id ?? ""),
        type: n?.type ?? null,
        title: n?.title ?? null,
        body: n?.body ?? null,
        link: n?.link ?? null,
        created_at: n?.created_at ?? null,
        read_at: n?.read_at ?? null,
    }));

    return (
        <NotificationsClient
            isLoggedIn
            notifications={notifications}
            errorMessage={error?.message ?? null}
        />
    );
}
