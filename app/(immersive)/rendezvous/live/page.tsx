import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import LiveHubClient from "./LiveHubClient";

// =============================================================================
// /rendezvous/live — Live Hub (5分セッション / 心理ゲーム / 星座)
// =============================================================================

export default async function LivePage() {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  return <LiveHubClient />;
}
