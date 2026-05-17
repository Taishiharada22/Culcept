/**
 * Plan API 共通 helper (A-2)
 *
 * 各 Route Handler が共有する auth gate と error 整形を一箇所に閉じる。
 * Repository / 業務ロジックには触れない（presentation layer）。
 *
 * 範囲:
 *   - auth.getUser() の結果を「200 で続行」か「401 NextResponse」かに正規化
 *   - userId は **必ず auth から取得**。request body から読み取らない（不変原則）
 *
 * 範囲外:
 *   - HTTP status の細分化（appErrorToHttpStatus 側）
 *   - body validation（各 Route Handler で pure validator を呼ぶ）
 */

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Auth gate
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type AuthGateResult =
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse };

/**
 * 認証された user.id を取得する gate。
 *
 *   - user が居なければ 401 NextResponse を返す
 *   - user が居れば user.id を userId として返す（auth.uid() の application 層表現）
 *
 * userId は body から渡された値を **信用しない**。常にここから取得した値を Repository に渡す。
 * これにより「他人の id を body で詐称」攻撃を遮断する。
 */
export async function requireAuthenticatedUser(
  supabase: SupabaseClient
): Promise<AuthGateResult> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data || !data.user) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      ),
    };
  }
  return { ok: true, userId: data.user.id };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// JSON body 解釈の最小ヘルパ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type ParsedJsonResult =
  | { ok: true; value: unknown }
  | { ok: false; response: NextResponse };

/**
 * Request body を JSON parse する。
 * malformed なら 400 NextResponse を返す（422 ではない、semantic ではなく syntactic）。
 */
export async function parseJsonBody(request: Request): Promise<ParsedJsonResult> {
  try {
    const value = await request.json();
    return { ok: true, value };
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "Invalid JSON body" },
        { status: 400 }
      ),
    };
  }
}
