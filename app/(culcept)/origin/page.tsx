import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { requireBaseline } from "@/lib/baseline/requireBaseline";
import { loadOriginClientState } from "@/lib/origin/v7/server";
import OriginPageClient from "./OriginPageClient";
import AnonymousRegistrationPage from "@/components/auth/AnonymousRegistrationPage";

export const metadata = { title: "あなたの Origin — Aneurasync" };

export default async function OriginPage() {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  if (auth.user.is_anonymous) {
    return <AnonymousRegistrationPage featureName="日記" />;
  }

  await requireBaseline(supabase, auth.user.id);

  const initialState = await loadOriginClientState(supabase, auth.user.id);

  return <OriginPageClient initialState={initialState} />;
}
