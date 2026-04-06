import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { requireBaseline } from "@/lib/baseline/requireBaseline";
import TalkPageClient from "./TalkPageClient";
import AnonymousRegistrationPage from "@/components/auth/AnonymousRegistrationPage";

export const metadata = { title: "Talk | Aneurasync" };

export default async function TalkPage() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/talk");

  if (user.is_anonymous) {
    return <AnonymousRegistrationPage featureName="トーク" />;
  }

  await requireBaseline(supabase, user.id);

  return <TalkPageClient />;
}
