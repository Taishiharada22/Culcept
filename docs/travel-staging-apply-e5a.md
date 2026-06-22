# Travel / Location Notes — Staging Apply 実行結果（Phase E-5A）

**実行日**: 2026-06-22
**結果**: 🛑 **BLOCKED（apply 未実施・staging 不変）** — migration history divergence で `db push` が拒否。production 不触。
**次**: 解消方針（migration repair / db pull / abort）は **CEO 判断**（下記）。

---

## 0. サマリ
ゲート（pre-flight → staging link → ref 二重確認 → migration diff → backup）は全通過。だが `supabase db push` が
**「Remote migration versions not found in local migrations directory」** で拒否し、**何も apply されなかった**。
原因＝staging に local 未所持の migration が 3 本あり、CLI が履歴乖離を安全ガードした。staging は **完全に不変**。

---

## 1. 実行ログ（ゲート通過まで）
- pre-flight: branch `claude/travel-connect-finish-20260621` / clean / unlinked / Docker 29.4.3 / CLI 2.75.0 ✅
- `supabase link --project-ref hjcrvndumgiovyfdacwc` → **直後 `cat project-ref` = `hjcrvndumgiovyfdacwc`（staging 完全一致・prod `aljavfujeqcwnqryjmhl` でない）** ✅
- `supabase migration list`:
  - local 未適用（push 対象）= **対象 5 本のみ**（20260621100000/100100/100200/100300/100400）✅
  - ⚠ **remote-only（local 未所持）= 3 本**: `20260613120000` / `20260615100000` / `20260616100000`
- backup: `supabase db dump --schema public -f backup/staging-schema-pre-e5a.sql` → 成功（616KB / 16,828 行・**未 commit**）✅

## 2. blocker（db push 拒否）
```
$ supabase db push
Remote migration versions not found in local migrations directory.
... try: supabase migration repair --status reverted 20260613120000 20260615100000 20260616100000
... and: supabase db pull
```
- `db push` は **apply を一切行わずに中断**（partial apply なし）。
- 原因: staging に **local repo に無い 3 migration**（他作業＝CoAlter 等が staging 適用済。memory: 「staging に 20260613120000 apply 済」）。
  この branch の local repo はそれらを含まないため、CLI が「履歴が remote と一致しない」と判断し push を拒否。

## 3. staging 不変の確認
push 後 `migration list` 再取得 → 5 本は依然 local-only（未適用）、3 本は依然 remote-only。**staging schema は変化なし**。
その後 `supabase unlink` → `project-ref` 不在を確認。

## 4. なぜ E-5A スコープで突破しなかったか（safety）
CLI が提示する突破策は 2 つとも **E-5A の禁止/危険域**:
- `supabase migration repair --status reverted 20260613120000 20260615100000 20260616100000`
  → staging の **migration 履歴テーブルを書き換え**（他チームの 3 migration を「reverted」扱い）。
  destructive な履歴改変・他作業への影響＝**E-5A 禁止（destructive rollback 相当）**。
- `supabase db pull`
  → staging の 3 migration を **local repo に取り込む**（無関係 migration ファイル 3 本を本 branch に追加）。
  スコープ外の取り込み・本 branch 汚染。
→ どちらも本フェーズの権限外。**停止して CEO 判断を仰ぐ**（停止条件「migration の差分が対象 5 本以外／destructive rollback が必要そう」に該当）。

## 5. CEO 判断オプション（次フェーズ）
1. **db pull で履歴整合 → push**: 3 remote-only migration を local に取り込み（別 commit/別 branch で管理）、その上で 5 本を push。
   - 利点: 履歴が正しく整合。欠点: 無関係 migration を本 branch に持ち込む（管理方針が要る）。
2. **3 migration を local repo に正規追加**（取得元の本来の branch/PR から）→ 整合 → push。
   - 利点: 出所が明確。欠点: 取得元の特定・取り込みが必要。
3. **staging 履歴を repair**（CEO が他チーム影響を承認した場合のみ）。
   - 非推奨（他作業の履歴を触る）。
4. **staging apply を保留**し、まず local repo と staging の migration 履歴を整合させる別タスクを先行。

→ 推奨: **①または②**（履歴を正として整合してから push）。repair は他作業への影響があるため避ける。

## 6. 安全確認
- production（`aljavfujeqcwnqryjmhl`）**完全不触**。全工程 ref=staging のみ。
- staging への **書込みゼロ**（push 拒否・apply なし）。backup（read-only dump）のみ実施。
- `supabase unlink` 済・`project-ref` 不在。
- backup file / `.temp` / `.branches` / env は **未 stage / 未 commit**。

## 7. 結論
E-5A の apply は **migration history divergence によりブロック**。staging は不変・production 不触。
解消は履歴整合（db pull or 正規取り込み）が前提で、これは **CEO 判断 + 別フェーズ**。本 commit は結果の記録（docs-only）。
