# Life Ops — A-4-c21 Real-Cadence Operator Observation Run（CEO 実行・done 1 件のみ・cleanup 込み）

> 2026-06-11 / CEO・GPT GO。**Claude は UI 操作を実行しない**（operator login の credential を扱わない原則・c17b/c18b と同様）。
> 追加実装なし（本書 + smoke command 整理のみ）。**禁止**: 2 件以上の write・accept/later/dismiss の追加操作・production write・
> PlanClient・R4・notification・external API・UI 本線・push/PR/merge。

---

## 0. ★実行前に知っておくこと（期待値の補正・重要）

**rail（押せる Morning 代表 3 件）は現 fixture では deadline 候補（確定申告/免許の更新/パスポートの更新）で占有されます。**
cadence 抑制（done→候補が静かに消える）が効くのは **cycle 候補（美容院/食料品など）だけ**で、deadline 候補は
deadlineObservations 由来のため done を打っても**消えません**。

- → step 7 の正しい期待値: **「変化なし」が現仕様の正解**。counts（realCadence=1）はパイプライン貫通の証明として成立。
- → この run の主要な観測価値は ①loop 全体の counts 貫通 ②done 確認 UI の体感 ③**製品 finding の体験**:
  「確定申告を完了したのに代表に残り続ける」違和感を CEO が実際に感じるか（= deadline 完了消費 slice の必要性判断材料）。
- cycle 候補の「消える体感」は、fixture 調整 or deadline 完了消費の実装後（c22 候補）に改めて観測する。

## 1. 手順（A→G・repo root で実行）

**A. before counts（read-only）** — 期待: total=0 / lifeops=0 / observations=0 / feedbackCadence=0 / realCadence=0。≠0 なら停止:
```bash
LIFEOPS_FEEDBACK_SMOKE_GO=1 LIFEOPS_REALDATA_READONLY=true LIFEOPS_FEEDBACK_READONLY=true \
LIFEOPS_CADENCE_READONLY=true NODE_OPTIONS="--conditions=react-server" npx tsx scripts/lifeops-feedback-readonly-smoke.ts
```

**B. dev server を flags ON で起動**（端末セッション限定・.env.local 不変更）:
```bash
REALITY_CANDIDATE_ACTIONS_DEV_HOST=true REALITY_PIPELINE_PREVIEW=true \
LIFEOPS_REALDATA_READONLY=true LIFEOPS_FEEDBACK_READONLY=true LIFEOPS_CADENCE_READONLY=true \
LIFEOPS_FEEDBACK_WRITE=true npm run dev
```

**C. UI: done を 1 回だけ**
1. `http://localhost:3000/plan/dev-reality-pipeline` を開き **STAGING_USER_A（…42d0）でログイン**
2. Morning 代表の rail を確認（採用/完了※/後で/不要）→ **1 候補の「完了※」→ 確認表示 → 「記録する」**（押した候補 label をメモ）
3. 結果表示「完了を記録しました（次回の提案周期に影響します。preview 限定・本線には反映されません）」を確認
4. **体感メモ**（短文で）: 確認 UI は重すぎないか／「完了」の意味は明確か／文言はうるさくないか

**D. after-write counts** — A と同じコマンド。期待: lifeops=1 / observations=1 / **feedbackCadence=1 / realCadence=1**。

**E. rerender 観測** — preview を refresh し、done した候補の見え方を観測:
- 期待（§0）: deadline 候補なら**変化なし**。「完了したのに残っている」ことへの違和感の有無を体感メモ。
- 「この件の提案はしばらく控えます」系の説明が必要と感じるか。
- （任意）ブラウザ幅を **390px** に縮めて rail/確認 block が崩れないか確認。

**F. exact cleanup（check → confirm 二段）**:
```bash
# 1) check（削除しない・対象 1 件と handle を確認）
LIFEOPS_DOGFOOD_CLEANUP_GO=1 LIFEOPS_DOGFOOD_CLEANUP_ACTION=done \
NODE_OPTIONS="--conditions=react-server" npx tsx scripts/lifeops-feedback-dogfood-cleanup.ts
# 2) 対象 1 件なら削除
LIFEOPS_DOGFOOD_CLEANUP_GO=1 LIFEOPS_DOGFOOD_CLEANUP_CONFIRM=1 LIFEOPS_DOGFOOD_CLEANUP_ACTION=done \
NODE_OPTIONS="--conditions=react-server" npx tsx scripts/lifeops-feedback-dogfood-cleanup.ts
```
（exact: owner-RLS ∧ lifeops:% ∧ source_kind='lifeops' ∧ action='done' ∧ acted_at≥now-6h・対象 0 件/2 件以上なら削除せず停止）

**G. after cleanup** — A を再実行。期待: 全て 0。dev server 停止（Ctrl-C）。

## 2. Abort 基準
A で counts≠0 ／ rail 不可視 ／ 完了※が 1 回押しで記録される（確認なし）／ F check で対象≠1 件 → 停止して出力を返送。

## 3. 報告テンプレート（counts/boolean + 短い体感のみ・PII/credential/raw row 不要）
```
A before: lifeops=0/obs=0/fbCad=0/realCad=0
C: 押した候補=◯◯ / 確認UIの体感=… / 文言=…
D after: lifeops=1/obs=1/fbCad=1/realCad=1
E rerender: 変化なし(期待どおり) or その他 / 違和感メモ=… / 390px=確認した・していない
F cleanup: check=1件(handle=…) → delete後 lifeops=0
G final: 全て0
```
