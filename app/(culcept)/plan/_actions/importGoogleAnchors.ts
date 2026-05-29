"use server";

/**
 * P3 Phase B B-2 — Google Calendar anchor import server action (= 本流 save)
 *
 * 設計書: docs/alter-plan-p3-phase-b-readiness.md / B-2 readiness (= 2026-05-29 CEO GO)
 *
 * 役割:
 *   - connect 済 user の Google Calendar を server-side で fetch → map → dedup → save
 *   - client から draft を受け取らない (= server が OAuth connection を使って自前で取得)
 *   - 本 action は **real deps を結線するだけ**。 orchestration の本体は
 *     lib/oauth/importGoogleAnchorsHelpers.ts の runGoogleAnchorImport (= pure / 単体 test 済)
 *
 * 不変原則 (= ICS importIcsAnchorsAction と整合):
 *   1. Result shape は ImportIcsAnchorsResult と完全同形 ({ ok, imported, skipped } / { ok:false, error })
 *   2. auth 失敗 → ok:false、 情報漏洩なし
 *   3. env (= clientId / clientSecret / tokenEncKey) 不在 → not_configured 同視で ok:false
 *   4. 純粋ロジックは helpers に分離 (= "use server" を test で import すると node env が壊れるため)
 *   5. 保存は ICS と同じ正本 API createSourceWithAnchors (= sourceType='google_calendar')
 *
 * B-2 範囲外 (= 後続 phase):
 *   - UI trigger 接続 (= B-3)
 *   - staging end-to-end smoke (= B-4、 CEO 承認後)
 *   - invalid_grant 時の status='token_expired' DB 書込 / last_synced_at 更新
 *   - incremental sync (= syncToken)
 */

import {
  findConnection,
  listEnabledCalendarIds,
} from "@/lib/oauth/calendarConnectionRepository";
import { refreshGoogleAccessToken } from "@/lib/oauth/googleCalendarApi";
import { fetchAllCalendarEvents } from "@/lib/oauth/googleCalendarEvents";
import {
  runGoogleAnchorImport,
  type GoogleImportDeps,
  type GoogleImportResult,
} from "@/lib/oauth/importGoogleAnchorsHelpers";
import { decryptToken } from "@/lib/oauth/tokenCrypto";
import { createSupabaseExternalAnchorRepository } from "@/lib/plan/external-anchor-repository-supabase";
import { supabaseServer } from "@/lib/supabase/server";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Result type (= ICS と同形、 client render contract 共通)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type ImportGoogleAnchorsResult = GoogleImportResult;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main action (= deps 結線のみ。 本体は runGoogleAnchorImport)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * connect 済 Google Calendar を取り込み、 external_anchor として永続化する (= B-2 本実装)。
 *
 * @returns ICS と同形の { ok, imported, skipped } / { ok:false, error }
 */
export async function importGoogleAnchorsAction(): Promise<ImportGoogleAnchorsResult> {
  // ── 0. env check (= refresh に clientId/secret、 decrypt に tokenEncKey 必須) ──
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  const tokenEncKey = process.env.OAUTH_TOKEN_ENCRYPTION_KEY;
  if (!clientId || !clientSecret || !tokenEncKey) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[plan/google] not configured", {
        hasClientId: !!clientId,
        hasClientSecret: !!clientSecret,
        hasTokenEncKey: !!tokenEncKey,
      });
    }
    return { ok: false, error: "サーバー設定が不完全です。" };
  }

  // ── 1. authenticated userId 取得 (= server-side authn、 client 信頼しない) ──
  let userId: string;
  let client: Awaited<ReturnType<typeof supabaseServer>>;
  try {
    client = await supabaseServer();
    const { data, error } = await client.auth.getUser();
    if (error || !data.user?.id) {
      return { ok: false, error: "ログインが必要です。" };
    }
    userId = data.user.id;
  } catch {
    return { ok: false, error: "認証に失敗しました。" };
  }

  const repository = createSupabaseExternalAnchorRepository(client);

  // ── 2. real deps 結線 → orchestration core に委譲 ──
  const deps: GoogleImportDeps = {
    findConnection: () => findConnection(client, userId, "google"),
    decryptToken: (encrypted) => decryptToken(encrypted, tokenEncKey),
    refreshAccessToken: (refreshToken) =>
      refreshGoogleAccessToken({ refreshToken, clientId, clientSecret }),
    listEnabledCalendarIds: async (connectionId) => {
      const r = await listEnabledCalendarIds(client, userId, connectionId);
      return r.ok
        ? { ok: true, calendarIds: r.calendarIds }
        : { ok: false, detail: r.detail };
    },
    fetchAllEvents: (args) => fetchAllCalendarEvents(args),
    listExistingAnchors: () => repository.listAnchors(userId),
    createSourceWithAnchors: (bundle) =>
      repository.createSourceWithAnchors(userId, bundle),
    now: () => new Date(),
    log: (event) => {
      if (process.env.NODE_ENV !== "production") {
        console.info("[plan/google]", { userId, ...event });
      }
    },
  };

  return runGoogleAnchorImport(deps);
}
