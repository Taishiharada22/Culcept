/**
 * P3-A-1-2 C-α: Google Calendar events fetch (= GET events.list、 fetch mockable)
 *
 * 設計書: docs/alter-plan-p3-a-1-1-oauth-scaffold-readiness.md §1.4 (= initial sync 範囲)
 * decision-log: 2026-05-26 D-e 採用、 DB 非依存進行範囲
 *
 * 役割:
 *   - fetchCalendarEvents: 1 page 取得 (= maxResults / pageToken / time window)
 *   - fetchAllCalendarEvents: pagination loop で全件取得 (= 安全上限あり)
 *   - response shape validation
 *   - 親 Q4 採用案: 初回は過去 30 日 + 未来 90 日 window (= caller 側で timeMin/Max 指定)
 *
 * 不変原則 (= D-e 整合):
 *   1. fetch 引数で inject 可能 (= test mock 必須)
 *   2. throw しない (= 戻り値で valid / invalid)
 *   3. pagination loop は **安全上限 100 page** (= max 25 万件、 暴走防止)
 *   4. singleEvents=true 固定 (= recurring → 個別 instance 展開、 後段 transform を単純化)
 *   5. orderBy=startTime 固定
 *   6. DB / repository 一切触らない (= C-α は DB 非依存)
 *
 * 範囲外:
 *   - syncToken による incremental sync (= 後段、 別 commit)
 *   - 複数 calendar 横断 fetch (= caller 側で連続呼出)
 *   - DB persist (= migration apply 後の別 commit)
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const GOOGLE_CALENDAR_EVENTS_ENDPOINT_BASE =
  "https://www.googleapis.com/calendar/v3/calendars";

/** pagination loop の暴走防止上限 (= 100 page × default 250 件 = 25,000 件) */
const PAGINATION_HARD_LIMIT = 100;

/** 1 page あたりの events 数 (= Google default 250、 max 2500) */
const DEFAULT_MAX_RESULTS = 250;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Raw event type (= Google API response shape)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Google Calendar event の raw shape (= API response の events.list items[i])。
 *
 * 必須フィールドのみ厳密に型付け、 optional は受け入れる柔軟構造。
 * transform layer (= googleEventsToAnchorMapper) で validation 行う。
 */
export interface GoogleCalendarEventRaw {
  readonly id: string;
  readonly status?: "confirmed" | "tentative" | "cancelled";
  readonly summary?: string;
  readonly description?: string;
  readonly location?: string;
  readonly iCalUID?: string;
  readonly start?: {
    readonly dateTime?: string;
    readonly date?: string;
    readonly timeZone?: string;
  };
  readonly end?: {
    readonly dateTime?: string;
    readonly date?: string;
    readonly timeZone?: string;
  };
  readonly transparency?: "opaque" | "transparent";
  readonly visibility?: "default" | "public" | "private" | "confidential";
  readonly recurrence?: ReadonlyArray<string>;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Single page fetch
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type FetchEventsInput = {
  /** Google calendar ID (= 'primary' / 'user@gmail.com' / 'shared@group.calendar.google.com') */
  readonly calendarId: string;
  /** OAuth access_token (= Bearer header) */
  readonly accessToken: string;
  /** ISO 8601 RFC3339 (= 取得期間 開始) */
  readonly timeMin: string;
  /** ISO 8601 RFC3339 (= 取得期間 終了) */
  readonly timeMax: string;
  /** pagination token (= 続き取得時のみ) */
  readonly pageToken?: string;
  /** 1 page 件数 (= default 250、 max 2500) */
  readonly maxResults?: number;
};

export type FetchEventsPageSuccess = {
  readonly ok: true;
  readonly events: ReadonlyArray<GoogleCalendarEventRaw>;
  readonly nextPageToken?: string;
  readonly nextSyncToken?: string;
};

export type FetchEventsPageFailure = {
  readonly ok: false;
  readonly reason: "network" | "unauthorized" | "not_found" | "rate_limited" | "unknown";
  readonly detail?: string;
};

export type FetchEventsPageResult = FetchEventsPageSuccess | FetchEventsPageFailure;

/**
 * Google Calendar events.list の 1 page を取得。
 *
 * - GET /calendar/v3/calendars/{calendarId}/events?...
 * - Authorization: Bearer <accessToken>
 * - singleEvents=true で recurring → 個別 instance 展開済
 * - 取得後 response.json() を厳密に shape validation し、 不正は ok:false
 */
export async function fetchCalendarEvents(
  input: FetchEventsInput,
  fetchImpl: typeof fetch = fetch,
): Promise<FetchEventsPageResult> {
  const url = new URL(
    `${GOOGLE_CALENDAR_EVENTS_ENDPOINT_BASE}/${encodeURIComponent(input.calendarId)}/events`,
  );
  url.searchParams.set("timeMin", input.timeMin);
  url.searchParams.set("timeMax", input.timeMax);
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("maxResults", String(input.maxResults ?? DEFAULT_MAX_RESULTS));
  if (input.pageToken) {
    url.searchParams.set("pageToken", input.pageToken);
  }

  let response: Response;
  try {
    response = await fetchImpl(url.toString(), {
      method: "GET",
      headers: { Authorization: `Bearer ${input.accessToken}` },
    });
  } catch (e) {
    return {
      ok: false,
      reason: "network",
      detail: e instanceof Error ? e.message : "unknown",
    };
  }

  if (response.status === 401) return { ok: false, reason: "unauthorized" };
  if (response.status === 404) return { ok: false, reason: "not_found" };
  if (response.status === 429) return { ok: false, reason: "rate_limited" };
  if (!response.ok) {
    return { ok: false, reason: "unknown", detail: `http_${response.status}` };
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    return { ok: false, reason: "unknown", detail: "invalid_json" };
  }

  if (json === null || typeof json !== "object") {
    return { ok: false, reason: "unknown", detail: "not_object" };
  }
  const obj = json as Record<string, unknown>;
  const rawItems = obj.items;
  if (!Array.isArray(rawItems)) {
    return { ok: false, reason: "unknown", detail: "items_not_array" };
  }

  // raw shape の最小 validation (= id 必須、 他は optional)
  const events: GoogleCalendarEventRaw[] = [];
  for (const raw of rawItems) {
    if (raw === null || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    if (typeof r.id !== "string" || r.id.length === 0) continue;
    events.push(r as unknown as GoogleCalendarEventRaw);
  }

  const result: FetchEventsPageSuccess = {
    ok: true,
    events,
  };
  if (typeof obj.nextPageToken === "string" && obj.nextPageToken.length > 0) {
    return { ...result, nextPageToken: obj.nextPageToken };
  }
  if (typeof obj.nextSyncToken === "string" && obj.nextSyncToken.length > 0) {
    return { ...result, nextSyncToken: obj.nextSyncToken };
  }
  return result;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// All pages fetch (= pagination loop)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type FetchAllEventsInput = Omit<FetchEventsInput, "pageToken">;

export type FetchAllEventsResult =
  | {
      readonly ok: true;
      readonly events: ReadonlyArray<GoogleCalendarEventRaw>;
      /** 最終 page で取得した syncToken (= 後段 incremental sync 用、 別 phase) */
      readonly syncToken?: string;
      /** loop 回数 (= 観測 / debug) */
      readonly pageCount: number;
      /** hard limit に到達した場合 true (= 取得 incomplete の警告) */
      readonly hitHardLimit: boolean;
    }
  | {
      readonly ok: false;
      readonly reason: FetchEventsPageFailure["reason"];
      readonly detail?: string;
      /** 失敗前に取得済 events (= 部分成功の取り出し) */
      readonly partialEvents: ReadonlyArray<GoogleCalendarEventRaw>;
      readonly pageCount: number;
    };

/**
 * 全 page を取得するまで pagination loop。
 *
 * - 1 page 失敗時は partial events + error を返す (= caller で部分採用判断可)
 * - hard limit (= 100 page) で打ち切り、 hitHardLimit: true (= 25,000 件超過は別 strategy 必要)
 * - syncToken は最終 page でのみ含まれる仕様
 */
export async function fetchAllCalendarEvents(
  input: FetchAllEventsInput,
  fetchImpl: typeof fetch = fetch,
): Promise<FetchAllEventsResult> {
  const events: GoogleCalendarEventRaw[] = [];
  let pageToken: string | undefined;
  let syncToken: string | undefined;
  let pageCount = 0;
  let hitHardLimit = false;

  while (true) {
    pageCount += 1;
    if (pageCount > PAGINATION_HARD_LIMIT) {
      hitHardLimit = true;
      break;
    }

    const pageInput: FetchEventsInput = {
      calendarId: input.calendarId,
      accessToken: input.accessToken,
      timeMin: input.timeMin,
      timeMax: input.timeMax,
      ...(input.maxResults !== undefined ? { maxResults: input.maxResults } : {}),
      ...(pageToken !== undefined ? { pageToken } : {}),
    };
    const page = await fetchCalendarEvents(pageInput, fetchImpl);

    if (!page.ok) {
      return {
        ok: false,
        reason: page.reason,
        ...(page.detail !== undefined ? { detail: page.detail } : {}),
        partialEvents: events,
        pageCount,
      };
    }

    events.push(...page.events);

    if (page.nextPageToken) {
      pageToken = page.nextPageToken;
      continue;
    }
    // 最終 page (= syncToken は最終 page にのみ含まれる)
    if (page.nextSyncToken) syncToken = page.nextSyncToken;
    break;
  }

  return {
    ok: true,
    events,
    pageCount: hitHardLimit ? PAGINATION_HARD_LIMIT : pageCount,
    hitHardLimit,
    ...(syncToken !== undefined ? { syncToken } : {}),
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test 用 const export
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const __test__ = {
  GOOGLE_CALENDAR_EVENTS_ENDPOINT_BASE,
  PAGINATION_HARD_LIMIT,
  DEFAULT_MAX_RESULTS,
};
