import ConnectClient from "./ConnectClient";

export const metadata = { title: "カード交換 | Genome Card | Aneurasync" };

export default async function ConnectPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  return <ConnectClient targetUserId={userId} />;
}
