import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function cleanNext(input: string | null) {
    const value = String(input ?? "").trim();
    if (!value.startsWith("/")) {
        return "/battle";
    }
    return value;
}

function readEnv(name: string, fallback?: string) {
    const value = (process.env[name] ?? fallback ?? "").trim();
    if (!value) {
        throw new Error(`Missing env: ${name}`);
    }
    return value;
}

export async function GET(request: NextRequest) {
    if (process.env.NODE_ENV === "production") {
        return NextResponse.json({ error: "Unavailable" }, { status: 404 });
    }

    const url = new URL(request.url);
    const email = String(url.searchParams.get("email") ?? "").trim();
    const password = String(url.searchParams.get("password") ?? "").trim();
    const next = cleanNext(url.searchParams.get("next"));

    if (!email || !password) {
        return NextResponse.json({ error: "email and password are required" }, { status: 400 });
    }

    const response = NextResponse.redirect(new URL(next, request.url));
    const cookieStore = await cookies();
    const supabase = createServerClient(
        readEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.SUPABASE_URL),
        readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.SUPABASE_ANON_KEY),
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll();
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value, options }) => {
                        cookieStore.set(name, value, options);
                        response.cookies.set(name, value, options);
                    });
                },
            },
        }
    );

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 401 });
    }

    return response;
}
