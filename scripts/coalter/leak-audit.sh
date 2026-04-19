#!/usr/bin/env bash
#
# CoAlter Stage 1 Understand — 漏洩監査 (Gate E-6 / E-7)
#
# [CEO lock 2026-04-20 M0-6A 追加lock2]
#   `lib/coalter/understanding/` 配下に prompt / rawOutput / rawRationale /
#   implicitIntent の識別子がプロパティとして混入していないことを grep で確認する。
#
# 使い方:
#   bash scripts/coalter/leak-audit.sh
#   （CI でも実行可能）
#
# 本スクリプトは leakAudit.test.ts の軽量ミラーとして機能する。
# 正式な機械判定は vitest 側（leakAudit.test.ts）で行う — こちらは人間向け速報。

set -euo pipefail

cd "$(git rev-parse --show-toplevel 2>/dev/null || echo "$(dirname "$0")/../..")"

TARGET_DIR="lib/coalter/understanding"
FAIL=0

check_property() {
  local name="$1"
  local scope="$2"
  # プロパティアクセス or プロパティ定義のみに絞る
  # \.name\b | name\s*: | name\?\s*:
  local pattern="(\\.${name}\\b|\\b${name}\\s*:|\\b${name}\\?\\s*:)"
  # コメント行と _ForbiddenKeys union 行を除外するのは複雑なので、
  # ここでは hits を出すだけ（精密判定は vitest 側）
  local hits
  hits=$(grep -RHn -E "$pattern" "$scope" 2>/dev/null || true)
  # コメント行（先頭 //、先頭スペース＋//、/* 行、* 行）を除外
  hits=$(echo "$hits" | grep -vE "^\s*[^:]+:[0-9]+:\s*(//|\*|/\*)" || true)
  # _ForbiddenKeys union の "..." 列挙を除外（雑だが実用）
  hits=$(echo "$hits" | grep -vE '"(prompt|rawOutput|rawRationale|implicitIntent)"' || true)
  if [ -n "$hits" ]; then
    echo "─── $name hits ($scope) ───"
    echo "$hits"
    FAIL=1
  fi
}

echo "[leak-audit] Gate E-6: prompt / rawOutput / rawRationale (全面禁止)"
check_property "prompt" "$TARGET_DIR"
check_property "rawOutput" "$TARGET_DIR"
check_property "rawRationale" "$TARGET_DIR"

echo "[leak-audit] Gate E-7: implicitIntent (allowlist: todayReader.ts / todayReaderLLM.ts / types.ts / adversarialStubs.ts)"
# implicitIntent は経路限定なので、allow list ファイルを grep から除外
ALLOW_LIST=(
  "$TARGET_DIR/todayReader.ts"
  "$TARGET_DIR/todayReaderLLM.ts"
  "$TARGET_DIR/types.ts"
  "$TARGET_DIR/__testkit__/adversarialStubs.ts"
)
EXCLUDES=""
for f in "${ALLOW_LIST[@]}"; do
  EXCLUDES="$EXCLUDES --exclude=$(basename "$f")"
done
# shellcheck disable=SC2086
hits=$(grep -RHn -E "(\.implicitIntent\b|\bimplicitIntent\s*:|\bimplicitIntent\?\s*:)" $EXCLUDES "$TARGET_DIR" 2>/dev/null || true)
hits=$(echo "$hits" | grep -vE "^\s*[^:]+:[0-9]+:\s*(//|\*|/\*)" || true)
if [ -n "$hits" ]; then
  echo "─── implicitIntent hits (許可外ファイル) ───"
  echo "$hits"
  FAIL=1
fi

if [ $FAIL -eq 0 ]; then
  echo "[leak-audit] OK — 4 identifier 全て経路違反なし"
  exit 0
else
  echo "[leak-audit] FAIL — 上記 hits を確認してください"
  exit 1
fi
