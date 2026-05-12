/**
 * CoAlter D-2-e3-a0 Provider-Agnostic Foundation — ProviderSelector
 *
 * PR #109 §3 で凍結された provider chain selector の pure 実装。
 *
 * 役割:
 *   - provider chain (Primary → Secondary → Tertiary → Quaternary) の順次試行
 *   - enable 済 provider のみで chain を構築
 *   - 各 provider 失敗時は次 candidate へ自動切替え (fail-open)
 *   - 全 provider 失敗 → `"quaternary"` sentinel 返却
 *     (adapter が F1 = 4-layer pipeline passthrough へ降ろす、PR #109 §8.2)
 *
 * 設計原則 (D-2-e3-a0 pure foundation):
 *   - 実 provider client / 実 HTTP / 実 API 接続なし (provider は DI 経由)
 *   - logging / Sentry alert は本 phase scope 外 (D-2-e3-a 着手後の別 PR で追加)
 *   - circuit breaker (cool-down) state は呼び出し側が管理、本関数は state-less な選択 logic のみ
 */

import type {
  MovieRetrievalProvider,
  ProviderRetrievalInput,
  ProviderRetrievalResult,
} from "./types";

// ═══════════════════════════════════════════════════════════════════════════
// 1. Public Types
// ═══════════════════════════════════════════════════════════════════════════

/**
 * provider chain 配置 (DI 経由で adapter から渡される)。
 *
 *   `primary` は必須、`secondary` / `tertiary` は null 許容 (enable 済 provider のみ chain に含める)。
 *   chain の順序は runtime preference 順 (PR #109 §3.3、Anthropic-first default)。
 */
export interface ProviderChainConfig {
  /** Primary candidate (必須、enabled でなければ skip) */
  primary: MovieRetrievalProvider;
  /** Secondary candidate (null = 無効、enabled でなければ skip) */
  secondary: MovieRetrievalProvider | null;
  /** Tertiary candidate (null = 無効) */
  tertiary: MovieRetrievalProvider | null;
}

/**
 * provider chain 実行結果。
 *
 *   - `"provider_success"`: いずれかの provider が retrieval に成功
 *   - `"quaternary"`: 全 enable 済 provider が失敗 (or 全 disabled)、adapter が 4-layer pipeline へ降ろす
 *
 * `quaternary` reason は observability 用:
 *   - `"all_providers_disabled"`: chain に enabled provider なし (config 異常 or 意図的 disable)
 *   - `"all_providers_failed"`: 全 enable 済 provider が throw (network / API error 等)
 */
export type ProviderSelectorResult =
  | { kind: "provider_success"; result: ProviderRetrievalResult }
  | {
      kind: "quaternary";
      reason: "all_providers_failed" | "all_providers_disabled";
      /** 失敗した attempt 数 (all_providers_failed 時)、observability 用 */
      attemptedCount: number;
    };

// ═══════════════════════════════════════════════════════════════════════════
// 2. Public API — selectAndRetrieve
// ═══════════════════════════════════════════════════════════════════════════

/**
 * provider chain で順次 retrieve を試行する。
 *
 *   1. enable 済 provider のみで chain を構築
 *   2. chain が空 → `"quaternary"` (reason `"all_providers_disabled"`) 即返却
 *   3. 各 provider に対して順次 `retrieve(input)` 呼び出し
 *   4. 成功 → `"provider_success"` 即返却 (後続 provider は呼ばない、cost 削減)
 *   5. 全 provider 失敗 → `"quaternary"` (reason `"all_providers_failed"`)
 *
 * fail-open:
 *   個別 provider の throw は本関数で握り潰し、次 provider へ。
 *   caller (adapter) は本関数の reject を受けない (常に resolve)。
 */
export async function selectAndRetrieve(
  input: ProviderRetrievalInput,
  config: ProviderChainConfig,
): Promise<ProviderSelectorResult> {
  const chain = buildChain(config);

  if (chain.length === 0) {
    return {
      kind: "quaternary",
      reason: "all_providers_disabled",
      attemptedCount: 0,
    };
  }

  let attemptedCount = 0;
  for (const provider of chain) {
    attemptedCount++;
    try {
      const result = await provider.retrieve(input);
      return { kind: "provider_success", result };
    } catch {
      // 次 provider へ。本 phase では log / Sentry alert なし。
      // 実装 phase (D-2-e3-a) で observability hook を追加予定。
    }
  }

  return {
    kind: "quaternary",
    reason: "all_providers_failed",
    attemptedCount,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Internal Helpers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * config から enable 済 provider のみで chain を構築。
 *
 *   配列順は `primary` → `secondary` → `tertiary` (runtime preference 順)。
 *   null / disabled は除外。
 */
function buildChain(config: ProviderChainConfig): MovieRetrievalProvider[] {
  const candidates: (MovieRetrievalProvider | null)[] = [
    config.primary,
    config.secondary,
    config.tertiary,
  ];
  return candidates.filter(
    (p): p is MovieRetrievalProvider => p !== null && p.enabled,
  );
}
