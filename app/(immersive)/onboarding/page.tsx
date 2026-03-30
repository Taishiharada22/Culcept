// app/(immersive)/onboarding/page.tsx
// Server component: auth guard + onboarding status check

import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import OnboardingFlow from "./OnboardingFlow";

export const dynamic = "force-dynamic";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/onboarding");
  }

  const sp = (await searchParams) ?? {};
  const forceRedo = sp.force === "true";

  // force=true の場合、onboarded_at をリセットして再オンボーディング可能にする
  if (forceRedo) {
    await supabase
      .from("profiles")
      .update({ onboarded_at: null })
      .eq("id", user.id);
  } else {
    // Check if already onboarded
    const { data } = await supabase
      .from("profiles")
      .select("onboarded_at")
      .eq("id", user.id)
      .maybeSingle();

    if (data?.onboarded_at) {
      redirect("/");
    }
  }

  return <OnboardingFlow />;
}
