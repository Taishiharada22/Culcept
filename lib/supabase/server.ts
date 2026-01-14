// lib/supabase/server.ts
import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

function mustGetEnv(name: string, value: string | undefined) {
    const v = (value ?? "").trim();
    if (!v) {
        throw new Error(
            `[supabaseServer] Missing env: ${name}. ` +
            `Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_URL / SUPABASE_ANON_KEY) in .env.local`
        );
    }
    return v;
}

const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    process.env.SUPABASE_URL;

const anon =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.SUPABASE_ANON_KEY;

/**
 * Server Components / Server Actions / Route Handlers から使える Supabase client
 * - Server Component では cookie の set が禁止 → setAll を try/catch で無視して落ちないようにする
 * - Server Action / Route Handler では cookie set が許可 → 普通に更新される
 */
export async function supabaseServer() {
    // Next の cookies() が sync/async どっちでも落ちないように吸収
    const maybe = cookies() as any;
    const cookieStore = typeof maybe?.then === "function" ? await maybe : maybe;

    return createServerClient(
        mustGetEnv("SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL", url),
        mustGetEnv("SUPABASE_ANON_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY", anon),
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll();
                },
                setAll(cookiesToSet) {
                    // ここが今回のクラッシュ原因。Server Component だと cookieStore.set が例外になる
                    try {
                        cookiesToSet.forEach(({ name, value, options }: any) => {
                            try {
                                cookieStore.set(name, value, options);
                            } catch {
                                // Server Component から呼ばれた場合は無視（Next仕様）
                            }
                        });
                    } catch {
                        // 念のため全体も握る
                    }
                },
            },
        }
    );
}
