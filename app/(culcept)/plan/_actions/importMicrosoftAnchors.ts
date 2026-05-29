"use server";

/**
 * Track B TB-4 — Microsoft (Outlook) Calendar anchor import server action (= 本流 save)
 *
 * 設計書: docs/alter-plan-track-b-provider-native-readiness.md §3 TB-4
 * (= importGoogleAnchors action [B-2] を mirror。 calendar-list/subscriptions step が無く単純)
 *
 * 役割:
 *   - connect 済 user の Outlook Calendar を server-side で /me/calendarView fetch → map → dedup → save
 *   - client から draft を受け取らない (= server が OAuth connection を使って自前で取得)
 *   - 本 action は **real deps を結線するだけ**。 orchestration の本体は
 *     lib/oauth/importMicrosoftAnchorsHelpers.ts の runMicrosoftAnchorImport (= pure / 単体 test 済)
 *
 * 不変原則 (= ICS / Google action と整合):
 *   1. Result shape は完全同形 ({ ok, imported, skipped } / { ok:false, error })
 *   2. auth 失敗 → ok:false、 情報漏洩なし
 *   3. env (= clientId / clientSecret / tokenEncKey) 不在 → not_configured 同視で ok:false
 *   4. 純粋ロジックは helpers に分離 (= "use server" を test で import すると node env が壊れるため)
 *   5. 保存は ICS/Google と同じ正本 API createSourceWithAnchors (= sourceType='microsoft_calendar')
 *
 * Google との差分:
 *   - listEnabledCalendarIds なし (= MS は /me/calendarView を直接叩く、 subscriptions table を使わない)
 *   - fetchAllEvents は { accessToken, startDateTime, endDateTime } を取る (= calendarId 不要)
 */

import { findConnection } from "@/lib/oauth/calendarConnectionRepository";
import { refreshMicrosoftAccessToken } from "@/lib/oauth/microsoftCalendarApi";
import { fetchAllMicrosoftCalendarEvents } from "@/lib/oauth/microsoftCalendarEvents";
import {
  runMicrosoftAnchorImport,
  type MicrosoftImportDeps,
  type MicrosoftImportResult,
} from "@/lib/oauth/importMicrosoftAnchorsHelpers";
import { decryptToken } from "@/lib/oauth/tokenCrypto";
import { createSupabaseExternalAnchorRepository } from "@/lib/plan/external-anchor-repository-supabase";
import { supabaseServer } from "@/lib/supabase/server";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Result type (= ICS / Google と同形、 client render contract 共通)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type ImportMicrosoftAnchorsResult = MicrosoftImportResult;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main action (= deps 結線のみ。 本体は runMicrosoftAnchorImport)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * connect 済 Outlook Calendar を取り込み、 external_anchor として永続化する (= TB-4 本実装)。
 *
 * @returns ICS / Google と同形の { ok, imported, skipped } / { ok:false, error }
 */
export async function importMicrosoftAnchorsAction(): Promise<ImportMicrosoftAnchorsResult> {
  // ── 0. env check (= refresh に clientId/secret、 decrypt に tokenEncKey 必須) ──
  const clientId = process.env.MICROSOFT_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CALENDAR_CLIENT_SECRET;
  const tokenEncKey = process.env.OAUTH_TOKEN_ENCRYPTION_KEY;
  if (!clientId || !clientSecret || !tokenEncKey) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[plan/microsoft] not configured", {
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
  const deps: MicrosoftImportDeps = {
    findConnection: () => findConnection(client, userId, "microsoft"),
    decryptToken: (encrypted) => decryptToken(encrypted, tokenEncKey),
    refreshAccessToken: (refreshToken) =>
      refreshMicrosoftAccessToken({ refreshToken, clientId, clientSecret }),
    fetchAllEvents: (args) => fetchAllMicrosoftCalendarEvents(args),
    listExistingAnchors: () => repository.listAnchors(userId),
    createSourceWithAnchors: (bundle) => repository.createSourceWithAnchors(userId, bundle),
    now: () => new Date(),
    log: (event) => {
      if (process.env.NODE_ENV !== "production") {
        console.info("[plan/microsoft]", { userId, ...event });
      }
    },
  };

  return runMicrosoftAnchorImport(deps);
}
