import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { TopicAnswerClient } from "./TopicAnswerClient";

// =============================================================================
// /rendezvous/topic — お題回答ページ
// =============================================================================

export default async function TopicPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const params = await searchParams;
  const category = params.category ?? "general";

  return <TopicAnswerClient category={category} />;
}
