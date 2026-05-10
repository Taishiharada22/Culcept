/**
 * CoAlter Stage 4 L4-i Phase 2 Stage 2.2 — Optimistic-Echo 専用 dedupe
 *
 * 正本: layout plan v0.3 §7.2 / CEO 確定方針 (2026-05-07 Fix C)
 *
 * 背景 (block 1 NG retro):
 *   - 20-call smoke で speech POST が 29 件 (1.45x の過剰発火) → block 1 NG
 *   - Root cause (high-confidence、Explore file:line 追跡):
 *       optimistic message → critical signal 1 publish (id="optimistic-${ts}")
 *       └─ POST 後 fetchMessages() で server UUID message が state に append
 *       └─ PresenceSignalWiring の lastSeenIdRef が id-base なので別 id で重複 check 抜け
 *       └─ 同 body から server echo critical signal 2 publish
 *       └─ observationKey が 2 回変化 → speech fetch 2 回目
 *   - 既存 dedupe (in-flight / telemetry / cache) は observationMode ON で全層解除
 *
 * **本 module の責務 (CEO 厳守)**:
 *   - **非対称 (asymmetric) dedupe**:
 *       - optimistic candidate は **常に publish** (cache に記録)
 *       - server candidate は **直前 optimistic と一致する場合のみ skip**
 *       - server 同士・optimistic 同士の dedupe は **しない** (連投誤殺防止)
 *   - **CEO 補正条件** (一般 dedupe 禁止):
 *       - 同 body 連投 (window 外) は publish (echo ではない)
 *       - 別 sender / 別 body / 別 kind は publish
 *
 * **CEO 厳守の不可侵**:
 *   - canonical id を前提にしない (optimistic id ≠ server UUID)
 *   - body hash 永久 dedupe しない (window 必須)
 *   - ChatClient touch なし、PresenceSignalWiring 内完結
 *   - timeout / validator / Anthropic / Production env / UrgentLayer 触らない
 *
 * **設計の核**:
 *   - normalizeBody: trim + collapse-whitespace + NFC のみ (lowercase なし、日本語意味温存)
 *   - window: 8 秒 (post-fetch + Realtime + polling 5s 経路を全カバー、20 秒連投と区別)
 *   - 非対称: candidate.isOptimistic === false かつ
 *             cache 内に isOptimistic === true で同 (sender, body, kind) があれば skip
 */

/** optimistic message id の prefix (ChatClient.tsx:919 で生成) */
export const OPTIMISTIC_ID_PREFIX = "optimistic-";

/** echo dedupe の有効 window (ms)。CEO 確定 = 8 秒 */
export const ECHO_DEDUPE_WINDOW_MS = 8_000;

/**
 * cache entry の型。各 published signal candidate のスナップショット。
 *
 * - id: message.id (optimistic-${ts} or server UUID)
 * - isOptimistic: id.startsWith(OPTIMISTIC_ID_PREFIX)
 * - senderId: message.senderId (空文字列の場合あり、その時は dedupe 効かない)
 * - bodyKey: normalizeBody(body) の結果
 * - kind: signal.kind ("critical" | "implicit" 等)
 * - detectedAt: signal.detectedAt (ms epoch)
 */
export interface EchoCacheEntry {
  id: string;
  isOptimistic: boolean;
  senderId: string;
  bodyKey: string;
  kind: string;
  detectedAt: number;
}

/**
 * body 文字列を echo dedupe key 用に正規化する。
 *
 * - trim: 前後空白除去
 * - collapse-whitespace: 連続空白 (空白/タブ/改行) を 1 個 space に圧縮
 * - NFC: Unicode 正規化 (全角・濁点合成等の差異吸収)
 * - **lowercase は適用しない** (日本語に意味なし、CEO 確定)
 */
export function normalizeBody(body: string): string {
  return body.trim().replace(/\s+/g, " ").normalize("NFC");
}

/**
 * cache から expired entry (now - detectedAt > windowMs) を除去した新配列を返す純関数。
 *
 * - 元配列を mutate しない (caller 側で ref.current に再代入)
 * - 順序は保持 (古い順 → 新しい順)
 */
export function pruneEchoCache(
  cache: ReadonlyArray<EchoCacheEntry>,
  now: number,
  windowMs: number = ECHO_DEDUPE_WINDOW_MS,
): EchoCacheEntry[] {
  return cache.filter((entry) => now - entry.detectedAt <= windowMs);
}

/**
 * candidate (新たに publish しようとしている signal) が
 * 直前の optimistic signal の **server echo** であるか判定する純関数。
 *
 * **非対称ロジック (CEO 厳守)**:
 *   1. candidate.isOptimistic === true → false (optimistic は echo 認定しない、常に publish)
 *   2. candidate.isOptimistic === false → cache 内を探索:
 *      - prev.isOptimistic === true (server 同士は対象外)
 *      - prev.senderId === candidate.senderId
 *      - prev.bodyKey === candidate.bodyKey
 *      - prev.kind === candidate.kind
 *      - now - prev.detectedAt <= windowMs
 *      - 上記全て一致する prev が **1 件でもあれば** echo 認定 → true
 *
 * **CEO 補正で除外したケース**:
 *   - server 同士の dedupe (例: realtime + polling で 2 回 echo が来た場合の 2 個目) は **しない**
 *     (理由: 2 個目は 1 個目で echo 認定済の対なので、cache 残骸の影響を受ける)
 *   - optimistic 同士の dedupe (連投の 2 個目) は **しない** (同文連投を殺さない)
 *
 * **注意**: senderId が空文字列の場合、空 vs 空で偶然一致するため echo 誤認定の可能性。
 * caller 側 (PresenceSignalWiring) で senderId 空時はそもそも cache に入れない設計を推奨。
 * 本関数は純関数として与えられた cache に従って判定するのみ。
 */
export function isServerEchoOfRecentOptimistic(
  candidate: EchoCacheEntry,
  cache: ReadonlyArray<EchoCacheEntry>,
  now: number,
  windowMs: number = ECHO_DEDUPE_WINDOW_MS,
): boolean {
  if (candidate.isOptimistic) return false;
  return cache.some(
    (prev) =>
      prev.isOptimistic === true &&
      prev.senderId === candidate.senderId &&
      prev.bodyKey === candidate.bodyKey &&
      prev.kind === candidate.kind &&
      now - prev.detectedAt <= windowMs,
  );
}

/**
 * raw input から EchoCacheEntry を構築する helper。
 *
 * isOptimistic は id prefix から自動判定。caller 側で boolean を渡す必要なし。
 */
export function buildEchoCandidate(input: {
  id: string;
  senderId: string;
  body: string;
  kind: string;
  detectedAt: number;
}): EchoCacheEntry {
  return {
    id: input.id,
    isOptimistic: input.id.startsWith(OPTIMISTIC_ID_PREFIX),
    senderId: input.senderId,
    bodyKey: normalizeBody(input.body),
    kind: input.kind,
    detectedAt: input.detectedAt,
  };
}
