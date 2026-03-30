import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import ExploreClient from "./ExploreClient";

export const metadata = {
  title: "探索 | Rendezvous",
};

export default async function ExplorePage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/rendezvous/explore");

  return <ExploreClient userId={user.id} />;
}
