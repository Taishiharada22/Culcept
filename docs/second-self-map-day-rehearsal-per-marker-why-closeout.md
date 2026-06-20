# Day Rehearsal — per-marker「なぜ?」closeout（convergence 詰まり marker）

> 2026-06-07 / **実装・実機 smoke PASS・ローカル main 着地完了**（CEO 承認） / 前提: day-level banner「なぜ?」live（`c221ac2d`）+ 詰まり/一息 marker live（`59e97dc4`）。
> mini design: `…-per-marker-why-mini-design.md` / 前 closeout: `…-evidence-ui-closeout.md`

---

## 0. 状態
- **ローカル main 着地済**（squash・main HEAD `ea3556c2`・親 `b609ff8b`）。code branch `claude/dr-per-marker-why`（HEAD `0bfa845b`）保持。
- 実機 smoke **PASS**（CEO 2026-06-07・localhost:3012）。
- push / PR / GitHub / Vercel / DB / Google API **未接触**（遵守）。

## 1. 何を出したか（live 仕様・CEO チェック項目）
- ✅ **per-marker「なぜ?」が live**: 詰まり(convergence) marker の根拠を、ユーザーが軽く確認できる。
- ✅ **convergence / 詰まり marker のみ**（scope 限定）。
- ✅ **recovery per-marker は deferred**: recovery の根拠は uniform（全 marker で「余白≥閾値」同一）= specificity が弱く day-level「一息つけそうな区間」で被覆済 → 初回スコープ外。
- ✅ **existing transition disclosure piggyback**: 移動行 tap→expand（既存「詳細」/「閉じる」）の展開域に「なぜ?」1 行を追加。**新 tap target / 新 state を作らない**。
- ✅ **default closed / read-only**: 展開するまで出ない。予定を動かさない・記録しない。
- ✅ **marker 行・banner・timeline・feasibility disclosure 非破壊**（既存テスト緑）。
- ✅ **生スコア・内部数値・警告表現なし**（render contract test が HTML を grep）。
- ✅ **slate / neutral**（FeasibilityDisclosureLine と同階調 `text-xs italic text-slate-400 pl-8`）。
- ✅ **予定変更 / repair / optimize / auto-reschedule なし**。

## 2. copy 写像（factor → 質的 synthesis 1 文）
- `explainConvergenceMarker(factors)`（pure）が factors を **observed>inferred 順**で1文合成:
  - `buffer_short`（観測）→「移動の余白が少なめ」
  - `strain_high`（推定）→「予定が立て込んでいそう」
  - `friction_high`（推定）→「移動に時間がかかりそう」
- 例（buffer_short + strain_high）:「ここは移動の余白が少なめで、予定が立て込んでいそうです。」
- **dedup**: feasibility 行は量的（「不足 N 分」/「余白 N 分」）、なぜ?行は質的 synthesis（+ strain/friction を足す）→ register が異なり重複しすぎない。day-level「なぜ?」（集約「重なりやすさ」）とも粒度が異なる（per-marker = この区間固有の factor）。

## 3. 変更ファイル（5・main `ea3556c2`）
| ファイル | 変更 |
|---|---|
| `lib/plan/dayRehearsal/dayRehearsal.ts` | `explainConvergenceMarker(factors)` pure + `CONVERGENCE_FACTOR_PHRASE` |
| `app/(culcept)/plan/tabs/CalendarTab.tsx` | `convergenceFactorsByTransitionIndex` を `dayRehearsal.steps` から additive 構築（convergencePoints と同 key）+ prop 配線 |
| `app/(culcept)/plan/components/DayGraphTimeline.tsx` | `convergenceFactorsByTransitionIndex` prop + `ConvergenceWhyLine`（expanded 域に conditional・redaction） |
| `tests/unit/plan/dayRehearsal/dayRehearsal.test.ts` | explainConvergenceMarker unit 8 |
| `tests/unit/plan/dayGraphTimelineConvergenceMarkerRenderContract.test.tsx` | convergence-why render 6 + 構造 3 |

## 4. 検証（着地ゲート）
- **zero-loss**: per-marker 5 ファイルが branch `0bfa845b` と byte 一致（main HEAD が 4d2ede9d→b609ff8b に別セッション前進した後も再確認）。zero-loss は per-marker 対象ファイルに限定して報告。
- **tsc footprint 0**: main 完走 tsc（8GB・OOM なし）で per-marker 5 ファイル起因エラー **0**。新 export（explainConvergenceMarker / convergenceFactorsByTransitionIndex prop）の consumer は per-marker 5 ファイルのみ。
  - ⚠ main pre-existing tsc errors **1114**（他セッション着地由来・per-marker と無関係・このスライスの blocker にしない）。別途 `tsc-baseline-cleanup` で監査。`npx tsc` は `--max-old-space-size=8192` 必須（default OOM）。
- **テスト**: explainConvergenceMarker 8 + convergence-why render 6 + 構造 3 + DayGraphTimeline 既存 + CalendarTab wiring + **plan suite 4973 PASS**（exit 0）。
- **forbidden copy**: per-marker 新規コード/コピーに `危険/警告/失敗/疲れ/壊れ/診断/予測/予想/推奨/最適化` なし。
- **非破壊**: marker / banner / feasibility disclosure / timeline 全て緑。

## 5. 実機 smoke 監査メモ（透明性）
- CEO smoke PASS。スクショで確認: piggyback 機構（移動行 tap→展開で feasibility + marker）/ default 閉 / recovery transition には convergence「なぜ?」が出ない（defer 通り）/ 非破壊。
- ★スクショで展開されたのは recovery transition（余白155分）で、**convergence「なぜ?」行そのもの**（「ここは移動の余白が少なめで…」）は in-frame でなかった。convergence why のレンダリングは **render contract test 6本**で機械保証済（expanded+factors→why 出る / default closed→出ない / sensitiveProximity→redaction / slate / 警告色なし）。

## 6. 残論点（次フェーズ以降・gated）
- recovery per-marker「なぜ?」（uniform で defer。出すなら 1 行固定「移動を引いても余白が残りそう」だが day-level と重複）。
- convergence の magnitude 化 / transport 統合 / InnerWeather energyLevel / 較正（実データ後）。
- **次工程（CEO 指示）= tsc baseline cleanup の監査・整理**（read-only audit → 領域別分類 → mini plan。実装は CEO GO 待ち）。
