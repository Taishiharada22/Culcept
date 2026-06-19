/**
 * lib/plan/candidateLens/placeDetailsEnrichment.ts
 *   — Candidate Lens / Phase 4-a: Place Details **pure / client-contract** 層
 *
 * ★スコープ厳守（CEO 2026-06-16・P4-a 条件付き GO）:
 *   - 実装してよいのは **pure 型 + honesty mapper + field mask 定数 + flags + contract** のみ。
 *   - **実 Google Places API 呼び出し・Google adapter 実装・API route・actual fetch・env/key/GCP 変更・
 *     課金・②③ への実 UI 配線・JSX・写真 media URL 取得・永続キャッシュ・DB・production 有効化 — 全て P4-a 範囲外**。
 * ★honesty（絶対原則）:
 *   - 写真あり→displayable / 写真なし→abstract tile fallback。
 *   - 営業時間あり→confirmed / 営業時間なし→unconfirmed。`openNow` が null は **unknown（推測禁止）**。
 *   - **Wi-Fi / 電源 / 静か / 雰囲気 は本型に存在しない**（実値化を構造的に不可能化）。enrichment は Google 由来のみ。
 * ★no persistent cache: 重複排除は session 内 Map memo のみ（型契約だけ・localStorage/DB へ書かない）。
 * ★pure: Date/network/外部 API 不使用。lib は app component に依存しない。
 */

// ───────────────────────── 1. 型 ─────────────────────────

/** fetch の状態（P4-a では Fake のみが返す。idle=未試行 / skipped=flag OFF・非対象 / loading / ok / error）。 */
export type EnrichmentFetchStatus = "idle" | "loading" | "ok" | "error" | "skipped";

/** fail-open 用エラー（throw しない・UI は abstract/未確認 に戻す）。message にキー文字列・PII を含めない。 */
export interface EnrichmentError {
  readonly kind: "timeout" | "http" | "parse" | "unavailable" | "disabled";
  readonly message: string;
}

/** 写真 1 枚の attribution（Google policy 必須・値があれば表示義務）。 */
export interface PhotoAuthorAttribution {
  readonly displayName: string | null;
  readonly uri: string | null; // 撮影者プロフィール
  readonly photoUri: string | null; // 撮影者アイコン
}

/** 写真メタ。★P4-c: `photoUri` を additive 追加（server が skipHttpRedirect で解決した lh3 clean URL・無ければ null）。 */
export interface EnrichedPhoto {
  /** 形式: places/{PLACE_ID}/photos/{REF}（media エンドポイントに渡す resource name・★永続化しない）。 */
  readonly name: string;
  readonly widthPx: number | null;
  readonly heightPx: number | null;
  /** 空配列可。非空なら表示必須。 */
  readonly authorAttributions: readonly PhotoAuthorAttribution[];
  /** ★P4-c: server 側 skipHttpRedirect 解決済みの photoUri（lh3・キー非埋め込み）。media 失敗/未解決は null。★永続化しない。 */
  readonly photoUri: string | null;
}

/** 営業状態（honesty: 不明は推測せず unknown）。 */
export type OpenStateHonest = "open" | "closed" | "unknown";

/** 営業時間（Google `regularOpeningHours` 由来のみ）。 */
export interface EnrichedHours {
  /** openNow が無ければ null（→ openState=unknown）。 */
  readonly openNow: boolean | null;
  /** 例「月曜日: 9時00分～18時00分」。 */
  readonly weekdayDescriptions: readonly string[];
  /** openNow からのみ導出（曜日記述から開閉を推測しない）。 */
  readonly openState: OpenStateHonest;
}

/**
 * ★Place Details の付加情報（Google 由来のみ・推定と分離）。
 *   - `provenance` を "google_places" リテラル固定 → 「Google 由来」を型レベルで明示（推定 computed/weak と混ざらない）。
 *   - ★wifi/power/quiet/crowd/ambience/social のキーは**存在しない**（実値化を構造的に不可能化）。
 */
export interface PlaceDetailsEnrichment {
  readonly placeId: string;
  readonly provenance: "google_places";
  /** null = 写真なし → abstract tile fallback。 */
  readonly photo: EnrichedPhoto | null;
  /** null = 営業時間なし → 未確認のまま。 */
  readonly hours: EnrichedHours | null;
  readonly fetchStatus: EnrichmentFetchStatus;
  /** fail-open（throw しない・error を載せて resolve）。 */
  readonly error: EnrichmentError | null;
  /** ★session-only・永続化しない。P4-a では Fake が null/固定値を入れる。 */
  readonly fetchedAtMs: number | null;
}

/** UI に渡す解決済み表示意図（mapper の出力）。②③ の実描画は P4-d。 */
export interface EnrichmentResolution {
  /** false → PlaceTile(abstract) を使う。 */
  readonly photoDisplayable: boolean;
  /** ★P4-c: 実写真として `<img src>` に渡す URL（displayable な時だけ非 null）。 */
  readonly photoMediaUrl: string | null;
  /** 表示必須（空配列可）。photoDisplayable=true の時のみ非空になりうる。 */
  readonly photoAttributions: readonly PhotoAuthorAttribution[];
  /** true → 確認済み行 / false → UNCONFIRMED_ROWS（🕐営業時間）のまま。 */
  readonly hoursConfirmed: boolean;
  readonly openState: OpenStateHonest;
  /** confirmed 時のみ非空（weekdayDescriptions）。 */
  readonly hoursLines: readonly string[];
  /** 写真 or 営業時間を実表示する時 true（Powered by Google を出す）。 */
  readonly showGoogleAttribution: boolean;
}

// ───────────────────────── 2. honesty mapper（pure） ─────────────────────────

/** openNow → 営業状態（honesty: null は unknown・推測しない）。 */
export function deriveOpenState(openNow: boolean | null): OpenStateHonest {
  if (openNow === true) return "open";
  if (openNow === false) return "closed";
  return "unknown";
}

/** 生の営業時間 → EnrichedHours（openState を honesty で導出）。 */
export function buildEnrichedHours(input: {
  openNow: boolean | null;
  weekdayDescriptions: readonly string[];
}): EnrichedHours {
  return {
    openNow: input.openNow,
    weekdayDescriptions: input.weekdayDescriptions,
    openState: deriveOpenState(input.openNow),
  };
}

/** 全 fallback（enrichment なし/未 ok 時＝P4 前と同一の表示意図）。 */
const FALLBACK_RESOLUTION: EnrichmentResolution = Object.freeze({
  photoDisplayable: false,
  photoMediaUrl: null,
  photoAttributions: [],
  hoursConfirmed: false,
  openState: "unknown",
  hoursLines: [],
  showGoogleAttribution: false,
});

/** 写真に「表示可能な author attribution」があるか（displayName 非空が 1 件以上）。 */
function hasUsableAttribution(photo: EnrichedPhoto | null): boolean {
  return photo != null && photo.authorAttributions.some((a) => (a.displayName ?? "").trim().length > 0);
}

/**
 * ★enrichment → 表示意図（pure・honesty 核）。
 *   - enrichment=null / fetchStatus≠"ok" → 全 fallback（現状と同一）。
 *   - 写真は **photoUri(実 URL) があり、かつ author attribution が出せる時だけ** displayable。
 *     （★CEO: attribution が出せない/URL が無い場合は写真を表示しない＝abstract fallback）。
 *   - 営業時間あり → confirmed（openState=open/closed/unknown）。なし → unconfirmed 据置。
 *   - ★Wi-Fi/電源/静か/雰囲気 は触らない（enrichment に項目が無い＝実値化不能）。
 */
export function resolveEnrichment(enrichment: PlaceDetailsEnrichment | null): EnrichmentResolution {
  if (enrichment == null || enrichment.fetchStatus !== "ok") return FALLBACK_RESOLUTION;

  const photo = enrichment.photo;
  const mediaUrl = photo?.photoUri ?? null;
  // ★photoUri があり、かつ表示可能な attribution があって初めて「実写真表示可」。どちらか欠ければ abstract。
  const photoDisplayable = mediaUrl != null && mediaUrl.trim().length > 0 && hasUsableAttribution(photo);
  const photoAttributions = photoDisplayable ? photo!.authorAttributions : [];

  const hours = enrichment.hours;
  const hoursConfirmed = hours != null;
  const openState: OpenStateHonest = hours != null ? hours.openState : "unknown";
  const hoursLines = hours != null ? hours.weekdayDescriptions : [];

  return {
    photoDisplayable,
    photoMediaUrl: photoDisplayable ? mediaUrl : null,
    photoAttributions,
    hoursConfirmed,
    openState,
    hoursLines,
    showGoogleAttribution: photoDisplayable || hoursConfirmed,
  };
}

// ───────────────────────── enrichment builders（fail-open/状態・pure・client+server 兼用） ─────────────────────────

function baseEnrichment(placeId: string): Omit<PlaceDetailsEnrichment, "fetchStatus" | "error"> {
  return { placeId, provenance: "google_places", photo: null, hours: null, fetchedAtMs: null };
}

/** flag OFF / API 不在 / budget 超過 時の skipped enrichment（→ 全 fallback）。 */
export function skippedEnrichment(placeId: string): PlaceDetailsEnrichment {
  return { ...baseEnrichment(placeId), fetchStatus: "skipped", error: null };
}

/** in-flight 中の loading enrichment（memo 占有・→ 全 fallback）。 */
export function loadingEnrichment(placeId: string): PlaceDetailsEnrichment {
  return { ...baseEnrichment(placeId), fetchStatus: "loading", error: null };
}

/** fail-open の error enrichment（→ 全 fallback・abstract/未確認）。 */
export function errorEnrichment(placeId: string, kind: EnrichmentError["kind"], message: string): PlaceDetailsEnrichment {
  return { ...baseEnrichment(placeId), fetchStatus: "error", error: { kind, message } };
}

/**
 * ★fetch すべきか（pure・client hook が使う）。active(=UI&fetch flag) かつ placeId あり かつ memo 未保持 の時だけ true。
 *   → browse 中や memo hit では false（無駄 fetch/重複課金を構造的に防止）。
 */
export function shouldFetchEnrichment(placeId: string | null | undefined, alreadyKnown: boolean, active: boolean): boolean {
  return active && typeof placeId === "string" && placeId.length > 0 && !alreadyKnown;
}

// ───────────────────────── 3. field mask 固定 ─────────────────────────

/** ★P4 の Details field mask は この定数から逸脱しない（案B＝Enterprise 課金・+Atmosphere を含まない）。 */
export const PLACE_DETAILS_FIELD_MASK = "id,photos,regularOpeningHours" as const;

/** field mask を配列化（test/ガード用・順序固定）。 */
export const PLACE_DETAILS_FIELD_LIST: readonly string[] = Object.freeze(["id", "photos", "regularOpeningHours"]);

/**
 * ★混入したら課金が跳ねる(+Atmosphere=$25/1000)/規約リスク/別 tier の「禁止フィールド」。
 *   test が PLACE_DETAILS_FIELD_LIST との交差ゼロを保証する。
 */
export const FORBIDDEN_FIELDS: readonly string[] = Object.freeze([
  // Enterprise + Atmosphere（1 つ混入で全 call 最上位 SKU に跳ねる）
  "takeout",
  "delivery",
  "dineIn",
  "reservable",
  "servesCoffee",
  "servesBreakfast",
  "servesLunch",
  "servesDinner",
  "goodForChildren",
  "goodForGroups",
  "restroom",
  "outdoorSeating",
  "reviews",
  // 取得しない上位/別 tier
  "rating",
  "userRatingCount",
  "priceLevel",
  "accessibilityOptions",
  "editorialSummary",
]);

/** field mask が禁止フィールドを含まないか（pure・runtime 防御）。 */
export function isFieldMaskSafe(): boolean {
  const forbidden = new Set(FORBIDDEN_FIELDS);
  return PLACE_DETAILS_FIELD_LIST.every((f) => !forbidden.has(f));
}

// ───────────────────────── 4. fetch policy / session memo（contract のみ） ─────────────────────────

/**
 * ★fetch 方針の契約（実発火は P4-b）。timeout1500ms / retry 0（重複課金回避）/ 永続化しない。
 */
export const ENRICHMENT_FETCH_POLICY = Object.freeze({
  timeoutMs: 1500,
  retries: 0,
  /** ★no persistent cache: session 内 memo のみ。localStorage/DB/Supabase へ書かない。 */
  persist: false as const,
});

/** ★Photo media の maxWidthPx 上限（1〜4800・タイル相当に抑える＝過大取得/帯域抑制）。先頭 1 枚のみ取得。 */
export const PHOTO_MAX_WIDTH_PX = 400;

/** ★session 内重複排除 memo の型（in-memory のみ・永続化しない）。 */
export type EnrichmentSessionMemo = Map<string, PlaceDetailsEnrichment>;

/** memo を 1 つ作る（in-memory・空）。永続層へ一切触れない。 */
export function createEnrichmentMemo(): EnrichmentSessionMemo {
  return new Map<string, PlaceDetailsEnrichment>();
}

// ───────────────────────── 5. flags（UI と fetch を分離・default OFF・production hard block） ─────────────────────────

/**
 * ★production env gate（P4-e）: production で有効化を許す**唯一の明示スイッチ**。
 *   本番 env に `PLACE_DETAILS_ENRICH_PROD_ALLOWED=1` を投入した時だけ true。default（未設定）は false。
 *   ※ env を投入しても **const flag が true でなければ有効化されない**（§envGateOpen と AND 条件＝二重スイッチ）。
 */
export function isProdEnrichAllowed(): boolean {
  return process.env.PLACE_DETAILS_ENRICH_PROD_ALLOWED === "1";
}

/**
 * ★env gate: dev（NODE_ENV≠production）は従来通り常に通過 / production は **env 明示許可時のみ**通過。
 *   `NODE_ENV !== "production"` を直接外さず、専用 env で明示許可した時だけ production 排他を解除する（誤有効化防止）。
 */
export function envGateOpen(): boolean {
  return process.env.NODE_ENV !== "production" || isProdEnrichAllowed();
}

/** ★fetch flag: 実 network 発火を許可するか（P4-b の実 adapter が参照）。default OFF。 */
export const PLACE_DETAILS_ENRICH_FETCH_ENABLED = false;
export function isPlaceDetailsFetchEnabled(): boolean {
  // ★二重スイッチ: const flag=true かつ env gate open（dev or 本番 env 明示）の両方が必要。
  return PLACE_DETAILS_ENRICH_FETCH_ENABLED && envGateOpen();
}

/** ★UI flag: ②③ で enrichment を描画するか（P4-d が参照）。fetch と独立。default OFF。 */
export const PLACE_DETAILS_ENRICH_UI_ENABLED = false;
export function isPlaceDetailsUiEnabled(): boolean {
  // ★二重スイッチ: const flag=true かつ env gate open の両方が必要。
  return PLACE_DETAILS_ENRICH_UI_ENABLED && envGateOpen();
}
