# Life Ops — A-4-c39 Moment Read-only Surface Mini-Design（設計のみ・実装は別 GO）

> 2026-06-11 / CEO 設計 GO（縦監査②への応答・c19「Moment 不持込」決定の **CEO による明示的 reversal**）。
> **R4 trigger 本線ではない**（Life Ops Moment VM の read-only 表示解禁のみ）。staging/local gated・production deny・default OFF。

---

## 1. 核心の前提（実装が薄くて済む理由）

**Moment は既に計算されている**: mainline model（`computeLifeOpsMainlineModel`→`computeLifeOpsPreviewModel`）は full chain を回しており、
`model.dto.moment`（surfaced{label,kind,phrase,cautions}|null・silencedCount・suppression）が**毎 render 存在する**。
C39 は「計算の追加」ではなく「**表示の解禁**」＝page が moment を props に乗せ、小 card を 1 つ足すだけ。
従って以下が**自動で**乗る（実装不要・test で固定するのみ）:
- **focus/recovery 沈黙**（VM の suppression 判定→surfaced null）
- **Morning 代表との重複制御**（compute 内 excludeKeys・urgent-deadline 再提示政策 c6 込み）
- **最大 1 件**（VM の cap 1）
- sparse fallback 時の整合（recommended 空→moment null→card 不在）

## 2. 表示設計（「今の一枚」・最小）

- 配置: briefing card（生活まわり）の**直下**に独立小 card。**surfaced が null なら card ごと非表示**（沈黙時に空箱を見せない）。
- 内容: header「今の一枚」+ `surfaced.phrase`（label を内包する完成文「今なら「◯◯」を入れやすそうです」）+ cautions（あれば小さく）。
  **silencedCount/suppression/kind は本線に出さない**（internal・c23 原則）。footnote なし（briefing card 側にあり・重複させない）。
- **read-only 徹底**: button/form/link/onClick ゼロ（c16 の chip 表示すら置かない＝純表示）。
- **timer/polling なし**: server render 時点の snapshot（nowMinute=server now）。再評価は再訪/refresh 時のみ＝「開いた瞬間の一枚」。

## 3. gate（独立 kill switch）

新 dormant flag **`LIFEOPS_MAINLINE_MOMENT`**（`=== "true"`・default OFF）。表示条件 = **mainline gate（既存）∧ 本 flag ∧ surfaced 非 null**。
- briefing card と独立に殺せる粒度（c35 gate 規律）。production は mainline gate の deny で恒久不可視（本 flag 単独では何も開かない）。
- page が gate 判定し `lifeOpsMoment?: {phrase, cautions}` を props 渡し（label は phrase 内包のため個別搬出不要＝**搬出 field 最小化**）。

## 4. やらないこと（CEO 指定の再掲＋設計判断）
R4 trigger 本線/通知/background trigger/timer・polling/push/auto action/writer・server action 接続/production。
加えて: silenced 系 counts の本線表示なし・Moment への rail 付与なし（read-only が崩れるため**disabled chip も置かない**＝「押せそうで押せない」誤解の排除）。

## 5. test 計画
①default OFF（flag/props なし）→card 不在・PlanClient 差分なし ②production は mainline gate deny で不可視（re-lock）
③staging+両 flag ∧ surfaced → card 表示（phrase/cautions のみ）④surfaced null（focus 620 等）→ **card ごと不在**（沈黙維持）
⑤最大 1 件（DTO 単数形 lock）⑥button/form/link/onClick 0（render）⑦重複制御: moment phrase の label が代表 labels に不在（dto 整合）
⑧R4/writer/notification import 0（static）⑨BANNED_WORDS/FORBIDDEN ⑩既存 tab/proposals 不干渉。

## 6. 影響範囲
featureFlags(+1 dormant)・page（gated props 1 つ）・新 `LifeOpsMomentCard.tsx`（純表示・~40 行）・PlanClient（条件 render 1 箇所）・tests。
**compute/VM/gate helper/actions は不変更**。

## 7. C38 との関係
同一 model から独立に派生（briefing 富化と Moment 表示は互いに依存なし）。実装 commit は分離（CEO 指示）: C38→C39 の順。
