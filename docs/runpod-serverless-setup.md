# RunPod Serverless Setup — Student Provider (v2 LoRA)

> 作成日: 2026-04-19
> ステータス: **仕様確定済み / Phase 0 完了 (adapter alive) / Phase 1 実行待ち**
> 更新: 2026-04-20 — v2 adapter 生存確認済 (RunPod Pod `international_violet_whippet` / `/workspace/adapter-v2/checkpoint-120`)
> 関連: `docs/student-provider-operations.md`, `lib/ai/providers/student.ts`

---

## 1. 構成確定値 (CEO 2026-04-19 承認)

| 項目 | 値 | 根拠 |
|---|---|---|
| モデル配置方式 | **A案: merged model** | Phase 1 単一モデル。adapter 切替不要、運用単純 |
| GPU | **A10G 24GB** | Qwen-7B + 4-bit quant で 6-8GB。A10G で十分余裕 |
| Container 基盤 | **vLLM OpenAI-compatible** | `lib/ai/providers/student.ts` は OpenAI ChatCompletions 形式で呼び出し |
| Idle timeout | **90 秒** | canary 10% で同時接続少、90s で worker 維持 |
| Max workers | **2** | canary 期は上限抑制 |
| Min workers | **0** | 常時 warm はコスト優先で見送り |
| Flashboot | **ON** | cold start を 2-3 秒に短縮 |

### 再検討トリガー
- cold start が UX 上きついと判明 → `min_workers=1` に変更
- 25% 拡大時 → `max_workers` を 4-6 に増やす
- token-based prompt length gate 導入時 → 特になし

---

## 2. モデル配置（A案 merged model）

### 2.1 モデル ID 命名
- **HuggingFace Hub** (推奨配置先):
  - Repo: `<hf-user>/qwen2.5-7b-instruct-alter-v2` (private)
  - Revision: `v2.1-2026-04-09` (タグで固定)
- **RunPod Network Volume** (代替):
  - Path: `/runpod-volume/models/qwen2.5-7b-alter-v2/`

### 2.2 生成手順（準備 B スクリプト参照）
1. Base model `Qwen/Qwen2.5-7B-Instruct` を load
2. v2 LoRA adapter を PEFT で attach
3. `merge_and_unload()` で単一モデル化
4. `save_pretrained()` で safetensors 出力 (~14GB bf16)
5. tokenizer も同梱 (`tokenizer.save_pretrained()`)
6. HF private repo に push or RunPod volume に upload

### 2.3 vLLM 側の model 参照
```bash
# vLLM worker env
HF_MODEL_ID=<hf-user>/qwen2.5-7b-instruct-alter-v2
HF_TOKEN=<hf-token-read>
MAX_MODEL_LEN=2048       # 訓練時と一致
DTYPE=bfloat16
TRUST_REMOTE_CODE=true   # Qwen 要件
```

---

## 3. vLLM worker 仕様

### 3.1 Container image
- 推奨: `runpod/worker-v1-vllm:<latest>` (RunPod 公式 vLLM worker)
- 代替: `vllm/vllm-openai:latest` (公式 vLLM) + RunPod handler 追加

### 3.2 Endpoint 形式 (確定)
lib/ai/providers/student.ts が叩く:
```
POST {STUDENT_PROVIDER_ENDPOINT}/v1/chat/completions
Authorization: Bearer {STUDENT_PROVIDER_API_KEY}
Content-Type: application/json
```

Body (OpenAI ChatCompletions 互換):
```json
{
  "model": "qwen2.5-7b-instruct-lora-v2",
  "messages": [
    {"role": "system", "content": "..."},
    {"role": "user", "content": "..."}
  ],
  "temperature": 0.4,
  "max_tokens": 384,
  "top_p": 0.9,
  "repetition_penalty": 1.15
}
```

Expected response:
```json
{
  "choices": [{"message": {"content": "..."}}],
  "usage": {"prompt_tokens": ..., "completion_tokens": ...}
}
```

### 3.3 生成パラメータのデフォルト (lib/ai/providers/student.ts:97-105)
| Param | Value | 根拠 |
|---|---|---|
| temperature | 0.4 | v2 設計書の推奨値 |
| top_p | 0.9 | 同上 |
| repetition_penalty | 1.15 | v1 の定型表現抑制で実績 |
| max_tokens | 384 | Alter 応答の 95th percentile |
| stop | (未設定) | Qwen chat template 任せ |

---

## 4. Scaling / Cost 見積

### 4.1 初期構成 (canary 10%)
- stargazer_alter_response 発火頻度 (仮定): 50-100 req/day (全体)
- canary 10% → student 5-10 req/day
- A10G cost: ~$0.0005/s = ~$2/hr
- 1 req あたり推論 ~2-3 秒 + Flashboot 起動 2-3 秒 = 5-6 秒
- 月額見積: 10 req × 6s × 30 day × $0.0005/s = **~$0.9/month** (canary 10%)

### 4.2 25% / 50% / 100% 拡大時
- 25% → ~$2/month
- 50% → ~$4/month
- 100% → ~$9/month
- いずれも A10G 単体なら許容範囲

### 4.3 Cost アラート設定推奨
- RunPod 側の月額上限 $50 で警告設定
- 予期せぬスパイク検知用

---

## 5. 環境変数 (準備完了時に追加する値)

本番 env (CEO 承認後のみ追加):
```bash
STUDENT_PROVIDER_ENABLED=true
STUDENT_PROVIDER_ENDPOINT=https://api.runpod.ai/v2/<endpoint-id>
STUDENT_PROVIDER_API_KEY=<runpod-api-key>
STUDENT_PROVIDER_MODEL=qwen2.5-7b-instruct-lora-v2
STUDENT_PROVIDER_TIMEOUT_MS=30000
STUDENT_PROVIDER_MAX_PROMPT_CHARS=3000
STUDENT_PROVIDER_ROLLOUT_PERCENT=10
```

Staging env (pre-verification 時):
```bash
# 上記と同じ。ROLLOUT_PERCENT=100 で自分の userId を必ず hit させる
STUDENT_PROVIDER_ROLLOUT_PERCENT=100
```

---

## 6. デプロイ手順（CEO 承認後の実作業）

Phase 0: **Adapter 所在確認** ✅ 完了 (2026-04-20)
  - RunPod Pod `international_violet_whippet` (A100) 上で生存確認
  - 場所: `/workspace/adapter-v2/checkpoint-120/`
  - 内容: adapter_model.safetensors, adapter_config.json, trainer_state.json, tokenizer.* 一式
  - ローカル backup: `adapter-v2-checkpoint-120.tar.gz` 取得済 (二次ソース)
  - Pod は Stopped で待機中。再起動で即 merge 可能
  - → 再学習は不要。checkpoint-120 を直接 Phase 1 の入力として使う

Phase 1: **Adapter 準備** ← 現在ここ
  - 1a. RunPod Pod `international_violet_whippet` を Start
  - 1b. Pod 上で `scripts/merge_and_upload_v2_lora.py` を実行
        (adapter-path = `/workspace/adapter-v2/checkpoint-120`)
  - 1c. merged model を HF private repo に push (~14GB、upload 5-10分)
  - 1d. HF 上で load 確認 + sanity prompt (日本語・中国語混入なし)

Phase 2: **RunPod Serverless endpoint 作成**
  - 2a. Dashboard or API で new endpoint
  - 2b. template = vllm-openai、env に HF_MODEL_ID / HF_TOKEN 設定
  - 2c. GPU A10G / idle 90 / max 2 / min 0 / flashboot ON
  - 2d. endpoint_id と API key を取得

Phase 3: **Direct curl テスト** (準備 C スクリプト)
  - 3a. `STUDENT_PROVIDER_ENDPOINT` / `STUDENT_PROVIDER_API_KEY` を local env に
  - 3b. curl 3-5 パターン実行
  - 3c. latency / 日本語品質 / 中国語混入なし 確認

Phase 4: **Staging テスト** (準備 D 手順書)
  - 4a. staging env に全 STUDENT_PROVIDER_* 設定 (ROLLOUT_PERCENT=100)
  - 4b. 自分の userId で Alter 応答 5-10 発火
  - 4c. `ai_runs` SQL 確認 (provider=student, success=true, metadata 正しい)
  - 4d. skip / fallback 発生有無と理由

Phase 5: **CEO 報告 + 本番 canary 開始承認**

Phase 6: **本番 env 設定** (CEO 承認後のみ)
  - 6a. `STUDENT_PROVIDER_ENABLED=true` + `ROLLOUT_PERCENT=10`
  - 6b. deploy
  - 6c. `ai_runs` モニタリング開始

---

## 7. 失敗時のロールバック

即時無効化:
```bash
STUDENT_PROVIDER_ENABLED=false
# or
STUDENT_PROVIDER_ROLLOUT_PERCENT=0
```

endpoint 停止:
- RunPod Dashboard で endpoint を pause → `provider_unavailable` で自動 disabled

コード側の一切の変更不要。既存 Gemini/OpenAI パスが即座に 100% を処理する。
