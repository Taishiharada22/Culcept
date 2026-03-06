// middleware.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * ここに「ログイン必須にしたいprefix」を追加。
 * 例: ["/feed", "/dashboard", "/api/swipe"]
 * いまは“落としにくい”ように空にしてる（必要になったら追加）。
 */
const PROTECTED_PREFIXES: string[] = [
    // "/feed",
    // "/dashboard",
    // "/api/swipe",
];

function isProtectedPath(pathname: string) {
    return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export async function proxy(req: NextRequest) {
    const res = NextResponse.next();

    // ✅ middleware では cookies() を使わない。必ず req.cookies / res.cookies
    const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        cookies: {
            getAll() {
                return req.cookies.getAll();
            },
            setAll(cookiesToSet) {
                for (const c of cookiesToSet) {
                    res.cookies.set(c.name, c.value, c.options);
                }
            },
        },
    });

    // セッション更新（重要）
    // supabase が必要に応じて refresh して cookie を res に反映する
    const {
        data: { user },
    } = await supabase.auth.getUser();

    // 認証ガード（必要なパスだけ）
    if (isProtectedPath(req.nextUrl.pathname) && !user) {
        const url = req.nextUrl.clone();
        url.pathname = "/login";
        url.searchParams.set("next", req.nextUrl.pathname);
        return NextResponse.redirect(url);
    }

    return res;
}

export const config = {
    matcher: [
        // next internal / static は除外
        "/((?!_next/static|_next/image|favicon.ico).*)",
    ],
};
