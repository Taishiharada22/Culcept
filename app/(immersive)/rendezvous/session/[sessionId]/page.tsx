import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import SessionRoomClient from "./SessionRoomClient";

// =============================================================================
// /rendezvous/session/[sessionId] — 5分匿名セッション
// =============================================================================

export default async function SessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const { sessionId } = await params;
  return <SessionRoomClient sessionId={sessionId} />;
}
