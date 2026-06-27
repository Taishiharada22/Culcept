"use server";

/**
 * SR Step 6B-apply-C (C) — シフト取り込み 本保存 server action（real deps 結線のみ）
 *
 * 確認画面で承認したセルを /plan に保存する server action。
 * 本体ロジックは lib/plan/shift/runShiftImportSave.ts（pure / 単体 test 済）に集約。
 * 本 action は **real deps を結線するだけ**（"use server" を test で import すると node env が壊れるため、
 * 既存 importGoogle/Microsoft action と同じ分離方針）。
 *
 * 不変原則（GPT/CEO 2026-05-31）:
 *   1. userId は client から受け取らず、server `auth.getUser()` から取得。
 *   2. importRange は year/month から server 側で算出（runShiftImportSave 内）。client range を信頼しない。
 *   3. RPC は createSupabaseShiftImportRpcClient 経由（mapShiftImportRpcResponse を必ず通る）。
 *   4. raw error は UI result に載せない（safe message のみ）。raw は server log（logDetail）へ。
 *   5. flag OFF default = dormant（UI 保存ボタンは別 gate で有効化）。
 *   6. dictionary は MVP seed（HARADA_SPRIX）。per-user は将来 gate。
 *   7. projection は server 側（runShiftImportSave）で実行。client から projected anchors/indicators を受け取らない。
 */

import { supabaseServer } from "@/lib/supabase/server";
import { createSupabaseShiftImportRpcClient } from "@/lib/plan/shift/shiftImportRpcClientSupabase";
import { createRpcShiftImportRepository } from "@/lib/plan/shift/shiftImportRepositoryRpc";
import { HARADA_SPRIX_DICTIONARY } from "@/lib/plan/shift/shiftCodeDictionary";
import { isShiftImportSaveEnabled } from "@/lib/plan/shift/shiftImportSave";
import { PLAN_FLAGS } from "@/lib/plan/featureFlags";
import {
  STAGING_PROJECT_REF,
  PRODUCTION_PROJECT_REF,
} from "@/lib/plan/shift/devFixtureHost";
import {
  runShiftImportSave,
  type ShiftImportSaveActionInput,
  type ShiftImportActionResult,
} from "@/lib/plan/shift/runShiftImportSave";

/**
 * 確認画面で承認したシフトを /plan に保存する（6B-apply-C 本接続）。
 * flag OFF default のため、UI から呼ばれても dormant（disabled を返す）。
 *
 * @returns raw を含まない安全な ShiftImportActionResult
 */
export async function importShiftRosterAction(
  input: ShiftImportSaveActionInput
): Promise<ShiftImportActionResult> {
  const client = await supabaseServer();

  // supabase.rpc は thenable のため await で { data, error } に正規化（既存 untyped .rpc パターン）。
  const rpcClient = createSupabaseShiftImportRpcClient(
    async (fn, args) => {
      const { data, error } = await client.rpc(fn, args);
      return { data, error };
    },
    {
      logDetail: (detail) => {
        // raw error / 想定外 data は **server log のみ**（UI には safe message しか返さない）。
        console.error("[plan/shift] import_shift_roster detail", detail);
      },
    }
  );
  const repo = createRpcShiftImportRepository(rpcClient);

  return runShiftImportSave(input, {
    // userId は server auth から取得（client 入力を信頼しない）。失敗時は null → unauthenticated。
    getUserId: async () => {
      try {
        const { data, error } = await client.auth.getUser();
        if (error || !data.user?.id) return null;
        return data.user.id;
      } catch {
        return null;
      }
    },
    isEnabled: isShiftImportSaveEnabled, // flag OFF default = dormant
    // S-save-0: 接続先 guard（staging allowlist + production deny）。接続先 URL が production を
    //   指す / staging 不一致 / 未設定なら guard NG → disabled（auth/projection/RPC 未到達）。
    //   flag だけに頼らず、env 誤設定でも production への保存をコードで遮断する多重防御。
    connection: {
      supabaseUrl:
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL,
      stagingRef: STAGING_PROJECT_REF,
      productionRef: PRODUCTION_PROJECT_REF,
    },
    // P14: production-canary allowlist。production 接続時のみ有効（staging は connection guard で許可）。
    canaryUserIds: PLAN_FLAGS.shiftImportSaveCanaryUserIds,
    repo,
    dictionary: HARADA_SPRIX_DICTIONARY, // MVP seed（per-user 辞書は将来 gate）
  });
}
