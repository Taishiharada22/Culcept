// app/settings/profile/page.tsx
import { supabaseServer } from "@/lib/supabase/server";
import ProfileClient from "./ProfileClient";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user ?? null;

    if (!user) {
        return <ProfileClient isLoggedIn={false} />;
    }

    const meta = (user.user_metadata ?? {}) as Record<string, any>;

    return (
        <ProfileClient
            isLoggedIn
            defaults={{
                displayName: String(meta.display_name ?? meta.name ?? meta.full_name ?? "").trim(),
                avatarUrl: String(meta.avatar_url ?? "").trim(),
                bio: String(meta.bio ?? "").trim(),
                location: String(meta.location ?? "").trim(),
                website: String(meta.website ?? "").trim(),
                email: user.email ?? null,
                userId: user.id,
                createdAt: user.created_at ?? null,
            }}
        />
    );
}
