import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { loadOriginClientState } from "@/lib/origin/v7/server";
import OriginPageClient from "./OriginPageClient";

export const metadata = { title: "あなたの Origin — Aneurasync" };

export default async function OriginPage() {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const initialState = await loadOriginClientState(supabase, auth.user.id);

  return <OriginPageClient initialState={initialState} />;
}
