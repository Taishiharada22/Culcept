import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isAllowedExternal } from "@/lib/allowlist";

export async function GET(req: Request) {
    const u = new URL(req.url);

    const to = u.searchParams.get("to") ?? "";
    const kind = (u.searchParams.get("kind") ?? "shop") as "shop" | "drop";
    const id = u.searchParams.get("id") ?? "";
    const ref = u.searchParams.get("ref") ?? "";

    if (!to) return new NextResponse("Missing to", { status: 400 });

    if (kind === "drop") {
        const res = isAllowedExternal(to);
        if (!res.ok) return new NextResponse(`Blocked: ${res.reason}`, { status: 400 });
    } else {
        let urlObj: URL;
        try { urlObj = new URL(to); } catch { return new NextResponse("Invalid URL", { status: 400 }); }
        if (urlObj.protocol !== "https:") return new NextResponse("Only https is allowed", { status: 400 });
    }

    if (id) {
        try {
            const h = await headers();
            const country = h.get("x-vercel-ip-country") ?? "ZZ";
            await supabaseAdmin.from("clickouts").insert({ kind, target_id: id, ref, country });
        } catch { }
    }

    return NextResponse.redirect(to, 302);
}
