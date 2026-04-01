#!/bin/bash
# ─────────────────────────────────────────────────────────
# git-safety.sh — 未コミット変更を破壊する操作をブロック
# PreToolUse hook for Bash commands
# ─────────────────────────────────────────────────────────

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

if [ -z "$COMMAND" ]; then
  exit 0
fi

# ── 1. 完全禁止: git stash (pop失敗で変更消失のリスク) ──
if echo "$COMMAND" | grep -qE '(^|;|&&|\|)\s*git\s+stash\b'; then
  jq -n '{
    "hookSpecificOutput": {
      "hookEventName": "PreToolUse",
      "permissionDecision": "deny",
      "permissionDecisionReason": "🚫 git stash は禁止です（2026-04-01 事故: stash→pop失敗→drop で変更消失）。代替: WIPコミット or git worktree を使用してください。"
    }
  }'
  exit 0
fi

# ── 2. 完全禁止: git reset --hard ──
if echo "$COMMAND" | grep -qE '(^|;|&&|\|)\s*git\s+reset\s+--hard\b'; then
  jq -n '{
    "hookSpecificOutput": {
      "hookEventName": "PreToolUse",
      "permissionDecision": "deny",
      "permissionDecisionReason": "🚫 git reset --hard は禁止です。未コミット変更が完全に消失します。代替: git reset --soft or WIPコミット後に操作してください。"
    }
  }'
  exit 0
fi

# ── 3. 完全禁止: git checkout -- (ファイル復元=変更破棄) ──
if echo "$COMMAND" | grep -qE '(^|;|&&|\|)\s*git\s+checkout\s+--\s'; then
  jq -n '{
    "hookSpecificOutput": {
      "hookEventName": "PreToolUse",
      "permissionDecision": "deny",
      "permissionDecisionReason": "🚫 git checkout -- は禁止です。ファイルの変更が破棄されます。代替: 不要な変更は手動で Edit ツールで戻してください。"
    }
  }'
  exit 0
fi

# ── 4. 完全禁止: git clean -f ──
if echo "$COMMAND" | grep -qE '(^|;|&&|\|)\s*git\s+clean\s+-[a-zA-Z]*f'; then
  jq -n '{
    "hookSpecificOutput": {
      "hookEventName": "PreToolUse",
      "permissionDecision": "deny",
      "permissionDecisionReason": "🚫 git clean -f は禁止です。未追跡ファイルが完全に削除されます。"
    }
  }'
  exit 0
fi

# ── 5. 完全禁止: git restore . (全ファイル復元) ──
if echo "$COMMAND" | grep -qE '(^|;|&&|\|)\s*git\s+restore\s+\.'; then
  jq -n '{
    "hookSpecificOutput": {
      "hookEventName": "PreToolUse",
      "permissionDecision": "deny",
      "permissionDecisionReason": "🚫 git restore . は禁止です。全ファイルの変更が破棄されます。"
    }
  }'
  exit 0
fi

# ── 6. CEO承認必要: git add -A / git add . (秘密情報混入リスク) ──
if echo "$COMMAND" | grep -qE '(^|;|&&|\|)\s*git\s+add\s+(-A|--all|\.)'; then
  jq -n '{
    "hookSpecificOutput": {
      "hookEventName": "PreToolUse",
      "permissionDecision": "ask",
      "permissionDecisionReason": "⚠️ git add -A/. は .env や秘密情報を含む可能性があります。ファイルを個別指定してください（git add <file1> <file2>）。本当に全ファイル追加しますか？"
    }
  }'
  exit 0
fi

# ── 通過: 問題なし ──
exit 0
