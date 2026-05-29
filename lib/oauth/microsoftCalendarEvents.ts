/**
 * Track B TB-3: Microsoft Graph calendar events fetch (= GET /me/calendarView、 fetch mockable)
 *
 * 設計書: docs/alter-plan-track-b-provider-native-readiness.md §3 TB-3
 * (= googleCalendarEvents の MS Graph 版)
 *
 * 役割:
 *   - fetchMicrosoftCalendarEventsPage: 1 page 取得 (= calendarView、 time window)
 *   - fetchAllMicrosoftCalendarEvents: @odata.nextLink で全件取得 (= 安全上限あり)
 *   - calendarView は recurring を個別 instance に展開済 (= Google singleEvents=true 相当)
 *
 * TZ (= Track A 教訓):
 *   - `Prefer: outlook.timezone="Tokyo Standard Time"` を送り、 Graph に JST で返させる。
 *     → start.dateTime は JST naive (= "2026-05-29T21:00:00.0000000")。 mapper はそれを wall-clock
 *       として扱う。 万一 Z/offset が来ても mapper 側で JST 変換する (= 二重防御)。
 *
 * 不変原則 (= googleCalendarEvents と同):
 *   1. fetch 引数で inject 可能
 *   2. throw しない (= 戻り値で valid / invalid)
 *   3. pagination 安全上限 (= 暴走防止)
 *   4. DB / repository 一切触らない
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const GRAPH_CALENDAR_VIEW_ENDPOINT = "https://graph.microsoft.com/v1.0/me/calendarView";

/** Prefer outlook.timezone (= Windows tz 名。 app 表示 TZ = JST) */
const APP_OUTLOOK_TIMEZONE = "Tokyo Standard Time";

/** pagination 暴走防止上限 */
const PAGINATION_HARD_LIMIT = 100;

/** 1 page あたり件数 ($top) */
const DEFAULT_TOP = 100;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Raw event type (= Graph calendarView item)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Graph event の dateTimeTimeZone shape */
export interface GraphDateTimeTimeZone {
  /** ISO 8601 (= Prefer 指定時はその TZ の naive、 例 "2026-05-29T21:00:00.0000000") */
  readonly dateTime?: string;
  /** 例 "Tokyo Standard Time" / "UTC" */
  readonly timeZone?: string;
}

export interface MicrosoftCalendarEventRaw {
  readonly id: string;
  readonly iCalUId?: string;
  readonly subject?: string;
  readonly isCancelled?: boolean;
  readonly isAllDay?: boolean;
  /** singleInstance / occurrence / exception / seriesMaster */
  readonly type?: string;
  readonly start?: GraphDateTimeTimeZone;
  readonly end?: GraphDateTimeTimeZone;
  readonly location?: { readonly displayName?: string };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Single page fetch
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type FetchMsEventsInput = {
  readonly accessToken: string;
  /** ISO 8601 (= 取得期間 開始) */
  readonly startDateTime: string;
  /** ISO 8601 (= 取得期間 終了) */
  readonly endDateTime: string;
  readonly top?: number;
};

export type FetchMsEventsPageSuccess = {
  readonly ok: true;
  readonly events: ReadonlyArray<MicrosoftCalendarEventRaw>;
  readonly nextLink?: string;
};

export type FetchMsEventsPageFailure = {
  readonly ok: false;
  readonly reason: "network" | "unauthorized" | "forbidden" | "rate_limited" | "unknown";
  readonly detail?: string;
};

export type FetchMsEventsPageResult = FetchMsEventsPageSuccess | FetchMsEventsPageFailure;

function buildHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    // Track A 教訓: JST で返させる (= naive dateTime が JST wall-clock になる)
    Prefer: `outlook.timezone="${APP_OUTLOOK_TIMEZONE}"`,
  };
}

function classifyHttp(status: number): FetchMsEventsPageFailure["reason"] {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 429) return "rate_limited";
  return "unknown";
}

function parseEventsBody(json: unknown): {
  events: MicrosoftCalendarEventRaw[];
  nextLink?: string;
} | null {
  if (json === null || typeof json !== "object") return null;
  const obj = json as Record<string, unknown>;
  const rawItems = obj.value;
  if (!Array.isArray(rawItems)) return null;
  const events: MicrosoftCalendarEventRaw[] = [];
  for (const raw of rawItems) {
    if (raw === null || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    if (typeof r.id !== "string" || r.id.length === 0) continue;
    events.push(r as unknown as MicrosoftCalendarEventRaw);
  }
  const nextLink =
    typeof obj["@odata.nextLink"] === "string" && (obj["@odata.nextLink"] as string).length > 0
      ? (obj["@odata.nextLink"] as string)
      : undefined;
  return nextLink !== undefined ? { events, nextLink } : { events };
}

/**
 * calendarView の 1 page を取得。
 * @param urlOverride pagination の @odata.nextLink (= 指定時は params 無視してそのまま GET)
 */
export async function fetchMicrosoftCalendarEventsPage(
  input: FetchMsEventsInput,
  fetchImpl: typeof fetch = fetch,
  urlOverride?: string,
): Promise<FetchMsEventsPageResult> {
  let urlStr: string;
  if (urlOverride !== undefined) {
    urlStr = urlOverride;
  } else {
    const url = new URL(GRAPH_CALENDAR_VIEW_ENDPOINT);
    url.searchParams.set("startDateTime", input.startDateTime);
    url.searchParams.set("endDateTime", input.endDateTime);
    url.searchParams.set("$top", String(input.top ?? DEFAULT_TOP));
    url.searchParams.set("$orderby", "start/dateTime");
    urlStr = url.toString();
  }

  let response: Response;
  try {
    response = await fetchImpl(urlStr, { method: "GET", headers: buildHeaders(input.accessToken) });
  } catch (e) {
    return { ok: false, reason: "network", detail: e instanceof Error ? e.message : "unknown" };
  }

  if (!response.ok) {
    return { ok: false, reason: classifyHttp(response.status), detail: `http_${response.status}` };
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    return { ok: false, reason: "unknown", detail: "invalid_json" };
  }

  const parsed = parseEventsBody(json);
  if (parsed === null) {
    return { ok: false, reason: "unknown", detail: "value_not_array" };
  }
  return parsed.nextLink !== undefined
    ? { ok: true, events: parsed.events, nextLink: parsed.nextLink }
    : { ok: true, events: parsed.events };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// All pages fetch
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type FetchAllMsEventsResult =
  | {
      readonly ok: true;
      readonly events: ReadonlyArray<MicrosoftCalendarEventRaw>;
      readonly pageCount: number;
      readonly hitHardLimit: boolean;
    }
  | {
      readonly ok: false;
      readonly reason: FetchMsEventsPageFailure["reason"];
      readonly detail?: string;
      readonly partialEvents: ReadonlyArray<MicrosoftCalendarEventRaw>;
      readonly pageCount: number;
    };

/**
 * 全 page を @odata.nextLink loop で取得。
 * - 1 page 失敗 → partial events + error
 * - hard limit で打ち切り
 */
export async function fetchAllMicrosoftCalendarEvents(
  input: FetchMsEventsInput,
  fetchImpl: typeof fetch = fetch,
): Promise<FetchAllMsEventsResult> {
  const events: MicrosoftCalendarEventRaw[] = [];
  let nextLink: string | undefined;
  let pageCount = 0;
  let hitHardLimit = false;

  for (;;) {
    pageCount += 1;
    if (pageCount > PAGINATION_HARD_LIMIT) {
      hitHardLimit = true;
      break;
    }

    const page = await fetchMicrosoftCalendarEventsPage(input, fetchImpl, nextLink);
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
    if (page.nextLink) {
      nextLink = page.nextLink;
      continue;
    }
    break;
  }

  return {
    ok: true,
    events,
    pageCount: hitHardLimit ? PAGINATION_HARD_LIMIT : pageCount,
    hitHardLimit,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test 用 const export
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const __test__ = {
  GRAPH_CALENDAR_VIEW_ENDPOINT,
  APP_OUTLOOK_TIMEZONE,
  PAGINATION_HARD_LIMIT,
  DEFAULT_TOP,
};
