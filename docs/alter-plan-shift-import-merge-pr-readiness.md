# SR shift import — merge / push / PR readiness（docs-only・最終手順書）

> 区分: **readiness（docs-only・最終手順書）**。**実 push / PR / merge はしない**。
> 目的: 巨大 productization branch を安全に push → PR → merge するための手順・checklist・PR body を確定する。
> 禁止: push / PR 作成 / merge / production migration apply / flag ON / DB write / proxy.ts 変更 / dev route 削除 / raw・base64 commit。

---

## 1. branch 状態

| 項目 | 値 |
|---|---|
| branch | `feat/plan-shift-import-productization` |
| base | `499b6801` |
| ahead | **71 commits**（base 起点・docs 補正 commit で逐次 +1） |
| diff scope | **103 files・+11080 / −359** |
| 内訳 | docs 27 / tests 33 / source 43 |
| working tree | `?? app/(culcept)/plan/dev-month-grid/*`（untracked throwaway）**のみ** |
| `dev-month-grid/*` | **untracked = PR に載らない**（never committed throwaway・無視で可・CEO 任意で削除） |
| 未 merge / 未 push | はい（local only） |

## 2. push 前 checklist（実行は別 GO）

```
git status --short --untracked-files=all      # dev-month-grid のみ untracked であること
git diff --stat main...HEAD                    # 103 files・scope 確認
git diff --name-only main...HEAD               # forbidden file 非混入を grep
NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit   # 1112
npx vitest run tests/unit/plan/                # plan tests PASS
# forbidden grep（下記 §3 パターンが diff に無いこと）
```
- 現時点の実測: tsc **1112** / plan **4919 PASS** / forbidden file **混入ゼロ**（確認済）。

## 3. forbidden / stage 禁止（PR に入れない）

```
supabase/.temp/*   dev-month-grid/*   private-eval/*   .env.local
raw image   crop image   base64   VLM raw response   temp config   runner   demo
```
- **現状の commit 済 diff にこれらは無い**（`git diff --name-only main...HEAD` で確認済）。private-eval は gitignored、`.temp` は HEAD へ復元済（diff 外）、dev-month-grid は untracked。

## 4. PR に含まれる大きな帯（PR body 用）

| 帯 | 1-2 行説明 |
|---|---|
| **S3A** | 在 app の live draft flow（VLM 抽出→確認画面・保存なし）+ 原画像インライン照合。 |
| **S-save** | 保存 action（RPC）+ **production-deny + staging-allowlist guard**（flag だけに頼らず env 誤設定でも本番保存を遮断）。staging smoke PASS。 |
| **S-geo** | day-center 入力からの deterministic グリッド geometry 校正 + SourceCellZoom。 |
| **Persist** | 校正値を reducer 正本→localStorage→reload 復元で恒久化（座標メタのみ・raw 非保存）。 |
| **A1** | confusable code soft hint + tier/directionality tuning（cell amber 過剰抑制・保存 block なし）。 |
| **A2** | 本人行 cross-check（pure）+ rowLabel metadata + 本人行 warning banner。 |
| **A3** | read-miss / 空欄分離（prompt 第3状態 + adapter + risk model）。confident misread が実在と判明 → A4 で補完。 |
| **A4** | source-cell consistency guard（画像 vs 抽出の存在不一致を soft 検出）。**visual smoke PASS**。 |
| **production readiness** | inventory / production-enablement / 本 merge-PR readiness（docs-only・本番化は段階 gate）。 |

## 5. dormant / safety（PR body 必須）

```
all flags default OFF（PLAN_SHIFT_IMPORT_SAVE / PLAN_SHIFT_DRAFT_LIVE_ENABLED /
  NEXT_PUBLIC_PLAN_SHIFT_IMPORT_ENTRY_ENABLED / PLAN_SHIFT_A4_VISUAL_SMOKE_PREVIEW）
PLAN_SHIFT_IMPORT_SAVE default OFF（server-only・NEXT_PUBLIC なし）
production-deny + staging-allowlist guard remains（save action の多重防御）
dev routes are gated and production notFound
PLAN_SHIFT_A4_VISUAL_SMOKE_PREVIEW は production 常に OFF / notFound
no raw image / base64 / VLM raw response committed
no production DB write（branch 全体で本番 DB 非接触）
no new migration in branch（sr_shift_import_* は main 既存）
proxy.ts / auth 非変更
```
→ **merge しても本番は無効**（DB write しない・入口出ない）。

## 6. dev route 方針（確定）

```
dev-shift-draft / dev-shift-fixture / dev-a4-smoke は gated のまま main に残置
（全 gated・production notFound・auth 配下・回帰/検証価値あり）
release 前に必要なら別 commit で削除（本 readiness では削除しない）
```

## 7. PR body draft（下書き）

```markdown
## Summary
Shift-roster image import → review → (gated) save productization. Eight bands
land behind default-OFF flags; nothing is enabled in production by this PR.

## Completed bands
- S3A — in-app live draft flow (VLM extract → review screen), no save, source-image inline collation.
- S-save — save RPC with production-deny + staging-allowlist guard; staging smoke PASS.
- S-geo — deterministic grid geometry calibration from day-center input + SourceCellZoom.
- Persist — calibration persisted (reducer → localStorage → reload restore), coordinates only.
- A1 — confusable-code soft hints, tier/directionality tuned.
- A2 — person-row cross-check + rowLabel metadata + warning banner.
- A3 — read-miss / blank separation (prompt 3rd state + adapter + risk model).
- A4 — source-cell consistency guard (image vs extraction presence mismatch); visual smoke PASS.

## Safety / flags
- All flags default OFF (import-save / draft-live / entry / A4-smoke-preview).
- PLAN_SHIFT_IMPORT_SAVE off (server-only); save action keeps production-deny + staging-allowlist.
- Dev routes gated + production notFound; A4 smoke flag always OFF in production.
- No raw image/base64/VLM raw response committed; no production DB write; no new migration; proxy.ts/auth untouched.

## Verification
- tsc baseline 1112 (unchanged).
- tests/unit/plan/ — 249 files / 4919 tests pass.
- A4 visual smoke PASS (DOM-confirmed: only day3 source-mismatch, save dormant).

## Not included
- No production migration apply, no flag ON, no save in production.
- dev-month-grid is an untracked local throwaway (not in this PR).

## Production enablement (next, separate gates)
- See docs/alter-plan-shift-import-production-enablement-readiness.md (P0-P5, save last, two-layer opt-in).

## Rollback
- Flags OFF returns everything to dormant; save guard stays production-deny until a future P4 double-opt-in.
```

## 8. merge 前の最終確認（PR 作成前）

```
tsc --noEmit = 1112
plan tests PASS
git status = dev-month-grid のみ untracked
diff scope = 103 files・forbidden 非混入
forbidden grep = 0 hit
dev route gate check（flag OFF / production notFound）
production flag default OFF check（4 flag すべて env 未設定で false）
```

## 9. merge / push / PR の実行手順（**実行は別 GO**）

```
1. push branch    : git push -u origin feat/plan-shift-import-productization
2. create PR      : base=main / head=branch / body=§7 draft（gh pr create）
3. wait CI        : tsc + tests green を確認
4. review diff    : 103 files・forbidden 非混入・flag OFF を再確認
5. merge          : **CEO GO 後のみ**（squash or merge は CEO 方針）
```
- 各 step は **CEO GO 待ち**。push すら未実施。

## 10. まだ禁止（本 readiness 中も厳守）

```
push / PR 作成 / merge / production migration apply / production flag ON /
PLAN_SHIFT_IMPORT_SAVE=true / DB write / VLM 再実行 / 保存再実行 /
proxy.ts 変更 / auth 例外追加 / dev route 削除 / raw・base64・VLM raw response commit
```

---

## 結論
- branch は **71 commits・103 files・forbidden 非混入・全 flag dormant・tsc 1112 / plan 4919 PASS**＝**安全に push/PR できる状態**。
- 本書は手順書（docs-only）。**実 push → PR → merge は §9 を CEO GO 後に**。次は CEO が **push / PR 作成の可否**を判断。
