// app/(culcept)/my-page/page.tsx
import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import MyPageClient from "./MyPageClient";

export const dynamic = "force-dynamic";

export default async function MyPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/my-page");

  // ── 並列でデータ取得 ──
  const [
    { data: sgProfile },
    { data: resolvedType },
    { count: observationCount },
    { count: unreadNotifCount },
    { data: originSnap },
  ] = await Promise.all([
    supabase
      .from("stargazer_profiles")
      .select("dimensions, archetype_code, confidence")
      .eq("user_id", user.id)
      .single(),
    supabase
      .from("stargazer_resolved_types")
      .select("axis_scores, archetype_code, archetype_name, archetype_emoji")
      .eq("user_id", user.id)
      .single(),
    supabase
      .from("stargazer_observations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("read_at", null),
    supabase
      .from("origin_snapshots")
      .select("id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle(),
  ]);

  const archetype = resolvedType ?? sgProfile;

  return (
    <MyPageClient
      user={{
        id: user.id,
        email: user.email ?? "",
        displayName:
          user.user_metadata?.display_name ??
          user.user_metadata?.name ??
          user.email?.split("@")[0] ??
          "User",
        avatarUrl: user.user_metadata?.avatar_url ?? null,
      }}
      stargazer={{
        archetypeCode: archetype?.archetype_code ?? null,
        archetypeName: resolvedType?.archetype_name ?? null,
        archetypeEmoji: resolvedType?.archetype_emoji ?? null,
        confidence: sgProfile?.confidence ?? 0,
        observationCount: observationCount ?? 0,
      }}
      hasOrigin={!!originSnap}
      unreadNotifCount={unreadNotifCount ?? 0}
    />
  );
}
