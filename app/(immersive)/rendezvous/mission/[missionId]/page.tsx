import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import MissionRoomClient from "./MissionRoomClient";

export default async function MissionRoomPage({
  params,
}: {
  params: Promise<{ missionId: string }>;
}) {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const { missionId } = await params;
  return <MissionRoomClient missionId={missionId} />;
}
