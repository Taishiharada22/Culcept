import { supabaseServer } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Phase0Client from "./Phase0Client";

export default async function Phase0Page() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return <Phase0Client userId={user.id} />;
}
