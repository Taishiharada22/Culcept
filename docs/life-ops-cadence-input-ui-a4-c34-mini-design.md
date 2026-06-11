# Life Ops — A-4-c34 Cadence Input UI Mini-Design（staging gated・既存入口へ追加）

> 2026-06-11 / CEO・GPT GO。**禁止**: free text 系・production 表示/write/enable・R4・notification・external API・accept・push/PR/merge。

---

## 1. Audit（10 確認点への回答）

1. **c31 contract**: cadence input=`{sourceType,categoryId,menu?,lastCompletedAtISO?,typicalIntervalDays?}`・builder=last か interval の少なくとも一方+interval∈(0,730] 整数。
2. **typicalIntervalDays の現消費**: c26 normalizer が **drop（L-9 予約・未消費）**。collector は L-2 spec の interval のみ使用。→ 保存はされるが候補化に効かない（mini-design 明記・将来 L-9 で活きる）。
3. **interval-only → candidate?**: **ならない**（normalizer→lastCompleted null→phase unknown→candidate-engine skip）。→ GPT 指示どおり **UI は lastCompletedAt 必須**が正しい（体感が成立する）。
4. **lastCompletedAt あり → candidate?**: なる。ただし **L-2 spec がある組のみ**（spec なし category は unknown→候補なし）。→ **picker は `listMvpCadences()` 由来の 5 組に限定**（美容院カット 42d/カラー 56d/眉 28d/食料品 4d/日用品 14d・spec なし category を見せて「登録したのに何も起きない」混乱を構造的に排除）。
5. **occurrenceKey**: c32 形式（builder 自動生成）= `eyebrow:cadence`/`beauty_salon:cut:cadence`・`::` なし・now 不使用（既存 lock 済み）。
6. **duplicate guard**: 既存機構そのまま（cadence の occurrence は category+menu ごと定数→同じ周期の再登録=already_exists）。
7. **cleanup**: 既存 c33b script を **TYPE param 化**（deadline|cadence・既定 deadline）で拡張。
8. **deadline UI 共存**: 種類 switcher は client state を要する＝presentational 契約違反 → **同一 card 内に「期限」「周期」の 2 つの独立 form を縦に並べる**（JS 不要・390px は各 form flex-wrap）。
9. **390px**: 既存 wrap 方針継続（2 form は自然に縦積み）。
10. **production deny**: 新 flag なし（mainline gate ∧ LIFEOPS_STRUCTURED_SOURCE_WRITE の既存二重 gate に cadence も乗る）。

## 2. UI（最小・自由文ゼロ）
既存「生活まわりを登録」card 内: **期限 form（既存・不変）** + **周期 form（新規）**=
対象 select（5 組・value=`cadenceKey()` 形式の compound・label=辞書 label+menu 名「美容院（カット）」等）+ 前回やった日 `date`（**必須**）+
周期日数 `number`（任意・min1/max730）+ 登録。入力要素は select/date/number/hidden のみ（text/textarea 不存在 lock 継続）。

## 3. server action（既存 file 拡張・sourceType 分岐）
- cadence 分岐の client 値: sourceType=cadence・**cadenceOption（compound・lookup encoding=信頼せず split→c31 builder の辞書 roundtrip が実検証）**・
  lastCompletedAtISO（必須）・typicalIntervalDays（任意）。occurrence/user_id/id/confidence/status は引き続き読まない。
- **future date=invalid**: builder を `opts?: { nowMs }` で拡張（pure 維持・caller が now 注入）。cadence の lastCompleted > now → 新 reason `future_date`
  （validation の単一所在=builder を維持。deadline の dueDate は未来が正当のため対象外）。
- PRG: `/plan?lifeopsSrc=token&lifeopsSrcType=deadline|cadence`（**type も allowlist 検証**）→ card が type 別文言
  （duplicate=「同じ周期はすでに登録されています。」/invalid=「前回の日付を確認してください。」・deadline 側文言は不変）。

## 4. 変更ファイル
structured-write.ts（+picker helper+future_date+builder opts）／action（cadence 分岐+type 付き exit）／page（srcType 検証+prop）／
LifeOpsSourceInputCard（周期 form+type 別文言）／cleanup script（TYPE param）／tests 更新+新規／docs/log。c34b CEO smoke checklist は報告で提示。
