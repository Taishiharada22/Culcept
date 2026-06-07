# Day Rehearsal Batch 4 — What-if Preview UI 再 audit（audit-first・GO/NO-GO）

> 2026-06-08 / Build Unit / CEO 指示「audit-first・safe なら実装/危険なら停止報告」
> 手法: deep research workflow（4 視点 understand + adversarial critique）+ 自己独立検証。
> 関連: `…-whatif-ui-mini-design.md`（過去 hold）/ `…-whatif-v0-closeout.md`（pure layer）/ `…-repair-v1-audit-closeout.md`（v1 が preview value を suggestion に統合）。

---

## 結論：**NO-GO**（separate What-if Preview UI は実装しない）
HARD GATE「preview が候補文とほぼ重複するなら停止」に**明確に抵触**。4 視点 + adversarial 批判が全会一致（critique `goJustified=false`）。私の事前独立分析（v1 が重複を悪化させた）と一致。

## 根拠（実コード）
1. **候補文↔preview の重複は高く、v1 でむしろ悪化**:
   - confirm_uncertain: 重複 **>90%**（差は「の移動」vs「の部分」のみ）。protect_buffer / use_recovery_window: **>75%**。平均 ~67-72%。
   - ★`dayRepairCandidates.ts` L18-19 コメント: Repair v1 が **「clarity=見通し / utilization=次に入りやすい」という preview の distinct value を candidate.suggestion に統合**。→ preview.body は今や **候補文の言い替え（冗長）**。過去 hold（2026-06-07「重複大」）の根本原因は解決されず、むしろ candidate 側が preview の価値を吸収済。
2. **full-path activation は preview 価値を増やしていない**:
   - `previewRepairEffect(candidate)` は **candidate-only**（rehearsal / feasibility / travel の定量データに一切アクセスしない・`dayRepairPreview.ts` L81）。full-path の豊富なデータは **candidate 生成**に使われ、preview には流れない。
   - → preview は full-path の恩恵ゼロ・定性のまま・cosmetic（言い替え）。CEO 点5 の答え=**NO**。意味ある定性 preview には定量 re-simulation が要るが、それは生数値露出 + 予定変更モデリング接近で別 gate（危険）。
3. **preview 層は production で inert**（UI 未配線・test のみ・`DayOutlookBanner` は `c.suggestion` のみ描画）。
4. **唯一の非冗長フィールド `uncertainty[]` も marginal**: generic（「度合い未確定」）・suggestion と論理矛盾しうる（「守りやすく」なのに「どのくらいかは未確定」）・出すには **3 段目の nested disclosure** が必要 → 価値 < UI コスト（HARD GATE「UI が重くなる」）。

## CEO 7 点への回答
1. 候補文の下に preview を出す価値があるか → **薄い**（言い替え・重複）。
2. 「もしやるなら？」が情報過多にならないか → **なる**（3 段 nesting・tap 増・mobile 負荷）。
3. confidence / raw evidence / 生数値を出さない → 守れる（が、それは preview が inert ゆえ）。
4. read-only のまま apply/save に見えない → 現状守れている（追加すると preview 下に actionable を足したくなる誘惑が gate リスク）。
5. full-path 情報で定性 preview に意味があるか → **NO**（preview は candidate-only・full-path 未利用）。
6. reduce_density は preview なし or 弱めでよいか → **弱め維持で良い**（candidate「ゆとりが生まれそう」で既に控えめ・preview 追加価値なし）。
7. marker / banner / なぜ? / どうするとよさそう? を壊さない → 現状非破壊（追加しないので安全）。

## HARD GATE 判定
| gate | 結果 |
|---|---|
| preview が候補文とほぼ重複 | ★**抵触**（NO-GO 決定打） |
| UI が重くなる | 抵触（3 段 nesting） |
| apply/save/実行に見える | 現状回避・追加で誘惑リスク |
| raw evidence/confidence/数値が出る | 現状回避 |
| layout が崩れる | 現状回避 |

## ★重要な気づき（最小化でなく正しい結論）
**What-if の「価値」は既に live で届いている** — Repair v1 が preview の distinct value（見通し/次に入りやすい）を candidate.suggestion に統合済。ユーザーは候補文を読むだけで「もしやったらどうなるか」を既に得ている。**別 preview UI は redundant**。
→ Batch 4 を「別 preview UI を作る」と解釈すると NO-GO だが、**Batch 4 の狙い（what-if 体験）は v1 で実質達成済**。これは plan を蔑ろにした最小化ではなく、audit で「既に達成済 + 追加は冗長」と実証した結果。

## 対応（NO-GO 後）
- **preview v0 pure layer は削除せず資産として保持**（clean・test 済・将来の定量 re-simulation 版の土台）。
- 将来 reconsider する条件: **定量 re-simulation**（preview が rehearsal の実データを使い「余白が方向として増えそう」等の **新情報** を出せる）が安全に成立するとき。それ自体が gate（数値露出・予定変更接近）なので慎重に。
- 唯一の最小代替（uncertainty 主体の lean disclosure）も価値 marginal ゆえ**非推奨**。

## Day Rehearsal 診断層ロードマップ（原典 §2）の状態
- Batch 1 full-path 精度 … ✅ 完了（activation 済）
- Batch 2 InnerWeather energy … ✅ 完了（activation 済）
- Batch 3 marker 精緻化（F1 factor 別見出し） … ✅ 完了
- Batch 4 What-if Preview UI … ★**audited NO-GO**（value は v1 で達成済・別 UI は冗長）
→ **診断層ロードマップは実質完了**。残るは実データ後の calibration（backlog・gated）。

## 監査メタ
- workflow `wf_9cdd403a-220`（6 agents・~399k tokens）。synthesis agent が StructuredOutput 未呼出で fail → understand 4 + critique を journal から回収し、本統合は手動（鵜呑み回避と整合）。
- read-only audit・コード非変更・production/Vercel/GitHub/DB/env/Reality 不接触。
