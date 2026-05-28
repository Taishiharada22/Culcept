/**
 * P3-A-1-2 G-α: Connection 表示用 pure helpers
 *
 * 設計書: docs/alter-plan-p3-a-1-1-oauth-scaffold-readiness.md §1.8
 * decision-log: 2026-05-26 D-e + G-α
 *
 * 役割:
 *   - status → 人間語ラベル
 *   - lastSyncedAt ISO → 「2 分前」 等の相対表示
 *   - access_role → 表示用 badge label
 *   - pure module (= I/O / time / random なし、 ただし relativeTime は now を引数で受ける)
 *
 * 不変原則:
 *   - throw しない (= fail-safe で適切な default 文字列)
 *   - time 表示は now を引数受け取り、 default は Date.now() (= deterministic test 容易)
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type ConnectionStatus = "active" | "revoked" | "token_expired";

export type AccessRole = "owner" | "writer" | "reader";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Status label
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * connection status → 人間語ラベル (= Aneurasync 文体: 状態描写型)
 *
 * - active: 「接続中」
 * - revoked: 「接続が解除されました」
 * - token_expired: 「再連携が必要です」
 */
export function describeConnectionStatus(status: ConnectionStatus): string {
  switch (status) {
    case "active":
      return "接続中";
    case "revoked":
      return "接続が解除されました";
    case "token_expired":
      return "再連携が必要です";
    default:
      return "未確定";
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Relative time
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * ISO 8601 → 相対表示 (= 「2 分前」 「3 時間前」 等)
 *
 * - null / 不正 → 「未同期」
 * - 60 秒未満 → 「たった今」
 * - 60 分未満 → 「N 分前」
 * - 24 時間未満 → 「N 時間前」
 * - 30 日未満 → 「N 日前」
 * - それ以上 → 「YYYY/MM/DD」
 */
export function formatRelativeTime(
  iso: string | null,
  nowMs: number = Date.now(),
): string {
  if (iso === null || typeof iso !== "string" || iso.length === 0) {
    return "未同期";
  }
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) {
    return "未同期";
  }
  const diffSec = Math.floor((nowMs - parsed) / 1000);
  if (diffSec < 0) {
    // 未来時刻 (= clock skew 等) → 「たった今」 で安全側
    return "たった今";
  }
  if (diffSec < 60) return "たった今";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} 分前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} 時間前`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return `${diffDay} 日前`;
  // YYYY/MM/DD format
  const d = new Date(parsed);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd}`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Access role label
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * accessRole → 表示用 badge label
 *
 * - owner: 「自分のカレンダー」
 * - writer: 「編集できる共有」
 * - reader: 「閲覧のみ共有」
 */
export function describeAccessRole(role: AccessRole): string {
  switch (role) {
    case "owner":
      return "自分のカレンダー";
    case "writer":
      return "編集できる共有";
    case "reader":
      return "閲覧のみ共有";
    default:
      return "不明";
  }
}

/**
 * primary か owner / writer なら default ON が想定 (= 親 Q2 採用案 c の logic 反映)
 * UI 上 「初期 ON」 表示 chip 判定に使う。
 */
export function isLikelyEnabledByDefault(role: AccessRole, isPrimary: boolean): boolean {
  if (isPrimary) return true;
  if (role === "owner" || role === "writer") return true;
  return false;
}
