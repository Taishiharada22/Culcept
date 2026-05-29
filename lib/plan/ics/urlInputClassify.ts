/**
 * URL Import Productization U1 — 貼付内容の賢い判定（pure / advisory）
 *
 * 設計書: docs/alter-plan-url-import-productization-readiness.md §2 U1
 * CEO 承認: 2026-05-30（5 分類 / advisory のみ / .ics 本文→ファイル誘導）
 *
 * 役割:
 *   - URL 入力欄に貼られた/打たれた文字列を **client 側で即時分類**（server 往復ゼロ）。
 *   - 目的は「失敗 round-trip を未然に防ぐ」+「その場で学べる」UX。
 *
 * 不変原則（CEO 方針）:
 *   1. **advisory のみ**: 本当の安全ゲートは server の SSRF guard / validation
 *      (`lib/plan/ics/icsUrlFetch.ts`)。本 module は「弾く/通す」の最終判定をしない。
 *   2. ハードブロックは **明らかな 2 ケースのみ**: 空入力（取得対象なし）と
 *      `.ics 本文`貼付（URL ではないので取得しても無意味 → ファイル取り込みへ誘導）。
 *      それ以外（http:// / ページ URL っぽい / ゴミ）は **fetch を試させ、server に精密判定させる**。
 *   3. pure（I/O なし・deterministic）→ 単体テスト容易。文言（コピー）は持たず、
 *      UI が kind → 表示に写像する（presentation 分離）。
 *
 * 5 分類（CEO 確定）:
 *   - ics_body            : `BEGIN:VCALENDAR` で始まる = カレンダーファイルの中身
 *   - webcal              : `webcal://`（購読リンク。server が https へ rewrite 済）
 *   - https_calendar_like : `https://` かつ `.ics` or 既知カレンダー host
 *   - https_page_guess    : `https://` だが calendar っぽくない（ページ URL かも）
 *   - invalid             : 空 / 空白・改行のみ / 非 URL / 非対応 scheme（http:// 等）
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type UrlInputKind =
  | "ics_body"
  | "webcal"
  | "https_calendar_like"
  | "https_page_guess"
  | "invalid";

export type UrlInputClassification = {
  readonly kind: UrlInputKind;
  /** invalid の細分（UI コピー出し分け用）: 空入力 か / それ以外（非URL・http:// 等） */
  readonly invalidReason?: "empty" | "not_a_url";
  /** ics_body の時のみ true = ファイル取り込みへ誘導すべき（CEO 補正2） */
  readonly suggestFileImport: boolean;
  /** server fetch を試す価値があるか（= 取り込みボタン enable の目安、advisory） */
  readonly canAttemptFetch: boolean;
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 既知カレンダー host（https_calendar_like 判定用、最小 allowlist）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * host にこれらを含めば「カレンダー URL っぽい」と推定（advisory のみ・厳密 allowlist ではない）。
 * - icloud.com: caldav.icloud.com / pNN-caldav.icloud.com / 公開 webcal→https。
 * - 過剰一致を避けるため "calendar" 単独などの曖昧語は入れない。
 */
const KNOWN_CALENDAR_HOST_FRAGMENTS: readonly string[] = [
  "calendar.google.com",
  "outlook.office365.com",
  "outlook.office.com",
  "outlook.live.com",
  ".icloud.com",
  "calendar.yahoo.com",
];

/** path にこれらを含めば「カレンダー配信っぽい」（webcal published / Google ical 等） */
const CALENDAR_PATH_HINTS: readonly string[] = [".ics", "/published/", "/ical/"];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// classifyUrlInput
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const ICS_BODY_HEAD = "begin:vcalendar";

/** https URL が「カレンダーっぽい」か（host allowlist or path hint、ci） */
function looksLikeCalendarHttps(parsed: URL): boolean {
  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname.toLowerCase();
  if (KNOWN_CALENDAR_HOST_FRAGMENTS.some((h) => host.includes(h))) return true;
  if (CALENDAR_PATH_HINTS.some((p) => path.includes(p))) return true;
  return false;
}

/**
 * 貼付/入力文字列を 5 分類に判定（pure / advisory）。
 *
 * 判定順（強いシグナルから）:
 *   1. 空（trim 後 0）→ invalid(empty)
 *   2. BEGIN:VCALENDAR 始まり → ics_body（ファイル誘導）
 *   3. webcal:// → webcal
 *   4. https:// → URL parse 成功で calendar-like / page_guess、 失敗で invalid(not_a_url)
 *   5. それ以外（http:// / scheme なし / ゴミ）→ invalid(not_a_url)
 */
export function classifyUrlInput(raw: string): UrlInputClassification {
  const trimmed = typeof raw === "string" ? raw.trim() : "";

  // 1. 空 / 空白・改行のみ
  if (trimmed.length === 0) {
    return { kind: "invalid", invalidReason: "empty", suggestFileImport: false, canAttemptFetch: false };
  }

  const lower = trimmed.toLowerCase();

  // 2. .ics 本文（カレンダーファイルの中身を貼った）→ ファイル取り込みへ（CEO 補正2）
  if (lower.startsWith(ICS_BODY_HEAD)) {
    return { kind: "ics_body", suggestFileImport: true, canAttemptFetch: false };
  }

  // 3. webcal:// （購読リンク。server が https へ rewrite）
  if (lower.startsWith("webcal://")) {
    return { kind: "webcal", suggestFileImport: false, canAttemptFetch: true };
  }

  // 4. https://
  if (lower.startsWith("https://")) {
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      // https:// で始まるが URL として壊れている
      return { kind: "invalid", invalidReason: "not_a_url", suggestFileImport: false, canAttemptFetch: false };
    }
    // host が無い等の異常
    if (parsed.hostname.length === 0) {
      return { kind: "invalid", invalidReason: "not_a_url", suggestFileImport: false, canAttemptFetch: false };
    }
    return looksLikeCalendarHttps(parsed)
      ? { kind: "https_calendar_like", suggestFileImport: false, canAttemptFetch: true }
      : { kind: "https_page_guess", suggestFileImport: false, canAttemptFetch: true };
  }

  // 5. それ以外（http:// / ftp:// / scheme なし / ゴミ）
  //    → server は https/webcal 以外を弾くので、ここで誘導（advisory）。
  return { kind: "invalid", invalidReason: "not_a_url", suggestFileImport: false, canAttemptFetch: false };
}
