import { cookies } from "next/headers";
import { supabaseServer } from "@/lib/supabase/server";
import type { RendezvousDetailDTO } from "@/lib/rendezvous/types";
import RendezvousDetailClient from "./RendezvousDetailClient";
import RendezvousDetailClientFetch from "./RendezvousDetailClientFetch";
import RendezvousChatView from "@/components/rendezvous/RendezvousChatView";

/**
 * Rendezvous candidate detail page (server component).
 * Fetches candidate detail from API, renders hero + reasons + actions.
 * Falls back to client-side fetch if server-side fetch fails.
 * When ?chat=1 is present and candidate is mutual_liked/chat_opened, shows chat view.
 */

export const metadata = {
  title: "Rendezvous | Aneurasync",
};

async function fetchDetail(candidateId: string): Promise<RendezvousDetailDTO | null> {
  try {
    const supabase = await supabaseServer();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) return null;

    const cookieStore = await cookies();
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const res = await fetch(`${baseUrl}/api/rendezvous/${candidateId}`, {
      headers: {
        Cookie: cookieStore.toString(),
      },
      cache: "no-store",
    });

    if (!res.ok) return null;
    const data = await res.json();
    return data?.detail ?? data ?? null;
  } catch {
    return null;
  }
}

export default async function RendezvousCandidateDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ candidateId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { candidateId } = await params;
  const sp = await searchParams;
  const isChatMode = sp?.chat === "1";

  const detail = await fetchDetail(candidateId);

  if (!detail) {
    return <RendezvousDetailClientFetch candidateId={candidateId} />;
  }

  // Show chat view when ?chat=1 and candidate is in a chat-eligible state
  if (
    isChatMode &&
    (detail.candidateState === "mutual_liked" || detail.candidateState === "chat_opened")
  ) {
    return (
      <RendezvousChatView
        candidateId={candidateId}
        counterpartName={detail.counterpart.displayName}
      />
    );
  }

  return <RendezvousDetailClient detail={detail} />;
}
