"use server";

/**
 * ICS URL Import (Track A) A-2 — URL から .ics を取得し draft を返す server action
 *
 * 設計書: docs/alter-plan-ics-url-import-readiness.md §4 A-2
 *
 * 役割:
 *   - IcsImportModal の URL 入力から呼ばれる (= 副導線)
 *   - **auth gate** (= #9 SSRF: 匿名による server fetch proxy 化を防止)
 *   - `importIcsFromUrl` (= SSRF-guarded fetch + 既存 parse/map 再利用) → IcsAnchorDraft[]
 *   - draft を client に返す → 既存 preview → 承認で `importIcsAnchorsAction` が save
 *
 * 不変原則:
 *   1. fetch は SSRF-guarded (= lib/plan/ics/icsUrlFetch、 fail-closed)
 *   2. 認証情報を付けて外部取得しない (= #12、 fetchIcsText が credentials omit)
 *   3. error は 1 行 message のみ返す (= detail / URL を client / log に漏らさない = #10)
 *   4. save はしない (= 既存 importIcsAnchorsAction に委譲、 二重表示防止 dedup も既存)
 *
 * 設計参考:
 *   - app/(culcept)/plan/_actions/importIcsAnchors.ts (= auth pattern + 返却 shape)
 *   - lib/plan/ics/icsUrlFetch.ts (= importIcsFromUrl / reasonToMessage)
 */

import { importIcsFromUrl, reasonToMessage } from "@/lib/plan/ics/icsUrlFetch";
import type { IcsAnchorDraft } from "@/lib/plan/ics/icsToAnchorMapper";
import { supabaseServer } from "@/lib/supabase/server";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Result type (= client render contract)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type FetchIcsFromUrlResult =
  | {
      readonly ok: true;
      readonly drafts: IcsAnchorDraft[];
      readonly warnings: string[];
      /** map で skip された event (= 既存 preview と同形状、 importIcsAnchorsAction へは渡さない) */
      readonly skipped: ReadonlyArray<{ readonly sourceUid: string; readonly reason: string }>;
      readonly host: string;
    }
  | { readonly ok: false; readonly error: string };

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Action
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * URL から .ics を取得 → parse → map した draft を返す (= save はしない)。
 *
 * 手順:
 *   1. auth gate (= getUser、 失敗で ok:false)
 *   2. url の空チェック
 *   3. importIcsFromUrl (= SSRF-guarded fetch + parse + map)
 *   4. !ok → reasonToMessage で 1 行化 / ok → drafts + warnings + skipped + host
 */
export async function fetchIcsFromUrlAction(
  url: string,
): Promise<FetchIcsFromUrlResult> {
  // ── 1. auth gate (= #9、 client 信頼しない) ──
  try {
    const client = await supabaseServer();
    const { data, error } = await client.auth.getUser();
    if (error || !data.user?.id) {
      return { ok: false, error: "ログインが必要です。" };
    }
  } catch {
    return { ok: false, error: "認証に失敗しました。" };
  }

  // ── 2. url 空チェック ──
  if (typeof url !== "string" || url.trim().length === 0) {
    return { ok: false, error: "URL を入力してください。" };
  }

  // ── 3. fetch + parse + map (= SSRF-guarded、 既存 pipeline 再利用) ──
  const result = await importIcsFromUrl(url);

  // ── 4. 結果整形 ──
  if (!result.ok) {
    if (process.env.NODE_ENV !== "production") {
      // log 衛生: reason のみ (= URL 全体は出さない)
      console.warn("[plan/ics-url] fetch failed", { reason: result.reason });
    }
    return { ok: false, error: reasonToMessage(result.reason) };
  }

  if (process.env.NODE_ENV !== "production") {
    console.info("[plan/ics-url] fetch ok", {
      host: result.host,
      drafts: result.drafts.length,
      skipped: result.skipped.length,
    });
  }

  return {
    ok: true,
    drafts: result.drafts,
    warnings: result.warnings,
    skipped: result.skipped,
    host: result.host,
  };
}
