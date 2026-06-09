/**
 * Life Ops L-7 — カテゴリ別 Permission Layer（**pure・no-DB・no-UI・no-外部**・barrel 非 export）
 *
 * 設計: docs/life-ops-l7-permission-mini-design.md / boundary §2 L-7・§5 / Appendix A.4・A.5・A.8 / candidate-types
 *
 * 役割: `LifeOpsCandidate` を入力し「どこまで許可してよいか」を **pure に判定**して `PermissionAssessment` を返す。
 *   `permissionLevelHint`（非正本）+ `riskFlags` を**正式な許可判定へ昇格**する。後続 R2/UI/L-6 がこの結果を安全に参照する。
 *   **L4 入力補助・L5 自動実行は構造的に禁止（future-gated）**＝勝手に予約/購入/連絡/送信しないことを機械的に保証。
 *
 * 厳守:
 *   - pure・deterministic・**横エンジン非 import**・no-DB・no-UI・no-通知・no-外部・no-実データ・barrel 非 export。
 *   - 入力は `LifeOpsCandidate` のみ（self-contained）。実際の予約/購入/連絡導線(L-6)・UI(L-8)・横接続は**作らない**（判定だけ）。
 *   - 初期上限 = open_link(L3)。L4/L5 は常時 blocked（CEO 承認で将来開放・現在は不可能）。
 */

import type { LifeOpsCandidate } from "./candidate-types";
import type { LifeOpsDefaultMaxLevelHint, LifeOpsRiskFlag } from "./category-model";

/** 許可しうる action（A.5 L0–L5 に対応・rank で順序比較）。 */
export type LifeOpsAction = "observe" | "notify" | "suggest" | "open_link" | "assist_input" | "auto_execute";

const ACTION_RANK: Record<LifeOpsAction, number> = {
  observe: 0, // L0 記録のみ
  notify: 1, // L1 通知
  suggest: 2, // L2 候補提案
  open_link: 3, // L3 予約/購入ページへ誘導（入力しない）
  assist_input: 4, // L4 フォーム入力補助 ← future-gated
  auto_execute: 5, // L5 自動予約/購入/送信 ← future-gated
};

const HINT_TO_ACTION: Record<LifeOpsDefaultMaxLevelHint, LifeOpsAction> = {
  L0: "observe",
  L1: "notify",
  L2: "suggest",
  L3: "open_link",
  L4: "assist_input",
  L5: "auto_execute",
};

/** 初期上限（L4/L5 は出さない）。 */
const INITIAL_CEILING: LifeOpsAction = "open_link";

/** 常時 blocked（L4 入力補助・L5 自動実行＝future-gated）。 */
const FUTURE_GATED: readonly LifeOpsAction[] = ["assist_input", "auto_execute"];

/** A.4 + 医療: いずれか立てば「この内容で進めてよいですか」必須。 */
const CONFIRM_FLAGS: ReadonlySet<LifeOpsRiskFlag> = new Set<LifeOpsRiskFlag>([
  "first_visit",
  "high_cost",
  "cancellation_fee",
  "personal_info",
  "card_required",
  "nomination",
  "long_session",
  "far_location",
  "appearance_change",
  "health_sensitive",
]);

/** 許可判定の結果（pure・redacted reason 付き）。 */
export interface PermissionAssessment {
  readonly maxAllowedAction: LifeOpsAction;
  readonly requiresExplicitConfirmation: boolean;
  readonly blockedActions: readonly LifeOpsAction[];
  readonly reasonCodes: readonly string[];
}

/** rank の小さい方（より制限的）を返す。 */
function minAction(a: LifeOpsAction, b: LifeOpsAction): LifeOpsAction {
  return ACTION_RANK[a] <= ACTION_RANK[b] ? a : b;
}

/**
 * L-7: candidate → PermissionAssessment（pure・安全側）。
 *   hint を初期上限 open_link に cap → health_sensitive で suggest に更に cap → riskFlags で確認必須 →
 *   L4/L5 を常時 blocked。＝勝手に予約/購入/連絡/送信は構造的に不可能。
 */
export function assessLifeOpsPermission(candidate: LifeOpsCandidate): PermissionAssessment {
  const hintAction = HINT_TO_ACTION[candidate.permissionLevelHint];
  let ceiling = minAction(hintAction, INITIAL_CEILING); // L4/L5 hint → open_link
  const reasons: string[] = [];
  if (ACTION_RANK[hintAction] > ACTION_RANK[INITIAL_CEILING]) reasons.push("level4_5_future_gated");

  const risk = candidate.riskFlags;
  if (risk.includes("health_sensitive")) {
    ceiling = minAction(ceiling, "suggest"); // 医療は予約導線も出さない（候補止まり）
    reasons.push("medical_no_auto_suggest_cap");
  }

  const confirmFlags = risk.filter((f) => CONFIRM_FLAGS.has(f));
  const requiresExplicitConfirmation = confirmFlags.length > 0;
  if (requiresExplicitConfirmation) {
    reasons.push("confirmation_required");
    for (const f of confirmFlags) reasons.push(`risk_${f}`);
  }

  return {
    maxAllowedAction: ceiling,
    requiresExplicitConfirmation,
    blockedActions: FUTURE_GATED,
    reasonCodes: Array.from(new Set(reasons)),
  };
}

/** action が許可されるか（rank ≤ max ∧ blocked でない）。R2/UI/L-6 が参照する単一判定。 */
export function isActionAllowed(action: LifeOpsAction, assessment: PermissionAssessment): boolean {
  return ACTION_RANK[action] <= ACTION_RANK[assessment.maxAllowedAction] && !assessment.blockedActions.includes(action);
}
