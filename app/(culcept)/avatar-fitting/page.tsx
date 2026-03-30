import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getEvaluationHistory } from "@/lib/avatar-fitting";
import AvatarFittingClient from "./AvatarFittingClient";

export const metadata = {
  title: "フィッティング診断 | Aneurasync",
  description: "分身があなたの代わりに服の相性を判定します",
};

export default async function AvatarFittingPage() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/start");

  const history = await getEvaluationHistory(supabase, user.id, 10).catch(() => []);

  return <AvatarFittingClient initialHistory={history} userName={user.user_metadata?.display_name ?? undefined} />;
}
