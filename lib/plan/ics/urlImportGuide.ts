/**
 * URL Import Productization U2 — サービス別 URL 取得ガイド（静的資産・pure data）
 *
 * 設計書: docs/alter-plan-url-import-productization-readiness.md §2 U2
 * CEO 承認: 2026-05-30（静的コンテンツ + contract test のみ / UI 未接続 / U2 で stop）
 *
 * 役割:
 *   - modal 内 inline accordion に載せる「URL をどこで取るか」の短いガイド資産。
 *   - **ヘルプ記事ではない**。modal 内で読み切れる短さ（各 step 1 行・3-4 step）。
 *
 * 不変原則（CEO 条件）:
 *   1. Google / Outlook は **OAuth が主導線**であることを明記（`oauthPrimary: true`）。
 *      URL はあくまで補助。
 *   2. Apple は **公開カレンダー URL で取り込める**ことを明記（OAuth ボタンは無い）。
 *   3. pure data（React / I/O なし）。UI（U3）が key → 表示に写像する。
 *   4. 文言は短く・断定しすぎない（各サービスの UI 変化に追従しすぎない）。
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type CalendarProviderKey = "google" | "outlook" | "apple" | "other";

export type CalendarUrlGuide = {
  readonly key: CalendarProviderKey;
  /** modal 内の短い見出し */
  readonly title: string;
  /**
   * OAuth が主導線か（= google / outlook は true）。
   * UI が「まず上のワンクリック接続を」を出し、URL を補助に下げる根拠（CEO 条件 1・3）。
   */
  readonly oauthPrimary: boolean;
  /** 公開 URL 取り込みが現実的か（= 全 provider true。apple は核、CEO 条件 2） */
  readonly urlSupported: boolean;
  /** 1 行の位置づけ（OAuth 主導線 / 公開 URL で取り込める 等） */
  readonly lead: string;
  /** URL 取得の短い手順（modal 内で読める長さ、3-4 step） */
  readonly steps: readonly string[];
  /** 補足 1 行（任意） */
  readonly note?: string;
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Guides（短く・modal 内可読）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const GOOGLE_GUIDE: CalendarUrlGuide = {
  key: "google",
  title: "Google カレンダー",
  oauthPrimary: true,
  urlSupported: true,
  lead: "まず上の「Google カレンダーを接続」が簡単です。公開 URL から取り込むこともできます。",
  steps: [
    "パソコンで Google カレンダーを開く",
    "設定 → 対象カレンダー → 「カレンダーの統合」",
    "「iCal 形式の限定公開 URL」をコピー",
  ],
  note: "限定公開 URL は他人に共有しないでください。",
};

const OUTLOOK_GUIDE: CalendarUrlGuide = {
  key: "outlook",
  title: "Outlook / Microsoft 365",
  oauthPrimary: true,
  urlSupported: true,
  lead: "まず上の「Outlook カレンダーを接続」が簡単です。公開 URL からも取り込めます。",
  steps: [
    "outlook.com で 設定 → カレンダー → 「共有とアクセス許可」",
    "対象カレンダーを「公開」に設定",
    "「ICS」リンクをコピー",
  ],
  note: "公開にすると、URL を知る人が閲覧できます。",
};

const APPLE_GUIDE: CalendarUrlGuide = {
  key: "apple",
  title: "Apple / iCloud",
  oauthPrimary: false,
  urlSupported: true,
  lead: "Apple は公開カレンダー URL で取り込めます（接続ボタンはありません）。",
  steps: [
    "iCloud.com でカレンダーを開く",
    "対象カレンダー横の共有アイコン → 「公開カレンダー」を ON",
    "表示された webcal:// リンクをコピー",
  ],
  note: "非公開のまま取り込む方法は今後対応予定です。",
};

const OTHER_GUIDE: CalendarUrlGuide = {
  key: "other",
  title: "その他のサービス",
  oauthPrimary: false,
  urlSupported: true,
  lead: "公開（iCal / ICS）リンクを発行できるサービスなら取り込めます。",
  steps: [
    "カレンダー設定で「公開」「iCal」「ICS」リンクを探す",
    "その URL をコピーして貼り付け",
  ],
  note: "「.ics」で終わる URL や webcal:// が目印です。",
};

/** 表示順（OAuth 主導線 2 つ → Apple → その他） */
export const CALENDAR_URL_GUIDES: readonly CalendarUrlGuide[] = [
  GOOGLE_GUIDE,
  OUTLOOK_GUIDE,
  APPLE_GUIDE,
  OTHER_GUIDE,
];

/** key → ガイド（無効 key は undefined） */
export function getCalendarUrlGuide(
  key: CalendarProviderKey,
): CalendarUrlGuide | undefined {
  return CALENDAR_URL_GUIDES.find((g) => g.key === key);
}
