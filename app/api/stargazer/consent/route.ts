/**
 * Consent Management API
 *
 * ユーザーが自分の同意設定を管理するためのエンドポイント。
 *
 * GET  — 現在の consent 一覧を取得
 * POST — consent を更新（grant / revoke）
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import {
  grantExplicitConsent,
  revokeConsent,
  revokeParentDomain,
  SENSITIVE_SUBDOMAINS,
  type ConsentSubdomain,
  type TrustDomain,
} from "@/lib/stargazer/proactiveUnderstanding";

export async function GET() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const { data: rows, error } = await supabase
    .from("stargazer_alter_consent")
    .select("subdomain, status, cooldown_until, updated_at")
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // SENSITIVE_SUBDOMAINS に対して未設定のものは "none" として補完
  const existing = new Set((rows ?? []).map((r) => r.subdomain));
  const result = [
    ...(rows ?? []),
    ...SENSITIVE_SUBDOMAINS.filter((s) => !existing.has(s)).map((s) => ({
      subdomain: s,
      status: "none",
      cooldown_until: null,
      updated_at: null,
    })),
  ];

  return NextResponse.json({ consent: result });
}

export async function POST(request: NextRequest) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "認���が必要です" }, { status: 401 });
  }

  let body: { action: string; subdomain?: string; domain?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { action, subdomain, domain } = body;

  if (!action || !["grant", "revoke", "revoke_domain"].includes(action)) {
    return NextResponse.json(
      { error: "action must be 'grant', 'revoke', or 'revoke_domain'" },
      { status: 400 },
    );
  }

  // ── Grant explicit consent ���─
  if (action === "grant") {
    if (!subdomain) {
      return NextResponse.json({ error: "subdomain is required" }, { status: 400 });
    }
    const consent = grantExplicitConsent(subdomain as ConsentSubdomain);
    const { error } = await supabase.from("stargazer_alter_consent").upsert(
      {
        user_id: user.id,
        subdomain: consent.subdomain,
        status: consent.status,
        cooldown_until: consent.cooldown_until,
        updated_at: consent.updated_at,
      },
      { onConflict: "user_id,subdomain" },
    );
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, consent });
  }

  // ── Revoke single subdomain ──
  if (action === "revoke") {
    if (!subdomain) {
      return NextResponse.json({ error: "subdomain is required" }, { status: 400 });
    }
    const consent = revokeConsent(subdomain as ConsentSubdomain);
    const { error } = await supabase.from("stargazer_alter_consent").upsert(
      {
        user_id: user.id,
        subdomain: consent.subdomain,
        status: consent.status,
        cooldown_until: consent.cooldown_until,
        updated_at: consent.updated_at,
      },
      { onConflict: "user_id,subdomain" },
    );
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, consent });
  }

  // ── Revoke entire domain ──
  if (action === "revoke_domain") {
    if (!domain) {
      return NextResponse.json({ error: "domain is required" }, { status: 400 });
    }
    const consents = revokeParentDomain(domain as TrustDomain);
    const rows = consents.map((c) => ({
      user_id: user.id,
      subdomain: c.subdomain,
      status: c.status,
      cooldown_until: c.cooldown_until,
      updated_at: c.updated_at,
    }));
    const { error } = await supabase
      .from("stargazer_alter_consent")
      .upsert(rows, { onConflict: "user_id,subdomain" });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, consents });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
