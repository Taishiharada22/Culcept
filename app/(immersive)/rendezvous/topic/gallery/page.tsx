import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { GalleryClient } from "./GalleryClient";

// =============================================================================
// /rendezvous/topic/gallery — 匿名ギャラリー
// =============================================================================

export default async function GalleryPage({
  searchParams,
}: {
  searchParams: Promise<{ topicId?: string; category?: string }>;
}) {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const params = await searchParams;
  const topicId = params.topicId;
  const category = params.category ?? "general";

  if (!topicId) redirect("/rendezvous");

  return <GalleryClient topicId={topicId} category={category} />;
}
