import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { checkOnboardingCompleted } from "@/lib/rendezvous/onboardingState";
import MirrorPageClient from "./MirrorPageClient";

export const metadata = {
  title: "\u95A2\u4FC2\u6027\u306E\u93E1 | Rendezvous | Aneurasync",
};

export default async function MirrorPage() {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();

  if (!auth?.user) {
    redirect("/login");
  }

  const completed = await checkOnboardingCompleted(supabase, auth.user.id);
  if (!completed) {
    redirect("/rendezvous/onboarding");
  }

  return <MirrorPageClient />;
}
