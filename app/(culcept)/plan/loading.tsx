/**
 * Plan route — server-side loading (auth check 中の表示) (W1-5)
 *
 * page.tsx の async server component（auth gate）処理中に表示される。
 * Client 側の data fetch loading は PlanClient の LoadingState で別途扱う。
 */

import { Skeleton } from "@/components/ui/glassmorphism-design";

export default function Loading() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-white to-slate-50 px-4 py-8">
      <div className="mx-auto max-w-3xl space-y-4">
        <Skeleton variant="rectangular" height={32} width="40%" />
        <Skeleton variant="rectangular" height={20} width="80%" />
        <div className="mt-6 space-y-3">
          <Skeleton variant="rectangular" height={60} />
          <Skeleton variant="rectangular" height={60} />
          <Skeleton variant="rectangular" height={60} />
        </div>
      </div>
    </main>
  );
}
