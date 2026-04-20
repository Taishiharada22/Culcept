// app/(culcept)/my-page/page.tsx
import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { requireBaseline } from "@/lib/baseline/requireBaseline";
import MyPageClient from "./MyPageClient";
import AnonymousRegistrationPage from "@/components/auth/AnonymousRegistrationPage";

export const dynamic = "force-dynamic";

export default async function MyPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/my-page");

  if (user.is_anonymous) {
    return <AnonymousRegistrationPage featureName="マイページ" />;
  }

  await requireBaseline(supabase, user.id);

  // ── 並列でデータ取得 ──
  const [
    { data: sgProfile },
    { data: resolvedType },
    { count: observationCount },
    { count: unreadNotifCount },
    { data: originSnap },
    { data: baselineRow },
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
    // 2026-04-19 baseline 編集対応: /my-page から baseline を表示・編集する
    supabase
      .from("profiles")
      .select(
        "prefecture, city, baseline_home_label, baseline_home_place_type, baseline_home_lat, baseline_home_lng, baseline_completed_at",
      )
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  const archetype = resolvedType ?? sgProfile;

  // coords_status 派生（API §3 と同じルール）
  const homeLat = baselineRow?.baseline_home_lat != null ? Number(baselineRow.baseline_home_lat) : null;
  const homeLng = baselineRow?.baseline_home_lng != null ? Number(baselineRow.baseline_home_lng) : null;
  const prefecture = baselineRow?.prefecture ?? null;
  const coordsStatus: "resolved" | "fallback" | "unresolved" =
    homeLat != null
      ? "resolved"
      : prefecture
        ? "fallback"
        : "unresolved";

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
      baseline={{
        prefecture,
        city: baselineRow?.city ?? null,
        homeLabel: baselineRow?.baseline_home_label ?? null,
        homePlaceType: (baselineRow?.baseline_home_place_type as "home" | "other" | undefined) ?? "home",
        homeCoords: homeLat != null && homeLng != null ? { lat: homeLat, lng: homeLng } : null,
        coordsStatus,
        completedAt: baselineRow?.baseline_completed_at ?? null,
      }}
    />
  );
}
