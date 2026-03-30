import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCacheStats } from "@/lib/ai/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPABASE_URL = (
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  process.env.SUPABASE_URL ??
  ""
).trim();

const SUPABASE_ANON_KEY = (
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.SUPABASE_ANON_KEY ??
  ""
).trim();

async function checkSupabase(): Promise<"ok" | "error"> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return "error";

  try {
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    // 軽量クエリで接続確認
    const { error } = await client
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .limit(1);
    return error ? "error" : "ok";
  } catch {
    return "error";
  }
}

export async function GET() {
  const start = performance.now();

  const [supabaseStatus] = await Promise.all([checkSupabase()]);

  const cacheStats = getCacheStats();
  const totalCacheRequests = cacheStats.hits + cacheStats.misses;
  const hitRateStr =
    totalCacheRequests === 0
      ? "N/A"
      : `${(cacheStats.hitRate * 100).toFixed(1)}%`;

  const elapsed = performance.now() - start;

  return NextResponse.json(
    {
      ok: supabaseStatus === "ok",
      version: "1.0.0",
      timestamp: new Date().toISOString(),
      responseMs: Math.round(elapsed),
      services: {
        supabase: supabaseStatus,
        ai_cache: {
          hits: cacheStats.hits,
          misses: cacheStats.misses,
          errors: cacheStats.errors,
          hitRate: hitRateStr,
        },
      },
    },
    {
      status: supabaseStatus === "ok" ? 200 : 503,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
