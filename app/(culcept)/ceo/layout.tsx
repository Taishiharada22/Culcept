// app/(culcept)/ceo/layout.tsx
import { requireCeo } from "@/lib/auth/requireCeo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function CeoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // CEO以外は自動リダイレクト（未ログイン→/start、権限なし→/）
  await requireCeo();

  return <>{children}</>;
}
