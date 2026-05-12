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
  /** search call 回数 (Anthropic max_uses 等で複数 search が走った場合) */
  searchCallCount?: number;
  /** 推定 cost (USD cents、observability 用) */
  costEstimateCents?: number;
}
