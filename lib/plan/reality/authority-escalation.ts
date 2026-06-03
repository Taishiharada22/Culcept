/**
 * Reality Control OS — Authority Escalation（Slice 2F / INV-13）
 *
 * 「権限は獲得制」を保証する純粋 policy（live 実装前の契約）。
 * PRM の的中/採用/拒否/無視/undo から Secretary Authority Level を段階的に上下。
 *   - 一気に上がらない（最大 +1/signal）
 *   - 拒否/undo で revoke（下がる）
 *   - domain 別（移動/作業/食事… を独立管理）
 *
 * 制約: 純関数のみ。DB・PRM 永続化なし。
 */

export type AuthorityLevel = 0 | 1 | 2 | 3 | 4 | 5;

export type AuthoritySignal =
  | "accuracy_confirmed" // 予測が当たった
  | "adopted" // 提案採用
  | "rejected" // 拒否
  | "undone" // undo
  | "ignored"; // 無視

export const MAX_STEP_UP = 1; // 一気に上げない

function clampLevel(n: number): AuthorityLevel {
  return Math.max(0, Math.min(5, Math.round(n))) as AuthorityLevel;
}

/** 単一 domain の authority を 1 signal 分更新 */
export function updateAuthority(current: AuthorityLevel, signal: AuthoritySignal): AuthorityLevel {
  switch (signal) {
    case "accuracy_confirmed":
    case "adopted":
      return clampLevel(current + MAX_STEP_UP); // 段階的に獲得
    case "rejected":
    case "undone":
      return clampLevel(current - 2); // revoke（強め）
    case "ignored":
      return clampLevel(current - 1);
  }
}

export type DomainAuthority = Readonly<Record<string, AuthorityLevel>>;

/** domain 別 authority を更新（他 domain は不変） */
export function updateDomainAuthority(map: DomainAuthority, domain: string, signal: AuthoritySignal): DomainAuthority {
  const cur = map[domain] ?? 0;
  return { ...map, [domain]: updateAuthority(cur as AuthorityLevel, signal) };
}

/** 指定 Level の自動実行が許されるか（確認必須ドメインは別途 Permission Gate で阻止） */
export function autoAllowedAt(level: AuthorityLevel, requiredLevel: AuthorityLevel): boolean {
  return level >= requiredLevel;
}
