# Student Provider (v2 LoRA) 運用ドキュメント

> 作成日: 2026-04-19
> 対象: `lib/ai/providers/student.ts`, `lib/ai/studentRouting.ts`
> ステータス: Phase 1 実装完了 / flag OFF / RunPod Serverless endpoint 準備待ち

---

## 1. 概要

Qwen2.5-7B-Instruct + LoRA v2 を **Generation-only** で `stargazer_alter_response` のみに限定投入する分離運用アーキテクチャ。Aneurasync の判断 OS（mode/shape/safety/personality）は上流で完了させ、student provider は「確定済みの判断を自然文にレンダリングする」だけを担当する。

### アーキテクチャ原則

- **責務分離**: 判断＝Aneurasync、生成＝v2 LoRA
- **scope 最小化**: Phase 1 は `stargazer_alter_response` のみ。他 73 task は既存 stable provider (Gemini/OpenAI) 継続
- **安全側デフォルト**: flag OFF / canary 10% / prompt length gate / output validation / 失敗時自動フォールバック

---

## 2. ロールアウト段階

| Phase | rollout % | 前提条件 |
|---|---|---|
| 0 (現在) | 0% (flag OFF) | main マージ済み。RunPod Serverless endpoint 未準備 |
| 1 (canary) | 10% | endpoint 準備完了 + `STUDENT_PROVIDER_ENABLED=true` |
| 2 | 25% | **token-based gate への置き換え** もしくは chars 閾値の安全側再調整 (§5.1 参照) |
| 3 | 50% | Phase 2 で success率 / latency / quality が合格基準を超えていること |
| 4 | 100% | 全 `stargazer_alter_response` を student へ |

**現状**: Phase 0。flag OFF で main 反映済み。

---

## 3. 必要 env (本番 ON 時)

```bash
STUDENT_PROVIDER_ENABLED=true
STUDENT_PROVIDER_ENDPOINT=https://<runpod-serverless-id>.api.runpod.ai
STUDENT_PROVIDER_API_KEY=<runpod-api-key>
STUDENT_PROVIDER_MODEL=qwen2.5-7b-instruct-lora-v2
STUDENT_PROVIDER_TIMEOUT_MS=30000         # default 30s
STUDENT_PROVIDER_MAX_PROMPT_CHARS=3000    # default 3000
STUDENT_PROVIDER_ROLLOUT_PERCENT=10       # default 10
```

未設定時は自動的に stable provider のみで動作（flag OFF と同じ挙動）。

---

## 4. 3-state routing と telemetry

### 4.1 状態定義

| 状態 | 意味 | provider 列 | success 列 |
|---|---|---|---|
| **success** | student 呼んで成功 | `student` | true |
| **fallback** | student 呼んだが失敗 → stable で再生成 | student 行 + stable 行の 2 行 | student=false, stable=true |
| **skipped** | 事前判定で student を呼ばなかった (対象だが除外) | stable のみ | true |
| **disabled** | そもそも student 対象外 | stable のみ | true |

### 4.2 metadata キー対応表

```
attempt 判定:
  metadata->>'studentProvider' = 'true'
    AND metadata->>'studentRouting' = 'canary_selected'

success 判定:
  provider = 'student' AND success = true

fallback 判定:
  provider = 'student' AND success = false
  （対応する stable 行に studentFallbackToStable=true が入る）

skipped 判定:
  metadata->>'studentSkipped' = 'true'
  （stable 行のみ。student 行は存在しない）

skip 理由:
  metadata->>'studentSkipReason' ∈
    {'prompt_too_long', 'canary_excluded', 'no_stable_seed'}

fallback 理由:
  metadata->>'studentFallbackReason' (error_message と同じ)
    例: 'http_500: ...', 'timeout', 'output_validation_failed: ...'
```

---

## 5. CEO フォロー事項（25%拡大前に対応）

### 5.1 token-based gate への置き換え

**現状**: `STUDENT_PROVIDER_MAX_PROMPT_CHARS=3000` で chars ベース判定。

**問題**: Qwen tokenizer で「1 char ≈ 1.5 tokens (日本語) / 1 char ≈ 0.3 tokens (英数記号)」と変動するため、同じ chars でも token 数にばらつきが出る。訓練は `max_seq_length=2048`、応答用 384 token を差し引くと入力可能 token は 1664 前後。3000 chars は日本語で 4500 token 相当になる場合があり、**現閾値だと偶発的に訓練域を超えるプロンプトが student に渡る可能性**がある。

**対応案** (Phase 2 = 25% 拡大前に着手):
- (A) `@xenova/transformers` か RunPod 側で tokenize して token 数で判定
- (B) chars 閾値を 2000 程度まで下げて安全側固定（工数 0、精度劣後）

Phase 1 の 10% canary では chars ベースで運用し、ai_runs の **`studentPromptChars` と `output_validation_failed` 発生率の相関** を観測してから決める。

### 5.2 telemetry 指標の分母定義

**原則**: 4 指標は**分母を明確に分ける**。混線禁止。

| 指標 | 分子 | 分母 | SQL (例) |
|---|---|---|---|
| **attempt rate** | student を実際に呼んだ件数 | stargazer_alter_response の全件 (cache hit 除く) | `COUNT(*) FILTER (WHERE metadata->>'studentProvider'='true') / COUNT(*)` |
| **success rate** | student 成功件数 | student を実際に呼んだ件数 (attempt) | `COUNT(*) FILTER (WHERE provider='student' AND success) / COUNT(*) FILTER (WHERE metadata->>'studentProvider'='true')` |
| **fallback rate** | student 失敗 → stable 成功件数 | student を実際に呼んだ件数 (attempt) | `COUNT(*) FILTER (WHERE metadata->>'studentFallbackToStable'='true') / COUNT(*) FILTER (WHERE metadata->>'studentProvider'='true' AND provider='student')` |
| **skip rate** | 事前スキップ件数 | 対象 task の全件 (eligible 候補になりうる全件) | `COUNT(*) FILTER (WHERE metadata->>'studentSkipped'='true') / COUNT(*) FILTER (WHERE task_type='stargazer_alter_response')` |

**混線回避のためのチェックリスト**:
- `attempt rate` は cache hit を分母に含めない（cache hit は provider 層に到達しないので分母では不正）
- `success rate` の分母は「attempt した件数」であり「eligible 件数」ではない（skipped は分母に入らない）
- `fallback rate` は success rate の裏（`success_rate + fallback_rate = 1.0`）、skipped とは別軸
- `skip rate` は attempt rate と独立。 `attempt + skip + disabled = 全件`

---

## 6. SQL テンプレート

### 6.1 日次サマリ

```sql
SELECT
  DATE(created_at) AS day,
  COUNT(*)                                                                              AS total,
  COUNT(*) FILTER (WHERE metadata->>'studentProvider'='true')                           AS attempt,
  COUNT(*) FILTER (WHERE provider='student' AND success)                                AS student_success,
  COUNT(*) FILTER (WHERE metadata->>'studentFallbackToStable'='true')                   AS fallback_after_student,
  COUNT(*) FILTER (WHERE metadata->>'studentSkipped'='true')                            AS skipped,
  AVG(latency_ms) FILTER (WHERE provider='student' AND success)                         AS student_p50_latency
FROM ai_runs
WHERE task_type='stargazer_alter_response'
  AND created_at >= NOW() - INTERVAL '7 days'
GROUP BY 1 ORDER BY 1 DESC;
```

### 6.2 skip 理由分布

```sql
SELECT metadata->>'studentSkipReason' AS reason, COUNT(*)
FROM ai_runs
WHERE metadata->>'studentSkipped'='true'
GROUP BY 1 ORDER BY 2 DESC;
```

### 6.3 fallback 理由分布（student 失敗の内訳）

```sql
SELECT
  metadata->>'studentFallbackReason' AS reason,
  COUNT(*)
FROM ai_runs
WHERE provider='student' AND success=false
GROUP BY 1 ORDER BY 2 DESC;
```

### 6.4 prompt length 分布 vs validation failure 相関（§5.1 判断用）

```sql
SELECT
  CASE
    WHEN (metadata->>'studentPromptChars')::int < 1000 THEN '0-1000'
    WHEN (metadata->>'studentPromptChars')::int < 2000 THEN '1000-2000'
    WHEN (metadata->>'studentPromptChars')::int < 3000 THEN '2000-3000'
    ELSE '3000+'
  END AS bucket,
  COUNT(*) AS attempts,
  COUNT(*) FILTER (WHERE error_message LIKE 'output_validation_failed%') AS validation_failures
FROM ai_runs
WHERE provider='student'
GROUP BY 1 ORDER BY 1;
```

---

## 7. 合格基準 (Phase 1 → Phase 2 移行判断)

Phase 2 (25%) に進む最低条件:

- ✅ **attempt rate ≥ 8%** (rollout 10% 設定時に skip が多すぎない)
- ✅ **success rate ≥ 85%** (validation / timeout / 5xx の合計が 15% 未満)
- ✅ **fallback の p95 latency が attempt の p95 + 2秒以内** (fallback による体感悪化が許容範囲)
- ✅ **skip のうち `prompt_too_long` が 20% 未満** (chars gate が過剰に弾いていない)
- ✅ **user-facing quality regression が観測されない** (followup rate / bounce rate が有意悪化しない)

いずれも 7 日間ウィンドウで判定。

---

## 8. 緊急時の kill switch

```bash
# 環境変数から無効化 (deploy なしで即効)
STUDENT_PROVIDER_ENABLED=false
```

または RunPod endpoint を停止すれば `provider_unavailable` で自動的に stable に切り替わる（fallback ではなく **disabled** 扱いになる点に注意。telemetry 分類上の区別あり）。
