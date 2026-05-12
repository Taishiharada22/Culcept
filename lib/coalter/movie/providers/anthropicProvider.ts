/**
 * CoAlter D-2-e3-a1a Provider Foundation — Anthropic Provider (mock-only scaffold)
 *
 * PR #111 (D-2-e3-a1 real provider connection design review) で凍結された設計を
 * **mock-only scaffold** として実装した最小 wrapper。
 *
 * 設計原則 (D-2-e3-a1a phase):
 *   - **Anthropic SDK type import OK** (`@anthropic-ai/sdk` v0.91.1 既存)
 *   - **実 API call は mock のみ** (本 file 自身は実 HTTP fetch を持たない)
 *   - **ANTHROPIC_API_KEY 参照なし** (API key は caller が `Anthropic` client 作成時に注入する DI)
 *   - **process.env 参照なし** (env 経由は a2 で別 phase で導入)
 *   - **movieOrchestrator wiring なし** (a3 で別 phase)
 *   - **Production deploy 前必須**: Anthropic Console (/settings/privacy) で web search admin enable (a1-impl-1b 以降)
 *
 * D-2-e3-a1a scope:
 *   - Anthropic tool args builder (`buildWebSearchTool`)
 *   - Anthropic prompt builder (`buildPrompt`)
 *   - Anthropic response parser (`parseResponse` + `extractCitations` + `extractDiagnostics`)
 *   - Anthropic citation → canonical `Citation` 変換 (`normalizeAnthropicCitations` 既存利用)
 *   - `ProviderRetrievalResult` への変換
 *   - `MovieRetrievalProvider` interface 実装 (D-2-e1 pure foundation 整合)
 *
 * scaffold 限定:
 *   - `extractTheaters` は **空配列返却** (structured theater extraction は a1-impl-1b 以降で実装予定)
 *   - `BudgetUsageProvider` 実装は別 file (本 phase scope 外)
 *   - 実 client 生成 (`new Anthropic({apiKey: ...})`) は caller (a3 wiring) で行う
 *
 * 凍結線 (PR #111 §1.3 / §3.7.2 継承):
 *   - 既存 file (movieOrchestrator / flags / 等) touch なし
 *   - 既存 lib/coalter/movie/providers/ 配下の他 file touch なし
 *   - Alter Morning 系 file touch なし
 */

import Anthropic from "@anthropic-ai/sdk";
import type { TheaterListing } from "../theaterResolver";
import {
  normalizeAnthropicCitations,
  type AnthropicRawCitation,
} from "./citationNormalizer";
import {
  safeProviderCall,
  type BudgetUsageProvider,
  type SafeProviderCallOptions,
} from "./safeProviderCall";
import type {
  Citation,
  MovieRetrievalProvider,
  ProviderRawDiagnostics,
  ProviderRetrievalInput,
  ProviderRetrievalResult,
} from "./types";

// ═══════════════════════════════════════════════════════════════════════════
// 1. Defaults (PR #111 § で凍結された値)
// ═══════════════════════════════════════════════════════════════════════════

/** Anthropic provider 既定値。caller が options で override 可。 */
export const ANTHROPIC_DEFAULTS = {
  /** default model (PR #111 §2.1.2、Claude Opus 4.7) */
  MODEL: "claude-opus-4-7",
  /** max_tokens (retrieval response 上限、PR #109 §6.1 で curator 別 + retrieval 別) */
  MAX_OUTPUT_TOKENS: 2500,
  /** web search tool max_uses per request (PR #111 §2.1.2) */
  MAX_USES: 5,
  /** safeProviderCall timeout (PR #109 §3.4 / §4.3) */
  TIMEOUT_MS: 10_000,
  /** safeProviderCall retry (5xx 想定、PR #109 §4.4) */
  MAX_RETRIES: 1,
  /** retry backoff base ms (PR #109 §4.4 exponential、attempt 0 で 1s、attempt 1 で 2s) */
  RETRY_BACKOFF_MS: 1_000,
  /** monthly budget cap (PR #109 §6.1 / §3.4) */
  BUDGET_CHECK_USD: 500,
  /** web_search tool type literal (PR #111 §2.1.2 / Anthropic docs) */
  WEB_SEARCH_TOOL_TYPE: "web_search_20250305",
  /** user_location 既定 country (Japan、PR #109 §3 area 想定) */
  DEFAULT_COUNTRY: "JP",
  /** user_location 既定 timezone */
  DEFAULT_TIMEZONE: "Asia/Tokyo",
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// 2. Public Types — Options
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Anthropic provider 設定 (DI 経由で caller から注入)。
 *
 *   `client` は caller (a3 wiring) が `new Anthropic({ apiKey: ... })` で生成し渡す。
 *   本 phase では実 API key 参照を行わず、provider 自身は client を opaque に扱う。
 */
export interface AnthropicProviderOptions {
  /** Anthropic SDK client (DI、本 phase では mock 想定) */
  client: Anthropic;
  /** runtime enable boolean (caller が env / 設定から決定) */
  enabled: boolean;
  /** budget usage provider (optional、month USD 累計取得用、`safeProviderCall` で利用) */
  budgetUsage?: BudgetUsageProvider;
  /** timeout (default `ANTHROPIC_DEFAULTS.TIMEOUT_MS`) */
  timeoutMs?: number;
  /** retry count for 5xx-like error (default `ANTHROPIC_DEFAULTS.MAX_RETRIES`) */
  maxRetries?: number;
  /** retry backoff base ms (default `ANTHROPIC_DEFAULTS.RETRY_BACKOFF_MS`) */
  retryBackoffMs?: number;
  /** monthly budget cap USD (default `ANTHROPIC_DEFAULTS.BUDGET_CHECK_USD`) */
  budgetCheckUsd?: number;
  /** model (default `ANTHROPIC_DEFAULTS.MODEL`) */
  model?: string;
  /** web search tool max uses per request (default `ANTHROPIC_DEFAULTS.MAX_USES`) */
  maxUses?: number;
  /** allowed domain allowlist (`blockedDomains` と排他、Anthropic SDK 仕様) */
  allowedDomains?: readonly string[];
  /** blocked domain blacklist (`allowedDomains` と排他、Anthropic SDK 仕様) */
  blockedDomains?: readonly string[];
  /** user_location 推定関数 (default は area name + JP/Asia/Tokyo) */
  deriveUserLocation?: (area: string) => Anthropic.Messages.UserLocation | undefined;
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Public API — AnthropicMovieRetrievalProvider
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Anthropic Claude + web search tool を経由した映画 retrieval provider。
 *
 *   `MovieRetrievalProvider` interface (D-2-e1 / PR #110 で凍結) を実装。
 *
 *   D-2-e3-a1a scope:
 *     - `retrieve()` は `safeProviderCall` 経由で client.messages.create を呼ぶ
 *     - 失敗時は throw、`ProviderSelector` が次 candidate へ自動切替え (fail-open、PR #110 §3)
 *     - citation は canonical schema に normalize (`Citation[]`)
 *     - **`extractTheaters` は scaffold で空配列**、structured theater 抽出は a1-impl-1b で改善
 */
export class AnthropicMovieRetrievalProvider implements MovieRetrievalProvider {
  readonly id = "anthropic" as const;
  readonly enabled: boolean;

  constructor(private readonly options: AnthropicProviderOptions) {
    this.enabled = options.enabled;
  }

  // ─── public entry ──────────────────────────────────────────────────

  async retrieve(input: ProviderRetrievalInput): Promise<ProviderRetrievalResult> {
    const startedAt = Date.now();
    return safeProviderCall(
      () => this.executeRetrieve(input, startedAt),
      this.buildSafeCallOptions(),
      this.options.budgetUsage,
    );
  }

  // ─── public testable builders ──────────────────────────────────────

  /**
   * web_search tool 引数を build (Anthropic SDK type 完全準拠)。
   *
   *   - `allowed_domains` と `blocked_domains` は同時使用不可 (Anthropic SDK 仕様)。
   *     `allowedDomains` 設定があれば `blockedDomains` は無視される (allowed 優先)。
   *   - `user_location` は `deriveUserLocation` 経由で導出、default は area name + JP/Asia/Tokyo。
   */
  buildWebSearchTool(
    input: ProviderRetrievalInput,
  ): Anthropic.Messages.WebSearchTool20250305 {
    const tool: Anthropic.Messages.WebSearchTool20250305 = {
      type: ANTHROPIC_DEFAULTS.WEB_SEARCH_TOOL_TYPE,
      name: "web_search",
      max_uses: this.options.maxUses ?? ANTHROPIC_DEFAULTS.MAX_USES,
    };
    if (this.options.allowedDomains && this.options.allowedDomains.length > 0) {
      tool.allowed_domains = [...this.options.allowedDomains];
    } else if (
      this.options.blockedDomains &&
      this.options.blockedDomains.length > 0
    ) {
      tool.blocked_domains = [...this.options.blockedDomains];
    }
    const userLocation = this.deriveUserLocation(input.area);
    if (userLocation !== undefined) {
      tool.user_location = userLocation;
    }
    return tool;
  }

  /**
   * 映画館検索の prompt を build (pure、決定論)。
   *
   *   - 「{title} を {area} 近辺で上映している映画館」を主旨
   *   - sourceHint (公式 URL / 配給) があれば参考情報として embed
   *   - 出力フォーマット (theater / area / showtime / officialUrl)、最大件数、citation 指示を含む
   */
  buildPrompt(input: ProviderRetrievalInput): string {
    const lines: string[] = [
      `「${input.title}」を ${input.area} 近辺で上映している映画館を探してください。`,
    ];
    const hint = this.buildSourceHintText(input.sourceHint);
    if (hint) lines.push(hint);
    lines.push("回答は以下を含めてください：");
    lines.push("- 映画館名 (theater)");
    lines.push("- 上映エリア (area)");
    lines.push("- 上映時刻 (showtime) — 取得できれば");
    lines.push("- 公式 URL (officialUrl) — 取得できれば");
    lines.push(`最大 ${input.maxResults ?? 5} 件まで。`);
    lines.push("信頼できる出典 URL を citations として付けてください。");
    return lines.join("\n");
  }

  /**
   * Anthropic Message を `ProviderRetrievalResult` に変換 (pure、SDK type 準拠)。
   *
   *   - `theaters`: scaffold では空配列 (a1-impl-1b 以降で structured extractor 追加)
   *   - `citations`: text block 内 `citations[]` から `CitationsWebSearchResultLocation` を抽出し canonical へ
   *   - `rawDiagnostics`: `usage` から token / search call count を抽出
   */
  parseResponse(
    rawMessage: Anthropic.Messages.Message,
    latencyMs: number,
  ): ProviderRetrievalResult {
    return {
      theaters: this.extractTheaters(rawMessage),
      citations: this.extractCitations(rawMessage),
      providerId: this.id,
      latencyMs,
      rawDiagnostics: this.extractDiagnostics(rawMessage),
    };
  }

  // ─── private helpers ───────────────────────────────────────────────

  private buildSafeCallOptions(): SafeProviderCallOptions {
    return {
      timeoutMs: this.options.timeoutMs ?? ANTHROPIC_DEFAULTS.TIMEOUT_MS,
      maxRetries: this.options.maxRetries ?? ANTHROPIC_DEFAULTS.MAX_RETRIES,
      retryBackoffMs:
        this.options.retryBackoffMs ?? ANTHROPIC_DEFAULTS.RETRY_BACKOFF_MS,
      budgetCheckUsd:
        this.options.budgetCheckUsd ?? ANTHROPIC_DEFAULTS.BUDGET_CHECK_USD,
    };
  }

  private async executeRetrieve(
    input: ProviderRetrievalInput,
    startedAt: number,
  ): Promise<ProviderRetrievalResult> {
    const tool = this.buildWebSearchTool(input);
    const prompt = this.buildPrompt(input);
    const message = await this.options.client.messages.create({
      model: this.options.model ?? ANTHROPIC_DEFAULTS.MODEL,
      max_tokens: ANTHROPIC_DEFAULTS.MAX_OUTPUT_TOKENS,
      messages: [{ role: "user", content: prompt }],
      tools: [tool],
    });
    return this.parseResponse(message, Date.now() - startedAt);
  }

  private buildSourceHintText(
    hint: ProviderRetrievalInput["sourceHint"],
  ): string {
    if (!hint) return "";
    const parts: string[] = [];
    if (hint.officialUrl) parts.push(`公式 URL: ${hint.officialUrl}`);
    if (hint.distributor) parts.push(`配給: ${hint.distributor}`);
    if (parts.length === 0) return "";
    return `参考情報: ${parts.join(" / ")}`;
  }

  private deriveUserLocation(
    area: string,
  ): Anthropic.Messages.UserLocation | undefined {
    if (this.options.deriveUserLocation) {
      return this.options.deriveUserLocation(area);
    }
    if (!area || area.trim().length === 0) return undefined;
    return {
      type: "approximate",
      city: area,
      country: ANTHROPIC_DEFAULTS.DEFAULT_COUNTRY,
      timezone: ANTHROPIC_DEFAULTS.DEFAULT_TIMEZONE,
    };
  }

  /**
   * scaffold: theater 構造化抽出は a1-impl-1b 以降で実装予定 (LLM text response からの抽出)。
   * 本 phase は空配列を返し、retrieve 全体の flow / citation 抽出を verify する。
   */
  private extractTheaters(
    _message: Anthropic.Messages.Message,
  ): readonly TheaterListing[] {
    return [];
  }

  /**
   * Anthropic Message 内の text block の `citations[]` から
   * `web_search_result_location` のみを抽出して canonical `Citation[]` へ変換。
   *
   *   - text block 以外の content block (server_tool_use / web_search_tool_result 等) は skip
   *   - citation type が `web_search_result_location` 以外 (PDF/text 等) も skip
   *   - title が null の場合は url を fallback として title に使用
   */
  private extractCitations(
    message: Anthropic.Messages.Message,
  ): readonly Citation[] {
    const raws: AnthropicRawCitation[] = [];
    const contentBlocks = Array.isArray(message.content) ? message.content : [];
    for (const block of contentBlocks) {
      if (block.type !== "text") continue;
      const textBlock = block as Anthropic.Messages.TextBlock;
      const citations = textBlock.citations;
      if (!Array.isArray(citations)) continue;
      for (const cite of citations) {
        if (cite.type !== "web_search_result_location") continue;
        raws.push({
          url: cite.url,
          title: cite.title ?? cite.url,
          cited_text: cite.cited_text,
          encrypted_index: cite.encrypted_index,
        });
      }
    }
    return normalizeAnthropicCitations(raws);
  }

  /**
   * Anthropic Message の `usage` から observability 用 diagnostics を抽出。
   *
   *   - tokenInput / tokenOutput / searchCallCount (server_tool_use.web_search_requests)
   *   - cost 推定は本 phase 範囲外 (a1-impl-1b で `costEstimateCents` 計算追加予定)
   */
  private extractDiagnostics(
    message: Anthropic.Messages.Message,
  ): ProviderRawDiagnostics | undefined {
    const usage = message.usage;
    if (!usage) return undefined;
    const diagnostics: ProviderRawDiagnostics = {};
    if (typeof usage.input_tokens === "number") {
      diagnostics.tokenInput = usage.input_tokens;
    }
    if (typeof usage.output_tokens === "number") {
      diagnostics.tokenOutput = usage.output_tokens;
    }
    const serverToolUse = usage.server_tool_use;
    if (
      serverToolUse &&
      typeof serverToolUse.web_search_requests === "number"
    ) {
      diagnostics.searchCallCount = serverToolUse.web_search_requests;
    }
    return Object.keys(diagnostics).length > 0 ? diagnostics : undefined;
  }
}
