import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import PartnerCandidateList from "@/components/rendezvous/partner/PartnerCandidateList";

export const metadata = {
  title: "パートナー候補 | Rendezvous",
};

export default async function PartnerCandidatesPage() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return <PartnerCandidateList />;
}
