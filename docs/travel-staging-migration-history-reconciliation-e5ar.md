# Staging Migration History Reconciliation Audit（Phase E-5A-R）

**作成日**: 2026-06-22
**ステータス**: 🔎 audit only（read-only 調査・整合方針決定）。**repair / db pull / db push / link / migration 取り込みは未実施。**
**前提**: E-5A は staging の remote-only migration 3本との history divergence で `db push` が拒否 → BLOCKED（staging 不変・prod 不触）。

---

## 0. サマリ
remote-only 3本は **すべて CoAlter/plan のmigration**（Travel 無関係）で、canonical なファイルは
local branch `claude/coalter-logic-resume-20260621`（+ origin backup 群）に存在する。
別セッションが既に「staging drift file-restore（history 整合準備）」として復元済み。
→ **推奨: その canonical 3本を Travel branch（or 共有 base）に取り込んで history を整合 → E-5A retry**。
（`db pull`=生成物が canonical と一致しない懸念・`migration repair`=staging 履歴改変で他作業影響、ともに非推奨。）

---

## 1. 作業前確認
- branch `claude/travel-connect-finish-20260621` / HEAD `7ec5c2e56` / source clean。
- `supabase/.temp/project-ref`: **absent（unlinked）** ✅。
- `backup/staging-schema-pre-e5a.sql`: **untracked のまま**（未 stage・未 commit）✅。

## 2. remote-only 3本の local 探索結果
現 Travel tree（`supabase/migrations/`）には **3本とも存在しない**。`git log --all` で全て発見:

| version | filename | 復元 commit（最新） | 由来 |
|---|---|---|---|
| 20260613120000 | `20260613120000_plan_coalter_session_messages.sql` | `eb0a00786` C1 migration gap 解消（plan_coalter_session_messages DDL 復元） | CoAlter |
| 20260615100000 | `20260615100000_external_anchors_start_time_provenance.sql` | `7366d4429` C2-a-unblock — staging drift 2本 file-restore | plan U1（startTimeSource provenance） |
| 20260616100000 | `20260616100000_duration_confirmations.sql` | `7366d4429`（同上） | plan RD3c（duration_confirmations） |

- 内容 sanity（read-only）: 0613=`plan_coalter_sessions/...session_participants/session_messages` 等の CREATE TABLE。
  0615=`ALTER TABLE external_anchors ...`（provenance 列追加）。0616=`CREATE TABLE duration_confirmations` + RLS。

## 3. branch / commit / filename 発見可否
✅ **すべて発見**。canonical 3本は **`claude/coalter-logic-resume-20260621` の HEAD に実在**（`git ls-tree` 確認）。
origin backup（`origin/backup/coalter-logic-resume-*`・計 17 ref）にも含まれる。
→ **`git fetch` は不要**（必要な ref は既に local に存在）。fetch は local refs を変えるため本フェーズでは実行しない。

## 4. 3本の性質分類
| version | 系統 | Travel 関係 | main に入るべきか | staging drift | production 存在 |
|---|---|---|---|---|---|
| 20260613120000 | **CoAlter**（plan_coalter_*） | 無関係 | yes（CoAlter logic resume の成果） | あり（staging 適用済） | **不明（未確認・推測しない）** |
| 20260615100000 | **plan**（external_anchors provenance / U1） | 無関係 | yes | あり | **不明** |
| 20260616100000 | **plan**（duration_confirmations / RD3c） | 無関係 | yes | あり | **不明** |

→ 3本は **Travel と完全に無関係**。CoAlter/plan 作業が staging に適用したが、本 Travel branch / main には未マージ＝drift。
production への存在は **link しないと確認できないため不明**（memory では「CoAlter logic resume は production 未適用」とあるが本監査では未検証）。

## 5. Travel との関係
**なし**。Travel migration（100000〜100400）とは別ドメイン。Travel の push が拒否されるのは
「同じ migrations ディレクトリ＝グローバル history」を共有するため、他作業の drift が Travel push を巻き込んでいるだけ。

## 6. 整合オプション比較
| 案 | 内容 | pros | cons / risk |
|---|---|---|---|
| **A** | canonical 3本を `coalter-logic-resume-20260621` から **verbatim copy**（cherry-pick/copy）して local（Travel branch or 共有 base）へ取り込み | staging と byte 一致（既適用と同一）＝`db push` で **再適用されず**、Travel 5本のみ apply。即 unblock | Travel branch に CoAlter/plan migration が乗る（ドメイン混在に見えるが migrations はグローバル資源＝許容）。出所 branch の管理が要る |
| **B** | `supabase db pull` で staging から migration 生成 | branch 探索不要 | 生成物は canonical SQL と**一致しない**（schema diff・命名/内容ズレ）。0615 は破壊的 ALTER を含み pull 再現が危険。**非推奨** |
| **C** | Travel staging apply を保留し、**main/staging の migration history を別セッションで先に整合**（CoAlter/plan を正規ルートで main へ） | 最も正しい（3本は本来 CoAlter/plan の home から main 経由で history へ） | Travel staging apply が待つ |
| **D** | `migration repair --status reverted ...` | （CLI 提案） | staging 履歴を改変・他作業影響。**禁止/非推奨**（CEO 既決） |

## 7. 推奨案
- **第一推奨: A（verbatim copy）+ byte 一致検証 → E-5A retry**。
  - 3本は staging に適用済みのものと同一ファイルゆえ、取り込んでも `db push` は再実行せず（remote に既存）、Travel 5本のみ apply される。
  - 取り込み前に `git diff` で `coalter-logic-resume-20260621` 版と **byte 一致**を確認（改変ゼロ）。
  - 取り込み先（Travel branch に直接 / 共有 base / cherry-pick）は CEO 判断。migrations はグローバルなので Travel branch でも整合上は問題なし。
- **戦略的により正しいのは C**（CoAlter/plan を本来の branch から main へマージし history を一本化）。Travel staging apply を急がないなら C → 後で Travel push。
- **B / D は非推奨**。

> どちらでも production には触れない。repair はしない。

## 8. E-5A retry に進める条件
1. canonical 3本（0613/0615/0616）が local `supabase/migrations/` に存在し、`coalter-logic-resume-20260621` 版と **byte 一致**。
2. （A 採用時）取り込みを commit（取り込み先は CEO 承認）。
3. re-link 後 `supabase migration list` で **remote-only 0本**（3本が applied-both）・**local-only=Travel 5本**。
4. 「Remote migration versions not found in local」エラーが出ないこと。
5. E-5A の go/no-go（unlinked 確認・ref 二重確認 staging・backup・CEO GO・stop conditions）を再充足。
→ 満たせば db push は Travel 5本のみ apply。

## 9. DB/Supabase remote 不触確認
本フェーズは **read-only git 調査 + docs のみ**。link/unlink/db push/db pull/repair/remote SQL：**なし**。`project-ref` absent。`git fetch` 未実行（不要）。

## 10. backup file の扱い
`backup/staging-schema-pre-e5a.sql`（E-5A の read-only dump・616KB）は **local 保持・untracked・未 commit**。巨大/機密性のため commit しない。E-5A retry の forward-fix 参照用に残す。

## 11. 次フェーズ
- **E-5A-R-apply（別 GO・CEO 判断）**: 推奨 A or C を選択し history 整合 → **E-5A retry**（staging apply）。
- production apply / flag 点火 / Calendar 本切替 はさらに別 GO。
