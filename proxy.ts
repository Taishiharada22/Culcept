// proxy.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// 静的ファイルなどは除外（必要に応じて調整）
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

export default async function proxy(request: NextRequest) {
  const res = NextResponse.next();

  // env 未設定でも落とさない
  if (!SUPABASE_URL || !ANON_KEY) return res;

  const supabase = createServerClient(SUPABASE_URL, ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const c of cookiesToSet) {
          res.cookies.set(c.name, c.value, c.options);
        }
      },
    },
  });

  // セッション更新（必要ならrefreshされ、setAll経由でCookieがresに載る）
  await supabase.auth.getUser().catch(() => null);

  return res;
}
