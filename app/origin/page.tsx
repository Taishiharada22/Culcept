import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import OriginPageClient from "./OriginPageClient";

export const metadata = { title: "あなたの Origin — Culcept" };

export default async function OriginPage() {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  return <OriginPageClient />;
}
