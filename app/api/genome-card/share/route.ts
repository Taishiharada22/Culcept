// GET /api/genome-card/share — 公開シェアURL生成
// POST /api/genome-card/share — シェアIDからカードデータ取得（公開用）
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import crypto from "crypto";

/**
 * ユーザーIDを暗号化してshareIdを生成
 * 簡易的なAES暗号化（URL safe base64）
 */
const SHARE_SECRET = process.env.GENOME_SHARE_SECRET ?? "aneurasync-genome-share-2026-default-key!";

function encryptUserId(userId: string): string {
  const iv = crypto.randomBytes(12);
  const key = crypto.createHash("sha256").update(SHARE_SECRET).digest();
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  let encrypted = cipher.update(userId, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag().toString("hex");
  // iv(24) + tag(32) + encrypted
  const combined = iv.toString("hex") + tag + encrypted;
  // URL safe base64
  return Buffer.from(combined, "hex")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function decryptShareId(shareId: string): string | null {
  try {
    // URL safe base64 decode
    const padded = shareId.replace(/-/g, "+").replace(/_/g, "/");
    const hex = Buffer.from(padded, "base64").toString("hex");
    const iv = Buffer.from(hex.slice(0, 24), "hex");
    const tag = Buffer.from(hex.slice(24, 56), "hex");
    const encrypted = hex.slice(56);
    const key = crypto.createHash("sha256").update(SHARE_SECRET).digest();
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch {
    return null;
  }
}

/**
 * GET /api/genome-card/share?userId=xxx
 * 認証ユーザーが自分のシェアURLを取得
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // userId パラメータが指定されていれば使う（自分のみ）
    const { searchParams } = new URL(req.url);
    const requestedUserId = searchParams.get("userId");
    if (requestedUserId && requestedUserId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const shareId = encryptUserId(user.id);
    const origin = req.headers.get("origin") ?? req.headers.get("x-forwarded-host")
      ? `https://${req.headers.get("x-forwarded-host")}`
      : new URL(req.url).origin;
    const shareUrl = `${origin}/genome-card/share/${shareId}`;

    return NextResponse.json({ ok: true, shareId, shareUrl });
  } catch (error) {
    console.error("[genome-card/share] GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/genome-card/share
 * body: { shareId: string }
 * 公開ページ用: shareIdからカードデータを取得（認証不要）
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { shareId } = body as { shareId?: string };
    if (!shareId) {
      return NextResponse.json({ error: "shareId required" }, { status: 400 });
    }

    const userId = decryptShareId(shareId);
    if (!userId) {
      return NextResponse.json({ error: "Invalid share ID" }, { status: 400 });
    }

    // サービスロールなしでも公開データのみ返す
    const supabase = await supabaseServer();

    // プロフィール基本情報
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("id", userId)
      .maybeSingle();

    // Stargazer アーキタイプ
    const { data: coreStar } = await supabase
      .from("stargazer_core_star")
      .select("archetype_code, archetype_label")
      .eq("user_id", userId)
      .maybeSingle();

    // パーソナルカラー
    const { data: styleVector } = await supabase
      .from("user_style_vector")
      .select("pc_season")
      .eq("user_id", userId)
      .maybeSingle();

    // 性格特性 Top 5
    const { data: dimensions } = await supabase
      .from("personality_dimensions")
      .select("dimension, score, confidence")
      .eq("user_id", userId)
      .order("confidence", { ascending: false })
      .limit(5);

    // スタイルレーン
    const { data: prefProfile } = await supabase
      .from("pref_profile")
      .select("silhouette, material")
      .eq("user_id", userId)
      .maybeSingle();

    // Sync level for completeness
    const { data: syncLevel } = await supabase
      .from("personality_sync_level")
      .select("overall_sync, total_answers")
      .eq("user_id", userId)
      .maybeSingle();

    // 公開用の限定カードデータを構築
    const topTraits = (dimensions ?? []).slice(0, 3).map((d, i) => ({
      id: `trait-${i}`,
      label: formatDimensionLabel(d.dimension as string),
      score: Math.round(Number(d.score) * 100),
    }));

    const publicCard = {
      userId,
      displayName: profile?.display_name ?? null,
      avatarUrl: profile?.avatar_url ?? null,
      archetypeLabel: (coreStar?.archetype_label as string) ?? null,
      archetypeCode: (coreStar?.archetype_code as string) ?? null,
      pcSeason: (styleVector?.pc_season as string) ?? null,
      topTraits,
      topStyleLanes: extractStyleLanes(prefProfile),
      completeness: syncLevel ? Math.min(100, Math.round(Number(syncLevel.overall_sync) * 100)) : 0,
      summaryLine: null, // Lv1 公開ではサマリー非表示
    };

    return NextResponse.json({ ok: true, card: publicCard });
  } catch (error) {
    console.error("[genome-card/share] POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/* ── ヘルパー ── */

function formatDimensionLabel(dim: string): string {
  const LABEL_MAP: Record<string, string> = {
    quality_vs_quantity: "質重視",
    tradition_vs_novelty: "革新性",
    individual_vs_social: "社交性",
    plan_vs_spontaneous: "計画性",
    cautious_vs_bold: "慎重さ",
    analytical_vs_intuitive: "分析力",
    introvert_vs_extrovert: "外向性",
    independence_vs_harmony: "自律性",
    direct_vs_diplomatic: "率直さ",
    minimal_vs_maximal: "ミニマル",
    function_vs_expression: "表現性",
    classic_vs_trendy: "トレンド感度",
    emotional_stable_vs_volatile: "感情安定",
    change_embrace_vs_resist: "変化受容",
    stress_external_vs_internal: "ストレス対処",
  };
  return LABEL_MAP[dim] ?? dim;
}

function extractStyleLanes(prefProfile: Record<string, unknown> | null): string[] {
  if (!prefProfile) return [];
  const lanes: string[] = [];
  if (prefProfile.silhouette) lanes.push(String(prefProfile.silhouette));
  if (prefProfile.material) lanes.push(String(prefProfile.material));
  return lanes.slice(0, 3);
}
