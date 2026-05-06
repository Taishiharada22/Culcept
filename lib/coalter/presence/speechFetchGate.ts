/**
 * CoAlter Stage 4 L4-i Phase 1 — Client-side Speech Fetch Gate
 *
 * 正本: layout plan v0.3 §7.9 / CEO 確定方針 (2026-04-30 L4-i 設計 v2)
 *
 * 責務:
 *   - client side で /api/coalter/speech への fetch を有効化するかの kill switch
 *   - 二重 gate の **client 側** (server 側は app/api/coalter/speech/route.ts)
 *
 * **重要 (CEO 厳守 2026-04-30)**:
 *   - Phase 1 では env を **追加しない**
 *   - env 未設定 → fallback false → fetch 起動ゼロ → Production behavior 完全不変
 *   - Phase 2 で CEO が Vercel Preview env に
 *     `NEXT_PUBLIC_COALTER_PRESENCE_SPEECH_FETCH=true` を追加することで有効化
 *   - code 変更なしで Phase 2 観測に移れる構造
 *
 * **NEXT_PUBLIC_ prefix + 直接アクセス必須 (lib/coalter/flags.ts と同方針)**:
 *   webpack DefinePlugin の inline は `process.env.NEXT_PUBLIC_X` (member access)
 *   のみ対象。computed access (`process.env[name]`) は browser polyfill の env={}
 *   に落ちて常に undefined → fallback。本 getter は直接記述で inline を強制する。
 */

/**
 * Phase 1 default: env 未設定で false (fetch 起動なし、Production 不変)。
 * Phase 2: Vercel Preview env で `NEXT_PUBLIC_COALTER_PRESENCE_SPEECH_FETCH=true` で true。
 *
 * 純関数 (test 容易性 + caller 側 memoization 不要)。
 */
export function isSpeechFetchEnabled(): boolean {
  return process.env.NEXT_PUBLIC_COALTER_PRESENCE_SPEECH_FETCH === "true";
}

/**
 * L4-i Phase 2 Stage 2.1 / 2.2 観測モード (CEO 確定 2026-05-07 Option C')。
 *
 * Phase 2 観測中、同 thread / 同 (variant, state, mode) で連続 signal が来ても
 * cache hit + effect deps 不変で fetch が起動せず統計サンプルが取れない問題を解消する。
 *
 * 本 flag が true のとき、UpperLayerMount は:
 *   1. speech session cache (read/write) を skip
 *   2. negative cache (read) を skip
 *   3. effect deps に最新 signal の一意 key (kind:ts) を含めて毎回再実行
 *   4. in-flight dedupe / AbortController / stale response guard / 8s timeout は維持
 *   5. pattern.used emit は Option B' 通り fetch 完了後に actual outcome で emit
 *
 * **Production 不変原則**: env 未設定 (本関数 false) なら従来挙動完全維持。観測モードは
 * Vercel Preview env でのみ ON、Production には絶対入れない (CEO 厳守)。
 *
 * 観測モード OFF (= Production / Phase 1 default) でも fetch は機能する
 * (`isSpeechFetchEnabled()` が ON なら)。本関数は cache / re-trigger 戦略のみ制御。
 */
export function isSpeechObservationMode(): boolean {
  return (
    process.env.NEXT_PUBLIC_COALTER_PRESENCE_SPEECH_OBSERVATION_MODE === "true"
  );
}
