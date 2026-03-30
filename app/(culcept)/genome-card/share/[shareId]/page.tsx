// app/(culcept)/genome-card/share/[shareId]/page.tsx
// 公開シェアページ — 認証不要でGenome Cardの読み取り専用表示

import { Metadata } from "next";
import SharePageClient from "./SharePageClient";

interface PageProps {
  params: Promise<{ shareId: string }>;
}

/** shareId からユーザー公開データを取得し、動的OGメタデータを生成 */
async function fetchShareMeta(shareId: string) {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";
    const res = await fetch(`${baseUrl}/api/genome-card/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shareId }),
      next: { revalidate: 3600 }, // 1h cache
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.card ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { shareId } = await params;
  const card = await fetchShareMeta(shareId);

  const displayName = card?.displayName ?? "ユーザー";
  const archetypeLabel = card?.archetypeLabel ?? "";
  const title = archetypeLabel
    ? `${displayName}のGenome Card — ${archetypeLabel}`
    : `${displayName}のGenome Card — Aneurasync`;
  const description = archetypeLabel
    ? `${archetypeLabel} — あなたの深層を映し出すカード`
    : "あなたの深層を映し出すカード。Aneurasyncで自分の分身を作ろう。";

  // OG画像: archetypeCodeがあれば動的生成
  const ogImageParams = new URLSearchParams({
    type: "genome-card",
    ...(card?.archetypeCode && { code: card.archetypeCode }),
    ...(displayName && { name: displayName }),
  });
  const ogImageUrl = `/api/og-image?${ogImageParams.toString()}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      ...(card?.archetypeCode && { images: [ogImageUrl] }),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function SharePage({ params }: PageProps) {
  const { shareId } = await params;
  return <SharePageClient shareId={shareId} />;
}
