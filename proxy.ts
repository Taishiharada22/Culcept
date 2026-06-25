// proxy.ts — 認証の一元化
// Supabase Auth トークンリフレッシュ + 保護ルートへの未認証リダイレクト
// セキュリティヘッダー・レスポンスタイミング・レートリミットインフラを含む
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";

// ---------------------------------------------------------------------------
// Rate limit infrastructure (simple in-memory counter per minute window)
// 本番向けではなく計測・可視化用のインフラ。Redis 等への置換を前提とする。
// ---------------------------------------------------------------------------
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 300; // requests per window per IP

interface RateBucket {
    count: number;
    resetAt: number;
}

const rateBuckets = new Map<string, RateBucket>();

/** IP ごとのカウンタをインクリメントし、残数を返す */
function trackRateLimit(ip: string): number {
    const now = Date.now();
    let bucket = rateBuckets.get(ip);

    if (!bucket || now >= bucket.resetAt) {
        bucket = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
        rateBuckets.set(ip, bucket);
    }

    bucket.count += 1;
    return Math.max(0, RATE_LIMIT_MAX - bucket.count);
}

// 古いバケットを定期的に掃除（メモリリーク防止）
setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of rateBuckets) {
        if (now >= bucket.resetAt) rateBuckets.delete(key);
    }
}, RATE_LIMIT_WINDOW_MS);

// ---------------------------------------------------------------------------
// Security headers（全レスポンスに付与）
// ---------------------------------------------------------------------------
function applySecurityHeaders(res: NextResponse): void {
    res.headers.set("X-Content-Type-Options", "nosniff");
    res.headers.set("X-Frame-Options", "DENY");
    res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
}

// ---------------------------------------------------------------------------
// Public route definitions
// ---------------------------------------------------------------------------

// 認証不要のパブリックルート（完全一致）
const PUBLIC_PATHS = new Set([
    "/",
    "/login",
    "/auth/reset-password",
    "/auth/callback",
    "/offline",
    "/opengraph-image",
    "/type",          // 24タイプ一覧ページ
]);

// プレフィックスマッチでパブリック判定するパス
const PUBLIC_PREFIXES = [
    "/legal/",
    "/api/",        // API は各 route.ts 内で認証判断
    "/public/",     // 静的アセット
    "/type/",       // アーキタイプ公開ページ（SNSシェア用ランディング）
    "/stargazer",   // 後ログイン型: 匿名セッションで利用可能（クライアント側で認証処理）
];

// 拡張子付きの静的ファイルを public 扱いにする
// Next.js は public/ 配下のファイルを "/" 直下で配信するため、
// /samples/figure/sphinx.png 等が proxy の認証対象にならないようにする
const PUBLIC_FILE = /\.(?:png|jpg|jpeg|gif|webp|svg|ico|bmp|avif|mp3|mp4|woff2?|ttf|otf|css|js|json|xml|txt|pdf|wav|ogg|webm|html)$/i;

function isPublicRoute(pathname: string): boolean {
    if (PUBLIC_PATHS.has(pathname)) return true;
    if (PUBLIC_FILE.test(pathname)) return true;
    return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

// ---------------------------------------------------------------------------
// Archived scope 封じ込め（production-ization D-7 / 2026-06-25）
// ---------------------------------------------------------------------------
// fashion/commerce/dating（CEO「復活させない」archive）+ rendezvous（別 project 分離）の
// 旧 route を **本番でのみ** 404 化する単一ゲート。env `MAINLINE_SCOPE_ONLY === "true"` の時だけ作動。
//   - dev/preview（既定 OFF）= 従来どおり到達（全 flag smoke を壊さない）。
//   - 認証より優先（未認証でも login へ流さず 404＝archive の存在を露出しない）。
//   - flag OFF で即時可逆。`/api/` は本ゲート対象外（PUBLIC_PREFIX で先に return・各 route 認証＝D-9 別途）。
//   - mainline（plan/calendar/origin/genome-card/stargazer/talk/messages/my-page/settings/sns/body-color/type）は非対象。
const MAINLINE_SCOPE_ONLY = process.env.MAINLINE_SCOPE_ONLY === "true";

const ARCHIVED_PREFIXES = [
    // fashion / commerce / dating（archive）
    "/wardrobe", "/auction", "/ranking", "/products", "/shops", "/drops",
    "/checkout", "/orders", "/my-drops", "/try-on", "/turntable", "/3d-viewer",
    "/avatar-fitting", "/coordinate", "/feed", "/for-you", "/items", "/match",
    "/stylist", "/visual-search", "/style-drive", "/style-quiz", "/style-profile",
    "/explore", "/eye-analysis", "/search", "/tribes",
    // rendezvous（別 project 分離・本番では当面封じ込め。route のみ／cron=vercel.json・api=D-9 別途）
    "/rendezvous",
];

function isArchivedRoute(pathname: string): boolean {
    return ARCHIVED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

// ---------------------------------------------------------------------------
// Main proxy handler
// ---------------------------------------------------------------------------

export async function proxy(req: NextRequest) {
    const startTime = performance.now();

    let res = NextResponse.next({ request: req });

    // ✅ proxy では cookies() を使わない。必ず req.cookies / res.cookies
    const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        cookies: {
            getAll() {
                return req.cookies.getAll();
            },
            setAll(cookiesToSet) {
                // request 側にもセット（次のリクエスト用）
                cookiesToSet.forEach(({ name, value }) =>
                    req.cookies.set(name, value)
                );
                // response を再作成して cookie を反映
                res = NextResponse.next({ request: req });
                for (const c of cookiesToSet) {
                    res.cookies.set(c.name, c.value, c.options);
                }
            },
        },
    });

    // トークンリフレッシュ（全リクエストで実行 — Supabase 推奨パターン）
    const {
        data: { user },
    } = await supabase.auth.getUser();

    // --- ヘッダー付与（全レスポンス共通） ---
    applySecurityHeaders(res);
    res.headers.set("X-Response-Time", `${(performance.now() - startTime).toFixed(1)}ms`);

    // API ルートにはレートリミットヘッダーを付与
    if (req.nextUrl.pathname.startsWith("/api/")) {
        const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
            ?? req.headers.get("x-real-ip")
            ?? "unknown";
        const remaining = trackRateLimit(ip);
        res.headers.set("X-RateLimit-Remaining", String(remaining));
    }

    // パブリックルートはそのまま通す
    if (isPublicRoute(req.nextUrl.pathname)) {
        return res;
    }

    // Archived scope 封じ込め（D-7・本番のみ）: fashion/rendezvous の旧 route を 404 化。
    //   認証判定より前＝未認証でも login に流さず not-found（archive の存在を露出しない）。
    //   未マッチ path への rewrite で App Router の not-found.tsx（404）を描画。flag OFF では本 block 不実行。
    if (MAINLINE_SCOPE_ONLY && isArchivedRoute(req.nextUrl.pathname)) {
        const nf = req.nextUrl.clone();
        nf.pathname = "/_archived_not_found";
        const res404 = NextResponse.rewrite(nf);
        applySecurityHeaders(res404);
        res404.headers.set("X-Response-Time", `${(performance.now() - startTime).toFixed(1)}ms`);
        return res404;
    }

    // 未認証 → /login にリダイレクト（next パラメータ付き）
    if (!user) {
        const url = req.nextUrl.clone();
        url.pathname = "/login";
        url.searchParams.set("next", req.nextUrl.pathname);
        const redirectRes = NextResponse.redirect(url);
        applySecurityHeaders(redirectRes);
        redirectRes.headers.set("X-Response-Time", `${(performance.now() - startTime).toFixed(1)}ms`);
        return redirectRes;
    }

    return res;
}

export const config = {
    matcher: [
        // next internal / static は除外
        "/((?!_next/static|_next/image|favicon.ico).*)",
    ],
};
