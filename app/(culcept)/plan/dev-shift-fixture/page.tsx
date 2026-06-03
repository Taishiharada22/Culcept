/**
 * /plan/dev-shift-fixture — staging/dev 限定 fixture 検証 host（SR E2a）
 *
 * 目的: fixture cells で「ShiftImportModal → 保存 → staging DB → /plan 表示」の決定論ループ検証。
 *       **製品本流入口ではない**（一般ユーザーには出さない）。
 *
 * 三重ガード（CEO 補正・NODE_ENV に頼らない）:
 *   ① PLAN_SHIFT_FIXTURE_HOST === "true"（明示 opt-in）
 *   ② supabase URL が staging ref を含む（allowlist）
 *   ③ supabase URL が production ref を含まない（deny）
 *   → 欠ければ notFound()。production env では未設定のため不可視。
 */

import { notFound, redirect } from "next/navigation";

import { supabaseServer } from "@/lib/supabase/server";
import {
  isShiftFixtureHostAllowed,
  buildShiftFixture,
} from "@/lib/plan/shift/devFixtureHost";
import { isShiftImportSaveEnabled } from "@/lib/plan/shift/shiftImportSave";

import { DevShiftFixtureClient } from "./DevShiftFixtureClient";

export const dynamic = "force-dynamic";

export default async function DevShiftFixturePage() {
  // 三重ガード（明示flag + staging allowlist + production deny）。production では notFound。
  if (
    !isShiftFixtureHostAllowed({
      fixtureMode: process.env.PLAN_SHIFT_FIXTURE_HOST,
      supabaseUrl:
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL,
    })
  ) {
    notFound();
  }

  // 保存には session が必要（未認証なら login へ）
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    redirect("/login?next=/plan/dev-shift-fixture");
  }

  // 現在月の匿名 synthetic fixture（/plan は今月 / today..+6 のみ表示 → 現在月にする）
  const fixture = buildShiftFixture(new Date());

  return (
    <DevShiftFixtureClient
      year={fixture.year}
      month={fixture.month}
      cells={fixture.cells}
      // saveEnabled は guard 通過後 + PLAN_SHIFT_IMPORT_SAVE のみ true
      saveEnabled={isShiftImportSaveEnabled()}
    />
  );
}
