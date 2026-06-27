"use server";

/**
 * SR B1b-2C-7: extractShiftDraftAction（server action・thin wrapper）
 *
 * 役割: 本流から呼ばれる "use server" entry point。env 読み出し + deps wire のみ。
 *   本体ロジックは `runExtractShiftDraft`（pure-ish・DI・test 可）に委譲。
 *
 * 重要原則（CEO 補正 2026-06-01）:
 *   - env を読むのは **本ファイル only**（adapter / runner は env 非依存）
 *   - Gemini adapter factory は `draftExtractionGeminiAdapter.server.ts`（`import "server-only"`）
 *     経由で取得 → client bundle 混入を構造的に防ぐ
 *   - DB write / 保存 / 本流入口 には接続しない（cells を return するだけ）
 *   - host page / upload UI / ShiftImportModal は接続しない（次 gate）
 *   - cost 発生入口のため、全 gate（flag/staging/prod-deny/auth/env/file）通過後にのみ adapter を呼ぶ
 *
 * 範囲外: result への Blob / base64 / raw response 載せ込み、DB write、production、本流入口。
 */

import { supabaseServer } from "@/lib/supabase/server";
import {
  STAGING_PROJECT_REF,
  CLEAN_PRODUCTION_PROJECT_REF,
} from "@/lib/plan/shift/devFixtureHost";
import { PLAN_FLAGS } from "@/lib/plan/featureFlags";
import { createGeminiDraftExtractionAdapter } from "@/lib/plan/shift/draftExtractionGeminiAdapter.server";
import { isDraftExtractionFlagAllowed } from "@/lib/plan/shift/draftExtractionFlagGate";
import {
  runExtractShiftDraft,
  type ExtractShiftDraftResult,
} from "@/lib/plan/shift/runExtractShiftDraft";

/** "use server" action: FormData → ExtractShiftDraftResult。 */
export async function extractShiftDraftAction(
  formData: FormData
): Promise<ExtractShiftDraftResult> {
  const client = await supabaseServer();
  return runExtractShiftDraft(formData, {
    env: {
      // S3A-1: live draft extraction の flag gate を 2 flag OR に分離（CEO 2026-06-04）。
      //   PLAN_SHIFT_DRAFT_LIVE_ENABLED（product 導線・在app入口の live VLM gate）
      //   || PLAN_SHIFT_DRAFT_HOST（dev route /plan/dev-shift-draft 互換の既存 gate）
      // 保存 flag（PLAN_SHIFT_IMPORT_SAVE）とは無関係。staging/prod/api key/auth は runner の別 gate。
      flagOn: isDraftExtractionFlagAllowed({
        liveEnabled: process.env.PLAN_SHIFT_DRAFT_LIVE_ENABLED,
        draftHost: process.env.PLAN_SHIFT_DRAFT_HOST,
      }),
      supabaseUrl:
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL,
      geminiApiKey: process.env.GEMINI_API_KEY,
      vlmModel: process.env.B1B_VLM_MODEL,
      // SR B1b-2C-9-FIX-2: server-side mode 判定（client から信用しない）
      vlmInputMode:
        process.env.PLAN_SHIFT_VLM_INPUT_MODE === "combined"
          ? "combined"
          : "split",
    },
    stagingRef: STAGING_PROJECT_REF,
    // P15-C: ACTIVE production(plod) は canary lane の対象識別子。production URL + canary user の時のみ
    //   extract 続行。非 canary user / 空 allowlist は env_misconfigured で fail（legacy aljav は別 deny）。
    productionRef: CLEAN_PRODUCTION_PROJECT_REF,
    // P15-C: production lane を canary 限定で許可（save lane と同 allowlist で一貫性）。
    //   PLAN_SHIFT_IMPORT_SAVE_CANARY_USER_IDS 未設定なら空配列＝production extract 不可。
    canaryUserIds: PLAN_FLAGS.shiftImportSaveCanaryUserIds,
    getUserId: async () => {
      const { data } = await client.auth.getUser();
      return data?.user?.id ?? null;
    },
    createAdapter: (config) =>
      createGeminiDraftExtractionAdapter({
        apiKey: config.apiKey,
        model: config.model,
      }),
  });
}
