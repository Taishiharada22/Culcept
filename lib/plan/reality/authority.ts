/**
 * Reality Control OS — 予定の権限モデル（Origin / Authority / Flexibility / ProtectionReason）
 *
 * 親設計: docs/aneurasync-live-plan-controller-golden-scenarios.md Part A-3
 *
 * 既存予定の尊重を hard/soft の 2 値でなく 4 軸で判定する純関数群。
 * 既存コードに素地あり（ExternalAnchor.rigidity, DraftPlanItem.origin）。
 *
 *   origin            = 誰が作ったか（履歴として保持）
 *   authority         = 所有・確定度
 *   flexibility       = Repair/Optimize が触ってよい度合い
 *   protectionReasons = 守る理由（複合可。AI 生成でも承認・回復核化で守るべき予定へ昇格）
 *
 * 複合理由（GPT 監査）: 1 つの予定が複数理由で守られうる。
 *   例: 承認された AI 散歩 = recovery_core ∧ cascade_guard。
 *   → protectionReasons は配列、優先順位 PROTECTION_PRIORITY 付き。
 *
 * 関連 Invariant:
 *   INV-5  自動実行の境界（他人/予約/支払い/hard は確認必須）
 *   INV-7  既存予定の尊重（Repair は flexibility 順、hard を無断で動かさない）
 *   INV-18 既存予定を土台に
 *   INV-23 Source Traceability（tentative は push せず確認/on-open）
 *
 * 制約: 純関数のみ。I/O・DB なし（additive / reversible / test-first）。
 */

export type PlanItemOrigin = "user" | "imported" | "alter_generated";

export type PlanItemAuthority = "user_owned" | "import_locked" | "proposed";

export type PlanItemFlexibility = "locked" | "movable" | "shortenable" | "droppable";

export type ProtectionReason =
  | "hard_external" // 他人/予約/支払い/外部固定（最強・確認必須）
  | "user_declared" // 本人が「守る」と宣言
  | "recovery_core" // その人固有の回復核（食事/睡眠/移動余白/夜の自由 等）
  | "cascade_guard" // これを動かすと後続が連鎖破綻するため保護
  | "tentative"; // 未承認・根拠薄（守る対象でない）

/** protectionReason の強さ（大きいほど強い保護）。複合時の代表選択・比較に使う。 */
export const PROTECTION_PRIORITY: Record<ProtectionReason, number> = {
  hard_external: 4,
  user_declared: 3,
  recovery_core: 2,
  cascade_guard: 1,
  tentative: 0,
};

export interface PlanItemGovernance {
  readonly origin: PlanItemOrigin;
  readonly authority: PlanItemAuthority;
  readonly flexibility: PlanItemFlexibility;
  /** 守る理由（複合可）。空配列は tentative と同義に扱う。 */
  readonly protectionReasons: readonly ProtectionReason[];
}

/** Repair が触る順（小さいほど先に触ってよい）: droppable → shortenable → movable → locked */
const FLEXIBILITY_RANK: Record<PlanItemFlexibility, number> = {
  droppable: 0,
  shortenable: 1,
  movable: 2,
  locked: 3,
};

export function flexibilityRank(f: PlanItemFlexibility): number {
  return FLEXIBILITY_RANK[f];
}

/** 指定の保護理由を持つか */
export function hasProtection(g: PlanItemGovernance, reason: ProtectionReason): boolean {
  return g.protectionReasons.includes(reason);
}

/** 複合理由のうち最も強い理由を返す（空なら tentative） */
export function primaryProtectionReason(g: PlanItemGovernance): ProtectionReason {
  if (g.protectionReasons.length === 0) return "tentative";
  return g.protectionReasons.reduce((best, r) =>
    PROTECTION_PRIORITY[r] > PROTECTION_PRIORITY[best] ? r : best
  );
}

/**
 * tentative か（INV-23）。
 * tentative は push せず on-open/確認へ降格すべき提案。
 * = AI 未承認(proposed)、または tentative 以外の保護理由を 1 つも持たない。
 */
export function isTentative(g: PlanItemGovernance): boolean {
  return g.authority === "proposed" || !g.protectionReasons.some((r) => r !== "tentative");
}

/** 守るべき予定か（tentative 以外の保護理由を 1 つ以上持つ） */
export function isProtected(g: PlanItemGovernance): boolean {
  return g.protectionReasons.some((r) => r !== "tentative");
}

/**
 * 動かしてはいけない（INV-5 / INV-7）。
 *   - user_owned ∧ locked
 *   - import_locked（外部カレンダー由来）
 *   - protectionReasons に hard_external（他人/予約/支払い）
 * 注: proposed（AI 未承認提案）は locked でも「提案」にすぎないので immovable ではない。
 */
export function isImmovable(g: PlanItemGovernance): boolean {
  if (g.authority === "import_locked") return true;
  if (hasProtection(g, "hard_external")) return true;
  if (g.flexibility === "locked" && g.authority === "user_owned") return true;
  return false;
}

/** Repair/Optimize が（提案として）触れてよいか（immovable でない） */
export function isRepairTouchable(g: PlanItemGovernance): boolean {
  return !isImmovable(g);
}

/**
 * Repair が触る順に並べ替える（flexibility 昇順）。
 * droppable を先に、locked を最後に検討する（INV-7）。安定ソート・非破壊。
 */
export function repairTouchOrder<T extends { readonly governance: PlanItemGovernance }>(
  items: readonly T[]
): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const r =
        flexibilityRank(a.item.governance.flexibility) - flexibilityRank(b.item.governance.flexibility);
      return r !== 0 ? r : a.index - b.index;
    })
    .map((x) => x.item);
}

/**
 * AI 生成提案を user が承認した時の昇格（Part A-3）。
 *   - origin は履歴として保持（alter_generated のまま）。
 *   - authority → user_owned。
 *   - protectionReasons: tentative を除去し、空になれば user_declared を付与。
 *     asRecoveryCore 指定時は recovery_core を追加（複合可）。
 */
export function promoteOnUserAdoption(
  g: PlanItemGovernance,
  opts?: { readonly asRecoveryCore?: boolean }
): PlanItemGovernance {
  const kept = g.protectionReasons.filter((r) => r !== "tentative");
  const next = new Set<ProtectionReason>(kept);
  if (opts?.asRecoveryCore) next.add("recovery_core");
  if (next.size === 0) next.add("user_declared");
  // 優先度降順で安定化
  const protectionReasons = [...next].sort(
    (a, b) => PROTECTION_PRIORITY[b] - PROTECTION_PRIORITY[a]
  );
  return { ...g, authority: "user_owned", protectionReasons };
}
