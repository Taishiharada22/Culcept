# C2-a 実行結果: staging re-link 成功 / single apply は staging drift で STOP（docs-only）

> base: local main `bcf84157c` / branch: `claude/coalter-logic-resume-20260621`
> 実行日: 2026-06-21 / Build Unit / 次アクション: CEO 判断

## 達成
- ✅ **staging re-link 成功**: project-ref `aljavfujeqcwnqryjmhl`(production) → `hjcrvndumgiovyfdacwc`(staging)。
  **production link の危険状態を解消**（C2-a の主目的の一つ）。link は staging のまま維持。
- ✅ migration list 取得: **未適用（local-not-remote）= `20260613120000` の1本のみ**（停止条件②③クリア）。

## 🔴 STOP: single migration apply は実行できなかった
`supabase db push --dry-run`（**実適用なし**）が以下で拒否:
```
Remote migration versions not found in local migrations directory.
try repairing: supabase migration repair --status reverted 20260615100000 20260616100000
And: supabase db pull
```
- **原因 = staging drift**: staging に **local main tree に無い 2 migration** が適用済み:
  - `20260615100000_external_anchors_start_time_provenance.sql`
  - `20260616100000_duration_confirmations.sql`
  - 出自: branch `claude/xenodochial-chatelet-0023b2`（別ワークストリーム）。staging に適用されたが main 未統合。
- `db push` は local/remote の history 不一致を理由に **20260613120000 の apply を拒否**する。

## 禁止事項に抵触するため取れない解（実行しない）
- `supabase migration repair --status reverted ...` → **禁止（migration repair）**。かつ意味的に誤り（applied を reverted と詐称）。
- 直 SQL で 20260613120000 を staging に流す → migration history を bypass＝**drift を増やす**・推奨しない。

## CEO 判断を仰ぐ解消案
| 案 | 内容 | 評価 |
|---|---|---|
| **A. drift 2本を local main tree に取込**（推奨） | `xenodochial-chatelet` の `20260615100000`/`20260616100000` を main tree に restore（C1 と同じ file-restore パターン・additive）→ local が remote と一致 → `db push` が **20260613120000 のみ**を clean に apply | ✅ repair/pull 不要・history 整合・最小 |
| B. `supabase db pull` | remote schema/migrations を local に同期 | ⚠️ スコープ外・local を広く改変・2 migration + schema dump |
| C. migration repair | history を reverted 扱い | ❌ 禁止・意味的に誤り |
| D. 直 SQL apply | history bypass | ❌ drift 増・非推奨 |

→ **推奨 = 案 A**（drift 2本の file-restore を別 CEO gate で承認 → C2-a 再試行で 20260613120000 を clean apply）。
これは「staging を正とし local main を追従させる」整合化で、xenodochial workstream の main 統合とも重なるため
**その整合は xenodochial 側 or 統合セッションの所掌**である点に注意（本トラックが勝手に他系統 migration を main へ統合しない）。

## 無書込・状態確認
- DB write ゼロ（link / migration list[read] / db push --dry-run のみ・apply/seed/INSERT なし）。
- 4 table 未作成（apply していないため検証不可）。RLS/policy 検証も未到達。
- git diff = `supabase/.temp/*` のみ（gitignored・**commit しない**）。他に意図しない差分なし。
- CLI link = staging 維持（production には戻さない＝危険状態を残さない）。

## C2-b（seed/read smoke）に進めるか
**NO**。C2-a の apply が未完のため C2-b の前提（4 table 実在）が無い。
再開条件: 案 A（drift 2本取込）等で `db push` blocker を解消 → 20260613120000 を staging apply → table/RLS 確認 → 然る後 C2-b。
