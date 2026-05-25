# Alter Plan P2 Step 2 — Prompt 補正 v3.3 Readiness (= P3/P4 targeted、 small patch)

**Status**: readiness 起草 (= 着手前停止、 CEO 採用判定後着手)
**Date**: 2026-05-25
**Author**: Build Unit (Claude)
**Scope**: v3.2 で P1+P2 adoption pass、 P3+P4 strict 未達 (= 3.15 / 3.09) を **targeted 1 回補正** で持ち上げる。
**Parent**: v3.2 (= bd7f40bb、 部分採用済)、 v3.3 は v3.2 上の small patch。
**Predecessor commits**:
- `bd7f40bb` v3.2 prompt 補正 4 patch (= P1+P2 adoption 達成)
**着手 timing**: CEO 採用判定後

---

## 0. 結論 (= TL;DR)

GPT 判定 (= 2026-05-25):
- v3.2 部分採用、 **次は P3/P4 専用 small targeted patch を 1 回入れる**
- broad rewrite 禁止
- real PM smoke 直行 NG (= prompt の弱さと real PM 効き方が混ざる)

### v3.3 で狙うこと (= 2 点のみ)

| Profile | v3.2 per | 失敗原因 (= GPT 明示) | v3.3 補正方向 |
|---|---|---|---|
| **P3** (分散型 + 夜強い + 集中続き直近) | 3.15 | **静か/集中系に引っ張られすぎる** | 「分散的閃き / 創造の流れ」 軸で profile を立てる hint |
| **P4** (中庸型 + 朝強い + 直近休息余裕) | 3.09 | **整える/リズムだけで個別感薄い** | 「振り幅 / バランス / 中和」 等の active 語彙で diversify |

### ついで補正 (= GPT 「軽く散らす程度」)

- few-shot の comma 1 個固定 → 0 / 2 個の例を 1 つ混ぜる

### 期待効果

- P3: 3.15 → 3.5-3.8 (= adoption pass 達成、 もしくは clearly near-pass)
- P4: 3.09 → 3.5-3.8 (= 同上)
- P1/P2 (= v3.2 で adoption 達成): regression 0 (= regression check 必須)

---

## 1. P3 失敗原因 詳細 (= 思考原則 ① 前提を疑う)

### 1.1 観測事例 (= v3.2 G3-B full 結果)

P3 personalness = 3.15 (= adoption 3.5 未達、 near-pass 3.4-3.49 にも届かず)

P3 の Top entries は次のような pattern:
- 「夜のオフィス、 静かに集中する時間」 (= P1 寄り、 dispersive 性が消失)
- 「夜のカフェ、 思考を深める時間」 (= 集中系、 分散型ではない)

→ judge LLM の comment: 「集中はあるが、 分散型 / 夜型の特性が文に visible になっていない」

### 1.2 主因分析

#### (i) Few-shot 4 例の偏り

v3.2 few-shot:
1. P1: 「朝のスタバで、 静かに一日を始める」 ← 静か / 集中 軸
2. P2: 「朝のカフェで、 あなたが対話から活力を得る時間」 ← 対話 / 活力 軸
3. P3: 「深夜のオフィス、 創造の閃きが宿る」 ← 創造 軸 (= **1 例のみ**)
4. P4: 「朝の自宅でリズムを整える、 一日のはじまり」 ← 整え 軸

→ Top 10 では P1 系 (5 件) が dominant、 LLM は **「静か / 集中 / 深く沈む」 系で個別化** する pattern を強く学習
→ P3 (= 分散型) でも 「静か / 集中」 で出力 → 「分散型」 軸が消える

#### (ii) System prompt の P3 軸 hint 不足

v3.2 では 「P3 = 夜型 + 分散型」 が prompt context として渡されるが、 **「夜型は何を意味するか」** 「分散型は何を意味するか」 の解釈 hint がない → LLM が一般語彙 (= 「夜の集中」) で表現

#### (iii) 「集中続き直近」 の二面性

P3 の recent layer は 「直近忙しい (= 集中続き)」 + 「夜強い」。 LLM はこの二面性を **「集中」 で統合** してしまう → 分散性が消える

### 1.3 v3.3 P3 対策

#### Patch 1: System prompt に P3 軸 hint 追加

`alterNotePromptBuilderV2.ts` SYSTEM_PROMPT_BASE_V2 に **profile 別解釈 hint** を 1 セクション追加:

```typescript
const SYSTEM_PROMPT_BASE_V2 = [
  // ... 既存 ...
  "",
  // v3.3 追加: P3/P4 軸 hint
  "**Profile 軸別の解釈 hint** (= 特に弱い軸の立て方):",
  "- **分散型 + 夜強い** user の予定: 「静か / 集中」 ではなく、 「分散的閃き」 「創造の流れ」 「思考の漂流」 「夜の覚醒」 等の **dispersive な軸** で立てる。",
  "  「集中」 を使う場合は 「散らした上での集中」 「複数線の集中」 等で分散性を残す。",
  "- **中庸 / バランス型** user の予定: 「整える / リズム」 だけでなく、 「振り幅 / バランス / 中和 / 均衡」 等の **active な調整語彙** で立てる。",
  "  「整える」 単独では中庸性が曖昧 → 「振り幅を整える」 「中和へ寄せる」 等で中庸の active 性を visible 化。",
].join("\n");
```

#### Patch 2: Few-shot で P3 例を強化

v3.2 P3 例 「深夜のオフィス、 創造の閃きが宿る」 を **2 例に増やし**、 1 つは comma 0 個、 1 つは comma 2 個で **comma 散らし** も同時に実施:

```typescript
"- P3 (= 分散型 + 夜強い): 「深夜のオフィス、 散らした思考が新しい筋を編む時間」",
"  → 「分散」 「閃き」 「夜」 「創造」 系の語彙で profile を立てる",
"  → comma 1 個、 句読点標準",
"",
"- P3 (= 分散型 + 夜強い、 別文体): 「夜の自宅で 思考が漂い 新しい線を見つける」",
"  → 同 profile、 ただし comma 0 個 + 漂流系 metaphor で文体を意図的に変える",
"  → 文体テンプレ化を回避 (= GPT 補正、 few-shot 多様性確保)",
```

### 1.4 v3.3 P4 対策

#### Patch 3: Few-shot で P4 例を強化 + diversify

v3.2 P4 例 「朝の自宅でリズムを整える、 一日のはじまり」 を **「整える」 以外の語彙で 2 例**:

```typescript
"- P4 (= 中庸型 + 整え寄り): 「朝の自宅、 一日の振り幅を整えながら踏み出す」",
"  → 「振り幅」 「踏み出す」 で中庸の active 性を visible 化",
"  → comma 1 個",
"",
"- P4 (= 中庸型、 別文体): 「朝のオフィスで バランスを取り戻すための一区切り」",
"  → 「バランス」 「取り戻す」 「一区切り」 で中庸の能動性を立てる",
"  → comma 0 個 + 「一区切り」 で句読点パターン散らし",
```

(注: Patch 3 で comma 0 個 / 2 個 の few-shot 散らしを **P3 + P4 各 1 例ずつ** で実現、 GPT 「軽く散らす程度」 遵守。)

### 1.5 ついで補正 (= GPT 「v3.3 を触るついで」)

- few-shot を 4 例 → 6 例 (= P3 + P4 各 2 例)、 P1 + P2 は v3.2 のまま (= 既に adoption pass)
- comma 0 個 / 1 個 / 2 個 の variety を文中に確保 (= P3 第 2 例 + P4 第 2 例で comma 0 個)

---

## 2. v3.3 patch ファイル変更 (= 外科的最小)

### 2.1 改変 file (= 2 個のみ)

| File | 変更内容 |
|---|---|
| `lib/plan/llm/alterNotePromptBuilderV2.ts` | SYSTEM_PROMPT_BASE_V2 末尾に **Profile 軸別 hint** 1 段落追加 (= 5 行) |
| `lib/plan/llm/outputContract.ts` | promptInstruction の few-shot を 4 例 → 6 例 (= P3 + P4 各 2 例、 comma 散らし含む) |

### 2.2 不触 file (= broad rewrite 禁止遵守)

- v3.2 の Patch A (= 衝突優先 rule) 不変
- v3.2 の Patch B (= Phase framing 内部指示強化) 不変
- v3.2 の Patch D (= 中庸 profile 状態語ヒント) 不変
- validator V2 / generator / extractor / phaseGate 不変

### 2.3 test 影響範囲

- `tests/unit/plan/llm/alterNotePromptBuilderV2.test.ts`: 新 hint 段落の assertion 追加 (= +2-3 tests)
- 既存 v3.2 patch assertion (= 7 件) は不変

---

## 3. 期待効果見積もり

### 3.1 P3/P4 改善目標

| 観点 | v3.2 | v3.3 期待 | 達成判定 |
|---|---|---|---|
| P3 personalness | 3.15 | **3.5-3.8** | adoption pass 達成 |
| P4 personalness | 3.09 | **3.5-3.8** | adoption pass 達成 |
| P3 weak_personalization 比率 | ~30% (推定) | **~10%** | -20% |
| P4 weak_personalization 比率 | ~35% (推定) | **~15%** | -20% |

### 3.2 P1/P2 regression check

v3.3 patch は P1/P2 few-shot 例を変更しないため、 regression なしが期待される:

| Profile | v3.2 | v3.3 期待 |
|---|---|---|
| P1 | 4.23 ✅ | 4.2-4.4 (= 維持) |
| P2 | 4.04 ✅ | 4.0-4.2 (= 維持) |

(P1/P2 は profile 軸 hint section が prompt 末尾に追加されるが、 既存 few-shot は変えないため影響軽微)

### 3.3 全体平均期待

- step2 personalness: 3.27 → **3.5-3.7** (= adoption 達成 or 近接)
- weak_personalization: 23.3% → **~12-15%** (= さらに減少)

---

## 4. 評価 plan (= GPT 「P3/P4 subset 再評価」 + regression check)

### 4.1 G3-B 再 run

- 既存 `runJudgeHarnessLive.ts` full mode (= 全 5 user × 50 anchor = 250 case)
- 既存 dataset 再利用 (= cache 効果でも prompt 変更で多数 miss、 ~$2-3 cost、 25-30 分)
- raw entries dump で profile 別 + 4 類型分布分析

**注**: GPT 明示 「P3/P4 subset 再評価」 だが、 P1/P2 regression check も必須なので **full 250 で実施** (= subset の superset)。 cost / time の trade-off は許容範囲。

### 4.2 採用基準 (= strict 維持)

GPT v3.2.1 補正通り:
- **personalness ≥ 3.5 strict** (= adoption pass)
- 3.4-3.49 = near-pass (= 採用 pass 含まず)
- P3 + P4 両方 adoption pass → v3.3 採用 + real PM smoke 着手
- P3 + P4 一方が strict 未達 → 追加検討 (= v3.4 candidate)

### 4.3 採用後の順序

1. v3.3 採用 (= local main 統合 candidate)
2. real PM smoke 着手 (= readiness 起草済 `alter-plan-p2-step3-real-pm-readiness.md`)
3. preview canary
4. production canary

---

## 5. CEO 判断 (= 着手前停止、 5 件)

### Q1: v3.3 着手判定
- A (= 推奨): 着手 (= P3/P4 のみ targeted、 small patch)
- B: 現状 v3.2 のまま real PM smoke へ進む (= GPT NG)

### Q2: Patch 3 (= P3/P4 few-shot 強化) の比率
- A (= 推奨): P3 + P4 各 2 例 (= 計 4 例追加、 既存 4 → 8 例)
- B: P3 + P4 各 1 例 (= 計 2 例追加、 既存 4 → 6 例)
- C: P3 のみ 2 例 + P4 既存 1 例

### Q3: comma 散らし scope
- A (= 推奨): P3 + P4 各々 1 例ずつ comma 0 個 / 2 個 を混ぜる (= ついで補正)
- B: 全 few-shot で comma variety を強制
- C: 触らない (= naturalness 維持優先)

### Q4: P3 「分散型 + 夜強い」 hint の強度
- A (= 推奨): 「分散的閃き / 創造の流れ / 思考の漂流」 等 dispersive 語彙の hint
- B: より strict (= 「集中」 語の使用制限)
- C: hint なし、 few-shot のみで learn

### Q5: P4 「中庸型」 hint の強度
- A (= 推奨): 「振り幅 / バランス / 中和 / 均衡」 等 active 調整語彙の hint
- B: 「整える」 を弱める指示
- C: hint なし、 few-shot のみで learn

---

## 6. 工数見積もり

| Phase | 内容 | 想定 |
|---|---|---|
| 1 | readiness 起草 (= 本 doc) | 完了 |
| 2 | branch 切替 + patch 実装 | 15 min |
| 3 | test 更新 + validation | 5 min |
| 4 | G3-B full 再評価 | 25-30 min (= background) |
| 5 | 結果分析 + docs + commit | 15 min |

合計 ~1 hour (= G3-B run 含む)、 cost ~$2-3

---

## 7. 不変原則 (= 全遵守)

- **broad rewrite 禁止** (= 2 file 1 段落 + few-shot 4 例追加のみ)
- adoption 基準 3.5 strict 維持 (= 緩和 NG、 v3.2.1 通り)
- 出力テンプレ化禁止 (= 表層語句固定なし、 few-shot 多様性確保)
- 詩的化注意 (= P4 hint で 「振り幅」 比喩化注意)
- env / DB / package / dependency 変更 0
- 既存 Stargazer module 完全 frozen
- 規約 24 維持
- alter plan scope 限定

---

## 8. 次フェーズ (= CEO Q1-Q5 採用判定後)

1. feat/alter-plan-p2-llm-step2-prompt-fix-v3.3 (= v3.2 から派生)
2. Patch 1+2+3 実装 (= alterNotePromptBuilderV2.ts + outputContract.ts)
3. test 更新
4. G3-B full 再評価
5. P3 + P4 strict 3.5 達成判定
6. 達成 → v3.3 採用 + real PM smoke 着手
7. 未達 → v3.4 candidate 検討

---

**結語**: v3.2 で 「P1/P2 adoption pass、 patch の方向は正しい」 を機械実証。 v3.3 で P3/P4 を **targeted small patch** で持ち上げる (= broad rewrite 禁止、 GPT 通り)。 達成後に real PM smoke へ進む順序。
