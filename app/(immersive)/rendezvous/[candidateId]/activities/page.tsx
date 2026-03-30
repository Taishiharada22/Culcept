import { supabaseServer } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ActivitiesHub from "@/components/rendezvous/activities/ActivitiesHub";

export default async function ActivitiesPage({
  params,
}: {
  params: Promise<{ candidateId: string }>;
}) {
  const { candidateId } = await params;

  // Auth check
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <ActivitiesHub candidateId={candidateId} />;
}
