import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import ConstellationClient from "./ConstellationClient";

export default async function ConstellationPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const { groupId } = await params;
  return <ConstellationClient groupId={groupId} />;
}
