// /talk/qr — QR コードスキャナー & マイ QR コード
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import QRPageClient from "./QRPageClient";

export default async function QRPage() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  return <QRPageClient />;
}
