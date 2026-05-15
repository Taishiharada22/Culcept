/**
 * CoAlter D-2-e3-a1i Provider Foundation — Anthropic Provider (WebSearch error observability)
 *
 * a1-impl-1a (PR #112) → 1b (PR #113) → 1d (PR #114) → 1e (PR #115) → 1f (PR #116) → 1g (PR #117) → 1h (PR #118) → 本 phase。
 *
 * 本 phase (a1-impl-1i) は **WebSearch tool error 観測** を provider 単体内 observability layer として追加:
 *   - Anthropic `WebSearchToolResultBlock.content` が `WebSearchToolResultError` 型 (web_search_tool_result_error)
 *     の場合に件数 + 最後の `error_code` を `ProviderRawDiagnostics` に記録
 *   - `ProviderRawDiagnostics.webSearchErrorCount?` / `webSearchLastErrorCode?` を additive 追加
 *   - **observability only** — provider は **action しない**:
 *     - reject / retry / fallback / ProviderSelector 切替: なし
 *     - sourceCandidates / canonical citations / extractTheaters の挙動変更: なし
 *     - UI 表示判定: なし (caller dashboard 用)
 *   - error がない既存 response → 既存挙動完全不変 (test 担保)
 *
 * SDK 事前確認 (`@anthropic-ai/sdk` v0.91.1):
 *   - `WebSearchToolResultBlockContent = WebSearchToolResultError | Array<WebSearchResultBlock>`
 *   - `WebSearchToolResultError { error_code: WebSearchToolResultErrorCode; type: 'web_search_tool_result_error' }`
 *   - `WebSearchToolResultErrorCode = 'invalid_tool_input' | 'unavailable' | 'max_uses_exceeded' |
 *      'too_many_requests' | 'query_too_long' | 'request_too_large'` (6 値)
 *
 * 設計原則 (D-2-e3-a1i phase):
 *   - **types.ts additive 変更 OK** (`webSearchErrorCount?` / `webSearchLastErrorCode?` 追加、CEO 承認)
 *   - **観測のみ、action なし** (Anti-Hallucination Guard / suspicious citation reject / filter とは別)
 *   - **`extractSourceCandidates` (PR #115) の skip 挙動は完全不変** (本 phase で touch なし)
 *   - **`extractCitations` / `extractTheaters` の挙動完全不変**
 *   - **Anthropic SDK type import OK** (`@anthropic-ai/sdk` v0.91.1 既存)
 *   - **実 API call は mock のみ**
 *   - **ANTHROPIC_API_KEY 参照なし**、**process.env 参照なし**
 *   - **movieOrchestrator / flags / ProviderSelector / safeProviderCall / citationNormalizer / theaterResolver touch なし**
 *   - **`BudgetUsageProvider` 実装なし**、**Anti-Hallucination Guard 実装なし**
 *   - **Provider Capability Registry 実装なし**
 *   - **OpenAI / EXA scaffold なし**
 *
 * 既存挙動の継承 (touch なし):
 *   - extractTheaters (PR #113) / extractCitations (PR #112) / extractSourceCandidates (PR #115)
 *   - cache-aware cost estimate (PR #116) / inference_geo observability + opt-in geoMultipliers hook (PR #117)
 *   - multi-model pricing snapshot (PR #118)
 *
 * 凍結線 (PR #111 §1.3 継承):
 *   - 既存 file (movieOrchestrator / flags / ProviderSelector / 等) touch なし
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
  SourceCandidate,
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
// 1.5 Pricing Snapshot (a1-impl-1d 追加、cost estimate 用)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Anthropic pricing snapshot (cost ESTIMATION 用、observability only)。
 *
 *   **重要**: これは observability 用の estimated value であり、**billing source of truth ではない**。
 *   Anthropic 公式 invoice (Console / API billing) が authoritative。
 *
 *   設計上の choice:
 *     - **date-stamped snapshot**: `snapshotDate` field で「いつ時点の pricing か」を traceable に
 *     - **override 可能**: `AnthropicProviderOptions.pricing` で caller が任意 snapshot を注入可能
 *     - **integer micro-cents 内部 unit**: 1 cent = 10,000 μ¢ (= 1/1,000,000 dollar)。
 *       float drift を回避し、test 上の数値比較が決定論的になる。
 *     - **rounding policy**: 出力は `microCents / 10000` で cents 化 (fractional cents 許容)。
 *       caller が integer cents 必要なら別途 `Math.round` 適用 (本 provider は丸めない)。
 *
 *   model entry 不在時:
 *     `models[model]` が undefined の場合、`computeCostEstimateCents` は undefined を返し、
 *     `costEstimateCents` 自体が diagnostics に含まれない (silent skip)。
 */
export interface AnthropicPricingSnapshot {
  /** snapshot 取得日 (YYYY-MM-DD、traceability) */
  readonly snapshotDate: string;
  /** 公開 pricing 出典 URL */
  readonly source: string;
  /** per-model token pricing (micro-cents per token、a1-impl-1f で cache 系拡張) */
  readonly models: Readonly<
    Record<
      string,
      {
        /** input token あたり micro-cents (1 cent = 10000 μ¢、a1-impl-1f から fractional 許容) */
        readonly inputMicroCentsPerToken: number;
        /** output token あたり micro-cents */
        readonly outputMicroCentsPerToken: number;
        /**
         * cache creation (5m TTL) input token あたり micro-cents (a1-impl-1f 追加、default tier)。
         *
         *   Anthropic 公式 pricing @ Opus 4.7: $6.25 / MTok = 6.25 μ¢/token (fractional)。
         *   未設定 (undefined) の場合は cache 5m write 0 cost として扱う (graceful)。
         */
        readonly cacheCreate5mMicroCentsPerToken?: number;
        /**
         * cache creation (1h TTL) input token あたり micro-cents (a1-impl-1f 追加)。
         *
         *   Anthropic 公式 pricing @ Opus 4.7: $10 / MTok = 10 μ¢/token。
         *   未設定 (undefined) の場合は cache 1h write 0 cost として扱う。
         */
        readonly cacheCreate1hMicroCentsPerToken?: number;
        /**
         * cache read input token あたり micro-cents (a1-impl-1f 追加)。
         *
         *   Anthropic 公式 pricing @ Opus 4.7: $0.50 / MTok = 0.5 μ¢/token (fractional)。
         *   未設定の場合は cache hit 0 cost (graceful)。
         */
        readonly cacheReadMicroCentsPerToken?: number;
      }
    >
  >;
  /** web_search tool 1 request あたり micro-cents (PR #111 §2.1.2 想定) */
  readonly webSearchMicroCentsPerRequest: number;
  /**
   * inference geo region 別 multiplier (a1-impl-1g 追加、optional hook)。
   *
   *   `usage.inference_geo` の値 (e.g. "us" / "eu" / "global") を key とする token-based cost への
   *   乗数 mapping。**default `ANTHROPIC_PRICING_2026_05_12` では未設定**、適用なし。
   *
   *   caller (a3 wiring 等) が Anthropic 公式 region 別 multiplier の semantic 確定後に custom
   *   snapshot で injection する想定。例:
   *     `{ geoMultipliers: { us: 1.1 } }` → inference_geo="us" の case で token base * 1.1
   *
   *   適用 scope (本 provider 実装):
   *     - **token-based costs (input / output / cache_5m / cache_1h / cache_read) に適用**
   *     - **web search は per-request 固定なので multiplier 非適用**
   *
   *   未一致 (inference_geo が `geoMultipliers` に entry なし) / null / 空文字 / whitespace → multiplier 1.0 (no change)
   */
  readonly geoMultipliers?: Readonly<Record<string, number>>;
}

/**
 * Anthropic pricing as of 2026-05-12 (CEO 補正反映、a1-impl-1f で cache 系追加、a1-impl-1g で geoMultipliers hook 追加、
 * a1-impl-1h で multi-model 拡張)。
 *
 *   Source: https://platform.claude.com/docs/en/about-claude/pricing
 *
 *   **Opus tier** (Claude Opus 4.7 / 4.6 / 4.5、全て同一料金):
 *     - input:                $5    / MTok → 5    μ¢ / token
 *     - output:               $25   / MTok → 25   μ¢ / token
 *     - cache create 5m TTL:  $6.25 / MTok → 6.25 μ¢ / token (default tier)
 *     - cache create 1h TTL:  $10   / MTok → 10   μ¢ / token
 *     - cache read:           $0.50 / MTok → 0.5  μ¢ / token
 *
 *   **Sonnet tier** (Claude Sonnet 4.6 / 4.5、全て同一料金、Opus の約 60%):
 *     - input:                $3    / MTok → 3    μ¢ / token
 *     - output:               $15   / MTok → 15   μ¢ / token
 *     - cache create 5m TTL:  $3.75 / MTok → 3.75 μ¢ / token
 *     - cache create 1h TTL:  $6    / MTok → 6    μ¢ / token
 *     - cache read:           $0.30 / MTok → 0.3  μ¢ / token
 *
 *   **Haiku tier** (Claude Haiku 4.5、Opus の約 20%):
 *     - input:                $1    / MTok → 1    μ¢ / token
 *     - output:               $5    / MTok → 5    μ¢ / token
 *     - cache create 5m TTL:  $1.25 / MTok → 1.25 μ¢ / token
 *     - cache create 1h TTL:  $2    / MTok → 2    μ¢ / token
 *     - cache read:           $0.10 / MTok → 0.1  μ¢ / token
 *
 *   **Web search tool**:
 *     - $10 / 1,000 searches → 1¢ / search → 10,000 μ¢ / request
 *
 *   **scope 外 (本 snapshot に未反映)**:
 *     - Opus 4.7 の新 tokenizer (公式 doc: up to 35% more tokens for same fixed text) → token count 変動
 *       の影響であり、token あたり単価は本 snapshot で同値
 *     - Opus 4 / 4.1 / Opus 3 等 older models ($15/$75 base、3x higher) → 必要なら caller が
 *       custom snapshot で injection
 *     - Sonnet 3.7 / Sonnet 3 / Haiku 3.5 / Haiku 3 等 older models → 同上
 *     - Batch API 50% discount → caller 側で適用
 *     - Fast mode 6x premium → caller 側で適用
 *     - `inference_geo: "us"` 1.1x multiplier (Opus 4.6+ / Sonnet 4.6+ / Haiku 4.5+) → a1-impl-1g の
 *       `geoMultipliers` hook で opt-in (default snapshot で未設定)
 *
 *   **inference_geo multiplier** (a1-impl-1g):
 *     - **default 未設定**: `geoMultipliers` を本 snapshot で定義しない。
 *     - 理由: 公式 doc では US-only 1.1x multiplier 記載あり (Opus 4.6+ 以降) だが、本 snapshot は
 *       default standard / global routing 前提を維持し、caller が必要時に明示的 opt-in する設計
 *     - 将来 default で multipliers を反映する場合は新 date-stamped snapshot で定義する運用。
 *
 *   注: 本 constant は date-stamped snapshot、Anthropic 公式 pricing 変動時は新 snapshot を追加し、
 *   caller (a3 wiring) が `AnthropicProviderOptions.pricing` で切替える運用。
 */
export const ANTHROPIC_PRICING_2026_05_12: AnthropicPricingSnapshot = {
  snapshotDate: "2026-05-12",
  source: "https://platform.claude.com/docs/en/about-claude/pricing",
  models: {
    // Opus tier (4.7 / 4.6 / 4.5 共通)
    "claude-opus-4-7": {
      inputMicroCentsPerToken: 5,
      outputMicroCentsPerToken: 25,
      cacheCreate5mMicroCentsPerToken: 6.25,
      cacheCreate1hMicroCentsPerToken: 10,
      cacheReadMicroCentsPerToken: 0.5,
    },
    "claude-opus-4-6": {
      inputMicroCentsPerToken: 5,
      outputMicroCentsPerToken: 25,
      cacheCreate5mMicroCentsPerToken: 6.25,
      cacheCreate1hMicroCentsPerToken: 10,
      cacheReadMicroCentsPerToken: 0.5,
    },
    "claude-opus-4-5": {
      inputMicroCentsPerToken: 5,
      outputMicroCentsPerToken: 25,
      cacheCreate5mMicroCentsPerToken: 6.25,
      cacheCreate1hMicroCentsPerToken: 10,
      cacheReadMicroCentsPerToken: 0.5,
    },
    // Sonnet tier (4.6 / 4.5 共通)
    "claude-sonnet-4-6": {
      inputMicroCentsPerToken: 3,
      outputMicroCentsPerToken: 15,
      cacheCreate5mMicroCentsPerToken: 3.75,
      cacheCreate1hMicroCentsPerToken: 6,
      cacheReadMicroCentsPerToken: 0.3,
    },
    "claude-sonnet-4-5": {
      inputMicroCentsPerToken: 3,
      outputMicroCentsPerToken: 15,
      cacheCreate5mMicroCentsPerToken: 3.75,
      cacheCreate1hMicroCentsPerToken: 6,
      cacheReadMicroCentsPerToken: 0.3,
    },
    // Haiku tier (4.5)
    "claude-haiku-4-5": {
      inputMicroCentsPerToken: 1,
      outputMicroCentsPerToken: 5,
      cacheCreate5mMicroCentsPerToken: 1.25,
      cacheCreate1hMicroCentsPerToken: 2,
      cacheReadMicroCentsPerToken: 0.1,
    },
  },
  webSearchMicroCentsPerRequest: 10_000,
  // geoMultipliers は意図的に未設定 (a1-impl-1g: 公式 semantic 確定済だが、default standard routing 前提を維持)
};

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
  /**
   * pricing snapshot override (default `ANTHROPIC_PRICING_2026_05_12`、a1-impl-1d 追加)。
   *
   *   - cost estimate 計算用 (observability、billing source of truth ではない)
   *   - caller (a3 wiring 等) は将来 Anthropic pricing 変動時に新 snapshot を注入する責務
   */
  pricing?: AnthropicPricingSnapshot;
  /**
   * cache creation tier hint (a1-impl-1f 追加、default `"5m"`)。
   *
   *   **使用条件**: Anthropic API response の `usage.cache_creation` (`ephemeral_5m_input_tokens` /
   *   `ephemeral_1h_input_tokens` の tier 別 breakdown) が **欠落** していて、`usage.cache_creation_input_tokens`
   *   (flat sum) のみ存在する legacy / partial response の場合に、どの tier として cost 計算するかを決定。
   *
   *   **SDK breakdown がある場合は本 option を無視** し、`ephemeral_5m_input_tokens` / `ephemeral_1h_input_tokens`
   *   をそれぞれの単価で正確に積算 (primary path)。
   *
   *   - `"5m"`: 5 分 TTL、$6.25/MTok @ Opus 4.7 (推奨 / 標準利用、default)
   *   - `"1h"`: 1 時間 TTL、$10/MTok @ Opus 4.7
   */
  cacheCreationTier?: "5m" | "1h";
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
   *   - **JSON 出力強制** (a1-impl-1b、P1 path 用): theaters[] を strict schema で要求
   *   - 余分な前置き文 / 後置き文を抑制 (LLM が code block で囲む case も parser で対応)
   */
  buildPrompt(input: ProviderRetrievalInput): string {
    const maxResults = input.maxResults ?? 5;
    const lines: string[] = [
      `「${input.title}」を ${input.area} 近辺で上映している映画館を探してください。`,
    ];
    const hint = this.buildSourceHintText(input.sourceHint);
    if (hint) lines.push(hint);
    lines.push("");
    lines.push("回答は以下の JSON 形式で返してください (前置き / 説明は不要):");
    lines.push("```json");
    lines.push("{");
    lines.push(`  "theaters": [`);
    lines.push("    {");
    lines.push(`      "theaterName": "映画館名 (必須)",`);
    lines.push(`      "area": "上映エリア (必須、駅名 / 地名)",`);
    lines.push(`      "showtimes": ["19:00", "21:30"],`);
    lines.push(`      "officialUrl": "https://..."`);
    lines.push("    }");
    lines.push("  ]");
    lines.push("}");
    lines.push("```");
    lines.push(`- 最大 ${maxResults} 件まで`);
    lines.push("- `showtimes` / `officialUrl` は取得できれば、不明なら省略");
    lines.push("- 不確実な情報は含めない (hallucination 禁止)");
    lines.push("- 出典 URL は citations として返してください (text 引用元)");
    return lines.join("\n");
  }

  /**
   * Anthropic Message を `ProviderRetrievalResult` に変換 (pure、SDK type 準拠)。
   *
   *   - `theaters`: a1-impl-1b で P1 (JSON parse) + P2 (conservative regex fallback) で構造化抽出
   *   - `citations`: text block 内 `citations[]` から `CitationsWebSearchResultLocation` を抽出し canonical へ
   *   - `sourceCandidates` (a1-impl-1e): `WebSearchToolResultBlock` 内 raw search result URL を抽出
   *     (canonical citations とは別 layer、UI 非露出、observability 用)
   *   - `rawDiagnostics`: `usage` から token / search call count / cost estimate を抽出
   *
   *   signature 補正 (a1-impl-1b): `input` を引数に追加 (P2 fallback で `input.area` を必要 field として使用)。
   */
  parseResponse(
    rawMessage: Anthropic.Messages.Message,
    input: ProviderRetrievalInput,
    latencyMs: number,
  ): ProviderRetrievalResult {
    return {
      theaters: this.extractTheaters(rawMessage, input),
      citations: this.extractCitations(rawMessage),
      sourceCandidates: this.extractSourceCandidates(rawMessage),
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
    return this.parseResponse(message, input, Date.now() - startedAt);
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
   * Anthropic Message から TheaterListing[] を構造化抽出 (a1-impl-1b 実装)。
   *
   *   - **P1 第一候補**: JSON 強制 prompt + JSON parse (`tryParseJsonTheaters`)
   *   - **P2 conservative fallback**: 明示 label (theater / cinema / 映画館) + input.area で extract (`conservativeRegexTheaters`)
   *   - **P1 / P2 共に失敗時は `[]`** (空配列 OK、UX fallback は a3 phase の F1 4-layer passthrough で吸収予定)
   *   - hallucination 防御: P2 では shape 不完全な candidate を作らない
   */
  private extractTheaters(
    message: Anthropic.Messages.Message,
    input: ProviderRetrievalInput,
  ): readonly TheaterListing[] {
    const fullText = this.collectTextContent(message);
    if (fullText.length === 0) return [];

    // P1: JSON 強制 prompt が return した JSON を parse 試行
    const fromJson = this.tryParseJsonTheaters(fullText);
    if (fromJson !== null) return fromJson;

    // P2: conservative fallback (極めて保守的、hallucination 防御)
    return this.conservativeRegexTheaters(fullText, input.area);
  }

  /**
   * message.content の TextBlock の text を結合。
   *
   *   text 以外の block (server_tool_use / web_search_tool_result 等) は skip。
   */
  private collectTextContent(message: Anthropic.Messages.Message): string {
    const blocks = Array.isArray(message.content) ? message.content : [];
    const texts: string[] = [];
    for (const block of blocks) {
      if (block.type !== "text") continue;
      const textBlock = block as Anthropic.Messages.TextBlock;
      if (typeof textBlock.text === "string" && textBlock.text.length > 0) {
        texts.push(textBlock.text);
      }
    }
    return texts.join("\n");
  }

  /**
   * P1: text から JSON object を抽出 + parse + shape validate。
   *
   *   - code block (```json ... ```) を strip
   *   - 最初の `{` から対応する `}` まで balanced brace で抽出
   *   - `JSON.parse` 失敗 / shape invalid → `null` 返却 (P2 へ fallback)
   *   - shape valid + theaters array empty → `[]` 返却 (P2 へ fallback **しない**、LLM が「該当なし」を明示と解釈)
   */
  private tryParseJsonTheaters(
    text: string,
  ): readonly TheaterListing[] | null {
    const jsonStr = this.extractJsonObject(text);
    if (jsonStr === null) return null;

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      return null;
    }

    if (!parsed || typeof parsed !== "object") return null;
    const root = parsed as Record<string, unknown>;
    const theatersRaw = root.theaters;
    if (!Array.isArray(theatersRaw)) return null;

    const result: TheaterListing[] = [];
    for (const item of theatersRaw) {
      const listing = this.validateAndBuildTheaterListing(item);
      if (listing !== null) result.push(listing);
    }
    return result;
  }

  /**
   * text から JSON object 文字列を抽出 (code block strip + balanced brace 抽出)。
   *
   *   抽出順:
   *     1. ```json ... ``` ブロックを優先 (code block fenced)
   *     2. ``` ... ``` ブロック (言語 hint なし)
   *     3. 自由 text 中の `{` から対応 `}` までを balanced brace で抽出
   */
  private extractJsonObject(text: string): string | null {
    // 1. ```json ... ```
    const jsonFenceMatch = text.match(/```json\s*([\s\S]*?)```/);
    if (jsonFenceMatch) {
      const candidate = jsonFenceMatch[1].trim();
      if (candidate.startsWith("{") && candidate.endsWith("}")) {
        return candidate;
      }
    }
    // 2. ``` ... ```
    const plainFenceMatch = text.match(/```\s*([\s\S]*?)```/);
    if (plainFenceMatch) {
      const candidate = plainFenceMatch[1].trim();
      if (candidate.startsWith("{") && candidate.endsWith("}")) {
        return candidate;
      }
    }
    // 3. balanced brace から自由 text 内最初の object 抽出
    const start = text.indexOf("{");
    if (start === -1) return null;
    let depth = 0;
    for (let i = start; i < text.length; i++) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}") {
        depth--;
        if (depth === 0) return text.slice(start, i + 1);
      }
    }
    return null;
  }

  /**
   * raw item から TheaterListing を build + validate。
   *
   *   - `theaterName` 必須 (non-empty string)
   *   - `area` 必須 (non-empty string)
   *   - `showtimes`: string[] (非 string 要素 skip)、空配列なら undefined
   *   - `officialUrl`: string | null、空文字 → null、それ以外 string そのまま
   *   - 必須 field 不足 → null 返却 (hallucination 防御、PR #112 R1 整合)
   */
  private validateAndBuildTheaterListing(
    item: unknown,
  ): TheaterListing | null {
    if (!item || typeof item !== "object") return null;
    const raw = item as Record<string, unknown>;

    const theaterName = this.asNonEmptyString(raw.theaterName);
    const area = this.asNonEmptyString(raw.area);
    if (theaterName === null || area === null) return null;

    const listing: TheaterListing = { theaterName, area };

    const showtimesRaw = raw.showtimes;
    if (Array.isArray(showtimesRaw)) {
      const showtimes: string[] = [];
      for (const st of showtimesRaw) {
        if (typeof st === "string" && st.trim().length > 0) {
          showtimes.push(st.trim());
        }
      }
      if (showtimes.length > 0) {
        listing.showtimes = showtimes;
      }
    }

    const officialUrlRaw = raw.officialUrl;
    if (typeof officialUrlRaw === "string") {
      const trimmed = officialUrlRaw.trim();
      listing.officialUrl = trimmed.length > 0 ? trimmed : null;
    } else if (officialUrlRaw === null) {
      listing.officialUrl = null;
    }

    return listing;
  }

  /**
   * P2: conservative regex fallback (CEO + GPT 強制限、hallucination 禁止)。
   *
   *   厳しい条件:
   *     1. 行に **明示 label** (theater / cinema / 映画館) が含まれる
   *     2. その行から theaterName を抽出可能 (label 前の名詞 phrase)
   *     3. area は **input.area** を使用 (自由文から area 推測しない)
   *     4. 上記全てが揃わない行は skip (`[]` を返す)
   *
   *   抽出できなければ `[]` を返す (UX fallback は a3 phase の F1 で吸収予定)。
   */
  private conservativeRegexTheaters(
    text: string,
    fallbackArea: string,
  ): readonly TheaterListing[] {
    if (!fallbackArea || fallbackArea.trim().length === 0) return [];

    const trimmedArea = fallbackArea.trim();
    const lines = text.split(/\r?\n/);
    const labelPattern = /(映画館|theater|theatre|cinema|シネマ|シアター)/i;
    const result: TheaterListing[] = [];
    const seen = new Set<string>();

    for (const line of lines) {
      if (!labelPattern.test(line)) continue;
      const theaterName = this.extractTheaterNameFromLine(line);
      if (theaterName === null) continue;
      if (seen.has(theaterName)) continue;
      seen.add(theaterName);
      result.push({
        theaterName,
        area: trimmedArea,
      });
    }
    return result;
  }

  /**
   * 1 行から theaterName を抽出 (P2 限定、conservative)。
   *
   *   抽出条件:
   *     - label (映画館 / cinema / シネマ 等) を含む行
   *     - label の前にある名詞 phrase (日本語 / ASCII 連続文字) を theaterName とする
   *     - 「TOHO シネマズ 渋谷」「ヒューマントラストシネマ渋谷」「109 シネマズ」等を想定
   *     - label 単独 (theaterName 推測不能) → null
   *     - 抽出 candidate が 1 文字以下 / 記号のみ → null
   */
  private extractTheaterNameFromLine(line: string): string | null {
    const trimmed = line.trim();
    if (trimmed.length === 0) return null;

    // 「シネマ」「シアター」「映画館」「Theater」を含む word phrase を抽出
    // 日本語 / 英数 / 半角 space / ハイフン / 中点 を許容、句読点 / 括弧で区切る
    // - 先頭側 (leading): label の前にある名詞 phrase (空白超え許容)
    // - 末尾側 (trailing): label 直後の連続 chars (空白なし、「シネマ渋谷」「ヒューマントラストシネマ渋谷」のような連結名を救う)
    const tokenPattern =
      /([゠-ヿ぀-ゟ一-龯\w\s\-・]+(?:映画館|シネマ|シアター|theater|theatre|cinema)[゠-ヿ぀-ゟ一-龯\w\-・]*)/i;
    const match = trimmed.match(tokenPattern);
    if (!match) return null;

    const candidate = match[1].trim().replace(/\s+/g, " ");
    // 1 文字以下、記号のみは reject
    if (candidate.length < 2) return null;
    // label 単体 (前置 name なし) を reject。「・シネマ」「- シネマ」のような bullet 付きも reject。
    const labelOnly =
      /^[・\-\s]*(映画館|シネマ|シアター|theater|theatre|cinema)[・\-\s]*$/i;
    if (labelOnly.test(candidate)) return null;

    return candidate;
  }

  /** value が non-empty string か判定し、trim 済 string を返す helper。 */
  private asNonEmptyString(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  /**
   * Anthropic Message 内の text block の `citations[]` から
   * `web_search_result_location` のみを抽出して canonical `Citation[]` へ変換。
   *
   *   - text block 以外の content block (server_tool_use / web_search_tool_result 等) は skip
   *   - citation type が `web_search_result_location` 以外 (PDF/text 等) も skip
   *   - title が null の場合は url を fallback として title に使用
   *
   *   **重要 (a1-impl-1e、CEO 凍結要件)**:
   *     本 method は **text block の citations[] のみ** を canonical Citation 化する。
   *     `WebSearchToolResultBlock` の raw search result URL は **canonical citations に混ぜない**
   *     (混ぜると LLM が cite していない URL も UI 出典として表示される risk あり)。
   *     raw search result URL は `extractSourceCandidates` で別 layer (`sourceCandidates[]`)
   *     として抽出する (UI 非露出、observability 用)。
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
   * Anthropic Message 内の `WebSearchToolResultBlock` から `SourceCandidate[]` を抽出
   * (a1-impl-1e、canonical Citation とは別 layer)。
   *
   *   ⚠️ **本 method の output は UI に「出典」として表示してはならない**:
   *     `SourceCandidate[]` は LLM が text で actually cite していない URL を含む可能性が高い。
   *     UI の「公式 site で確認」link 等には `extractCitations()` の canonical `Citation[]` を使う。
   *     `sourceCandidates` は observability / debug / 将来の anti-hallucination guard signal 用。
   *
   *   抽出処理:
   *     1. `block.type === "web_search_tool_result"` の WebSearchToolResultBlock のみ対象
   *     2. `block.content` が array (success) なら each WebSearchResultBlock を candidate 化
   *     3. `block.content` が `WebSearchToolResultError` (失敗) なら該当 block を skip
   *     4. URL を `normalizeSourceCandidateUrl` で正規化 (host 小文字化 / fragment 除去 / trim)
   *     5. 正規化後 URL を key に dedup (insertion order 保持、最初の occurrence の metadata を保持)
   *     6. URL parse 失敗時は trim 結果を fallback key として使用 (drop しない)
   *
   *   providerSource は固定値 `ANTHROPIC_DEFAULTS.WEB_SEARCH_TOOL_TYPE`、
   *   `toolUseId` は parent WebSearchToolResultBlock の `tool_use_id` から取得。
   */
  private extractSourceCandidates(
    message: Anthropic.Messages.Message,
  ): readonly SourceCandidate[] {
    const contentBlocks = Array.isArray(message.content) ? message.content : [];
    const result: SourceCandidate[] = [];
    const seen = new Set<string>();
    for (const block of contentBlocks) {
      if (block.type !== "web_search_tool_result") continue;
      const wsBlock = block as Anthropic.Messages.WebSearchToolResultBlock;
      // content は WebSearchToolResultError | Array<WebSearchResultBlock>
      if (!Array.isArray(wsBlock.content)) continue;
      for (const item of wsBlock.content) {
        if (!item || item.type !== "web_search_result") continue;
        const normalized = this.normalizeSourceCandidateUrl(item.url);
        if (normalized === null) continue;
        if (seen.has(normalized)) continue;
        seen.add(normalized);
        result.push({
          url: normalized,
          title: typeof item.title === "string" ? item.title : null,
          pageAge: item.page_age ?? null,
          providerSource: ANTHROPIC_DEFAULTS.WEB_SEARCH_TOOL_TYPE,
          toolUseId:
            typeof wsBlock.tool_use_id === "string"
              ? wsBlock.tool_use_id
              : null,
        });
      }
    }
    return result;
  }

  /**
   * URL を軽く正規化して dedup key を生成 (a1-impl-1e)。
   *
   *   保守的な正規化 (RFC 3986 ベース、aggressive 正規化なし):
   *     - 前後 whitespace を trim
   *     - host を小文字化 (RFC 3986: host は case-insensitive)
   *     - fragment (#...) を除去 (RFC 3986: fragment は client-side only)
   *     - query は **保持** (映画館 URL の ?id=XXX 等は資源 identifier の可能性)
   *     - trailing slash は **保持** (server 解釈で異なる resource の可能性)
   *
   *   URL parse 失敗時は trim 結果を返す (drop しない、保守的)。
   *   空文字 / non-string は null 返却で reject。
   */
  private normalizeSourceCandidateUrl(rawUrl: unknown): string | null {
    if (typeof rawUrl !== "string") return null;
    const trimmed = rawUrl.trim();
    if (trimmed.length === 0) return null;
    try {
      const u = new URL(trimmed);
      u.hash = ""; // fragment 除去
      // URL ctor は host を自動で小文字化、query / pathname は保持
      return u.href;
    } catch {
      // URL parse 失敗時は trim 結果を fallback (provider 内部 dedup key として使用)
      return trimmed;
    }
  }

  /**
   * Anthropic Message の `usage` から observability 用 diagnostics を抽出。
   *
   *   - tokenInput / tokenOutput / searchCallCount (server_tool_use.web_search_requests)
   *   - tokenCacheCreate / tokenCacheRead (a1-impl-1f 追加、cache_*_input_tokens が non-number 時は未設定)
   *   - costEstimateCents (a1-impl-1d 追加 / a1-impl-1f cache-aware / a1-impl-1g geo multiplier opt-in)
   *   - inferenceGeo (a1-impl-1g 追加、null/空文字/whitespace 時は未設定で no-info 扱い)
   *   - webSearchErrorCount / webSearchLastErrorCode (a1-impl-1i 追加、observability only、action なし)
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
    // a1-impl-1f: cache token observability (null/non-number 時は未設定で backward compat)
    if (typeof usage.cache_creation_input_tokens === "number") {
      diagnostics.tokenCacheCreate = usage.cache_creation_input_tokens;
    }
    if (typeof usage.cache_read_input_tokens === "number") {
      diagnostics.tokenCacheRead = usage.cache_read_input_tokens;
    }
    const serverToolUse = usage.server_tool_use;
    if (
      serverToolUse &&
      typeof serverToolUse.web_search_requests === "number"
    ) {
      diagnostics.searchCallCount = serverToolUse.web_search_requests;
    }
    // a1-impl-1g: inference geo observability (null / 空文字 / whitespace は未設定で no-info)
    const inferenceGeo = this.normalizeInferenceGeo(usage.inference_geo);
    if (inferenceGeo !== null) {
      diagnostics.inferenceGeo = inferenceGeo;
    }
    const costEstimate = this.computeCostEstimateCents(usage);
    if (costEstimate !== undefined) {
      diagnostics.costEstimateCents = costEstimate;
    }
    // a1-impl-1i: WebSearch error observability (observability only、action なし)
    const wsErrors = this.extractWebSearchErrors(message);
    if (wsErrors.count > 0) {
      diagnostics.webSearchErrorCount = wsErrors.count;
      if (wsErrors.lastErrorCode !== null) {
        diagnostics.webSearchLastErrorCode = wsErrors.lastErrorCode;
      }
    }
    return Object.keys(diagnostics).length > 0 ? diagnostics : undefined;
  }

  /**
   * Anthropic Message 内の `WebSearchToolResultBlock` で content が **error 型**
   * (`web_search_tool_result_error`) の block を集計 (a1-impl-1i 追加、observability only)。
   *
   *   - count: error block の総数 (1 message 内で複数 search 試行 + 一部失敗 case を集計)
   *   - lastErrorCode: 最後 (iteration 順) の error_code (string) — 非 string なら null
   *
   *   **observability only**: 本 method は count / code を観測 **のみ**、reject / retry / fallback /
   *   ProviderSelector 切替は **しない**。`extractSourceCandidates` (PR #115) の skip 挙動は
   *   完全独立で維持。`extractCitations` / `extractTheaters` も touch なし。
   *
   *   robust 化:
   *     - block.content が array (success path) → skip (count に含めない)
   *     - block.content が object (error path) → count + 1、error_code を string と確認できれば lastErrorCode 更新
   *     - block.content が malformed (なし / null) → silent skip (誤 count 回避)
   */
  private extractWebSearchErrors(
    message: Anthropic.Messages.Message,
  ): { count: number; lastErrorCode: string | null } {
    const contentBlocks = Array.isArray(message.content) ? message.content : [];
    let count = 0;
    let lastErrorCode: string | null = null;
    for (const block of contentBlocks) {
      if (block.type !== "web_search_tool_result") continue;
      const wsBlock = block as Anthropic.Messages.WebSearchToolResultBlock;
      // success path: content is Array<WebSearchResultBlock> → skip (extractSourceCandidates 担当)
      if (Array.isArray(wsBlock.content)) continue;
      // content が object かつ error path
      const errorContent = wsBlock.content;
      if (!errorContent || typeof errorContent !== "object") continue;
      count++;
      // SDK 型は WebSearchToolResultError だが、SDK 想定外の malformed response への防御として
      // error_code が string であることを runtime で再確認 (graceful fallback)
      const errorContentRecord = errorContent as unknown as Record<string, unknown>;
      const errorCode = errorContentRecord.error_code;
      if (typeof errorCode === "string" && errorCode.length > 0) {
        lastErrorCode = errorCode;
      }
    }
    return { count, lastErrorCode };
  }

  /**
   * `usage.inference_geo` を normalize (a1-impl-1g)。
   *
   *   - 非 string / null / 空文字 / whitespace のみ → `null` (no-info)
   *   - non-empty string → trim 済 string
   *
   *   value semantic は SDK で定義されていないため、本 method は **opaque string として trim のみ**。
   *   呼び出し側 (`extractDiagnostics` / `computeCostEstimateCents`) は trimmed value を key として
   *   `pricing.geoMultipliers` lookup 等に使用する。
   */
  private normalizeInferenceGeo(rawGeo: unknown): string | null {
    if (typeof rawGeo !== "string") return null;
    const trimmed = rawGeo.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  /**
   * 推定 cost (USD cents) を `usage` から計算 (a1-impl-1d / 1f / 1g 拡張)。
   *
   *   **observability 用 estimated value、billing source of truth ではない**。
   *   Anthropic 公式 invoice (Console / API billing) が authoritative。
   *
   *   計算式 (内部 unit: micro-cents、1 cent = 10,000 μ¢、a1-impl-1f から fractional 許容):
   *     tokenMicroCents =
   *         inputTokens     * inputMicroCentsPerToken
   *       + outputTokens    * outputMicroCentsPerToken
   *       + cache5mTokens   * cacheCreate5mMicroCentsPerToken
   *       + cache1hTokens   * cacheCreate1hMicroCentsPerToken
   *       + cacheReadTokens * cacheReadMicroCentsPerToken
   *
   *     geoMultiplier (a1-impl-1g、opt-in)::
   *       `pricing.geoMultipliers?.[inference_geo]` が定義されていれば tokenMicroCents に乗算
   *       未定義 / inference_geo が null/空 → 1.0 (no change)
   *
   *     microCents = tokenMicroCents * geoMultiplier
   *                + webSearches * webSearchMicroCentsPerRequest  (web search は multiplier 非適用)
   *
   *   Cache token source resolution (a1-impl-1f):
   *     1. **Primary**: `usage.cache_creation.ephemeral_5m_input_tokens` / `ephemeral_1h_input_tokens`
   *     2. **Fallback**: `cache_creation_input_tokens` (flat sum) + `cacheCreationTier` (default "5m")
   *
   *   出力 (cents):
   *     `microCents / 10000` (fractional cents 許容、本 provider は丸めない)
   *
   *   undefined 返却条件:
   *     - `pricing.models[model]` が undefined (未登録 model、silent skip で誤計算を避ける)
   *
   *   token 欠損時の扱い:
   *     - `usage.input_tokens` / `output_tokens` / cache 系 / `web_search_requests` が non-number → 0
   *     - pricing snapshot 側で cache 単価 / geoMultipliers が未設定 → 0 cost / multiplier 1.0 (graceful)
   *
   *   **本 phase での default 不変保証**:
   *     `ANTHROPIC_PRICING_2026_05_12` は `geoMultipliers` を定義しないため、default caller の cost
   *     値は PR #116 と byte-equivalent。caller が custom snapshot で `geoMultipliers` を inject した
   *     場合のみ multiplier 適用。
   */
  private computeCostEstimateCents(
    usage: Anthropic.Messages.Usage,
  ): number | undefined {
    const pricing = this.options.pricing ?? ANTHROPIC_PRICING_2026_05_12;
    const model = this.options.model ?? ANTHROPIC_DEFAULTS.MODEL;
    const modelPricing = pricing.models[model];
    if (!modelPricing) return undefined;

    const inputTokens =
      typeof usage.input_tokens === "number" ? usage.input_tokens : 0;
    const outputTokens =
      typeof usage.output_tokens === "number" ? usage.output_tokens : 0;

    // a1-impl-1f: cache creation cost (primary = SDK breakdown、fallback = flat sum + tier option)
    const cache5mPrice = modelPricing.cacheCreate5mMicroCentsPerToken ?? 0;
    const cache1hPrice = modelPricing.cacheCreate1hMicroCentsPerToken ?? 0;
    let cacheCreateMicroCents = 0;
    const cacheCreation = usage.cache_creation;
    if (cacheCreation) {
      // Primary path: SDK が tier breakdown を提供
      const tier5mTokens =
        typeof cacheCreation.ephemeral_5m_input_tokens === "number"
          ? cacheCreation.ephemeral_5m_input_tokens
          : 0;
      const tier1hTokens =
        typeof cacheCreation.ephemeral_1h_input_tokens === "number"
          ? cacheCreation.ephemeral_1h_input_tokens
          : 0;
      cacheCreateMicroCents =
        tier5mTokens * cache5mPrice + tier1hTokens * cache1hPrice;
    } else if (typeof usage.cache_creation_input_tokens === "number") {
      // Fallback path: flat sum のみ → option の tier hint で計算
      const tier = this.options.cacheCreationTier ?? "5m";
      const pricePerToken = tier === "1h" ? cache1hPrice : cache5mPrice;
      cacheCreateMicroCents =
        usage.cache_creation_input_tokens * pricePerToken;
    }

    // a1-impl-1f: cache read cost
    const cacheReadTokens =
      typeof usage.cache_read_input_tokens === "number"
        ? usage.cache_read_input_tokens
        : 0;
    const cacheReadPrice = modelPricing.cacheReadMicroCentsPerToken ?? 0;
    const cacheReadMicroCents = cacheReadTokens * cacheReadPrice;

    // token-based cost subtotal (a1-impl-1g: geoMultiplier 適用 scope)
    const tokenMicroCents =
      inputTokens * modelPricing.inputMicroCentsPerToken +
      outputTokens * modelPricing.outputMicroCentsPerToken +
      cacheCreateMicroCents +
      cacheReadMicroCents;

    // a1-impl-1g: geo multiplier (opt-in、default snapshot で未設定 → 1.0)
    const geoMultiplier = this.resolveGeoMultiplier(pricing, usage);
    const tokenMicroCentsAdjusted = tokenMicroCents * geoMultiplier;

    const serverToolUse = usage.server_tool_use;
    const webSearches =
      serverToolUse &&
      typeof serverToolUse.web_search_requests === "number"
        ? serverToolUse.web_search_requests
        : 0;

    const microCents =
      tokenMicroCentsAdjusted +
      webSearches * pricing.webSearchMicroCentsPerRequest;

    // 10,000 μ¢ = 1 ¢ (cent)。fractional cents 許容 (e.g. 2.425、0.0005)。
    return microCents / 10_000;
  }

  /**
   * inference_geo に対応する multiplier を pricing snapshot から resolve (a1-impl-1g)。
   *
   *   - `pricing.geoMultipliers` が未定義 (default snapshot) → 1.0 (no change、PR #116 互換)
   *   - `inference_geo` が null / 空文字 / whitespace → 1.0
   *   - `geoMultipliers[trimmedGeo]` が定義されていれば その値 (e.g. 1.1)
   *   - 一致しない (unknown geo) → 1.0 (conservative、誤算回避)
   *   - multiplier 値が non-number / 非有限 (NaN / Infinity) → 1.0 (graceful)
   */
  private resolveGeoMultiplier(
    pricing: AnthropicPricingSnapshot,
    usage: Anthropic.Messages.Usage,
  ): number {
    const multipliers = pricing.geoMultipliers;
    if (!multipliers) return 1;
    const geo = this.normalizeInferenceGeo(usage.inference_geo);
    if (geo === null) return 1;
    const candidate = multipliers[geo];
    if (typeof candidate !== "number" || !Number.isFinite(candidate)) {
      return 1;
    }
    return candidate;
  }
}
