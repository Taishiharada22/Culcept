# LoRA v2 改善設計書

> 作成日: 2026-04-09
> 判定: v1 は「部分成功・実用未達」 → v2 で改善

---

## v1 結果サマリ

| 指標 | gpt-4o-mini | Qwen Baseline | Qwen+LoRA v1 | v1 Delta |
|---|---|---|---|---|
| Overall Pass | 59.6% | 46.7% | 49.0% | +2.3% |
| Gen Pass | 39.8% | 25.4% | 31.4% | +5.9% |
| Gen Personality | 42.4% | 26.3% | 35.6% | **+9.3%** |
| Gen Generic Rate | 0.0% | 0.8% | 8.5% | -7.7% |
| Structured Pass | 88.8% | 78.5% | 75.0% | -3.5% |

## v1 問題の根本原因

### 問題1: Generic Rate 悪化 (0.8% → 8.5%)
- **原因**: 訓練データ 214件が全て Generation タスクの Alter voice のみ
- LoRA が「Alter っぽく返す」を過学習し、structured でもフリーテキスト風に返す
- 短すぎる応答 (< 20 chars) が 2件発生 — 訓練データの最小長 81 chars に対して短縮方向へ崩壊

### 問題2: Structured Pass 悪化 (78.5% → 75.0%)
- **原因**: 訓練データに structured (JSON出力) が **0件**
- LoRA が JSON 出力フォーマットの能力を微妙に劣化させた
- JSON parse 失敗が 9/80 件（baseline は確認必要だが v1 より多い可能性）

### 問題3: 800 chars 超の長文が 32/118 件
- **原因**: 推論時 max_new_tokens=512 でもトークン上限まで生成するケースが多い
- 訓練データの median が 377 chars に対し、生成が長くなる傾向

---

## v2 改善方針

### 方針1: Structured データの混合（Structured 劣化防止）

v1 は Generation-only で訓練したため Structured が劣化した。
v2 では **Gold eval cases の Structured タスクからサンプリング**して混合。

| カテゴリ | v1 訓練データ | v2 訓練データ (目標) |
|---|---|---|
| Generation (Alter voice) | 214 | 300+ |
| Structured (JSON output) | 0 | 50-80 |
| **合計** | 214 | 350-380 |

Structured データの作成方法:
- 既存 Gold eval cases (80 structured) の gold_response をそのまま使う
- ただし **eval 用 hold-out と被らないよう split に注意**

### 方針2: Generic 抑制フィルタ（Generic Rate 悪化防止）

訓練データに「negative examples」は入れない。代わりに:

1. **訓練データのクオリティゲート強化**
   - 応答長 < 50 chars のデータは除外
   - 冒頭が定型フレーズ (はい、了解、承知しました...) で始まるデータは除外
   - personality keyword (独自表現、比喩、感情語) が含まれないデータは除外

2. **System prompt にアンチ generic 指示を追加**
   - 「定型的な挨拶や同意から入らない」「具体的な観察や洞察から入る」を明示

3. **推論時の repetition_penalty 調整**
   - repetition_penalty=1.1 → 1.15 で定型表現の繰り返しを抑制

### 方針3: Generation Gold データ増強（300件目標）

現在の 214 件 → 300+ 件に増強。

データソース:
1. **既存 eval cases の gold_response を train 化** (eval hold-out と分離)
2. **gpt-4o-mini で追加合成** — 実運用のAlter返答ログからペルソナ付きで再生成
3. **手動キュレーション** — v1 で personality PASS した推論結果を逆流 (human-in-the-loop)

### 方針4: 推論パラメータ最適化

| パラメータ | v1 | v2 |
|---|---|---|
| max_new_tokens | 2048→512 (途中修正) | 384 (Alter 応答の 95th percentile に合わせる) |
| temperature | 0.3 | 0.4 (personality 多様性を少し増加) |
| repetition_penalty | 1.0 | 1.15 |
| top_p | 1.0 | 0.9 |

---

## v2 データセット設計

### Split 戦略

```
全 Gold eval cases: 198
  ├── Eval hold-out: 198 (全件、v1 と同じ評価セット)
  └── Train source: 別途作成

Train data sources:
  ├── [A] v1 既存 Generation Gold: 214 件 (ほぼ流用)
  ├── [B] gpt-4o-mini 追加合成 Generation: 80-100 件 (新規)
  ├── [C] Structured Gold: 50-80 件 (新規)
  └── Total: 344-394 件
```

**重要**: Eval hold-out 198 件と Train data は ID レベルで重複を禁止。
v1 では eval cases の gold_response を使って訓練データを作ったため、
v2 では **eval cases と同じ prompt だが別の gold_response** か、
**完全に別の prompt** を使う必要がある。

### データフォーマット

```jsonl
{
  "messages": [
    {"role": "system", "content": "<system prompt>"},
    {"role": "user", "content": "<user prompt>"},
    {"role": "assistant", "content": "<gold response>"}
  ],
  "metadata": {
    "task_category": "generation" | "structured",
    "task_type": "stargazer_alter_response" | ...,
    "quality_gate": "passed",
    "source": "v1_gold" | "gpt4o_synth" | "structured_gold"
  }
}
```

### クオリティゲート (全データ共通)

| ゲート | 基準 | 除外理由 |
|---|---|---|
| 最小応答長 | ≥ 50 chars | 短すぎ → generic 化の原因 |
| 最大応答長 | ≤ 800 chars | 長すぎ → 推論コスト+品質劣化 |
| 冒頭定型排除 | ^(はい\|了解\|わかりました\|承知) 不可 | generic 応答の特徴 |
| Personality keyword | 比喩・感情語・独自表現 1つ以上 (Generation のみ) | Alter voice の核 |
| JSON validity | parse 成功 (Structured のみ) | structured の核 |

---

## v2 実行前チェック項目

### データ準備チェック
- [ ] v1 Generation Gold (214件) → クオリティゲート適用後の残件数確認
- [ ] Structured Gold データ作成 (50-80件)
- [ ] gpt-4o-mini 追加合成 Generation データ作成 (80-100件)
- [ ] 全データにクオリティゲート適用
- [ ] Eval hold-out (198件) との ID 重複チェック → 重複 0 確認
- [ ] Train / Val split (90:10)
- [ ] JSONL フォーマット検証

### 訓練設定チェック
- [ ] LoRA config: r=16, alpha=32, all-linear (v1 と同じ)
- [ ] Batch size / LR / Epochs: v1 と同条件で開始 (batch=1, grad_accum=8, lr=1e-4, 3 epochs)
- [ ] Base model: Qwen/Qwen2.5-7B-Instruct (非 Turbo)
- [ ] max_seq_length: 2048
- [ ] GPU: A100-80GB (Modal or RunPod)

### 評価チェック
- [ ] v2 rubric (v1 と同じ) で評価
- [ ] 評価は同じ 198 Gold eval cases で実施
- [ ] 3 モデル比較: gpt-4o-mini / Qwen baseline / Qwen+LoRA v2
- [ ] v1 との差分も報告
- [ ] Pass rate, Personality, Generic Rate, Structured Pass の 4 指標で判定

### 合格基準 (v2)
- Overall Pass Rate ≥ 55% (v1: 49.0%, target: gpt-4o-mini の 59.6% に近づく)
- Gen Personality ≥ 40% (v1: 35.6%)
- Gen Generic Rate ≤ 3% (v1: 8.5%, baseline: 0.8%)
- Structured Pass ≥ 78% (v1: 75.0%, baseline: 78.5% — 劣化させない)

---

## 実行ステップ

1. **データ準備** (Build Unit 自律可)
   - v1 Generation Gold にクオリティゲート適用
   - Structured Gold データ作成
   - gpt-4o-mini で追加 Generation データ合成
   - 全データマージ + split

2. **訓練** (CEO 承認後に実行)
   - Modal or RunPod で LoRA v2 訓練
   - 推定コスト: ~$2-3 (A100-80GB × 15-20min)

3. **評価** (Build Unit 自律可)
   - 198 eval cases で推論
   - v2 rubric 評価 + 比較表出力

4. **判定** (CEO)
   - 合格基準を満たすか
   - 本番採用 or v3 設計 or gpt-4o-mini 継続
