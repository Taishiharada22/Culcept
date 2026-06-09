# PRG Readiness operator console — mini-design + 実装（flag OFF・dev smoke 待ち）

> 2026-06-09 / Build Unit。dev/operator 専用・read-only・flag OFF・production hard block・user-facing UI でない。

PRG 各軸が **data不足 / dogfood中 / activation候補 / 懸念 / 休止** のどこにいるかを operator が一望する内部表示。

---

## 1. operator surface audit（挿入先）
- ★既存 **`/ceo` dashboard**（`app/(culcept)/ceo/CeoDashboardClient.tsx`・CollapsibleSection + Card パターン）= CEO 提案の挿入先。
- 一般ユーザーの **`/plan` 体験には不接触**（別ルート）。heavy route を新設しない。
- → `CollapsibleSection` を 1 つ追加（feedback section の後・Quick Actions の前）。**flag OFF→非描画→/ceo 完全不変**。

## 2. 実装（flag OFF・read-only）
- **`prgReadinessConsole.ts`**: flag `PRG_READINESS_CONSOLE_ENABLED`(default OFF・gate `flag ∧ NODE_ENV!==production`)
  + `PRG_AXIS_LABEL` / `PRG_STATE_DISPLAY`(★status label + 次アクションのみ・**raw 値なし**)
  + `buildPrgReadinessReportFromStores()`(client loader・fail-open): observations + 各 flag 実効値 + place affinity
    safety journal assess(stable_safe→true/unstable→false/insufficient→null) → 5 軸の report。
- **`PrgReadinessPanel.tsx`**(`PrgReadinessReportView`): pure presentational・軸ごと 1 行(ラベル : 次アクション : status badge)。
  **raw count/score/confidence/observed 数値を出さない**。
- **CeoDashboardClient**: import + `prgReport` state(flag OFF→未計算)+ flag-gated CollapsibleSection。

## 3. ★5 軸 × 5 状態（CEO 例に対応）
| 軸 | 現状(空 store・dev) |
|---|---|
| 今日の文脈（A2 context） | **dogfooding**（決定時 modifier・常に operational・flag ON） |
| 場所の相性（place affinity） | accumulating（薄い）/ stability あれば activation_candidate |
| 移動耐性（movement tolerance） | accumulating |
| 活動リズム（energy rhythm） | accumulating |
| あなたのペース（personal pace） | **dormant**（flag OFF） |

状態: dormant / accumulating(薄くて沈黙=正常) / dogfooding / needs_attention(懸念・activation せず) / activation_candidate(stability 確認済)。
★context は data 蓄積 gate がない特例（operational=dataReady true）。personal pace は独自 readiness stack で v0 は flag のみ（dormant）。

## 4. 安全境界（CEO 制約・全て遵守）
- flag OFF→完全不変 / production hard block（gate）/ user-facing UI でない（/ceo のみ）/ read-only。
- raw GPS/location/score/internal numeric 出さない（status summary のみ）。
- sparse→accumulating と正直に / activation 候補は stability evidence ある時だけ。
- Day Rehearsal / Plan / scoring / ranking / activation には**反映しない**（読むだけ）。新規データ保存/DB/external なし。

## 5. tests / tsc
- console pure helper 4 + loader 統合 3 + panel render-contract 4（raw 値非表示・5 軸・5 状態）+ evaluator 9 = PASS。
- tsc footprint 0（baseline 55）・eslint 0 error。

## 6. dev smoke 観点（CEO smoke 用）
- flag を一時 ON（override）→ `/ceo` を開く → 「PRG 観測ステータス（dev）」section。
- 確認: 5 軸が status badge で並ぶ / context=dogfooding・pace=dormant・他=accumulating（空 data なら）/ **raw 値が出ていない** / read-only（操作 affordance なし）/ flag OFF で section が消える。

## ★stop gate（本実装で触れない）
readiness による実 activation / Day Rehearsal 反映 / DB / production exposure / 新規データ保存 / user-facing UI（/plan）。

## 次
CEO smoke PASS → flag OFF main着地 →（CEO 判断で）dogfood 有効化。次増分: per-axis stability journal(mt/er) / personal pace 専用 collector。
