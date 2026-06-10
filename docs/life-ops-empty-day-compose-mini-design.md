# Life Ops × R2 — Empty-day / 3案 Compose Mini-Design（pure 層・本流セッション）

> 2026-06-10 / 本流（横 R2 統合）/ CEO 指示「Morning Briefing preview の前に empty-day compose / 3案統合の pure 層」。
> 前提: placement helper 完了（`4c234cdd`）。**訂正**: 前回の「本流/横R2統合 完了」は言い過ぎ — 正しくは「**配置 helper 完了・本線統合は未完**」。本 slice はその次の compose 層。
> **scope: pure compose まで**。UI/Morning Briefing 本線/Moment Trigger 本線/通知/外部 API/実データ源/DB/production/push/PR/merge 禁止。

---

## 0. 核心設計（前提を疑った結果）

**「3案に混ぜる」= 再レイアウトではなく、tier の柔軟容量への充当 + 正直な overflow**。
- 既存 `generateEmptyDay` は触らない（R2 本体の責務不変）。proposal/blocks は**同一参照で無改変**。
- lifeops は tier の **flexible capacity**（`open`・`buffer`・`light_task` block + 窓の未充填分）に入る。`focus_work`/`recovery` は tier の意図（集中・回復）なので**奪わない**。
  - 根拠: `light_task`=「軽い用事の時間」は意味的に lifeops そのもの。`open`/`buffer` は自由・余白＝生活タスクの自然な置き場。
- 容量が足りない場合は **honest overflow**（黙って詰め込まない・R2 block を削らない）。解消（block を削って割り込む等）は**ユーザー選択 or 将来 slice**。

## 1. Life Ops 候補は 3案のどこに入るか（**累積包含**）
| tier | 含む lane | 意味 |
|---|---|---|
| protect | **protect のみ** | 守る日でも期限・生活破綻防止だけは落とさない |
| easy | protect + easy | 楽な日は軽い補充・ついでまで |
| push | protect + easy + push | 攻める日は美容・未来価値まで全部 |
**deadline（protect lane）は 3 案すべてに現れる**（楽な日を選んでも税の期限は消えない）。partition（lane=tier のみ）にしない — 期限が tier 選択で消えるのは生活破綻防止に反する。

## 2. 既存 empty-day proposal との衝突処理
- 衝突の単位 = **window 内の分数容量**（placement は window 粒度・分単位の偽精密をしない）。
- tier×window の flexible 容量 = Σ(open/buffer/light_task block 分) + (窓長 − Σ全 block 分)。
- lifeops は urgency 順に flexible 容量を消費。**足りない分は overflow**（含むが「この案では収まらない」コード付き）。
- **R2 block は trim/削除しない**（無改変）。focus/recovery を deadline が奪うべきかは将来の対話（briefing が「押しの日でも税の手続きだけは時間を空けて」と言える素材を渡す）。

## 3. 候補が多すぎる時の上限
- placement の **cap 3 を維持**（compose で新 cap を足さない）。tier 包含で protect ⊆ easy ⊆ push と自然に件数が変わる。counts は summary で透明化。

## 4. unplaced 候補の扱い
- placement 段階の unplaced（cap_exceeded / no_window_fits）は **`alsoAvailable` としてそのまま透過**（PlacedLifeOpsCandidate 全保持）→ Morning Briefing が「他にも◯件」を言える。
- compose 段階の **overflow は別群**（lane 的には tier に属するが容量不足）— unplaced と混同しない。

## 5. Morning Briefing に渡す summary shape
```ts
LifeOpsDayComposeSummary = {
  date: string;
  perTier: { tier; fittingCount; overflowCount }[];  // 数のみ（redaction-trivial）
  alsoAvailableCount: number;
}
```
+ 詳細は `LifeOpsDayCompose` 本体（briefing presenter が非断定文言化＝L-8a 流儀・本 slice は構造のみ）。

## 6. Moment Trigger（R4）に渡すために保持する window 情報
- `PlacedLifeOpsCandidate.window`（startMinute/endMinute）を **fitting/overflow/alsoAvailable すべてで欠落させない**（R4 が窓接近で trigger 評価する素材）。dueReason/placeQuery/riskFlags も embedded のまま透過。

## 7. 既存 R2 の責務を壊さないか
- `generateEmptyDay` / `empty-day-reasoning` / proposal 構造 = **不変**（import して consume のみ・出力の proposal は同一参照で返す）。
- 追加の整合: placement wrapper に **`coarseMinutes`**（placement 時の粗い必要分）を additive 追加 — compose が placement と同じ見積りを使い、再計算ドリフトを防ぐ（外科的 1 field・既存 test 影響なし）。

## 実装
- `lib/plan/reality/lifeops/lifeops-empty-day-compose.ts`（pure）:
  `composeLifeOpsIntoDayProposals({ proposalSet, placement }) → LifeOpsDayCompose`
  - `composed: { tier, proposal(同一参照), lifeOps: { fitting[], overflow[] } }[]`（3 tier）
  - `recommended`（R2 の値を透過）・`alsoAvailable[]`・`summary`
- placement へ additive: `PlacedLifeOpsCandidate.coarseMinutes`。
- tests: 実 collector + 実 generateEmptyDay の chain（fake inputs/fixture WorldState）+ 容量エッジは手組み proposalSet fixture。

## stop
UI / Morning Briefing 本線 / Moment Trigger 本線 / 通知 / 外部 API / fetch / DB / 実データ源 / production / flag ON / push / PR / merge。
