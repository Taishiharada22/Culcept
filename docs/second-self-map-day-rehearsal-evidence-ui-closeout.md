# Day Rehearsal — Evidence「なぜ?」UI closeout（day-level banner disclosure）

> 2026-06-07 / **実装・実機 smoke PASS・ローカル main 着地完了**（CEO 承認） / 前提: banner + 詰まり marker + 一息 marker が main live。
> mini design: `second-self-map-day-rehearsal-evidence-ui-mini-design.md` / 前 closeout: `…-wpm2-closeout.md`

---

## 0. 状態
- **ローカル main 着地済**（squash・main HEAD `c221ac2d`・親 `2e56832d`）。code branch `claude/dr-evidence-ui`（HEAD `cb139d56`）保持。
- 実機 smoke **PASS**（CEO 2026-06-07・localhost:3012・閉/展開の両状態 + 文面確認）。
- push / PR / GitHub / Vercel / DB / Google API **未接触**（遵守）。

## 1. 何を出したか（live 仕様）
- **day-level banner（DayOutlookBanner）に「なぜ?」toggle**が live。banner の outlook 1 行が「何を根拠にそう見ているか」を **観測 / 推定 / 未確定** の 3 カテゴリ・最大 3 行で開示。
- **native `<details>`**（useState なし・"use client" 不要・default **閉**・read-only disclosure）。展開しても予定は動かない・記録もしない。
- 観測フレーム「この見通しは、〜から見ています。」（断定でなく観測の提示）。推定行は「（推定）」明示。

## 2. copy 写像（factor → 自然な日本語）
| カテゴリ | 条件（rehearsal 構造） | 日本語 |
|---|---|---|
| 観測 | 常時（予定構造は観測） | 「この予定の並び」 |
| 観測 | transition に feasibility 観測あり（sufficient / insufficient） | 「移動の余白」 |
| 観測 | density === "packed" | 「予定の密度」 |
| 推定 | convergencePoints > 0 | 「重なりやすさ」 |
| 推定 | convergence なし & outlook tight/breaks | 「詰まりやすさ」 |
| 推定 | recoveryStepCount > 0（WPM-2b の一息 step 数） | 「一息つけそうな区間」 |
| 未確定 | transition に feasibility **not_applicable** あり | 「移動の余白を確認できない区間」 |
- 空カテゴリは省略（evidence が弱ければ無理に説明しない）。例:「この見通しは、この予定の並び・移動の余白から見ています。詰まりやすさ・一息つけそうな区間を加味しています（推定）。」

## 3. ★「未確定」設計判断（CEO 必須記載）
- **travelUnknown を常時表示にしなかった**。理由（コード検証済）:
  - banner が使う `buildRehearsalInputFromDisplay`（Option D / status-only）は `travelMin: null` / `travelKnown: false` を**常に**返す（dayRehearsal.ts 内）→ `coverage.travelUnknown` は移動がある日は**毎日必ずオン**。
  - これを「未確定の移動情報」として出すと ①常時ノイズ ②「outlook が移動を無視した」と誤解させる（Option D では feasibility status が移動を overlay 経由で**織り込み済み**）。
- 代わりに **feasibility が個別 gap を評価できなかった `not_applicable` の区間だけ**を honest uncertainty として「移動の余白を確認できない区間」と開示。これは CEO が示した未確定 menu の **「不明な余白」側**に対応。

## 4. 不変原則の遵守（CEO チェック項目）
- ✅ day-level banner の「なぜ?」toggle が **live**
- ✅ **default closed / read-only**（native `<details>`・予定変更/記録なし）
- ✅ **生スコア・内部数値なし**（render contract test が HTML を grep して保証）
- ✅ **断定・警告・診断表現なし**（危険/警告/失敗/疲れ/壊れ/診断/最適化/予測/予想 を否定・仮説トーン）
- ✅ **banner outlook 行 / 詰まり marker / 一息 marker / timeline / feasibility disclosure 非破壊**（既存 7+24+110 test 緑）
- ✅ 「未確定」は travelUnknown 常時表示ではなく **余白を確認できない区間（not_applicable）に限定**（§3）

## 5. 変更ファイル（6・main `c221ac2d`）
| ファイル | 変更 |
|---|---|
| `lib/plan/dayRehearsal/dayRehearsalTypes.ts` | `DayRehearsal.density` + `DayOutlookExplanation` 型 |
| `lib/plan/dayRehearsal/dayRehearsal.ts` | rehearseDay return に `density`（additive）+ `explainDayOutlook` pure |
| `app/(culcept)/plan/components/DayOutlookBanner.tsx` | 「なぜ?」disclosure + `recoveryStepCount` prop |
| `app/(culcept)/plan/tabs/CalendarTab.tsx` | `recoveryStepCount={recoverySteps.size}` 配線（1 行） |
| `tests/unit/plan/dayRehearsal/dayRehearsal.test.ts` | explainDayOutlook unit 10 |
| `tests/unit/plan/dayOutlookBannerRenderContract.test.tsx` | banner disclosure 7 + fixture 完全化 |

## 6. 検証（着地ゲート）
- **zero-loss**: 6 ファイルが branch `cb139d56` と byte 一致（HEAD が c48d41fe→2e56832d に別セッション前進した後も再確認）。
- **tsc footprint 0**: main 完走 tsc（8GB・OOM なし）で私の 6 ファイル起因エラー **0**。新 export（explainDayOutlook/DayOutlookExplanation/DayOutlookBanner/density）の consumer は私の 6 ファイルのみ（外部消費者ゼロ）→ footprint 0 は airtight。
  - ⚠ **main pre-existing tsc errors 1114**（ceo / origin / baseline / stargazer alter route / perspectiveEngine 等・**他セッション着地由来**・私の変更と無関係）。別途 CEO 報告済。`npx tsc` は default ~2GB で OOM（exit 134）するため `--max-old-space-size=8192` 必須。
- **テスト**: explainDayOutlook 10 + banner render contract 7 + DayGraphTimeline 24 + CalendarTab wiring 110 + plan suite **4956 PASS**（exit 0）。
- **temp ノイズ**: `supabase/.temp/*` は明示パス commit で混入 0。

## 7. 残論点（次フェーズ以降・gated）
- **per-marker「なぜ?」/ detail disclosure**（次フェーズ・audit + mini design 先行）: 詰まり/一息 marker 個別の根拠開示。marker は現状 Set のみ受領（per-marker evidence 未配線）→ 取得可能範囲の read-only 監査が先。
- convergence の magnitude 化（raw shortfall 利用）/ transport 統合 / InnerWeather energyLevel / 較正（実データ後）。
- L3-b-1 OD selected-only propagation / Reality Control OS の Day Rehearsal 消費。
