import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { createRealFaceSession, getRealFaceSession } from "@/lib/realFaceSessions";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
    try {
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();
        if (!auth?.user) {
            return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
        }

        const origin = request.headers.get("origin") ?? new URL(request.url).origin;
        const draftToken = crypto.randomUUID();
        const captureUrl = `${origin}/body-color/avatar/capture?token=${draftToken}`;
        const session = await createRealFaceSession(auth.user.id, captureUrl);

        const correctedUrl = `${origin}/body-color/avatar/capture?token=${session.token}`;
        session.captureUrl = correctedUrl;

        return NextResponse.json({
            ok: true,
            session: {
                token: session.token,
                status: session.status,
                createdAt: session.createdAt,
                captureUrl: correctedUrl,
            },
        });
    } catch (error) {
        console.error("real-face session POST error:", error);
        return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
    }
}

export async function GET(request: NextRequest) {
    try {
        const token = request.nextUrl.searchParams.get("token");
        const session = await getRealFaceSession(token);

        if (!session) {
            return NextResponse.json({ ok: false, error: "Session not found" }, { status: 404 });
        }

        return NextResponse.json({
            ok: true,
            session: {
                token: session.token,
                status: session.status,
                createdAt: session.createdAt,
                updatedAt: session.updatedAt,
                captureUrl: session.captureUrl,
                result: session.result ?? null,
            },
        });
    } catch (error) {
        console.error("real-face session GET error:", error);
        return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
    }
}
