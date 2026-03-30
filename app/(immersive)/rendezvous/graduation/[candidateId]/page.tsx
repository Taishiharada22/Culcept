import { cookies } from "next/headers";
import { supabaseServer } from "@/lib/supabase/server";
import type { GraduationData } from "@/lib/rendezvous/graduationCeremony";
import GraduationCeremonyClient from "./GraduationCeremonyClient";

/**
 * Graduation Ceremony Page (server component)
 * 関係が美しい結論に達したときの卒業セレモニーページ。
 * サーバー側でデータをフェッチし、クライアントコンポーネントに渡す。
 */

export const metadata = {
  title: "Graduation Ceremony | Rendezvous | Aneurasync",
};

type GraduationResponse = {
  ok: boolean;
  graduation?: GraduationData;
  story?: string[];
  error?: string;
};

async function fetchGraduation(
  candidateId: string,
): Promise<GraduationResponse | null> {
  try {
    const supabase = await supabaseServer();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) return null;

    const cookieStore = await cookies();
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const res = await fetch(`${baseUrl}/api/rendezvous/graduation`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieStore.toString(),
      },
      body: JSON.stringify({ candidateId }),
      cache: "no-store",
    });

    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export default async function GraduationCeremonyPage({
  params,
}: {
  params: Promise<{ candidateId: string }>;
}) {
  const { candidateId } = await params;
  const result = await fetchGraduation(candidateId);

  if (!result?.graduation || !result.story) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white/60">
        <div className="text-center">
          <p className="text-lg mb-2">セレモニーを読み込めませんでした</p>
          <p className="text-sm text-white/40">
            関係データが見つからないか、権限がありません。
          </p>
          <a
            href="/rendezvous"
            className="inline-block mt-6 px-4 py-2 rounded-full bg-white/10 text-white/70 hover:bg-white/20 transition-colors text-sm"
          >
            Rendezvous に戻る
          </a>
        </div>
      </div>
    );
  }

  return (
    <GraduationCeremonyClient
      graduation={result.graduation}
      story={result.story}
      candidateId={candidateId}
    />
  );
}
