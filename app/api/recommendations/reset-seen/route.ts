// app/api/recommendations/reset-seen/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type Role = "buyer" | "seller";
type Scope = "cards" | "shops" | "all";
type TargetType = "drop" | "shop" | "insight";

function clampInt(v: any, lo: number, hi: number, fallback: number) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(hi, Math.max(lo, Math.trunc(n)));
}

function parseBool(v: any) {
    const s = String(v ?? "").trim().toLowerCase();
    return s === "1" || s === "true" || s === "yes";
}

function isMissingRelationError(err: any) {
    const code = String(err?.code ?? "");
    const msg = String(err?.message ?? "");
    return code === "42P01" || msg.includes("does not exist");
}

function isColumnMissingError(err: any) {
    const code = String(err?.code ?? "");
    const msg = String(err?.message ?? "");
    return code === "42703" || (msg.includes("column") && msg.includes("does not exist"));
}

function seenResetKey(args: {
    userId: string;
    role: Role;
    targetType: TargetType;
    recVersion: number;
    recType?: string;
}) {
    const { userId, role, targetType, recVersion, recType } = args;
    return `reco:seen_reset:${userId}:${role}:${targetType}:${recVersion}:${recType ?? "all"}`;
}

function deriveResetTargets(role: Role, v: number, scope: Scope) {
    const targets: Array<{ targetType: TargetType; recType?: string }> = [];

    if (scope === "cards") {
        if (role === "buyer" && v === 2) {
            targets.push({ targetType: "insight", recType: "buyer_swipe_card" });
        } else {
            targets.push({ targetType: "drop" });
        }
        return targets;
    }

    if (scope === "shops") {
        targets.push({ targetType: "shop" });
        return targets;
    }

    // all
    targets.push({ targetType: "drop" });
    targets.push({ targetType: "shop" });
    if (role === "buyer" && v === 2) {
        targets.push({ targetType: "insight", recType: "buyer_swipe_card" });
    }
    return targets;
}

async function deleteByIds(args: {
    table: string;
    idColumn: string;
    ids: string[];
    userId: string;
    warnings: string[];
}): Promise<{ ok: boolean; total: number; error?: any }> {
    const { table, idColumn, ids, userId, warnings } = args;
    const chunkSize = 200;
    let total = 0;

    for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);
        const res = await supabaseAdmin
            .from(table)
            .delete()
            .eq("user_id", userId)
            .in(idColumn, chunk);

        if (res.error) {
            if (isMissingRelationError(res.error)) {
                warnings.push(`${table} missing: ${res.error.message}`);
                return { ok: true, total };
            }
            if (isColumnMissingError(res.error)) {
                warnings.push(`${table} column missing: ${res.error.message}`);
                return { ok: true, total };
            }
            warnings.push(`${table} delete failed: ${res.error.message}`);
            return { ok: false, error: res.error };
        }

        total += res.count ?? 0;
    }

    return { ok: true, total };
}

async function setResetMarker(args: {
    userId: string;
    role: Role;
    targetType: TargetType;
    recVersion: number;
    recType?: string;
    warnings: string[];
}) {
    const { userId, role, targetType, recVersion, recType, warnings } = args;
    const key = seenResetKey({ userId, role, targetType, recVersion, recType });
    const payload = { reset_at: new Date().toISOString() };
    const expiresAt = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString();

    try {
        const res = await supabaseAdmin
            .from("recommendation_cache")
            .upsert(
                {
                    cache_key: key,
                    payload,
                    expires_at: expiresAt,
                } as any,
                { onConflict: "cache_key" }
            );

        if (res.error) {
            if (isMissingRelationError(res.error)) {
                warnings.push(`recommendation_cache missing: ${res.error.message}`);
                return { ok: false, key };
            }
            warnings.push(`reset marker failed: ${res.error.message}`);
            return { ok: false, key };
        }

        return { ok: true, key };
    } catch (err: any) {
        warnings.push(`reset marker failed: ${String(err?.message ?? err)}`);
        return { ok: false, key };
    }
}

async function handle(req: Request) {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);

    // URL params (default)
    let role = (String(url.searchParams.get("role") ?? "buyer") as Role);
    let v = clampInt(url.searchParams.get("v"), 1, 2, 2);
    let scope = (String(url.searchParams.get("scope") ?? "cards") as Scope);
    const dryRun = parseBool(url.searchParams.get("dryRun"));

    // POST body override (optional)
    if (req.method === "POST") {
        try {
            const body = await req.json();
            if (body?.role) role = String(body.role) as Role;
            if (body?.v != null) v = clampInt(body.v, 1, 2, v);
            if (body?.scope) scope = String(body.scope) as Scope;
        } catch {
            // ignore
        }
    }

    // impressions filter builder
    let impSel = supabaseAdmin
        .from("recommendation_impressions")
        .select("id", { count: "exact" })
        .eq("user_id", user.id)
        .eq("role", role)
        .eq("rec_version", v);

    // v=2 buyer swipe cards は insight + buyer_swipe_*
    if (role === "buyer" && v === 2 && scope === "cards") {
        impSel = impSel
            .eq("target_type", "insight")
            .in("rec_type", ["buyer_swipe_card", "buyer_swipe_summary", "buyer_swipe_no_cards"]);
    } else if (scope === "shops") {
        impSel = impSel.eq("target_type", "shop");
    } else if (scope === "cards") {
        impSel = impSel.in("target_type", ["drop", "insight"]);
    } else {
        // all: no extra filter
    }

    const { data: impRows, error: impSelErr, count: impCount } = await impSel;

    if (impSelErr) {
        return NextResponse.json({ ok: false, error: impSelErr.message }, { status: 500 });
    }

    const impressionIds = (impRows ?? []).map((r: any) => String(r.id)).filter(Boolean);

    // dryRun: 削除対象だけ返す
    if (dryRun) {
        return NextResponse.json({
            ok: true,
            dryRun: true,
            role,
            v,
            scope,
            impressionsMatched: impCount ?? impressionIds.length,
            sampleImpressionIds: impressionIds.slice(0, 10),
        });
    }

    // 0件なら終了
    if (impressionIds.length === 0) {
        return NextResponse.json({
            ok: true,
            deleted: { actions: 0, ratings: 0, impressions: 0 },
            role,
            v,
            scope,
            impressionsMatched: 0,
        });
    }

    const warnings: string[] = [];

    // ✅ reset marker (cache) - DB削除に失敗しても見たカード扱いを解除できる
    const resetTargets = deriveResetTargets(role, v, scope);
    const resetResults = await Promise.all(
        resetTargets.map((t) =>
            setResetMarker({
                userId: user.id,
                role,
                targetType: t.targetType,
                recVersion: v,
                recType: t.recType,
                warnings,
            })
        )
    );
    const resetOkAny = resetResults.some((r) => r.ok);

    // ✅ FKを踏まえて、子 → 親の順に削除（chunk + missing table/column を許容）
    const delActions = await deleteByIds({
        table: "recommendation_actions",
        idColumn: "impression_id",
        ids: impressionIds,
        userId: user.id,
        warnings,
    });
    const delActionsOk = delActions.ok;

    const delRatings = await deleteByIds({
        table: "recommendation_ratings",
        idColumn: "impression_id",
        ids: impressionIds,
        userId: user.id,
        warnings,
    });
    const delRatingsOk = delRatings.ok;

    const delImps = await deleteByIds({
        table: "recommendation_impressions",
        idColumn: "id",
        ids: impressionIds,
        userId: user.id,
        warnings,
    });
    const delImpsOk = delImps.ok;

    // reset marker が失敗し、削除も失敗している場合のみエラー扱い
    if (!resetOkAny && (!delActionsOk || !delRatingsOk || !delImpsOk)) {
        const errMsg = delImps.error?.message ?? delRatings.error?.message ?? delActions.error?.message ?? "reset failed";
        return NextResponse.json({ ok: false, error: errMsg, warnings }, { status: 500 });
    }

    return NextResponse.json({
        ok: true,
        deleted: {
            actions: delActions.total ?? 0,
            ratings: delRatings.total ?? 0,
            impressions: delImps.total ?? 0,
        },
        role,
        v,
        scope,
        impressionsMatched: impCount ?? impressionIds.length,
        warnings: warnings.length ? warnings : undefined,
    });
}

export async function GET(req: Request) {
    return handle(req);
}

export async function POST(req: Request) {
    return handle(req);
}
