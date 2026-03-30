import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import GameClient from "./GameClient";

export default async function GamePage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const { gameId } = await params;
  return <GameClient gameId={gameId} />;
}
