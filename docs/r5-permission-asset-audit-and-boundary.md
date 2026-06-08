# R5 Permission / Intervention Gate — 資産監査 + 境界（R5-0・read-only）

> 2026-06-09 / Build Unit / CEO 承認「R5-0〜R5-3 pure/no-apply 自律。R5-4 実介入/apply/plan write/notification/production は stop gate」。
> 前提: R1〜R4 完了。**read-only**。R5-1〜R5-3 は「実介入でなく許可判定と ChangeSet 候補化の pure 層」。

## 0. 結論（前提の検証）
- **Permission Level 0–5 は不在** → R5 新規（CEO 指示通り **R5 内部 pure contract** として定義・canonical 正本化は後続 gate）。
- **authority.ts（per-item governance）と change-set.ts（ChangeSet 構造+undo）は既存 pure** → **consume**（再実装/apply しない）。
- **apply 関数（実 plan write）は change-set.ts に無い**（pure 構造のみ）→ 実 apply は別所・**stop gate**。

## 1. consume できる既存資産（再実装しない）
| 資産 | 正本 / ファイル | R5 の利用 |
|---|---|---|
| per-item governance | `PlanItemGovernance`{origin,authority,flexibility,protectionReasons}・`isImmovable`/`isProtected`/`isRepairTouchable`/`flexibilityRank`・`ProtectionReason`(hard_external/user_declared/recovery_core/cascade_guard/tentative) `lib/plan/reality/authority.ts` | gate が「触ってよい item か」判定に consume |
| ChangeSet 構造 | `ChangeSet`/`ChangeOp`/`PlanItemSnapshot`・`changeSetRequiresConfirmation`・`invertChangeSet`/`validateUndoability` `lib/plan/reality/change-set.ts` | R5-2 draft が **ChangeSet 型を consume**（apply しない・undo 可逆性を継承） |

## 2. R5 が新規に作る（pure・R5 内部）
- **Permission Level 0–5 model**（自律度勾配 + capability）・risk category + action kind + required confirmation。
- **proposal → ChangeSet draft mapper**（R2/R4 出力 → ChangeSet 候補・**apply しない**・PlanCandidate 正本型作らない）。
- **permission gate evaluation**（level + risk + context + authority → allowed/confirm_required/blocked/insufficient_context・redacted reason）。

## 3. 境界（不可侵・stop gate）
- 🚫 **触らない**: authority/change-set の再実装・MAP/Plan 本体正本・PlanClient。
- 🚫 **stop gate（R5-4 以降・CEO 承認必須）**: 実 ChangeSet apply / 実 plan write / PlanClient 接続 / route・API / DB write / notification 配送 / native / production・Vercel・deploy・remote・PR / execution / user-facing 公開 / REALITY_ALTER_BRIDGE_LIVE enable / PlanCandidate・LifeOpsCandidate 正本型作成。

## 4. R5 設計原則（CEO 確定）
1. Permission Level は **R5 内部 pure contract**（canonical 正本化は後続合流 gate）。
2. ChangeSet mapping は **draft/candidate conversion** に留める（apply しない・plan item 書かない）。
3. permission gate は **pure 判定のみ**（allowed/confirm_required/blocked/insufficient_context）。
4. **高リスクは必ず confirm_required/blocked**: 初回店舗/高額/個人情報/連絡送信/予約確定/購入/長距離移動/他人を巻き込む予定。
5. R2/R4 の提案は「現実を動かす命令」でなく **R5 gate に渡す候補**にすぎない。

## 5. scope: R5-1 Level model / R5-2 ChangeSet draft mapper / R5-3 gate evaluation（全 pure・no-apply）
