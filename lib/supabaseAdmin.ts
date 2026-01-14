import "server-only";
import { createClient } from "@supabase/supabase-js";

function mustGetEnv(name: string, value: string | undefined) {
    const v = (value ?? "").trim();
    if (!v) {
        throw new Error(
            `[supabaseAdmin] Missing env: ${name}. ` +
            `Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY in .env.local`
        );
    }
    return v;
}

// URL は NEXT_PUBLIC_* を優先しつつ、なければ SUPABASE_URL も見る
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;

// Service Role は絶対にクライアントへ渡さない（server-only で守る）
const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;

export const supabaseAdmin = createClient(
    mustGetEnv("SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL", url),
    mustGetEnv("SUPABASE_SERVICE_ROLE_KEY", serviceKey),
    {
        auth: { persistSession: false, autoRefreshToken: false },
    }
);
