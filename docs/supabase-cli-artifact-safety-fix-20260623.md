# Supabase CLI artifact safety fix（2026-06-23）

**branch**: `claude/supabase-cli-artifact-safety-fix-20260623`（base `a9eedce69`）
**目的**: tracked になっていた Supabase CLI runtime artifact、特に **production を指す `project-ref`** を git 管理から外し、fresh checkout で CLI が production-linked になる事故を恒久的に防ぐ。

---

## 1. 事象（地雷）
- `supabase/.temp/project-ref` が **git 管理下（tracked）** のまま commit されていた。
- 内容 = **`aljavfujeqcwnqryjmhl`（production ref）**。
- 初回混入 commit: `a6bceebea feat: add vision pipeline (no venv)`。
- 影響: `a9eedce69`（新共通 base）系から **fresh checkout すると working tree に production の `project-ref` が展開され、Supabase CLI が production-linked 状態**になる。誤って `supabase db push` 等を実行すると **production 直撃**の危険。
- 既存 `.gitignore` には `supabase/.temp/`（line 74）が**あったが、tracking 後に追加されたため無効**（ignore は既 tracked file を untrack しない）。

## 2. tracked だった CLI artifact（8件）
```
supabase/.temp/cli-latest
supabase/.temp/gotrue-version
supabase/.temp/pooler-url
supabase/.temp/postgres-version
supabase/.temp/project-ref        ← production ref（aljavfujeqcwnqryjmhl）
supabase/.temp/rest-version
supabase/.temp/storage-migration
supabase/.temp/storage-version
```
`supabase/.branches/` は tracked ファイルなし（予防的に .gitignore へ追加）。

## 3. 対応
1. `.gitignore` に `supabase/.temp/`（既存）+ `supabase/.branches/` を明記、経緯コメント追加。
2. `git rm --cached -r supabase/.temp`（**index からのみ削除・working tree のローカル artifact は保持**）。
3. 結果: `git ls-files supabase/.temp supabase/.branches` = **空**（以後 commit されない）。

## 4. 安全境界（本 fix で実施していないこと）
- DB / Supabase remote 操作: **ゼロ**（link/unlink/db push/db pull/repair/SQL/seed なし）。
- production 接続: なし。`.env.local` commit: なし。reset --hard / origin-main push / deploy: なし。
- working tree のローカル `project-ref`（この worktree 内）は CEO 指示「必要以上に触らない」に従い保持（untracked + gitignored 化済・DB 操作は本 worktree で一切行わない）。

## 5. 横展開
- 本 fix（.gitignore + untrack）は Travel branch `claude/travel-connect-on-a9eedce69-20260623` 等、同 base 系の全 branch へ反映推奨（cherry-pick 1 本）。CEO 判断で実施。
