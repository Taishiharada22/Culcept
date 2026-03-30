import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { checkOnboardingCompleted } from "@/lib/rendezvous/onboardingState";
import OnboardingFlow from "@/components/rendezvous/onboarding/OnboardingFlow";

export const metadata = {
  title: "Rendezvous オンボーディング | Aneurasync",
};

export default async function OnboardingPage() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const status = await checkOnboardingCompleted(supabaseAdmin, user.id);

  if (status.completed) {
    redirect("/rendezvous");
  }

  return <OnboardingFlow userId={user.id} />;
}
