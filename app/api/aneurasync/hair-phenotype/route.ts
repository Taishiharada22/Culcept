// app/api/aneurasync/hair-phenotype/route.ts
// Hair Phenotype — GET / POST (upsert)

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

const VALID_LENGTHS = new Set(["veryshort", "short", "bob", "medium", "semilong", "long"]);
const VALID_BANGS = new Set(["maegaminashi", "throw", "omome", "nagashi", "center", "up"]);
const VALID_SILHOUETTES = new Set(["straight", "layer", "wolf", "uchimaki", "sotohane", "volume"]);
const VALID_TEXTURES = new Set(["tyokumou", "nami", "yuru", "spiral", "kuse", "shikkari", "carl", "airy", "tight"]);

function validateOptional(value: unknown, validSet: Set<string>): string | null {
  if (!value || typeof value !== "string") return null;
  return validSet.has(value) ? value : null;
}

// ─── GET ───
export async function GET() {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("hair_phenotype")
      .select("*")
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, hair_phenotype: data ?? null });
  } catch (error) {
    console.error("hair-phenotype GET error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// ─── POST: upsert ───
interface PostBody {
  length?: string;
  bangs?: string;
  silhouette?: string;
  texture?: string;
  color?: string;
  color_hex?: string;
  recipe?: Record<string, unknown>;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: PostBody = await req.json().catch(() => ({}));

    // Fetch existing for version increment
    const { data: existing } = await supabase
      .from("hair_phenotype")
      .select("version")
      .eq("user_id", auth.user.id)
      .maybeSingle();

    const version = (existing?.version ?? 0) + 1;

    const row = {
      user_id: auth.user.id,
      length: validateOptional(body.length, VALID_LENGTHS),
      bangs: validateOptional(body.bangs, VALID_BANGS),
      silhouette: validateOptional(body.silhouette, VALID_SILHOUETTES),
      texture: validateOptional(body.texture, VALID_TEXTURES),
      color: typeof body.color === "string" ? body.color : null,
      color_hex: typeof body.color_hex === "string" ? body.color_hex : null,
      recipe: body.recipe ?? {},
      version,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("hair_phenotype")
      .upsert(row, { onConflict: "user_id" });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, version });
  } catch (error) {
    console.error("hair-phenotype POST error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
