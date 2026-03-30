import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { checkOnboardingCompleted } from "@/lib/rendezvous/onboardingState";
import ConnectionHome from "@/components/rendezvous/ConnectionHome";

/**
 * つながり枠 — アバター先行型マッチング
 * friendship / community / business(cocreation) のサブモード切替。
 * 身元確認は不要。
 */

export const metadata = {
  title: "つながり | Rendezvous",
};

export default async function ConnectionPage() {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();

  if (!auth?.user) {
    redirect("/login");
  }

  const onboarding = await checkOnboardingCompleted(supabase, auth.user.id);
  if (!onboarding.completed) {
    redirect("/rendezvous/onboarding");
  }

  return <ConnectionHome />;
}
