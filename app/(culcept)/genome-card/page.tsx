import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { requireBaseline } from "@/lib/baseline/requireBaseline";
import GenomeCardPageClient from "./GenomeCardPageClient";
import AnonymousRegistrationPage from "@/components/auth/AnonymousRegistrationPage";

export const metadata = { title: "Genome Card | Aneurasync" };

export default async function GenomeCardPage() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/genome-card");

  if (user.is_anonymous) {
    return <AnonymousRegistrationPage featureName="Genome Card" />;
  }

  await requireBaseline(supabase, user.id);

  return <GenomeCardPageClient />;
}
