/**
 * /plan/dev-shift-draft — staging/dev 限定 下書き取り込み検証 host（SR B1b-2C-8-b・shell）
 *
 * 目的: 画像 → AssistedRowSelector → generateAssistedCrops → extractShiftDraftAction →
 *       ShiftReviewGrid → 既存 importShiftRosterAction の決定論ループ検証 host。
 *       **製品の取り込み入口ではありません**（一般ユーザーには出さない・本流非接続）。
 *
 * 本コミット（B1b-2C-8-b）の scope:
 *   - server component（三重ガード + auth + Client mount shell）まで
 *   - upload UI / state machine / extraction / Modal 接続は **B1b-2C-8-c**
 *   - VLM 実行 / DB write / 保存 はさらに次 gate
 *
 * 三重ガード（B1b-2C-8-a `isShiftDraftHostAllowed` に委譲）:
 *   ① PLAN_SHIFT_DRAFT_HOST === "true"（明示 opt-in）
 *   ② supabase URL が staging ref を含む（allowlist）
 *   ③ supabase URL が production ref を含まない（deny）
 *   → 欠ければ notFound()。production env では未設定のため不可視。
 */

import { notFound, redirect } from "next/navigation";

import { supabaseServer } from "@/lib/supabase/server";
import { isShiftDraftHostAllowed } from "@/lib/plan/shift/devDraftHost";

import { DevShiftDraftClient } from "./DevShiftDraftClient";

export const dynamic = "force-dynamic";

export default async function DevShiftDraftPage() {
  // 三重ガード（明示flag + staging allowlist + production deny）。production では notFound。
  if (
    !isShiftDraftHostAllowed({
      draftMode: process.env.PLAN_SHIFT_DRAFT_HOST,
      supabaseUrl:
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL,
    })
  ) {
    notFound();
  }

  // 認証 session が必要（未認証なら login へ）
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    redirect("/login?next=/plan/dev-shift-draft");
  }

  // shell mount（B1b-2C-8-b 範囲はここまで）
  return <DevShiftDraftClient />;
}
