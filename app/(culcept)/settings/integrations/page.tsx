/**
 * P3-A-1-2 G-α: 設定 > 連携 page
 *
 * 設計書: docs/alter-plan-p3-a-1-1-oauth-scaffold-readiness.md §1.8
 *
 * 役割:
 *   - server component で auth check
 *   - 未認証 → /login へ redirect
 *   - 認証済 → CalendarConnectionSection を render
 *
 * 範囲外 (= 別 phase):
 *   - 他 provider (= Microsoft / Apple) section
 *   - migration apply
 *   - subscription DB write
 */

import { redirect } from "next/navigation";

import { supabaseServer } from "@/lib/supabase/server";

import { CalendarConnectionSection } from "./CalendarConnectionSection";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage(): Promise<React.ReactElement> {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();

  if (!auth?.user) {
    redirect("/login?next=/settings/integrations");
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8" data-testid="integrations-page">
      <header className="mb-6">
        <p className="text-xs font-medium uppercase tracking-widest text-indigo-600">
          ANEURASYNC · 設定
        </p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">連携</h1>
        <p className="mt-2 text-sm text-slate-600">
          外部サービスと Aneurasync の繋がりを管理します。
        </p>
      </header>

      <div className="space-y-6">
        <CalendarConnectionSection />

        {/* placeholder: 将来 Microsoft Outlook / Apple iCloud section が並ぶ */}
        <section
          className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center"
          data-testid="integrations-future-providers"
        >
          <p className="text-xs text-slate-400">
            Microsoft Outlook / Apple カレンダーの連携は今後追加予定です。
          </p>
        </section>
      </div>
    </main>
  );
}
