// lib/supabase/client.ts
"use client";

import { createBrowserClient } from "@supabase/ssr";

function mustGetEnv(name: string, value: string | undefined) {
    const v = (value ?? "").trim();
    if (!v) {
        throw new Error(
            `[supabaseBrowser] Missing env: ${name}. ` +
            `Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_URL / SUPABASE_ANON_KEY) in .env.local`
        );
    }
    return v;
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const anon =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;

// ブラウザ側は singleton 推奨（毎回作ると無駄 & 挙動がブレる）
let _client: ReturnType<typeof createBrowserClient> | null = null;

/**
 * Client Components から使える Supabase client
 * - server.ts と同じ env 解決ルール
 * - @supabase/ssr に合わせて cookie/session の整合性を取りやすい
 */
export function supabaseBrowser() {
    if (_client) return _client;

    _client = createBrowserClient(
        mustGetEnv("SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL", url),
        mustGetEnv("SUPABASE_ANON_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY", anon)
    );

    return _client;
}
