# Life Ops — A-4-c23 Mainline Minimal Card Mini-Design（staging gated・production deny 維持）

> 2026-06-11 / CEO・GPT GO。本線投入第一段だが **production enable ではない**（`LIFEOPS_MAINLINE` default OFF・staging first・
> production deny 解除は別 CEO gate）。**禁止**: Moment/3 案 summary 持込・accept 表示・R4・notification・push/PR/merge。

---

## 1. 接続位置と data flow（c19 案 C の実装）

```
/plan page（server）: planRouteLive+auth 通過後、isLifeOpsMainlineAllowed の時だけ
  → world 組立（real anchors+fixture context・preview と同型）→ gated reads（feedback obs）
  → feedbackCadence/realCadence/doneFeedback 合成 → computeLifeOpsPreviewModel
  → buildLifeOpsMainlineCardDto（headline+代表≤3+rail[accept 除外]・候補 0→null）
  → PlanClient へ flat props（lifeOpsCard / lifeOpsAction / lifeOpsActionResult / lifeOpsPendingDone）
PlanClient（client・最小変更）: card prop がある時だけ最上部に <LifeOpsMainlineCard/>（既存 tab/localStorage proposals 不干渉）
```
- gate OFF（default）→ page は何も計算せず props 不渡し → **card 不在・/plan 完全従来挙動**（server 負荷も 0）。
- PRG token は `/plan?lifeopsFb=`/`?lifeopsConfirm=`（PlanClient の calendar_* URL 掃除と非干渉）。

## 2. VM 範囲（本線最小）
`LifeOpsMainlineCardDto { headline, items: [{ label, phrase, candidateKey, actions: [{uiLabel, action, requiresConfirmation}] }] }`。
- preview DTO を持ち込まない（moment/tiers/integrationMeta/fixtureNotice を構造的に排除＝**raw count/internal flag/source 名は本線非表示**）。
- items = Morning 代表（rail 付き highlights）≤3。actions は **later/dismiss/done のみ**（builder が accept を filter・hold）。

## 3. server action 分離（pure 部品は共有）
新 `plan/_actions/lifeops-feedback-mainline.ts`（"use server"）。dev preview action は不変更。
共有: route/resolver/intent（c15/c17/c18）・confirm token・c9 writer・suppression（c22）・cadence merge（c14/c20）。
mainline 専用: ①gate=isLifeOpsMainlineAllowed（mainline∧planRouteLive∧staging∧!prod）②**accept 拒否 wrapper**
`routeLifeOpsMainlineActionRequest`（action ∉{later,dismiss,done}→invalid・偽造 accept POST も reject）③redirect 先 `/plan`。
client からは candidateKey+action+confirm の 3 値のみ（handle/category/menu/writer DTO 不送信）・server で候補再計算+intent 再構築。

## 4. 本線文言（preview 語の置換・NG=「preview 限定」「本線には反映されません」）
- footnote: 「※完了は実際に終わった時だけ。予定には追加せず、次回以降の提案調整に使います。」
- ok: 「記録しました。予定には追加しません（生活提案の学習にだけ使います）」
- ok_done: 「完了を記録しました。しばらくこの提案を控えます（予定には追加しません）」
- 確認 block: 「『◯◯』を完了として記録しますか？」「完了にすると、しばらくこの提案を控えます。予定には追加しません。」[記録する][戻る]
- done は c18 PRG 2 段階をそのまま（初回 write なし・confirm token 検証・stale 拒否・done 後は c22 suppression が効く・cleanup で戻る）。

## 5. mobile 390px
rail は `flex-wrap` + compact chip（text-[10px]/px-1.5）で折返し許容。render contract で wrap class を lock・実機確認は c23b（CEO staging 観測）。

## 6. test（GPT 18 lock の配置）
flag OFF/候補 0→card 不在・production gate（c19 既存）・≤3 件・rail 3 action/accept 不在・done 2 段階（route 既存 lock+mainline wrapper）・
handle/PII 非搬出・server 再計算（static）・done→suppression（builder+model 統合）・390px wrap class・既存 tab 不干渉（PlanClient 最小 diff+full suite）・
c19 dormant lock は「公認 consumer=page/_actions/mainline-card」に進化。

## 7. staging smoke 判断
CLI write smoke は**実施しない**（mainline action は operator session 必須・writer/DB 経路は c12/c13/c18 で実証済み・新規 DB コードなし）。
実 E2E は **c23b: CEO staging 観測**（/plan で card 表示→later or done 1 件→suppression→cleanup→復元・390px 込み）を別 checklist で。
