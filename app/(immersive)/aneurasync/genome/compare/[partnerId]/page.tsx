// app/aneurasync/genome/compare/[partnerId]/page.tsx
// Server component — renders comparison page shell

import type { Metadata } from "next";
import ComparePageClient from "./ComparePageClient";

export const metadata: Metadata = {
  title: "Genome Compare | Aneurasync",
};

export default async function CompareGenomePage({
  params,
}: {
  params: Promise<{ partnerId: string }>;
}) {
  const { partnerId } = await params;
  return <ComparePageClient partnerId={partnerId} />;
}
