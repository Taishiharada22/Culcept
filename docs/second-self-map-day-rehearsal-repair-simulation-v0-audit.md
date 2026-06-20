# Day Rehearsal — What-if / Draft Preview v0（previewRepairSimulation）audit + mini-design

> 2026-06-08 / Build Unit / CEO 指示「候補を仮採用したら 1 日の見通しがどう変わるかを**予定変更なしで pure simulation**」
> 前提: Batch 4 別 UI NO-GO（preview.body は candidate-only・候補文と重複）。本 v0 は **rehearsal の実データを使う本格 simulation**（candidate-only でない）で、その NO-GO とは別物。

---

## 1. 目的
「候補文を見せる」→「その候補を**仮に採用したら** 1 日の見通しがどう変わるか」を、**予定を一切書き換えず** pure な counterfactual re-simulation で試算する土台。
full-path の raw feasibility（slack/shortfall）を使い、**数値を捏造せず**定性的 before/after を出す。

## 2. ★候補分類（実コード根拠・HARD GATE 準拠）
`generateDayRepairCandidates`（dayRepairCandidates.ts L86-137）の生成条件から、各 kind の simulatability を確定：

| kind | targetStepIndex | 生成条件（file:line） | 分類 | 根拠 |
|---|---|---|---|---|
| **leave_earlier** | i | `bufferStatus==="insufficient"`（L90） | ✅ **eases_conditionally** | 不足を「解消できれば」の counterfactual 再実行が可能。buffer_short 除去で convergence 緩和。magnitude 未確定ゆえ数値は出さない |
| **protect_buffer** | i | `convergenceSet.has(i)` ∧ 非 insufficient（L97） | ⚠️ **preserves** | convergence は strain+friction 由来（buffer 不足でない＝F1 の no-buffer ケース）→ 余白を守っても delta なし。保全のみ |
| **use_recovery_window** | i | `recoverySet.has(i)`（L119） | ⚠️ **preserves** | 一息は既に確保済（slack≥閾値）→ 守る＝現状維持・delta なし |
| **confirm_uncertain** | i | `bufferStatus==="not_applicable"`（L109） | ❌ **uncertain（不可）** | buffer 未確定 → sufficient/insufficient どちらにも捏造不可 |
| **reduce_density** | **null** | `density==="packed"`（L130・全体 1 件） | ❌ **ambiguous_target（不可）** | 対象 step なし・どの予定を軽くするか曖昧 |

→ CEO の例（余白不足が緩む / 一息を守れる / 未確定で不可 / 対象曖昧で不可）と完全一致。

## 3. counterfactual の検証（実エンジン repro・捏造でない証明）
6/8 packed 日（不足10分@0・不足40分@1・余白145分@2）で `bufferStatus→"sufficient"・slackMin/shortfallMin→null`（数値捏造なし）に変えて rehearseDay 再実行：
- **resolve#0**: step0 marker 消滅（buffer_short 除去 [buffer_short+strain_high] high→[strain_high] moderate）・outlook=breaks 維持（step1 が不足）。
- **resolve#1**: step1 factors [buffer_short+strain+friction]→[strain+friction]（buffer_short 解消）・outlook=breaks 維持（step0 が不足）。
- **resolve#0+#1**: outlook **breaks→tight**（全 insufficient 解消＝anyInsufficient false）。
→ ✅ buffer_short のみ除去・convergence 緩和・他に不足が残れば outlook 据置（過剰主張なし）・NaN/crash なし。slack=null ゆえ recovery は 0（保守的・恩恵を盛らない）。

## 4. 設計（pure layer・UI なし）
新 module `lib/plan/dayRehearsal/dayRepairSimulation.ts`：
```
previewRepairSimulation(input: RehearsalInput, candidate: DayRepairCandidate, config?) : RepairSimulationResult
```
- **leave_earlier**: before=rehearseDay(input)・after=rehearseDay(対象 transition を sufficient+null に置換した input)。対象 step の convergence level（before→after）と day outlook（before→after）を質的比較。
  - local 緩和（必ず・buffer_short 除去）+ day 緩和（**他に不足が残らない時のみ**）を別々に報告 → 「この区間は和らぐが 1 日全体はまだ…」と honest に。
- **protect_buffer / use_recovery_window**: preserves（diff=null）。「確保できている・守れれば保てそう」。改善を捏造しない。
- **confirm_uncertain**: uncertain（不可）。「未確定ゆえ試算できない」。
- **reduce_density**: ambiguous_target（不可）。「対象が曖昧ゆえ試算できない」。

型（internal の level/outlook は UI 非表示・summary のみ UI 候補）：
```
RepairSimulationStatus = "eases_conditionally" | "preserves" | "uncertain" | "ambiguous_target"
RepairSimulationDiff = { targetStepIndex, convergenceBefore/After: EstimateLevel|null, factorsResolved, localEased, outlookBefore/After: ViabilityOutlook, outlookEased }
RepairSimulationResult = { kind, status, simulatable, targetStepIndex, diff|null, summary, evidence }
```

## 5. HARD GATE 対応
| gate | 対応 |
|---|---|
| 対象 step が無いなら停止 | reduce_density（target null）→ ambiguous_target に分類（実行しない） |
| before/after を捏造するなら停止 | 実エンジン再実行のみ・preserves/不可 は diff=null（無理に出さない）・protect は「余白を守っても strain/friction は残る」を捏造改善にしない |
| 根拠なき数値改善を出すなら停止 | slack/shortfall を null に置換（数値を作らない）・summary は質的のみ・magnitude は unknown に明記 |
| pure simulation できない候補は不可分類 | confirm_uncertain=uncertain・reduce_density=ambiguous_target |
| UI に進む前に止める | 本 v0 は pure layer + test + closeout のみ。UI 配線は別判断 |

## 6. 禁止事項の遵守
実予定変更なし / apply なし / DB write なし / Google API なし / production・Vercel・GitHub・push・PR なし / 新 UI なし / tsc cleanup なし / Reality action なし。**全て pure 関数・READ のみ・Date 不使用**。

## 7. ethos
read-only 診断。生数値・level 名・confidence 数値を summary に出さない（diff の level/outlook は internal）。仮説トーン（〜そう/〜かもしれません）・条件付き（「解消できれば」）。evidence trace（known/unknown/inferred）必須。「未確定/曖昧」は正直に不可と言う。

## 8. 判定
**GO（safe）**: leave_earlier の counterfactual は実証済・捏造なし・保守的。他 kind は honest 分類。pure layer 実装に進む → test → tsc footprint 0 → closeout。**UI 配線は次判断**。
