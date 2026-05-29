/**
 * Track B TB-4 — importMicrosoftAnchors の pure helpers + DI orchestration core
 *
 * 設計: docs/alter-plan-track-b-provider-native-readiness.md §3 TB-4
 * (= importGoogleAnchorsHelpers の MS 版。 calendar-list/subscriptions/Path-B は無く単純)
 *
 * 不変原則 (= Google helper と同):
 *   1. 副作用なし (= DB / IO / time / random / env は **すべて deps で注入**)
 *   2. 入力 mutate なし / server-only 依存なし (= vitest "node" で直接 import 可)
 *   3. throw しない (= 戻り値で ok / error。 createSourceWithAnchors の throw のみ catch)
 *   4. Result shape / dedup 思想を ICS / Google と完全に揃える
 *
 * Google との差分:
 *   - calendarView を直接 1 回 fetch (= subscriptions / calendar-list / primary fallback なし)
 *   - sourceType = 'microsoft_calendar'
 */

import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import type { CreateExternalAnchorInput } from "@/lib/plan/external-anchor-input";
import type {
  CreateSourceWithAnchorsInput,
  CreateSourceWithAnchorsResult,
} from "@/lib/plan/external-anchor-repository";
import type { FindConnectionResult } from "./calendarConnectionRepository";
import type { MsRefreshResult } from "./microsoftCalendarApi";
import type { FetchAllMsEventsResult } from "./microsoftCalendarEvents";
import type { DecryptResult } from "./tokenCrypto";
import {
  mapMicrosoftEventsToAnchorDrafts,
  type MsAnchorDraft,
} from "./microsoftEventsToAnchorMapper";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 時間窓 (= ICS/Google と同: 過去 30 日 + 未来 90 日)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const IMPORT_WINDOW_PAST_DAYS = 30;
export const IMPORT_WINDOW_FUTURE_DAYS = 90;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** calendarView の startDateTime / endDateTime (= ISO) を now 基準で構築 (= pure) */
export function buildMicrosoftImportWindow(now: Date): {
  startDateTime: string;
  endDateTime: string;
} {
  return {
    startDateTime: new Date(now.getTime() - IMPORT_WINDOW_PAST_DAYS * MS_PER_DAY).toISOString(),
    endDateTime: new Date(now.getTime() + IMPORT_WINDOW_FUTURE_DAYS * MS_PER_DAY).toISOString(),
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// dedup partition (= externalUid 完全一致、 ICS/Google と同思想 = cross-source dedup)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function partitionMsDraftsByExistingUids(
  drafts: ReadonlyArray<MsAnchorDraft>,
  existingAnchors: ReadonlyArray<ExternalAnchor>,
): { kept: MsAnchorDraft[]; skipped: number } {
  const existingUids = new Set<string>();
  for (const a of existingAnchors) {
    if (a.externalUid !== undefined && a.externalUid.length > 0) {
      existingUids.add(a.externalUid);
    }
  }
  const kept: MsAnchorDraft[] = [];
  let skipped = 0;
  for (const d of drafts) {
    if (existingUids.has(d.externalUid)) skipped += 1;
    else kept.push(d);
  }
  return { kept, skipped };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Result + DI deps 型
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** ICS / Google と完全同形 (= client render contract 共通) */
export type MicrosoftImportResult =
  | { readonly ok: true; readonly imported: number; readonly skipped: number }
  | { readonly ok: false; readonly error: string };

export type MicrosoftImportLogEvent =
  | { readonly kind: "connection_lookup_failed"; readonly detail: string }
  | { readonly kind: "not_connected" }
  | { readonly kind: "connection_inactive"; readonly status: string }
  | { readonly kind: "decrypt_failed"; readonly reason: string }
  | { readonly kind: "refresh_failed"; readonly reason: string }
  | { readonly kind: "fetch_failed"; readonly reason: string; readonly detail?: string }
  | { readonly kind: "list_anchors_failed"; readonly detail: string }
  | {
      readonly kind: "all_skipped";
      readonly mapperSkipped: number;
      readonly dedupSkipped: number;
    }
  | { readonly kind: "persist_threw"; readonly detail: string }
  | { readonly kind: "persist_rejected"; readonly detail: string }
  | { readonly kind: "import_success"; readonly imported: number; readonly skipped: number };

export type MicrosoftImportDeps = {
  readonly findConnection: () => Promise<FindConnectionResult>;
  readonly decryptToken: (encrypted: Buffer) => DecryptResult;
  readonly refreshAccessToken: (refreshToken: string) => Promise<MsRefreshResult>;
  readonly fetchAllEvents: (args: {
    accessToken: string;
    startDateTime: string;
    endDateTime: string;
  }) => Promise<FetchAllMsEventsResult>;
  readonly listExistingAnchors: () => Promise<ReadonlyArray<ExternalAnchor>>;
  readonly createSourceWithAnchors: (
    bundle: CreateSourceWithAnchorsInput,
  ) => Promise<CreateSourceWithAnchorsResult>;
  readonly now: () => Date;
  readonly log?: (event: MicrosoftImportLogEvent) => void;
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// runMicrosoftAnchorImport (= orchestration core、 pure / fully testable)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const SOURCE_NOTES = "Outlook カレンダーから取り込み";

/**
 * Microsoft (Outlook) Calendar import の本流 orchestration。
 *
 * 手順:
 *   1. findConnection (provider=microsoft) → 不在/inactive は user 向け error
 *   2. decryptToken(refresh_token)
 *   3. refreshAccessToken → invalid_grant=再接続要 / invalid_client=設定不備 / 他=通信失敗
 *   4. fetchAllEvents (= /me/calendarView、 部分失敗は partialEvents 採用)
 *   5. mapMicrosoftEventsToAnchorDrafts (= cancelled/seriesMaster/invalid skip)
 *   6. listExistingAnchors → dedup base
 *   7. partition (= externalUid 完全一致で skip)
 *   8. kept 0 件 → source 作らず ok:true
 *   9. createSourceWithAnchors (= sourceType='microsoft_calendar')
 */
export async function runMicrosoftAnchorImport(
  deps: MicrosoftImportDeps,
): Promise<MicrosoftImportResult> {
  const log = deps.log ?? (() => {});

  // ── 1. connection ──
  const connResult = await deps.findConnection();
  if (!connResult.ok) {
    log({ kind: "connection_lookup_failed", detail: connResult.detail });
    return { ok: false, error: "接続情報の取得に失敗しました。" };
  }
  if (!connResult.connection) {
    log({ kind: "not_connected" });
    return { ok: false, error: "Outlook カレンダーが接続されていません。" };
  }
  const connection = connResult.connection;
  if (connection.status !== "active") {
    log({ kind: "connection_inactive", status: connection.status });
    return { ok: false, error: "Outlook カレンダーの再接続が必要です。" };
  }

  // ── 2. decrypt ──
  const decrypted = deps.decryptToken(connection.refreshTokenEncrypted);
  if (!decrypted.ok) {
    log({ kind: "decrypt_failed", reason: decrypted.reason });
    return { ok: false, error: "Outlook カレンダーの再接続が必要です。" };
  }

  // ── 3. access_token 更新 ──
  const refresh = await deps.refreshAccessToken(decrypted.plaintext);
  if (!refresh.ok) {
    log({ kind: "refresh_failed", reason: refresh.reason });
    if (refresh.reason === "invalid_grant") {
      return { ok: false, error: "Outlook カレンダーの再接続が必要です。" };
    }
    if (refresh.reason === "invalid_client") {
      return { ok: false, error: "サーバー設定が不完全です。" };
    }
    return { ok: false, error: "Outlook カレンダーとの通信に失敗しました。" };
  }

  // ── 4. events 取得 (= calendarView 1 回、 部分失敗は partial 採用) ──
  const window = buildMicrosoftImportWindow(deps.now());
  const fetched = await deps.fetchAllEvents({
    accessToken: refresh.accessToken,
    startDateTime: window.startDateTime,
    endDateTime: window.endDateTime,
  });
  const events = fetched.ok ? fetched.events : fetched.partialEvents;
  if (!fetched.ok) {
    log({
      kind: "fetch_failed",
      reason: fetched.reason,
      ...(fetched.detail !== undefined ? { detail: fetched.detail } : {}),
    });
    if (events.length === 0) {
      return { ok: false, error: "予定の取得に失敗しました。" };
    }
    // 部分取得できていれば続行 (= ICS/Google と同思想)
  }

  // ── 5. map ──
  const mapped = mapMicrosoftEventsToAnchorDrafts(events);
  const mapperSkipped = mapped.skipped.length;

  // ── 6. 既存 anchors ──
  let existingAnchors: ReadonlyArray<ExternalAnchor>;
  try {
    existingAnchors = await deps.listExistingAnchors();
  } catch (e) {
    log({ kind: "list_anchors_failed", detail: e instanceof Error ? e.message : "unknown" });
    return { ok: false, error: "既存予定の取得に失敗しました。" };
  }

  // ── 7. dedup ──
  const { kept, skipped: dedupSkipped } = partitionMsDraftsByExistingUids(
    mapped.drafts,
    existingAnchors,
  );
  const skipped = mapperSkipped + dedupSkipped;

  // ── 8. kept 0 → source 作らず early return ──
  if (kept.length === 0) {
    log({ kind: "all_skipped", mapperSkipped, dedupSkipped });
    return { ok: true, imported: 0, skipped };
  }

  // ── 9. persist (= sourceType='microsoft_calendar') ──
  const anchors: CreateExternalAnchorInput[] = kept;
  const bundle: CreateSourceWithAnchorsInput = {
    source: {
      sourceType: "microsoft_calendar",
      rawRetention: "discarded",
      notes: SOURCE_NOTES,
    },
    anchors,
  };

  let result: CreateSourceWithAnchorsResult;
  try {
    result = await deps.createSourceWithAnchors(bundle);
  } catch (e) {
    log({ kind: "persist_threw", detail: e instanceof Error ? e.message : "unknown" });
    return { ok: false, error: "予定の保存中にエラーが発生しました。" };
  }

  if (!result.ok) {
    const firstError = result.errors[0];
    const detailMsg =
      firstError !== undefined
        ? firstError.kind === "source_invalid"
          ? `source 不正: ${firstError.errors[0]?.message ?? "詳細不明"}`
          : `anchor[${firstError.index}] 不正: ${firstError.errors[0]?.message ?? "詳細不明"}`
        : "詳細不明";
    log({ kind: "persist_rejected", detail: detailMsg });
    return { ok: false, error: `予定の保存に失敗しました (${detailMsg})。` };
  }

  log({ kind: "import_success", imported: result.anchors.length, skipped });
  return { ok: true, imported: result.anchors.length, skipped };
}
