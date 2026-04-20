#!/usr/bin/env bash
# Direct curl test for Student Provider (v2 LoRA) RunPod Serverless endpoint.
#
# Purpose: pre-verification step 1 — verify endpoint alone (flag OFF on app side).
# Runs 5 Alter-voice prompt patterns and records latency + output.
#
# Prerequisites:
#   STUDENT_PROVIDER_ENDPOINT=https://api.runpod.ai/v2/<endpoint-id>
#   STUDENT_PROVIDER_API_KEY=<runpod-api-key>
#   STUDENT_PROVIDER_MODEL=qwen2.5-7b-instruct-lora-v2 (default)
#   jq installed (for parsing + pretty-print)
#
# Output:
#   ./exports/student-curl-test-<timestamp>.json  — all responses
#   stdout: per-request summary with latency + length + first 80 chars
#
# Usage:
#   export STUDENT_PROVIDER_ENDPOINT=...
#   export STUDENT_PROVIDER_API_KEY=...
#   bash scripts/student_provider_curl_test.sh

set -euo pipefail

ENDPOINT="${STUDENT_PROVIDER_ENDPOINT:?STUDENT_PROVIDER_ENDPOINT must be set}"
API_KEY="${STUDENT_PROVIDER_API_KEY:?STUDENT_PROVIDER_API_KEY must be set}"
MODEL="${STUDENT_PROVIDER_MODEL:-qwen2.5-7b-instruct-lora-v2}"

# Normalize endpoint (trim trailing slash)
ENDPOINT="${ENDPOINT%/}"
URL="${ENDPOINT}/v1/chat/completions"

TS=$(date +%Y%m%d-%H%M%S)
OUT_DIR="./exports"
OUT_FILE="${OUT_DIR}/student-curl-test-${TS}.json"
mkdir -p "$OUT_DIR"

echo "=========================================="
echo "Student Provider Direct Curl Test"
echo "=========================================="
echo "URL:    $URL"
echo "Model:  $MODEL"
echo "Output: $OUT_FILE"
echo ""

# Prompts covering Alter-voice usage patterns.
# Each line: LABEL|SYSTEM|USER
read -r -d '' PROMPTS <<'EOF' || true
warm_sad|あなたは Alter です。短く、定型挨拶なしで、具体的な観察から応答してください。|今日は曇りで気分が少し沈んでる
practical_question|あなたは Alter です。1行目で結論、後半で理由。定型挨拶禁止。|今日の午後どう過ごすのがいい？少し疲れてて頭が回らない
self_reflection|あなたは Alter です。相手の深層にある揺れを観察し、応答してください。|最近 friend の前だと少し無理してる気がする
decision_help|あなたは Alter です。相手の判断原理に即して、選択肢を整理してください。|転職を考えてるけど踏み切れない。今の仕事は安定してるけど成長が止まってる
gentle_short|あなたは Alter です。短く、温度感を保って応答してください。|なんとなく話したいだけ
EOF

results="[]"
overall_start=$(date +%s%N)

while IFS='|' read -r label system_prompt user_prompt; do
  [ -z "$label" ] && continue

  # Build request body via jq (safe JSON escape)
  body=$(jq -n \
    --arg model "$MODEL" \
    --arg system "$system_prompt" \
    --arg user "$user_prompt" \
    '{
      model: $model,
      messages: [
        {role: "system", content: $system},
        {role: "user",   content: $user}
      ],
      temperature: 0.4,
      max_tokens: 384,
      top_p: 0.9,
      repetition_penalty: 1.15
    }')

  start=$(date +%s%N)
  response=$(curl -sS -w "\n%{http_code}" -X POST "$URL" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    --max-time 60 \
    -d "$body" || echo -e "\n000")
  end=$(date +%s%N)

  latency_ms=$(( (end - start) / 1000000 ))
  http_code=$(echo "$response" | tail -n1)
  body_json=$(echo "$response" | sed '$d')

  # Parse output text safely (no assumption that response is valid JSON on error)
  if [ "$http_code" = "200" ] && echo "$body_json" | jq -e '.' >/dev/null 2>&1; then
    text=$(echo "$body_json" | jq -r '.choices[0].message.content // ""')
    prompt_tokens=$(echo "$body_json" | jq -r '.usage.prompt_tokens // "null"')
    completion_tokens=$(echo "$body_json" | jq -r '.usage.completion_tokens // "null"')
  else
    text=""
    prompt_tokens="null"
    completion_tokens="null"
  fi

  # Quality checks
  text_len=${#text}
  has_chinese_run=$(echo "$text" | grep -cE '[\x{4e00}-\x{9fff}]{5,}' || echo 0)
  has_japanese=$(echo "$text" | grep -cE '[\x{3040}-\x{309f}\x{30a0}-\x{30ff}]' || echo 0)

  # Print summary line
  preview=$(echo "$text" | head -c 80 | tr '\n' ' ')
  printf "[%s] http=%s latency=%dms len=%d | %s\n" \
    "$label" "$http_code" "$latency_ms" "$text_len" "$preview"

  # Append to results
  results=$(echo "$results" | jq \
    --arg label "$label" \
    --arg http "$http_code" \
    --argjson latency "$latency_ms" \
    --argjson len "$text_len" \
    --arg text "$text" \
    --arg pt "$prompt_tokens" \
    --arg ct "$completion_tokens" \
    --argjson zh_run "$has_chinese_run" \
    --argjson ja "$has_japanese" \
    '. += [{
      label: $label,
      http_code: $http,
      latency_ms: $latency,
      text_length: $len,
      prompt_tokens: $pt,
      completion_tokens: $ct,
      has_chinese_run: ($zh_run > 0),
      has_japanese_kana: ($ja > 0),
      text: $text
    }]')

done <<< "$PROMPTS"

overall_end=$(date +%s%N)
overall_ms=$(( (overall_end - overall_start) / 1000000 ))

# Final report
summary=$(echo "$results" | jq '{
  ran_at: now | strftime("%Y-%m-%dT%H:%M:%SZ"),
  endpoint: env.STUDENT_PROVIDER_ENDPOINT,
  model: env.STUDENT_PROVIDER_MODEL,
  total_tests: length,
  success_count: map(select(.http_code == "200")) | length,
  chinese_contamination_count: map(select(.has_chinese_run and (.has_japanese_kana | not))) | length,
  too_short_count: map(select(.text_length < 30)) | length,
  p50_latency_ms: (map(.latency_ms) | sort | .[length/2|floor]),
  max_latency_ms: (map(.latency_ms) | max),
  results: .
}')

echo "$summary" > "$OUT_FILE"

echo ""
echo "=========================================="
echo "Summary"
echo "=========================================="
echo "$summary" | jq '{
  total_tests, success_count, chinese_contamination_count, too_short_count,
  p50_latency_ms, max_latency_ms
}'
echo ""
echo "Full details: $OUT_FILE"
echo ""

# Exit non-zero if any test failed the minimum bar
fail_count=$(echo "$summary" | jq -r '
  (.total_tests - .success_count) +
  .chinese_contamination_count +
  .too_short_count
')

if [ "$fail_count" != "0" ]; then
  echo "⚠️  $fail_count issues detected — review $OUT_FILE before proceeding to staging"
  exit 1
fi

echo "✅ All $(echo "$summary" | jq -r .total_tests) tests passed basic quality gate"
