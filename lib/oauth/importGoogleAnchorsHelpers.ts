/**
 * P3 Phase B B-2 — importGoogleAnchors の pure helpers + DI orchestration core
 *
 * 設計: docs/alter-plan-p3-phase-b-readiness.md / B-2 readiness (= 2026-05-29 CEO GO)
 *
 * 役割:
 *   - server action ("use server") から import すると server-only が test 環境 (vitest "node")
 *     を破壊するため、 pure 部分 (= dedup partition / 時間窓 / orchestration) を非 server module に分離
 *   - action 本体 (= app/(culcept)/plan/_actions/importGoogleAnchors.ts) はここから
 *     runGoogleAnchorImport を import し、 real deps (= supabase / env / repository) を結線するだけ
 *
 * 不変原則:
 *   1. 副作用なし (= DB / IO / time / random / env は **すべて deps で注入**)
 *   2. 入力 mutate なし
 *   3. server-only 依存なし (= vitest "node" 環境で直接 import 可能)
 *   4. throw しない (= 戻り値で ok / error を返す。 createSourceWithAnchors の throw のみ catch)
 *   5. ICS (= importIcsAnchors) と Result shape / dedup 思想を完全に揃える
 *
 * ICS との差分 (= B-2 readiness §3):
 *   - 入力が client drafts ではなく server-fetched events (= OAuth 経由)
 *   - connection 前提 (= active connection + token refresh/decrypt) による error 種別が増える
 *   - skipped = mapper skip (cancelled/invalid) + dedup skip の合算
 *   - GoogleAnchorDraft は既に CreateExternalAnchorInput 互換 (= draftToAnchorInput 変換不要)
 */

import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import type { CreateExternalAnchorInput } from "@/lib/plan/external-anchor-input";
import type {
  CreateSourceWithAnchorsInput,
  CreateSourceWithAnchorsResult,
} from "@/lib/plan/external-anchor-repository";
import type { FindConnectionResult } from "./calendarConnectionRepository";
import type { RefreshAccessTokenResult } from "./googleCalendarApi";
import type {
  FetchAllEventsResult,
  GoogleCalendarEventRaw,
} from "./googleCalendarEvents";
import type { DecryptResult } from "./tokenCrypto";
import {
  mapGoogleEventsToAnchorDrafts,
  type GoogleAnchorDraft,
} from "./googleEventsToAnchorMapper";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 時間窓 (= 親 Q4 採用案: 初回は過去 30 日 + 未来 90 日、 googleCalendarEvents.ts §1.4 確定)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 取得窓: 過去日数 (= 親 Q4 採用案) */
export const IMPORT_WINDOW_PAST_DAYS = 30;
/** 取得窓: 未来日数 (= 親 Q4 採用案) */
export const IMPORT_WINDOW_FUTURE_DAYS = 90;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** events.list の timeMin / timeMax (= RFC3339 ISO) を now 基準で構築 (= pure) */
export function buildGoogleImportWindow(now: Date): {
  timeMin: string;
  timeMax: string;
} {
  const timeMin = new Date(
    now.getTime() - IMPORT_WINDOW_PAST_DAYS * MS_PER_DAY,
  ).toISOString();
  const timeMax = new Date(
    now.getTime() + IMPORT_WINDOW_FUTURE_DAYS * MS_PER_DAY,
  ).toISOString();
  return { timeMin, timeMax };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// partitionGoogleDraftsByExistingUids (= ICS 版の Google variant、 .externalUid keyed)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Google drafts と既存 anchors を partition (= externalUid 完全一致で skip)
 *
 * - 既存 anchors の externalUid (= 空でないもの) を Set 化
 * - drafts を 「kept (= 新規)」 と 「skipped (= 重複)」 に分ける
 * - 入力 mutate なし、 順序は drafts と同じ
 * - cross-source dedup は意図的 (= 同一 iCalUID を .ics と Google から二重取込しない)
 */
export function partitionGoogleDraftsByExistingUids(
  drafts: ReadonlyArray<GoogleAnchorDraft>,
  existingAnchors: ReadonlyArray<ExternalAnchor>,
): { kept: GoogleAnchorDraft[]; skipped: number } {
  const existingUids = new Set<string>();
  for (const a of existingAnchors) {
    if (a.externalUid !== undefined && a.externalUid.length > 0) {
      existingUids.add(a.externalUid);
    }
  }

  const kept: GoogleAnchorDraft[] = [];
  let skipped = 0;
  for (const d of drafts) {
    if (existingUids.has(d.externalUid)) {
      skipped += 1;
    } else {
      kept.push(d);
    }
  }
  return { kept, skipped };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Result + DI deps 型
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** ICS (= ImportIcsAnchorsResult) と完全同形 (= client render contract 共通) */
export type GoogleImportResult =
  | { readonly ok: true; readonly imported: number; readonly skipped: number }
  | { readonly ok: false; readonly error: string };

/** enabled subscription の calendarId 一覧取得結果 */
export type ListEnabledCalendarIdsResult =
  | { readonly ok: true; readonly calendarIds: ReadonlyArray<string> }
  | { readonly ok: false; readonly detail?: string };

/** 観測 log event (= 副作用なし、 caller が console / Sentry に流す) */
export type GoogleImportLogEvent =
  | { readonly kind: "connection_lookup_failed"; readonly detail: string }
  | { readonly kind: "not_connected" }
  | { readonly kind: "connection_inactive"; readonly status: string }
  | { readonly kind: "decrypt_failed"; readonly reason: string }
  | { readonly kind: "refresh_failed"; readonly reason: string }
  | { readonly kind: "list_calendars_failed"; readonly detail?: string }
  | { readonly kind: "no_enabled_calendars" }
  | {
      readonly kind: "fetch_failed";
      readonly calendarId: string;
      readonly reason: string;
      readonly detail?: string;
    }
  | { readonly kind: "all_fetch_failed" }
  | { readonly kind: "list_anchors_failed"; readonly detail: string }
  | {
      readonly kind: "all_skipped";
      readonly mapperSkipped: number;
      readonly dedupSkipped: number;
    }
  | { readonly kind: "persist_threw"; readonly detail: string }
  | { readonly kind: "persist_rejected"; readonly detail: string }
  | {
      readonly kind: "import_success";
      readonly imported: number;
      readonly skipped: number;
    };

/**
 * orchestration core が必要とする IO 依存 (= すべて bound 済の関数で注入)。
 *
 * - すべて action 側で real module (= supabase client / env key / repository) に結線
 * - core 自身は supabase / env / time / random を一切 import しない (= pure / node-safe)
 */
export type GoogleImportDeps = {
  /** active google connection を取得 (= refreshTokenEncrypted + status + id) */
  readonly findConnection: () => Promise<FindConnectionResult>;
  /** refresh_token を復号 (= env key は caller が bind 済) */
  readonly decryptToken: (encrypted: Buffer) => DecryptResult;
  /** refresh_token → access_token (= clientId/secret は caller が bind 済) */
  readonly refreshAccessToken: (
    refreshToken: string,
  ) => Promise<RefreshAccessTokenResult>;
  /** connection の is_enabled subscription の calendarId 一覧 */
  readonly listEnabledCalendarIds: (
    connectionId: string,
  ) => Promise<ListEnabledCalendarIdsResult>;
  /** 1 calendar の全 events 取得 (= pagination 込み) */
  readonly fetchAllEvents: (args: {
    calendarId: string;
    accessToken: string;
    timeMin: string;
    timeMax: string;
  }) => Promise<FetchAllEventsResult>;
  /** 既存 anchors (= dedup base) */
  readonly listExistingAnchors: () => Promise<ReadonlyArray<ExternalAnchor>>;
  /** source + anchors を永続化 (= userId は caller が bind 済) */
  readonly createSourceWithAnchors: (
    bundle: CreateSourceWithAnchorsInput,
  ) => Promise<CreateSourceWithAnchorsResult>;
  /** 現在時刻 (= 時間窓計算、 test で固定) */
  readonly now: () => Date;
  /** 観測 log (= optional、 default no-op) */
  readonly log?: (event: GoogleImportLogEvent) => void;
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// runGoogleAnchorImport (= orchestration core、 pure / fully testable)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const SOURCE_NOTES = "Google カレンダーから取り込み";

/**
 * Google Calendar import の本流 orchestration (= B-2 本実装の核)。
 *
 * 手順 (= B-2 readiness §1):
 *   1. findConnection → 不在/inactive は user 向け error
 *   2. decryptToken(refresh_token)
 *   3. refreshAccessToken → invalid_grant=再接続要 / invalid_client=設定不備 / 他=通信失敗
 *   4. listEnabledCalendarIds → 0 件は ok:true imported:0 (= source 作らず)
 *   5. 各 calendar を fetchAllEvents (= 部分失敗は partialEvents 採用 + 継続)
 *   6. mapGoogleEventsToAnchorDrafts (= cancelled/invalid を skip)
 *   7. listExistingAnchors → dedup base
 *   8. partition (= externalUid 完全一致で skip)
 *   9. kept 0 件 → source 作らず ok:true (= source 一覧汚染防止、 ICS と同)
 *  10. createSourceWithAnchors (= sourceType='google_calendar')
 *
 * @returns ICS と同形の { ok, imported, skipped } / { ok:false, error }
 */
export async function runGoogleAnchorImport(
  deps: GoogleImportDeps,
): Promise<GoogleImportResult> {
  const log = deps.log ?? (() => {});

  // ── 1. connection 取得 ──
  const connResult = await deps.findConnection();
  if (!connResult.ok) {
    log({ kind: "connection_lookup_failed", detail: connResult.detail });
    return { ok: false, error: "接続情報の取得に失敗しました。" };
  }
  if (!connResult.connection) {
    log({ kind: "not_connected" });
    return { ok: false, error: "Google カレンダーが接続されていません。" };
  }
  const connection = connResult.connection;
  if (connection.status !== "active") {
    log({ kind: "connection_inactive", status: connection.status });
    return { ok: false, error: "Google カレンダーの再接続が必要です。" };
  }

  // ── 2. refresh_token 復号 ──
  const decrypted = deps.decryptToken(connection.refreshTokenEncrypted);
  if (!decrypted.ok) {
    log({ kind: "decrypt_failed", reason: decrypted.reason });
    // key 不整合 / data 破損 → user は再接続で復旧できる
    return { ok: false, error: "Google カレンダーの再接続が必要です。" };
  }

  // ── 3. access_token 更新 ──
  const refresh = await deps.refreshAccessToken(decrypted.plaintext);
  if (!refresh.ok) {
    log({ kind: "refresh_failed", reason: refresh.reason });
    if (refresh.reason === "invalid_grant") {
      // refresh_token 失効 (= revoke / 7 日未使用 等) → 再連携要求
      return { ok: false, error: "Google カレンダーの再接続が必要です。" };
    }
    if (refresh.reason === "invalid_client") {
      // client_secret 不一致 = server 設定不備
      return { ok: false, error: "サーバー設定が不完全です。" };
    }
    return { ok: false, error: "Google カレンダーとの通信に失敗しました。" };
  }
  const accessToken = refresh.accessToken;

  // ── 4. 取り込み対象 calendar ──
  const calsResult = await deps.listEnabledCalendarIds(connection.id);
  if (!calsResult.ok) {
    log({
      kind: "list_calendars_failed",
      ...(calsResult.detail !== undefined ? { detail: calsResult.detail } : {}),
    });
    return { ok: false, error: "取り込み対象カレンダーの取得に失敗しました。" };
  }
  if (calsResult.calendarIds.length === 0) {
    // 有効カレンダーなし → source 作らず正常終了 (= ICS の empty-drafts と同思想)
    log({ kind: "no_enabled_calendars" });
    return { ok: true, imported: 0, skipped: 0 };
  }

  // ── 5. events 取得 (= 各 calendar、 部分失敗は partial 採用 + 継続) ──
  const window = buildGoogleImportWindow(deps.now());
  const allEvents: GoogleCalendarEventRaw[] = [];
  let anyFetchSucceeded = false;
  let anyFetchFailed = false;
  for (const calendarId of calsResult.calendarIds) {
    const fetched = await deps.fetchAllEvents({
      calendarId,
      accessToken,
      timeMin: window.timeMin,
      timeMax: window.timeMax,
    });
    if (fetched.ok) {
      anyFetchSucceeded = true;
      allEvents.push(...fetched.events);
    } else {
      anyFetchFailed = true;
      // 部分成功分は採用 (= googleCalendarEvents は失敗前 events を partialEvents で返す)
      allEvents.push(...fetched.partialEvents);
      log({
        kind: "fetch_failed",
        calendarId,
        reason: fetched.reason,
        ...(fetched.detail !== undefined ? { detail: fetched.detail } : {}),
      });
    }
  }
  // 全 calendar 失敗 + 1 件も取れていない → error (= 部分でも取れていれば続行)
  if (anyFetchFailed && !anyFetchSucceeded && allEvents.length === 0) {
    log({ kind: "all_fetch_failed" });
    return { ok: false, error: "予定の取得に失敗しました。" };
  }

  // ── 6. map → drafts (= cancelled / invalid を skip) ──
  const mapped = mapGoogleEventsToAnchorDrafts(allEvents);
  const mapperSkipped = mapped.skipped.length;

  // ── 7. 既存 anchors (= dedup base) ──
  let existingAnchors: ReadonlyArray<ExternalAnchor>;
  try {
    existingAnchors = await deps.listExistingAnchors();
  } catch (e) {
    log({
      kind: "list_anchors_failed",
      detail: e instanceof Error ? e.message : "unknown",
    });
    return { ok: false, error: "既存予定の取得に失敗しました。" };
  }

  // ── 8. dedup partition (= externalUid 完全一致) ──
  const { kept, skipped: dedupSkipped } = partitionGoogleDraftsByExistingUids(
    mapped.drafts,
    existingAnchors,
  );
  const skipped = mapperSkipped + dedupSkipped;

  // ── 9. 取り込む新規 0 件 → source 作らず early return (= source 一覧汚染防止) ──
  if (kept.length === 0) {
    log({ kind: "all_skipped", mapperSkipped, dedupSkipped });
    return { ok: true, imported: 0, skipped };
  }

  // ── 10. atomic persist (= sourceType='google_calendar'、 RPC + fallback) ──
  // GoogleAnchorDraft は CreateOneOffAnchorInput & {externalUid} なので CreateExternalAnchorInput 互換
  const anchors: CreateExternalAnchorInput[] = kept;
  const bundle: CreateSourceWithAnchorsInput = {
    source: {
      sourceType: "google_calendar",
      rawRetention: "discarded",
      notes: SOURCE_NOTES,
    },
    anchors,
  };

  let result: CreateSourceWithAnchorsResult;
  try {
    result = await deps.createSourceWithAnchors(bundle);
  } catch (e) {
    log({
      kind: "persist_threw",
      detail: e instanceof Error ? e.message : "unknown",
    });
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
