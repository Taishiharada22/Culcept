import CardViewClient from "./CardViewClient";

export const metadata = { title: "Genome Card 閲覧 | Aneurasync" };

export default async function CardViewPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  return <CardViewClient userId={userId} />;
}
