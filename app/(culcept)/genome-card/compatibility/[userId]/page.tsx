// /genome-card/compatibility/[userId] — 相性詳細ページ（骨格）
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import CompatibilityClient from "./CompatibilityClient";

export default async function CompatibilityPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  return <CompatibilityClient targetUserId={userId} />;
}
