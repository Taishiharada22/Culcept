import ChatClient from "./ChatClient";

export const metadata = { title: "Chat | Aneurasync" };

export default async function ChatPage({ params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await params;
  return <ChatClient threadId={threadId} />;
}
