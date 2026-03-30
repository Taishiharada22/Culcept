// lib/ceo/withSkillTelemetry.ts
//
// Cron / API ハンドラに skill telemetry を挿入するユーティリティ。
// ceo_skill_runs テーブルが未作成でも安全に動作する（ログだけ落とす）。
//
import "server-only";
import { supabaseServer } from "@/lib/supabase/server";

export interface CronTracker {
  /** ハンドラ実行後に呼ぶ。ステータスとサマリを記録する */
  finish: (result: { ok: boolean; summary?: string }) => Promise<void>;
}

/**
 * Cron / skill 実行の開始を記録し、finish() で完了を記録する。
 *
 * @example
 * export async function GET(req: Request) {
 *   const t = await trackCronRun("stargazer-prophecy");
 *   try {
 *     // ... 本体処理 ...
 *     await t.finish({ ok: true, summary: `processed=5` });
 *     return NextResponse.json({ ok: true, processed: 5 });
 *   } catch (err) {
 *     await t.finish({ ok: false, summary: err.message });
 *     throw err;
 *   }
 * }
 */
export async function trackCronRun(
  skillName: string,
  targetType = "cron",
): Promise<CronTracker> {
  const start = performance.now();
  let runId: string | null = null;

  try {
    const supabase = await supabaseServer();
    const { data } = await supabase
      .from("ceo_skill_runs")
      .insert({
        skill_name: skillName,
        target_type: targetType,
        status: "running",
      })
      .select("id")
      .single();
    runId = data?.id ?? null;
  } catch {
    // テーブル未作成でもブロックしない
  }

  return {
    finish: async (result) => {
      if (!runId) return;
      const durationMs = Math.round(performance.now() - start);
      try {
        const supabase = await supabaseServer();
        await supabase
          .from("ceo_skill_runs")
          .update({
            status: result.ok ? "success" : "error",
            duration_ms: durationMs,
            summary: result.summary?.slice(0, 500) ?? (result.ok ? "ok" : "error"),
            finished_at: new Date().toISOString(),
          })
          .eq("id", runId);
      } catch {
        // best-effort
      }
    },
  };
}
