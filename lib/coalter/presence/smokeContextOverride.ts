/**
 * CoAlter Stage 2.4-B B-3 Phase 2 — Smoke-only context flag injection harness
 *
 * 正本:
 *   - decision-log [2026-05-09] (Stage 2.4-B Gap 3/4 構造的 blocker + B-3 設計提示)
 *   - docs/coalter-stage24-b-smoke-procedure.md Appendix D
 *   - CEO/GPT 確定 2026-05-09 Option A 採用 + Phase 2 条件付き GO
 *
 * 役割 (CEO 厳守、本書の意味論):
 *
 *   本 module は Preview env 限定の **smoke harness** であり、
 *   `selectPattern` / `usePresenceExecutor.dispatch.setPatternContext` 経由で
 *   `Partial<PatternContext>` を URL query から人工的に注入することで、
 *   Stage 2.4-B の S5/S7 variant fetch path 検証を smoke 上だけで成立させる。
 *
 *   **「Gap 4 解消」とは呼ばない**。production-side context flag detector
 *   (executor watcher / heuristic / LLM 検出 等) は **未実装のまま別 phase** に残る。
 *   本 module を使った結果を **production reachability PASS とは呼ばない**。
 *   あくまで S5/S7 variant fetch path の **検証用 harness** として扱う。
 *
 * fail-closed 設計 (CEO/GPT 補正、Phase 2 必須条件):
 *   - default false (env 未設定で無効、production 不変)
 *   - Production env には絶対設定しない (CEO 運用厳守、本 module は env=true で
 *     のみ機能、production env での accidentally true を防ぐため exact "true"
 *     のみ受け入れる: "1" / "yes" / "TRUE" 等は false 評価)
 *   - URL query から **許可 flag のみ** 読む (whitelist + unknown 無視)
 *   - allowed flag 以外を **絶対 accept しない** (構造的に prototype pollution
 *     や任意 key 設定を排除)
 *
 * 不可侵 (CEO 厳守):
 *   - selectPattern / constants / types / signalAdapter / signalClassifier /
 *     reducer 不接触
 *   - speech 系 / speech route / model / max_tokens / timeout 不変
 *   - production env / ChatClient.tsx / UrgentLayer 不接触
 *   - production-side context flag detector は本 module で実装しない (別 phase)
 *
 * 表記:
 *   - NEXT_PUBLIC_ prefix + 直接 access 必須 (`lib/coalter/flags.ts` と同方針、
 *     webpack DefinePlugin の inline は member access のみ対象)
 */

import type { PatternContext } from "./patternSelector";

// ─────────────────────────────────────────────
// 許可 flag whitelist (PatternContext の 7 field と一致)
// ─────────────────────────────────────────────

/**
 * smoke harness で URL query 経由で立てられる flag 名 (whitelist)。
 *
 * 各 flag は `PatternContext` の field 名に対応。本 whitelist 以外の flag 名は
 * `parseSmokeContextFlags` で無視される (構造的な fail-closed)。
 */
export const ALLOWED_SMOKE_FLAGS = [
  "infoMissing",
  "uncertaintyHigh",
  "needFraming",
  "oneSidedFatigue",
  "needTranslation",
  "relationshipSignalsClear",
  "relationshipNoiseHigh",
] as const;

export type AllowedSmokeFlag = (typeof ALLOWED_SMOKE_FLAGS)[number];

const ALLOWED_FLAG_SET: ReadonlySet<string> = new Set(ALLOWED_SMOKE_FLAGS);

/**
 * 入力文字列が allowed flag の 1 つかを判定する type guard。
 *
 * whitelist による strict match。case-sensitive。
 */
function isAllowedSmokeFlag(s: string): s is AllowedSmokeFlag {
  return ALLOWED_FLAG_SET.has(s);
}

// ─────────────────────────────────────────────
// env gate (fail-closed): "true" のみ accept
// ─────────────────────────────────────────────

/**
 * smoke context override が有効かを返す env gate。
 *
 * `process.env.NEXT_PUBLIC_COALTER_PRESENCE_SMOKE_CONTEXT === "true"` のみ true。
 * exact match による fail-closed 設計:
 *   - "1" / "yes" / "on" / "TRUE" (大文字) / 任意の truthy 文字列 → false
 *   - 未設定 / 空文字 / "false" → false
 *   - "true" のみ → true (Preview smoke 用 ON 状態)
 *
 * Production env には絶対設定しない (CEO 運用厳守)。万一誤設定されても、本関数の
 * exact match により誤動作しない構造を確保する。
 */
export function isSmokeContextOverrideEnabled(): boolean {
  return process.env.NEXT_PUBLIC_COALTER_PRESENCE_SMOKE_CONTEXT === "true";
}

// ─────────────────────────────────────────────
// URL query parser (whitelist + unknown 無視)
// ─────────────────────────────────────────────

/**
 * URL query parameter `coalter_smoke_flag=...` を `Partial<PatternContext>` に変換する。
 *
 * 仕様:
 *   - parameter 値は CSV (例: `coalter_smoke_flag=needFraming,uncertaintyHigh`)
 *   - 各 entry は trim されて strict match (whitespace 許容、case-sensitive)
 *   - allowed flag のみ accept (`ALLOWED_SMOKE_FLAGS` whitelist)
 *   - unknown flag (whitelist 外) は **silently 無視** (warning 出さない、構造的安全性)
 *   - 重複 flag は冪等 (1 回設定と同じ)
 *   - 空文字 / 未指定 → 空 object 返却
 *   - allowed flag が立ったら値 `true` を設定 (false 設定経路なし、未指定 = false)
 *
 * 純関数 (test 容易性 + side effect なし)。
 *
 * 例:
 *   parseSmokeContextFlags(new URLSearchParams("coalter_smoke_flag=needFraming"))
 *     → { needFraming: true }
 *
 *   parseSmokeContextFlags(new URLSearchParams("coalter_smoke_flag=needFraming,unknownFlag"))
 *     → { needFraming: true } (unknownFlag は無視)
 *
 *   parseSmokeContextFlags(new URLSearchParams(""))
 *     → {}
 */
export function parseSmokeContextFlags(
  searchParams: URLSearchParams,
): Partial<PatternContext> {
  const raw = searchParams.get("coalter_smoke_flag");
  if (raw == null || raw.length === 0) return {};

  const result: Partial<PatternContext> = {};
  const entries = raw.split(",");
  for (const entry of entries) {
    const flag = entry.trim();
    if (flag.length === 0) continue;
    if (!isAllowedSmokeFlag(flag)) continue; // unknown 無視 (fail-closed)
    result[flag] = true;
  }
  return result;
}
