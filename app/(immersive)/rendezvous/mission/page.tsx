import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import MissionListClient from "./MissionListClient";

export default async function MissionPage() {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");
  return <MissionListClient />;
}
