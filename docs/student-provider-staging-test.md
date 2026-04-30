# Student Provider Staging Test 手順書

> 作成日: 2026-04-19
> 目的: **staging で 1ユーザーテスト** (pre-verification step 2)
> 前提: 準備 C (direct curl) PASS 済み、本番は一切触らない
> 更新: 2026-04-20 — v2 adapter 生存確認済 (`/workspace/adapter-v2/checkpoint-120` + local backup)

---

## 前提条件

- [x] 準備 A (RunPod 構成仕様書) に従い endpoint 作成済み
- [x] 準備 B (merge_and_upload) で merged model が HF or RunPod volume に配置済み
- [x] 準備 C (curl test) で 5/5 PASS、latency 許容範囲、中国語混入ゼロ
- [x] PR #2 が staging deploy 済み (**merge は不要、staging deploy のみ**)
- [x] `ai_runs` テーブル存在確認 (Supabase staging)

---

## Step 0: Staging env vars 設定

Staging 環境 (Vercel staging or別 env) に以下を設定:

```bash
STUDENT_PROVIDER_ENABLED=true
STUDENT_PROVIDER_ENDPOINT=https://api.runpod.ai/v2/<endpoint-id>
STUDENT_PROVIDER_API_KEY=<runpod-api-key>
STUDENT_PROVIDER_MODEL=qwen2.5-7b-instruct-lora-v2
STUDENT_PROVIDER_TIMEOUT_MS=30000
STUDENT_PROVIDER_MAX_PROMPT_CHARS=3000
STUDENT_PROVIDER_ROLLOUT_PERCENT=100  # ← 1 ユーザー検証のため 100 (本番は 10)
```

⚠️ **本番 env は絶対に触らない**。staging のみ。

---

## Step 1: 自分の userId を確認

Staging の Supabase で自分の userId を取得:

```sql
SELECT id, email FROM auth.users WHERE email = '<自分の email>';
```

→ `user_id = <MY_USER_ID>` を記録

---

## Step 2: Alter 応答を 5-10 回発火

Staging の `/stargazer` or Home で Alter に話しかける:

### 推奨テストケース (5 パターン)

| # | 意図 | ユーザー発話例 |
|---|---|---|
| 1 | 感情系 warm | 「今日は曇りで気分沈んでる」 |
| 2 | 判断系 practical | 「転職を考えてるけど踏み切れない」 |
| 3 | 短い雑談 | 「なんとなく話したいだけ」 |
| 4 | 長めプロンプト (3000字付近) | (長文日記ぽいもの) — 参考用 |
| 5 | daily guidance | 「今日何したらいい？疲れてる」 |

### 観測ポイント (都度)
- 応答に違和感がないか (Alter voice が保たれているか)
- 定型挨拶 (はい／了解／承知しました) で始まっていないか
- 日本語の自然さ
- 応答完了までの体感 latency (cold start 時は 5-10秒想定)

---

## Step 3: `ai_runs` 確認 SQL

テスト実行直後、Supabase staging で以下を実行:

### 3.1 直近 10 件の student 関連リクエスト

```sql
SELECT
  created_at,
  task_type,
  provider,
  model,
  success,
  latency_ms,
  fallback_used,
  metadata->>'studentProvider'          AS student_flag,
  metadata->>'studentRouting'           AS routing,
  metadata->>'studentSkipped'           AS skipped,
  metadata->>'studentSkipReason'        AS skip_reason,
  metadata->>'studentFallbackToStable'  AS fallback_to_stable,
  metadata->>'studentFallbackReason'    AS fallback_reason,
  metadata->>'studentRolloutPercent'    AS rollout_pct,
  metadata->>'studentAssignmentBucket'  AS bucket,
  error_message,
  LEFT(response_text, 100)              AS response_preview
FROM ai_runs
WHERE task_type = 'stargazer_alter_response'
  AND user_id = '<MY_USER_ID>'
  AND created_at >= NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC
LIMIT 20;
```

### 3.2 3-state 分布 (skipped / attempted / disabled)

```sql
SELECT
  CASE
    WHEN metadata->>'studentSkipped' = 'true'         THEN 'skipped'
    WHEN metadata->>'studentFallbackToStable'='true'  THEN 'fallback'
    WHEN provider = 'student' AND success             THEN 'success'
    WHEN provider = 'student' AND NOT success         THEN 'student_fail'
    ELSE                                                   'disabled_or_other'
  END AS state,
  COUNT(*) AS n,
  AVG(latency_ms)::int AS avg_latency
FROM ai_runs
WHERE task_type = 'stargazer_alter_response'
  AND user_id = '<MY_USER_ID>'
  AND created_at >= NOW() - INTERVAL '1 hour'
GROUP BY 1;
```

### 3.3 生成文の品質確認

```sql
SELECT
  LEFT(response_text, 300) AS preview,
  latency_ms,
  LENGTH(response_text) AS len
FROM ai_runs
WHERE task_type = 'stargazer_alter_response'
  AND provider = 'student'
  AND success = true
  AND user_id = '<MY_USER_ID>'
  AND created_at >= NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;
```

目視で確認:
- 定型挨拶から始まっていないか
- 中国語の文字列が連続していないか
- 応答が途中で切れていないか
- Alter らしい距離感・温度感か

---

## Step 4: 合格基準

以下を全て満たせば **本番 canary 開始を CEO に提案**できる:

| 項目 | 基準 | 現状 |
|---|---|---|
| success rate | ≥ 80% (5/5〜8/10) | __ / __ |
| avg latency (warm) | ≤ 5000ms | __ ms |
| avg latency (cold) | ≤ 10000ms | __ ms |
| 中国語混入 | 0 件 | __ 件 |
| 定型挨拶 | 0 件 | __ 件 |
| response_text 完走率 | 100% (途中切れなし) | __ % |
| `studentProvider=true` が metadata に残る | 全件 | OK / NG |
| fallback 発生率 | ≤ 20% | __ % |
| skip 発生率 (prompt_too_long 以外) | 0% | __ % |

### 失格基準 (本番 canary NG)
- success rate < 80%
- 中国語混入 ≥ 1 件
- 定型挨拶 ≥ 1 件
- latency > 15000ms が常時
- `ai_runs` metadata が欠落

---

## Step 5: CEO への報告フォーマット

```
## Staging 1ユーザーテスト結果

- 実行回数: N 回
- success rate: X/N
- avg latency (warm): ___ ms
- avg latency (cold): ___ ms
- 中国語混入: 0
- 定型挨拶: 0
- fallback: ___ 件 (理由: ___)
- skip: ___ 件 (理由: ___)
- `ai_runs` metadata: 正常

応答品質所感:
- ___

判定:
- [ ] 合格 → 本番 10% canary 開始を提案
- [ ] 不合格 → 原因分析後に再テスト
```

---

## Step 6: テスト完了後の片付け

- staging env の `STUDENT_PROVIDER_ENABLED=false` に戻す (本番承認前は常時 OFF)
- もしくは `STUDENT_PROVIDER_ROLLOUT_PERCENT=0` に
- RunPod endpoint は pause せず継続 (本番投入までコスト小)
- 結果サマリを `docs/decision-log.md` に追記
