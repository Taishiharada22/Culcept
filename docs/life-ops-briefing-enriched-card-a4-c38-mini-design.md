# Life Ops — A-4-c38 Briefing-Enriched Mainline Card Mini-Design（設計のみ・実装は別 GO）

> 2026-06-11 / CEO 設計 GO（縦監査①「Morning Briefing 完成形」への応答・c23「minimal card」方針の更新）。
> staging/local gated のみ・production deny 維持・default OFF 維持。

---

## 1. 目的と情報設計（重くしない）

現 card（headline+代表 ≤3+rail）に **briefing VM の残り要素を「ユーザー価値のある分だけ」**持ち込む:

| 要素 | 持込 | 理由 |
|---|---|---|
| headline | 既存 | — |
| Morning 代表 ≤3 + rail | 既存 | — |
| **cautions（≤2）** | **追加** | L-8a 由来の固定句（「予約時に指名を聞かれることがあります」等）＝行動前に知ると安心な注意。非指示形 |
| **moreLine（最大 1 行）** | **追加** | 「ほかにも候補が◯件」系＝全部見せずに存在だけ伝える低圧の窓 |
| 3 案 summary（守る/楽/攻め 行） | **持ち込まない** | tier 概念は R2「日の提案体験」のものdes。/plan にその体験が無い状態で tier 行だけ出すと文脈のない情報量になる（CEO「必要なら」への設計判断・将来 R2 体験が本線に来た時に再訪） |

**情報量上限を構造で固定**: cautions は VM が ≤2 を保証・moreLine は最大 1 行・card 総行数 ≈ headline 1 + 代表 3 + cautions 2 + more 1 + footnote 1 ≤ 8 行。

## 2. moreLine の選定規則（1 行に統一）

briefing VM には「ほかにも」が 2 系統ある（tier の overflowLine=「この案では入りきらない候補が◯件」／alsoAvailableLine=「ほかにも候補が◯件」）。

**★実測補正（実装時に判明）**: 当初は「rail tier の overflow 優先」としたが、**rail tier（=Morning 代表が収まる tier・通常 protect）は溢れないため overflow が null**（probe 実測: protect=null / easy=1件 / push=2件）。
代表が出ている tier の溢れに固執せず、「**ユーザーがまだ見ていない候補がある**」ことを 1 行で伝えるのが目的に整合。

補正後の規則:
- ①**alsoAvailableLine 最優先**（最も中立な総量表現「ほかにも候補が◯件」）
- ②無ければ overflow を持つ tier の**最大件数 1 行**（複数 tier の溢れを 1 行に集約）
- ③どちらも null → 非表示。sparse fallback 時は両方 null になりやすく自動で minimal 維持。

## 3. DTO / builder / render 変更（実装時）

- `LifeOpsMainlineCardDto` += `cautions: readonly string[]`・`moreLine: string | null`（**counts/tier 名/internal flag は不搬出**のまま）。
- builder: `model.dto.briefing.cautions` をそのまま・moreLine は §2 規則で選定。**既存 field/挙動は不変**（候補 0→null・fallback 低圧・accept hold 全て維持）。
- card render: items の下に cautions（小さな gray bullet・≤2）→ moreLine（1 行）→ 既存 footnote。390px は縦積みで自然（wrap 既存）。

## 4. 文言安全
cautions/moreLine は全て**辞書/L-8a/VM 固定句由来**（自由文経路なし・preview の BANNED_WORDS/FORBIDDEN lock を通過済みの文字列集合）。
本線 render にも同 lock を追加。「やるべき/必ず/今すぐ」系ゼロ・「〜と安心です/〜そうです」系のみ。

## 5. test 計画
①default OFF 差分なし（props 不渡し・既存）②production flag ON でも非表示（既存 gate re-lock）③staging gate ON で cautions/moreLine 表示
④3 案 summary 不在（DTO に tiers/tierLabel key が無い lock）⑤cautions ≤2・moreLine ≤1（情報量 lock）⑥BANNED_WORDS/FORBIDDEN/PII 非搬出
⑦既存 tab/proposals 不干渉（既存 static）⑧c25 staging JSON 等価 lock の更新（新 field 込みで再固定）⑨fallback 時は cautions/moreLine が自然に空。

## 6. 影響範囲
`lifeops-mainline-card.ts`（DTO+builder）・`LifeOpsMainlineCard.tsx`（render 2 要素）・tests。**page/actions/compute/gate は不変更**（データは既に DTO にある）。
