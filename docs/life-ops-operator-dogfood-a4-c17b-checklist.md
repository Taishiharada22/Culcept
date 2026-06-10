# Life Ops — A-4-c17b Operator Dogfood Checklist（CEO 実行・1 action・1 row・cleanup 込み）

> 2026-06-11 / CEO・GPT GO。**Claude は UI 操作を実行しない**（operator ログインに credential 入力が必要で、
> Claude が browser 経由で行うと secret が transcript に露出するため＝「secrets 管理は CEO のみ」原則）。
> 本書は CEO 実行用の手順・preflight 12 項目・abort 基準・報告テンプレート。
> **禁止**: done・cadence 更新・2 件以上 write・production write・PlanClient/R4/notification/external API/本線 merge/push/PR/merge。

---

## 0. 対象 action = `later`（後で）

GPT 推奨どおり **later** を採用。理由: ①意味が最も軽い（採用 intent でも不要 suppression でもない）②cadence 影響なし（c13 lock）
③万一 cleanup 漏れでも将来学習への歪みが最小。UI 状態により accept/dismiss に変える場合は理由を記録し **1 action のみ**。

## 1. Preflight 12 項目（GPT 指定 → 確認方法）

| # | 項目 | 確認方法 |
|---|---|---|
| 1 | staging ref = `hjcrvndumgiovyfdacwc` | 手順 A の smoke が `target = staging host hjcr…` を表示（不一致は fatal 停止） |
| 2 | production ref でない | 同 smoke の PRODUCTION GUARD（fatal）+ gate test「production URL → 常に false」 |
| 3 | production env / service_role 誤用なし | 同 smoke が anon key の service_role 混入を fatal 検査・NODE_ENV=production fatal |
| 4 | operator auth / preview gate 成立 | 手順 C でページが Disabled でなく rail が見える（=三重 gate+flag+auth 全通過） |
| 5 | `REALITY_PIPELINE_PREVIEW` | 手順 B の起動コマンドに含む（`=== "true"` 判定） |
| 6 | `LIFEOPS_FEEDBACK_WRITE` | 同上 |
| 7 | `LIFEOPS_REALDATA_READONLY` | 同上 |
| 8 | `LIFEOPS_FEEDBACK_READONLY` | 同上 |
| 9 | before lifeops row count = 0 | 手順 A の smoke 出力 `lifeops_prefix=0`（≠0 なら**押す前に停止**） |
| 10 | 対象は accept\|later\|dismiss の 1 つ | 本書 §0（later）・1 回だけ押す |
| 11 | done は押せないまま | 手順 C で 完了※ が chip（押せない）であることを目視 |
| 12 | cleanup 手順が先に用意済み | 本書 §2-E（`scripts/lifeops-feedback-dogfood-cleanup.ts`・check→confirm 二段）が**押す前に存在** |

## 2. 手順（A→G・全コマンドは repo root で実行）

**A. preflight + before counts（read-only）**
```bash
LIFEOPS_FEEDBACK_SMOKE_GO=1 LIFEOPS_REALDATA_READONLY=true LIFEOPS_FEEDBACK_READONLY=true \
NODE_OPTIONS="--conditions=react-server" npx tsx scripts/lifeops-feedback-readonly-smoke.ts
```
期待: `target = staging host hjcrvndumgiovyfdacwc…` / `lifeops_prefix=0` / `observations=0` / `cadence=0`。**≠0 なら停止**。

**B. dev server を flags 付きで起動**（.env.local の staging 接続をそのまま使用・flag は端末セッション限定＝永続化しない）
```bash
REALITY_CANDIDATE_ACTIONS_DEV_HOST=true REALITY_PIPELINE_PREVIEW=true \
LIFEOPS_REALDATA_READONLY=true LIFEOPS_FEEDBACK_READONLY=true LIFEOPS_FEEDBACK_WRITE=true \
npm run dev
```

**C. UI dogfood（1 回だけ）**
1. ブラウザで `http://localhost:3000/plan/dev-reality-pipeline` を開く
2. **dedicated test user（STAGING_USER_A・id 末尾 …42d0）でログイン**（cleanup が owner-RLS で同一 user 前提）
3. Life Ops Preview の Morning 代表に action rail（`採用 完了※ 後で 不要`）が見えること・**完了※が押せない**（chip）ことを確認
4. **どれか 1 候補の「後で」を 1 回だけ押す**（押した候補の label をメモ）
5. 結果表示が「**記録しました（preview 限定・本線には反映されません）**」であることを確認（別文言なら記録して停止）

**D. read-after-write（read-only）** — 手順 A と同じコマンドを再実行。
期待: `lifeops_prefix=1` / `observations=1` / **`cadence=0`**（later は cadence にならない）。

**E. cleanup（check → confirm の二段）**
```bash
# 1) check（削除しない・対象 1 件と handle を確認）
LIFEOPS_DOGFOOD_CLEANUP_GO=1 NODE_OPTIONS="--conditions=react-server" npx tsx scripts/lifeops-feedback-dogfood-cleanup.ts
# 2) 対象 1 件を確認できたら delete
LIFEOPS_DOGFOOD_CLEANUP_GO=1 LIFEOPS_DOGFOOD_CLEANUP_CONFIRM=1 NODE_OPTIONS="--conditions=react-server" npx tsx scripts/lifeops-feedback-dogfood-cleanup.ts
```
exact 条件: owner-RLS ∧ `handle LIKE 'lifeops:%'` ∧ `source_kind='lifeops'` ∧ `action='later'` ∧ `acted_at ≥ now-6h` ∧ **一致 1 件時のみ実測 handle に eq 完全一致で削除**。0 件=冪等 PASS・2 件以上=削除せず fatal 停止。

**F. after count 0（read-only）** — 手順 A を再実行。期待: `lifeops_prefix=0` / `observations=0` / `cadence=0`。

**G. dev server 停止**（Ctrl-C）。

## 3. Abort 基準（いずれかで**押さずに/それ以上進めずに**停止 → Claude へ報告）
- A で lifeops_prefix ≠ 0 ／ C で rail が見えない・完了※が押せてしまう・結果文言が想定外 ／ D で counts が期待外 ／ E check で対象 ≠1 件。

## 4. 報告テンプレート（counts/boolean のみ・PII/credential/raw row は貼らない）
```
A before: lifeops=0 / obs=0 / cadence=0（host=hjcr… 表示確認: はい）
C: rail 表示=はい / 完了※不可=はい / 押した action=later（候補 label=◯◯） / 結果表示=「記録しました（preview 限定・…）」
D after-write: lifeops=1 / obs=1 / cadence=0
E cleanup: check=1 件（handle=lifeops:◯◯） / delete 後 lifeops=0
F final: lifeops=0 / obs=0 / cadence=0
```
