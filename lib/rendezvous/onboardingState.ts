import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Rendezvousオンボーディング完了状態チェック
 */
export async function checkOnboardingCompleted(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ completed: boolean; hasProfile: boolean; hasPreferences: boolean }> {
  const [profileResult, preferencesResult] = await Promise.all([
    supabase
      .from("rendezvous_profiles")
      .select("id, onboarding_completed_at")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("rendezvous_preferences")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  const hasProfile = !!profileResult.data;
  const hasPreferences = !!preferencesResult.data;
  const completed = hasProfile && !!profileResult.data?.onboarding_completed_at;

  return { completed, hasProfile, hasPreferences };
}
