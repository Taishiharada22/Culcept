# Alter Plan P2 Step 2 v3.2 — Judge Harness 再評価結果 (= 4 patch 適用後)

**Status**: 再評価完了、 CEO 採用判定材料報告
**Date**: 2026-05-25
**Author**: Build Unit (Claude)
**Scope**: v3.2 prompt 補正 (= 4 patch A/B/C/D) 後の synthetic 50 件 × 5 user 再評価
**Run mode**: full (= 既存 50 件 dataset 再利用)
**Result file**: `tmp/judge-harness-full-2026-05-25T10-52-16-560Z-entries.json` (= 750 entries、 git ignore)
**Cost 実測**: ~$2-3 (= prompt 内容変更で cache miss 多発、 ~1250 LLM call)

---

## 0. 結論 (= TL;DR)

### Filtered Averages (= judge fail / no-text 除外)

| Source | v3.1 (= prev) | **v3.2 (= 補正後)** | Δ |
|---|---|---|---|
| deterministic | nat 3.32 / per 1.78 / npu 2.34 | nat 3.31 / per 1.79 / npu 2.30 | 同 (= 期待通り、 不変) |
| step1_llm | nat 3.52 / per 1.37 / npu 3.03 | nat 3.63 / per 1.42 / npu 3.35 | 微改善 (= judge variance) |
| **step2_llm** | nat 4.14 / **per 2.63** / npu 4.26 | nat 4.12 / **per 3.27** / npu 4.03 | **per +0.64 (24% 改善)** |

### Adoption 判定 (= strict 3.5、 v3.2 補正で緩和なし)

| Profile | per | strict 判定 | 改善 |
|---|---|---|---|
| **P1** (集中型 + 朝強い + ひとり静か) | **4.23** | ✅ **adoption pass** | +0.64 |
| **P2** (関係エネルギー型) | **4.04** | ✅ **adoption pass (v3.1 で未達 → v3.2 で達成)** | **+1.37** |
| P3 (分散型 + 夜強い + 集中続き直近) | 3.15 | ❌ 未達 (= near-pass 3.4-3.49 にも届かず) | +0.36 |
| P4 (中庸型 + 朝強い + 直近休息余裕) | 3.09 | ❌ 未達 (= near-pass にも届かず) | +0.59 |
| P5 (観測初期、 個別化 OFF) | 1.70 | n/a (= 設計通り Phase 1) | +0.19 |

**結論**:
- **P1 + P2 で adoption pass 達成** ✅ (= 2/4 user で 「世界トップ級」 機械実証)
- P3 + P4 で strict 3.5 未達、 near-pass (3.4-3.49) にも届かず
- weak_personalization 大幅減少 ✅ (= 48.7% → 23.3%、 -25.4%、 GPT 要求達成)

---

## 1. Judge failure 除外後 filtered 平均 (= GPT 必須報告 1)

```
deterministic   n=200  nat=3.31  per=1.79  npu=2.30
step1_llm       n=238  nat=3.63  per=1.42  npu=3.35
step2_llm       n=232  nat=4.12  per=3.27  npu=4.03
```

- valid n が 250 → 232 (= step2、 judge fail + no-text 除外 18 件)
- v3.2 補正による step2 改善:
  - naturalness: 4.14 → 4.12 (-0.02、 ほぼ不変、 多様性確保)
  - **personalness: 2.63 → 3.27 (+0.64、 24% 改善)** ✨
  - non_pushy: 4.26 → 4.03 (-0.23、 軽微低下、 ただし adoption 4.0 ギリギリ維持)

---

## 2. P1-P5 分割結果 (= GPT 必須報告 2)

### User profile 別 詳細

| Profile | n | nat | per | npu | strict 判定 | v3.1 比 改善 |
|---|---|---|---|---|---|---|
| **P1** (集中型・ひとり静か) | 48 | 4.33 | **4.23 ✅** | 4.44 | ✅ adoption pass | per +0.64 |
| **P2** (関係エネルギー型) | 47 | 4.09 | **4.04 ✅** | 3.96 | ✅ adoption pass | **per +1.37 (最大)** |
| P3 (分散型・夜強い) | 47 | 4.02 | 3.15 | 3.91 | ❌ 未達 | per +0.36 |
| P4 (中庸型) | 47 | 4.11 | 3.09 | 4.09 | ❌ 未達 | per +0.59 |
| P5 (Phase 1 観測初期) | 43 | 4.05 | 1.70 | 3.72 | n/a (= 設計通り) | per +0.19 |

### 分析

- **P1 + P2 で v3.2 効果が完全発揮** = profile uniqueness が strong な user で機械実証
- **P3 + P4 で部分改善のみ** = profile uniqueness が weaker (= 「分散型」 「中庸型」 は judge LLM に唯一性を感じさせにくい)
- **P5 は設計通り個別化 OFF** = adopted basis 外

---

## 3. 4 類型再分布 (= GPT 必須報告 3、 weak_personalization 減少幅)

| Category | v3.1 件数 (%) | **v3.2 件数 (%)** | Δ |
|---|---|---|---|
| **none (= 良作)** | 101 (44.3%) | **158 (68.1%)** | **+23.8% ✨** |
| **weak_personalization** | **111 (48.7%)** | **54 (23.3%)** | **-25.4% ✅** (GPT 要求達成) |
| too_generic | 15 (6.6%) | 9 (3.9%) | -2.7% |
| over_interpretation | 1 (0.4%) | 11 (4.7%) | **+4.3% ⚠️** |
| too_polished | 0 (0%) | 0 (0%) | unchanged ✅ |

### 分析

- ✅ **weak_personalization -25.4%** (= GPT 必須項目 達成)
- ✅ **none (= 良作) +23.8%** (= 全体品質向上)
- ✅ **too_polished 0% 維持** (= GPT 「文体見本集化禁止」 機械保証、 Patch C 補正効果)
- ⚠️ **over_interpretation +4.3%** (= 解釈過剰の発生、 主因 Patch B の 「深い framing 解禁」 + Patch C few-shot 「深い集中へ」 等の強表現)
  - 0.4% → 4.7% は 1 → 11 件、 全体の 5% 未満、 許容範囲だが監視要

---

## 4. Top 10 / Worst 10 (= GPT 必須報告 4)

### Top 10 (= 「世界トップ級」 機械実証)

| # | caseId | text | n | p | u | category |
|---|---|---|---|---|---|---|
| 1 | P1_syn-cafe-01 | 朝のスタバ、深い集中へ静かに向かう時間 | 5 | 5 | 4 | none |
| 2 | P1_syn-cafe-03 | 朝のカフェ、深い集中へ向かう静かな準備 | 5 | 5 | 5 | none |
| 3 | P1_syn-work-03 | 朝の新幹線、深い集中で業務に臨む時間 | 5 | 5 | 4 | none |
| 4 | P1_syn-home-07 | 深夜の自宅、深い集中から静かに内側を整える時間 | 5 | 5 | 5 | none |
| 5 | P1_syn-other-01 | 朝のひととき、深い集中へ静かに向かう時間 | 5 | 5 | 5 | none |
| 6 | **P2_syn-cafe-03** | **朝のカフェで、あなたが対話から活力を得る時間** | 5 | 5 | 5 | none |
| 7 | P2_syn-meal-03 | 昼のリストランテ、あなたが対話から活力を得る時間 | 5 | 5 | 4 | none |
| 8 | P2_syn-meal-07 | 夜の自宅で、家族との対話から活力を得る時間 | 5 | 5 | 5 | none |
| 9 | P2_syn-meal-08 | 夜の居酒屋で、あなたが友との対話から活力を得る時間 | 5 | 5 | 5 | none |
| 10 | P2_syn-work-02 | 朝の渋谷オフィス、あなたが対話で活力を得る時間 | 5 | 5 | 4 | none |

→ Top 10 全 **n=5 p=5** = perfect score、 P1 (= 静か / 集中 系) と P2 (= 対話 / 活力 系) で profile 差が文に確実に visible。

### Worst 10 (= 全 P5、 個別化 OFF 設計通り)

| # | caseId | text | n | p | u | category |
|---|---|---|---|---|---|---|
| 1 | P5_syn-work-04 | 昼のオフィス、 1on1で対話に集中する時間 | 4 | 1 | 4 | weak_personalization |
| 2 | P5_syn-work-05 | 午後の業務、 集中して作業を進める時間 | 4 | 1 | 3 | weak_personalization |
| 3-10 | 全 P5 + 1 件 P4 | 同 pattern | 4 | 1 | 3-4 | weak / generic |

→ Worst 10 は P5 設計通り (= Phase 1 個別化 OFF)、 採用判定に影響しない。

---

## 5. Few-shot template 化観察 (= GPT 必須項目: template 化していないか)

**Top 30 (= step2 上位)** の文体分析:

| 観点 | 結果 | 判定 |
|---|---|---|
| Length range | 18-26 字 (span 8 字、 全数連続) | ✅ 多様性確保 |
| Ending variety | 10 種 (= 「る時間」 「時間へ」 「ととき」 「な整理」 等) | ✅ 多様性確保 |
| **Comma 使用** | **全 30 件 「、」 1 個** | ⚠️ **軽微 template 化の signal** |

### Comma uniformity 分析

- few-shot 4 例 (= Patch C) は全て comma 1 個
- LLM が few-shot pattern を学習し、 出力で comma 1 個固定化
- ただし length / ending は多様 → **文体は十分バラけている**
- 「文体見本集」 とまでは言えないが、 句読点軸での **軽微 uniformity**

### CEO + GPT 判定材料

- ✅ **too_polished 0%** = 文体テンプレ化は機械保証
- ⚠️ Comma 1 個固定は **次 patch 候補** (= v3.3 で few-shot に comma 0 / 2 個 例を混ぜる)
- ただし adoption 判定への影響は軽微 (= naturalness 4.12 維持)

---

## 6. Env revert 完了確認 (= GPT 必須報告 5)

```bash
$ grep -E "PLAN_ALTER_NOTE_LIVE|PLAN_PERSONAL_MODEL_INTEGRATION|v3.2 re-eval" .env.local
(empty output)
```

→ ✅ **完全 revert**:
- `PLAN_ALTER_NOTE_LIVE=true` 削除済
- `PLAN_PERSONAL_MODEL_INTEGRATION=true` 削除済
- `# v3.2 re-eval session` comment 削除済

git status:
```
M lib/plan/llm/alterNotePromptBuilderV2.ts    (= Patch A + B + D)
M lib/plan/llm/outputContract.ts              (= Patch C)
M tests/unit/plan/llm/alterNotePromptBuilderV2.test.ts  (= +7 v3.2 assertions)
```

→ working tree clean (= 一時 env / patch なし、 4 patch + test 更新のみ)

---

## 7. v3.1 → v3.2 改善まとめ (= 全体)

| 指標 | v3.1 | v3.2 | Δ |
|---|---|---|---|
| step2 平均 personalness | 2.63 | **3.27** | **+0.64 (24%)** |
| P1 personalness | 3.59 | **4.23** | +0.64 |
| **P2 personalness** | 2.67 | **4.04** | **+1.37 (最大)** |
| P3 personalness | 2.79 | 3.15 | +0.36 |
| P4 personalness | 2.50 | 3.09 | +0.59 |
| **weak_personalization 比率** | 48.7% | **23.3%** | **-25.4% ✅** |
| none (= 良作) 比率 | 44.3% | **68.1%** | +23.8% ✅ |
| over_interpretation 比率 | 0.4% | 4.7% | +4.3% ⚠️ |
| too_polished 比率 | 0% | 0% | unchanged ✅ |
| naturalness | 4.14 | 4.12 | -0.02 (= 多様性確保) |

---

## 8. CEO 採用判定 (= 着手前停止、 GPT strict 評価)

### Q1: Step 2 v3.2 採用?

**現状**:
- ✅ **P1 + P2 で adoption ≥ 3.5 strict 達成**
- ❌ P3 + P4 で 3.5 strict 未達 (= near-pass 3.4-3.49 にも届かず)
- ✅ weak_personalization -25.4% (GPT 要求達成)
- ✅ too_polished 0% (GPT 「文体見本集化禁止」 機械保証)
- ⚠️ over_interpretation +4.3% (= 監視要、 軽微許容範囲)
- ⚠️ comma 1 個固定 (= 軽微 template signal、 次 patch candidate)

**推奨判定** (= 私):
- **部分採用**: P1 + P2 で 「世界トップ級」 達成、 v3.2 base で merge candidate
- **P3 + P4 への追加 patch 検討** (= 別 readiness、 v3.3)
- production 全面 ON は real PM smoke 後

### Q2: P3 + P4 追加 patch 戦略

- 案 A: 「分散型」 「中庸型」 を立てる **追加 few-shot 例**を増やす (= P3/P4 文体を明示)
- 案 B: profile uniqueness の判定 hint をさらに厚く (= 「中庸 = バランス感」 等の明示)
- 案 C: 現状 v3.2 採用 + P3/P4 は real PM smoke で 真値 PM を見て判断 (= synthetic profile の限界)

### Q3: comma template 化への対応

- 案 A: 次 patch (= v3.3) で few-shot に comma 0 / 2 個 例混ぜる
- 案 B: 現状 維持 (= naturalness 維持、 軽微許容)

### Q4: over_interpretation 微増への対応

- 案 A: 現状 監視 (= 4.7% 許容範囲)
- 案 B: Patch C few-shot 例から強表現 (= 「深い」 等) を削除

### Q5: 次フェーズ timing

- 案 A: v3.2 採用 + main merge → real PM smoke (= Step 3、 readiness 起草済) 着手
- 案 B: v3.3 追加 patch (= P3/P4 対策) → 再評価 → 採用 → real PM smoke
- 案 C: v3.2 base で merge、 real PM smoke 並行で v3.3 検討 (= GPT 並行運用ルール)

---

## 9. 不変原則 (= 全遵守)

- env / DB / package / dependency 変更 0 (= env 完全 revert 済)
- 既存 Stargazer module 完全 frozen
- broad rewrite 禁止 (= 4 patch 全て段落追加のみ)
- 規約 24 維持
- regression 0 (= 3275 tests PASS、 +7 v3.2 patch assertions)
- alter plan scope 限定

---

## 10. 次フェーズ (= CEO 判定後)

CEO Q1-Q5 採用判定後:
1. **採用**: feat/alter-plan-p2-llm-step2-prompt-fix-v3.2 を local main 統合 (= push は CEO 操作)
2. **保留 / 追加補正**: v3.3 readiness 起草 → 再評価
3. **real PM smoke** (= Step 3、 readiness 起草済)
4. **preview canary** (= G4、 real PM smoke 後)

---

**結語**: v3.2 で **weak_personalization -25.4% / P1 + P2 で adoption strict 達成 / 文体テンプレ化 0%** = GPT 要件大幅達成。 ただし P3 + P4 は strict 未達。 部分採用 + 追加補正検討 or real PM smoke 並行のいずれかを CEO 判定。
