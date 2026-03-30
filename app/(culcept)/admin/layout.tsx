// app/admin/layout.tsx — レガシー admin は /ceo にリダイレクト
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    redirect("/ceo");
}
