# Life Ops L-7 — カテゴリ別 Permission Layer 正式化 mini-design【pure 実装可・UI/外部/横は停止】

> 2026-06-09 / Life Ops 縦トラック（branch `claude/life-ops-vertical`）
> 参照: boundary §2 L-7・§5 / Appendix A.4・A.5・A.8 / candidate-types(LifeOpsCandidate) / category-model(riskFlags/levelHint)。
> **CEO 指示**: `permissionLevelHint`+`riskFlags` を正式 Permission 判定へ昇格。自動予約/購入/送信を確実に抑止。pure 実装が安全なら実装まで。UI/通知/外部/実データ/横R2前は停止。横エンジン非 import 継続。

---

## 0. 一行
`LifeOpsCandidate` を入力し、**「どこまで許可してよいか」を pure に判定**した `PermissionAssessment`（maxAllowedAction / requiresExplicitConfirmation / blockedActions / reasonCodes）を返す。**L4 入力補助・L5 自動実行は構造的に禁止（future-gated）**。後続 R2/UI/L-6 が安全に参照する正本。

## 1. action 体系（A.5 L0–L5 を action 化・rank 付き）
| action | rank | A.5 | 意味 |
|---|---|---|---|
| observe | 0 | L0 | 記録のみ |
| notify | 1 | L1 | 時期通知 |
| suggest | 2 | L2 | 候補提案 |
| open_link | 3 | L3 | 予約/購入ページへ**誘導**（入力しない・外部ページを開くだけ） |
| assist_input | 4 | L4 | フォーム入力補助 ← **future-gated（常時 blocked）** |
| auto_execute | 5 | L5 | 自動予約/購入/送信 ← **future-gated（常時 blocked）** |

許可判定: `action が許可 ⟺ rank(action) ≤ rank(maxAllowedAction) ∧ action ∉ blockedActions`。

## 2. 型（実装 `lib/lifeops/permission.ts`・L-7 owned）
```ts
export type LifeOpsAction = "observe" | "notify" | "suggest" | "open_link" | "assist_input" | "auto_execute";
export interface PermissionAssessment {
  readonly maxAllowedAction: LifeOpsAction;            // 許可される最大 action（初期 ≤ open_link）
  readonly requiresExplicitConfirmation: boolean;      // 「この内容で進めてよいですか」必須
  readonly blockedActions: readonly LifeOpsAction[];   // 明示禁止（常時 assist_input/auto_execute）
  readonly reasonCodes: readonly string[];             // redacted 理由（debug/UI 説明用）
}
export function assessLifeOpsPermission(candidate: LifeOpsCandidate): PermissionAssessment;
export function isActionAllowed(action: LifeOpsAction, a: PermissionAssessment): boolean;
```
入力は `LifeOpsCandidate` のみ（`permissionLevelHint`+`riskFlags` を参照・**self-contained**・category-model 不要・横非 import）。

## 3. 判定ロジック（安全側・pure）
```
INITIAL_CEILING = open_link (L3)          // 初期上限（L4/L5 は出さない）
FUTURE_GATED   = [assist_input, auto_execute]  // 常時 blocked

hintAction = hintToAction(candidate.permissionLevelHint)   // L0..L5 → action
ceiling = min(hintAction, INITIAL_CEILING)                 // L4/L5 hint → open_link に cap
reasons = []
if rank(hintAction) > rank(INITIAL_CEILING): reasons += "level4_5_future_gated"

// risk による cap（医療は予約導線も出さない）
if "health_sensitive" ∈ risk: ceiling = min(ceiling, suggest); reasons += "medical_no_auto_suggest_cap"

// 確認必須（A.4）
CONFIRM_FLAGS = {first_visit, high_cost, cancellation_fee, personal_info, card_required,
                 nomination, long_session, far_location, appearance_change, health_sensitive}
requiresConfirm = risk ∩ CONFIRM_FLAGS ≠ ∅
if requiresConfirm: reasons += "confirmation_required"
reasons += ("risk_" + f) for f ∈ (risk ∩ CONFIRM_FLAGS)   // 何が確認理由か（redacted）

blocked = FUTURE_GATED        // 常に L4/L5 禁止
return { maxAllowedAction: ceiling, requiresExplicitConfirmation: requiresConfirm, blockedActions: blocked, reasonCodes: dedupe(reasons) }
```

## 4. カテゴリ別の帰結（L-1 hint × riskFlags の結果・例）
| カテゴリ | hint | risk | maxAllowed | confirm | 備考 |
|---|---|---|---|---|---|
| 美容院 | L3 | appearance_change/nomination/personal_info | open_link | ✅ | 予約導線まで・確認必須・自動禁止 |
| 脱毛 | L3 | high_cost/cancellation_fee/card_required/personal_info | open_link | ✅ | 金銭リスク・確認必須・自動禁止 |
| 歯医者/眼科 | L2 | personal_info/**health_sensitive** | suggest | ✅ | **予約導線出さない**(医療)・候補止まり |
| 健診/薬 | L1 | **health_sensitive** | notify | ✅ | 通知のみ・医療 |
| 買い物 | L2 | （なし） | suggest | — | 候補提案のみ |
| 事務(免許/税) | L1 | （なし） | notify | — | 通知のみ・自動禁止 |
| 準備(服/資料) | L1 | （なし） | notify | — | リマインドのみ |
- **全カテゴリ共通**: blockedActions=[assist_input, auto_execute]・maxAllowedAction ≤ open_link。medical/admin/relationship は hint が低く + auto 構造禁止で**自動実行不可**。

## 5. 厳守 / 非スコープ
- pure・deterministic・**横エンジン非 import**・no-DB・no-UI・no 通知・no 外部・no 実データ・barrel 非 export。
- **非スコープ**: 実際の予約/購入/連絡導線(L-6)・UI 表示(L-8)・横 R2/R4 接続・実データ源・新規収集。L-7 は**判定結果を返すだけ**。
- L4/L5 は **future-gated**（CEO 承認で将来開放・現在は構造的に不可能）。

## 6. テスト（`tests/unit/lifeops/lifeOpsPermission.test.ts`）
- **「勝手にやらない」を固定**: 全 20 カテゴリで auto_execute ∈ blockedActions・maxAllowedAction ≠ auto_execute/assist_input・isActionAllowed(auto_execute)=false。
- 医療(health_sensitive)→ max ≤ suggest・confirm=true。admin/準備→ notify。買い物→ suggest・confirm=false。
- 美容→ open_link・confirm=true（appearance_change）。脱毛→ confirm=true（金銭 risk）。
- hint L4/L5 を仮に与えても open_link に cap・reasonCode level4_5_future_gated。
- isActionAllowed の境界（≤max ∧ ∉blocked）。reasonCodes に確認理由が載る。pure（同入力同出力）。

## 7. 停止
L-7 着地後、**L-8 UI / L-6 外部実行 / 横R2接続 / 実データ** に入る前は CEO 指示の流れ（L-8 計画→精査→合格なら実装…）に従う。本 slice は判定 pure のみ。
