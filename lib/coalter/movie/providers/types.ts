/**
 * CoAlter D-2-e3-a0 Provider-Agnostic Foundation — Public Types
 *
 * PR #109 §2 で凍結された Provider Interface の TypeScript 実装。
 *
 * 設計原則 (D-2-e3-a0 pure foundation phase):
 *   - **provider-agnostic**: 個別 provider (Anthropic / OpenAI / EXA) の SDK / API に依存しない
 *   - **pure 実装**: 実 HTTP / 実 API 接続なし、interface + canonical schema のみ
 *   - **DI 経由**: provider 個別実装 (D-2-e3-a 着手後の別 PR) は本 interface を実装する
 *
 * 凍結線 (PR #109 §1.5 継承):
 *   - 既存 file (movieOrchestrator / webConnector / movieCatalog / 等) touch なし
 *   - Anthropic / OpenAI / EXA SDK import なし
 *   - env / API key 参照なし
 *
 * a1-impl-1e (本 PR) additive 拡張:
 *   - `SourceCandidate` interface 追加 (canonical Citation とは別物、UI 非露出)
 *   - `ProviderRetrievalResult.sourceCandidates?` 追加 (observability / debug 用)
 */

import type { TheaterListing } from "../theaterResolver";

// ═══════════════════════════════════════════════════════════════════════════
// 1. Provider 識別子
// ═══════════════════════════════════════════════════════════════════════════

/**
 * provider 識別子 (3 値固定、将来追加時のみ拡張可)。
 *
 *   - "anthropic": Claude + web search tool (Primary candidate)
 *   - "openai":    gpt-4o + web search (Secondary candidate)
 *   - "exa":       semantic search API (Tertiary candidate)
 */
export type ProviderId = "anthropic" | "openai" | "exa";

// ═══════════════════════════════════════════════════════════════════════════
// 2. Provider Interface (中核)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 映画 retrieval provider interface。
 *
 *   各 provider 実装 (anthropicProvider / openaiProvider / exaProvider) は本 interface
 *   を実装する。adapter は本 interface だけを参照、provider 個別実装に依存しない。
 *
 * 失敗時挙動:
 *   `retrieve()` は失敗時 throw する。fail-open は ProviderSelector 側で握り潰し、
 *   次 provider への切替えを行う (PR #109 §3 参照)。
 */
export interface MovieRetrievalProvider {
  /** provider 識別子 (diagnostics 用) */
  readonly id: ProviderId;

  /**
   * provider が enable されているか (runtime check)。
   *
   *   - Anthropic: master flag `COALTER_THREE_STAGE=true` で true (D-2-e2 既存)
   *   - OpenAI:    `COALTER_THREE_STAGE_OPENAI_ENABLED=true` で true (D-2-e3-a 着手後)
   *   - EXA:       `COALTER_THREE_STAGE_EXA_ENABLED=true` で true (D-2-e3-a 着手後)
   *
   * 本 phase (D-2-e3-a0) では env 読み取りは行わない。
   * provider 個別実装が自身の enable 状態を決定する責務を持つ (DI 経由)。
   */
  readonly enabled: boolean;

  /**
   * theater listing を retrieval する。
   *
   * @param input 検索入力 (title / area / sourceHint / maxResults)
   * @returns theaters + canonical citations + diagnostics
   * @throws 失敗時 (timeout / API error / parse failure 等) → ProviderSelector が次へ
   */
  retrieve(input: ProviderRetrievalInput): Promise<ProviderRetrievalResult>;
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Retrieval Input / Output
// ═══════════════════════════════════════════════════════════════════════════

/** provider への retrieval 入力。 */
export interface ProviderRetrievalInput {
  /** 作品 title (curator 出力 由来) */
  title: string;
  /** ユーザー指定 area (Tier 0 area、areaExpansion 経由で Tier 1 area) */
  area: string;
  /** source hint (公式 URL / distributor、optional)。Anthropic web search の allowed_domains 等で利用候補 */
  sourceHint?: {
    officialUrl?: string | null;
    distributor?: string | null;
  };
  /** retrieval 結果上限 (default 5、provider 側 max_results に渡す候補) */
  maxResults?: number;
}

/** provider response (canonical schema)。 */
export interface ProviderRetrievalResult {
  /** D-2-a 既存型 TheaterListing[] (theaterName / area / showtimes / officialUrl) */
  theaters: readonly TheaterListing[];
  /** canonical citations (§4 で詳述) */
  citations: readonly Citation[];
  /**
   * search 候補 URL (a1-impl-1e、§6 で詳述、observability / debug 用)。
   *
   *   **canonical Citation とは別物**、UI に「出典」として表示してはならない (LLM が actually cite
   *   していない URL を含むため)。詳細は `SourceCandidate` 型 docblock 参照。
   *
   *   provider が source candidate を支援しない場合 (e.g. EXA、将来) は undefined。
   */
  sourceCandidates?: readonly SourceCandidate[];
  /** どの provider が処理したか (diagnostics) */
  providerId: ProviderId;
  /** retrieval latency (ms) */
  latencyMs: number;
  /** provider raw diagnostics (observability、optional) */
  rawDiagnostics?: ProviderRawDiagnostics;
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Citation Canonical Schema
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Citation canonical schema (Anthropic 仕様を base に採用、PR #109 §5)。
 *
 *   provider 別 raw response (Anthropic citations / OpenAI url_citation / EXA results) は
 *   `citationNormalizer.ts` で本型に変換される。UI は本型のみ参照、
 *   provider 切替えで UI 揺れなし。
 *
 * UI 設計上の重要要件 (PR #109 §3.6 / §9.3):
 *   - `url` は必須 (UI 「公式 site で確認」link、Anthropic / OpenAI 両 provider で attribution 必須)
 *   - `title` は link text として使用
 *   - `citedText` は tooltip / preview 用 (optional)
 */
export interface Citation {
  /** 出典 URL (必須、UI 表示用) */
  url: string;
  /** 出典 title (必須、UI link text 用) */
  title: string;
  /** 引用テキスト snippet (optional、150 char 程度) */
  citedText?: string;
  /** source location hint (optional、provider 別 location 情報、character index range 等) */
  sourceLocationHint?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. Provider Raw Diagnostics (observability 用)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * provider raw diagnostics (PR #109 §2.2)。
 *
 *   provider 個別実装が cost / token / call count を測定して埋める optional field。
 *   adapter 側で Discover / Sentry に流す観測値として使用 (D-2-e3-a 着手後)。
 */
export interface ProviderRawDiagnostics {
  /** input token (LLM provider のみ、EXA は undefined) */
  tokenInput?: number;
  /** output token (同上) */
  tokenOutput?: number;
  /**
   * cache creation input tokens (a1-impl-1f 追加、Anthropic `usage.cache_creation_input_tokens`)。
   *
   *   5m / 1h tier の合計値。tier 別 breakdown は本 field では露出しない (provider 内 cost 計算で使用)。
   *   cache 機能未使用時は undefined (Anthropic API が null を返す場合に相当)。
   */
  tokenCacheCreate?: number;
  /**
   * cache read input tokens (a1-impl-1f 追加、Anthropic `usage.cache_read_input_tokens`)。
   *
   *   cache hit 時の読み出し token 数。通常 input より遥かに安価 ($0.50/MTok @ Opus 4.7 想定)。
   *   cache hit なしの場合は undefined / 0。
   */
  tokenCacheRead?: number;
  /** search call 回数 (Anthropic max_uses 等で複数 search が走った場合) */
  searchCallCount?: number;
  /** 推定 cost (USD cents、observability 用) */
  costEstimateCents?: number;
  /**
   * inference geographic region (a1-impl-1g 追加、Anthropic `usage.inference_geo`)。
   *
   *   provider が処理した推論の地理 region を示す opaque 文字列。SDK は string | null を返し、
   *   value semantics (例: "us" / "eu" / "global" 等) は SDK / Anthropic 公式 doc で明示されていないため、
   *   本 field は **observability only** として保持し、cost への自動反映は **default では行わない**。
   *
   *   将来 Anthropic 公式 doc で region 別 multiplier (例: US-only 1.1x) の semantic が確定した場合、
   *   provider 個別実装側で pricing snapshot 内の hook (例: `geoMultipliers`) 経由で反映可能。
   *
   *   null / 空文字 / whitespace のみ → 本 field は未設定 (no info としての扱い、backward compat)。
   */
  inferenceGeo?: string;
  /**
   * web search tool error 件数 (a1-impl-1i 追加、observability only)。
   *
   *   provider の web search tool 実行時に返された error block (Anthropic では
   *   `WebSearchToolResultBlock.content` が `WebSearchToolResultError` 型) の累計件数。
   *   1 message 内で複数 error が起きた場合は合計値。
   *
   *   **observability only**: 本 field を観測した時点で provider は **action しない**
   *   (reject / retry / fallback / ProviderSelector 切替なし)。dashboard / debug 用。
   *
   *   web search 未使用 / 全 success の場合は undefined (no error)。
   */
  webSearchErrorCount?: number;
  /**
   * web search tool 最後に観測された error code (a1-impl-1i 追加、observability only)。
   *
   *   1 message 内で最後に発生した error の `error_code` (provider 別 opaque string)。
   *   Anthropic provider の場合は `WebSearchToolResultErrorCode` enum:
   *   `invalid_tool_input` / `unavailable` / `max_uses_exceeded` / `too_many_requests` /
   *   `query_too_long` / `request_too_large`。
   *
   *   **observability only**: 値の解釈や retry 判定は caller (a3 wiring 等) の責務、
   *   本 provider 内では action しない。
   *
   *   error 未発生 / `error_code` 非 string → undefined。
   */
  webSearchLastErrorCode?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. Source Candidate Schema (a1-impl-1e additive、canonical Citation と完全分離)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Source candidate (検索候補) — **canonical `Citation` とは別物の semantic layer**。
 *
 *   provider の web search tool が返した raw search result URL を、**LLM が text で actually
 *   引用したか否かに関わらず** 観測用に保持する。
 *
 *   ⚠️ **UI に「出典」として表示してはならない**:
 *     LLM が cite していない URL を含むため、canonical Citation (text-cited only) と混ぜると
 *     user trust を毀損する可能性がある。UI 「公式 site で確認」link は `Citation[]` のみを使う。
 *
 *   主用途 (observability layer):
 *     - **recall 評価**: 検索結果数 vs 実引用数の比較
 *     - **debug**: 「LLM はなぜ X URL を cite しなかったか」分析
 *     - **将来の anti-hallucination guard**: citation の URL が searchedUrls 集合に含まれない場合は
 *       suspicious と判定する signal source (本 PR では実装しない)
 *     - **将来の citation confidence scoring**: searched ∧ cited なら confidence boost
 *
 *   provider 別 mapping (実装時):
 *     - **Anthropic**: `WebSearchToolResultBlock` 内 `WebSearchResultBlock[]` (本 PR a1-impl-1e で対応)
 *     - **OpenAI**: 将来 (search returned URLs that didn't become `url_citation` annotations)
 *     - **EXA**: 将来 (returned results without highlights being cited in answer)
 *
 *   設計上の不変条件:
 *     - `Citation[]` (canonical) と `SourceCandidate[]` (raw) は **strict にレイヤー分離**
 *     - 同一 URL が両 layer に存在することは許される (LLM が cite した && 検索結果に存在した、自然な状態)
 *     - canonical citation に raw search result を「補完」混入してはならない
 */
export interface SourceCandidate {
  /** 候補 URL (canonical Citation の url とは独立、UI 表示禁止) */
  url: string;
  /**
   * 候補 title (null 許容、provider 別)。
   *
   *   Anthropic SDK の WebSearchResultBlock.title は non-null だが、provider-agnostic schema
   *   としては null 許容で定義 (将来の OpenAI / EXA で null を返す可能性あり)。
   */
  title: string | null;
  /** ページ年齢 hint (Anthropic `page_age` 等、optional) */
  pageAge?: string | null;
  /**
   * provider source identifier (e.g. "web_search_20250305"、optional)。
   *
   *   provider 内 sub-tool の識別用 (同一 provider でも複数 search tool バージョンを混在
   *   利用する将来運用に備える)。
   */
  providerSource?: string | null;
  /**
   * server_tool_use の `tool_use_id` (Anthropic 限定、optional)。
   *
   *   同一 message 内で複数 search が走った場合に、どの search invocation の result かを
   *   trace する。debug / 将来の query 単位観測 (本 PR では query 自体は保存しない、
   *   user 文脈含有の可能性) に使用。
   */
  toolUseId?: string | null;
}
