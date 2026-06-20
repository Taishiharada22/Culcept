# SR shift import productization — current inventory / merge readiness

> 区分: **read-only inventory（docs-only）**。新機能なし。巨大 local branch を「次に何へ進めるか判断できる状態」に整理する。
> branch `feat/plan-shift-import-productization`・base `499b6801`・**68 commits ahead**・**未 merge / 未 push**・**全 flag default OFF（dormant）**。

---

## 1. 完了した帯と状態

| 帯 | 内容 | 状態 |
|---|---|---|
| **S3A** | 在 app live draft flow → 確認画面（保存なし・原画像インライン照合） | 実装済 + local 確認（review flow） |
| **S-save** | 保存 action（production-deny + staging-allowlist guard・flag gated） | 実装済 + **staging smoke PASS**（S-save-3 / 4A replace / 4B conflict）。**production enablement 未** |
| **S-geo** | deterministic geometry 校正（day-center 入力）+ SourceCellZoom | 実装済 + **visual smoke PASS**（`19f63e0c`） |
| **Persist** | 校正値の恒久化（reducer 正本 → localStorage → reload 復元・座標のみ） | 実装済 + **visual smoke 6/6 PASS**・**凍結（保守対象）** |
| **A1** | confusable code soft hint + tier/directionality tuning | 実装済 + closeout（cell amber 過剰解消・保存 block なし） |
| **A2** | 本人行 cross-check（pure）+ rowLabel metadata + 本人行 warning banner | 実装済（pure + UI + render contract・保存 block なし） |
| **A3** | read-miss / 空欄分離（prompt 第3状態 + adapter D2 + risk D3） | 実装済（決定論側）。**read-miss 本体実観測 = confident misread が実在 → confidence-net は実保護限定的 → A4 で補完** |
| **A4** | source-cell consistency guard（画像 vs 抽出の存在不一致を soft 検出） | **帯クローズ・visual smoke PASS（DOM 確定: day3 のみ true）** |

- plan/shift 関連 unit/contract test: **64 ファイル**。tsc baseline **1112**。

## 2. flag default / dormant（read 確認済・全て env==="true" 必須＝未設定で OFF）

| flag | scope | default |
|---|---|---|
| `PLAN_SHIFT_IMPORT_SAVE` | server-only（NEXT_PUBLIC なし） | **OFF**（+ save action は production-deny + staging-allowlist guard） |
| `PLAN_SHIFT_DRAFT_LIVE_ENABLED` | server-only | **OFF** |
| `NEXT_PUBLIC_PLAN_SHIFT_IMPORT_ENTRY_ENABLED` | client（入口） | **OFF** |
| `PLAN_SHIFT_A4_VISUAL_SMOKE_PREVIEW` | server-only | **OFF**（+ NODE_ENV≠production で gate / production notFound） |

→ **default OFF / dormant は全て遵守**。merge しても本番は無効（DB write しない・入口出ない）。

## 3. 本番に絶対まだ出してはいけないもの（現状）

| 項目 | 状態 |
|---|---|
| committed dev routes（`dev-shift-draft` / `dev-shift-fixture` / `dev-a4-smoke`） | **全て gated**（flag OFF / production で `notFound()`）。merge しても本番不可視だが、merge 前に「dev route を main に載せるか」CEO 判断 |
| `dev-month-grid` | **untracked**（throwaway・branch に commit なし）→ merge に載らない |
| `private-eval/*` | **gitignored・branch に commit なし** ✓ |
| raw 画像 / base64 / VLM raw response / temp config / runner | **commit なし**（実行後削除・座標メタのみ保存）✓ |
| e2e `a4-source-mismatch-smoke.spec.ts` | **skip-guard 済**（flag なしで skip・通常 e2e/CI を壊さない）✓ |

## 4. merge / push / PR 前 blocker

| # | blocker | 状態 / 対応 |
|---|---|---|
| B1 | **dirty files: `supabase/.temp/*`（8 tracked）** | S-save staging link で変更された CLI cache（last-linked project 痕跡）。merge 前に HEAD 状態へ戻す（**禁止 checkout/restore は使わず** `git show HEAD:<f> > <f>` 等・または CEO/手動）。**唯一の実 dirty** |
| B2 | dev-only route の扱い | 3 つの committed dev route を main に載せるか（全 gated・production notFound）。**載せる/剥がす**は CEO 判断 |
| B3 | 新規 production migration | **branch に migration 追加なし**（`main..HEAD` の supabase/migrations = 空）→ **merge blocker なし** |
| B4 | auth/proxy 変更 | **proxy.ts 非変更** ✓ → blocker なし |
| B5 | production flag ON | **未設定（全 OFF）** → merge は dormant・blocker なし |
| B6 | staging DB write traces | 本番 DB write は**ゼロ**。staging smoke は staging のみ（repo 非混入）。痕跡は B1 の `.temp` のみ |

## 5. production 有効化前 blocker（merge とは別）

1. **production migration apply**（import_shift_roster 系を本番 DB へ）— CEO + DB op。
2. **production flag ON**（`PLAN_SHIFT_IMPORT_SAVE` / 入口 flag 等）— CEO。
3. **save action の production-deny 解除**（現状 production-deny + staging-allowlist。本番有効化時に段階解放）。
4. **read-miss 実保護の本番確認**（A4 が補完済・visual smoke PASS。production-chunked VLM での再 smoke は別 GO・VLM 必要）。

## 6. 次に進めるべき本流（最小 scope 候補）

| 候補 | 種別 | 備考 |
|---|---|---|
| **A) production enablement readiness（推奨・最小）** | **docs-only** | migration apply 計画 + flag rollout + canary + production-deny 段階解放を 1 枚に。実装/本番接触なし |
| B) merge cleanliness（B1 `.temp` 復元 + B2 dev route 方針） | 小 chore | merge 前提整備 |
| C) /plan month grid reflection | UI 実装 | 取込結果を月 grid に反映（新機能・別帯） |
| D) save path / in-app entry productization | 本番有効化 | §5 の gate を通す（CEO + DB） |
| E) messy 画像 A3 read-miss production-chunked 再 smoke | VLM smoke | A4 補完済のため優先度低・別 GO |

**推奨**: 実装に入る前に **A）production enablement readiness（docs-only）** で「この branch をどう本流化・本番化するか」を 1 枚に確定 → CEO 判断 → B（merge cleanliness）→ merge、の順。**新機能（C/D 実装）はその後**。

---

## 結論
- 8 帯すべて **local 着地**（A4 まで visual smoke PASS）・**全 flag dormant**・**auth/migration/raw 非接触**。
- merge 前の実 blocker は **B1（`supabase/.temp` 復元）+ B2（dev route 方針）の 2 点のみ**。production 有効化は §5 の CEO gate。
- **次の最小 scope = production enablement readiness（docs-only）**。実装着手は readiness 後に CEO 判断。
