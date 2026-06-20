# SR A3 smoke readiness — read-miss / 空欄分離の実画像検証（観測設計のみ）

> 区分: **readiness（docs-only）**。本書は smoke の観測設計のみ。**VLM は回さない**。
> 実行は別 CEO GO。raw 画像 / crop / base64 / VLM raw response は **commit しない**。
> 対象 commit: A3-1 + A3-2 `a7c870aa`（prompt 第3状態 / adapter D2 / risk model D3）。

---

## 0. 目的

A3 は「VLM を賢くする」のではなく、**VLM が読めなかったセルを空欄として silent skip させない安全契約**を作る段階。
本 smoke は、その契約が**実画像で実際に効くか**を観測で確認する（合否の確定ではなく、効き目の観測 + 退行検出）。

A3 の前提（決定論側）は既に固定済み（unit 70 + plan 4842 PASS・敵対的検証 4/4）。
残る不確実性は **VLM の振る舞い**（read-miss を低 conf に寄せるか / confidence を省略しないか）だけであり、それは実画像でしか分からない。

---

## 1. セットアップ（実行は別 GO）

- 入口: 既存 dev host（在app live flow・`PLAN_SHIFT_DRAFT_LIVE_ENABLED` / `PLAN_SHIFT_DRAFT_HOST` gate）。
- 画像: 既知の assisted-crop（本人行）。**新規取得しない**（既存検証画像を流用）。
- 保存: `saveEnabled=false`（確認画面まで・保存しない）。`PLAN_SHIFT_IMPORT_SAVE` は **false 厳守**。
- 観測面: per-cell の `rawCode` + `confidence` を確認できる経路が必要。
  - 既存 `lib/plan/shift/devShiftDraftDebugSummary.ts` を観測面として使う。
  - もし per-cell confidence が露出していなければ、**A3-smoke-pre**（dev 専用・保存非接触の debug readout 追加）を先に小さく切る（別 readiness）。
- prompt: combined hardened（A3-1 適用済）。**prompt は再変更しない**。

---

## 2. 観測項目（CEO 指定 8 点）

| # | 観測 | 方法 | 期待 |
|---|---|---|---|
| 1 | read-miss が low confidence に寄るか | かすれ・潰れセルの `confidence` を読む | ≤ 0.3 付近に寄る（高 conf 空欄に化けない） |
| 2 | confidence omission が起きるか | VLM 出力に `confidence` が無いセルの有無 | 省略率を**数値で記録**（0 が理想・非0なら #3 が効く） |
| 3 | omission 時に 0.5 fallback が効くか | confidence 欠落セルの確認画面 confidence | `BLANK_MISSING_CONFIDENCE`=0.5（空欄のみ）→ amber 点灯 |
| 4 | 確実な空欄が flood しないか | 高 conf 孤立空欄（正規の休み）の amber / panel | blank_risk に**出ない**（過剰 amber なし） |
| 5 | 低 conf 空欄が amber / risk panel に出るか | read-miss 由来の低 conf 空欄 | amber 点灯 + risk panel に blank_risk |
| 6 | coverage / day-keyed / column drift の退行 | missing / duplicate / 列ずれの有無 | B1a-v3 比で**退行なし** |
| 7 | save path に影響がないか | 保存 CTA・blockSave の挙動 | A3 前と同一（soft は active / hard は block） |
| 8 | raw 画像 / base64 / VLM raw response を保存しないか | 出力・ログ・commit 差分 | **保存も commit もしない** |

---

## 3. 判定の考え方

- **合格扱い**: #1 が寄る ∧ #4 flood なし ∧ #5 amber/panel 点灯 ∧ #6 退行なし ∧ #7 save 不変。
- **観測継続（blocker でない）**: #2 omission が出ても、#3 の 0.5 fallback が効けば silent skip は防げている（CEO 判断: 省略率が高ければ parser 側補正を次段で検討）。
- **要対応**: read-miss が**高 conf 空欄**で返り続ける（#1 が寄らない）場合 → prompt 強化 or parser 側補正を別トラックで検討（A3 の決定論側は既に最善で固定済み。これは VLM 側の限界観測）。
- 高 conf 孤立空欄を「確実な空欄」として通す設計は維持（#4 が flood しないことの裏返し）。

---

## 4. 禁止（本 readiness 段階・smoke 実行段階とも）

```
本 readiness 段階: VLM 実行・コード変更（観測設計のみ）
smoke 実行段階（別 GO）: 保存再実行 / DB write / PLAN_SHIFT_IMPORT_SAVE=true /
  production / push / PR / deploy / raw 画像・base64・VLM raw response の commit
```

---

## 5. 結論

- A3 の決定論側は `a7c870aa` で固定。残る不確実性は VLM の振る舞いのみ。
- 本 smoke は **8 観測項目**で「読めないものを空欄として逃がさない契約」が実画像で効くかを見る。
- **本書は観測設計のみ。VLM は回さない**。実行は別 CEO GO。
- 必要なら先に **A3-smoke-pre**（dev 専用 per-cell confidence readout・保存非接触）を小さく切る。
