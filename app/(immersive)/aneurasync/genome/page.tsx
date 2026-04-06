// app/aneurasync/genome/page.tsx
import { supabaseServer } from "@/lib/supabase/server";
import GenomePageClient from "./GenomePageClient";
import AnonymousRegistrationPage from "@/components/auth/AnonymousRegistrationPage";

export const metadata = {
  title: "Persona Genome | Aneurasync",
  description: "あなたの「似合う」を再現する Living Genome",
};

export default async function GenomePage() {
  try {
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.is_anonymous) {
      return <AnonymousRegistrationPage featureName="Genome" />;
    }
  } catch {
    // auth check failed — let page render normally
  }

  return <GenomePageClient />;
}
