# Day Rehearsal Repair Candidate v1 — audit + closeout（target-aware / evidence-aware copy）

> 2026-06-07 / **read-only audit → pure copy 改修 → test → branch commit 完了。実機 smoke 前で停止（main 着地は smoke PASS 後 CEO 判断）。**
> branch `claude/dr-repair-v1`（HEAD `9e4b8d74`・base main `b521cbf2`）。前提: Repair v0 +「どうするとよさそう？」UI + What-if Preview v0 が main live。

---

## 0. 結論（先に）
- v1 = **候補の「文」だけを grounded に具体化**（UI は増やさない）。kind 判定 logic・evidence trace・型・preview は **完全不変**。COPY 3 文のみ改善。
- 改善は **kind の構造的意味に grounded した具体化** + **What-if preview の distinct value を candidate 文へ統合**（preview UI を出さず候補文を自己完結化）。
- ★**生数値・factor 差分は production で無根拠 → 使わない**（HARD GATE「根拠のない具体化」回避）。理由は §1 の audit 知見。

## 1. read-only audit（production path を rehearseDay でトレース）
production の唯一の配線は CalendarTab → `rehearseDay(buildRehearsalInputFromDisplay(...))`（**Option D = status-only**）。これに候補 logic を通すと：

| 信号 | Option D での実態 | 含意 |
|---|---|---|
| bufferStatus | sufficient / insufficient / not_applicable（display 由来・**信頼可**） | kind 判定の主軸はここだけ grounded |
| bufferMin | **常に null**（slackMin/shortfallMin が display に無い） | 分単位を candidate 文に出せない |
| friction | **一律 moderate**（travelMin=null・mode=unknown → frictionScore=0.5 固定） | `friction_high` 不発火 |
| recovery | **一律 low → recoveryWindows 常に空** | use_recovery_window は CalendarTab の **raw 由来 recoverySteps** 経由でのみ到達 |
| convergence.factors | buffer_short（insufficient 必須）/ strain_high のみ（friction_high 不発火） | factor 差分が production で出ない |

**★F1（重要）: protect_buffer は production（Option D）到達不能。** convergencePoint は `conv.level==="high"`（factors≥2）が条件。Option D で factors≥2 は `buffer_short`(=insufficient) + `strain_high` の組のみ（friction_high 不発火）。だが insufficient な step は `leave_earlier` 分岐に入るため、`else if (convergenceSet.has(i))` の protect_buffer に到達しない。→ protect_buffer は **full path（`buildRehearsalInput`・raw slack/transport あり）でのみ到達**（factors 例: strain_high + friction_high）。

**audit 6 問への回答**
1. candidate の evidence = `Evidence{basis,known,unknown,inferred}`（kind 毎に既存・coherent。内部 trace で UI 非表示）。
2. targetStepIndex の具体化利用 = **部分的**。値（数値 index）は UI に出ず anchor も無い → 「N 番目」は無根拠。安全なのは **kind が含意する構造（transition / gap / day-level）の明文化**のみ。
3. rehearsal.steps[idx] からの safe read = production では bufferStatus のみ。bufferMin/friction/recovery/factor は §1 表の通り degraded → **分・factor 差分は無根拠**。
4. 現状の generic 度 = 全 kind が固定 1 文（同 kind 複数でも同一文）。clarity/utilization は preview.body とほぼ同義（重複大）。
5. preview ↔ candidate 重複の統合 = **可能**。clarity（見通し）/ utilization（次に入りやすい）の distinct value を candidate 文に統合 → preview UI 不要で候補文が自己完結。
6. 根拠が弱い場合 = 分・factor を使わず kind 構造のみに grounded。protect_buffer は prod 不到達のため generic 維持（dead-path の factor 差分複雑化を避ける）。

## 2. v1 変更（COPY 3 文・logic 不変）
| kind | v0 | v1 | 根拠 |
|---|---|---|---|
| leave_earlier | ここは出発を少し早める余地があるかもしれません | **この移動の前後は、出発を少し早める余地があるかもしれません** | 必ず insufficient transition → 「移動」grounded |
| confirm_uncertain | 未確定の移動の余白を確認できると安心かもしれません | **未確定の移動の余白を確認できると、見通しが立てやすくなりそうです** | 必ず travel 未確定 transition。clarity preview value（見通し）統合 |
| use_recovery_window | ここで一息入れられそうです | **この一息つけそうな区間は、そのまま残せると、次の予定に入りやすそうです** | 必ず gap。utilization preview value（次に入りやすい）統合 |
| protect_buffer | この前後は余白を守ると、予定が重なりにくそうです | （据置） | Option D 不到達・full path のみ。CEO 例と一致 |
| reduce_density | 予定が立て込む区間を少し軽くできると、ゆとりが生まれそうです | （据置） | 予定変更に見えやすく弱め維持 |

- evidence trace / 型 / kind 判定 / prioritize / preview（`previewRepairEffect`）は **不変**（preview は CEO 指示で保持・inert）。

## 3. production 挙動の変化
- **表示文のみ変化**（DayOutlookBanner が `c.suggestion` を直接描画＝既存 UI に自然反映・**UI コード不変**）。
- 候補の **出る/出ない・件数・優先度・evidence** は不変。予定変更・repair 実行・保存・DB・最適化 **一切なし**。

## 4. 検証
- vitest: dayRehearsal dir + banner render contract **106 PASS**（既存 R1-R13/P1-P5 不変 + 新規 V1-V6: 移動 anchor / 見通し統合 / 次の予定統合 / reduce_density 弱め / 禁止語・生数値・命令なし / deterministic）。
- **tsc footprint 0**（自分の 3 ファイル起因 0）・total **55**（baseline 不変）。`--max-old-space-size=8192` 必須。
- render contract の leave_earlier リテラルを v1 に更新（fixture truthfulness・assertion 構造不変）。

## 5. HARD GATE 照合（全 PASS）
- targetStepIndex × timeline 対応に依存しない（「N 番目」を出さず kind 構造のみに grounded）→ 不確実性に乗らない。
- candidate 文が予定変更指示でない（suggestion トーン・実行語/削除語なし。V4 で「削除/やめ/減らし/外す/キャンセル」非含有を assert）。
- 根拠のない具体化でない（分/factor を使わず kind 構造に grounded）。
- UI 変更不要（banner は既存のまま `c.suggestion` 描画）。
- copy が命令/警告/診断でない（V5 で禁止語・生数値・内部名なしを再保証）。
- repair 実行に見えない（read-only・表示文のみ）。

## 6. 観測された follow-up（v1 では未対応・別判断）
- **同 kind の同一文重複**: production で insufficient transition が複数あると `leave_earlier` が複数生成され同一文が並びうる（prioritize top-3）。v1 は per-kind copy 品質が scope（CEO 例も per-kind）。dedup 方針（1 件に集約 / position 差分）は **別 slice の判断**（位置 anchor が UI に無いため安易な序数化は無根拠＝非推奨）。
- **rehearsal が display path 固定**: CalendarTab には raw feasibility（`calendarFeasibilityRawByTransitionIndex`）が既に有る（recoverySteps に使用）が、rehearsal 自体は display path → protect_buffer/bufferMin/friction が degraded。full path 化は **deferred な定量 what-if slice**（raw 露出 + re-simulation）の前提。v1 scope 外。

## 7. 次（smoke 前で停止）
- branch commit 済（`9e4b8d74`）。実機 smoke 観点を提示（§ 別途・report）。
- **main 着地は smoke PASS 後に CEO 判断**（squash・明示パス）。
