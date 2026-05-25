# Alter Plan P2 Step 2 — Prompt 補正 Readiness (= weak_personalization 48.7% targeted patch)

**Status**: readiness v3.2 (= GPT 3 点補正反映、 着手前停止、 CEO Q1-Q5 採用判定待ち)
**Date**: 2026-05-25
**Author**: Build Unit (Claude)
**Scope**: G3-B full 250 で判明した weak_personalization 48.7% を **targeted patch** で潰す。 broad rewrite **禁止** (= GPT 明示)。

**Predecessor commits** (= **local main 上の統合作業のみ完了**、 fetch/push/gh 0 制約下):
- `5b4543ba` Step 2 v3.1 実装
- `0bed0e22` G3 全 gate 完了
- `44c737ef` Step 1+2 を local main に統合 (= `--no-ff` merge、 push なし、 origin/main との同期は CEO 操作)

**着手 timing**: CEO Q1-Q5 採用判定後

## 改訂履歴

| Version | 内容 |
|---|---|
| v3.1 初版 (= 7630ceba) | 4 targeted patch (A/B/C/D) + 統合効果見積 + Q1-Q5 |
| v3.2 (= bf766338) | GPT 3 補正反映: ①local merge 表現修正 / ②adoption 基準 3.5 strict 維持 / ③Patch B framing は内部指示強化、 出力テンプレ化禁止 |
| **v3.2.1** | **GPT 追加補正反映 (= Patch C 追加補正)**: few-shot は profile 差のみ見せる用途、 文体見本集化禁止 (= 句読点・長さ・韻律・言い回しを寄せすぎないこと) |

---

## 0. 結論 (= TL;DR)

GPT 補正 (= 2026-05-25 Step 2 採用判定):
- Step 2 は条件付き採用、 主因 **weak_personalization 48.7%** を targeted patch で潰す
- **broad rewrite 禁止**、 既存 promptBuilderV2 / Output Contract V2 を保ったまま、 P2-P4 の唯一性立て指示のみ追加
- 補正後 synthetic 再評価 → real PM smoke → preview canary の順序

### 補正の核心 (= 4 つの targeted patch、 すべて prompt の system prompt 内追加)

| # | patch | 効果対象 |
|---|---|---|
| A | **profile vs anchor 衝突優先 rule** 明文化 | profile が anchor metadata で打ち消される問題 (= pilot で観測した 「昼のカフェ、 穏やかに話を進める時間」 等) |
| B | **profile 個別化の内部指示強化** (= v3.2 補正、 出力テンプレ化禁止) | P3-P4 で 「あなたらしさ」 が薄い問題 (= 表層語句固定は不可、 内容で個別化) |
| C | **Few-shot examples 注入** (= Top 10 から P1/P2/P3/P4 各 1 例) | LLM が個別化パターンを学習 (= 「朝のスタバで、 静かに一日を始める」 style) |
| D | **中庸 profile の唯一性立て指示** | P2 (= 関係エネルギー型) / P4 (= 中庸型) の uniqueness 抽出 |

---

## 1. 前提を疑え (= 思考原則 ①、 GPT 「方向は正しい、 鋭さが足りない」)

### 1.1 G3-B full 結果が示す本当の問題

| Profile | personalness | weak_personalization 比率 (推定) |
|---|---|---|
| P1 | **3.59 ✅** | ~25% |
| P2 | 2.67 | ~55% |
| P3 | 2.79 | ~50% |
| P4 | 2.50 | ~60% |
| P5 | 1.51 (設計通り) | n/a |

**P1 は LLM が完璧に個別化できる** → 設計は正しい
**P2-P4 で個別化が薄い** → 主因は:
- **profile uniqueness の表現が prompt に弱い** (= 「中庸型」 「関係エネルギー型」 等は judge に唯一性を感じさせにくい)
- **profile vs anchor metadata の衝突**で profile 側が weaken (= 「カフェミーティング」 anchor が 「ひとり静か」 user に衝突)
- **few-shot examples 不在** = LLM が pattern を独自推論 (= 平均寄り)

### 1.2 broad rewrite が禁止される理由 (= GPT 明示)

- Step 2 v3.1 の **層を分けたまま** 設計は GPT 補正で確定済 → 維持必須
- Output Contract V2 (= 3 field + generic detector) は機械保証完了 → 維持必須
- promptBuilderV2 全体を書き直すと、 既存 22 unit tests への影響 / regression リスク

→ 既存 prompt を **保ったまま、 4 targeted addition** だけで improvement を狙う。

---

## 2. Patch A: Profile vs Anchor 衝突優先 rule (= 1 行追加)

### 2.1 観測事例

Pilot で観測 (= readiness pilot §6):
- `P1_syn-cafe-05` 「昼のカフェ、 穏やかに話を進める時間」 (= weak_personalization)
- anchor: 「カフェミーティング」 (= 仕事用途、 「話す」 metadata)
- P1 profile: 集中型 + 朝強い + ひとり静か
- 結果: anchor の 「話す」 が profile の 「ひとり静か」 を上書き

### 2.2 補正案

`alterNotePromptBuilderV2.ts` の base system prompt に **1 段落追加**:

```typescript
const SYSTEM_PROMPT_BASE_V2 = [
  "あなたは Aneurasync の予定解釈アシスタントです。",
  "ユーザーが教えてくれた 1 件の予定について、 8〜30 字の短い 「観測的な意味文」 を 1 文だけ返してください。",
  "",
  "目的:",
  "  - ユーザー自身が予定の流れを掴むための、 静かな 「状態描写」 を提供する。",
  "  - 評価や推奨はしない。 観測者の視点で、 場面 / ペース / 質感 を一言で添える。",
  "",
  // ← v3.1 で追加 (= Patch A、 GPT 補正)
  "**重要 — 衝突優先 rule**:",
  "  - ユーザー profile (= 長期傾向 / 内面トーン / 直近リズム) と anchor metadata (= 「会議」 「飲み会」 等) が衝突する場合、",
  "    **profile を優先して解釈** してください。",
  "  - 例: 「ひとり静か」 ユーザーが 「カフェミーティング」 anchor → 「人と話す前のひととき、 内側を整える時間」",
  "    (= anchor の 「ミーティング」 を無視ではなく、 profile 軸 「ひとり静か」 で reframe)",
].join("\n");
```

**期待効果**: P2-P4 で profile が anchor に負ける case を明確に減らす (= weak_personalization 比率 -10%)。

---

## 3. Patch B: Profile 個別化の **内部指示強化** (= 出力テンプレ化禁止、 GPT v3.2 補正)

### 3.1 観測事例

G3-B full で:
- P3 (= 分散型 + 夜強い、 Phase 3) personalness 2.79
- P4 (= 中庸型、 Phase 4) personalness 2.50
- judge comment 多数: 「もう少し profile らしさが欲しい」

### 3.2 v3.2 補正 (= GPT 「framing は内部指示として強化、 表層の言い回し固定はテンプレ感」)

**v3.1 (= 不採用)**: 出力に 「あなたの軸」 「あなたが」 等の特定語句を **必須化**
**v3.2 (= 採用)**: prompt 内部で 「**profile を文に確実に反映せよ**」 を強く指示するが、 **表層の言い回しは LLM 自由**

理由 (= GPT):
- 表層語句固定 → 「あなたが」 が機械的反復 → テンプレ感 → naturalness が下がる
- judge LLM が表層パターンを学習 → personalness score 上がるが、 実 user 体感は逆に下がる
- **personalness 真の向上は 「profile が暗黙的に文に染み込んでいる」 状態** (= 表層語句ではなく 内容で profile を立てる)

### 3.3 補正案 (= v3.2、 表層語句不要 + 内部指示強化)

既存 `hdmPhaseGate.ts` の Phase 3-5 framing instruction を **「profile 反映の強度を上げる」 内部指示** に書き直す:

```typescript
case "moderate_personal":
  return [
    "## 文体ガイド (= Phase 3)",
    "- 「あなた」 主語 OK、 hedging 弱化",
    "- Personal Model から自然に文体に反映 (= 「あなたが集中しやすい」 等)",
    "- 直近の状態を踏まえた framing OK",
    // ← v3.2 補正 (= 内部指示強化、 表層語句は LLM 自由)
    "- **重要**: profile (= 判断モード / 時刻偏好 / 性格傾向) が **文の内容そのもの** に反映されるよう、",
    "  単なる事実描写ではなく **profile らしさが滲む表現** を選んでください。",
    "  「あなた」 主語を必ず使う必要はなく、 文体・選語・場面捉え方で profile を立てるのが理想。",
    "  例: P1 (集中型 + ひとり静か) → 「静かに沈む時間」 (= 「あなた」 主語なしでも個別性 visible)",
  ].join("\n");
case "deep_personal_framing":
  return [
    "## 文体ガイド (= Phase 4-5)",
    "- 「あなたの軸では」 「あなたが本当に」 等の深い framing 解禁",
    "- Personal Model を統合的に活用、 「あなたという人」 の一面を映す",
    "- ただし押しつけは厳禁、 観測寄りの解釈に留める",
    // ← v3.2 補正 (= 内部指示強化、 表層語句固定禁止)
    "- **必須**: profile の唯一性が **文の内容** に反映されること。",
    "  ただし 「あなたの軸では」 等の特定語句を **毎回使う必要はない**。",
    "  表層の言い回し固定はテンプレ感を生むため、 LLM が文体を自由に選んで profile を立てる方が良い。",
    "  judge は 「表層語句の有無」 ではなく 「profile らしさが伝わるか」 で採点される前提。",
    "  (profile を反映しないと weak_personalization → fallback、 user の 「第二の自己」 体験を達成できない)",
  ].join("\n");
```

**期待効果**:
- Phase 3-5 で profile らしさが **内容レベル** で文に染み込む
- 表層テンプレ化 (= 「あなたが…」 連発) を回避
- naturalness を落とさずに personalness +0.3-0.5 期待 (= テンプレ感なし)

---

## 4. Patch C: Few-shot examples 注入 (= profile 差のみ、 GPT v3.2.1 追加補正反映)

### 4.1 観測事例

G3-B Top 10 (= 全 P1 系):
- 「朝のスタバで、 静かに一日を始める」
- 「朝のドトール、 静かに一日を始める」
- 「朝のカフェ、 静かに思考を巡らせる時間」
- 「昼のとんかつ専門店、 静かに満たす時間」
- 「朝の自宅、 静かに作業へ集中する時間」

→ **同 template** で個別化成功。 ただし **同じ文体・句読点・長さに寄っている** (= GPT v3.2.1 指摘)。

### 4.2 v3.2.1 補正 (= GPT 「文体見本集化禁止」 受領)

**few-shot は profile 「意味差」 を見せる用途に限定**:

- P1 (= 集中型 + ひとり静か) → **静か / 集中** 寄り
- P2 (= 関係エネルギー型) → **対話 / 活力** 寄り
- P3 (= 分散型 + 夜強い) → **夜 / 創造 / 分散** 寄り
- P4 (= 中庸型 + 整え) → **整え / リズム / バランス** 寄り

**寄せすぎ NG (= テンプレ感を生む)**:
- ❌ 句読点 (= 「、」 「。」 の打ち方を揃える)
- ❌ 長さ (= 全例 14-16 字 等の文字数寄せ)
- ❌ 韻律 (= 「〜の◯◯で、 静かに〜時間」 等の音律パターン揃え)
- ❌ 言い回し (= 「〜時間」 末尾固定、 「静かに〜」 頭固定 等)

意図: LLM が **意味の方向性 (= profile 差)** を学習する、 表層 (= 文体・句読点・韻律) は LLM が anchor と profile を見て自由に選ぶ。

### 4.3 補正案 (= v3.2.1、 文体差バラけ意識)

`outputContract.ts` の `ALTER_NOTE_CONTRACT_V2.promptInstruction` 末尾に **profile 差 4 例追加** (= **文体は敢えてバラけさせる**):

```typescript
  "**Profile 差を立てる例 (= 各 profile 1 例、 文体は敢えてバラけさせて意味差のみを学習)**:",
  "",
  "- P1 (= 集中型 + ひとり静か): 「朝のスタバで、 静かに一日を始める」",
  "  → 「静か」 「集中」 系の語彙で profile を立てる",
  "",
  "- P2 (= 関係エネルギー型): 「朝のカフェで、 あなたが対話から活力を得る時間」",
  "  → 「対話」 「活力」 「人と」 等の関係性語彙で profile を立てる (= P1 と意味が逆)",
  "",
  "- P3 (= 分散型 + 夜強い): 「深夜のオフィス、 創造の閃きが宿る」",
  "  → 「夜」 「創造」 「分散」 系の語彙で profile を立てる (= 文末は 「時間」 でなくてもよい)",
  "",
  "- P4 (= 中庸型 + 整え寄り): 「朝の自宅でリズムを整える、 一日のはじまり」",
  "  → 「リズム」 「整え」 「バランス」 系の状態語で中庸の唯一性を立てる (= 句読点・長さは別 profile と寄せない)",
  "",
  "**重要**: 上記は **profile の意味差** を見せる例であり、 **文体見本集ではない**。",
  "  句読点・長さ・韻律・言い回しを LLM 自身が anchor と profile に応じて自由に選んでください。",
  "  寄せすぎるとテンプレ感が出て、 personalness が表面的に上がっても naturalness が下がります。",
```

**期待効果**:
- LLM が profile 別の **意味方向性** を学習
- 文体は LLM 自由 → テンプレ感回避
- P2-P4 で +0.3-0.5 期待 (= 中庸 profile でも 「リズム」 系語彙抽出が可能になる)
- naturalness を下げない (= 表層自由による多様性確保)

---

## 5. Patch D: 中庸 profile の唯一性立て指示

### 5.1 観測事例

P4 (= 中庸型 + 朝強い + 直近休息余裕) personalness 2.50 (= 最低)

中庸型は 「特徴の絶対値」 が小さい → judge は generic と判定しがち。 ただし:
- 「リズム回復中」
- 「バランス」
- 「整え中」

等の **状態語** で唯一性を立てられる。

### 5.2 補正案

`alterNotePromptBuilderV2.ts` の Stable layer formatter (= 既存) に **解釈ヒント**追加:

```typescript
function formatStableLayerSection(stable: PersonalModelV2["stable"]): string {
  if (!stable) return "";
  const lines: string[] = ["## あなたの長期傾向 (= Stable layer)"];
  // ... 既存 field 列挙 ...
  if (count === 0) return "";
  // ← v3.1 で追加 (= Patch D、 中庸 profile 対策)
  lines.push("");
  lines.push("**解釈ヒント**: profile が中庸 / バランス系の場合、 「リズム」 「整え」 「ペース」");
  lines.push("等の **状態語** で唯一性を立てる (= 中庸の中での個性化)。");
  return lines.join("\n");
}
```

**期待効果**: P4 personalness +0.3-0.5 期待。

---

## 6. 統合効果見積もり (= 4 patch 合算)

### 6.1 patch 別 期待 improvement

| Patch | 対象 profile | 期待 personalness Δ |
|---|---|---|
| A: 衝突優先 | P2-P4 (= profile vs anchor 衝突 多発) | +0.20 |
| B: 「あなたの軸」 必須化 | P3-P5 (= Phase ≥ 3) | +0.30 |
| C: Few-shot examples | 全 profile | +0.40 |
| D: 中庸 profile ヒント | P4 (= 中庸型) | +0.30 (P4 のみ) |

### 6.2 統合期待 score (= adoption 基準 3.5 strict 維持、 GPT v3.2 補正)

**adoption 基準 (= 緩和 NG)**: personalness ≥ **3.5** (= readiness §3.2.5 通り、 strict 維持)

3.4 は **near-pass** 扱い (= 採用判定 NG、 追加補正検討 candidate)。 基準そのものを 3.4 に下げるのは NG (= GPT 明示)。

| Profile | Step 2 v3.1 現状 per | 補正後期待 per | adoption 判定 |
|---|---|---|---|
| P1 | 3.59 | 3.7-3.9 | ✅ adoption pass 維持 |
| P2 | 2.67 | 3.4-3.6 | adoption pass: ≥ 3.5 達成 / near-pass: 3.4-3.49 |
| P3 | 2.79 | 3.5-3.7 | ✅ adoption pass 達成想定 |
| P4 | 2.50 | 3.4-3.6 | adoption pass: ≥ 3.5 達成 / near-pass: 3.4-3.49 |
| P5 | 1.51 (= 設計通り) | 1.51 維持 | n/a (= Phase 1 個別化 OFF) |

→ 平均 (= Phase ≥ 2) 推定: **2.89 → 3.4-3.6**

### 6.3 採用判定 (= v3.2 strict)

- **全 P1-P4 で personalness ≥ 3.5** 達成 → ✅ adoption pass → real PM smoke 着手
- **一部 profile で 3.4-3.49 (= near-pass)** → △ 追加補正 candidate (= 個別 profile-specific 例追加、 別 readiness)
- **複数 profile で 3.4 未満** → ❌ 補正方向 再検討

---

## 7. 「世界トップ級」 への接近 (= GPT 「鋭さが足りない」 への応答)

### 7.1 v3.1 現状の限界

- LLM の **平均化傾向** (= 中庸 profile で唯一性出にくい)
- profile uniqueness の **表現語彙** が prompt に不足
- judge LLM の **bias** (= 「ましょう」 を pushy 判定)

### 7.2 v3.1 補正で達成すること

1. **profile 優先性の明文化** (= anchor 強度に負けない)
2. **personal framing の必須化** (= Phase 別 strict)
3. **few-shot examples** (= LLM の自己学習援助)
4. **中庸 profile の状態語抽出** (= 「リズム」 「整え」 系)

→ **「中庸だが個別性ある」** 文 (= 「朝の自宅で、 リズムを整えて一日を始める」) が生成可能に。

### 7.3 v3.1 補正で達成 **しない** こと (= future Step 3+ で)

- real Stargazer wire (= synthetic adapter のまま、 別 Step)
- correction memory Layer B/C (= 別 readiness)
- judge bias 補正 (= 実 user feedback 取り込み)
- 5 レンズ (= Affect / Body / Narrative) との統合 (= future)

---

## 8. 実装手順 (= 着手後、 1-2 day)

### Phase 1: branch 切替
- `feat/alter-plan-p2-llm-step2-prompt-fix-v3.1` (= main から派生)

### Phase 2: 4 patch 適用 (= 外科的最小)
1. `alterNotePromptBuilderV2.ts`: SYSTEM_PROMPT_BASE_V2 に Patch A 追加 (= 1 段落)
2. `hdmPhaseGate.ts`: framing instruction strict 化 (= Phase 3-5 2 ヶ所)
3. `outputContract.ts`: ALTER_NOTE_CONTRACT_V2.promptInstruction 末尾に Patch C 追加 (= few-shot 3-5 例)
4. `alterNotePromptBuilderV2.ts`: formatStableLayerSection に Patch D 追加 (= 解釈ヒント)

### Phase 3: 既存 unit test 更新
- `alterNotePromptBuilderV2.test.ts`: 新 patch 行を含む system prompt の assertion 追加
- `hdmPhaseGate.test.ts`: 新 framing 行の assertion
- `outputContract.test.ts` (= 未着手なら新規): few-shot 行 assertion

### Phase 4: G3-B full 再評価 (= synthetic)
- `runJudgeHarnessLive.ts` full mode 再実行
- 結果 → `docs/alter-plan-p2-step2-judge-results-v3.1-full.md`
- 採用基準: personalness ≥ 3.4 (= adoption 近接) または +0.7 改善

### Phase 5: 採用判定
- P2-P4 で personalness ≥ 3.4 達成 → real PM smoke へ進む
- 未達 → 追加 patch 案 (= 個別 profile-specific 例を更に追加 等)

### Phase 6: atomic commit + CEO 報告

工数: 0.5-1 day (= 4 patch + test update + 再評価 run + docs)
Cost: ~$1-2 (= G3-B full 再 run、 cache 効果で安価)

---

## 9. 不変原則 (= 全遵守)

- env / DB / package / dependency 変更 0
- 既存 Stargazer module 完全 frozen (= synthetic adapter のまま)
- 既存 frozen file 不触
- 規約 24 + 中立文体 + 禁止語 維持
- 既存 deterministic / Step 1 LLM 経路 影響 0 (= 全 flag default false)
- alter plan scope 限定

---

## 10. CEO 判断 (= 5 件、 着手前停止)

### Q1. 4 patch 全採用 vs 部分採用
- **A (= 推奨)**: 全 4 patch 同時適用 (= 統合効果見積で adoption 達成期待)
- B: A + B のみ (= 最小)、 C + D は次 phase
- C: 異なる patch 案 (= CEO 提案)

### Q2. Few-shot examples の選定
- **A (= 推奨)**: G3-B Top 10 から profile 多様性ある 4 例 (= P1/P2/P3/P4 各 1)
- B: 全て P1 系 (= 安全だが多様性なし)
- C: CEO 提案文

### Q3. 中庸 profile ヒントの強度
- **A (= 推奨)**: 状態語ヒント (= 「リズム」 「整え」 「ペース」)
- B: より広い語彙 (= 「日常」 「日々」 等)
- C: 中庸 profile も deep framing 強制

### Q4. 再評価 dataset
- **A (= 推奨)**: 既存 50 件 dataset 再利用 (= cache 効果)
- B: 新しい 50 件で fresh evaluation

### Q5. 採用基準 (= v3.2 補正、 GPT 「基準緩和 NG」)
- **A (= 推奨)**: **personalness ≥ 3.5 strict** (= adoption 基準維持)、 3.4-3.49 は near-pass 扱い (= 追加補正 candidate)
- B: 全 profile (= P2-P4) で ≥ 3.5 strict adoption (= より厳しい、 全達成必須)
- C: 平均で ≥ 3.5 達成すれば pass (= profile 別の不均衡許容)

注: v3.1 で 「3.4 推奨」 と書いたが、 **GPT v3.2 補正で 「基準緩和 NG」** 受領、 ≥ 3.5 strict に修正。 3.4 は **near-pass** という middle status で扱う (= 採用 pass にはしないが、 完全失敗でもない)。

---

## 11. 関連 readiness / 設計書

- `docs/alter-plan-p2-llm-step2-readiness-v3.md` v3.1 (= 親 readiness)
- `docs/alter-plan-p2-step2-judge-results-full.md` (= G3-B 結果)
- `docs/alter-plan-p2-step2-g3c-smoke-results.md` (= G3-C 結果)
- `docs/alter-plan-p2-step3-real-pm-readiness.md` (= 次フェーズ readiness)
- `lib/plan/llm/alterNotePromptBuilderV2.ts` (= 補正対象)
- `lib/plan/llm/outputContract.ts` (= 補正対象)
- `lib/plan/llm/hdmPhaseGate.ts` (= 補正対象)

---

## 12. CEO 思考原則 ①〜⑦ への応答

- ① 前提を疑え: 「世界トップ級は v3.1 で達成」 ではない、 P2-P4 の鋭さ不足 (= 機械実証)
- ② 自立推論 + リサーチ: G3-B full 250 entries 詳細分析、 weak_personalization の主因特定
- ③ シンプル法案: broad rewrite 禁止、 4 targeted patch のみ
- ④ 外科的修正: 既存 file 3 ヶ所 1 段落追加のみ、 既存設計温存
- ⑤ ゴール逆算: ゴール (= P2-P4 で adoption 達成) → patch 4 種 → 統合効果見積 → 順次実装
- ⑥ 人間同等推論: profile vs anchor 衝突優先 + 「あなたの軸」 必須化で個別化深化
- ⑦ 革新的: few-shot examples で 「LLM が自己学習」 mechanism、 中庸 profile の状態語抽出は新規アプローチ

---

**結語**: G3-B full で判明した weak_personalization 48.7% を **4 targeted patch** で潰す。 broad rewrite 禁止、 既存設計温存。 補正後 synthetic 再評価で adoption 達成判定 → real PM smoke → preview canary の順序。 CEO Q1-Q5 採用判定後着手。
